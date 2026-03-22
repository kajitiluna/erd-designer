import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, initInvalidParams, initResourceNotFound, initResourceResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import DbSchemaConfig from "~/models/DbSchemaConfig";
import TableModel from "~/models/database/TableModel";
import DbSchemaModel from "~/models/database/DbSchemaModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

export const mcpRegisterSchema = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListSchemas(documentResource),
            mcpFindSchema(documentResource)
        ],
        tools: [
            mcpCreateSchema(documentResource),
            mcpUpdateSchema(documentResource),
            mcpDeleteSchema(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of all schemas from the specified ERD document.
Schemas are only available for databases that support them (e.g., PostgreSQL, Oracle).
For databases that do not support schemas (e.g., MySQL), this resource returns an empty array.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose schemas are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

RESPONSE:
An array of schema objects, each containing:
- uri: The unique URI of the schema (format: erd-designer://documents/{documentId}/schemas/{schemaId}).
- schemaId: The unique identifier of the schema (auto-generated UUID).
- schemaName: The name of the schema.
- description: A brief description of the schema (may be empty string).
- default: Boolean indicating if this is the default schema (only present when true).
`;

const mcpListSchemas = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-schemas",
        new ResourceTemplate(uriTemplates.schemas, { list: undefined }),
        {
            title: "List schemas of a specified ERD document",
            description: descriptionList
        },
        initCallbackForListSchemas(documentResource)
    ] as const;
};

const initCallbackForListSchemas = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const database = erdDocument.getDatabase();
        if (!database.supportsSchema) {
            return initResourceResponse(url, []);
        }

        const schemas = erdDocument.schemaConfig.getSchemas();
        const defaultSchemaId = erdDocument.schemaConfig.defaultSchemaId;
        const responses = schemas.map(schema => toSchemaSummary(erdBudget, schema, defaultSchemaId));

        return initResourceResponse(url, responses);
    };
};

const descriptionFind = `\
Retrieves detailed information about a specific schema from the specified ERD document using its schemaId.
The response includes the list of tables that belong to this schema.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- schemaId: The unique identifier of the schema to retrieve.
  Can be obtained from the schemas list resource or from the document's setting.

RESPONSE:
An object containing detailed information about the specified schema:
- uri: The unique URI of the schema (format: erd-designer://documents/{documentId}/schemas/{schemaId}).
- schemaId: The unique identifier of the schema (auto-generated UUID).
- schemaName: The name of the schema.
- tables: Array of table information belonging to this schema, each containing:
  - uri: The unique URI of the table (format: erd-designer://documents/{documentId}/tables/{tableId}).
  - tableId: The unique identifier of the table.
  - tableName: Object with physical and logical names of the table.
- description: A brief description of the schema (may be empty string).
- default: Boolean indicating if this is the default schema (only present when true).
`;

const mcpFindSchema = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-schema",
        new ResourceTemplate(uriTemplates.schemaDetail, { list: undefined }),
        {
            title: "Find a schema of a specified ERD document",
            description: descriptionFind
        },
        initCallbackForFindSchema(documentResource)
    ] as const;
};

const initCallbackForFindSchema = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const schemaId = variables.schemaId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const schema = erdDocument.findSchema(schemaId);
        if (schema == null) {
            throw initResourceNotFound(url);
        }

        const response = toSchemaDetail(erdBudget, schema, erdDocument);

        return initResourceResponse(url, response);
    };
};

const toSchemaSummary = (erdBudget: DocumentBudget, schema: DbSchemaModel, defaultSchemaId: string) => {
    return {
        uri: erdBudget.schemaUri(schema.schemaId),
        schemaId: schema.schemaId,
        schemaName: schema.schemaName,
        description: schema.description,
        ...(schema.schemaId === defaultSchemaId && { default: true })
    };
};

const toSchemaDetail = (erdBudget: DocumentBudget, schema: DbSchemaModel, erdDocument: ErdDocument) => {
    const defaultSchemaId = erdDocument.schemaConfig.defaultSchemaId;

    const tables = erdDocument.getTableViewModels()
        .filter(tableView => tableView.tableModel.schemaId === schema.schemaId)
        .map(tableView => ({
            uri: erdBudget.tableUri(tableView.tableId),
            tableId: tableView.tableId,
            tableName: {
                physical: tableView.tableModel.physicalName,
                logical: tableView.tableModel.logicalName
            }
        }));

    return {
        uri: erdBudget.schemaUri(schema.schemaId),
        schemaId: schema.schemaId,
        schemaName: schema.schemaName,
        tables: tables,
        description: schema.description,
        ...(schema.schemaId === defaultSchemaId && { default: true })
    };
};

const descriptionCreateSchema = `\
Creates a new schema in a specified ERD document.
Schemas are only available for databases that support them (e.g., PostgreSQL, Oracle).

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- schema: An object containing the schema information:
  - schemaName: The name of the schema (required).
  - description: A brief description of the schema (optional).
  - default: Boolean indicating if this should be the default schema (optional).

RESPONSE:
The created schema object (same format as schema detail resource).
`;

const mcpCreateSchema = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof createSchemaInputSchema> => {
    return [
        "create-schema",
        {
            title: "Create a schema in a specified ERD document",
            description: descriptionCreateSchema,
            inputSchema: createSchemaInputSchema
        },
        initCallbackForCreateSchema(documentResource)
    ] as const;
};

const createSchemaInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    schema: z.object({
        schemaName: z.string().describe("The name of the schema."),
        description: z.string().optional().describe("A brief description of the schema."),
        default: z.boolean().optional().describe("Whether this should be the default schema.")
    }).strict().describe("The schema information.")
};

const initCallbackForCreateSchema = (
    documentResource: DocumentResource
): ToolCallback<typeof createSchemaInputSchema> => {
    return async ({ documentId, schema: schemaInput }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;
        const database = previousDocument.getDatabase();
        if (!database.supportsSchema) {
            throw initInvalidParams("The database type of this document does not support schemas.");
        }

        const newSchema = DbSchemaModel.create(schemaInput.schemaName, schemaInput.description ?? "");

        const previousSchemas = previousDocument.schemaConfig.getSchemas();
        const nextSchemas = [...previousSchemas, newSchema];
        const nextDefaultSchemaId = schemaInput.default
            ? newSchema.schemaId
            : previousDocument.schemaConfig.defaultSchemaId;

        const nextSchemaConfig = DbSchemaConfig.create({
            defaultSchemaId: nextDefaultSchemaId,
            schemas: nextSchemas
        });

        const nextDocument = previousDocument.updateSchema(nextSchemaConfig);
        documentResource.notify(documentId, nextDocument);

        const response = toSchemaDetail(erdBudget, newSchema, nextDocument);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response)
                }
            ]
        };
    };
};

const descriptionUpdateSchema = `\
Updates an existing schema in a specified ERD document.
Only the specified fields will be updated; unspecified fields remain unchanged.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- schemaId: The unique identifier of the schema to update.
  Can be obtained from the schemas list resource.
- schema: An object containing the fields to update (all optional):
  - schemaName: The new name of the schema.
  - description: A brief description of the schema.
  - default: Boolean indicating if this should be the default schema.

RESPONSE:
The updated schema object (same format as schema detail resource).
`;

const mcpUpdateSchema = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateSchemaInputSchema> => {
    return [
        "update-schema",
        {
            title: "Update a schema in a specified ERD document",
            description: descriptionUpdateSchema,
            inputSchema: updateSchemaInputSchema
        },
        initCallbackForUpdateSchema(documentResource)
    ] as const;
};

const updateSchemaInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    schemaId: z.string().describe("The unique identifier of the schema to update."),
    schema: z.object({
        schemaName: z.string().optional().describe("The new name of the schema."),
        description: z.string().optional().describe("A brief description of the schema."),
        default: z.boolean().optional().describe("Whether this should be the default schema.")
    }).strict().describe("The schema fields to update.")
};

const initCallbackForUpdateSchema = (
    documentResource: DocumentResource
): ToolCallback<typeof updateSchemaInputSchema> => {
    return async ({ documentId, schemaId, schema: schemaInput }) => {
        const { erdBudget, erdDocument: previousDocument, schema: previousSchema } =
            doFindDocumentAndSchema(documentResource, documentId, schemaId);

        const nextSchema = previousSchema.update({
            schemaName: schemaInput.schemaName,
            description: schemaInput.description
        });

        const previousSchemas = previousDocument.schemaConfig.getSchemas();
        const nextSchemas = previousSchemas.map(schema => (schema.schemaId === schemaId) ? nextSchema : schema);
        const nextDefaultSchemaId = schemaInput.default ? schemaId : previousDocument.schemaConfig.defaultSchemaId;

        const nextSchemaConfig = DbSchemaConfig.create({ defaultSchemaId: nextDefaultSchemaId, schemas: nextSchemas });
        const nextDocument = previousDocument.updateSchema(nextSchemaConfig);
        documentResource.notify(documentId, nextDocument);

        const response = toSchemaDetail(erdBudget, nextSchema, nextDocument);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response)
                }
            ]
        };
    };
};

const descriptionDeleteSchema = `\
Deletes an existing schema from a specified ERD document.
Tables that were assigned to the deleted schema will be reassigned to the default schema.

REQUEST:
- documentId: ${DESCRIPTION_DOCUMENT_ID}
- schemaId: The unique identifier of the schema to delete.
  Can be obtained from the schemas list resource.

RESPONSE:
A text content containing the result of the operation:
- success: true
`;

const mcpDeleteSchema = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof deleteSchemaInputSchema> => {
    return [
        "delete-schema",
        {
            title: "Delete a schema from a specified ERD document",
            description: descriptionDeleteSchema,
            inputSchema: deleteSchemaInputSchema
        },
        initCallbackForDeleteSchema(documentResource)
    ] as const;
};

const deleteSchemaInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    schemaId: z.string().describe("The unique identifier of the schema to delete.")
};

const initCallbackForDeleteSchema = (
    documentResource: DocumentResource
): ToolCallback<typeof deleteSchemaInputSchema> => {
    return async ({ documentId, schemaId }) => {
        const { erdDocument: previousDocument } =
            doFindDocumentAndSchema(documentResource, documentId, schemaId);

        const previousSchemas = previousDocument.schemaConfig.getSchemas();
        const nextSchemas = previousSchemas.filter(schema => (schema.schemaId !== schemaId));
        const nextDefaultSchemaId = (previousDocument.schemaConfig.defaultSchemaId === schemaId)
            ? (nextSchemas.length > 0 ? nextSchemas[0].schemaId : "")
            : previousDocument.schemaConfig.defaultSchemaId;

        const nextSchemaConfig = DbSchemaConfig.create({ defaultSchemaId: nextDefaultSchemaId, schemas: nextSchemas });
        let nextDocument = previousDocument.updateSchema(nextSchemaConfig);

        // Reassign tables that were using the deleted schema to the new default schema.
        const updatingTables = nextDocument.getTableViewModels()
            .filter(tableView => tableView.tableModel.schemaId === schemaId)
            .map(tableView => new TableViewModel({
                ...tableView,
                tableModel: new TableModel({
                    ...tableView.tableModel,
                    schemaId: nextDefaultSchemaId
                })
            }));
        if (updatingTables.length > 0) {
            nextDocument = nextDocument.updateTableMeta(...updatingTables);
        }

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true })
                }
            ]
        };
    };
};

const doFindDocumentAndSchema = (documentResource: DocumentResource, documentId: string, schemaId: string) => {
    const erdBudget = documentResource.findById(documentId);
    if (erdBudget == null) {
        const url = new URL(uriTemplates.documentFor(documentId));
        throw initResourceNotFound(url);
    }

    const erdDocument = erdBudget.erdDocument;
    const database = erdDocument.getDatabase();
    if (!database.supportsSchema) {
        throw initInvalidParams("The database type of this document does not support schemas.");
    }

    const schema = erdDocument.findSchema(schemaId);
    if (schema == null) {
        const url = new URL(erdBudget.schemaUri(schemaId));
        throw initResourceNotFound(url);
    }

    return { erdBudget, erdDocument, schema };
};