import { ReadResourceTemplateCallback, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DocumentResource } from "~/extension/DocumentResource";
import { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import { initResourceNotFound, initResourceResponse, McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs } from "~/extension/mcpserver/support";

export const mcpRegisterDatabase = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpFetchDatabase(documentResource)
        ],
        tools: [] as McpServerRegisterToolArgs[]
    };
};

const descriptionFetchDatabase = `\
Retrieves database configuration information for the specified ERD document.
This resource provides details about the database settings including the database name and available column types.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose database information is to be retrieved.
  Can be obtained from 'erd-designer://documents' resource.

RESPONSE:
An object containing database information:
- databaseName: The name of the database associated with the document.
- columnTypes: An array of available column types, each containing:
  - name: The name of the column type.
  - Other type-specific properties as defined by the database.\
`;

const mcpFetchDatabase = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "fetch_database",
        new ResourceTemplate(uriTemplates.database, { list: undefined }),
        {
            title: "Fetch Database Information of a specified ERD document",
            description: descriptionFetchDatabase
        },
        initCallbackForFetchDatabase(documentResource)
    ] as const;
};

const initCallbackForFetchDatabase = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const databaseSetting = erdDocument.databaseSettingModel;

        const response = {
            databaseName: databaseSetting.getDatabase().name,
            columnTypes: databaseSetting.columnTypes.map(columnType => columnType.toJSON())
        };

        return initResourceResponse(url, response);
    };
};