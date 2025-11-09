import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import {
    initResourceNotFound, McpRegisterConfig, McpServerRegisterResourceTemplateArgs,
    McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import PerspectiveModel from "~/models/PerspectiveModel";

export const mcpRegisterPerspective = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListPerspective(documentResource),
            mcpFindPerspectiveById(documentResource)
        ],
        tools: [
            mcpCreatePerspective(documentResource),
            mcpUpdatePerspective(documentResource),
            mcpDeletePerspective(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of all perspectives for a specified ERD document.
Perspectives allow you to define filtered views of tables and memos in the document.
Each perspective includes its unique identifier, name, description, and the ids of tables and memos it contains.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose perspectives are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

RESPONSE:
An array of perspective objects, each containing:
- uri: The unique URI of the perspective (format: erd-designer://documents/{documentId}/perspectives/{perspectiveId}).
- perspectiveId: The unique identifier of the perspective (auto-generated UUID).
- perspectiveName: The name of the perspective.
- description: A brief description of the perspective (may be empty string).
- containIds: An array of table ids and memo ids included in this perspective.
  These ids can be obtained from the document's tables and memos arrays.
`;

const mcpListPerspective = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-perspectives",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/perspectives",
            { list: undefined }
        ),
        {
            title: "List perspectives of a specified ERD document",
            description: descriptionList
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const erdSetting = erdDocument.erdSettingModel;
            const responses = erdSetting.getPerspectiveModels()
                .map(perspective => toDetail(documentId, perspective));

            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(responses),
                        mimeType: "application/json"
                    }
                ]
            }
        }
    ] as const;
};

const descriptionFindById = `\
Retrieves detailed information about a specific perspective of an ERD document using its perspectiveId.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- perspectiveId: The unique identifier of the perspective to retrieve.
  Can be obtained from the perspectives list resource.

RESPONSE:
An object containing detailed information about the specified perspective:
- uri: The unique URI of the perspective (format: erd-designer://documents/{documentId}/perspectives/{perspectiveId}).
- perspectiveId: The unique identifier of the perspective (auto-generated UUID).
- perspectiveName: The name of the perspective.
- description: A brief description of the perspective (may be empty string).
- containIds: An array of table ids and memo ids included in this perspective.
  These ids reference tables and memos that exist in the document.
`;

const mcpFindPerspectiveById = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-perspective-by-id",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/perspectives/{perspectiveId}",
            { list: undefined }
        ),
        {
            title: "Find perspective by perspectiveId of a specified ERD document",
            description: descriptionFindById
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const perspectiveId = variables.perspectiveId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const erdSetting = erdDocument.erdSettingModel;
            const perspective = erdSetting.findPerspectiveModel(perspectiveId);
            if (!perspective) {
                throw initResourceNotFound(url);
            }

            const response = toDetail(documentId, perspective);

            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(response),
                        mimeType: "application/json"
                    }
                ]
            }
        }
    ] as const;
}

const toDetail = (documentId: string, perspective: PerspectiveModel) => {
    return {
        uri: `erd-designer://documents/${documentId}/perspectives/${perspective.perspectiveId}`,
        perspectiveId: perspective.perspectiveId,
        perspectiveName: perspective.perspectiveName,
        description: perspective.description,
        containIds: perspective.getContainIds()
    };
};

type AddPerspectiveInput = {
    readonly documentId: z.ZodString;
    readonly perspective: z.ZodObject<{
        perspectiveName: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        containIds: z.ZodArray<z.ZodString, "many">;
    }>;
};

const descriptionCreate = `\
Creates a new perspective for a specified ERD document.
A new perspectiveId will be automatically generated for the created perspective.

REQUEST:
- documentId: The unique identifier of the ERD document to which the perspective will be added.
  Can be obtained from 'erd-designer://documents' resource.
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

const mcpCreatePerspective = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<AddPerspectiveInput> => {
    return [
        "create-perspective",
        {
            title: "Create a new perspective",
            description: descriptionCreate,
            inputSchema: {
                documentId: z.string()
                    .describe("The documentId of the ERD document to which the perspective will be added. "
                        + "This documentId can be obtained via 'erd-designer://documents' resource."),
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
            }
        },
        async ({ documentId, perspective }) => {
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                const url = new URL(`erd-designer://documents/${documentId}`);
                throw initResourceNotFound(url);
            }

            const previousDocument = budget.erdDocument;
            const previousSetting = previousDocument.erdSettingModel;

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
                        uri: `erd-designer://documents/${documentId}/perspectives/${newPerspective.perspectiveId}`,
                        name: perspective.perspectiveName,
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};

type UpdatePerspectiveInput = {
    readonly documentId: z.ZodString;
    readonly perspectiveId: z.ZodString;
    readonly updating: z.ZodObject<{
        perspectiveName: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        addingIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        removingIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }>
};

const descriptionUpdate = `\
Updates an existing perspective of a specified ERD document.
You can update the name, description, and/or the set of contained table and memo ids.

REQUEST:
- documentId: The unique identifier of the ERD document containing the perspective to be updated.
  Can be obtained from 'erd-designer://documents' resource.
- perspectiveId: The unique identifier of the perspective to be updated.
  Can be obtained from the perspectives list resource.
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
): McpServerRegisterToolArgs<UpdatePerspectiveInput> => {
    return [
        "update-perspective",
        {
            title: "Update an existing perspective",
            description: descriptionUpdate,
            inputSchema: {
                documentId: z.string()
                    .describe("The unique identifier of the ERD document containing the perspective to update."),
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
            }
        },
        async ({ documentId, perspectiveId, updating }) => {
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                const url = new URL(`erd-designer://documents/${documentId}`);
                throw initResourceNotFound(url);
            }

            const previousDocument = budget.erdDocument;
            const previousSetting = previousDocument.erdSettingModel;

            const previousPerspective = previousSetting.findPerspectiveModel(perspectiveId);
            if (!previousPerspective) {
                const url = new URL(`erd-designer://documents/${documentId}/perspectives/${perspectiveId}`);
                throw initResourceNotFound(url);
            }

            const updatingName = updating.perspectiveName ?? previousPerspective.perspectiveName;
            const updatingDescription = updating.description ?? previousPerspective.description;

            const containIds = new Set(previousPerspective.getContainIds());
            updating.addingIds?.forEach(id => containIds.add(id));
            updating.removingIds?.forEach(id => containIds.delete(id));

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
                        uri: `erd-designer://documents/${documentId}/perspectives/${nextPerspective.perspectiveId}`,
                        name: nextPerspective.perspectiveName,
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};

type DeletePerspectiveInput = {
    readonly documentId: z.ZodString;
    readonly perspectiveId: z.ZodString;
};

const descriptionDelete = `\
Deletes an existing perspective of a specified ERD document.

REQUEST:
- documentId: The unique identifier of the ERD document containing the perspective to be deleted.
  Can be obtained from 'erd-designer://documents' resource.
- perspectiveId: The unique identifier of the perspective to be deleted.
  Can be obtained from the perspectives list resource.

RESPONSE:
A text message indicating the result:
- If the perspective exists and is deleted: A confirmation message with the perspective name.
- If the perspective does not exist: A message indicating that the perspective was not found.
  Note: This operation does not return an error if the perspective doesn't exist.
`;

const mcpDeletePerspective = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<DeletePerspectiveInput> => {
    return [
        "delete-perspective",
        {
            title: "Delete an existing perspective",
            description: descriptionDelete,
            inputSchema: {
                documentId: z.string()
                    .describe("The unique identifier of the ERD document containing the perspective to delete."),
                perspectiveId: z.string()
                    .describe("The unique identifier of the perspective to delete.")
            }
        },
        async ({ documentId, perspectiveId }) => {
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                const url = new URL(`erd-designer://documents/${documentId}`);
                throw initResourceNotFound(url);
            }

            const previousDocument = budget.erdDocument;
            const previousSetting = previousDocument.erdSettingModel;

            const previousPerspective = previousSetting.findPerspectiveModel(perspectiveId);
            if (!previousPerspective) {
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
                        text: `The perspective '${previousPerspective.perspectiveName}' has been deleted.`
                    }
                ]
            };
        }
    ] as const;
};