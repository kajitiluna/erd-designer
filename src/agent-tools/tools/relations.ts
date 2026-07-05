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
import RelationModel from "~/models/database/RelationModel";
import RelationPair from "~/models/database/RelationPair";
import ErdDocument from "~/models/ErdDocument";
import LineViewModel from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";

export const mcpRegisterRelation = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListRelationsResource(documentResource),
            mcpFindRelationResource(documentResource)
        ],
        tools: [
            mcpListRelationsTool(documentResource),
            mcpFindRelationTool(documentResource),
            mcpCreateRelation(documentResource),
            mcpUpdateRelation(documentResource),
            mcpDeleteRelation(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const cardinalitySchema = z.enum(["1", "0..1", "0..N", "1..N"]);
const referentialActionSchema = z.enum(["RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT"]);

// ==================== list-relations ====================

const descriptionList = `\
Retrieves a list of relations from the specified ERD document.
Each relation defines a foreign key relationship between a parent table and a child table.
Supports optional filtering to narrow down the results.

REQUEST:
- documentId: The unique identifier of the ERD document whose relations are to be listed.
  Can be obtained by calling the 'list-documents' tool.

REQUEST (filter parameters - all optional):
- filter.parentTableIds: Filter relations whose parent table ID matches exactly (AND condition).
  Example: { "filter": { "parentTableIds": ["table-123"] } }
- filter.childTableIds: Filter relations whose child table ID matches exactly (AND condition).
- filter.relationNameContains: Filter relations whose name contains the specified strings (AND condition).

EXAMPLES:
- All relations:
  { "documentId": "doc123" }
- Relations between two specific tables:
  { "documentId": "doc123", "filter": { "parentTableIds": ["table-123"], "childTableIds": ["table-456"] } }

RESPONSE:
An array of relation objects, each containing:
- uri: The unique URI of the relation (format: erd-designer://documents/{documentId}/relations/{relationId}).
- relationId: The unique identifier of the relation (auto-generated UUID).
- relationName: The name of the relation.
- parentTableId: The id of the parent table.
- parentCardinality: The cardinality on the parent side ("1", "0..1", "0..N", "1..N").
- childTableId: The id of the child table.
- childCardinality: The cardinality on the child side ("1", "0..1", "0..N", "1..N").
- relationPairs: Array of column pairs, each containing parentColumnId and childColumnId.
- onUpdateAction: The referential action on update ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT").
- onDeleteAction: The referential action on delete ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT").
- view: Display settings object containing:
  - lineType: The type of line ("points" or "orthogonal").
  - edges: Array of edge points (only when lineType is "points"), each with x and y coordinates.
  - lines: Array of line segments (only when lineType is "orthogonal"), each with direction and position.
`;

const mcpListRelationsResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-relations",
        new ResourceTemplate(uriTemplates.relations, { list: undefined }),
        {
            title: "List relations of a specified ERD document",
            description: descriptionList
        },
        initResourceCallbackForListRelations(documentResource)
    ] as const;
};

const initResourceCallbackForListRelations = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const emptyFilter: RelationFilterParams = {
            parentTableIds: [], childTableIds: [], relationNameContains: []
        };
        const responses = listRelationResponses(documentResource, documentId, emptyFilter);

        return initResourceResponse(url, responses);
    };
};

const listRelationsInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    filter: z.object({
        parentTableIds: z.array(z.string()).optional()
            .describe("Filter relations whose parent table ID matches exactly (AND condition)."),
        childTableIds: z.array(z.string()).optional()
            .describe("Filter relations whose child table ID matches exactly (AND condition)."),
        relationNameContains: z.array(z.string()).optional()
            .describe("Filter relations whose name contains the specified strings (AND condition)."),
    }).optional(),
};

const mcpListRelationsTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof listRelationsInputSchema> => {
    return [
        "list-relations",
        {
            title: "List relations of a specified ERD document",
            description: descriptionList,
            inputSchema: listRelationsInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListRelations(documentResource)
    ] as const;
};

const initCallbackForListRelations = (
    documentResource: DocumentResource
): ToolCallback<typeof listRelationsInputSchema> => {
    return async ({ documentId, filter }) => {
        const params: RelationFilterParams = {
            parentTableIds: filter?.parentTableIds ?? [],
            childTableIds: filter?.childTableIds ?? [],
            relationNameContains: filter?.relationNameContains ?? [],
        };
        const responses = listRelationResponses(documentResource, documentId, params);

        return initToolJsonResponse(responses);
    };
};

type RelationFilterParams = {
    parentTableIds: string[];
    childTableIds: string[];
    relationNameContains: string[];
};

const listRelationResponses = (
    documentResource: DocumentResource, documentId: string, params: RelationFilterParams
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);
    const relationViews = doFilterRelations(params, erdDocument);

    return relationViews.map(relationView => toRelationDetail(erdBudget, relationView));
};

const doFilterRelations = (params: RelationFilterParams, erdDocument: ErdDocument) => {
    const { parentTableIds, childTableIds, relationNameContains } = params;

    return erdDocument.getRelationViewModels().filter(relationView => {
        const relationModel = relationView.relationModel;

        const matchedParentTableId = (parentTableIds.length === 0)
            || parentTableIds.some(filtering => relationModel.parentTableModelId === filtering);
        if (matchedParentTableId === false) {
            return false;
        }

        const matchedChildTableId = (childTableIds.length === 0)
            || childTableIds.some(filtering => relationModel.childTableModelId === filtering);
        if (matchedChildTableId === false) {
            return false;
        }

        const matchedRelationName = (relationNameContains.length === 0)
            || relationNameContains.every(filtering => relationModel.relationName.includes(filtering));
        if (matchedRelationName === false) {
            return false;
        }

        return true;
    });
};

// ==================== find-relation ====================

const descriptionFind = `\
Retrieves detailed information about a specific relation from the specified ERD document using its relationId.

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- relationId: The unique identifier of the relation to retrieve.
  Can be obtained by calling the 'list-relations' tool or from the document's relations array.

RESPONSE:
An object containing detailed information about the specified relation:
- uri: The unique URI of the relation (format: erd-designer://documents/{documentId}/relations/{relationId}).
- relationId: The unique identifier of the relation (auto-generated UUID).
- relationName: The name of the relation.
- parentTableId: The id of the parent table.
- parentCardinality: The cardinality on the parent side ("1", "0..1", "0..N", "1..N").
- childTableId: The id of the child table.
- childCardinality: The cardinality on the child side ("1", "0..1", "0..N", "1..N").
- relationPairs: Array of column pairs, each containing parentColumnId and childColumnId.
- onUpdateAction: The referential action on update ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT").
- onDeleteAction: The referential action on delete ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT").
- view: Display settings object containing:
  - lineType: The type of line ("points" or "orthogonal").
  - edges: Array of edge points (only when lineType is "points"), each with x and y coordinates.
  - lines: Array of line segments (only when lineType is "orthogonal"), each with direction and position.
`;

const mcpFindRelationResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-relation",
        new ResourceTemplate(uriTemplates.relationDetail, { list: undefined }),
        {
            title: "Find a relation of a specified ERD document",
            description: descriptionFind
        },
        initResourceCallbackForFindRelation(documentResource)
    ] as const;
};

const initResourceCallbackForFindRelation = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const relationId = variables.relationId as string;
        const response = findRelationResponse(documentResource, documentId, relationId);

        return initResourceResponse(url, response);
    };
};

const findRelationInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    relationId: z.string().describe("The unique identifier of the relation to retrieve.")
};

const mcpFindRelationTool = (documentResource: DocumentResource): McpServerRegisterToolArgs<typeof findRelationInputSchema> => {
    return [
        "find-relation",
        {
            title: "Find a relation of a specified ERD document",
            description: descriptionFind,
            inputSchema: findRelationInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindRelation(documentResource)
    ] as const;
};

const initCallbackForFindRelation = (
    documentResource: DocumentResource
): ToolCallback<typeof findRelationInputSchema> => {
    return async ({ documentId, relationId }) => {
        const response = findRelationResponse(documentResource, documentId, relationId);
        return initToolJsonResponse(response);
    };
};

const findRelationResponse = (
    documentResource: DocumentResource, documentId: string, relationId: string
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    const relationView = erdDocument.findRelationViewModel(relationId);
    if (relationView == null) {
        const url = new URL(erdBudget.relationUri(relationId));
        throw initResourceNotFound(url);
    }

    return toRelationDetail(erdBudget, relationView);
};

// ==================== create-relation ====================

const descriptionCreateRelation = `\
Creates a new relation (foreign key relationship) between two tables in a specified ERD document.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- relation: The relation specification:
  - relationName: (optional) The name of the relation.
  - parentTableId: The Id of the parent table (required).
  - parentCardinality: The cardinality on the parent side ("1", "0..1", "0..N", "1..N"). Default: "1".
  - childTableId: The Id of the child table (required).
  - childCardinality: The cardinality on the child side ("1", "0..1", "0..N", "1..N"). Default: "1".
  - relationPairs: An array of column pairs, each containing:
    - parentColumnId: The Id of the parent column.
    - childColumnId: The Id of the child column.
  - onUpdateAction: (optional) The referential action on update ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT"). Default: "RESTRICT".
  - onDeleteAction: (optional) The referential action on delete ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT"). Default: "RESTRICT".

RESPONSE:
An object containing the created relation information (same format as relation detail resource).
`;

const mcpCreateRelation = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof createRelationInputSchema> => {
    return [
        "create-relation",
        {
            title: "Create a new relation in a specified ERD document",
            description: descriptionCreateRelation,
            inputSchema: createRelationInputSchema
        },
        initCallbackForCreateRelation(documentResource)
    ] as const;
};

const createRelationInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    relation: z.object({
        relationName: z.string().optional().describe("The name of the relation."),
        parentTableId: z.string().describe("The Id of the parent table."),
        parentCardinality: cardinalitySchema.optional().describe("The cardinality on the parent side."),
        childTableId: z.string().describe("The Id of the child table."),
        childCardinality: cardinalitySchema.optional().describe("The cardinality on the child side."),
        relationPairs: z.array(
            z.object({
                parentColumnId: z.string().describe("The Id of the parent column."),
                childColumnId: z.string().describe("The Id of the child column.")
            }).strict()
        ).min(1, "At least one column pair is required.").describe("The column pairs for the relation."),
        onUpdateAction: referentialActionSchema.optional().describe("The referential action on update."),
        onDeleteAction: referentialActionSchema.optional().describe("The referential action on delete.")
    }).strict().describe("The relation to create.")
};

const initCallbackForCreateRelation = (
    documentResource: DocumentResource
): ToolCallback<typeof createRelationInputSchema> => {
    return async ({ documentId, relation: input }) => {
        const { erdBudget, erdDocument: previousDocument, parentColumnIds, childColumnIds } =
            doFindDocumentAndTables(documentResource, documentId, {
                parentTableId: input.parentTableId, childTableId: input.childTableId
            });

        const relationPairs = input.relationPairs.map(pair => {
            if (parentColumnIds.has(pair.parentColumnId) === false) {
                throw initInvalidParams(`Parent column not found: ${pair.parentColumnId}`);
            }
            if (childColumnIds.has(pair.childColumnId) === false) {
                throw initInvalidParams(`Child column not found: ${pair.childColumnId}`);
            }

            if ((input.parentTableId === input.childTableId) && (pair.parentColumnId === pair.childColumnId)) {
                throw initInvalidParams(`A relation cannot have the same column as both parent and child: ${pair.parentColumnId}`);
            }

            return new RelationPair({
                parentColumnModelId: pair.parentColumnId,
                childColumnModelId: pair.childColumnId
            });
        });

        const relationModel = new RelationModel({
            relationName: input.relationName || "",
            parentTableModelId: input.parentTableId,
            parentCardinality: input.parentCardinality || "1",
            childTableModelId: input.childTableId,
            childCardinality: input.childCardinality || "1",
            relationPairs: relationPairs,
            onUpdateAction: input.onUpdateAction || "RESTRICT",
            onDeleteAction: input.onDeleteAction || "RESTRICT"
        });

        const relationView = new RelationViewModel({
            relationModel: relationModel,
            lineViewModel: new LineViewModel({})
        });

        const nextDocument = previousDocument.updateRelation(relationView);
        documentResource.notify(documentId, nextDocument);

        const createdView = nextDocument.findRelationViewModel(relationModel.relationModelId);
        const response = toRelationDetail(erdBudget, createdView || relationView);

        return initToolJsonResponse(response);
    };
};

// ==================== update-relation ====================

const descriptionUpdateRelation = `\
Updates an existing relation in a specified ERD document.
Only the properties you specify will be updated; other properties will remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- relationId: The unique identifier of the relation to update.
- relation: The properties to update (all fields are optional):
  - relationName: The new name of the relation.
  - parentTableId: The new parent table ID.
  - parentCardinality: The new parent cardinality.
  - childTableId: The new child table ID.
  - childCardinality: The new child cardinality.
  - relationPairs: The new column pairs.
  - onUpdateAction: The new referential action on update.
  - onDeleteAction: The new referential action on delete.

RESPONSE:
An object containing the updated relation information (same format as relation detail resource).
`;

const mcpUpdateRelation = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateRelationInputSchema> => {
    return [
        "update-relation",
        {
            title: "Update a relation in a specified ERD document",
            description: descriptionUpdateRelation,
            inputSchema: updateRelationInputSchema
        },
        initCallbackForUpdateRelation(documentResource)
    ] as const;
};

const updateRelationInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    relationId: z.string().describe("The unique identifier of the relation to update."),
    relation: z.object({
        relationName: z.string().optional().describe("The new name of the relation."),
        parentTableId: z.string().optional().describe("The new parent tableId."),
        parentCardinality: cardinalitySchema.optional().describe("The new parent cardinality."),
        childTableId: z.string().optional().describe("The new child tableId."),
        childCardinality: cardinalitySchema.optional().describe("The new child cardinality."),
        relationPairs: z.array(
            z.object({
                parentColumnId: z.string().describe("The Id of the parent column."),
                childColumnId: z.string().describe("The Id of the child column.")
            }).strict()
        ).min(1, "At least one column pair is required.").optional()
            .describe("The new column pairs for the relation."),
        onUpdateAction: referentialActionSchema.optional().describe("The new referential action on update."),
        onDeleteAction: referentialActionSchema.optional().describe("The new referential action on delete.")
    }).describe("The relation properties to update.")
};

const initCallbackForUpdateRelation = (documentResource: DocumentResource): ToolCallback<typeof updateRelationInputSchema> => {
    return async ({ documentId, relationId, relation: updating }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const previousRelationView = previousDocument.findRelationViewModel(relationId);
        if (previousRelationView == null) {
            const url = new URL(erdBudget.relationUri(relationId));
            throw initResourceNotFound(url);
        }

        const previousRelation = previousRelationView.relationModel;
        const targetRelationPairs = updating.relationPairs ?? previousRelation.relationPairs.map(pair => {
            return { parentColumnId: pair.parentColumnModelId, childColumnId: pair.childColumnModelId };
        });

        const parentTableId = updating.parentTableId ?? previousRelation.parentTableModelId;
        const childTableId = updating.childTableId ?? previousRelation.childTableModelId;
        const { parentColumnIds, childColumnIds } =
            doFindDocumentAndTables(documentResource, documentId, { parentTableId, childTableId });

        const nextRelationPairs = targetRelationPairs.map(pair => {
            if (parentColumnIds.has(pair.parentColumnId) === false) {
                throw initInvalidParams(`Parent column not found: ${pair.parentColumnId}`);
            }
            if (childColumnIds.has(pair.childColumnId) === false) {
                throw initInvalidParams(`Child column not found: ${pair.childColumnId}`);
            }

            if ((parentTableId === childTableId) && (pair.parentColumnId === pair.childColumnId)) {
                throw initInvalidParams(`A relation cannot have the same column as both parent and child: ${pair.parentColumnId}`);
            }

            return new RelationPair({
                parentColumnModelId: pair.parentColumnId,
                childColumnModelId: pair.childColumnId
            });
        });

        const nextModel = new RelationModel({
            relationModelId: previousRelation.relationModelId,
            relationName: updating.relationName ?? previousRelation.relationName,
            parentTableModelId: parentTableId,
            parentCardinality: updating.parentCardinality ?? previousRelation.parentCardinality,
            childTableModelId: childTableId,
            childCardinality: updating.childCardinality ?? previousRelation.childCardinality,
            relationPairs: nextRelationPairs,
            onUpdateAction: updating.onUpdateAction ?? previousRelation.onUpdateAction,
            onDeleteAction: updating.onDeleteAction ?? previousRelation.onDeleteAction
        });

        const nextView = previousRelationView.updateRelationModel(nextModel);
        const nextDocument = previousDocument.updateRelation(nextView);
        documentResource.notify(documentId, nextDocument);

        const updatedView = nextDocument.findRelationViewModel(relationId);
        const response = toRelationDetail(erdBudget, updatedView || nextView);

        return initToolJsonResponse(response);
    };
};

// ==================== delete-relation ====================

const descriptionDeleteRelation = `\
Deletes a relation from a specified ERD document.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- relationId: The unique identifier of the relation to delete.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteRelation = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteRelationInputSchema> => {
    return [
        "delete-relation",
        {
            title: "Delete a relation from a specified ERD document",
            description: descriptionDeleteRelation,
            inputSchema: deleteRelationInputSchema
        },
        initCallbackForDeleteRelation(documentResource)
    ] as const;
};

const deleteRelationInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    relationId: z.string().describe("The unique identifier of the relation to delete.")
};

const initCallbackForDeleteRelation = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteRelationInputSchema> => {
    return async ({ documentId, relationId }) => {
        const { erdBudget, erdDocument: previousDocument } = findDocument(documentResource, documentId);
        const relationView = previousDocument.findRelationViewModel(relationId);
        if (relationView == null) {
            const url = new URL(erdBudget.relationUri(relationId));
            throw initResourceNotFound(url);
        }

        const nextDocument = previousDocument.deleteRelation(relationId);
        documentResource.notify(documentId, nextDocument);

        return initToolJsonResponse({ success: true });
    };
};

// ==================== shared helpers ====================

const doFindDocumentAndTables = (
    documentResource: DocumentResource, documentId: string, input: { parentTableId: string, childTableId: string }
) => {
    const { erdBudget, erdDocument } = findDocument(documentResource, documentId);

    const parentTableView = erdDocument.findTableViewModel(input.parentTableId);
    if (parentTableView == null) {
        const url = new URL(uriTemplates.tableFor(documentId, input.parentTableId));
        throw initResourceNotFound(url);
    }

    const childTableView = erdDocument.findTableViewModel(input.childTableId);
    if (childTableView == null) {
        const url = new URL(uriTemplates.tableFor(documentId, input.childTableId));
        throw initResourceNotFound(url);
    }

    const parentTable = parentTableView.tableModel;
    const childTable = childTableView.tableModel;

    const parentColumnIds = new Set(erdDocument.toAllColumnModels(parentTable).map(model => model.columnModelId));
    const childColumnIds = new Set(erdDocument.toAllColumnModels(childTable).map(model => model.columnModelId));

    return { erdBudget, erdDocument, parentColumnIds, childColumnIds };
};

export const toRelationSummary = (erdBudget: DocumentBudget, relationModel: RelationModel) => {
    return {
        uri: erdBudget.relationUri(relationModel.relationModelId),
        relationId: relationModel.relationModelId,
        relationName: relationModel.relationName,
        parentTableId: relationModel.parentTableModelId,
        parentCardinality: relationModel.parentCardinality,
        childTableId: relationModel.childTableModelId,
        childCardinality: relationModel.childCardinality,
        relationPairs: relationModel.relationPairs.map(pair => {
            return {
                parentColumnId: pair.parentColumnModelId,
                childColumnId: pair.childColumnModelId
            };
        }),
        onUpdateAction: relationModel.onUpdateAction,
        onDeleteAction: relationModel.onDeleteAction
    };
};

const toRelationDetail = (erdBudget: DocumentBudget, relationView: RelationViewModel) => {
    const relationModel = relationView.relationModel;
    const lineViewModel = relationView.lineViewModel;

    const view = lineViewModel.lineType === "orthogonal"
        ? {
            lineType: "orthogonal" as const,
            lines: lineViewModel.orthogonalLines.map(line => {
                return {
                    direction: line.direction,
                    position: line.position
                };
            })
        }
        : {
            lineType: "points" as const,
            edges: lineViewModel.edges.map(edge => {
                return {
                    x: edge.x,
                    y: edge.y
                };
            })
        };

    return {
        ...toRelationSummary(erdBudget, relationModel),
        view: view
    };
};
