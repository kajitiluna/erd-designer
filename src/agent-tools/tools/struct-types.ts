import {
    ReadResourceTemplateCallback, ResourceTemplate, ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/agent-tools/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/agent-tools/DocumentBudget";
import {
    calculateIndexFromPosition, DESCRIPTION_DOCUMENT_ID, findDocument, findDocumentAndTable, initInvalidParams,
    initPositionSchema, initResourceNotFound, initResourceResponse, initToolJsonResponse, McpRegisterConfig,
    McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/agent-tools/tools/support";
import ColumnStructModel from "~/models/database/ColumnStructModel";
import TableModel, { ColumnModelType } from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

export const mcpRegisterColumnStruct = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListColumnStructsResource(documentResource),
            mcpFindColumnStructResource(documentResource)
        ],
        tools: [
            mcpListColumnStructsTool(documentResource),
            mcpFindColumnStructTool(documentResource),
            mcpCreateColumnStruct(documentResource),
            mcpUpdateColumnStruct(documentResource),
            mcpDeleteColumnStruct(documentResource),
            mcpAddColumnStructToTable(documentResource),
            mcpRemoveColumnStructFromTable(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== shared schemas ====================

const columnEntryRefSchema = z.union([
    z.object({ columnId: z.string() }).strict()
        .describe("Reference an existing single column by its columnId."),
    z.object({ columnGroupId: z.string() }).strict()
        .describe("Reference an existing column group by its columnGroupId."),
    z.object({ columnStructId: z.string() }).strict()
        .describe("Reference an existing (nested) column struct by its columnStructId.")
]);

const responseColumnStructDetail = `\
- uri: The unique URI of the column struct (format: erd-designer://documents/{documentId}/column_structs/{columnStructId}).
- columnStructId: The unique identifier of the column struct (auto-generated UUID).
- columnName: Object containing physical and logical names of the struct field.
- isArray: Boolean indicating if this struct is repeated (ARRAY<STRUCT<...>>).
- notNull: Boolean indicating if this struct field is NOT NULL.
- columns: Array of member entries in this struct, each containing:
  - modelType: Either "single", "group", or "struct".
  - uri: The URI to access the referenced resource.
  - columnId / columnGroupId / columnStructId: The identifier of the referenced resource (depending on modelType).
- description: A brief description of the column struct (may be empty string).\
`;

// ==================== list-column-structs ====================

const descriptionList = `\
Retrieves a list of column structs from the specified ERD document.
Column structs represent BigQuery STRUCT (or ARRAY<STRUCT>) type columns, whose members are
single columns, column groups, or other (nested) column structs.
Only supported for databases with supportsStructType (currently BigQuery).

REQUEST:
- documentId: The unique identifier of the ERD document whose column structs are to be listed.
  Can be obtained by calling the 'list-documents' tool.

RESPONSE:
An array of column struct objects (summary form), each containing:
${responseColumnStructDetail}
`;

const mcpListColumnStructsResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-column-structs",
        new ResourceTemplate(uriTemplates.columnStructs, { list: undefined }),
        {
            title: "List column structs of a specified ERD document",
            description: descriptionList
        },
        initResourceCallbackForListColumnStructs(documentResource)
    ] as const;
};

const initResourceCallbackForListColumnStructs = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const responses = listColumnStructResponses(documentResource, documentId);

        return initResourceResponse(url, responses);
    };
};

const listColumnStructsInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID)
};

const mcpListColumnStructsTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof listColumnStructsInputSchema> => {
    return [
        "list-column-structs",
        {
            title: "List column structs of a specified ERD document",
            description: descriptionList,
            inputSchema: listColumnStructsInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListColumnStructs(documentResource)
    ] as const;
};

const initCallbackForListColumnStructs = (
    documentResource: DocumentResource
): ToolCallback<typeof listColumnStructsInputSchema> => {
    return async ({ documentId }) => {
        const responses = listColumnStructResponses(documentResource, documentId);
        return initToolJsonResponse(responses);
    };
};

const listColumnStructResponses = (documentResource: DocumentResource, documentId: string) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    return erdDocument.getColumnStructModels().map(structModel => toColumnStructDetail(erdBudget, structModel));
};

// ==================== find-column-struct ====================

const descriptionFind = `\
Retrieves detailed information about a specific column struct from the specified ERD document using its columnStructId.

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- columnStructId: The unique identifier of the column struct to retrieve.
  Can be obtained by calling the 'list-column-structs' tool or from a table's columnDefinitions array.

RESPONSE:
An object containing detailed information about the specified column struct:
${responseColumnStructDetail}
`;

const mcpFindColumnStructResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-column-struct",
        new ResourceTemplate(uriTemplates.columnStructDetail, { list: undefined }),
        {
            title: "Find a column struct of a specified ERD document",
            description: descriptionFind
        },
        initResourceCallbackForFindColumnStruct(documentResource)
    ] as const;
};

const initResourceCallbackForFindColumnStruct = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const columnStructId = variables.columnStructId as string;
        const response = findColumnStructResponse(documentResource, documentId, columnStructId);

        return initResourceResponse(url, response);
    };
};

const findColumnStructInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnStructId: z.string().describe("The unique identifier of the column struct to retrieve.")
};

const mcpFindColumnStructTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findColumnStructInputSchema> => {
    return [
        "find-column-struct",
        {
            title: "Find a column struct of a specified ERD document",
            description: descriptionFind,
            inputSchema: findColumnStructInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindColumnStruct(documentResource)
    ] as const;
};

const initCallbackForFindColumnStruct = (
    documentResource: DocumentResource
): ToolCallback<typeof findColumnStructInputSchema> => {
    return async ({ documentId, columnStructId }) => {
        const response = findColumnStructResponse(documentResource, documentId, columnStructId);
        return initToolJsonResponse(response);
    };
};

const findColumnStructResponse = (
    documentResource: DocumentResource, documentId: string, columnStructId: string
) => {
    const { erdBudget, columnStruct } = doFindDocumentAndColumnStruct(documentResource, documentId, columnStructId);

    return toColumnStructDetail(erdBudget, columnStruct);
};

// ==================== create-column-struct ====================

const descriptionCreateColumnStruct = `\
Creates a new column struct in a specified ERD document.
Column structs represent BigQuery STRUCT (or ARRAY<STRUCT>) type columns.
Only supported for databases with supportsStructType (currently BigQuery).

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnStruct: An object containing the column struct information:
  - columnName: Object containing names:
    - physical: The physical name of the struct field (required).
    - logical: (optional) The logical name of the struct field.
  - isArray: (optional) Boolean indicating if this struct is repeated (ARRAY<STRUCT<...>>). Default: false.
  - notNull: (optional) Boolean indicating if this struct field is NOT NULL. Default: false.
  - columns: An array of member references (required, at least one), each one of:
    - { columnId: string }: Reference an existing single column.
    - { columnGroupId: string }: Reference an existing column group.
    - { columnStructId: string }: Reference an existing (nested) column struct.
  - description: (optional) A brief description of the column struct.

RESPONSE:
The created column struct object (same format as column struct detail resource).
`;

const mcpCreateColumnStruct = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof createColumnStructInputSchema> => {
    return [
        "create-column-struct",
        {
            title: "Create a column struct in a specified ERD document",
            description: descriptionCreateColumnStruct,
            inputSchema: createColumnStructInputSchema
        },
        initCallbackForCreateColumnStruct(documentResource)
    ] as const;
};

const createColumnStructInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnStruct: z.object({
        columnName: z.object({
            physical: z.string().describe("The physical name of the struct field."),
            logical: z.string().optional().describe("The logical name of the struct field.")
        }).describe("The names for the new column struct."),
        isArray: z.boolean().optional().describe("Whether this struct is repeated (ARRAY<STRUCT<...>>)."),
        notNull: z.boolean().optional().describe("Whether this struct field has a NOT NULL constraint."),
        columns: z.array(columnEntryRefSchema).min(1, "At least one member must be specified.")
            .describe("The member references (columns, column groups, or nested column structs) of this struct."),
        description: z.string().optional().describe("A brief description of the column struct.")
    }).strict().describe("The column struct information.")
};

const initCallbackForCreateColumnStruct = (
    documentResource: DocumentResource
): ToolCallback<typeof createColumnStructInputSchema> => {
    return async ({ documentId, columnStruct: structInput }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        validateSupportsStructType(previousDocument);

        const columns = toColumnEntries(previousDocument, structInput.columns);

        const newStruct = new ColumnStructModel({
            physicalName: structInput.columnName.physical,
            logicalName: structInput.columnName.logical ?? "",
            isArray: structInput.isArray ?? false,
            notNull: structInput.notNull ?? false,
            columns: columns,
            description: structInput.description ?? ""
        });

        validateNoStructCycle(previousDocument, newStruct);

        const nextDocument = previousDocument.updateColumnStruct(newStruct, []);
        documentResource.notify(documentId, nextDocument);

        const response = toColumnStructDetail(erdBudget, newStruct);

        return initToolJsonResponse(response);
    };
};

// ==================== update-column-struct ====================

const descriptionUpdateColumnStruct = `\
Updates an existing column struct in a specified ERD document.
Only the specified fields will be updated; unspecified fields remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnStructId: The unique identifier of the column struct to update.
  Can be obtained by calling the 'list-column-structs' tool.
- columnStruct: An object containing the fields to update (all optional):
  - columnName: Object containing names to update:
    - physical: The new physical name of the struct field.
    - logical: The new logical name of the struct field.
  - isArray: Whether this struct is repeated (ARRAY<STRUCT<...>>).
  - notNull: Whether this struct field has a NOT NULL constraint.
  - columns: The new member references, replacing the current member list entirely.
  - description: A brief description of the column struct.

RESPONSE:
The updated column struct object (same format as column struct detail resource).
`;

const mcpUpdateColumnStruct = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateColumnStructInputSchema> => {
    return [
        "update-column-struct",
        {
            title: "Update a column struct in a specified ERD document",
            description: descriptionUpdateColumnStruct,
            inputSchema: updateColumnStructInputSchema
        },
        initCallbackForUpdateColumnStruct(documentResource)
    ] as const;
};

const updateColumnStructInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnStructId: z.string().describe("The unique identifier of the column struct to update."),
    columnStruct: z.object({
        columnName: z.object({
            physical: z.string().optional().describe("The new physical name of the struct field."),
            logical: z.string().optional().describe("The new logical name of the struct field.")
        }).optional().describe("The names to update for the column struct."),
        isArray: z.boolean().optional().describe("Whether this struct is repeated (ARRAY<STRUCT<...>>)."),
        notNull: z.boolean().optional().describe("Whether this struct field has a NOT NULL constraint."),
        columns: z.array(columnEntryRefSchema).min(1, "At least one member must be specified.").optional()
            .describe("The new member references, replacing the current member list entirely."),
        description: z.string().optional().describe("A brief description of the column struct.")
    }).strict().describe("The column struct fields to update.")
};

const initCallbackForUpdateColumnStruct = (
    documentResource: DocumentResource
): ToolCallback<typeof updateColumnStructInputSchema> => {
    return async ({ documentId, columnStructId, columnStruct: structInput }) => {
        const { erdBudget, erdDocument: previousDocument, columnStruct: previousStruct } =
            doFindDocumentAndColumnStruct(documentResource, documentId, columnStructId);
        validateSupportsStructType(previousDocument);

        const nextColumns = (structInput.columns != null)
            ? toColumnEntries(previousDocument, structInput.columns)
            : previousStruct.columns;

        const nextStruct = new ColumnStructModel({
            columnStructId: previousStruct.columnStructId,
            physicalName: structInput.columnName?.physical ?? previousStruct.physicalName,
            logicalName: structInput.columnName?.logical ?? previousStruct.logicalName,
            isArray: structInput.isArray ?? previousStruct.isArray,
            notNull: structInput.notNull ?? previousStruct.notNull,
            columns: nextColumns,
            description: structInput.description ?? previousStruct.description
        });

        validateNoStructCycle(previousDocument, nextStruct);

        const nextDocument = previousDocument.updateColumnStruct(nextStruct, []);
        documentResource.notify(documentId, nextDocument);

        const response = toColumnStructDetail(erdBudget, nextStruct);

        return initToolJsonResponse(response);
    };
};

// ==================== delete-column-struct ====================

const descriptionDeleteColumnStruct = `\
Deletes an existing column struct from a specified ERD document.
This will also remove the entry from any table's columns that reference this struct,
and clean up member columns and struct references that become dangling as a result.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnStructId: The unique identifier of the column struct to delete.
  Can be obtained by calling the 'list-column-structs' tool.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteColumnStruct = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteColumnStructInputSchema> => {
    return [
        "delete-column-struct",
        {
            title: "Delete a column struct from a specified ERD document",
            description: descriptionDeleteColumnStruct,
            inputSchema: deleteColumnStructInputSchema
        },
        initCallbackForDeleteColumnStruct(documentResource)
    ] as const;
};

const deleteColumnStructInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnStructId: z.string().describe("The unique identifier of the column struct to delete.")
};

const initCallbackForDeleteColumnStruct = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteColumnStructInputSchema> => {
    return async ({ documentId, columnStructId }) => {
        const { erdDocument: previousDocument } =
            doFindDocumentAndColumnStruct(documentResource, documentId, columnStructId);

        const nextDocument = previousDocument.deleteColumnStruct(columnStructId);
        documentResource.notify(documentId, nextDocument);

        return initToolJsonResponse({ success: true });
    };
};

// ==================== add-column-struct-to-table ====================

const structPositionSchema = initPositionSchema("column", z.union([
    z.object({ columnId: z.string().describe("The column ID to add the new struct near.") }),
    z.object({ columnGroupId: z.string().describe("The column group ID to add the new struct near.") }),
    z.object({ columnStructId: z.string().describe("The column struct ID to add the new struct near.") })
]));

type StructPositionType = Parameters<
    typeof calculateIndexFromPosition<"columnId" | "columnGroupId" | "columnStructId">
>[0];

const descriptionAddColumnStructToTable = `\
Adds an existing column struct entry to a table's column list in a specified ERD document.
The column struct itself must already exist (create it first with 'create-column-struct').
A struct can only be added once per table.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to add the struct entry to.
  Can be obtained by calling the 'list-tables' tool.
- columnStructId: The unique identifier of the column struct to add.
  Can be obtained by calling the 'list-column-structs' tool.
- position: The position to add the struct entry at (required). One of:
  - { type: "start" }: Add at the beginning of the column list.
  - { type: "end" }: Add at the end of the column list.
  - { type: "before", columnId: string }: Add before the specified column.
  - { type: "before", columnGroupId: string }: Add before the specified column group.
  - { type: "before", columnStructId: string }: Add before the specified column struct entry.
  - { type: "after", columnId: string }: Add after the specified column.
  - { type: "after", columnGroupId: string }: Add after the specified column group.
  - { type: "after", columnStructId: string }: Add after the specified column struct entry.
  - { type: "index", index: number }: Add at the specified zero-based index.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- name: The physical name of the table.
- mimeType: "application/json"
`;

const mcpAddColumnStructToTable = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof addColumnStructToTableInputSchema> => {
    return [
        "add-column-struct-to-table",
        {
            title: "Add a column struct entry to a table in a specified ERD document",
            description: descriptionAddColumnStructToTable,
            inputSchema: addColumnStructToTableInputSchema
        },
        initCallbackForAddColumnStructToTable(documentResource)
    ] as const;
};

const addColumnStructToTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to update."),
    columnStructId: z.string().describe("The unique identifier of the column struct to add to the table."),
    ...structPositionSchema
};

const initCallbackForAddColumnStructToTable = (
    documentResource: DocumentResource
): ToolCallback<typeof addColumnStructToTableInputSchema> => {
    return async ({ documentId, tableId, columnStructId, position }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);
        validateSupportsStructType(previousDocument);

        const columnStruct = previousDocument.findColumnStructModel(columnStructId);
        if (columnStruct == null) {
            const url = new URL(erdBudget.columnStructUri(columnStructId));
            throw initResourceNotFound(url);
        }

        const previousColumns = previousTableView.tableModel.columns;
        const alreadyAdded = previousColumns.some(column =>
            (column.modelType === "struct") && (column.columnStructId === columnStructId));
        if (alreadyAdded) {
            throw initInvalidParams(`Column struct is already added to the table: ${columnStructId}`);
        }

        const nextColumns = [...previousColumns];
        const addIndex = calculateStructTargetIndex(nextColumns, position as StructPositionType);

        nextColumns.splice(addIndex, 0, { modelType: "struct" as const, columnStructId });

        const updatingTable = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTableView.tableModel,
                columns: nextColumns
            })
        });

        const nextDocument = previousDocument.updateTableMeta(updatingTable);
        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.tableUri(updatingTable.tableId),
                    name: updatingTable.tableModel.physicalName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

const calculateStructTargetIndex = (
    columns: readonly ColumnModelType[], position: StructPositionType
): number => {
    if ("columnId" in position) {
        const columnIdToIndex = (columnId: string) => columns
            .findIndex(column => (column.modelType === "single") && (column.columnModelId === columnId));
        return calculateIndexFromPosition(position, "columnId", columnIdToIndex, columns.length);
    }

    if ("columnGroupId" in position) {
        const columnGroupIdToIndex = (columnGroupId: string) => columns
            .findIndex(column => (column.modelType === "group") && (column.columnGroupId === columnGroupId));
        return calculateIndexFromPosition(position, "columnGroupId", columnGroupIdToIndex, columns.length);
    }

    if ("columnStructId" in position) {
        const columnStructIdToIndex = (columnStructId: string) => columns
            .findIndex(column => (column.modelType === "struct") && (column.columnStructId === columnStructId));
        return calculateIndexFromPosition(position, "columnStructId", columnStructIdToIndex, columns.length);
    }

    return calculateIndexFromPosition(position, "columnId", () => null, columns.length);
};

// ==================== remove-column-struct-from-table ====================

const descriptionRemoveColumnStructFromTable = `\
Removes a column struct entry from a table's column list in a specified ERD document.
The column struct model itself is not deleted and can be reused or re-added later.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to remove the struct entry from.
  Can be obtained by calling the 'list-tables' tool.
- columnStructId: The unique identifier of the column struct entry to remove from the table.
  Note: If the struct is not present in the table, it is silently ignored.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- name: The physical name of the table.
- mimeType: "application/json"
`;

const mcpRemoveColumnStructFromTable = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof removeColumnStructFromTableInputSchema> => {
    return [
        "remove-column-struct-from-table",
        {
            title: "Remove a column struct entry from a table in a specified ERD document",
            description: descriptionRemoveColumnStructFromTable,
            inputSchema: removeColumnStructFromTableInputSchema
        },
        initCallbackForRemoveColumnStructFromTable(documentResource)
    ] as const;
};

const removeColumnStructFromTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to update."),
    columnStructId: z.string().describe("The unique identifier of the column struct entry to remove from the table.")
};

const initCallbackForRemoveColumnStructFromTable = (
    documentResource: DocumentResource
): ToolCallback<typeof removeColumnStructFromTableInputSchema> => {
    return async ({ documentId, tableId, columnStructId }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const nextColumns = previousTableView.tableModel.columns
            .filter(column => (column.modelType !== "struct") || (column.columnStructId !== columnStructId));

        const updatingTable = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTableView.tableModel,
                columns: nextColumns
            })
        });

        const nextDocument = previousDocument.updateTableMeta(updatingTable);
        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.tableUri(updatingTable.tableId),
                    name: updatingTable.tableModel.physicalName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

// ==================== shared helpers ====================

const validateSupportsStructType = (erdDocument: ErdDocument): void => {
    const database = erdDocument.getDatabase();
    if (database.supportsStructType === false) {
        throw initInvalidParams(`Struct type is not supported by the database : ${database.name}`);
    }
};

const toColumnEntries = (
    erdDocument: ErdDocument, refs: z.infer<typeof columnEntryRefSchema>[]
): ColumnModelType[] => {
    return refs.map(ref => {
        if ("columnId" in ref) {
            const column = erdDocument.findColumnModel(ref.columnId);
            if (column == null) {
                throw initInvalidParams(`Column not found: ${ref.columnId}`);
            }
            return { modelType: "single" as const, columnModelId: ref.columnId };
        }

        if ("columnGroupId" in ref) {
            const columnGroup = erdDocument.findColumnGroupModel(ref.columnGroupId);
            if (columnGroup == null) {
                throw initInvalidParams(`Column group not found: ${ref.columnGroupId}`);
            }
            return { modelType: "group" as const, columnGroupId: ref.columnGroupId };
        }

        const columnStruct = erdDocument.findColumnStructModel(ref.columnStructId);
        if (columnStruct == null) {
            throw initInvalidParams(`Column struct not found: ${ref.columnStructId}`);
        }
        return { modelType: "struct" as const, columnStructId: ref.columnStructId };
    });
};

/**
 * updatingStruct を適用した場合に、struct 参照の循環 (自己参照・間接循環) が生じないかを検証する。
 * ネスト深さの妥当性チェックは行わない。
 *
 * @param erdDocument 現在のドキュメント (updatingStruct 適用前)
 * @param updatingStruct 検証対象の struct (作成・更新後の状態)
 */
const validateNoStructCycle = (erdDocument: ErdDocument, updatingStruct: ColumnStructModel): void => {
    const structId = findStructCycle(erdDocument, updatingStruct);
    if (structId != null) {
        throw initInvalidParams(`Circular struct reference detected involving columnStructId: ${structId}`);
    }
};

/**
 * updatingStruct を起点に、struct 参照を DFS で辿り循環を検出する。
 *
 * @param erdDocument 現在のドキュメント (updatingStruct 適用前)
 * @param updatingStruct 検証対象の struct (作成・更新後の状態)
 * @returns 循環を構成する columnStructId (updatingStruct 自身の ID を含む)。循環がなければ null
 */
const findStructCycle = (erdDocument: ErdDocument, updatingStruct: ColumnStructModel): string | null => {
    const visiting = new Set<string>();

    const resolveStruct = (columnStructId: string): ColumnStructModel | null => {
        if (columnStructId === updatingStruct.columnStructId) {
            return updatingStruct;
        }
        return erdDocument.findColumnStructModel(columnStructId);
    };

    const visit = (columnStructId: string): boolean => {
        if (visiting.has(columnStructId)) {
            return true;
        }

        const structModel = resolveStruct(columnStructId);
        if (structModel == null) {
            return false;
        }

        visiting.add(columnStructId);
        const hasCycle = structModel.columns.some(column =>
            (column.modelType === "struct") && visit(column.columnStructId));
        visiting.delete(columnStructId);

        return hasCycle;
    };

    return visit(updatingStruct.columnStructId) ? updatingStruct.columnStructId : null;
};

const doFindDocumentAndColumnStruct = (
    documentResource: DocumentResource, documentId: string, columnStructId: string
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    const columnStruct = erdDocument.findColumnStructModel(columnStructId);
    if (columnStruct == null) {
        const url = new URL(erdBudget.columnStructUri(columnStructId));
        throw initResourceNotFound(url);
    }

    return { erdBudget, erdDocument, columnStruct };
};

const toColumnStructDetail = (erdBudget: DocumentBudget, structModel: ColumnStructModel) => {
    const columns = structModel.columns.map(column => toColumnEntrySummary(erdBudget, column));

    return {
        uri: erdBudget.columnStructUri(structModel.columnStructId),
        columnStructId: structModel.columnStructId,
        columnName: {
            physical: structModel.physicalName,
            ...((structModel.logicalName !== "") && { logical: structModel.logicalName })
        },
        isArray: structModel.isArray,
        notNull: structModel.notNull,
        columns: columns,
        description: structModel.description
    };
};

const toColumnEntrySummary = (erdBudget: DocumentBudget, column: ColumnModelType) => {
    if (column.modelType === "group") {
        return {
            modelType: "group" as const,
            uri: erdBudget.columnGroupUri(column.columnGroupId),
            columnGroupId: column.columnGroupId
        };
    }

    if (column.modelType === "struct") {
        return {
            modelType: "struct" as const,
            uri: erdBudget.columnStructUri(column.columnStructId),
            columnStructId: column.columnStructId
        };
    }

    return {
        modelType: "single" as const,
        uri: erdBudget.columnUri(column.columnModelId),
        columnId: column.columnModelId
    };
};
