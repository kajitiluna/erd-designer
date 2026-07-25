import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { v4 as uuidV4 } from 'uuid';
import z from "zod";

import { DocumentResource } from "~/agent-tools/DocumentResource";
import { addColumnSchema, buildAddingColumnPairs } from "~/agent-tools/tools/columns";
import DocumentBudget, { uriTemplates } from "~/agent-tools/DocumentBudget";
import { toRelationSummary } from "~/agent-tools/tools/relations";
import {
    colorValueSchema, DESCRIPTION_DOCUMENT_ID, McpRegisterConfig, McpServerRegisterResourceTemplateArgs,
    McpServerRegisterToolArgs, findDocument, findDocumentAndTable, initInvalidParams, initResourceNotFound,
    initResourceResponse, initToolJsonResponse, searchParameters, validatePhysicalName
} from "~/agent-tools/tools/support";
import { toNextOrthogonalLines } from "~/features/canvas/support";
import ColorValue from "~/models/ColorValue";
import { Database } from "~/models/database";
import { overrideColumnName } from "~/models/database/support";
import TableIndexModel, { IndexColumnModel } from "~/models/database/TableIndexModel";
import TableModel from "~/models/database/TableModel";
import TableUniqueKeysModel, { UniqueKeysColumnModel } from "~/models/database/TableUniqueKeysModel";
import { DragState } from "~/models/DragState";
import ErdDocument from "~/models/ErdDocument";
import RectangleViewModel from "~/models/RectangleViewModel";
import { SelectState } from "~/models/SelectState";
import TableViewModel from "~/models/TableViewModel";
import ColumnModel from "~/models/database/ColumnModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";
import { buildStructTypeExpression } from "~/models/struct-type-expression";

export const mcpRegisterTable = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListTablesResource(documentResource),
            mcpFindTableResource(documentResource)
        ],
        tools: [
            mcpListTablesTool(documentResource),
            mcpFindTableTool(documentResource),
            mcpAddTable(documentResource),
            mcpUpdateTable(documentResource),
            mcpDeleteTable(documentResource),
            mcpMoveTable(documentResource),
            mcpUpdateTableColor(documentResource),
            mcpAddUniqueConstraint(documentResource),
            mcpUpdateUniqueConstraint(documentResource),
            mcpDeleteUniqueConstraint(documentResource),
            mcpAddTableIndex(documentResource),
            mcpUpdateTableIndex(documentResource),
            mcpDeleteTableIndex(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== shared schemas ====================

const uniqueKeySchema = z.object({
    columnId: z.string().describe("The unique identifier of the column."),
    order: z.enum(["ASC", "DESC", ""]).optional().describe("The sort order for this column.")
}).strict();

const indexColumnSchema = z.object({
    columnId: z.string().describe("The unique identifier of the column."),
    order: z.enum(["ASC", "DESC", ""]).optional().describe("The sort order for this column."),
    nullsOrder: z.enum(["FIRST", "LAST", ""]).optional().describe("The nulls ordering for this column.")
}).strict();

// ==================== list-tables ====================

const descriptionList = `\
Retrieves a list of tables from the specified ERD document.
Each table includes detailed information about its columns, unique constraints, and indices.
Supports optional filtering and pagination.

REQUEST:
- documentId: The unique identifier of the ERD document whose tables are to be listed.
  Can be obtained by calling the 'list-documents' tool.

REQUEST (filter parameters - all optional):
Filtering conditions can be specified to narrow down the table list.
Multiple conditions are combined with AND logic.
- filter.tablePhysicalNameContains: Filter tables whose physical name contains the specified strings (AND).
  Example: { "filter": { "tablePhysicalNameContains": ["user"] } }
- filter.tableLogicalNameContains: Filter tables whose logical name contains the specified strings (AND).
- filter.columnPhysicalNameContains: Filter tables that have columns whose physical name contains the specified strings (AND).
- filter.columnLogicalNameContains: Filter tables that have columns whose logical name contains the specified strings (AND).
- filter.columnIds: Filter tables that contain all of the specified column IDs (AND).
  Example: { "filter": { "columnIds": ["abc-123", "def-456"] } }
- limit: Maximum number of tables to return.
- offset: Number of tables to skip (0-based, default: 0). Used with limit for pagination.

RESPONSE:
An array of table objects, each containing:
- uri: The unique URI of the table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- tableId: The unique identifier of the table (auto-generated UUID).
- tableName: Object containing physical and logical names of the table.
- description: A brief description of the table (may be empty string).
- checkExpression: The CHECK constraint expression for the table (only present if specified).
- characterSet: The character set for the table (only present if specified).
- collate: The collation for the table (only present if specified).
- definitionExpression: Additional definition expression inside CREATE TABLE (only present if specified).
- optionExpression: Option expression after CREATE TABLE closing parenthesis (only present if specified).
- view: Display settings including:
  - position: Object with x and y coordinates of the table on the ERD canvas.
  - size: Object with width and height of the table (may be null if not yet rendered).
  - color: Object with background and foreground colors in hex format.
- columns: An array of column objects, each containing either:
  - For a regular column (entryType: "column"): uri, columnModelId, columnName (physical/logical),
    typeExpression, primaryKey, notNull, unique, autoIncrement (only present for supported types),
    defaultValue, description.
  - For a struct column (entryType: "struct", BigQuery STRUCT type): uri, structColumnShareModelId,
    structName (physical/logical), isArray, notNull, description. The internal fields are NOT included
    here; call 'find-table' for the full type expression and field list, or 'find-struct-column-share'
    for the struct definition itself.
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

const listTablesResourceTemplate = uriTemplates.tables
    + "{?tableName.physical.contains,tableName.logical.contains,"
    + "columnName.physical.contains,columnName.logical.contains,columnId,limit,offset*}";

const mcpListTablesResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-tables",
        new ResourceTemplate(listTablesResourceTemplate, { list: undefined }),
        {
            title: "List tables of a specified ERD document",
            description: descriptionList
        },
        initResourceCallbackForListTables(documentResource)
    ] as const;
};

const initResourceCallbackForListTables = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const params: TableListFilterParams = {
            tablePhysicalNameContains: searchParameters(url, "tableName.physical.contains"),
            tableLogicalNameContains: searchParameters(url, "tableName.logical.contains"),
            columnIds: searchParameters(url, "columnId"),
            columnPhysicalNameContains: searchParameters(url, "columnName.physical.contains"),
            columnLogicalNameContains: searchParameters(url, "columnName.logical.contains")
        };

        const limitParam = url.searchParams.get("limit");
        const offsetParam = url.searchParams.get("offset");
        const limit = (limitParam != null) ? Number(limitParam) : undefined;
        const offset = (offsetParam != null) ? Number(offsetParam) : undefined;

        const responses = listTableResponses(documentResource, documentId, params, limit, offset);
        return initResourceResponse(url, responses);
    };
};

const listTablesInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    filter: z.object({
        tablePhysicalNameContains: z.array(z.string()).optional()
            .describe("Filter tables whose physical name contains the specified strings (AND condition)."),
        tableLogicalNameContains: z.array(z.string()).optional()
            .describe("Filter tables whose logical name contains the specified strings (AND condition)."),
        columnIds: z.array(z.string()).optional()
            .describe("Filter tables that contain all of the specified column IDs (AND condition)."),
        columnPhysicalNameContains: z.array(z.string()).optional()
            .describe("Filter tables that have columns whose physical name contains the specified strings (AND condition)."),
        columnLogicalNameContains: z.array(z.string()).optional()
            .describe("Filter tables that have columns whose logical name contains the specified strings (AND condition)."),
    }).optional().describe("Optional filter conditions (all combined with AND logic)."),
    limit: z.number().int().positive().optional()
        .describe("Maximum number of tables to return. If omitted, all matching tables are returned."),
    offset: z.number().int().nonnegative().optional()
        .describe("Number of tables to skip (0-based, default: 0). Used with limit for pagination."),
};

const mcpListTablesTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof listTablesInputSchema> => {
    return [
        "list-tables",
        {
            title: "List tables of a specified ERD document",
            description: descriptionList,
            inputSchema: listTablesInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListTables(documentResource)
    ] as const;
};

const initCallbackForListTables = (
    documentResource: DocumentResource
): ToolCallback<typeof listTablesInputSchema> => {
    return async ({ documentId, filter, limit, offset }) => {
        const params: TableListFilterParams = {
            tablePhysicalNameContains: filter?.tablePhysicalNameContains ?? [],
            tableLogicalNameContains: filter?.tableLogicalNameContains ?? [],
            columnIds: filter?.columnIds ?? [],
            columnPhysicalNameContains: filter?.columnPhysicalNameContains ?? [],
            columnLogicalNameContains: filter?.columnLogicalNameContains ?? [],
        };

        const responses = listTableResponses(documentResource, documentId, params, limit, offset);
        return initToolJsonResponse(responses);
    };
};

type TableListFilterParams = {
    tablePhysicalNameContains: string[];
    tableLogicalNameContains: string[];
    columnIds: string[];
    columnPhysicalNameContains: string[];
    columnLogicalNameContains: string[];
};

const listTableResponses = (
    documentResource: DocumentResource, documentId: string,
    params: TableListFilterParams, limit: number | undefined, offset: number | undefined
) => {
    const { erdBudget } = findDocument(documentResource, documentId);
    return doListTables(erdBudget, params, limit, offset);
};

const doListTables = (
    erdBudget: DocumentBudget, params: TableListFilterParams,
    limit: number | undefined, offset: number | undefined
) => {
    const tableViews = doFilterTableViews(params, erdBudget.erdDocument);

    const offsetValue = offset ?? 0;
    const pagedViews = (limit != null)
        ? tableViews.slice(offsetValue, offsetValue + limit) : tableViews.slice(offsetValue);

    return pagedViews.map(tableView => toTableSummaryWithColumns(erdBudget, tableView));
};

const doFilterTableViews = (params: TableListFilterParams, erdDocument: ErdDocument) => {
    const {
        tablePhysicalNameContains: tablePhysicalNames,
        tableLogicalNameContains: tableLogicalNames,
        columnIds,
        columnPhysicalNameContains: columnPhysicalNames,
        columnLogicalNameContains: columnLogicalNames
    } = params;

    return erdDocument.getTableViewModels().filter(tableView => {
        const matchedTablePhysical = (tablePhysicalNames.length === 0)
            || tablePhysicalNames.every(filtering =>
                tableView.tableModel.physicalName.includes(filtering));
        if (matchedTablePhysical === false) {
            return false;
        };

        const matchedTableLogical = (tableLogicalNames.length === 0)
            || tableLogicalNames.every(filtering =>
                tableView.tableModel.logicalName.includes(filtering));
        if (matchedTableLogical === false) {
            return false;
        };

        const allColumns = erdDocument.toAllColumnsWithStruct(tableView.tableModel);
        const targetEntries = extractToSearchEntries(erdDocument, allColumns);

        const matchedColumnIds = (columnIds.length === 0)
            || columnIds.every(filtering => targetEntries.some(entry => {
                return (entry.entryType === "column") && (entry.column.columnModelId === filtering);
            }));
        if (matchedColumnIds === false) {
            return false;
        };

        const matchedColumnPhysical = (columnPhysicalNames.length === 0)
            || targetEntries.some(entry => {
                if (entry.entryType === "struct") {
                    const overrideNames = overrideColumnName(entry.column, entry.structModel);
                    return columnPhysicalNames.every(filtering => overrideNames.physicalName.includes(filtering));
                }

                const columnShare = erdDocument.findColumnShareModel(entry.column.columnShareModelId);
                if (columnShare == null) {
                    return false;
                }

                const overrideNames = overrideColumnName(entry.column, columnShare);
                return columnPhysicalNames.every(filtering => overrideNames.physicalName.includes(filtering));
            });
        if (matchedColumnPhysical === false) {
            return false;
        };

        const matchedColumnLogical = (columnLogicalNames.length === 0)
            || targetEntries.some(entry => {
                if (entry.entryType === "struct") {
                    const overrideNames = overrideColumnName(entry.column, entry.structModel);
                    return columnLogicalNames.every(filtering => overrideNames.logicalName.includes(filtering));
                }

                const columnShare = erdDocument.findColumnShareModel(entry.column.columnShareModelId);
                if (columnShare == null) {
                    return false;
                }

                const overrideNames = overrideColumnName(entry.column, columnShare);
                return columnLogicalNames.every(filtering => overrideNames.logicalName.includes(filtering));
            });
        if (matchedColumnLogical === false) {
            return false;
        };

        return true;
    });
};

type SearchEntry = { entryType: "column", column: SimpleColumnModel }
    | { entryType: "struct", column: ColumnModel, structModel: StructColumnShareModel };

/**
 * 表示用 ColumnModel 列を検索用エントリへ変換する。struct バリアントは findStructColumnShareModel で定義を解決し、
 * 解決できないもの (定義が削除済みなど) はスキップする。
 */
const extractToSearchEntries = (erdDocument: ErdDocument, columns: ColumnModel[]): SearchEntry[] => {
    return columns.flatMap((columnModel): SearchEntry[] => {
        if (ColumnModel.isStructColumn(columnModel) === false) {
            return [{ entryType: "column", column: columnModel }];
        }

        const structModel = erdDocument.findStructColumnShareModel(columnModel.structShareModelId);
        if (structModel == null) {
            return [];
        }

        return [{ entryType: "struct", column: columnModel, structModel: structModel }];
    });
};

// ==================== find-table ====================

const descriptionFind = `\
Retrieves detailed information about a specific table from the specified ERD document using its tableId.
This includes complete column definitions, unique constraints, index information, and related relations.

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- tableId: The unique identifier of the table to retrieve.
  Can be obtained by calling the 'list-tables' tool.

RESPONSE:
An object containing detailed information about the specified table:
- uri: The unique URI of the table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- tableId: The unique identifier of the table (auto-generated UUID).
- tableName: Object containing physical and logical names of the table.
- description: A brief description of the table (may be empty string).
- checkExpression: The CHECK constraint expression for the table (only present if specified).
- characterSet: The character set for the table (only present if specified).
- collate: The collation for the table (only present if specified).
- definitionExpression: Additional definition expression inside CREATE TABLE (only present if specified).
- optionExpression: Option expression after CREATE TABLE closing parenthesis (only present if specified).
- view: Display settings including:
  - position: Object with x and y coordinates of the table on the ERD canvas.
  - size: Object with width and height of the table (may be null if not yet rendered).
  - color: Object with background and foreground colors in hex format.
- columns: An array of column objects, each containing either:
  - For a regular column (entryType: "column"): uri, columnModelId, columnName (physical/logical),
    typeExpression, primaryKey, notNull, unique, autoIncrement (only present for supported types),
    defaultValue, description.
  - For a struct column (entryType: "struct", BigQuery STRUCT type): uri, structColumnShareModelId,
    structName (physical/logical), isArray, notNull, description, plus:
    - typeExpression: The fully expanded type, e.g. "ARRAY<STRUCT<zip STRING, geo STRUCT<lat FLOAT64>>>".
      A struct that recursively references itself has the offending point replaced with
      "STRUCT<!recursive:{structColumnShareModelId}>" instead of failing the whole request.
    - fields: An array of the struct's members, recursively expanded with the same shape as this columns
      array (entryType "column" or nested "struct", each also carrying its own typeExpression / fields).
      A struct that recursively references itself has fields: [] at the point of recursion.
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
  - For struct columns (BigQuery STRUCT type): uri, structColumnShareModelId, columnId (the wrapper column
    holding this struct entry), and modelType: "struct"
`;

const mcpFindTableResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-table",
        new ResourceTemplate(uriTemplates.tableDetail, { list: undefined }),
        {
            title: "Find a table of a specified ERD document",
            description: descriptionFind
        },
        initResourceCallbackForFindTable(documentResource)
    ] as const;
};

const initResourceCallbackForFindTable = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const tableId = variables.tableId as string;
        const response = findTableResponse(documentResource, documentId, tableId);

        return initResourceResponse(url, response);
    };
};

const findTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to retrieve.")
};

const mcpFindTableTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findTableInputSchema> => {
    return [
        "find-table",
        {
            title: "Find a table of a specified ERD document",
            description: descriptionFind,
            inputSchema: findTableInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindTable(documentResource)
    ] as const;
};

const initCallbackForFindTable = (
    documentResource: DocumentResource
): ToolCallback<typeof findTableInputSchema> => {
    return async ({ documentId, tableId }) => {
        const response = findTableResponse(documentResource, documentId, tableId);
        return initToolJsonResponse(response);
    };
};

const findTableResponse = (
    documentResource: DocumentResource, documentId: string, tableId: string
) => {
    const { erdBudget, tableView } = findDocumentAndTable(documentResource, documentId, tableId);
    return toTableDetail(erdBudget, tableView);
};

// ==================== add-table ====================

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
  - checkExpression: (optional) A CHECK constraint expression for the table. Use ${"`${column_name}`"} as a placeholder for column physical names.
  - characterSet: (optional) The character set for the table.
  - collate: (optional) The collation for the table.
  - definitionExpression: (optional) Additional definition expression appended inside CREATE TABLE.
  - optionExpression: (optional) Option expression appended after the closing parenthesis of CREATE TABLE.
  - columns: An array of column specifications. Each column can be defined using one of two approaches:

    APPROACH 1: Reference an existing column-share (recommended for reusing common column definitions):
    - columnShareId: The ID of an existing column-share to base the column on (required).
      Can be obtained by calling the 'list-column-shares' tool.
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
        Available column types can be obtained by calling the 'fetch-database' tool's columnTypes array.
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
        checkExpression: z.string().optional().describe(
            "The CHECK constraint expression for the table. Use `${column_name}` as a placeholder for column physical names."
        ),
        characterSet: z.string().optional().describe("The character set for the table."),
        collate: z.string().optional().describe("The collation for the table."),
        definitionExpression: z.string().optional().describe("Additional definition expression appended inside CREATE TABLE (e.g. table-level constraints)."),
        optionExpression: z.string().optional().describe("Option expression appended after the closing parenthesis of CREATE TABLE."),
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
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const schemaId = validateSchemaId(erdBudget, table.schemaId);

        const [columnEntries, columnShares] = buildAddingColumnPairs(erdBudget, table.columns);

        const addTable = new TableModel({
            physicalName: table.tableName.physical,
            logicalName: table.tableName.logical || table.tableName.physical,
            schemaId: schemaId,
            description: table.description || "",
            checkExpression: table.checkExpression || "",
            characterSet: table.characterSet || "",
            collate: table.collate || "",
            definitionExpression: table.definitionExpression || "",
            optionExpression: table.optionExpression || "",
            columnEntries: columnEntries.map(column => {
                return {
                    modelType: "single" as const,
                    columnModelId: column.columnModelId
                };
            }),
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

        const nextShareStorage = previousDocument.getColumnShareModelStorage().addColumnShare(...columnShares);
        const nextDocument = previousDocument.updateTableViewWithColumns(addTableView, columnEntries, nextShareStorage);
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

// ==================== update-table ====================

const descriptionUpdateTable = `\
Updates an existing table in a specified ERD document.
You can modify the table's name, description, schema assignment, and display settings.
Only the properties you specify will be updated; other properties will remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to update.
  Can be obtained by calling the 'list-tables' tool.
- table: The table properties to update (all fields are optional):
  - tableName: Object containing table names to update:
    - physical: (optional) The new physical name of the table.
      Must start with a letter or underscore, followed by letters, digits, or underscores.
    - logical: (optional) The new logical name of the table.
  - schemaId: (optional) The schema ID to assign the table to.
    Only applicable if the database type supports schemas.
    Can be obtained from the document's schemas array.
  - description: (optional) The new description of the table.
  - checkExpression: (optional) The new CHECK constraint expression for the table. Use ${"`${column_name}`"} as a placeholder for column physical names.
  - characterSet: (optional) The new character set for the table.
  - collate: (optional) The new collation for the table.
  - definitionExpression: (optional) The new additional definition expression for the table.
  - optionExpression: (optional) The new option expression for the table.
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
        checkExpression: z.string().optional().describe(
            "The CHECK constraint expression for the table. Use `${column_name}` as a placeholder for column physical names."
        ),
        characterSet: z.string().optional().describe("The character set for the table."),
        collate: z.string().optional().describe("The collation for the table."),
        definitionExpression: z.string().optional().describe("Additional definition expression appended inside CREATE TABLE."),
        optionExpression: z.string().optional().describe("Option expression appended after the closing parenthesis of CREATE TABLE."),
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
            checkExpression: table.checkExpression ?? previousTable.checkExpression,
            characterSet: table.characterSet ?? previousTable.characterSet,
            collate: table.collate ?? previousTable.collate,
            definitionExpression: table.definitionExpression ?? previousTable.definitionExpression,
            optionExpression: table.optionExpression ?? previousTable.optionExpression,
        });

        const nextCorner = table.view?.position
            ? {
                left: table.view.position.x ?? previousTableView.corner.left,
                top: table.view.position.y ?? previousTableView.corner.top
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

// ==================== delete-table ====================

const descriptionDeleteTable = `\
Deletes an existing table from a specified ERD document.
This will also remove all relations associated with the table and clean up column-share references.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to delete.
  Can be obtained by calling the 'list-tables' tool.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteTable = (documentResource: DocumentResource): McpServerRegisterToolArgs<typeof deleteTableInputSchema> => {
    return [
        "delete-table",
        {
            title: "Delete a table from a specified ERD document",
            description: descriptionDeleteTable,
            inputSchema: deleteTableInputSchema
        },
        initCallbackForDeleteTable(documentResource)
    ] as const;
};

const deleteTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to delete.")
};

const initCallbackForDeleteTable = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteTableInputSchema> => {
    return async ({ documentId, tableId }) => {
        const { erdDocument: previousDocument } = findDocumentAndTable(documentResource, documentId, tableId);

        const nextDocument = previousDocument.deleteTable(tableId);
        documentResource.notify(documentId, nextDocument);

        return initToolJsonResponse({ success: true });
    };
};

// ==================== move-table ====================

const descriptionMoveTable = `\
Moves one or more tables within an ERD document to either an absolute position or by a relative offset.
When moving to an absolute position, all specified tables are moved to the same coordinates.
When moving by a relative offset, each table is moved from its current position by the specified amount.

TOOL SELECTION GUIDE:
- Use move-table when you need to move tables only (absolute or relative).
- Use move-memo when you need to move memos only (absolute or relative).
- Use move-rectangle when you need to move tables and memos together in a single relative-offset operation.

COORDINATE SYSTEM:
All position coordinates use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right
- Y-axis: increases downward

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableIds: An array of table IDs to be moved.
  Can be obtained by calling the 'list-tables' tool.
- moveTo: An object specifying the movement:
  - type: Either "absolute" (move to exact coordinates) or "relative" (move by offset from current position).
  - x: The x-coordinate (absolute) or x-offset (relative).
  - y: The y-coordinate (absolute) or y-offset (relative).

RESPONSE:
An array of updated table objects (same format as table detail resource).
`;

const mcpMoveTable = (documentResource: DocumentResource): McpServerRegisterToolArgs<typeof moveTableInputSchema> => {
    return [
        "move-table",
        {
            title: "Move tables in a specified ERD document",
            description: descriptionMoveTable,
            inputSchema: moveTableInputSchema
        },
        initCallbackForMoveTable(documentResource)
    ] as const;
};

const moveTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableIds: z.array(z.string()).describe("The IDs of the tables to move."),
    moveTo: z.object({
        type: z.enum(["absolute", "relative"]).describe("The type of movement: 'absolute' or 'relative'."),
        x: z.number().describe("The x-coordinate (absolute) or x-offset (relative)."),
        y: z.number().describe("The y-coordinate (absolute) or y-offset (relative).")
    }).strict().describe("The movement specification.")
};

const initCallbackForMoveTable = (documentResource: DocumentResource): ToolCallback<typeof moveTableInputSchema> => {
    return async ({ documentId, tableIds, moveTo }) => {
        const { erdBudget } = findDocument(documentResource, documentId);

        const nextDocument: ErdDocument = (moveTo.type === "absolute")
            ? doMoveTableAbsolute(erdBudget, tableIds, { x: moveTo.x, y: moveTo.y })
            : doMoveTableRelative(erdBudget, tableIds, { x: moveTo.x, y: moveTo.y });

        documentResource.notify(documentId, nextDocument);

        const responses = tableIds.flatMap(tableId => {
            const tableView = nextDocument.findTableViewModel(tableId);
            if (tableView == null) {
                return [];
            }
            return [toTableSummaryWithColumns(erdBudget, tableView)];
        });

        return initToolJsonResponse(responses);
    };
};

const doMoveTableAbsolute = (
    erdBudget: DocumentBudget, tableIds: string[], moveTo: { x: number; y: number }
) => {
    // For absolute positioning, compute delta per table and use moveTableView
    // to ensure relation orthogonal lines are also updated.
    let currentDocument = erdBudget.erdDocument;
    for (const tableId of tableIds) {
        const tableView = currentDocument.findTableViewModel(tableId);
        if (tableView == null) {
            const url = new URL(erdBudget.tableUri(tableId));
            throw initResourceNotFound(url);
        }

        const delta = {
            x: moveTo.x - tableView.corner.left,
            y: moveTo.y - tableView.corner.top
        };

        const singleTableIds = [tableId];
        const tableIdSet = new Set(singleTableIds);

        const relationViews = currentDocument.fetchRelationsByTableIds(singleTableIds)
            .filter(relation => relation.lineViewModel.lineType === "orthogonal");
        const tableRectangles = new Map(
            Array.from(erdBudget.getRectangles().entries()).map(entry => {
                const [key, rectangle] = entry;
                const rectangleView = new RectangleViewModel({ ...rectangle });
                return [key, rectangleView];
            })
        );

        const selectState: SelectState = {
            status: "selected",
            tableIds: tableIdSet,
            memoIds: new Set()
        };
        const dragState: DragState = {
            status: "on_dragging",
            start: { x: 0, y: 0 },
            current: delta,
            delta: () => delta
        };

        const nextOrthogonal = toNextOrthogonalLines({
            relationViews, tableRectangles, selectState, dragState
        });

        currentDocument = currentDocument.moveTableView(tableIdSet, delta, nextOrthogonal);
    }

    return currentDocument;
};

const doMoveTableRelative = (
    erdBudget: DocumentBudget, tableIds: string[], moveTo: { x: number; y: number }
) => {
    const previousDocument = erdBudget.erdDocument;

    // For relative movement, use moveTableView with orthogonal line handling
    const tableIdSet = new Set(tableIds);

    const relationViews = previousDocument.fetchRelationsByTableIds(tableIds)
        .filter(relation => relation.lineViewModel.lineType === "orthogonal");
    const tableRectangles = new Map(
        Array.from(erdBudget.getRectangles().entries()).map(entry => {
            const [key, rectangle] = entry;
            const rectangleView = new RectangleViewModel({ ...rectangle });
            return [key, rectangleView];
        })
    );

    const selectState: SelectState = {
        status: "selected",
        tableIds: tableIdSet,
        memoIds: new Set()
    };
    const dragState: DragState = {
        status: "on_dragging",
        start: { x: 0, y: 0 },
        current: moveTo,
        delta: () => moveTo
    };

    const nextOrthogonal = toNextOrthogonalLines({
        relationViews, tableRectangles, selectState, dragState
    });

    return previousDocument.moveTableView(tableIdSet, moveTo, nextOrthogonal);
};

// ==================== update-table-color ====================

const descriptionUpdateTableColor = `\
Updates the header color of one or more tables in a specified ERD document.
All specified tables will be updated to the same color settings.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableIds: An array of table IDs whose colors are to be updated.
  Can be obtained by calling the 'list-tables' tool.
- color: An object containing the new color settings:
  - background: The new background color in hex format (e.g., "#FFFFFF").
  - foreground: The new foreground/text color in hex format (e.g., "#000000").

RESPONSE:
An array of updated table objects (same format as table detail resource).
`;

const mcpUpdateTableColor = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateTableColorInputSchema> => {
    return [
        "update-table-color",
        {
            title: "Update table header color in a specified ERD document",
            description: descriptionUpdateTableColor,
            inputSchema: updateTableColorInputSchema
        },
        initCallbackForUpdateTableColor(documentResource)
    ] as const;
};

const updateTableColorInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableIds: z.array(z.string()).describe("The IDs of the tables to update."),
    color: z.object({
        background: colorValueSchema.describe("The new background color in hex format (e.g., #FFFFFF)."),
        foreground: colorValueSchema.describe("The new foreground color in hex format (e.g., #000000).")
    }).strict().describe("The new color settings for the table headers.")
};

const initCallbackForUpdateTableColor = (
    documentResource: DocumentResource
): ToolCallback<typeof updateTableColorInputSchema> => {
    return async ({ documentId, tableIds, color }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const background = ColorValue.fromHex(color.background);
        const foreground = ColorValue.fromHex(color.foreground);
        const nextDocument = previousDocument.updateTableViewColor(tableIds, background, foreground);

        documentResource.notify(documentId, nextDocument);

        const responses = tableIds.flatMap(tableId => {
            const tableView = nextDocument.findTableViewModel(tableId);
            if (tableView == null) {
                return [];
            }

            return [toTableSummaryWithColumns(erdBudget, tableView)];
        });

        return initToolJsonResponse(responses);
    };
};

// ==================== add-unique-constraint ====================

const descriptionAddUniqueConstraint = `\
Adds one or more unique constraints to an existing table in a specified ERD document.
Each unique constraint defines a set of columns that must have unique values across all rows.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to add unique constraints to.
  Can be obtained by calling the 'list-tables' tool.
- uniqueConstraints: An array of unique constraint specifications, each containing:
  - uniqueConstraint: The constraint definition:
    - constraintName: (optional) The name of the unique constraint.
      Must start with a letter or underscore, followed by letters, digits, or underscores.
    - uniqueKeys: An array of column references for the constraint, each containing:
      - columnId: The unique identifier of the column.
      - order: (optional) The sort order ("ASC", "DESC", or "" for default).
    - description: (optional) A description of the constraint.
  - insertIndex: (optional) The zero-based index at which to insert the constraint.

RESPONSE:
An object containing the updated table information (same format as table detail resource).
`;

const mcpAddUniqueConstraint = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof addUniqueConstraintInputSchema> => {
    return [
        "add-unique-constraint",
        {
            title: "Add unique constraints to a table in a specified ERD document",
            description: descriptionAddUniqueConstraint,
            inputSchema: addUniqueConstraintInputSchema
        },
        initCallbackForAddUniqueConstraint(documentResource)
    ] as const;
};

const addUniqueConstraintInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to add unique constraints to."),
    uniqueConstraints: z.array(z.object({
        uniqueConstraint: z.object({
            constraintName: z.string()
                .refine(val => ((val === "") || validatePhysicalName(val)), {
                    message: "Constraint name must be empty or start with a letter or underscore, " +
                        "followed by letters, digits, or underscores."
                }).optional().describe("The name of the unique constraint."),
            uniqueKeys: z.array(uniqueKeySchema)
                .min(2, { message: "At least 2 unique keys are required." })
                .describe("The columns that make up the unique constraint."),
            description: z.string().optional().describe("A description of the constraint.")
        }).strict().describe("The unique constraint definition."),
        insertIndex: z.number().optional().describe("The zero-based index at which to insert the constraint.")
    }).strict()).describe("The unique constraints to add.")
};

const initCallbackForAddUniqueConstraint = (
    documentResource: DocumentResource
): ToolCallback<typeof addUniqueConstraintInputSchema> => {
    return async ({ documentId, tableId, uniqueConstraints }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;
        const nextUniqueKeysModels = [...previousTable.uniqueKeysModels];

        const columnIdSet = new Set(
            previousDocument.toAllColumnsExceptStruct(previousTable).map(model => model.columnModelId)
        );

        for (const entry of uniqueConstraints) {
            const uniqueConstraint = entry.uniqueConstraint;
            const uniqueKeysColumnModels = uniqueConstraint.uniqueKeys.map(uniqueKey => {
                if (columnIdSet.has(uniqueKey.columnId) === false) {
                    throw initInvalidParams(`ColumnId not found in the table: ${uniqueKey.columnId}`);
                }

                return new UniqueKeysColumnModel({
                    columnModelId: uniqueKey.columnId,
                    sortOrderType: uniqueKey.order || ""
                });
            }
            );

            const uniqueKeyModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: uuidV4(),
                physicalName: uniqueConstraint.constraintName || "",
                uniqueKeysColumnModels: uniqueKeysColumnModels,
                description: uniqueConstraint.description || ""
            });

            const insertIndex = entry.insertIndex ?? nextUniqueKeysModels.length;
            const clampedIndex = Math.max(0, Math.min(insertIndex, nextUniqueKeysModels.length));
            nextUniqueKeysModels.splice(clampedIndex, 0, uniqueKeyModel);
        }

        const nextTableView = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTable,
                uniqueKeysModels: nextUniqueKeysModels
            })
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        const response = toTableSummaryWithColumns(erdBudget, nextTableView);
        return initToolJsonResponse(response);
    };
};

// ==================== update-unique-constraint ====================

const descriptionUpdateUniqueConstraint = `\
Updates an existing unique constraint of a table in a specified ERD document.
Only the properties you specify will be updated; other properties will remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table containing the unique constraint.
- uniqueConstraintId: The unique identifier of the unique constraint to update.
- uniqueConstraint: The properties to update (all fields are optional):
  - constraintName: The new name of the unique constraint.
  - uniqueKeys: The new column references for the constraint.
  - description: The new description of the constraint.

RESPONSE:
An object containing the updated table information (same format as table detail resource).
`;

const mcpUpdateUniqueConstraint = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateUniqueConstraintInputSchema> => {
    return [
        "update-unique-constraint",
        {
            title: "Update a unique constraint of a table in a specified ERD document",
            description: descriptionUpdateUniqueConstraint,
            inputSchema: updateUniqueConstraintInputSchema
        },
        initCallbackForUpdateUniqueConstraint(documentResource)
    ] as const;
};

const updateUniqueConstraintInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table."),
    uniqueConstraintId: z.string().describe("The unique identifier of the unique constraint to update."),
    uniqueConstraint: z.object({
        constraintName: z.string()
            .refine(val => ((val === "") || validatePhysicalName(val)), {
                message: "Constraint name must be empty or start with a letter or underscore."
            }).optional().describe("The new name of the unique constraint."),
        uniqueKeys: z.array(uniqueKeySchema)
            .min(2, { message: "At least 2 unique keys are required." })
            .optional().describe("The new columns for the unique constraint."),
        description: z.string().optional().describe("The new description of the constraint.")
    }).describe("The unique constraint properties to update.")
};

const initCallbackForUpdateUniqueConstraint = (
    documentResource: DocumentResource
): ToolCallback<typeof updateUniqueConstraintInputSchema> => {
    return async ({ documentId, tableId, uniqueConstraintId, uniqueConstraint: updating }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;
        const existingModel = previousTable.uniqueKeysModels
            .find(uniqueModel => (uniqueModel.tableUniqueKeysModelId === uniqueConstraintId));
        if (existingModel == null) {
            throw initInvalidParams(`Unique constraint not found: ${uniqueConstraintId}`);
        }

        const columnIdSet = new Set(
            previousDocument.toAllColumnsExceptStruct(previousTable).map(model => model.columnModelId)
        );

        const nextUniqueKeysColumnModels = updating.uniqueKeys?.map(uniqueKey => {
            if (columnIdSet.has(uniqueKey.columnId) === false) {
                throw initInvalidParams(`ColumnId not found in the table: ${uniqueKey.columnId}`);
            }

            return new UniqueKeysColumnModel({
                columnModelId: uniqueKey.columnId,
                sortOrderType: uniqueKey.order || ""
            })
        });

        const nextModel = new TableUniqueKeysModel({
            tableUniqueKeysModelId: existingModel.tableUniqueKeysModelId,
            physicalName: updating.constraintName ?? existingModel.physicalName,
            uniqueKeysColumnModels: nextUniqueKeysColumnModels
                ? nextUniqueKeysColumnModels : [...existingModel.uniqueKeysColumnModels],
            description: updating.description ?? existingModel.description
        });

        const nextUniqueKeysModels = previousTable.uniqueKeysModels.map(uniqueModel =>
            (uniqueModel.tableUniqueKeysModelId === uniqueConstraintId) ? nextModel : uniqueModel
        );

        const nextTableView = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTable,
                uniqueKeysModels: nextUniqueKeysModels
            })
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        const response = toTableSummaryWithColumns(erdBudget, nextTableView);
        return initToolJsonResponse(response);
    };
};

// ==================== delete-unique-constraint ====================

const descriptionDeleteUniqueConstraint = `\
Deletes one or more unique constraints from a table in a specified ERD document.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table containing the unique constraints.
- uniqueConstraintIds: An array of unique constraint IDs to delete.

RESPONSE:
An object containing the updated table information (same format as table detail resource).
`;

const mcpDeleteUniqueConstraint = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteUniqueConstraintInputSchema> => {
    return [
        "delete-unique-constraint",
        {
            title: "Delete unique constraints from a table in a specified ERD document",
            description: descriptionDeleteUniqueConstraint,
            inputSchema: deleteUniqueConstraintInputSchema
        },
        initCallbackForDeleteUniqueConstraint(documentResource)
    ] as const;
};

const deleteUniqueConstraintInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table."),
    uniqueConstraintIds: z.array(z.string())
        .min(1, "At least one unique constraint ID must be provided.")
        .describe("The IDs of the unique constraints to delete.")
};

const initCallbackForDeleteUniqueConstraint = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteUniqueConstraintInputSchema> => {
    return async ({ documentId, tableId, uniqueConstraintIds }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;
        const deletingIds = new Set(uniqueConstraintIds);
        const nextUniqueKeysModels = previousTable.uniqueKeysModels
            .filter(uniqueModel => (deletingIds.has(uniqueModel.tableUniqueKeysModelId) === false));

        const nextTableView = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTable,
                uniqueKeysModels: nextUniqueKeysModels
            })
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        const response = toTableSummaryWithColumns(erdBudget, nextTableView);
        return initToolJsonResponse(response);
    };
};

// ==================== add-table-index ====================

const descriptionAddTableIndex = `\
Adds one or more indexes to an existing table in a specified ERD document.
Indexes improve query performance on the specified columns.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to add indexes to.
  Can be obtained by calling the 'list-tables' tool.
- tableIndexes: An array of index specifications, each containing:
  - tableIndex: The index definition:
    - indexName: (optional) The name of the index.
      Must start with a letter or underscore, followed by letters, digits, or underscores.
    - indexColumns: An array of column references for the index, each containing:
      - columnId: The unique identifier of the column.
      - order: (optional) The sort order ("ASC", "DESC", or "" for default).
      - nullsOrder: (optional) The nulls ordering ("FIRST", "LAST", or "" for default).
    - indexOption: (optional) The index option ("UNIQUE", "FULLTEXT", "SPATIAL", or "" for none).
    - indexType: (optional) The index type ("BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN", or "" for default).
    - clustered: (optional) Whether the index is clustered (only for databases that support it).
    - description: (optional) A description of the index.
  - insertIndex: (optional) The zero-based index at which to insert the index.

RESPONSE:
An object containing the updated table information (same format as table detail resource).
`;

const mcpAddTableIndex = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof addTableIndexInputSchema> => {
    return [
        "add-table-index",
        {
            title: "Add indexes to a table in a specified ERD document",
            description: descriptionAddTableIndex,
            inputSchema: addTableIndexInputSchema
        },
        initCallbackForAddTableIndex(documentResource)
    ] as const;
};

const addTableIndexInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to add indexes to."),
    tableIndexes: z.array(z.object({
        tableIndex: z.object({
            indexName: z.string()
                .refine(val => ((val === "") || validatePhysicalName(val)), {
                    message: "Index name must be empty or start with a letter or underscore, " +
                        "followed by letters, digits, or underscores."
                }).optional().describe("The name of the index."),
            indexColumns: z.array(indexColumnSchema)
                .min(1, { message: "At least one column must be specified for the index." })
                .describe("The columns that make up the index."),
            indexOption: z.enum(["UNIQUE", "FULLTEXT", "SPATIAL", ""]).optional()
                .describe("The index option."),
            indexType: z.enum(["BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN", ""]).optional()
                .describe("The index type."),
            clustered: z.boolean().optional().describe("Whether the index is clustered."),
            description: z.string().optional().describe("A description of the index.")
        }).strict().describe("The index definition."),
        insertIndex: z.number().optional().describe("The zero-based index at which to insert the index.")
    }).strict()).describe("The indexes to add.")
};

const initCallbackForAddTableIndex = (
    documentResource: DocumentResource
): ToolCallback<typeof addTableIndexInputSchema> => {
    return async ({ documentId, tableId, tableIndexes }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;
        const nextTableIndexModels = [...previousTable.tableIndexModels];
        const columnIdSet = new Set(
            previousDocument.toAllColumnsExceptStruct(previousTable).map(model => model.columnModelId)
        );

        for (const entry of tableIndexes) {
            const tableIndex = entry.tableIndex;
            const indexColumnModels = tableIndex.indexColumns.map(indexColumn => {
                if (columnIdSet.has(indexColumn.columnId) === false) {
                    throw initInvalidParams(`ColumnId not found in the table: ${indexColumn.columnId}`);
                }

                return new IndexColumnModel({
                    columnModelId: indexColumn.columnId,
                    sortOrderType: indexColumn.order || "",
                    nullsOrderType: indexColumn.nullsOrder || ""
                });
            });

            const indexModel = new TableIndexModel({
                tableIndexModelId: uuidV4(),
                physicalName: tableIndex.indexName || "",
                indexColumnModels: indexColumnModels,
                indexOption: tableIndex.indexOption || "",
                indexType: tableIndex.indexType || "",
                clustered: tableIndex.clustered || false,
                description: tableIndex.description || ""
            });

            const insertIndex = entry.insertIndex ?? nextTableIndexModels.length;
            const clampedIndex = Math.max(0, Math.min(insertIndex, nextTableIndexModels.length));
            nextTableIndexModels.splice(clampedIndex, 0, indexModel);
        }

        const nextTableView = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTable,
                tableIndexModels: nextTableIndexModels
            })
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        const response = toTableSummaryWithColumns(erdBudget, nextTableView);
        return initToolJsonResponse(response);
    };
};

// ==================== update-table-index ====================

const descriptionUpdateTableIndex = `\
Updates an existing index of a table in a specified ERD document.
Only the properties you specify will be updated; other properties will remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table containing the index.
- tableIndexId: The unique identifier of the index to update.
- tableIndex: The properties to update (all fields are optional):
  - indexName: The new name of the index.
  - indexColumns: The new column references for the index.
  - indexOption: The new index option.
  - indexType: The new index type.
  - clustered: Whether the index is clustered.
  - description: The new description of the index.

RESPONSE:
An object containing the updated table information (same format as table detail resource).
`;

const mcpUpdateTableIndex = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateTableIndexInputSchema> => {
    return [
        "update-table-index",
        {
            title: "Update an index of a table in a specified ERD document",
            description: descriptionUpdateTableIndex,
            inputSchema: updateTableIndexInputSchema
        },
        initCallbackForUpdateTableIndex(documentResource)
    ] as const;
};

const updateTableIndexInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table."),
    tableIndexId: z.string().describe("The unique identifier of the index to update."),
    tableIndex: z.object({
        indexName: z.string()
            .refine(val => ((val === "") || validatePhysicalName(val)), {
                message: "Index name must be empty or start with a letter or underscore."
            }).optional().describe("The new name of the index."),
        indexColumns: z.array(indexColumnSchema)
            .min(1, { message: "At least one column must be specified for the index." })
            .optional().describe("The new columns for the index."),
        indexOption: z.enum(["UNIQUE", "FULLTEXT", "SPATIAL", ""]).optional()
            .describe("The new index option."),
        indexType: z.enum(["BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN", ""]).optional()
            .describe("The new index type."),
        clustered: z.boolean().optional().describe("Whether the index is clustered."),
        description: z.string().optional().describe("The new description of the index.")
    }).describe("The index properties to update.")
};

const initCallbackForUpdateTableIndex = (
    documentResource: DocumentResource
): ToolCallback<typeof updateTableIndexInputSchema> => {
    return async ({ documentId, tableId, tableIndexId, tableIndex: updating }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;
        const existingModel = previousTable.tableIndexModels
            .find(indexModel => (indexModel.tableIndexModelId === tableIndexId));
        if (existingModel == null) {
            throw initInvalidParams(`Table index not found: ${tableIndexId}`);
        }

        const columnIdSet = new Set(
            previousDocument.toAllColumnsExceptStruct(previousTable).map(model => model.columnModelId)
        );
        const nextIndexColumnModels = updating.indexColumns?.map(indexColumn => {
            if (columnIdSet.has(indexColumn.columnId) === false) {
                throw initInvalidParams(`ColumnId not found in the table: ${indexColumn.columnId}`);
            }

            return new IndexColumnModel({
                columnModelId: indexColumn.columnId,
                sortOrderType: indexColumn.order || "",
                nullsOrderType: indexColumn.nullsOrder || ""
            });
        });

        const nextModel = new TableIndexModel({
            tableIndexModelId: existingModel.tableIndexModelId,
            physicalName: updating.indexName ?? existingModel.physicalName,
            indexColumnModels: nextIndexColumnModels
                ? nextIndexColumnModels : [...existingModel.indexColumnModels],
            indexOption: updating.indexOption ?? existingModel.indexOption,
            indexType: updating.indexType ?? existingModel.indexType,
            clustered: updating.clustered ?? existingModel.clustered,
            description: updating.description ?? existingModel.description
        });

        const nextTableIndexModels = previousTable.tableIndexModels.map(indexModel =>
            (indexModel.tableIndexModelId === tableIndexId) ? nextModel : indexModel
        );

        const nextTableView = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTable,
                tableIndexModels: nextTableIndexModels
            })
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        const response = toTableSummaryWithColumns(erdBudget, nextTableView);
        return initToolJsonResponse(response);
    };
};

// ==================== delete-table-index ====================

const descriptionDeleteTableIndex = `\
Deletes one or more indexes from a table in a specified ERD document.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table containing the indexes.
- tableIndexIds: An array of index IDs to delete.

RESPONSE:
An object containing the updated table information (same format as table detail resource).
`;

const mcpDeleteTableIndex = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteTableIndexInputSchema> => {
    return [
        "delete-table-index",
        {
            title: "Delete indexes from a table in a specified ERD document",
            description: descriptionDeleteTableIndex,
            inputSchema: deleteTableIndexInputSchema
        },
        initCallbackForDeleteTableIndex(documentResource)
    ] as const;
};

const deleteTableIndexInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table."),
    tableIndexIds: z.array(z.string())
        .min(1, "At least one index ID must be provided.")
        .describe("The IDs of the indexes to delete.")
};

const initCallbackForDeleteTableIndex = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteTableIndexInputSchema> => {
    return async ({ documentId, tableId, tableIndexIds }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const previousTable = previousTableView.tableModel;
        const deletingIds = new Set(tableIndexIds);
        const nextTableIndexModels = previousTable.tableIndexModels
            .filter(indexModel => (deletingIds.has(indexModel.tableIndexModelId) === false));

        const nextTableView = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTable,
                tableIndexModels: nextTableIndexModels
            })
        });

        const nextDocument = previousDocument.updateTableMeta(nextTableView);
        documentResource.notify(documentId, nextDocument);

        const response = toTableSummaryWithColumns(erdBudget, nextTableView);
        return initToolJsonResponse(response);
    };
};

// ==================== shared helpers ====================

const validateSchemaId = (erdBudget: DocumentBudget, schemaId: string | undefined, defaultValue: string = "") => {
    if ((schemaId == null) || (schemaId === "")) {
        return defaultValue;
    }

    const erdDocument = erdBudget.erdDocument;
    const database = erdDocument.getDatabase();
    if (database.supportsSchema === false) {
        throw initInvalidParams(`The database type '${database.databaseType}' does not support schemas.`);
    }

    const schema = erdDocument.findSchema(schemaId);
    if (schema == null) {
        const url = new URL(erdBudget.schemaUri(schemaId));
        throw initResourceNotFound(url);
    }

    return schema.schemaId;
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
        ...(tableView.tableModel.checkExpression && { checkExpression: tableView.tableModel.checkExpression }),
        ...(tableView.tableModel.characterSet && { characterSet: tableView.tableModel.characterSet }),
        ...(tableView.tableModel.collate && { collate: tableView.tableModel.collate }),
        ...(tableView.tableModel.definitionExpression && { definitionExpression: tableView.tableModel.definitionExpression }),
        ...(tableView.tableModel.optionExpression && { optionExpression: tableView.tableModel.optionExpression }),
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

type StructExpansion = "omit" | "expand";

const toTableSummaryWithColumns = (
    erdBudget: DocumentBudget, tableView: TableViewModel, structExpansion: StructExpansion = "omit"
) => {
    const tableColumns = toTableColumns(erdBudget, tableView, structExpansion);

    const columnMapping = new Map(tableColumns.flatMap(entry => {
        if (entry.entryType === "struct") {
            return [];
        }

        return [[entry.columnModelId, entry]];
    }));

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
    const tableWithColumns = toTableSummaryWithColumns(erdBudget, tableView, "expand");
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
    const erdDocument = erdBudget.erdDocument;
    const columnEntries = tableView.tableModel.columnEntries;

    return columnEntries.map(columnEntry => {
        if (columnEntry.modelType === "group") {
            return {
                uri: erdBudget.columnGroupUri(columnEntry.columnGroupId),
                columnGroupId: columnEntry.columnGroupId,
                modelType: "group" as const
            };
        }

        const columnModel = erdDocument.findColumnModel(columnEntry.columnModelId);
        if ((columnModel != null) && (columnModel.entityType === "struct")) {
            return {
                uri: erdBudget.structColumnShareUri(columnModel.structShareModelId),
                structColumnShareModelId: columnModel.structShareModelId,
                columnId: columnModel.columnModelId,
                modelType: "struct" as const
            };
        }

        return {
            uri: erdBudget.columnUri(columnEntry.columnModelId),
            columnModelId: columnEntry.columnModelId,
            modelType: "single" as const
        };
    });
};

// struct のフィールド名・型式はエージェント向けレスポンス上のものであり、DDL のエスケープ規則は適用しない。
const structResponseTypeOptions = {
    escape: (value: string) => value,
    onRecursiveStruct: (structShare: StructColumnShareModel) => {
        return `STRUCT<!recursive:${structShare.structShareModelId}>`;
    }
};

type StructFieldEntry = (
    {
        entryType: "column";
        columnModelId: string;
        columnName: { physical: string; logical: string; };
        typeExpression: string;
    } | {
        entryType: "struct";
        structColumnShareModelId: string;
        structName: { physical: string; logical: string; };
        isArray: boolean;
        typeExpression: string;
        fields: StructFieldEntry[];
    }
) & {
    uri: string;
    notNull: boolean;
    description: string;
};

type TableColumnEntry = (
    {
        entryType: "column";
        columnModelId: string;
        columnName: { physical: string; logical: string; };
        typeExpression: string;
        primaryKey: boolean;
        unique: boolean;
        autoIncrement?: boolean | undefined;
        defaultValue: string;
    } | {
        entryType: "struct";
        structColumnShareModelId: string;
        structName: { physical: string; logical: string; };
        isArray: boolean;
        // 一覧では struct 内部を返さないため未定義。詳細取得 (structExpansion: "expand") のみ展開する。
        typeExpression?: string | undefined;
        fields?: StructFieldEntry[] | undefined;
    }
) & {
    uri: string;
    notNull: boolean;
    description: string;
};

const toTableColumns = (
    erdBudget: DocumentBudget, tableView: TableViewModel, structExpansion: StructExpansion
): TableColumnEntry[] => {
    const erdDocument = erdBudget.erdDocument;
    const columnModels = erdDocument.toAllColumnsWithStruct(tableView.tableModel);

    return columnModels.flatMap((column): TableColumnEntry[] => {
        if (column.entityType === "struct") {
            return toStructColumnEntry(erdBudget, column, structExpansion);
        }

        const shareModel = erdDocument.findColumnShareModel(column.columnShareModelId);
        if (shareModel == null) {
            return [];
        }

        const columnName = overrideColumnName(column, shareModel);
        const inChildRelation = erdDocument.inChildRelation(tableView.tableId, column.columnModelId);
        const typeExpression = shareModel.specifiedColumnType(inChildRelation);

        return [
            {
                uri: erdBudget.columnUri(column.columnModelId),
                entryType: "column",
                columnModelId: column.columnModelId,
                columnName: {
                    physical: columnName.physicalName,
                    logical: columnName.logicalName
                },
                typeExpression: typeExpression,
                primaryKey: column.primaryKey,
                notNull: column.notNull,
                unique: column.unique,
                ...((shareModel.columnType.withAutoIncrement) && { autoIncrement: column.autoIncrement }),
                defaultValue: column.defaultValue,
                description: shareModel.description
            }
        ];
    });
};

const toStructColumnEntry = (
    erdBudget: DocumentBudget, column: StructColumnModel, structExpansion: StructExpansion
): TableColumnEntry[] => {
    const erdDocument = erdBudget.erdDocument;
    const structColumnShare = erdDocument.findStructColumnShareModel(column.structShareModelId);
    if (structColumnShare == null) {
        return [];
    }

    const overrideNames = overrideColumnName(column, structColumnShare);
    const expansion = toStructExpansionFields(erdBudget, structColumnShare, structExpansion);

    return [
        {
            uri: erdBudget.structColumnShareUri(structColumnShare.structShareModelId),
            entryType: "struct",
            structColumnShareModelId: structColumnShare.structShareModelId,
            structName: {
                physical: overrideNames.physicalName,
                logical: overrideNames.logicalName
            },
            notNull: column.notNull,
            isArray: structColumnShare.isArray,
            description: structColumnShare.description,
            ...expansion
        }
    ];
};

const toStructExpansionFields = (
    erdBudget: DocumentBudget, structColumnShare: StructColumnShareModel, structExpansion: StructExpansion
): { typeExpression?: string | undefined; fields?: StructFieldEntry[] | undefined; } => {
    if (structExpansion === "omit") {
        return {};
    }

    const erdDocument = erdBudget.erdDocument;
    const typeExpression = buildStructTypeExpression(erdDocument, structColumnShare, structResponseTypeOptions);
    const fields = toStructFieldEntries(erdBudget, structColumnShare, new Set());

    return { typeExpression, fields };
};

const toStructFieldEntries = (
    erdBudget: DocumentBudget, structColumnShare: StructColumnShareModel, visitedStructIds: ReadonlySet<string>
): StructFieldEntry[] => {
    const erdDocument = erdBudget.erdDocument;
    const innerVisitedIds = new Set(visitedStructIds);
    innerVisitedIds.add(structColumnShare.structShareModelId);

    const memberColumns = erdDocument.toAllColumnsWithStruct(structColumnShare);

    return memberColumns.flatMap((memberColumn): StructFieldEntry[] => {
        if (memberColumn.entityType === "struct") {
            return toNestedStructFieldEntry(erdBudget, memberColumn, innerVisitedIds);
        }

        return toSimpleStructFieldEntry(erdBudget, memberColumn);
    });
};

const toNestedStructFieldEntry = (
    erdBudget: DocumentBudget, memberColumn: StructColumnModel, visitedStructIds: ReadonlySet<string>
): StructFieldEntry[] => {
    const erdDocument = erdBudget.erdDocument;
    const nestedStructShare = erdDocument.findStructColumnShareModel(memberColumn.structShareModelId);
    if (nestedStructShare == null) {
        return [];
    }

    const overrideNames = overrideColumnName(memberColumn, nestedStructShare);
    const typeExpression = buildStructTypeExpression(erdDocument, nestedStructShare, structResponseTypeOptions);
    const fields = visitedStructIds.has(nestedStructShare.structShareModelId)
        ? []
        : toStructFieldEntries(erdBudget, nestedStructShare, visitedStructIds);

    return [
        {
            uri: erdBudget.structColumnShareUri(nestedStructShare.structShareModelId),
            entryType: "struct",
            structColumnShareModelId: nestedStructShare.structShareModelId,
            structName: {
                physical: overrideNames.physicalName,
                logical: overrideNames.logicalName
            },
            isArray: nestedStructShare.isArray,
            typeExpression: typeExpression,
            fields: fields,
            notNull: memberColumn.notNull,
            description: nestedStructShare.description
        }
    ];
};

const toSimpleStructFieldEntry = (erdBudget: DocumentBudget, memberColumn: SimpleColumnModel): StructFieldEntry[] => {
    const erdDocument = erdBudget.erdDocument;
    const columnShare = erdDocument.findColumnShareModel(memberColumn.columnShareModelId);
    if (columnShare == null) {
        return [];
    }

    const overrideName = overrideColumnName(memberColumn, columnShare);

    return [
        {
            uri: erdBudget.columnUri(memberColumn.columnModelId),
            entryType: "column",
            columnModelId: memberColumn.columnModelId,
            columnName: {
                physical: overrideName.physicalName,
                logical: overrideName.logicalName
            },
            typeExpression: columnShare.specifiedColumnType(),
            notNull: memberColumn.notNull,
            description: columnShare.description
        }
    ];
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
