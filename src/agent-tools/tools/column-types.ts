import {
    ReadResourceTemplateCallback, ResourceTemplate, ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/agent-tools/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/agent-tools/DocumentBudget";
import {
    DESCRIPTION_DOCUMENT_ID, findDocument, initResourceNotFound, initResourceResponse, initToolJsonResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/agent-tools/tools/support";
import ColumnType from "~/models/database/ColumnType";

export const mcpRegisterColumnType = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListColumnTypesResource(documentResource),
            mcpFindColumnTypeResource(documentResource)
        ],
        tools: [
            mcpListColumnTypesTool(documentResource),
            mcpFindColumnTypeTool(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

// ==================== list-column-types ====================

const descriptionList = `\
Retrieves a list of all available column types for the specified ERD document's database.
Column types define the data types that can be used when creating or updating columns.
The available column types depend on the database type (PostgreSQL, MySQL, MS SQL Server, etc.).

REQUEST:
- documentId: The unique identifier of the ERD document whose column types are to be listed.
  Can be obtained by calling the 'list-documents' tool.

RESPONSE:
An array of column type objects, each containing:
- uri: The unique URI of the column type (format: erd-designer://documents/{documentId}/column_types/{columnTypeId}).
- columnTypeId: The unique identifier of the column type (number).
- columnTypeName: The name of the column type (e.g., "INTEGER", "VARCHAR", "TEXT").
- withPrecision: Boolean indicating if this type supports precision specification.
- withScale: Boolean indicating if this type supports scale specification.
- withUnsigned: Boolean indicating if this type supports unsigned specification.
- baseExpression: The base SQL type expression.
- inChildExpression: The SQL type expression when used as a foreign key child column.
- description: A brief description of the column type.
- defaultValueCandidates: An array of expressions that can be used as default values for this type.
`;

const mcpListColumnTypesResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-column-types",
        new ResourceTemplate(uriTemplates.columnTypes, { list: undefined }),
        {
            title: "List column types of a specified ERD document",
            description: descriptionList
        },
        initResourceCallbackForListColumnTypes(documentResource)
    ] as const;
};

const initResourceCallbackForListColumnTypes = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const responses = listColumnTypeResponses(documentResource, documentId);

        return initResourceResponse(url, responses);
    };
};

const listColumnTypesInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID)
};

const mcpListColumnTypesTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof listColumnTypesInputSchema> => {
    return [
        "list-column-types",
        {
            title: "List column types of a specified ERD document",
            description: descriptionList,
            inputSchema: listColumnTypesInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForListColumnTypes(documentResource)
    ] as const;
};

const initCallbackForListColumnTypes = (
    documentResource: DocumentResource
): ToolCallback<typeof listColumnTypesInputSchema> => {
    return async ({ documentId }) => {
        const responses = listColumnTypeResponses(documentResource, documentId);
        return initToolJsonResponse(responses);
    };
};

const listColumnTypeResponses = (documentResource: DocumentResource, documentId: string) => {
    const { erdBudget } = findDocument(documentResource, documentId);
    const columnTypes = erdBudget.erdDocument.databaseSettingModel.columnTypes;

    return columnTypes.map(columnType => toColumnTypeDetail(erdBudget, columnType));
};

// ==================== find-column-type ====================

const descriptionFind = `\
Retrieves detailed information about a specific column type from the specified ERD document using its columnTypeId.
This tool provides complete column type definition including precision, scale, and unsigned support.

REQUEST:
- documentId: The unique identifier of the ERD document.
  Can be obtained by calling the 'list-documents' tool.
- columnTypeId: The unique identifier of the column type to retrieve (number).
  Can be obtained by calling the 'list-column-types' tool or from column-share's columnType reference.

RESPONSE:
An object containing detailed information about the specified column type:
- uri: The unique URI of the column type (format: erd-designer://documents/{documentId}/column_types/{columnTypeId}).
- columnTypeId: The unique identifier of the column type (number).
- columnTypeName: The name of the column type (e.g., "INTEGER", "VARCHAR", "TEXT").
- withPrecision: Boolean indicating if this type supports precision specification.
- withScale: Boolean indicating if this type supports scale specification.
- withUnsigned: Boolean indicating if this type supports unsigned specification.
- baseExpression: The base SQL type expression.
- inChildExpression: The SQL type expression when used as a foreign key child column.
- description: A brief description of the column type.
- defaultValueCandidates: An array of expressions that can be used as default values for this type.
`;

const mcpFindColumnTypeResource = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-column-type",
        new ResourceTemplate(uriTemplates.columnTypeDetail, { list: undefined }),
        {
            title: "Find a column type of a specified ERD document",
            description: descriptionFind
        },
        initResourceCallbackForFindColumnType(documentResource)
    ] as const;
};

const initResourceCallbackForFindColumnType = (
    documentResource: DocumentResource
): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const columnTypeId = Number(variables.columnTypeId as string);
        const response = findColumnTypeResponse(documentResource, documentId, columnTypeId);

        return initResourceResponse(url, response);
    };
};

const findColumnTypeInputSchema = {
    documentId: z.string().describe(DESCRIPTION_DOCUMENT_ID),
    columnTypeId: z.number().int().describe("The unique identifier of the column type to retrieve.")
};

const mcpFindColumnTypeTool = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof findColumnTypeInputSchema> => {
    return [
        "find-column-type",
        {
            title: "Find a column type of a specified ERD document",
            description: descriptionFind,
            inputSchema: findColumnTypeInputSchema,
            annotations: { readOnlyHint: true }
        },
        initCallbackForFindColumnType(documentResource)
    ] as const;
};

const initCallbackForFindColumnType = (
    documentResource: DocumentResource
): ToolCallback<typeof findColumnTypeInputSchema> => {
    return async ({ documentId, columnTypeId }) => {
        const response = findColumnTypeResponse(documentResource, documentId, columnTypeId);
        return initToolJsonResponse(response);
    };
};

const findColumnTypeResponse = (
    documentResource: DocumentResource, documentId: string, columnTypeId: number
) => {
    const { erdBudget } = findDocument(documentResource, documentId);

    const columnType = erdBudget.erdDocument.databaseSettingModel.findColumnType(columnTypeId);
    if (columnType == null) {
        const url = new URL(erdBudget.columnTypeUri(columnTypeId));
        throw initResourceNotFound(url);
    }

    return toColumnTypeDetail(erdBudget, columnType);
};

// ==================== shared helpers ====================

const toColumnTypeDetail = (erdBudget: DocumentBudget, columnType: ColumnType) => {
    return {
        uri: erdBudget.columnTypeUri(columnType.id),
        columnTypeId: columnType.id,
        columnTypeName: columnType.name,
        withPrecision: columnType.withPrecision,
        withScale: columnType.withScale,
        withUnsigned: columnType.withUnsigned,
        baseExpression: columnType.baseQuery,
        inChildExpression: columnType.foreignColumn
            ? columnType.foreignColumn.baseQuery
            : columnType.baseQuery,
        description: columnType.description,
        defaultValueCandidates: columnType.candidateDefaultValues("", "")
    };
};
