import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DocumentResource, ErdDocumentBudget } from "~/extension/DocumentResource";
import { initResourceNotFound, McpServerRegisterResourceTemplateArgs } from "~/extension/mcpserver/support";

export const mcpRegisterResourceOfDocumentResource =
    (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs[] => {
        return [
            mcpListDocuments(documentResource),
            mcpFindDocumentById(documentResource),
            mcpFindDocumentByUri(documentResource)
        ];
    };

/**
 * 登録されている全ドキュメント情報の一覧を返却する。
 */
const mcpListDocuments = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-documents",
        new ResourceTemplate("erd-designer://documents", { list: undefined }),
        {
            title: "List erd designer documents",
            description: "List all erd designer documents"
        },
        async (url) => {
            const budgets = documentResource.fetchDocuments();
            const responses = budgets.map(budget => convertBudget(budget));

            return {
                contents: [
                    {
                        uri: url.href,
                        text: JSON.stringify(responses),
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};

/**
 * 指定された documentId に該当するドキュメント情報を返却する。
 */
const mcpFindDocumentById = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-document-by-id",
        new ResourceTemplate("erd-designer://document/{documentId}", { list: undefined }),
        {
            title: "Find erd designer document by documentId",
            description: "Find erd designer document by documentId"
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const response = convertBudget(budget);
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

/**
 * 指定された uri に該当するドキュメント情報を返却する。
 */
const mcpFindDocumentByUri = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-document-by-uri",
        new ResourceTemplate("file://{+filepath}", { list: undefined }),
        {
            title: "Find erd designer document by uri",
            description: "Find erd designer document by uri"
        },
        async (url) => {
            const budget = documentResource.findByUri(url.href);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const response = convertBudget(budget);
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

const convertBudget = (budget: ErdDocumentBudget) => {
    return {
        documentId: budget.documentId,
        uri: budget.uri,
        documentName: budget.erdDocument.documentName,
        database: budget.erdDocument.getDatabase().name,
        lastUpdatedAt: budget.erdDocument.lastUpdatedAt.toISOString()
    };
};