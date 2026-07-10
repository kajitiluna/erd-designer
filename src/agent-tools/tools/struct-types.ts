import {
    ReadResourceTemplateCallback, ResourceTemplate, ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/agent-tools/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/agent-tools/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, findDocument, initInvalidParams, initResourceNotFound, initResourceResponse,
    initToolJsonResponse, McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/agent-tools/tools/support";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnStructModel from "~/models/database/ColumnStructModel";
import ErdDocument from "~/models/ErdDocument";

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
            mcpDeleteColumnStruct(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== list-column-structs ====================

const descriptionList = `\
Retrieves a list of column structs from the specified ERD document.
Column structs define BigQuery STRUCT type columns: the field name is the member column's physicalName,
and the field type is that column's type. A STRUCT column's columnShare references a column struct via
columnStructId, and the DDL generator recursively expands the referenced columns into
'STRUCT<field1 TYPE1, field2 TYPE2>'.
Supports optional filtering to narrow down the results.

REQUEST:
- documentId: The unique identifier of the ERD document whose column structs are to be listed.
  Can be obtained by calling the 'list-documents' tool.

REQUEST (filter parameters - all optional):
- filter.columnIds: Filter column structs that contain all of the specified column IDs (AND condition).
  Example: { "filter": { "columnIds": ["abc-123", "def-456"] } }

RESPONSE:
An array of column struct objects, each containing:
- uri: The unique URI of the column struct (format: erd-designer://documents/{documentId}/column_structs/{columnStructId}).
- columnStructId: The unique identifier of the column struct (auto-generated UUID).
- structName: The name of the column struct.
- columns: Array of member column information used as STRUCT fields, each containing:
  - uri: The unique URI of the column (format: erd-designer://documents/{documentId}/columns/{columnId}).
  - columnId: The unique identifier of the column.
- description: A brief description of the column struct (may be empty string).
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
        const responses = listColumnStructResponses(documentResource, documentId, { columnIds: [] });

        return initResourceResponse(url, responses);
    };
};

const listColumnStructsInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    filter: z.object({
        columnIds: z.array(z.string()).optional()
            .describe("Filter column structs that contain all of the specified column IDs (AND condition)."),
    }).optional(),
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
    return async ({ documentId, filter }) => {
        const params: ColumnStructFilterParams = {
            columnIds: filter?.columnIds ?? []
        };
        const responses = listColumnStructResponses(documentResource, documentId, params);

        return initToolJsonResponse(responses);
    };
};

type ColumnStructFilterParams = {
    columnIds: string[];
};

const listColumnStructResponses = (
    documentResource: DocumentResource, documentId: string, params: ColumnStructFilterParams
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);
    const columnStructs = doFilterColumnStructs(params, erdDocument);

    return columnStructs.map(struct => toColumnStructSummary(erdBudget, struct));
};

const doFilterColumnStructs = (params: ColumnStructFilterParams, erdDocument: ErdDocument) => {
    const { columnIds } = params;

    return erdDocument.getColumnStructModels().filter(struct => {
        const matchedColumnIds = (columnIds.length === 0)
            || columnIds.every(filtering =>
                struct.columnModelIds.includes(filtering));
        if (matchedColumnIds === false) {
            return false;
        }

        return true;
    });
};

// ==================== find-column-struct ====================

const descriptionFind = `\
Retrieves detailed information about a specific column struct from the specified ERD document using its columnStructId.
This includes the complete list of member columns used as STRUCT fields (field name = physicalName, field type = column type).

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- columnStructId: The unique identifier of the column struct to retrieve.
  Can be obtained by calling the 'list-column-structs' tool or from a column-share's columnStructId reference.

RESPONSE:
An object containing detailed information about the specified column struct:
- uri: The unique URI of the column struct (format: erd-designer://documents/{documentId}/column_structs/{columnStructId}).
- columnStructId: The unique identifier of the column struct (auto-generated UUID).
- structName: The name of the column struct.
- columns: Array of member column information used as STRUCT fields, each containing:
  - uri: The unique URI of the column (format: erd-designer://documents/{documentId}/columns/{columnId}).
  - columnId: The unique identifier of the column.
  - columnShare: Information about the associated column-share model:
    - uri: The URI to access the column-share resource.
    - columnShareId: The unique identifier of the column-share model.
  - overrideName: Object containing overridden names (null if no overrides):
    - physical: The overridden physical name (only present if not empty string).
    - logical: The overridden logical name (only present if not empty string).
  - primaryKey: Boolean indicating if this is a primary key.
  - notNull: Boolean indicating if this column is NOT NULL.
  - unique: Boolean indicating if this column has a unique constraint.
  - autoIncrement: Boolean indicating if auto-increment is enabled.
  - defaultValue: The default value for the column.
- description: A brief description of the column struct (may be empty string).
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
    const { erdBudget, erdDocument, columnStruct } =
        doFindDocumentAndColumnStruct(documentResource, documentId, columnStructId);

    return toColumnStructDetail(erdBudget, columnStruct, erdDocument);
};

// ==================== create-column-struct ====================

const descriptionCreateColumnStruct = `\
Creates a new column struct in a specified ERD document.
Column structs define BigQuery STRUCT type columns: the field name is the member column's physicalName,
and the field type is that column's type.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnStruct: An object containing the column struct information:
  - structName: The name of the column struct (required).
  - columnIds: An array of existing column IDs to use as STRUCT fields (required).
    Can be obtained from the table's columns array.
  - description: A brief description of the column struct (optional).

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
        structName: z.string().describe("The name of the column struct."),
        columnIds: z.array(z.string()).min(1, "At least one columnId must be specified.")
            .describe("An array of existing column IDs to use as STRUCT fields."),
        description: z.string().optional().describe("A brief description of the column struct.")
    }).strict().describe("The column struct information.")
};

const initCallbackForCreateColumnStruct = (
    documentResource: DocumentResource
): ToolCallback<typeof createColumnStructInputSchema> => {
    return async ({ documentId, columnStruct: structInput }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);

        validateMemberColumnsExist(previousDocument, structInput.columnIds);

        const newStruct = new ColumnStructModel({
            structName: structInput.structName,
            columnModelIds: structInput.columnIds,
            description: structInput.description ?? ""
        });

        validateNoStructCycle(previousDocument, erdBudget, newStruct.columnStructId, newStruct.columnModelIds);

        const nextDocument = previousDocument.updateColumnStruct(newStruct, []);
        documentResource.notify(documentId, nextDocument);

        const response = toColumnStructDetail(erdBudget, newStruct, nextDocument);

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
  - structName: The new name of the column struct.
  - columnIds: An array of existing column IDs to use as STRUCT fields.
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
        structName: z.string().optional().describe("The new name of the column struct."),
        columnIds: z.array(z.string()).min(1, "At least one column ID must be provided.").optional()
            .describe("An array of existing column IDs to use as STRUCT fields."),
        description: z.string().optional().describe("A brief description of the column struct.")
    }).strict().describe("The column struct fields to update.")
};

const initCallbackForUpdateColumnStruct = (
    documentResource: DocumentResource
): ToolCallback<typeof updateColumnStructInputSchema> => {
    return async ({ documentId, columnStructId, columnStruct: structInput }) => {
        const { erdBudget, erdDocument: previousDocument, columnStruct: previousStruct } =
            doFindDocumentAndColumnStruct(documentResource, documentId, columnStructId);

        const nextColumnIds = structInput.columnIds ?? [...previousStruct.columnModelIds];

        validateMemberColumnsExist(previousDocument, nextColumnIds);

        const nextStruct = new ColumnStructModel({
            columnStructId: previousStruct.columnStructId,
            structName: structInput.structName ?? previousStruct.structName,
            columnModelIds: nextColumnIds,
            description: structInput.description ?? previousStruct.description
        });

        validateNoStructCycle(previousDocument, erdBudget, nextStruct.columnStructId, nextStruct.columnModelIds);

        const nextDocument = previousDocument.updateColumnStruct(nextStruct, []);
        documentResource.notify(documentId, nextDocument);

        const response = toColumnStructDetail(erdBudget, nextStruct, nextDocument);

        return initToolJsonResponse(response);
    };
};

// ==================== delete-column-struct ====================

const descriptionDeleteColumnStruct = `\
Deletes an existing column struct from a specified ERD document.
This will also remove the member column models associated only with this struct
(any column-share still referencing this struct via columnStructId will have that reference cleared).

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

// ==================== shared helpers ====================

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

const validateMemberColumnsExist = (erdDocument: ErdDocument, columnIds: readonly string[]) => {
    columnIds.forEach(columnId => {
        const column = erdDocument.findColumnModel(columnId);
        if (column == null) {
            throw initInvalidParams(`Column not found: ${columnId}`);
        }
    });
};

const validateNoStructCycle = (
    erdDocument: ErdDocument, erdBudget: DocumentBudget, targetColumnStructId: string, memberColumnIds: readonly string[]
) => {
    const startingColumnStructIds = memberColumnIds.flatMap(columnId => collectMemberColumnStructId(erdDocument, columnId));
    const cycleColumnStructId = findStructCycle(erdDocument, targetColumnStructId, startingColumnStructIds);
    if (cycleColumnStructId != null) {
        const url = new URL(erdBudget.columnStructUri(cycleColumnStructId));
        throw initInvalidParams(
            `Circular STRUCT reference detected: column struct ${targetColumnStructId} `
            + `would (in)directly reference itself through struct ${cycleColumnStructId} (${url.href}).`
        );
    }
};

/**
 * startingColumnStructIds に含まれる各 columnStructId を起点に、そのメンバーカラムが参照する
 * ColumnShareModel.columnStructId を再帰的に辿り (深さ優先)、targetColumnStructId 自身に
 * 到達する循環参照がないかを検証する。
 *
 * @param erdDocument 検証対象のドキュメント
 * @param targetColumnStructId 循環の到達先として検出したい columnStructId (作成・更新しようとしている struct 自身の ID)
 * @param startingColumnStructIds 探索の起点となる columnStructId 群
 *   (作成・更新しようとしている struct が新たに参照することになる columnStructId 群)
 * @returns 循環が検出された場合、循環に関与した columnStructId。循環がなければ null
 */
export const findStructCycle = (
    erdDocument: ErdDocument, targetColumnStructId: string, startingColumnStructIds: readonly string[]
): string | null => {
    const visitedColumnStructIds = new Set<string>();

    return searchStructCycle(erdDocument, targetColumnStructId, startingColumnStructIds, visitedColumnStructIds);
};

const searchStructCycle = (
    erdDocument: ErdDocument, targetColumnStructId: string,
    columnStructIdsToVisit: readonly string[], visitedColumnStructIds: Set<string>
): string | null => {
    if (columnStructIdsToVisit.length === 0) {
        return null;
    }

    const [columnStructId, ...restColumnStructIds] = columnStructIdsToVisit;

    if (columnStructId === targetColumnStructId) {
        return columnStructId;
    }
    if (visitedColumnStructIds.has(columnStructId)) {
        return searchStructCycle(erdDocument, targetColumnStructId, restColumnStructIds, visitedColumnStructIds);
    }
    visitedColumnStructIds.add(columnStructId);

    const referencedStruct = erdDocument.findColumnStructModel(columnStructId);
    const nextColumnStructIds = (referencedStruct == null)
        ? []
        : referencedStruct.columnModelIds.flatMap(columnId => collectMemberColumnStructId(erdDocument, columnId));

    return searchStructCycle(
        erdDocument, targetColumnStructId, [...restColumnStructIds, ...nextColumnStructIds], visitedColumnStructIds
    );
};

const collectMemberColumnStructId = (erdDocument: ErdDocument, columnId: string): string[] => {
    const columnModel = erdDocument.findColumnModel(columnId);
    if (columnModel == null) {
        return [];
    }

    const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if ((columnShareModel == null) || (columnShareModel.columnStructId === "")) {
        return [];
    }

    return [columnShareModel.columnStructId];
};

const toColumnStructSummary = (erdBudget: DocumentBudget, struct: ColumnStructModel) => {
    return {
        uri: erdBudget.columnStructUri(struct.columnStructId),
        columnStructId: struct.columnStructId,
        structName: struct.structName,
        columns: struct.columnModelIds.map(columnModelId => {
            return {
                uri: erdBudget.columnUri(columnModelId),
                columnId: columnModelId
            };
        }),
        description: struct.description
    };
};

const toColumnStructDetail = (erdBudget: DocumentBudget, struct: ColumnStructModel, erdDocument: ErdDocument) => {
    const columns = struct.columnModelIds.flatMap(columnModelId => {
        const column = erdDocument.findColumnModel(columnModelId);
        if (column == null) {
            return [];
        }

        return [toColumnInStruct(erdBudget, column)];
    });

    return {
        uri: erdBudget.columnStructUri(struct.columnStructId),
        columnStructId: struct.columnStructId,
        structName: struct.structName,
        columns: columns,
        description: struct.description
    };
};

const toColumnInStruct = (erdBudget: DocumentBudget, column: ColumnModel) => {
    const overrideName = ((column.physicalName !== "") || (column.logicalName !== ""))
        ? {
            ...((column.physicalName !== "") && { physical: column.physicalName }),
            ...((column.logicalName !== "") && { logical: column.logicalName })
        } : null;

    return {
        uri: erdBudget.columnUri(column.columnModelId),
        columnId: column.columnModelId,
        columnShare: {
            uri: erdBudget.columnShareUri(column.columnShareModelId),
            columnShareId: column.columnShareModelId,
        },
        overrideName: overrideName,
        primaryKey: column.primaryKey,
        notNull: column.notNull,
        unique: column.unique,
        autoIncrement: column.autoIncrement,
        defaultValue: column.defaultValue
    };
}
