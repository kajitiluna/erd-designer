import { ReadResourceTemplateCallback, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DocumentResource } from "~/extension/DocumentResource";
import DocumentBudget, { uriTemplates } from "~/extension/mcpserver/DocumentBudget";
import {
    initResourceNotFound, initResourceResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs
} from "~/extension/mcpserver/support";
import ColumnType from "~/models/database/ColumnType";

export const mcpRegisterColumnType = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpListColumnTypes(documentResource),
            mcpFindColumnType(documentResource)
        ],
        tools: [] as McpServerRegisterToolArgs[]
    };
};

const descriptionList = `\
Retrieves a list of all available column types for the specified ERD document's database.
Column types define the data types that can be used when creating or updating columns.
The available column types depend on the database type (PostgreSQL, MySQL, MS SQL Server, etc.).

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose column types are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

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

const mcpListColumnTypes = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "list-column-types",
        new ResourceTemplate(uriTemplates.columnTypes, { list: undefined }),
        {
            title: "List column types of a specified ERD document",
            description: descriptionList
        },
        initCallbackForListColumnTypes(documentResource)
    ] as const;
};

const initCallbackForListColumnTypes = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const columnTypes = erdDocument.databaseSettingModel.columnTypes;
        const responses = columnTypes.map(columnType => toColumnTypeDetail(erdBudget, columnType));

        return initResourceResponse(url, responses);
    };
};

const descriptionFind = `\
Retrieves detailed information about a specific column type from the specified ERD document using its columnTypeId.
This resource provides complete column type definition including precision, scale, and unsigned support.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- columnTypeId: The unique identifier of the column type to retrieve (number).
  Can be obtained from the column types list resource or from column-share's columnType reference.

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

const mcpFindColumnType = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-column-type",
        new ResourceTemplate(uriTemplates.columnTypeDetail, { list: undefined }),
        {
            title: "Find a column type of a specified ERD document",
            description: descriptionFind
        },
        initCallbackForFindColumnType(documentResource)
    ] as const;
};

const initCallbackForFindColumnType = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const columnTypeId = Number(variables.columnTypeId);
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const columnType = erdDocument.databaseSettingModel.findColumnType(columnTypeId);
        if (columnType == null) {
            throw initResourceNotFound(url);
        }

        const response = toColumnTypeDetail(erdBudget, columnType);

        return initResourceResponse(url, response);
    };
};

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
