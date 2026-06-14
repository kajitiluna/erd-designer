import {
    ReadResourceTemplateCallback, ResourceTemplate, ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, findDocument, initResourceResponse, initToolJsonResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import DocumentBudget from "~/extension/mcpserver/DocumentBudget";

export const mcpRegisterDatabase = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            resourceFindDatabase(documentResource)
        ],
        tools: [
            mcpFetchDatabaseTool(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== find-database ====================

const descriptionFetchDatabase = `\
Retrieves database configuration information for the specified ERD document.
This tool provides details about the database settings including the database name and available column types.

REQUEST:
- documentId: The unique identifier of the ERD document whose database information is to be retrieved.
  Can be obtained by calling the 'list-documents' tool.

RESPONSE:
An object containing database information:
- databaseName: The name of the database associated with the document.
- columnTypes: An array of available column types, each containing:
  - name: The name of the column type.
  - Other type-specific properties as defined by the database.\
`;

const resourceFindDatabase = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-database",
        new ResourceTemplate(uriTemplates.database, { list: undefined }),
        {
            title: "Find Database Information of a specified ERD document",
            description: descriptionFetchDatabase
        },
        initResourceCallbackForFindDatabase(documentResource)
    ] as const;
};

const initResourceCallbackForFindDatabase = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const { erdBudget } = findDocument(documentResource, documentId);

        const response = toDatabaseDetail(erdBudget);
        return initResourceResponse(url, response);
    };
};

const fetchDatabaseInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID)
};

const mcpFetchDatabaseTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof fetchDatabaseInputSchema> => {
    return [
        "fetch-database",
        {
            title: "Fetch Database Information of a specified ERD document",
            description: descriptionFetchDatabase,
            inputSchema: fetchDatabaseInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFetchDatabase(documentResource)
    ] as const;
};

const initCallbackForFetchDatabase = (
    documentResource: DocumentResource
): ToolCallback<typeof fetchDatabaseInputSchema> => {
    return async ({ documentId }) => {
        const { erdBudget } = findDocument(documentResource, documentId);

        const response = toDatabaseDetail(erdBudget);
        return initToolJsonResponse(response);
    };
};

const toDatabaseDetail = (erdBudget: DocumentBudget) => {
    const databaseSetting = erdBudget.erdDocument.databaseSettingModel;

    return {
        databaseName: databaseSetting.getDatabase().name,
        columnTypes: databaseSetting.columnTypes.map(columnType => columnType.toJSON())
    };
};
