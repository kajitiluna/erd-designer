import { v4 as uuidV4 } from 'uuid';
import { ReadResourceTemplateCallback, ResourceTemplate, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import {
    indent, initInvalidParams, initResourceNotFound, initResourceResponse,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs,
    searchParameters, validatePhysicalName, validatePositiveNumber
} from "~/extension/mcpserver/support";
import { Database } from "~/models/database";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import ErdDocument from "~/models/ErdDocument";
import { overrideColumnName } from '~/models/database/support';
import DocumentBudget, { uriTemplates } from '~/extension/mcpserver/DocumentBudget';

export const mcpRegisterColumn = (documentResource: DocumentResource): McpRegisterConfig => {
    return {
        resources: [],
        resourceTemplates: [
            mcpFindColumn(documentResource),
            mcpListColumnShares(documentResource),
            mcpFindColumnShare(documentResource)
        ],
        tools: [
            mcpUpdateColumn(documentResource),
            mcpUpdateColumnShare(documentResource)
        ] as McpServerRegisterToolArgs[]
    };
};

const responseColumnDetail = `\
- uri: The unique URI of the column (format: erd-designer://documents/{documentId}/columns/{columnId}).
- columnId: The unique identifier of the column (auto-generated UUID).
- columnShare: Information about the associated column-share model:
  - uri: The URI to access the column-share resource.
  - columnShareId: The unique identifier of the column-share model.
- overrideName: Object containing overridden names (null if no overrides):
  - physical: The overridden physical name (only present if not empty string).
  - logical: The overridden logical name (only present if not empty string).
- primaryKey: Boolean indicating if this is a primary key.
- notNull: Boolean indicating if this column is NOT NULL.
- unique: Boolean indicating if this column has a unique constraint.
- autoIncrement: Boolean indicating if auto-increment is enabled.
- defaultValue: The default value for the column.\
`;

const descriptionFind = `\
Retrieves detailed information about a specific column from the specified ERD document using its columnId.
This resource provides complete column definition including its associated column-share model and override settings.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- columnId: The unique identifier of the column to retrieve.
  Can be obtained from the table's columns array or column definitions.

RESPONSE:
An object containing detailed information about the specified column:
${responseColumnDetail}
`;

const mcpFindColumn = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-column",
        new ResourceTemplate(uriTemplates.columnDetail, { list: undefined }),
        {
            title: "Find a column of a specified ERD document",
            description: descriptionFind
        },
        initCallbackForFindColumn(documentResource)
    ] as const;
};

const initCallbackForFindColumn = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const columnId = variables.columnId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const column = erdDocument.findColumnModel(columnId);
        if (column == null) {
            throw initResourceNotFound(url);
        }

        const response = toColumnDetail(erdBudget, column);

        return initResourceResponse(url, response);
    };
};

const toColumnDetail = (erdBudget: DocumentBudget, column: ColumnModel) => {
    const overrideName = ((column.physicalName !== "") || (column.logicalName !== ""))
        ? {
            ...((column.physicalName !== "") && { physical: column.physicalName }),
            ...((column.logicalName !== "") && { logical: column.logicalName })
        } : null;

    return {
        uri: erdBudget.columnUri(column.columnModelId),
        columnId: column.columnModelId,
        columnShare: {
            uri: erdBudget.columnShareUri(column.columnShareModelId),
            columnShareId: column.columnShareModelId,
        },
        overrideName: overrideName,
        primaryKey: column.primaryKey,
        notNull: column.notNull,
        unique: column.unique,
        autoIncrement: column.autoIncrement,
        defaultValue: column.defaultValue
    };
};

export const addingColumnModelSchema = {
    overrideName: z.object({
        physical: z.string()
            .refine(val => ((val === "") || validatePhysicalName(val)), {
                message: "Override physical name must be empty or start with a letter or underscore, followed by letters, digits, or underscores."
            }).optional().describe("The physical name to override the column-share's name."),
        logical: z.string().optional().describe("The logical name to override the column-share's name.")
    }).optional().describe("The override names for the new column. Empty string not to override."),
    primaryKey: z.boolean().optional().describe("Whether this column is a primary key."),
    notNull: z.boolean().optional().describe("Whether this column has NOT NULL constraint."),
    unique: z.boolean().optional().describe("Whether this column has unique constraint."),
    autoIncrement: z.boolean().optional().describe("Whether auto-increment is enabled for this column. "
        + "Only applicable if the column type supports auto-increment or identity."),
    defaultValue: z.string().optional().describe("The default value for this column.")
};

export const addingColumnShareModelSchema = {
    columnName: z.object({
        physical: z.string()
            .refine(validatePhysicalName, {
                message: "Physical name must start with a letter or underscore, followed by letters, digits, or underscores."
            }).describe("The physical name for the new column-share."),
        logical: z.string().optional().describe("The logical name for the new column-share."),
    }).describe("The names for the new column-share."),
    columnTypeId: z.number().describe("The column type ID for the new column-share."),
    precision: z.string()
        .refine(validatePositiveNumber, {
            message: "Precision must be empty string or a non-negative integer"
        }).optional().describe("The precision for the new column-share (empty-string to clear, non-negative integer only)."),
    scale: z.string()
        .refine(validatePositiveNumber, {
            message: "Scale must be empty string or a non-negative integer"
        }).optional().describe("The scale for the new column-share (empty-string to clear, non-negative integer only)."),
    unsigned: z.boolean().optional().describe("The unsigned property for the new column-share."),
    isArray: z.boolean().optional().describe("The array type property for the new column-share."),
    description: z.string().optional().describe("The description for the new column-share."),
} as const;

const descriptionUpdateColumn = `\
Updates an existing column of a specified ERD document.
You can update the column by either referencing an existing column-share or creating a new column-share model.
Additionally, you can override column properties such as names, constraints, and default values.

REQUEST:
- documentId: The unique identifier of the ERD document containing the column to be updated.
  Can be obtained from 'erd-designer://documents' resource.
- columnId: The unique identifier of the column to be updated.
  Can be obtained from the table's columns array or column definitions.
- column: The column update specification with one of the following approaches:

  APPROACH 1: Reference an existing column-share (recommended for reusing common column definitions):
  - columnShareId: The ID of an existing column-share to reference.
    Can be obtained from the column-shares list resource.
  - overrideName: (optional) Override the column-share's names:
    - physical: The overridden physical name (empty string to clear override).
    - logical: The overridden logical name.
  - primaryKey: (optional) Boolean indicating if this is a primary key.
  - notNull: (optional) Boolean indicating if this column is NOT NULL.
  - unique: (optional) Boolean indicating if this column has a unique constraint.
  - autoIncrement: (optional) Boolean indicating if auto-increment is enabled.
  - defaultValue: (optional) The default value for the column.

  APPROACH 2: Create a new column-share (for unique column definitions):
  - columnShare: Object defining the new column-share properties:
    - columnName: Object containing names:
      - physical: The physical name (required).
        Must start with a letter or underscore, followed by letters, digits, or underscores.
      - logical: (optional) The logical name.
    - columnTypeId: The column type ID (required). Must reference an existing column type.
    - precision: (optional) The precision setting (required for types with precision).
    - scale: (optional) The scale setting (required for types with scale).
    - unsigned: (optional) Boolean indicating unsigned property (only for applicable types).
    - isArray: (optional) Boolean indicating array type (only if database supports it).
    - description: (optional) A description of the column-share.
  - overrideName: (optional) Override the column-share's names.
  - primaryKey: (optional) Boolean indicating if this is a primary key.
  - notNull: (optional) Boolean indicating if this column is NOT NULL.
  - unique: (optional) Boolean indicating if this column has a unique constraint.
  - autoIncrement: (optional) Boolean indicating if auto-increment is enabled.
  - defaultValue: (optional) The default value for the column.

  Note: At least one field should be provided to make meaningful changes.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated column (format: erd-designer://documents/{documentId}/columns/{columnId}).
- name: The effective physical name of the column (considering overrides).
- mimeType: "application/json"
`;

const mcpUpdateColumn = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateColumnInputSchema> => {
    return [
        "update-column",
        {
            title: "Update a column of a specified ERD document",
            description: descriptionUpdateColumn,
            inputSchema: updateColumnInputSchema
        },
        initCallbackForUpdatingColumn(documentResource)
    ] as const;
};

const updatingColumnModelSchema = {
    overrideName: z.object({
        physical: z.string()
            .refine(val => ((val === "") || validatePhysicalName(val)), {
                message: "Override physical name must be empty or start with a letter or underscore, followed by letters, digits, or underscores."
            }).optional().describe("The updated physical name for the column."),
        logical: z.string().optional().describe("The updated logical name for the column.")
    }).optional().describe("The updated override names for the column. Empty string not to override."),
    primaryKey: z.boolean().optional().describe("The updated primary key property."),
    notNull: z.boolean().optional().describe("The updated NOT NULL property."),
    unique: z.boolean().optional().describe("The updated unique constraint property."),
    autoIncrement: z.boolean().optional().describe("The updated auto-increment property. "
        + "Only applicable if the column type supports auto-increment or identity."),
    defaultValue: z.string().optional().describe("The updated default value for the column.")
} as const;

const updateColumnInputSchema = {
    documentId: z.string().describe("The unique identifier of the document to update."),
    columnId: z.string().describe("The unique identifier of the column model to update."),
    column: z.union([
        z.object({
            columnShareId: z.string().optional().describe("The updated column-share ID for the column."),
            ...updatingColumnModelSchema
        }).describe("Update the column by referencing an existing column-share model. "
            + "Specify the column-share ID to reuse and optionally override column properties."),
        z.object({
            columnShare: z.object(addingColumnShareModelSchema)
                .describe("Create a new column-share model with the specified properties. "
                    + "The newly created column-share will be assigned to this column."),
            ...updatingColumnModelSchema
        }).describe("Update the column by creating a new column-share model. "
            + "Define all required column-share properties and optionally override column properties.")
    ]).describe("The column update specification. "
        + "Choose either to reference an existing column-share (with columnShareId) or create a new one (with columnShare).")
} as const;

const initCallbackForUpdatingColumn = (
    documentResource: DocumentResource
): ToolCallback<typeof updateColumnInputSchema> => {
    return async ({ documentId, columnId, column: updatingColumn }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;
        const previousColumn = previousDocument.findColumnModel(columnId);
        if (previousColumn == null) {
            const url = new URL(erdBudget.columnUri(columnId));
            throw initResourceNotFound(url);
        }

        const previousColumnShare = previousDocument.findColumnShareModel(previousColumn.columnShareModelId) as ColumnShareModel;

        const addingColumnShares = [];
        let nextColumnShareId = previousColumn.columnShareModelId;
        let nextColumnType = previousColumnShare.columnType;
        if (("columnShareId" in updatingColumn) && (updatingColumn.columnShareId != null)) {
            const columnShareId = updatingColumn.columnShareId;
            const columnShare = previousDocument.findColumnShareModel(columnShareId);
            if (columnShare == null) {
                const url = new URL(erdBudget.columnShareUri(columnShareId));
                throw initResourceNotFound(url);
            }

            nextColumnShareId = columnShare.columnShareModelId;
            nextColumnType = columnShare.columnType;
        } else if ("columnShare" in updatingColumn) {
            const nextColumnShare = buildColumnShare(erdBudget, updatingColumn.columnShare);

            nextColumnShareId = nextColumnShare.columnShareModelId
            nextColumnType = nextColumnShare.columnType;
            addingColumnShares.push(nextColumnShare);
        }

        if (!nextColumnType.withAutoIncrement && (updatingColumn.autoIncrement === true)) {
            throw initInvalidParams(
                `Auto-increment must not be specified for the selected column type : ${nextColumnType.name}`
            );
        }

        const nextColumn = new ColumnModel({
            columnModelId: previousColumn.columnModelId,
            columnShareModelId: nextColumnShareId,
            physicalName: (updatingColumn.overrideName?.physical !== undefined)
                ? updatingColumn.overrideName.physical : previousColumn.physicalName,
            logicalName: (updatingColumn.overrideName?.logical !== undefined)
                ? updatingColumn.overrideName.logical : previousColumn.logicalName,
            primaryKey: (updatingColumn.primaryKey !== undefined)
                ? updatingColumn.primaryKey : previousColumn.primaryKey,
            notNull: (updatingColumn.notNull !== undefined) ? updatingColumn.notNull : previousColumn.notNull,
            unique: (updatingColumn.unique !== undefined) ? updatingColumn.unique : previousColumn.unique,
            autoIncrement: (nextColumnType.withAutoIncrement && (updatingColumn.autoIncrement !== undefined))
                ? updatingColumn.autoIncrement : previousColumn.autoIncrement,
            defaultValue: (updatingColumn.defaultValue !== undefined)
                ? updatingColumn.defaultValue : previousColumn.defaultValue
        });

        const nextDocument = previousDocument.updateColumnModels([nextColumn], addingColumnShares);
        documentResource.notify(documentId, nextDocument);

        const columnShare = nextDocument.findColumnShareModel(nextColumn.columnShareModelId) as ColumnShareModel;
        const overrideNames = overrideColumnName(nextColumn, columnShare);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.columnUri(nextColumn.columnModelId),
                    name: overrideNames.physicalName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};

export const buildColumnShare = (
    erdBudget: DocumentBudget, input: z.infer<z.ZodObject<typeof addingColumnShareModelSchema>>
) => {
    const erdDocument = erdBudget.erdDocument;
    const database = erdDocument.getDatabase();

    const columnType = erdDocument.databaseSettingModel.findColumnType(input.columnTypeId);
    if (columnType == null) {
        const url = new URL(erdBudget.columnTypeUri(input.columnTypeId));
        throw initResourceNotFound(url);
    }

    const physicalName = input.columnName.physical;
    const logicalName = input.columnName.logical ?? physicalName;

    if (columnType.withPrecision && (input.precision == null)) {
        throw initInvalidParams(`Precision must be specified for the selected column type : ${columnType.name}`);
    }
    if (!columnType.withPrecision && (input.precision != null)) {
        throw initInvalidParams(`Precision must not be specified for the selected column type : ${columnType.name}`);
    }

    if (columnType.withScale && (input.scale == null)) {
        throw initInvalidParams(`Scale must be specified for the selected column type : ${columnType.name}`);
    }
    if (!columnType.withScale && (input.scale != null)) {
        throw initInvalidParams(`Scale must not be specified for the selected column type : ${columnType.name}`);
    }

    if (!columnType.withUnsigned && (input.unsigned === true)) {
        throw initInvalidParams(`Unsigned must not be specified for the selected column type : ${columnType.name}`);
    }

    if (!database.supportsArrayType && (input.isArray === true)) {
        throw initInvalidParams(`Array type is not supported by the database : ${database.name}`);
    }

    return new ColumnShareModel({
        columnShareModelId: uuidV4(),
        physicalName,
        logicalName,
        columnType,
        precision: input.precision,
        scale: input.scale,
        unsigned: input.unsigned,
        isArray: input.isArray,
        description: input.description,
    });
};

const responseColumnShareSummary = `\
- uri: The unique URI of the column-share (format: erd-designer://documents/{documentId}/column_shares/{columnShareId}).
- columnShareId: The unique identifier of the column-share (auto-generated UUID).
- columnName: Object containing physical and logical names of the column-share.
- columnType: Information about the column type, including:
  - uri: The URI to access the column type resource.
  - columnTypeId: The unique identifier of the column type.
  - columnTypeName: The name of the column type.
  - baseExpression: The type expression for normal columns.
  - inChildExpression: The type expression when used in child relations.
- precision: The precision setting (only present if column type supports precision).
- scale: The scale setting (only present if column type supports scale).
- unsigned: Boolean indicating unsigned property (only present if column type supports unsigned).
- isArray: Boolean indicating if array type is enabled (only present if database supports array types).
- description: A brief description of the column-share.\
`;

const descriptionListShares = `\
Retrieves a list of column-shares from the specified ERD document.
Column-shares represent reusable column definitions that can be used across multiple tables.
This resource supports optional filtering via query parameters to narrow down the results.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document whose column-shares are to be listed.
  Can be obtained from 'erd-designer://documents' resource.

REQUEST (query parameters - all optional):
Filtering conditions can be specified to narrow down the column-shares list.
Multiple conditions are combined with AND logic.
- columnName.physical.contains: Filter column-shares whose physical name contains the specified string (partial match).
  Can be specified multiple times; all conditions must be satisfied (AND).
  Example: ?columnName.physical.contains=user_id
- columnName.logical.contains: Filter column-shares whose logical name contains the specified string (partial match).
  Can be specified multiple times; all conditions must be satisfied (AND).
  Example: ?columnName.logical.contains=ユーザーID
- columnTypeId: Filter column-shares that have the specified column type ID (exact match).
  Can be specified multiple times; column-shares must match all specified type IDs (AND).
  Example: ?columnTypeId=123

QUERY EXAMPLES:
- All column-shares:
  \`erd-designer://documents/doc123/column_shares\`
- Column-shares with physical name containing "id":
  \`erd-designer://documents/doc123/column_shares?columnName.physical.contains=id\`
- Column-shares with logical name containing "ユーザー":
  \`erd-designer://documents/doc123/column_shares?columnName.logical.contains=ユーザー\`
- Column-shares with specific column type ID:
  \`erd-designer://documents/doc123/column_shares?columnTypeId=123\`
- Multiple conditions (AND): physical name contains "user" AND logical name contains "ユーザー":
  \`erd-designer://documents/doc123/column_shares?columnName.physical.contains=user&columnName.logical.contains=ユーザー\`

RESPONSE:
An array of column-share objects, each containing:
${responseColumnShareSummary}
`;

const mcpListColumnShares = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    const queryParams = [
        "columnName.physical.contains",
        "columnName.logical.contains",
        "columnTypeId"
    ].join(",");

    return [
        "list-column-shares",
        new ResourceTemplate(uriTemplates.columnShares + `{?${queryParams}*}`, { list: undefined }),
        {
            title: "List column shares of a specified ERD document",
            description: descriptionListShares
        },
        initCallbackForListColumnShares(documentResource)
    ] as const;
};

const initCallbackForListColumnShares = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const database = erdDocument.getDatabase();

        const columnShares = doFilterColumnShares(url, erdDocument);
        const responses = columnShares.map(columnShare => toColumnShareSummary(erdBudget, columnShare, database));

        return initResourceResponse(url, responses);
    };
};

const doFilterColumnShares = (url: URL, erdDocument: ErdDocument) => {
    const columnTypeIds = searchParameters(url, "columnTypeId");
    const physicalNameContains = searchParameters(url, "columnName.physical.contains");
    const logicalNameContains = searchParameters(url, "columnName.logical.contains");

    const storage = erdDocument.getColumnShareModelStorage();

    return storage.getModels().filter(columnShare => {
        const matchesColumnType = (columnTypeIds.length === 0)
            || columnTypeIds.every(typeId => (columnShare.columnType.id.toString() === typeId));
        if (!matchesColumnType) {
            return false;
        }

        const matchesPhysical = (physicalNameContains.length === 0)
            || physicalNameContains.every(filtering => columnShare.physicalName.includes(filtering));
        if (!matchesPhysical) {
            return false;
        }

        const matchesLogical = (logicalNameContains.length === 0)
            || logicalNameContains.every(filtering => columnShare.logicalName.includes(filtering));
        if (!matchesLogical) {
            return false;
        }

        return true;
    });
};

const toColumnShareSummary = (erdBudget: DocumentBudget, columnShare: ColumnShareModel, database: Database) => {
    const columnType = columnShare.columnType;

    return {
        uri: erdBudget.columnShareUri(columnShare.columnShareModelId),
        columnShareId: columnShare.columnShareModelId,
        columnName: {
            physical: columnShare.physicalName,
            logical: columnShare.logicalName
        },
        columnType: {
            uri: erdBudget.columnTypeUri(columnType.id),
            columnTypeId: columnType.id,
            columnTypeName: columnType.name,
            baseExpression: columnType.specifiedType({
                precision: columnShare.precision,
                scale: columnShare.scale,
                isArray: columnShare.isArray,
                inChildRelation: false
            }),
            inChildExpression: columnType.specifiedType({
                precision: columnShare.precision,
                scale: columnShare.scale,
                isArray: columnShare.isArray,
                inChildRelation: true
            }),
        },
        ...(columnType.withPrecision && { precision: columnShare.precision }),
        ...(columnType.withScale && { scale: columnShare.scale }),
        ...(columnType.withUnsigned && { unsigned: columnShare.unsigned }),
        ...(database.supportsArrayType && { isArray: columnShare.isArray }),
        description: columnShare.description
    };
};

const descriptionFindShare = `\
Retrieves detailed information about a specific column-share from the specified ERD document using its columnShareId.
This resource provides complete column-share definition including all columns that reference this column-share model.

REQUEST (path variables):
- documentId: The unique identifier of the ERD document.
  Can be obtained from 'erd-designer://documents' resource.
- columnShareId: The unique identifier of the column-share to retrieve.
  Can be obtained from the column-shares list resource or from a column's columnShare reference.

RESPONSE:
An object containing detailed information about the specified column-share:
${responseColumnShareSummary}
- referencedColumns: An array of column objects that reference this column-share model, each containing:
${indent(responseColumnDetail, 1)}
`;

const mcpFindColumnShare = (documentResource: DocumentResource): McpServerRegisterResourceTemplateArgs => {
    return [
        "find-column-share",
        new ResourceTemplate(uriTemplates.columnShareDetail, { list: undefined }),
        {
            title: "Find a column share of a specified ERD document",
            description: descriptionFindShare
        },
        initCallbackForFindColumnShare(documentResource)
    ] as const;
};

const initCallbackForFindColumnShare = (documentResource: DocumentResource): ReadResourceTemplateCallback => {
    return async (url, variables) => {
        const documentId = variables.documentId as string;
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            throw initResourceNotFound(url);
        }

        const erdDocument = erdBudget.erdDocument;
        const columnShareId = variables.columnShareId as string;
        const columnShare = erdDocument.findColumnShareModel(columnShareId);
        if (columnShare == null) {
            const url = new URL(erdBudget.columnShareUri(columnShareId));
            throw initResourceNotFound(url);
        }

        const response = toColumnShareDetail(erdBudget, columnShare);

        return initResourceResponse(url, response);
    };
};

const toColumnShareDetail = (erdBudget: DocumentBudget, columnShare: ColumnShareModel) => {
    const erdDocument = erdBudget.erdDocument;
    const database = erdDocument.getDatabase();
    const columns = erdDocument.fetchReferencedColumnModelsForShareModel(columnShare.columnShareModelId);

    const summary = toColumnShareSummary(erdBudget, columnShare, database);
    const referencedColumns = columns.map(column => toColumnDetail(erdBudget, column));

    return {
        ...summary,
        referencedColumns
    };
};

const descriptionUpdateColumnShare = `\
Updates an existing column-share of a specified ERD document.
You can update the column-share's names, type, precision, scale, unsigned property, array type, and/or description.
All columns that reference this column-share will automatically reflect the changes.

REQUEST:
- documentId: The unique identifier of the ERD document containing the column-share to be updated.
  Can be obtained from 'erd-designer://documents' resource.
- columnShareId: The unique identifier of the column-share to be updated.
  Can be obtained from the column-shares list resource or from a column's columnShare reference.
- columnShare: An object containing the fields to be updated (all fields are optional):
  - columnName: Object containing names to be updated:
    - physical: The new physical name for the column-share.
      Must start with a letter or underscore, followed by letters, digits, or underscores.
    - logical: The new logical name for the column-share.
  - columnTypeId: The new column type ID. Must reference an existing column type in the database.
  - precision: The new precision setting (empty string to clear, non-negative integer only).
    Only applicable if the column type supports precision.
  - scale: The new scale setting (empty string to clear, non-negative integer only).
    Only applicable if the column type supports scale.
  - unsigned: Boolean indicating the new unsigned property.
    Only applicable if the column type supports unsigned.
  - isArray: Boolean indicating if the new array type property.
    Only applicable if the database supports array types.
  - description: The new description for the column-share.
  
  Note: If no fields are provided, the column-share remains unchanged.
  At least one field should be provided to make meaningful changes.

RESPONSE:
A resource link object containing:
- type: "resource_link"
- uri: The URI of the updated column-share (format: erd-designer://documents/{documentId}/column_shares/{columnShareId}).
- name: The updated physical name of the column-share.
- mimeType: "application/json"
`;

const mcpUpdateColumnShare = (
    documentResource: DocumentResource
): McpServerRegisterToolArgs<typeof updateColumnShareInputSchema> => {
    return [
        "update-column-share",
        {
            title: "Update a column share of a specified ERD document",
            description: descriptionUpdateColumnShare,
            inputSchema: updateColumnShareInputSchema
        },
        initCallbackForUpdatingColumnShare(documentResource)
    ] as const;
};

const updateColumnShareInputSchema = {
    documentId: z.string().describe("The unique identifier of the document to update."),
    columnShareId: z.string().describe("The unique identifier of the column-share model to update."),
    columnShare: z.object({
        columnName: z.object({
            physical: z.string()
                .refine(validatePhysicalName, {
                    message: "Physical name must start with a letter or underscore, followed by letters, digits, or underscores."
                })
                .optional().describe("The updated physical name of the column-share."),
            logical: z.string().optional().describe("The updated logical name of the column-share."),
        }).optional().describe("The updated column-share names."),
        columnTypeId: z.number().optional().describe("The updated column type ID."),
        precision: z.string()
            .refine(validatePositiveNumber, {
                message: "Precision must be empty string or a non-negative integer"
            }).optional().describe("The updated precision (empty-string to clear, non-negative integer only)."),
        scale: z.string()
            .refine(validatePositiveNumber, {
                message: "Scale must be empty string or a non-negative integer"
            }).optional().describe("The updated scale (empty-string to clear, non-negative integer only)."),
        unsigned: z.boolean().optional().describe("The updated unsigned property."),
        isArray: z.boolean().optional().describe("The updated array type property."),
        description: z.string().optional().describe("The updated description of the column-share."),
    }).describe("The updated column-share model data.")
} as const;

const initCallbackForUpdatingColumnShare = (
    documentResource: DocumentResource
): ToolCallback<typeof updateColumnShareInputSchema> => {
    return async ({ documentId, columnShareId, columnShare: updating }) => {
        const erdBudget = documentResource.findById(documentId);
        if (erdBudget == null) {
            const url = new URL(uriTemplates.documentFor(documentId));
            throw initResourceNotFound(url);
        }

        const previousDocument = erdBudget.erdDocument;
        const database = previousDocument.getDatabase();
        const previous = previousDocument.findColumnShareModel(columnShareId);
        if (previous == null) {
            const url = new URL(erdBudget.columnShareUri(columnShareId));
            throw initResourceNotFound(url);
        }

        const nextColumnType = (updating.columnTypeId != null)
            ? previousDocument.databaseSettingModel.findColumnType(updating.columnTypeId)
            : previous.columnType;
        if (nextColumnType == null) {
            // この場合、updating.columnTypeId は null ではないが、防御的に型ガードをかけておく
            const url = new URL(erdBudget.columnTypeUri(updating.columnTypeId || 0));
            throw initResourceNotFound(url);
        }

        if (nextColumnType.withPrecision && (updating.precision == null) && (previous.precision === "")) {
            throw initInvalidParams(`Precision must be specified for the selected column type : ${nextColumnType.name}`);
        }
        if (!nextColumnType.withPrecision && (updating.precision != null)) {
            throw initInvalidParams(`Precision must not be specified for the selected column type : ${nextColumnType.name}`);
        }

        if (nextColumnType.withScale && (updating.scale == null) && (previous.scale === "")) {
            throw initInvalidParams(`Scale must be specified for the selected column type : ${nextColumnType.name}`);
        }
        if (!nextColumnType.withScale && (updating.scale != null)) {
            throw initInvalidParams(`Scale must not be specified for the selected column type : ${nextColumnType.name}`);
        }

        if (!nextColumnType.withUnsigned && (updating.unsigned === true)) {
            throw initInvalidParams(`Unsigned must not be specified for the selected column type : ${nextColumnType.name}`);
        }

        if (!database.supportsArrayType && (updating.isArray === true)) {
            throw initInvalidParams(`Array type is not supported by the database : ${database.name}`);
        }

        const nextColumnShare = new ColumnShareModel({
            columnShareModelId: previous.columnShareModelId,
            physicalName: updating.columnName?.physical ?? previous.physicalName,
            logicalName: updating.columnName?.logical ?? previous.logicalName,
            columnType: nextColumnType,
            ...(nextColumnType.withPrecision && { precision: updating.precision ?? previous.precision }),
            ...(nextColumnType.withScale && { scale: updating.scale ?? previous.scale }),
            ...(nextColumnType.withUnsigned && { unsigned: updating.unsigned ?? previous.unsigned }),
            ...(database.supportsArrayType && { isArray: updating.isArray ?? previous.isArray }),
            description: updating.description ?? previous.description,
        });

        const nextDocument = previousDocument.updateColumnModels([], [nextColumnShare]);

        documentResource.notify(documentId, nextDocument);

        return {
            content: [
                {
                    type: "resource_link",
                    uri: erdBudget.columnShareUri(columnShareId),
                    name: nextColumnShare.physicalName,
                    mimeType: "application/json"
                }
            ]
        };
    };
};