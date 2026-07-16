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
import ColumnEntry from "~/models/database/ColumnEntry";
import ColumnModel from "~/models/database/ColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

export const mcpRegisterStructColumnShare = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListStructColumnSharesResource(documentResource),
            mcpFindStructColumnShareResource(documentResource)
        ],
        tools: [
            mcpListStructColumnSharesTool(documentResource),
            mcpFindStructColumnShareTool(documentResource),
            mcpCreateStructColumnShare(documentResource),
            mcpUpdateStructColumnShare(documentResource),
            mcpDeleteStructColumnShare(documentResource),
            mcpAddStructColumnShareToTable(documentResource),
            mcpRemoveStructColumnShareFromTable(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== shared schemas ====================

const columnEntryRefSchema = z.union([
    z.object({ columnId: z.string() }).strict()
        .describe("Reference an existing single column by its columnId."),
    z.object({ columnGroupId: z.string() }).strict()
        .describe("Reference an existing column group by its columnGroupId."),
    z.object({ structColumnShareModelId: z.string() }).strict()
        .describe("Reference an existing (nested) struct column share by its structColumnShareModelId.")
]);

const responseStructColumnShareDetail = `\
- uri: The unique URI of the struct column share (format: erd-designer://documents/{documentId}/struct_column_shares/{structColumnShareModelId}).
- structColumnShareModelId: The unique identifier of the struct column share (auto-generated UUID).
- columnName: Object containing physical and logical names of the struct field.
- isArray: Boolean indicating if this struct is repeated (ARRAY<STRUCT<...>>).
- columns: Array of member entries in this struct, each containing:
  - modelType: Either "single", "group", or "struct".
  - uri: The URI to access the referenced resource.
  - columnId / columnGroupId: The identifier of the referenced resource (for "single" / "group").
  - For a nested struct member, modelType is "struct" and the entry contains columnId (the wrapper column
    holding this member), structColumnShareModelId (the referenced nested struct), and uri (the nested struct URI).
- description: A brief description of the struct column share (may be empty string).\
`;

// ==================== list-struct-column-shares ====================

const descriptionList = `\
Retrieves a list of struct column shares from the specified ERD document.
Struct column shares represent BigQuery STRUCT (or ARRAY<STRUCT>) type columns, whose members are
single columns, column groups, or other (nested) struct column shares.
Only supported for databases with supportsStructType (currently BigQuery).

REQUEST:
- documentId: The unique identifier of the ERD document whose struct column shares are to be listed.
  Can be obtained by calling the 'list-documents' tool.

RESPONSE:
An array of struct column share objects (summary form), each containing:
${responseStructColumnShareDetail}
`;

const mcpListStructColumnSharesResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-struct-column-shares",
        new ResourceTemplate(uriTemplates.structColumnShares, { list: undefined }),
        {
            title: "List struct column shares of a specified ERD document",
            description: descriptionList
        },
        initResourceCallbackForListStructColumnShares(documentResource)
    ] as const;
};

const initResourceCallbackForListStructColumnShares = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const responses = listStructColumnShareResponses(documentResource, documentId);

        return initResourceResponse(url, responses);
    };
};

const listStructColumnSharesInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID)
};

const mcpListStructColumnSharesTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof listStructColumnSharesInputSchema> => {
    return [
        "list-struct-column-shares",
        {
            title: "List struct column shares of a specified ERD document",
            description: descriptionList,
            inputSchema: listStructColumnSharesInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListStructColumnShares(documentResource)
    ] as const;
};

const initCallbackForListStructColumnShares = (
    documentResource: DocumentResource
): ToolCallback<typeof listStructColumnSharesInputSchema> => {
    return async ({ documentId }) => {
        const responses = listStructColumnShareResponses(documentResource, documentId);
        return initToolJsonResponse(responses);
    };
};

const listStructColumnShareResponses = (documentResource: DocumentResource, documentId: string) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    return erdDocument.getStructColumnShareModels()
        .map(structModel => toStructColumnShareDetail(erdBudget, erdDocument, structModel));
};

// ==================== find-struct-column-share ====================

const descriptionFind = `\
Retrieves detailed information about a specific struct column share from the specified ERD document using its structColumnShareModelId.

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- structColumnShareModelId: The unique identifier of the struct column share to retrieve.
  Can be obtained by calling the 'list-struct-column-shares' tool or from a table's columnDefinitions array.

RESPONSE:
An object containing detailed information about the specified struct column share:
${responseStructColumnShareDetail}
`;

const mcpFindStructColumnShareResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-struct-column-share",
        new ResourceTemplate(uriTemplates.structColumnShareDetail, { list: undefined }),
        {
            title: "Find a struct column share of a specified ERD document",
            description: descriptionFind
        },
        initResourceCallbackForFindStructColumnShare(documentResource)
    ] as const;
};

const initResourceCallbackForFindStructColumnShare = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const structColumnShareModelId = variables.structColumnShareModelId as string;
        const response = findStructColumnShareResponse(documentResource, documentId, structColumnShareModelId);

        return initResourceResponse(url, response);
    };
};

const findStructColumnShareInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    structColumnShareModelId: z.string().describe("The unique identifier of the struct column share to retrieve.")
};

const mcpFindStructColumnShareTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findStructColumnShareInputSchema> => {
    return [
        "find-struct-column-share",
        {
            title: "Find a struct column share of a specified ERD document",
            description: descriptionFind,
            inputSchema: findStructColumnShareInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindStructColumnShare(documentResource)
    ] as const;
};

const initCallbackForFindStructColumnShare = (
    documentResource: DocumentResource
): ToolCallback<typeof findStructColumnShareInputSchema> => {
    return async ({ documentId, structColumnShareModelId }) => {
        const response = findStructColumnShareResponse(documentResource, documentId, structColumnShareModelId);
        return initToolJsonResponse(response);
    };
};

const findStructColumnShareResponse = (
    documentResource: DocumentResource, documentId: string, structColumnShareModelId: string
) => {
    const { erdBudget, erdDocument, structColumnShare } =
        doFindDocumentAndStructColumnShare(documentResource, documentId, structColumnShareModelId);

    return toStructColumnShareDetail(erdBudget, erdDocument, structColumnShare);
};

// ==================== create-struct-column-share ====================

const descriptionCreateStructColumnShare = `\
Creates a new struct column share in a specified ERD document.
Struct column shares represent BigQuery STRUCT (or ARRAY<STRUCT>) type columns.
Only supported for databases with supportsStructType (currently BigQuery).

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- structColumnShare: An object containing the struct column share information:
  - columnName: Object containing names:
    - physical: The physical name of the struct field (required).
    - logical: (optional) The logical name of the struct field.
  - isArray: (optional) Boolean indicating if this struct is repeated (ARRAY<STRUCT<...>>). Default: false.
  - columns: An array of member references (required, at least one), each one of:
    - { columnId: string }: Reference an existing single column.
    - { columnGroupId: string }: Reference an existing column group.
    - { structColumnShareModelId: string }: Reference an existing (nested) struct column share.
  - description: (optional) A brief description of the struct column share.

RESPONSE:
The created struct column share object (same format as struct column share detail resource).
`;

const mcpCreateStructColumnShare = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof createStructColumnShareInputSchema> => {
    return [
        "create-struct-column-share",
        {
            title: "Create a struct column share in a specified ERD document",
            description: descriptionCreateStructColumnShare,
            inputSchema: createStructColumnShareInputSchema
        },
        initCallbackForCreateStructColumnShare(documentResource)
    ] as const;
};

const createStructColumnShareInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    structColumnShare: z.object({
        columnName: z.object({
            physical: z.string().describe("The physical name of the struct field."),
            logical: z.string().optional().describe("The logical name of the struct field.")
        }).describe("The names for the new struct column share."),
        isArray: z.boolean().optional().describe("Whether this struct is repeated (ARRAY<STRUCT<...>>)."),
        columns: z.array(columnEntryRefSchema).min(1, "At least one member must be specified.")
            .describe("The member references (columns, column groups, or nested struct column shares) of this struct."),
        description: z.string().optional().describe("A brief description of the struct column share.")
    }).strict().describe("The struct column share information.")
};

const initCallbackForCreateStructColumnShare = (
    documentResource: DocumentResource
): ToolCallback<typeof createStructColumnShareInputSchema> => {
    return async ({ documentId, structColumnShare: structInput }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        validateSupportsStructType(previousDocument);

        const { columnEntries, addingWrapperColumns } =
            buildStructMemberEntries(previousDocument, structInput.columns);

        const newStruct = new StructColumnShareModel({
            physicalName: structInput.columnName.physical,
            logicalName: structInput.columnName.logical ?? "",
            isArray: structInput.isArray ?? false,
            columnEntries: columnEntries,
            description: structInput.description ?? ""
        });

        validateNoStructCycle(previousDocument, newStruct, addingWrapperColumns);

        const nextDocument = previousDocument
            .updateColumnModels(addingWrapperColumns, [])
            .updateStructColumnShare(newStruct);
        documentResource.notify(documentId, nextDocument);

        const response = toStructColumnShareDetail(erdBudget, nextDocument, newStruct);

        return initToolJsonResponse(response);
    };
};

// ==================== update-struct-column-share ====================

const descriptionUpdateStructColumnShare = `\
Updates an existing struct column share in a specified ERD document.
Only the specified fields will be updated; unspecified fields remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- structColumnShareModelId: The unique identifier of the struct column share to update.
  Can be obtained by calling the 'list-struct-column-shares' tool.
- structColumnShare: An object containing the fields to update (all optional):
  - columnName: Object containing names to update:
    - physical: The new physical name of the struct field.
    - logical: The new logical name of the struct field.
  - isArray: Whether this struct is repeated (ARRAY<STRUCT<...>>).
  - columns: The new member references, replacing the current member list entirely.
  - description: A brief description of the struct column share.

RESPONSE:
The updated struct column share object (same format as struct column share detail resource).
`;

const mcpUpdateStructColumnShare = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateStructColumnShareInputSchema> => {
    return [
        "update-struct-column-share",
        {
            title: "Update a struct column share in a specified ERD document",
            description: descriptionUpdateStructColumnShare,
            inputSchema: updateStructColumnShareInputSchema
        },
        initCallbackForUpdateStructColumnShare(documentResource)
    ] as const;
};

const updateStructColumnShareInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    structColumnShareModelId: z.string().describe("The unique identifier of the struct column share to update."),
    structColumnShare: z.object({
        columnName: z.object({
            physical: z.string().optional().describe("The new physical name of the struct field."),
            logical: z.string().optional().describe("The new logical name of the struct field.")
        }).optional().describe("The names to update for the struct column share."),
        isArray: z.boolean().optional().describe("Whether this struct is repeated (ARRAY<STRUCT<...>>)."),
        columns: z.array(columnEntryRefSchema).min(1, "At least one member must be specified.").optional()
            .describe("The new member references, replacing the current member list entirely."),
        description: z.string().optional().describe("A brief description of the struct column share.")
    }).strict().describe("The struct column share fields to update.")
};

const initCallbackForUpdateStructColumnShare = (
    documentResource: DocumentResource
): ToolCallback<typeof updateStructColumnShareInputSchema> => {
    return async ({ documentId, structColumnShareModelId, structColumnShare: structInput }) => {
        const { erdBudget, erdDocument: previousDocument, structColumnShare: previousStruct } =
            doFindDocumentAndStructColumnShare(documentResource, documentId, structColumnShareModelId);
        validateSupportsStructType(previousDocument);

        const memberEntries = (structInput.columns != null)
            ? buildStructMemberEntries(previousDocument, structInput.columns)
            : { columnEntries: previousStruct.columnEntries, addingWrapperColumns: [] as StructColumnModel[] };

        const nextStruct = new StructColumnShareModel({
            structShareModelId: previousStruct.structShareModelId,
            physicalName: structInput.columnName?.physical ?? previousStruct.physicalName,
            logicalName: structInput.columnName?.logical ?? previousStruct.logicalName,
            isArray: structInput.isArray ?? previousStruct.isArray,
            columnEntries: memberEntries.columnEntries,
            description: structInput.description ?? previousStruct.description
        });

        validateNoStructCycle(previousDocument, nextStruct, memberEntries.addingWrapperColumns);

        const nextDocument = previousDocument
            .updateColumnModels(memberEntries.addingWrapperColumns, [])
            .updateStructColumnShare(nextStruct);
        documentResource.notify(documentId, nextDocument);

        const response = toStructColumnShareDetail(erdBudget, nextDocument, nextStruct);

        return initToolJsonResponse(response);
    };
};

// ==================== delete-struct-column-share ====================

const descriptionDeleteStructColumnShare = `\
Deletes an existing struct column share from a specified ERD document.
This will also remove the entry from any table's columns that reference this struct,
and clean up member columns and struct references that become dangling as a result.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- structColumnShareModelId: The unique identifier of the struct column share to delete.
  Can be obtained by calling the 'list-struct-column-shares' tool.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteStructColumnShare = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteStructColumnShareInputSchema> => {
    return [
        "delete-struct-column-share",
        {
            title: "Delete a struct column share from a specified ERD document",
            description: descriptionDeleteStructColumnShare,
            inputSchema: deleteStructColumnShareInputSchema
        },
        initCallbackForDeleteStructColumnShare(documentResource)
    ] as const;
};

const deleteStructColumnShareInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    structColumnShareModelId: z.string().describe("The unique identifier of the struct column share to delete.")
};

const initCallbackForDeleteStructColumnShare = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteStructColumnShareInputSchema> => {
    return async ({ documentId, structColumnShareModelId }) => {
        const { erdDocument: previousDocument } =
            doFindDocumentAndStructColumnShare(documentResource, documentId, structColumnShareModelId);

        const nextDocument = previousDocument.deleteStructColumnShare(structColumnShareModelId);
        documentResource.notify(documentId, nextDocument);

        return initToolJsonResponse({ success: true });
    };
};

// ==================== add-struct-column-to-table ====================

const structPositionSchema = initPositionSchema("column", z.union([
    z.object({ columnId: z.string().describe("The column ID to add the new struct near.") }),
    z.object({ columnGroupId: z.string().describe("The column group ID to add the new struct near.") }),
    z.object({ structColumnShareModelId: z.string().describe("The struct column share ID to add the new struct near.") })
]));

type StructPositionType = Parameters<
    typeof calculateIndexFromPosition<"columnId" | "columnGroupId" | "structColumnShareModelId">
>[0];

const descriptionAddStructColumnShareToTable = `\
Adds an existing struct column share entry to a table's column list in a specified ERD document.
The struct column share itself must already exist (create it first with 'create-struct-column-share').
A struct can only be added once per table.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to add the struct entry to.
  Can be obtained by calling the 'list-tables' tool.
- structColumnShareModelId: The unique identifier of the struct column share to add.
  Can be obtained by calling the 'list-struct-column-shares' tool.
- position: The position to add the struct entry at (required). One of:
  - { type: "start" }: Add at the beginning of the column list.
  - { type: "end" }: Add at the end of the column list.
  - { type: "before", columnId: string }: Add before the specified column.
  - { type: "before", columnGroupId: string }: Add before the specified column group.
  - { type: "before", structColumnShareModelId: string }: Add before the specified struct column share entry.
  - { type: "after", columnId: string }: Add after the specified column.
  - { type: "after", columnGroupId: string }: Add after the specified column group.
  - { type: "after", structColumnShareModelId: string }: Add after the specified struct column share entry.
  - { type: "index", index: number }: Add at the specified zero-based index.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- name: The physical name of the table.
- mimeType: "application/json"
`;

const mcpAddStructColumnShareToTable = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof addStructColumnShareToTableInputSchema> => {
    return [
        "add-struct-column-to-table",
        {
            title: "Add a struct column share entry to a table in a specified ERD document",
            description: descriptionAddStructColumnShareToTable,
            inputSchema: addStructColumnShareToTableInputSchema
        },
        initCallbackForAddStructColumnShareToTable(documentResource)
    ] as const;
};

const addStructColumnShareToTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to update."),
    structColumnShareModelId: z.string().describe("The unique identifier of the struct column share to add to the table."),
    ...structPositionSchema
};

const initCallbackForAddStructColumnShareToTable = (
    documentResource: DocumentResource
): ToolCallback<typeof addStructColumnShareToTableInputSchema> => {
    return async ({ documentId, tableId, structColumnShareModelId, position }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);
        validateSupportsStructType(previousDocument);

        const structColumnShare = previousDocument.findStructColumnShareModel(structColumnShareModelId);
        if (structColumnShare == null) {
            const url = new URL(erdBudget.structColumnShareUri(structColumnShareModelId));
            throw initResourceNotFound(url);
        }

        const previousColumns = previousTableView.tableModel.columnEntries;
        const alreadyAdded = previousColumns.some(column => {
            if (column.modelType !== "single") {
                return false;
            }
            const columnModel = previousDocument.findColumnModel(column.columnModelId);
            return (columnModel != null) && (columnModel.entityType === "struct")
                && (columnModel.structShareModelId === structColumnShareModelId);
        });
        if (alreadyAdded) {
            throw initInvalidParams(`Struct column share is already added to the table: ${structColumnShareModelId}`);
        }

        const wrapperColumn = new StructColumnModel({ structShareModelId: structColumnShareModelId });

        const nextColumns = [...previousColumns];
        const addIndex = calculateStructTargetIndex(previousDocument, nextColumns, position as StructPositionType);

        nextColumns.splice(addIndex, 0, { modelType: "single" as const, columnModelId: wrapperColumn.columnModelId });

        const documentWithWrapper = previousDocument.updateColumnModels([wrapperColumn], []);

        const updatingTable = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTableView.tableModel,
                columnEntries: nextColumns
            })
        });

        const nextDocument = documentWithWrapper.updateTableMeta(updatingTable);
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
    erdDocument: ErdDocument, columns: readonly ColumnEntry[], position: StructPositionType
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

    if ("structColumnShareModelId" in position) {
        const structColumnShareModelIdToIndex = (structColumnShareModelId: string) => columns
            .findIndex(column => {
                if (column.modelType !== "single") {
                    return false;
                }
                const columnModel = erdDocument.findColumnModel(column.columnModelId);
                return (columnModel != null) && (columnModel.entityType === "struct")
                    && (columnModel.structShareModelId === structColumnShareModelId);
            });
        return calculateIndexFromPosition(position, "structColumnShareModelId", structColumnShareModelIdToIndex, columns.length);
    }

    return calculateIndexFromPosition(position, "columnId", () => null, columns.length);
};

// ==================== remove-struct-column-from-table ====================

const descriptionRemoveStructColumnShareFromTable = `\
Removes a struct column share entry from a table's column list in a specified ERD document.
The struct column share model itself is not deleted and can be reused or re-added later.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- tableId: The unique identifier of the table to remove the struct entry from.
  Can be obtained by calling the 'list-tables' tool.
- structColumnShareModelId: The unique identifier of the struct column share entry to remove from the table.
  Note: If the struct is not present in the table, it is silently ignored.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated table (format: erd-designer://documents/{documentId}/tables/{tableId}).
- name: The physical name of the table.
- mimeType: "application/json"
`;

const mcpRemoveStructColumnShareFromTable = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof removeStructColumnShareFromTableInputSchema> => {
    return [
        "remove-struct-column-from-table",
        {
            title: "Remove a struct column share entry from a table in a specified ERD document",
            description: descriptionRemoveStructColumnShareFromTable,
            inputSchema: removeStructColumnShareFromTableInputSchema
        },
        initCallbackForRemoveStructColumnShareFromTable(documentResource)
    ] as const;
};

const removeStructColumnShareFromTableInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    tableId: z.string().describe("The unique identifier of the table to update."),
    structColumnShareModelId: z.string().describe("The unique identifier of the struct column share entry to remove from the table.")
};

const initCallbackForRemoveStructColumnShareFromTable = (
    documentResource: DocumentResource
): ToolCallback<typeof removeStructColumnShareFromTableInputSchema> => {
    return async ({ documentId, tableId, structColumnShareModelId }) => {
        const { erdBudget, erdDocument: previousDocument, tableView: previousTableView } =
            findDocumentAndTable(documentResource, documentId, tableId);

        const removingWrapperIds = new Set(previousTableView.tableModel.columnEntries
            .flatMap(column => {
                if (column.modelType !== "single") {
                    return [];
                }
                const columnModel = previousDocument.findColumnModel(column.columnModelId);
                if ((columnModel == null) || (columnModel.entityType !== "struct")
                    || (columnModel.structShareModelId !== structColumnShareModelId)) {
                    return [];
                }
                return [column.columnModelId];
            }));

        const nextColumns = previousTableView.tableModel.columnEntries
            .filter(column => (column.modelType !== "single")
                || (removingWrapperIds.has(column.columnModelId) === false));

        const updatingColumnModels = nextColumns.flatMap(column => {
            if (column.modelType !== "single") {
                return [];
            }
            const columnModel = previousDocument.findColumnModel(column.columnModelId);
            return (columnModel != null) ? [columnModel] : [];
        });

        const updatingTable = new TableViewModel({
            ...previousTableView,
            tableModel: new TableModel({
                ...previousTableView.tableModel,
                columnEntries: nextColumns
            })
        });

        const nextDocument = previousDocument.updateTableViewWithColumns(updatingTable, updatingColumnModels);
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

type StructMemberEntries = {
    columnEntries: ColumnEntry[],
    addingWrapperColumns: StructColumnModel[]
};

/**
 * struct メンバー参照 (columnId / columnGroupId / structColumnShareModelId) を、struct 定義の columnEntries に解決する。
 * structColumnShareModelId 参照は struct バリアントのラッパー ColumnModel を生成し、single エントリ + 生成ラッパーを返す。
 *
 * @param erdDocument 現在のドキュメント (ラッパー適用前)
 * @param refs メンバー参照一覧
 * @returns 解決後の columnEntries と、新規生成したラッパー ColumnModel 群
 */
const buildStructMemberEntries = (
    erdDocument: ErdDocument, refs: z.infer<typeof columnEntryRefSchema>[]
): StructMemberEntries => {
    const addingWrapperColumns: StructColumnModel[] = [];

    const columnEntries = refs.map((ref): ColumnEntry => {
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

        const structColumnShare = erdDocument.findStructColumnShareModel(ref.structColumnShareModelId);
        if (structColumnShare == null) {
            throw initInvalidParams(`Struct column share not found: ${ref.structColumnShareModelId}`);
        }

        const wrapperColumn = new StructColumnModel({ structShareModelId: ref.structColumnShareModelId });
        addingWrapperColumns.push(wrapperColumn);

        return { modelType: "single" as const, columnModelId: wrapperColumn.columnModelId };
    });

    return { columnEntries, addingWrapperColumns };
};

/**
 * updatingStruct を適用した場合に、struct 参照の循環 (自己参照・間接循環) が生じないかを検証する。
 * ネスト深さの妥当性チェックは行わない。
 *
 * @param erdDocument 現在のドキュメント (updatingStruct 適用前)
 * @param updatingStruct 検証対象の struct (作成・更新後の状態)
 */
const validateNoStructCycle = (
    erdDocument: ErdDocument, updatingStruct: StructColumnShareModel, addingWrapperColumns: readonly StructColumnModel[]
): void => {
    const structId = findStructCycle(erdDocument, updatingStruct, addingWrapperColumns);
    if (structId != null) {
        throw initInvalidParams(`Circular struct reference detected involving structColumnShareModelId: ${structId}`);
    }
};

/**
 * updatingStruct を起点に、struct 参照を DFS で辿り循環を検出する。
 * struct メンバーは single エントリの ColumnModel を解決 (適用前のためドキュメント + 今回生成ラッパー群の両方から解決)
 * し、struct バリアントなら参照先 struct を辿る。group エントリはメンバー columnModelId を解決して同様に辿る。
 *
 * @param erdDocument 現在のドキュメント (updatingStruct 適用前)
 * @param updatingStruct 検証対象の struct (作成・更新後の状態)
 * @param addingWrapperColumns 今回新規生成したラッパー ColumnModel 群
 * @returns 循環を構成する structColumnShareModelId (updatingStruct 自身の ID を含む)。循環がなければ null
 */
const findStructCycle = (
    erdDocument: ErdDocument, updatingStruct: StructColumnShareModel, addingWrapperColumns: readonly StructColumnModel[]
): string | null => {
    const visiting = new Set<string>();
    const addingWrapperMap = new Map(addingWrapperColumns.map(column => [column.columnModelId, column]));

    const resolveStruct = (structColumnShareModelId: string): StructColumnShareModel | null => {
        if (structColumnShareModelId === updatingStruct.structShareModelId) {
            return updatingStruct;
        }
        return erdDocument.findStructColumnShareModel(structColumnShareModelId);
    };

    const resolveColumn = (columnModelId: string): ColumnModel | null => {
        const addingColumn = addingWrapperMap.get(columnModelId);
        if (addingColumn != null) {
            return addingColumn;
        }
        return erdDocument.findColumnModel(columnModelId);
    };

    const nestedStructIdsOf = (structModel: StructColumnShareModel): string[] => {
        return structModel.columnEntries.flatMap(column => {
            if (column.modelType === "single") {
                const columnModel = resolveColumn(column.columnModelId);
                return ((columnModel != null) && (columnModel.entityType === "struct"))
                    ? [columnModel.structShareModelId] : [];
            }

            const columnGroup = erdDocument.findColumnGroupModel(column.columnGroupId);
            if (columnGroup == null) {
                return [];
            }

            return columnGroup.columnModelIds.flatMap(memberColumnId => {
                const memberColumn = resolveColumn(memberColumnId);
                return ((memberColumn != null) && (memberColumn.entityType === "struct"))
                    ? [memberColumn.structShareModelId] : [];
            });
        });
    };

    const visit = (structColumnShareModelId: string): boolean => {
        if (visiting.has(structColumnShareModelId)) {
            return true;
        }

        const structModel = resolveStruct(structColumnShareModelId);
        if (structModel == null) {
            return false;
        }

        visiting.add(structColumnShareModelId);
        const hasCycle = nestedStructIdsOf(structModel).some(nestedStructId => visit(nestedStructId));
        visiting.delete(structColumnShareModelId);

        return hasCycle;
    };

    return visit(updatingStruct.structShareModelId) ? updatingStruct.structShareModelId : null;
};

const doFindDocumentAndStructColumnShare = (
    documentResource: DocumentResource, documentId: string, structColumnShareModelId: string
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    const structColumnShare = erdDocument.findStructColumnShareModel(structColumnShareModelId);
    if (structColumnShare == null) {
        const url = new URL(erdBudget.structColumnShareUri(structColumnShareModelId));
        throw initResourceNotFound(url);
    }

    return { erdBudget, erdDocument, structColumnShare };
};

const toStructColumnShareDetail = (
    erdBudget: DocumentBudget, erdDocument: ErdDocument, structModel: StructColumnShareModel
) => {
    const columns = structModel.columnEntries.map(column => toColumnEntrySummary(erdBudget, erdDocument, column));

    return {
        uri: erdBudget.structColumnShareUri(structModel.structShareModelId),
        structColumnShareModelId: structModel.structShareModelId,
        columnName: {
            physical: structModel.physicalName,
            ...((structModel.logicalName !== "") && { logical: structModel.logicalName })
        },
        isArray: structModel.isArray,
        columns: columns,
        description: structModel.description
    };
};

const toColumnEntrySummary = (erdBudget: DocumentBudget, erdDocument: ErdDocument, column: ColumnEntry) => {
    if (column.modelType === "group") {
        return {
            modelType: "group" as const,
            uri: erdBudget.columnGroupUri(column.columnGroupId),
            columnGroupId: column.columnGroupId
        };
    }

    const columnModel = erdDocument.findColumnModel(column.columnModelId);
    if ((columnModel != null) && (columnModel.entityType === "struct")) {
        return {
            modelType: "struct" as const,
            uri: erdBudget.structColumnShareUri(columnModel.structShareModelId),
            columnId: column.columnModelId,
            structColumnShareModelId: columnModel.structShareModelId
        };
    }

    return {
        modelType: "single" as const,
        uri: erdBudget.columnUri(column.columnModelId),
        columnId: column.columnModelId
    };
};
