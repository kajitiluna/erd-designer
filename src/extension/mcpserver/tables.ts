import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DocumentResource, RectangleType } from "~/extension/DocumentResource";
import {
    initResourceNotFound,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import { Database } from "~/models/database";
import { overrideColumnName } from "~/models/database/support";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

export const mcpRegisterPerspective = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListTables(documentResource),
            mcpFindTable(documentResource)
        ],
        tools: [
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of tables from the specified ERD document.
Each table includes detailed information about its columns, unique constraints, and indices.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose tables are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

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
    return [
        "list_tables",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/tables",
            { list: undefined }
        ),
        {
            title: "List tables of a specified ERD document",
            description: descriptionList
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const tableViews = erdDocument.getTableViewModels()
                .map(tableView => toTableSummaryWithColumns(documentId, budget.rectangles, erdDocument, tableView));

            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(tableViews),
                        mimeType: "application/json"

                    }
                ]
            };
        }
    ] as const;
};

const descriptionFind = `\
Retrieves detailed information about a specific table from the specified ERD document using its tableId.
This includes complete column definitions, unique constraints, and index information.

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
- columnDefinitions: An array of column definition references, each containing either:
  - For single columns: uri, columnModelId, and modelType: "single"
  - For column groups: uri, columnGroupId, and modelType: "group"
`;

const mcpFindTable = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find_table",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/tables/{tableId}",
            { list: undefined }
        ),
        {
            title: "Find a table of a specified ERD document",
            description: descriptionFind
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const tableId = variables.tableId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const tableView = erdDocument.findTableViewModel(tableId);
            if (tableView == null) {
                throw initResourceNotFound(url);
            }

            const tableDetail = toTableDetail(documentId, budget.rectangles, erdDocument, tableView);

            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(tableDetail),
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};

export const toTableSummary = (
    documentId: string, tableView: TableViewModel, rectangles: Map<string, RectangleType>
) => {
    const rectangle = rectangles.get(tableView.tableId);

    return {
        uri: `erd-designer://documents/${documentId}/tables/${tableView.tableId}`,
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

const toTableSummaryWithColumns = (
    documentId: string, rectangles: Map<string, RectangleType>,
    erdDocument: ErdDocument, tableView: TableViewModel
) => {
    const tableColumns = toTableColumns(tableView, documentId, erdDocument);

    const columnMapping = new Map(tableColumns.map(column => [column.columnModelId, column]));

    const database = erdDocument.getDatabase();
    const uniqueConstraints = toTableUniqueConstraints(tableView, columnMapping);
    const tableIndices = toTableIndices(tableView, columnMapping, database);

    const summary = toTableSummary(documentId, tableView, rectangles);

    return {
        ...summary,
        columns: tableColumns,
        uniqueConstraints: uniqueConstraints,
        tableIndices: tableIndices
    };
};

const toTableDetail = (
    documentId: string, rectangles: Map<string, RectangleType>,
    erdDocument: ErdDocument, tableView: TableViewModel
) => {
    const columnDefinitions = toTableColumnDefinitions(tableView, documentId);
    const tableWithColumns = toTableSummaryWithColumns(
        documentId, rectangles, erdDocument, tableView
    );

    return {
        ...tableWithColumns,
        columnDefinitions: columnDefinitions
    };
};

const toTableColumnDefinitions = (tableView: TableViewModel, documentId: string) => {
    const columns = tableView.tableModel.columns;

    return columns.map(column => {
        if (column.modelType === "group") {
            return {
                uri: `erd-designer://documents/${documentId}/column_groups/${column.columnGroupId}`,
                columnGroupId: column.columnGroupId,
                modelType: "group" as const
            };
        }

        return {
            uri: `erd-designer://documents/${documentId}/columns/${column.columnModelId}`,
            columnModelId: column.columnModelId,
            modelType: "single" as const
        }
    });
};

const toTableColumns = (tableView: TableViewModel, documentId: string, erdDocument: ErdDocument) => {
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
                uri: `erd-designer://documents/${documentId}/columns/${columnModel.columnModelId}`,
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
