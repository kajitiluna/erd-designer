import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, initResourceNotFound, initResourceResponse,
    McpRegisterConfig, McpServerRegisterResourceArgs, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import { toTableSummary } from "~/extension/mcpserver/tables";
import DisplayStyle from "~/models/database/DisplayStyle";

export const mcpRegisterErdDocument = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [
            mcpListDocuments(documentResource)
        ],
        resourceTemplates: [
            mcpFindDocumentById(documentResource),
            mcpFindDocumentByUri(documentResource)
        ],
        tools: [
            mcpUpdateDocument(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of currently accessible ERD documents.
To manipulate ERD documents from the MCP Server, the corresponding document must be open in VSCode.

RESPONSE:
An array of document summary objects, each containing:
- uri: The unique URI of the document (format: erd-designer://documents/{documentId}). 
  Use this identifier to access document-specific resources.
- documentId: The unique identifier of the document (auto-generated UUID).
- filePath: The file path of the document in the file system.
- documentName: The name of the document.
- databaseName: The name of the database associated with the document.
- lastUpdatedAt: The date and time when the document was last updated (ISO 8601 format).
`;

/**
 * 登録されている全ドキュメント情報の一覧を返却する。
 */
const mcpListDocuments = (documentResource: DocumentResource): McpServerRegisterResourceArgs => {
    return [
        "list-documents",
        uriTemplates.documents,
        {
            title: "List ERD documents",
            description: descriptionList,
            mimeType: "application/json"
        },
        async (url) => {
            const budgets = documentResource.fetchDocuments();
            const responses = budgets.map(erdBudget => toSummary(erdBudget));

            return initResourceResponse(url, responses);
        }
    ] as const;
};

const toSummary = (budget: DocumentBudget) => {
    return {
        uri: budget.documentUri(),
        documentId: budget.documentId,
        filePath: budget.fileUri,
        documentName: budget.erdDocument.documentName,
        databaseName: budget.erdDocument.getDatabase().name,
        lastUpdatedAt: budget.erdDocument.lastUpdatedAt.toISOString()
    };
};

const descriptionFindById = `\
Retrieves detailed information about an ERD document using its documentId.
This resource returns URIs for accessing detailed information about the corresponding ERD document.
To retrieve tables, relations, and other information, access them through their respective resources using the URIs provided.

COORDINATE SYSTEM:
All position coordinates in this document use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right (positive values = right of center, negative values = left of center)
- Y-axis: increases downward (positive values = below center, negative values = above center)
When specifying or moving element positions, use this coordinate system as reference.

REQUEST (path variables):
- documentId: The unique identifier of the document to retrieve.
  Can be obtained from 'erd-designer://documents' resource.

RESPONSE:
An object containing detailed document information:
- uri: The unique URI of the document (format: erd-designer://documents/{documentId}).
- documentId: The unique identifier of the document (auto-generated UUID).
- filePath: The file path of the document in the file system.
- documentName: The name of the document.
- database: Information about the database, including:
  - uri: The URI to access database details.
  - databaseName: The name of the database.
- tables: An array of table objects, each containing:
  - uri: The URI to access detailed table information.
  - tableId: The unique identifier of the table.
  - tableName: Object with physical and logical names.
  - view: Display settings including position, size, and color.
- relations: An array of relation objects, each containing:
  - uri: The URI to access detailed relation information.
  - relationId: The unique identifier of the relation.
  - relationName: The name of the relation.
  - parentTableId: The id of the parent table.
  - childTableId: The id of the child table.
- memos: An array of memo objects, each containing:
  - uri: The URI to access detailed memo information.
  - memoId: The unique identifier of the memo.
  - view: Display settings including position, size, and color.
- setting: URIs for accessing various document settings:
  - perspectives: URI to access perspective settings.
  - columnGroups: URI to access column group settings.
  - schemas: URI to access schema settings (only if database supports schemas).
- lastUpdatedAt: The date and time when the document was last updated (ISO 8601 format).
`;

/**
 * 指定された documentId に該当するドキュメント情報を返却する。
 */
const mcpFindDocumentById = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-document-by-id",
        new ResourceTemplate(uriTemplates.documentDetail, { list: undefined }),
        {
            title: "Find ERD document by documentId",
            description: descriptionFindById
        },
        initCallbackForFindById(documentResource)
    ] as const;
};

const initCallbackForFindById = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const budget = documentResource.findById(documentId);
        if (budget == null) {
            throw initResourceNotFound(url);
        }

        const response = toDetail(budget);
        return initResourceResponse(url, response);
    };
};

const toDetail = (erdBudget: DocumentBudget) => {
    const erdDocument = erdBudget.erdDocument;

    const tableViews = erdDocument.getTableViewModels()
        .map(tableView => toTableSummary(erdBudget, tableView));

    const relationModels = erdDocument.getRelationViewModels()
        .map(relationView => {
            return {
                uri: erdBudget.relationUri(relationView.relationId),
                relationId: relationView.relationId,
                relationName: relationView.relationModel.relationName,
                parentTableId: relationView.parentTableModelId,
                childTableId: relationView.childTableModelId
            };
        });

    const memoInfo = erdDocument.getMemoViewModels();
    const memos = [...memoInfo.frontMemos, ...memoInfo.backMemos]
        .map(memoView => {
            return {
                uri: erdBudget.memoUri(memoView.memoId),
                memoId: memoView.memoId,
                view: {
                    position: {
                        x: memoView.rectangleViewModel.left,
                        y: memoView.rectangleViewModel.top
                    },
                    size: {
                        width: memoView.rectangleViewModel.width,
                        height: memoView.rectangleViewModel.height
                    },
                    color: {
                        background: memoView.backgroundColor.toHex(),
                        foreground: memoView.foregroundColor.toHex()
                    }
                }
            };
        });

    const database = erdDocument.getDatabase();

    return {
        uri: erdBudget.documentUri(),
        documentId: erdBudget.documentId,
        filePath: erdBudget.fileUri,
        documentName: erdDocument.documentName,
        database: {
            uri: erdBudget.databaseUri(),
            databaseName: database.name,
        },
        tables: tableViews,
        relations: relationModels,
        memos: memos,
        setting: {
            perspectives: { uri: erdBudget.perspectiveListUri() },
            columnGroups: { uri: erdBudget.columnGroupListUri() },
            ...(database.supportsSchema && {
                schemas: { uri: erdBudget.schemaListUri() }
            })
        },

        lastUpdatedAt: erdDocument.lastUpdatedAt.toISOString()
    };
};

const descriptionFindByUri = `\
Retrieves detailed information about an ERD document using its file URI.
This resource returns URIs for accessing detailed information about the corresponding ERD document.
To retrieve tables, relations, and other information, access them through their respective resources using the URIs provided.

COORDINATE SYSTEM:
All position coordinates in this document use a canvas coordinate system where:
- The origin (0, 0) is at the center of the canvas
- X-axis: increases to the right (positive values = right of center, negative values = left of center)
- Y-axis: increases downward (positive values = below center, negative values = above center)
When specifying or moving element positions, use this coordinate system as reference.

REQUEST:
- The full file URI of the document to retrieve (e.g., file:///path/to/document.erd).
  This must be a file URI of a document currently open in VSCode.

RESPONSE:
An object containing detailed document information (same structure as find-document-by-id):
- uri: The unique URI of the document (format: erd-designer://documents/{documentId}).
- documentId: The unique identifier of the document (auto-generated UUID).
- filePath: The file path of the document in the file system.
- documentName: The name of the document.
- database: Information about the database, including:
  - uri: The URI to access database details.
  - databaseName: The name of the database.
- tables: An array of table objects, each containing:
  - uri: The URI to access detailed table information.
  - tableId: The unique identifier of the table.
  - tableName: Object with physical and logical names.
  - view: Display settings including position, size, and color.
- relations: An array of relation objects, each containing:
  - uri: The URI to access detailed relation information.
  - relationId: The unique identifier of the relation.
  - relationName: The name of the relation.
  - parentTableId: The id of the parent table.
  - childTableId: The id of the child table.
- memos: An array of memo objects, each containing:
  - uri: The URI to access detailed memo information.
  - memoId: The unique identifier of the memo.
  - view: Display settings including position, size, and color.
- setting: URIs for accessing various document settings:
  - perspectives: URI to access perspective settings.
  - columnGroups: URI to access column group settings.
  - schemas: URI to access schema settings (only if database supports schemas).
- lastUpdatedAt: The date and time when the document was last updated (ISO 8601 format).
`;

/**
 * 指定された uri に該当するドキュメント情報を返却する。
 */
const mcpFindDocumentByUri = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-document-by-uri",
        new ResourceTemplate("file://{+filepath}", { list: undefined }),
        {
            title: "Find ERD document by uri",
            description: descriptionFindByUri
        },
        initCallbackForFindByUri(documentResource)
    ] as const;
};

const initCallbackForFindByUri = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url) => {
        const erdBudget = documentResource.findByUri(url.href);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const response = toDetail(erdBudget);
        return {
            contents: [
                {
                    uri: erdBudget.fileUri,
                    text: JSON.stringify(response),
                    mimeType: "application/json"
                }
            ]
        };
    };
};

const descriptionUpdate = `\
Updates the name or display style of an existing ERD document.
You can update either the document name, the display style, or both properties simultaneously.

REQUEST:
- documentId: The unique identifier of the document to be updated.
  Can be obtained from 'erd-designer://documents' resource.
- document: An object containing the fields to be updated (all fields are optional):
  - documentName: The new name for the document. Leading and trailing whitespace will be trimmed.
  - displayStyle: The new display style for the document. Must be one of:
    - 'physical': Display only physical names
    - 'logical': Display only logical names
    - 'both': Display both physical and logical names
  
  Note: If no fields are provided, the document remains unchanged.
  At least one field should be provided to make meaningful changes.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated document (format: erd-designer://documents/{documentId}).
- name: The updated document name.
- mimeType: "application/json"
`;

const mcpUpdateDocument = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateDocumentInputSchema> => {
    return [
        "update-document",
        {
            title: "Update the name or display style of ERD document",
            description: descriptionUpdate,
            inputSchema: updateDocumentInputSchema
        },
        initCallbackForUpdatingDocument(documentResource)
    ] as const;
};

const updateDocumentInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    document: z.object({
        documentName: z.string().optional()
            .describe("The new name for the document."),
        displayStyle: z.enum(["both", "physical", "logical"]).optional()
            .describe("The new display style for the document ('physical', 'logical', or 'both').")
    }).describe("The document properties to update.")
};

const initCallbackForUpdatingDocument = (
    documentResource: DocumentResource
): ToolCallback<typeof updateDocumentInputSchema> => {
    return async ({ documentId, document: inputDocument }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;
        const previousSetting = previousDocument.erdSettingModel;

        let nextDocument = previousDocument;
        if (inputDocument.documentName) {
            nextDocument = nextDocument.updateDocumentName(inputDocument.documentName.trim());
        }
        if (inputDocument.displayStyle) {
            const nextStyle = toDisplayStyle(inputDocument.displayStyle);
            const nextSetting = previousSetting.update({ displayStyle: nextStyle });
            nextDocument = nextDocument.updateErdSetting(nextSetting);
        }

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.documentUri(),
                    name: nextDocument.documentName,
                    mimeType: "application/json"
                }
            ]
        };
    }
};

const toDisplayStyle = (style: "both" | "physical" | "logical"): DisplayStyle => {
    switch (style) {
        case "both":
            return DisplayStyle.BOTH;
        case "physical":
            return DisplayStyle.PHYSICAL;
        case "logical":
            return DisplayStyle.LOGICAL;
    }
};