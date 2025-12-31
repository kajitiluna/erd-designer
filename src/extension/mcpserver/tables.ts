import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import { addColumnSchema, buildAddingColumnPairs } from "~/extension/mcpserver/columns";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import { toRelationSummary } from "~/extension/mcpserver/relations";
import {
    colorValueSchema, DESCRIPTION_DOCUMENT_ID, McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs,
    findDocumentAndTable, initInvalidParams, initResourceNotFound, initResourceResponse,
    searchParameters, validatePhysicalName
} from "~/extension/mcpserver/support";
import ColorValue from "~/models/ColorValue";
import { Database } from "~/models/database";
import { overrideColumnName } from "~/models/database/support";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

export const mcpRegisterTable = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListTables(documentResource),
            mcpFindTable(documentResource)
        ],
        tools: [
            mcpAddTable(documentResource),
            mcpUpdateTable(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of tables from the specified ERD document.
Each table includes detailed information about its columns, unique constraints, and indices.
This resource supports optional filtering via query parameters to narrow down the results.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose tables are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

REQUEST (query parameters - all optional):
Filtering conditions can be specified to narrow down the table list.
Multiple conditions are combined with AND logic.
- tableName.physical.contains: Filter tables whose physical name contains the specified string (partial match).
  Can be specified multiple times; all conditions must be satisfied (AND).
  Example: ?tableName.physical.contains=user
- tableName.logical.contains: Filter tables whose logical name contains the specified string (partial match).
  Can be specified multiple times; all conditions must be satisfied (AND).
  Example: ?tableName.logical.contains=ユーザー
- columnName.physical.contains: Filter tables that have columns whose physical name contains the specified string (partial match).
  Can be specified multiple times; all conditions must be satisfied (AND).
  Example: ?columnName.physical.contains=email
- columnName.logical.contains: Filter tables that have columns whose logical name contains the specified string (partial match).
  Can be specified multiple times; all conditions must be satisfied (AND).
  Example: ?columnName.logical.contains=メール
- columnId: Filter tables that contain the specified column ID (exact match).
  Can be specified multiple times; tables must contain all specified column IDs (AND).
  Example: ?columnId=abc-123-def-456

QUERY EXAMPLES:
- All tables:
  \`erd-designer://documents/doc123/tables\`
- Tables with physical name containing "user":
  \`erd-designer://documents/doc123/tables?tableName.physical.contains=user\`
- Tables with columns having physical name containing "email":
  \`erd-designer://documents/doc123/tables?columnName.physical.contains=email\`
- Tables containing specific column ID:
  \`erd-designer://documents/doc123/tables?columnId=abc-123-def-456\`
- Multiple conditions (AND): physical name contains "user" AND has column with physical name containing "id":
  \`erd-designer://documents/doc123/tables?tableName.physical.contains=user&columnName.physical.contains=id\`
- Multiple same parameters (AND): physical name contains both "user" AND "account":
  \`erd-designer://documents/doc123/tables?tableName.physical.contains=user&tableName.physical.contains=account\`
- Tables containing all specified column IDs:
  \`erd-designer://documents/doc123/tables?columnId=abc-123&columnId=def-456\`

RESPONSE:
An array of table objects, each containing:
- uri: The unique URI of the table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- tableId: The unique identifier of the table (auto-generated UUID).
- tableName: Object containing physical and logical names of the table.
- description: A brief description of the table (may be empty string).
- view: Display settings including:
  - position: Object with x and y coordinates of the table on the ERD canvas.
  - size: Object with width and height of the table (may be null if not yet rendered).
  - color: Object with background and foreground colors in hex format.
- columns: An array of column objects, each containing:
  - uri: The unique URI of the column.
  - columnModelId: The unique identifier of the column.
  - columnName: Object with physical and logical names.
  - columnType: The data type of the column.
  - primaryKey: Boolean indicating if this is a primary key.
  - notNull: Boolean indicating if this column is NOT NULL.
  - unique: Boolean indicating if this column has a unique constraint.
  - autoIncrement: Boolean indicating auto-increment (only present for supported types).
  - defaultValue: The default value for the column.
  - description: A brief description of the column.
- uniqueConstraints: An array of unique constraint objects, each containing:
  - uniqueKeysModelId: The unique identifier of the constraint.
  - uniqueKeysName: The name of the unique constraint.
  - uniqueKeys: Array of columns in the constraint with their sort orders.
  - description: A brief description of the constraint.
- tableIndices: An array of index objects, each containing:
  - tableIndexModelId: The unique identifier of the index.
  - indexName: The name of the index.
  - indexColumns: Array of columns in the index with their sort and nulls orders.
  - indexOption: The index option setting.
  - indexType: The type of index.
  - clustered: Boolean indicating if clustered (only present if database supports it).
  - description: A brief description of the index.
`;

const mcpListTables = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    const queryParams = [
        "tableName.physical.contains",
        "tableName.logical.contains",
        "columnName.physical.contains",
        "columnName.logical.contains",
        "columnId"
    ].join(",");

    return [
        "list-tables",
        new ResourceTemplate(
            uriTemplates.tables + `{?${queryParams}*}`,
            { list: undefined }
        ),
        {
            title: "List tables of a specified ERD document",
            description: descriptionList
        },
        initCallbackForListTables(documentResource)
    ] as const;
};

const initCallbackForListTables = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const tableViews = doFilterTableViews(url, erdDocument);
        const responses = tableViews.map(tableView => toTableSummaryWithColumns(erdBudget, tableView));

        return initResourceResponse(url, responses);
    };
};

const doFilterTableViews = (url: URL, erdDocument: ErdDocument) => {
    const tablePhysicalNameContains = searchParameters(url, "tableName.physical.contains")
    const tableLogicalNameContains = searchParameters(url, "tableName.logical.contains");
    const columnIds = searchParameters(url, "columnId");
    const columnPhysicalNameContains = searchParameters(url, "columnName.physical.contains");
    const columnLogicalNameContains = searchParameters(url, "columnName.logical.contains");

    return erdDocument.getTableViewModels().filter(tableView => {
        const matchedTablePhysical = (tablePhysicalNameContains.length === 0)
            || tablePhysicalNameContains.every(filtering =>
                tableView.tableModel.physicalName.includes(filtering));
        if (!matchedTablePhysical) {
            return false;
        };

        const matchedTableLogical = (tableLogicalNameContains.length === 0)
            || tableLogicalNameContains.every(filtering =>
                tableView.tableModel.logicalName.includes(filtering));
        if (!matchedTableLogical) {
            return false;
        };

        const allColumns = erdDocument.toAllColumnModels(tableView.tableModel);

        const matchedColumnIds = (columnIds.length === 0)
            || columnIds.every(filtering => allColumns.some(column => column.columnModelId === filtering));
        if (!matchedColumnIds) {
            return false;
        };

        const matchedColumnPhysical = (columnPhysicalNameContains.length === 0)
            || allColumns.some(column => {
                const columnShare = erdDocument.findColumnShareModel(column.columnShareModelId);
                if (columnShare == null) {
                    return false;
                }

                const overrideNames = overrideColumnName(column, columnShare);
                return columnPhysicalNameContains.every(filtering =>
                    overrideNames.physicalName.includes(filtering));
            });
        if (!matchedColumnPhysical) {
            return false;
        };

        const matchedColumnLogical = (columnLogicalNameContains.length === 0)
            || allColumns.some(column => {
                const columnShare = erdDocument.findColumnShareModel(column.columnShareModelId);
                if (columnShare == null) {
                    return false;
                }

                const overrideNames = overrideColumnName(column, columnShare);
                return columnLogicalNameContains.every(filtering =>
                    overrideNames.logicalName.includes(filtering));
            });
        if (!matchedColumnLogical) {
            return false;
        };

        return true;
    });
};

const descriptionFind = `\
Retrieves detailed information about a specific table from the specified ERD document using its tableId.
This includes complete column definitions, unique constraints, index information, and related relations.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- tableId: The unique identifier of the table to retrieve.
  Can be obtained from the tables list resource or from the document's tables array.

RESPONSE:
An object containing detailed information about the specified table:
- uri: The unique URI of the table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- tableId: The unique identifier of the table (auto-generated UUID).
- tableName: Object containing physical and logical names of the table.
- description: A brief description of the table (may be empty string).
- view: Display settings including:
  - position: Object with x and y coordinates of the table on the ERD canvas.
  - size: Object with width and height of the table (may be null if not yet rendered).
  - color: Object with background and foreground colors in hex format.
- columns: An array of column objects, each containing:
  - uri: The unique URI of the column.
  - columnModelId: The unique identifier of the column.
  - columnName: Object with physical and logical names.
  - columnType: The data type of the column.
  - primaryKey: Boolean indicating if this is a primary key.
  - notNull: Boolean indicating if this column is NOT NULL.
  - unique: Boolean indicating if this column has a unique constraint.
  - autoIncrement: Boolean indicating auto-increment (only present for supported types).
  - defaultValue: The default value for the column.
  - description: A brief description of the column.
- uniqueConstraints: An array of unique constraint objects, each containing:
  - uniqueKeysModelId: The unique identifier of the constraint.
  - uniqueKeysName: The name of the unique constraint.
  - uniqueKeys: Array of columns in the constraint with their sort orders.
  - description: A brief description of the constraint.
- tableIndices: An array of index objects, each containing:
  - tableIndexModelId: The unique identifier of the index.
  - indexName: The name of the index.
  - indexColumns: Array of columns in the index with their sort and nulls orders.
  - indexOption: The index option setting.
  - indexType: The type of index.
  - clustered: Boolean indicating if clustered (only present if database supports it).
  - description: A brief description of the index.
- parentRelations: An array of relation objects where this table is the child table, each containing:
  - uri: The URI to access detailed relation information.
  - relationId: The unique identifier of the relation.
  - relationName: The name of the relation.
  - parentTableId: The id of the parent table.
  - childTableId: The id of this table (child table).
- childRelations: An array of relation objects where this table is the parent table, each containing:
  - uri: The URI to access detailed relation information.
  - relationId: The unique identifier of the relation.
  - relationName: The name of the relation.
  - parentTableId: The id of this table (parent table).
  - childTableId: The id of the child table.
- columnDefinitions: An array of column definition references, each containing either:
  - For single columns: uri, columnModelId, and modelType: "single"
  - For column groups: uri, columnGroupId, and modelType: "group"
`;

const mcpFindTable = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-table",
        new ResourceTemplate(uriTemplates.tableDetail, { list: undefined }),
        {
            title: "Find a table of a specified ERD document",
            description: descriptionFind
        },
        initCallbackForFindTable(documentResource)
    ] as const;
};

const initCallbackForFindTable = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const tableId = variables.tableId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const tableView = erdDocument.findTableViewModel(tableId);
        if (tableView == null) {
            throw initResourceNotFound(url);
        }

        const tableDetail = toTableDetail(erdBudget, tableView);

        return initResourceResponse(url, tableDetail);
    };
};

export const toTableSummary = (erdBudget: DocumentBudget, tableView: TableViewModel) => {
    const rectangle = erdBudget.findRectangle(tableView.tableId);

    return {
        uri: erdBudget.tableUri(tableView.tableId),
        tableId: tableView.tableId,
        tableName: {
            physical: tableView.tableModel.physicalName,
            logical: tableView.tableModel.logicalName
        },
        description: tableView.tableModel.description,
        view: {
            position: {
                x: tableView.corner.left,
                y: tableView.corner.top
            },
            ...(rectangle && {
                size: {
                    width: rectangle.width,
                    height: rectangle.height
                }
            }),
            color: {
                background: tableView.headerColor.background.toHex(),
                foreground: tableView.headerColor.foreground.toHex()
            }
        }
    };
};

type TableColumn = {
    defaultValue: string;
    description: string;
    autoIncrement?: boolean | undefined;
    uri: string;
    columnModelId: string;
    columnName: {
        physical: string;
        logical: string;
    };
    typeExpression: string;
    primaryKey: boolean;
    notNull: boolean;
    unique: boolean;
};

const toTableSummaryWithColumns = (erdBudget: DocumentBudget, tableView: TableViewModel) => {
    const tableColumns = toTableColumns(erdBudget, tableView);

    const columnMapping = new Map(tableColumns.map(column => [column.columnModelId, column]));

    const erdDocument = erdBudget.erdDocument;
    const database = erdDocument.getDatabase();
    const uniqueConstraints = toTableUniqueConstraints(tableView, columnMapping);
    const tableIndices = toTableIndices(tableView, columnMapping, database);

    const summary = toTableSummary(erdBudget, tableView);

    return {
        ...summary,
        columns: tableColumns,
        uniqueConstraints: uniqueConstraints,
        tableIndices: tableIndices
    };
};

const toTableDetail = (erdBudget: DocumentBudget, tableView: TableViewModel) => {
    const erdDocument = erdBudget.erdDocument;
    const tableWithColumns = toTableSummaryWithColumns(erdBudget, tableView);
    const { parentRelations, childRelations } = erdDocument.findRelatedRelations(tableView.tableId);
    const columnDefinitions = toTableColumnDefinitions(erdBudget, tableView);

    return {
        ...tableWithColumns,
        parentRelations: parentRelations.map(relationView => toRelationSummary(erdBudget, relationView.relationModel)),
        childRelations: childRelations.map(relationView => toRelationSummary(erdBudget, relationView.relationModel)),
        columnDefinitions: columnDefinitions
    };
};

const toTableColumnDefinitions = (erdBudget: DocumentBudget, tableView: TableViewModel) => {
    const columns = tableView.tableModel.columns;

    return columns.map(column => {
        if (column.modelType === "group") {
            return {
                uri: erdBudget.columnGroupUri(column.columnGroupId),
                columnGroupId: column.columnGroupId,
                modelType: "group" as const
            };
        }

        return {
            uri: erdBudget.columnUri(column.columnModelId),
            columnModelId: column.columnModelId,
            modelType: "single" as const
        }
    });
};

const toTableColumns = (erdBudget: DocumentBudget, tableView: TableViewModel) => {
    const erdDocument = erdBudget.erdDocument;
    const columnModels = erdDocument.toAllColumnModels(tableView.tableModel);

    return columnModels.flatMap(columnModel => {
        const shareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
        if (shareModel == null) {
            return [];
        }

        const columnName = overrideColumnName(columnModel, shareModel);
        const inChildRelation = erdDocument.inChildRelation(tableView.tableId, columnModel.columnModelId);
        const typeExpression = shareModel.specifiedColumnType(inChildRelation);

        return [
            {
                uri: erdBudget.columnUri(columnModel.columnModelId),
                columnModelId: columnModel.columnModelId,
                columnName: {
                    physical: columnName.physicalName,
                    logical: columnName.logicalName
                },
                typeExpression: typeExpression,
                primaryKey: columnModel.primaryKey,
                notNull: columnModel.notNull,
                unique: columnModel.unique,
                ...((shareModel.columnType.withAutoIncrement) && { autoIncrement: columnModel.autoIncrement }),
                defaultValue: columnModel.defaultValue,
                description: shareModel.description
            }
        ];
    });
};

const toTableUniqueConstraints = (tableView: TableViewModel, columnMapping: Map<string, TableColumn>) => {
    const uniqueKeysModels = tableView.tableModel.uniqueKeysModels;

    return uniqueKeysModels.flatMap(model => {
        const uniqueKeys = model.uniqueKeysColumnModels.flatMap(ukModel => {
            const columnDef = columnMapping.get(ukModel.columnModelId);
            if (columnDef == null) {
                return [];
            }

            return [
                {
                    columnModelId: columnDef.columnModelId,
                    columnName: columnDef.columnName,
                    sortOrder: ukModel.sortOrderType
                }
            ];
        });

        if (uniqueKeys.length === 0) {
            return [];
        }

        return [
            {
                uniqueKeysModelId: model.tableUniqueKeysModelId,
                uniqueKeysName: model.physicalName,
                uniqueKeys: uniqueKeys,
                description: model.description
            }
        ];
    });
};

const toTableIndices = (
    tableView: TableViewModel, columnMapping: Map<string, TableColumn>, database: Database
) => {
    const tableIndexModels = tableView.tableModel.tableIndexModels;

    return tableIndexModels.flatMap(model => {
        const indexColumns = model.indexColumnModels.flatMap(indexColumn => {
            const columnDef = columnMapping.get(indexColumn.columnModelId);
            if (columnDef == null) {
                return [];
            }

            return [
                {
                    columnModelId: indexColumn.columnModelId,
                    columnName: columnDef.columnName,
                    sortOrder: indexColumn.sortOrderType,
                    nullsOrder: indexColumn.nullsOrderType
                }
            ];
        });

        if (indexColumns.length === 0) {
            return [];
        }

        return [
            {
                tableIndexModelId: model.tableIndexModelId,
                indexName: model.physicalName,
                indexColumns: indexColumns,
                indexOption: model.indexOption,
                indexType: model.indexType,
                ...((database.tableIndexSupport.supportsClustered)
                    && { clustered: model.clustered }),
                description: model.description
            }
        ];
    });
};

const descriptionAddTable = `\
Adds a new table to a specified ERD document.
You can create a table with columns by either referencing existing column-shares or creating new column-shares.
The table will be positioned on the ERD canvas according to the specified coordinates.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- table: The table specification containing:
  - tableName: Object containing table names:
    - physical: The physical name of the new table (required).
      Must start with a letter or underscore, followed by letters, digits, or underscores.
    - logical: (optional) The logical name of the new table.
  - schemaId: (optional) The schema ID where the table will be created.
    Only applicable if the database type supports schemas.
    Can be obtained from the document's schemas array.
  - description: (optional) A description of the table.
  - columns: An array of column specifications. Each column can be defined using one of two approaches:

    APPROACH 1: Reference an existing column-share (recommended for reusing common column definitions):
    - columnShareId: The ID of an existing column-share to base the column on (required).
      Can be obtained from the column-shares list resource.
    - overrideName: (optional) Override the column-share's names:
      - physical: The overridden physical name (empty string to clear override).
      - logical: The overridden logical name.
    - primaryKey: (optional) Boolean indicating if this is a primary key.
    - notNull: (optional) Boolean indicating if this column is NOT NULL.
    - unique: (optional) Boolean indicating if this column has a unique constraint.
    - autoIncrement: (optional) Boolean indicating if auto-increment is enabled.
      Only applicable if the column type supports auto-increment.
    - defaultValue: (optional) The default value for the column.

    APPROACH 2: Create a new column-share (for unique column definitions):
    - columnShare: Object defining the new column-share properties:
      - columnName: Object containing names:
        - physical: The physical name (required).
          Must start with a letter or underscore, followed by letters, digits, or underscores.
        - logical: (optional) The logical name.
      - columnTypeId: The column type ID (required).
        Must reference an existing column type from the database type definition.
      - precision: (optional) The precision setting (required for types with precision).
      - scale: (optional) The scale setting (required for types with scale).
      - unsigned: (optional) Boolean indicating unsigned property (only for applicable types).
      - isArray: (optional) Boolean indicating array type (only if database supports it).
      - description: (optional) A description of the column-share.
    - overrideName: (optional) Override the column-share's names.
    - primaryKey: (optional) Boolean indicating if this is a primary key.
    - notNull: (optional) Boolean indicating if this column is NOT NULL.
    - unique: (optional) Boolean indicating if this column has a unique constraint.
    - autoIncrement: (optional) Boolean indicating if auto-increment is enabled.
    - defaultValue: (optional) The default value for the column.

  - view: Display settings for the table:
    - position: Object containing the table position on the ERD canvas:
      - x: The x-coordinate of the top-left corner of the table (required).
      - y: The y-coordinate of the top-left corner of the table (required).
    - color: Object containing the table header colors:
      - background: The background color in RGB format (required).
        Object with red, green, and blue components (each 0-255).
        Example: { red: 255, green: 255, blue: 255 } for white.
      - foreground: The foreground/text color in RGB format (required).
        Object with red, green, and blue components (each 0-255).
        Example: { red: 0, green: 0, blue: 0 } for black.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the newly created table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- name: The physical name of the new table.
- mimeType: "application/json"
`;

const mcpAddTable = (documentResource: DocumentResource): McpServerRegisterToolArgs<typeof addTableInputSchema> => {
    return [
        "add-table",
        {
            title: "Add a new table to a specified ERD document",
            description: descriptionAddTable,
            inputSchema: addTableInputSchema
        },
        initCallbackForAddTable(documentResource)
    ] as const;
};

const addTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    table: z.object({
        tableName: z.object({
            physical: z.string()
                .refine(validatePhysicalName, {
                    message: "Physical name must start with a letter or underscore, followed by letters, digits, or underscores."
                }).describe("The physical name of the new table."),
            logical: z.string().optional().describe("The logical name of the new table."),
        }).describe("The name of the new table."),
        schemaId: z.string().optional()
            .describe("The schema ID where the new table will be created. Only applicable if the RDBMS supports schemas."),
        description: z.string().optional().describe("The description of the new table."),
        columns: z.array(addColumnSchema).describe("The columns to add to the new table."),
        view: z.object({
            position: z.object({
                x: z.number().describe("The x-coordinate of the top-left corner of the table."),
                y: z.number().describe("The y-coordinate of the top-left corner of the table.")
            }).strict().describe("The position of the new table on the ERD canvas."),
            color: z.object({
                background: colorValueSchema.describe("The background color of the new table header in hex format (e.g., #FFFFFF)."),
                foreground: colorValueSchema.describe("The foreground color of the new table header in hex format (e.g., #000000).")
            }).strict().describe("The color settings for the new table header.")
        }).strict().describe("The view definition of the new table.")
    }).strict().describe("The table data to add.")
};

const initCallbackForAddTable = (documentResource: DocumentResource): ToolCallback<typeof addTableInputSchema> => {
    return async ({ documentId, table }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;
        const schemaId = validateSchemaId(erdBudget, table.schemaId);

        const [columns, columnShares] = buildAddingColumnPairs(erdBudget, table.columns);

        const addTable = new TableModel({
            physicalName: table.tableName.physical,
            logicalName: table.tableName.logical || table.tableName.physical,
            schemaId: schemaId,
            description: table.description || "",
            columns: columns.map(column => ({
                modelType: "single" as const,
                columnModelId: column.columnModelId
            })),
        });

        const addTableView = new TableViewModel({
            tableModel: addTable,
            corner: {
                left: table.view.position.x,
                top: table.view.position.y
            },
            headerColor: {
                background: ColorValue.fromHex(table.view.color.background),
                foreground: ColorValue.fromHex(table.view.color.foreground)
            }
        });

        const nextColumnShareStorage = previousDocument.getColumnShareModelStorage().addModel(...columnShares);
        const nextDocument = previousDocument.updateTableViewWithColumns(addTableView, columns, nextColumnShareStorage);
        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.tableUri(addTableView.tableId),
                    name: addTable.physicalName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

const validateSchemaId = (erdBudget: DocumentBudget, schemaId: string | undefined, defaultValue: string = "") => {
    if (!schemaId) {
        return defaultValue;
    }

    const erdDocument = erdBudget.erdDocument;
    const database = erdDocument.getDatabase();
    if (!database.supportsSchema) {
        throw initInvalidParams(`The database type '${database.databaseType}' does not support schemas.`);
    }

    const schema = erdDocument.findSchema(schemaId);
    if (schema == null) {
        const url = new URL(erdBudget.schemaUri(schemaId));
        throw initResourceNotFound(url);
    }

    return schema.schemaId;
};

const descriptionUpdateTable = `\
Updates an existing table in a specified ERD document.
You can modify the table's name, description, schema assignment, and display settings.
Only the properties you specify will be updated; other properties will remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to update.
  Can be obtained from the tables list resource.
- table: The table properties to update (all fields are optional):
  - tableName: Object containing table names to update:
    - physical: (optional) The new physical name of the table.
      Must start with a letter or underscore, followed by letters, digits, or underscores.
    - logical: (optional) The new logical name of the table.
  - schemaId: (optional) The schema ID to assign the table to.
    Only applicable if the database type supports schemas.
    Can be obtained from the document's schemas array.
  - description: (optional) The new description of the table.
  - view: (optional) Display settings to update:
    - position: (optional) Object containing the new table position on the ERD canvas:
      - x: (optional) The new x-coordinate of the top-left corner.
      - y: (optional) The new y-coordinate of the top-left corner.
    - color: (optional) Object containing the new table header colors:
      - background: (optional) The new background color in RGB format.
        Object with red, green, and blue components (each 0-255).
        Example: { red: 255, green: 255, blue: 255 } for white.
      - foreground: (optional) The new foreground/text color in RGB format.
        Object with red, green, and blue components (each 0-255).
        Example: { red: 0, green: 0, blue: 0 } for black.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- name: The physical name of the updated table.
- mimeType: "application/json"
`;

const mcpUpdateTable = (documentResource: DocumentResource): McpServerRegisterToolArgs<typeof updateTableInputSchema> => {
    return [
        "update-table",
        {
            title: "Update an existing table of a specified ERD document",
            description: descriptionUpdateTable,
            inputSchema: updateTableInputSchema
        },
        initCallbackForUpdateTable(documentResource)
    ] as const;
};

const updateTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to update."),
    table: z.object({
        tableName: z.object({
            physical: z.string()
                .refine(validatePhysicalName, {
                    message: "Physical name must start with a letter or underscore, followed by letters, digits, or underscores."
                }).optional().describe("The physical name of the table to update."),
            logical: z.string().optional().describe("The logical name of the table to update."),
        }).optional().describe("The name of the table to update."),
        schemaId: z.string().optional()
            .describe("The schema ID where the table belongs. Only applicable if the RDBMS supports schemas."),
        description: z.string().optional().describe("The description of the table to update."),
        view: z.object({
            position: z.object({
                x: z.number().optional().describe("The x-coordinate of the top-left corner of the table."),
                y: z.number().optional().describe("The y-coordinate of the top-left corner of the table.")
            }).optional().describe("The position of the table to update on the ERD canvas."),
            color: z.object({
                background: colorValueSchema.optional()
                    .describe("The background color of the table header to update in hex format (e.g., #FFFFFF)."),
                foreground: colorValueSchema.optional()
                    .describe("The foreground color of the table header to update in hex format (e.g., #000000).")
            }).optional().describe("The color settings for the table header to update.")
        }).optional().describe("The view definition of the table to update.")
    }).describe("The table data to update.")
} as const;

const initCallbackForUpdateTable = (documentResource: DocumentResource): ToolCallback<typeof updateTableInputSchema> => {
    return async ({ documentId, tableId, table }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;

        const nextSchemaId = validateSchemaId(erdBudget, table.schemaId, previousTable.schemaId);
        const nextTable = new TableModel({
            ...previousTable,
            physicalName: table.tableName?.physical || previousTable.physicalName,
            logicalName: table.tableName?.logical || previousTable.logicalName,
            schemaId: nextSchemaId,
            description: table.description || previousTable.description,
        });

        const nextCorner = table.view?.position
            ? {
                left: table.view.position.x || previousTableView.corner.left,
                top: table.view.position.y || previousTableView.corner.top
            } : previousTableView.corner;
        const nextHeaderColor = table.view?.color ? {
            background: table.view.color.background
                ? ColorValue.fromHex(table.view.color.background)
                : previousTableView.headerColor.background,
            foreground: table.view.color.foreground
                ? ColorValue.fromHex(table.view.color.foreground)
                : previousTableView.headerColor.foreground
        } : previousTableView.headerColor;

        const nextTableView = new TableViewModel({
            tableModel: nextTable,
            corner: nextCorner,
            headerColor: nextHeaderColor
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.tableUri(nextTableView.tableId),
                    name: nextTable.physicalName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};
