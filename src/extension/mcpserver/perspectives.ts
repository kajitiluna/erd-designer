import {
    ReadResourceTemplateCallback, ResourceTemplate, ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, findDocument, initInvalidParams, initResourceNotFound, initResourceResponse,
    initToolJsonResponse, McpRegisterConfig, McpServerRegisterResourceTemplateArgs,
    McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import PerspectiveModel from "~/models/PerspectiveModel";

export const mcpRegisterPerspective = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListPerspectivesResource(documentResource),
            mcpFindPerspectiveResource(documentResource)
        ],
        tools: [
            mcpListPerspectivesTool(documentResource),
            mcpFindPerspectiveTool(documentResource),
            mcpAddPerspective(documentResource),
            mcpUpdatePerspective(documentResource),
            mcpRemovePerspective(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== list-perspectives ====================

const descriptionList = `\
Retrieves a list of all perspectives for a specified ERD document.
Perspectives allow you to define filtered views of tables and memos in the document.
Each perspective includes its unique identifier, name, description, and the ids of tables and memos it contains.

REQUEST:
- documentId: The unique identifier of the ERD document whose perspectives are to be listed.
  Can be obtained by calling the 'list-documents' tool.

RESPONSE:
An array of perspective objects, each containing:
- uri: The unique URI of the perspective (format: erd-designer://documents/{documentId}/perspectives/{perspectiveId}).
- perspectiveId: The unique identifier of the perspective (auto-generated UUID).
- perspectiveName: The name of the perspective.
- description: A brief description of the perspective (may be empty string).
- containIds: An array of table ids and memo ids included in this perspective.
  These ids can be obtained from the document's tables and memos arrays.
`;

const mcpListPerspectivesResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-perspectives",
        new ResourceTemplate(uriTemplates.perspectives, { list: undefined }),
        {
            title: "List perspectives of a specified ERD document",
            description: descriptionList
        },
        initResourceCallbackForListPerspectives(documentResource)
    ] as const;
};

const initResourceCallbackForListPerspectives = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const responses = listPerspectiveResponses(documentResource, documentId);

        return initResourceResponse(url, responses);
    };
};

const listPerspectivesInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID)
};

const mcpListPerspectivesTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof listPerspectivesInputSchema> => {
    return [
        "list-perspectives",
        {
            title: "List perspectives of a specified ERD document",
            description: descriptionList,
            inputSchema: listPerspectivesInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListPerspectives(documentResource)
    ] as const;
};

const initCallbackForListPerspectives = (
    documentResource: DocumentResource
): ToolCallback<typeof listPerspectivesInputSchema> => {
    return async ({ documentId }) => {
        const responses = listPerspectiveResponses(documentResource, documentId);
        return initToolJsonResponse(responses);
    };
};

const listPerspectiveResponses = (documentResource: DocumentResource, documentId: string) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);
    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();

    return perspectives.map(perspective => toDetail(erdBudget, perspective));
};

// ==================== find-perspective ====================

const descriptionFindById = `\
Retrieves detailed information about a specific perspective of an ERD document using its perspectiveId.

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- perspectiveId: The unique identifier of the perspective to retrieve.
  Can be obtained by calling the 'list-perspectives' tool.

RESPONSE:
An object containing detailed information about the specified perspective:
- uri: The unique URI of the perspective (format: erd-designer://documents/{documentId}/perspectives/{perspectiveId}).
- perspectiveId: The unique identifier of the perspective (auto-generated UUID).
- perspectiveName: The name of the perspective.
- description: A brief description of the perspective (may be empty string).
- containIds: An array of table ids and memo ids included in this perspective.
  These ids reference tables and memos that exist in the document.
`;

const mcpFindPerspectiveResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-perspective",
        new ResourceTemplate(uriTemplates.perspectiveDetail, { list: undefined }),
        {
            title: "Find a perspective of a specified ERD document",
            description: descriptionFindById
        },
        initResourceCallbackForFindPerspective(documentResource)
    ] as const;
};

const initResourceCallbackForFindPerspective = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const perspectiveId = variables.perspectiveId as string;
        const response = findPerspectiveResponse(documentResource, documentId, perspectiveId);

        return initResourceResponse(url, response);
    };
};

const findPerspectiveInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    perspectiveId: z.string().describe("The unique identifier of the perspective to retrieve.")
};

const mcpFindPerspectiveTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findPerspectiveInputSchema> => {
    return [
        "find-perspective",
        {
            title: "Find perspective by perspectiveId of a specified ERD document",
            description: descriptionFindById,
            inputSchema: findPerspectiveInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindPerspective(documentResource)
    ] as const;
};

const initCallbackForFindPerspective = (
    documentResource: DocumentResource
): ToolCallback<typeof findPerspectiveInputSchema> => {
    return async ({ documentId, perspectiveId }) => {
        const response = findPerspectiveResponse(documentResource, documentId, perspectiveId);
        return initToolJsonResponse(response);
    };
};

const findPerspectiveResponse = (
    documentResource: DocumentResource, documentId: string, perspectiveId: string
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    const perspective = erdDocument.erdSettingModel.findPerspectiveModel(perspectiveId);
    if (perspective == null) {
        const url = new URL(erdBudget.perspectiveUri(perspectiveId));
        throw initResourceNotFound(url);
    }

    return toDetail(erdBudget, perspective);
};

// ==================== add-perspective ====================

const descriptionCreate = `\
Creates a new perspective for a specified ERD document.
A new perspectiveId will be automatically generated for the created perspective.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- perspective: An object containing details of the perspective to be created:
  - perspectiveName: The name of the perspective (required, must be non-empty).
  - description: A brief description of the perspective (optional, defaults to empty string).
  - containIds: An array of table ids and memo ids to be included in the perspective.
    These ids must reference existing tables or memos in the document.
    Can be empty array to create a perspective with no initial contents.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the newly created perspective (format: erd-designer://documents/{documentId}/perspectives/{perspectiveId}).
- name: The perspective name as specified in the request.
- mimeType: "application/json"
`;

const mcpAddPerspective = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof addPerspectiveInputSchema> => {
    return [
        "add-perspective",
        {
            title: "Add a new perspective",
            description: descriptionCreate,
            inputSchema: addPerspectiveInputSchema
        },
        initCallbackForAddPerspective(documentResource)
    ] as const;
};

const addPerspectiveInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    perspective: z.object({
        perspectiveName: z.string().min(1)
            .describe("The name of the perspective to be added. Must be a non-empty string."),
        description: z.string().optional()
            .describe("The description of the perspective to be added. "
                + "Optional field that defaults to empty string if not provided."),
        containIds: z.array(z.string())
            .describe("An array of table ids and memo ids to be included in the perspective. "
                + "These ids must reference existing tables or memos in the document. "
                + "Can be empty array to create a perspective with no initial contents.")
    })
} as const;

const initCallbackForAddPerspective = (
    documentResource: DocumentResource
): ToolCallback<typeof addPerspectiveInputSchema> => {
    return async ({ documentId, perspective }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const previousSetting = previousDocument.erdSettingModel;

        const invalidIds = perspective.containIds.filter(targetId =>
            (previousDocument.findTableViewModel(targetId) == null)
            && (previousDocument.findMemoViewModel(targetId) == null));
        if (invalidIds.length > 0) {
            throw initInvalidParams(`containIds not found as table or memo: ${invalidIds.join(", ")}`);
        }

        const newPerspective = PerspectiveModel
            .create(perspective.perspectiveName, perspective.description)
            .updateAllContainIds(perspective.containIds);
        const nextSetting = previousSetting.updatePerspective(newPerspective);
        const nextDocument = previousDocument.updateErdSetting(nextSetting);

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.perspectiveUri(newPerspective.perspectiveId),
                    name: perspective.perspectiveName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

// ==================== update-perspective ====================

const descriptionUpdate = `\
Updates an existing perspective of a specified ERD document.
You can update the name, description, and/or the set of contained table and memo ids.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- perspectiveId: The unique identifier of the perspective to be updated.
  Can be obtained by calling the 'list-perspectives' tool.
- updating: An object containing the fields to be updated (all fields are optional):
  - perspectiveName: The new name for the perspective. Must be non-empty if provided.
  - description: The new description for the perspective. Can be empty string to clear description.
  - addingIds: An array of table/memo ids to be added to the perspective.
    These ids must reference existing tables or memos in the document.
  - removingIds: An array of table/memo ids to be removed from the perspective.

  Note: If both addingIds and removingIds are provided, removals are processed first, then additions.
  Specifying the same id in both arrays will result in that id being included (addition takes precedence).
  If no fields are provided, the perspective remains unchanged.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated perspective (format: erd-designer://documents/{documentId}/perspectives/{perspectiveId}).
- name: The updated perspective name.
- mimeType: "application/json"
`;

const mcpUpdatePerspective = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updatePerspectiveInputSchema> => {
    return [
        "update-perspective",
        {
            title: "Update an existing perspective",
            description: descriptionUpdate,
            inputSchema: updatePerspectiveInputSchema
        },
        initCallbackForUpdatingPerspective(documentResource)
    ] as const;
};

const updatePerspectiveInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    perspectiveId: z.string()
        .describe("The unique identifier of the perspective to update."),
    updating: z.object({
        perspectiveName: z.string().min(1).optional()
            .describe("The new name for the perspective. Must be non-empty if provided."),
        description: z.string().optional()
            .describe("The new description for the perspective. "
                + "Can be empty string to clear the description."),
        addingIds: z.array(z.string()).optional()
            .describe("An array of table/memo ids to add to the perspective. "
                + "ids must reference existing tables or memos in the document."),
        removingIds: z.array(z.string()).optional()
            .describe("An array of table/memo ids to remove from the perspective. "
                + "Note: Removals are processed before additions.")
    })
} as const;

const initCallbackForUpdatingPerspective = (
    documentResource: DocumentResource
): ToolCallback<typeof updatePerspectiveInputSchema> => {
    return async ({ documentId, perspectiveId, updating }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const previousSetting = previousDocument.erdSettingModel;

        const previousPerspective = previousSetting.findPerspectiveModel(perspectiveId);
        if (previousPerspective == null) {
            const url = new URL(erdBudget.perspectiveUri(perspectiveId));
            throw initResourceNotFound(url);
        }

        const updatingName = updating.perspectiveName ?? previousPerspective.perspectiveName;
        const updatingDescription = updating.description ?? previousPerspective.description;

        const invalidIds = (updating.addingIds ?? []).filter(targetId =>
            (previousDocument.findTableViewModel(targetId) == null)
            && (previousDocument.findMemoViewModel(targetId) == null));
        if (invalidIds.length > 0) {
            throw initInvalidParams(`addingIds not found as table or memo: ${invalidIds.join(", ")}`);
        }

        const containIds = new Set(previousPerspective.getContainIds());
        updating.removingIds?.forEach(id => containIds.delete(id));
        updating.addingIds?.forEach(id => containIds.add(id));

        const nextPerspective = previousPerspective
            .update(updatingName, updatingDescription)
            .updateAllContainIds(Array.from(containIds));
        const nextSetting = previousSetting.updatePerspective(nextPerspective);
        const nextDocument = previousDocument.updateErdSetting(nextSetting);

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.perspectiveUri(nextPerspective.perspectiveId),
                    name: nextPerspective.perspectiveName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

// ==================== remove-perspective ====================

const descriptionDelete = `\
Deletes an existing perspective of a specified ERD document.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- perspectiveId: The unique identifier of the perspective to be deleted.
  Can be obtained by calling the 'list-perspectives' tool.

RESPONSE:
A text message indicating the result:
- If the perspective exists and is deleted: A confirmation message with the perspective name.
- If the perspective does not exist: A message indicating that the perspective was not found.
  Note: This operation does not return an error if the perspective doesn't exist.
`;

const mcpRemovePerspective = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof removePerspectiveInputSchema> => {
    return [
        "remove-perspective",
        {
            title: "Remove an existing perspective",
            description: descriptionDelete,
            inputSchema: removePerspectiveInputSchema
        },
        initCallbackForDeletingPerspective(documentResource)
    ] as const;
};

const removePerspectiveInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    perspectiveId: z.string()
        .describe("The unique identifier of the perspective to delete.")
} as const;

const initCallbackForDeletingPerspective = (
    documentResource: DocumentResource
): ToolCallback<typeof removePerspectiveInputSchema> => {
    return async ({ documentId, perspectiveId }) => {
        const { erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const previousSetting = previousDocument.erdSettingModel;

        const previousPerspective = previousSetting.findPerspectiveModel(perspectiveId);
        if (previousPerspective == null) {
            return {
                content: [
                    {
                        type: "text",
                        text: `The perspective with id '${perspectiveId}' does not exist.`
                    }
                ]
            };
        }

        const nextPerspectives = previousSetting.getPerspectiveModels()
            .filter(perspective => (perspective.perspectiveId !== perspectiveId));
        const nextSetting = previousSetting.update({ perspectiveModels: nextPerspectives });
        const nextDocument = previousDocument.updateErdSetting(nextSetting);

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "text",
                    text: `The perspective '${previousPerspective.perspectiveName}' has been removed.`
                }
            ]
        };
    };
};

// ==================== shared helpers ====================

const toDetail = (erdBudget: DocumentBudget, perspective: PerspectiveModel) => {
    return {
        uri: erdBudget.perspectiveUri(perspective.perspectiveId),
        perspectiveId: perspective.perspectiveId,
        perspectiveName: perspective.perspectiveName,
        description: perspective.description,
        containIds: perspective.getContainIds()
    };
};
