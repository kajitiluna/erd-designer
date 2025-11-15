import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DocumentResource, ErdDocumentBudget } from "~/extension/DocumentResource";
import {
    initResourceNotFound, McpRegisterConfig, McpServerRegisterResourceArgs, McpServerRegisterResourceTemplateArgs
} from "~/extension/mcpserver/support";
import { toTableSummary } from "~/extension/mcpserver/tables";

export const mcpRegisterErdDocument = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [
            mcpListDocuments(documentResource)
        ],
        resourceTemplates: [
            mcpFindDocumentById(documentResource),
            mcpFindDocumentByUri(documentResource)
        ],
        tools: []
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
        "erd-designer://documents",
        {
            title: "List ERD documents",
            description: descriptionList,
            mimeType: "application/json"
        },
        async (url) => {
            const budgets = documentResource.fetchDocuments();
            const responses = budgets.map(budget => toSummary(budget));

            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(responses)
                    }
                ]
            };
        }
    ] as const;
};

const toSummary = (budget: ErdDocumentBudget) => {
    return {
        uri: `erd-designer://documents/${budget.documentId}`,
        documentId: budget.documentId,
        filePath: budget.uri,
        documentName: budget.erdDocument.documentName,
        databaseName: budget.erdDocument.getDatabase().name,
        lastUpdatedAt: budget.erdDocument.lastUpdatedAt.toISOString()
    };
};

const descriptionFindById = `\
Retrieves detailed information about an ERD document using its documentId.
This resource returns URIs for accessing detailed information about the corresponding ERD document.
To retrieve tables, relations, and other information, access them through their respective resources using the URIs provided.

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
        new ResourceTemplate("erd-designer://documents/{documentId}", { list: undefined }),
        {
            title: "Find ERD document by documentId",
            description: descriptionFindById
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const response = toDetail(budget);
            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(response),
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};

const toDetail = (budget: ErdDocumentBudget) => {
    const documentUri = `erd-designer://documents/${budget.documentId}`;
    const documentId = budget.documentId;
    const erdDocument = budget.erdDocument;

    const tableViews = erdDocument.getTableViewModels()
        .map(tableView => toTableSummary(documentId, tableView, budget.rectangles));

    const relationModels = erdDocument.getRelationViewModels()
        .map(relationView => {
            return {
                uri: `${documentUri}/relations/${relationView.relationId}`,
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
                uri: `${documentUri}/memos/${memoView.memoId}`,
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
        uri: documentUri,
        documentId: budget.documentId,
        filePath: budget.uri,
        documentName: erdDocument.documentName,
        database: {
            uri: `${documentUri}/database`,
            databaseName: database.name,
        },
        tables: tableViews,
        relations: relationModels,
        memos: memos,
        setting: {
            perspectives: {
                uri: `${documentUri}/perspectives`
            },
            columnGroups: {
                uri: `${documentUri}/column-groups`
            },
            ...(database.supportsSchema && {
                schemas: {
                    uri: `${documentUri}/schemas`
                }
            })
        },

        lastUpdatedAt: erdDocument.lastUpdatedAt.toISOString()
    };
};

const descriptionFindByUri = `\
Retrieves detailed information about an ERD document using its file URI.
This resource returns URIs for accessing detailed information about the corresponding ERD document.
To retrieve tables, relations, and other information, access them through their respective resources using the URIs provided.

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
        async (url) => {
            const budget = documentResource.findByUri(url.href);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const response = toDetail(budget);
            return {
                contents: [
                    {
                        uri: budget.uri,
                        text: JSON.stringify(response),
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};
