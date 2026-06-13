import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, initInvalidParams, initResourceNotFound, initResourceResponse, initToolJsonResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs, searchParameters
} from "~/extension/mcpserver/support";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import ErdDocument from "~/models/ErdDocument";

export const mcpRegisterColumnGroup = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListColumnGroups(documentResource),
            mcpFindColumnGroup(documentResource)
        ],
        tools: [
            mcpCreateColumnGroup(documentResource),
            mcpUpdateColumnGroup(documentResource),
            mcpDeleteColumnGroup(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of column groups from the specified ERD document.
Column groups are reusable sets of columns that can be shared across multiple tables.
This resource supports optional filtering via query parameters to narrow down the results.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose column groups are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

REQUEST (query parameters - all optional):
Filtering conditions can be specified to narrow down the column group list.
- columnId: Filter column groups that contain the specified column ID (exact match).
  Can be specified multiple times; column groups must contain all specified column IDs (AND).
  Example: ?columnId=abc-123-def-456

QUERY EXAMPLES:
- All column groups:
  \`erd-designer://documents/doc123/column_groups\`
- Column groups containing specific column ID:
  \`erd-designer://documents/doc123/column_groups?columnId=abc-123-def-456\`
- Column groups containing all specified column IDs:
  \`erd-designer://documents/doc123/column_groups?columnId=abc-123&columnId=def-456\`

RESPONSE:
An array of column group objects, each containing:
- uri: The unique URI of the column group (format: erd-designer://documents/{documentId}/column_groups/{columnGroupId}).
- columnGroupId: The unique identifier of the column group (auto-generated UUID).
- groupName: The name of the column group.
- columns: Array of column information in this group, each containing:
  - uri: The unique URI of the column (format: erd-designer://documents/{documentId}/columns/{columnId}).
  - columnId: The unique identifier of the column.
- description: A brief description of the column group (may be empty string).
`;

const mcpListColumnGroups = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    const queryParams = "columnId";

    return [
        "list-column-groups",
        new ResourceTemplate(
            uriTemplates.columnGroups + `{?${queryParams}*}`,
            { list: undefined }
        ),
        {
            title: "List column groups of a specified ERD document",
            description: descriptionList
        },
        initCallbackForListColumnGroups(documentResource)
    ] as const;
};

const initCallbackForListColumnGroups = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const columnGroups = doFilterColumnGroups(url, erdDocument);
        const responses = columnGroups.map(group => toColumnGroupSummary(erdBudget, group));

        return initResourceResponse(url, responses);
    };
};

const doFilterColumnGroups = (url: URL, erdDocument: ErdDocument) => {
    const columnIds = searchParameters(url, "columnId");

    return erdDocument.getColumnGroupModels().filter(group => {
        const matchedColumnIds = (columnIds.length === 0)
            || columnIds.every(filtering =>
                group.columnModelIds.includes(filtering));
        if (!matchedColumnIds) {
            return false;
        }

        return true;
    });
};

const descriptionFind = `\
Retrieves detailed information about a specific column group from the specified ERD document using its columnGroupId.
This includes the complete list of columns in the group with their column-share references and override settings.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- columnGroupId: The unique identifier of the column group to retrieve.
  Can be obtained from the column groups list resource or from the document's setting.

RESPONSE:
An object containing detailed information about the specified column group:
- uri: The unique URI of the column group (format: erd-designer://documents/{documentId}/column_groups/{columnGroupId}).
- columnGroupId: The unique identifier of the column group (auto-generated UUID).
- groupName: The name of the column group.
- columns: Array of column information in this group, each containing:
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
- description: A brief description of the column group (may be empty string).
`;

const mcpFindColumnGroup = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-column-group",
        new ResourceTemplate(uriTemplates.columnGroupDetail, { list: undefined }),
        {
            title: "Find a column group of a specified ERD document",
            description: descriptionFind
        },
        initCallbackForFindColumnGroup(documentResource)
    ] as const;
};

const initCallbackForFindColumnGroup = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const columnGroupId = variables.columnGroupId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const columnGroup = erdDocument.findColumnGroupModel(columnGroupId);
        if (columnGroup == null) {
            throw initResourceNotFound(url);
        }

        const response = toColumnGroupDetail(erdBudget, columnGroup, erdDocument);

        return initResourceResponse(url, response);
    };
};

const toColumnGroupSummary = (erdBudget: DocumentBudget, group: ColumnGroupModel) => {
    return {
        uri: erdBudget.columnGroupUri(group.columnGroupId),
        columnGroupId: group.columnGroupId,
        groupName: group.groupName,
        columns: group.columnModelIds.map(columnModelId => ({
            uri: erdBudget.columnUri(columnModelId),
            columnId: columnModelId
        })),
        description: group.description
    };
};

const toColumnGroupDetail = (erdBudget: DocumentBudget, group: ColumnGroupModel, erdDocument: ErdDocument) => {
    const columns = group.columnModelIds.flatMap(columnModelId => {
        const column = erdDocument.findColumnModel(columnModelId);
        if (column == null) {
            return [];
        }

        return [toColumnInGroup(erdBudget, column)];
    });

    return {
        uri: erdBudget.columnGroupUri(group.columnGroupId),
        columnGroupId: group.columnGroupId,
        groupName: group.groupName,
        columns: columns,
        description: group.description
    };
};

const toColumnInGroup = (erdBudget: DocumentBudget, column: ColumnModel) => {
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

const descriptionCreateColumnGroup = `\
Creates a new column group in a specified ERD document.
Column groups are reusable sets of columns that can be shared across multiple tables.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnGroup: An object containing the column group information:
  - groupName: The name of the column group (required).
  - columnIds: An array of column IDs to include in the group (required).
    Can be obtained from the columns resource.
  - description: A brief description of the column group (optional).

RESPONSE:
The created column group object (same format as column group detail resource).
`;

const mcpCreateColumnGroup = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof createColumnGroupInputSchema> => {
    return [
        "create-column-group",
        {
            title: "Create a column group in a specified ERD document",
            description: descriptionCreateColumnGroup,
            inputSchema: createColumnGroupInputSchema
        },
        initCallbackForCreateColumnGroup(documentResource)
    ] as const;
};

const createColumnGroupInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnGroup: z.object({
        groupName: z.string().describe("The name of the column group."),
        columnIds: z.array(z.string()).min(1, "At least one columnId must be specified.")
            .describe("An array of column IDs to include in the group."),
        description: z.string().optional().describe("A brief description of the column group.")
    }).strict().describe("The column group information.")
};

const initCallbackForCreateColumnGroup = (
    documentResource: DocumentResource
): ToolCallback<typeof createColumnGroupInputSchema> => {
    return async ({ documentId, columnGroup: groupInput }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;

        groupInput.columnIds.forEach(columnId => {
            const column = previousDocument.findColumnModel(columnId);
            if (column == null) {
                throw initInvalidParams(`Column not found: ${columnId}`);
            }
        });

        const newGroup = new ColumnGroupModel({
            groupName: groupInput.groupName,
            columnModelIds: groupInput.columnIds,
            description: groupInput.description ?? ""
        });

        const columnShareModelStorage = previousDocument.getColumnShareModelStorage();
        const nextDocument = previousDocument.updateColumnGroup(newGroup, [], columnShareModelStorage);
        documentResource.notify(documentId, nextDocument);

        const response = toColumnGroupDetail(erdBudget, newGroup, nextDocument);

        return initToolJsonResponse(response);
    };
};

const descriptionUpdateColumnGroup = `\
Updates an existing column group in a specified ERD document.
Only the specified fields will be updated; unspecified fields remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnGroupId: The unique identifier of the column group to update.
  Can be obtained from the column groups list resource.
- columnGroup: An object containing the fields to update (all optional):
  - groupName: The new name of the column group.
  - columnIds: An array of column IDs to include in the group.
  - description: A brief description of the column group.

RESPONSE:
The updated column group object (same format as column group detail resource).
`;

const mcpUpdateColumnGroup = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateColumnGroupInputSchema> => {
    return [
        "update-column-group",
        {
            title: "Update a column group in a specified ERD document",
            description: descriptionUpdateColumnGroup,
            inputSchema: updateColumnGroupInputSchema
        },
        initCallbackForUpdateColumnGroup(documentResource)
    ] as const;
};

const updateColumnGroupInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnGroupId: z.string().describe("The unique identifier of the column group to update."),
    columnGroup: z.object({
        groupName: z.string().optional().describe("The new name of the column group."),
        columnIds: z.array(z.string()).min(1, "At least one column ID must be provided.").optional()
            .describe("An array of column IDs to include in the group."),
        description: z.string().optional().describe("A brief description of the column group.")
    }).strict().describe("The column group fields to update.")
};

const initCallbackForUpdateColumnGroup = (
    documentResource: DocumentResource
): ToolCallback<typeof updateColumnGroupInputSchema> => {
    return async ({ documentId, columnGroupId, columnGroup: groupInput }) => {
        const { erdBudget, erdDocument: previousDocument, columnGroup: previousGroup } =
            doFindDocumentAndColumnGroup(documentResource, documentId, columnGroupId);

        const nextColumnIds = groupInput.columnIds ?? [...previousGroup.columnModelIds];

        nextColumnIds.forEach(columnId => {
            const column = previousDocument.findColumnModel(columnId);
            if (column == null) {
                throw initInvalidParams(`Column not found: ${columnId}`);
            }
        });

        const nextGroup = new ColumnGroupModel({
            columnGroupId: previousGroup.columnGroupId,
            groupName: groupInput.groupName ?? previousGroup.groupName,
            columnModelIds: nextColumnIds,
            description: groupInput.description ?? previousGroup.description
        });

        const columnShareModelStorage = previousDocument.getColumnShareModelStorage();
        const nextDocument = previousDocument.updateColumnGroup(nextGroup, [], columnShareModelStorage);
        documentResource.notify(documentId, nextDocument);

        const response = toColumnGroupDetail(erdBudget, nextGroup, nextDocument);

        return initToolJsonResponse(response);
    };
};

const descriptionDeleteColumnGroup = `\
Deletes an existing column group from a specified ERD document.
This will also remove column models and unused column-share models associated with the group.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- columnGroupId: The unique identifier of the column group to delete.
  Can be obtained from the column groups list resource.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteColumnGroup = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteColumnGroupInputSchema> => {
    return [
        "delete-column-group",
        {
            title: "Delete a column group from a specified ERD document",
            description: descriptionDeleteColumnGroup,
            inputSchema: deleteColumnGroupInputSchema
        },
        initCallbackForDeleteColumnGroup(documentResource)
    ] as const;
};

const deleteColumnGroupInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnGroupId: z.string().describe("The unique identifier of the column group to delete.")
};

const initCallbackForDeleteColumnGroup = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteColumnGroupInputSchema> => {
    return async ({ documentId, columnGroupId }) => {
        const { erdDocument: previousDocument } =
            doFindDocumentAndColumnGroup(documentResource, documentId, columnGroupId);

        const nextDocument = previousDocument.deleteColumnGroup(columnGroupId);
        documentResource.notify(documentId, nextDocument);

        return initToolJsonResponse({ success: true });
    };
};

const doFindDocumentAndColumnGroup = (
    documentResource: DocumentResource, documentId: string, columnGroupId: string
) => {
    const erdBudget = documentResource.findById(documentId);
    if (erdBudget == null) {
        const url = new URL(uriTemplates.documentFor(documentId));
        throw initResourceNotFound(url);
    }

    const erdDocument = erdBudget.erdDocument;
    const columnGroup = erdDocument.findColumnGroupModel(columnGroupId);
    if (columnGroup == null) {
        const url = new URL(erdBudget.columnGroupUri(columnGroupId));
        throw initResourceNotFound(url);
    }

    return { erdBudget, erdDocument, columnGroup };
};