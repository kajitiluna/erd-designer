import { v4 as uuidV4 } from 'uuid';
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import {
    indent, initInvalidParams, initResourceNotFound,
    McpRegisterConfig, McpServerRegisterResourceTemplateArgs, McpServerRegisterToolArgs,
    searchParameters, validatePhysicalName, validatePositiveNumber
} from "~/extension/mcpserver/support";
import { Database } from "~/models/database";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import ErdDocument from "~/models/ErdDocument";
import { overrideColumnName } from '~/models/database/support';

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
        "find_column",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/columns/{columnId}",
            { list: undefined }
        ),
        {
            title: "Find a column of a specified ERD document",
            description: descriptionFind
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const columnId = variables.columnId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const column = erdDocument.findColumnModel(columnId);
            if (column == null) {
                throw initResourceNotFound(url);
            }

            const response = toColumnDetail(documentId, column);

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

const toColumnDetail = (documentId: string, column: ColumnModel) => {
    const overrideName = ((column.physicalName !== "") || (column.logicalName !== ""))
        ? {
            ...((column.physicalName !== "") && { physical: column.physicalName }),
            ...((column.logicalName !== "") && { logical: column.logicalName })
        } : null;

    return {
        uri: `erd-designer://documents/${documentId}/columns/${column.columnModelId}`,
        columnId: column.columnModelId,
        columnShare: {
            uri: `erd-designer://documents/${documentId}/column_shares/${column.columnShareModelId}`,
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

type ColumnAttributeInput = typeof columnModelSchema;

type UpdateColumnInput = {
    documentId: z.ZodString;
    columnId: z.ZodString;
    column: z.ZodUnion<[
        z.ZodObject<ColumnAttributeInput & {
            columnShareId: z.ZodOptional<z.ZodString>;
        }>,
        z.ZodObject<ColumnAttributeInput & {
            columnShare: z.ZodObject<{
                columnName: z.ZodObject<{
                    physical: z.ZodEffects<z.ZodString, string, string>;
                    logical: z.ZodOptional<z.ZodString>;
                }>;
                columnTypeId: z.ZodNumber;
                precision: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
                scale: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
                unsigned: z.ZodOptional<z.ZodBoolean>;
                isArray: z.ZodOptional<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
            }>;
        }>
    ]>;
};

const columnModelSchema = {
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
    autoIncrement: z.boolean().optional().describe("The updated auto-increment property."),
    defaultValue: z.string().optional().describe("The updated default value for the column.")
};

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

const mcpUpdateColumn = (documentResource: DocumentResource): McpServerRegisterToolArgs<UpdateColumnInput> => {
    return [
        "update_column",
        {
            title: "Update a column of a specified ERD document",
            description: descriptionUpdateColumn,
            inputSchema: {
                documentId: z.string().describe("The unique identifier of the document to update."),
                columnId: z.string().describe("The unique identifier of the column model to update."),
                column: z.union([
                    z.object({
                        columnShareId: z.string().optional().describe("The updated column-share ID for the column."),
                        ...columnModelSchema
                    }).describe("Update the column by referencing an existing column-share model. Specify the column-share ID to reuse and optionally override column properties."),
                    z.object({
                        columnShare: z.object({
                            columnName: z.object({
                                physical: z.string()
                                    .refine(validatePhysicalName, {
                                        message: "Physical name must start with a letter or underscore, followed by letters, digits, or underscores."
                                    }).describe("The updated physical name of the column-share."),
                                logical: z.string().optional().describe("The updated logical name of the column-share."),
                            }).describe("The updated column-share names."),
                            columnTypeId: z.number().describe("The updated column type ID."),
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
                        }).describe("Create a new column-share model with the specified properties. The newly created column-share will be assigned to this column."),
                        ...columnModelSchema
                    },
                    ).describe("Update the column by creating a new column-share model. Define all required column-share properties and optionally override column properties.")
                ]).describe("The column update specification. Choose either to reference an existing column-share (with columnShareId) or create a new one (with columnShare).")
            }
        },
        async ({ documentId, columnId, column: updatingColumn }) => {
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                const url = new URL(`erd-designer://documents/${documentId}`);
                throw initResourceNotFound(url);
            }

            const previousDocument = budget.erdDocument;
            const database = previousDocument.getDatabase();
            const previousColumn = previousDocument.findColumnModel(columnId);
            if (previousColumn == null) {
                const url = new URL(`erd-designer://documents/${documentId}/columns/${columnId}`);
                throw initResourceNotFound(url);
            }

            const previousColumnShare = previousDocument.findColumnShareModel(previousColumn.columnShareModelId) as ColumnShareModel;

            let nextDocument = previousDocument;
            let nextColumnShareId = previousColumn.columnShareModelId;
            let nextColumnType = previousColumnShare.columnType;
            if (("columnShareId" in updatingColumn) && (updatingColumn.columnShareId != null)) {
                const columnShareId = updatingColumn.columnShareId;
                const columnShare = previousDocument.findColumnShareModel(columnShareId);
                if (columnShare == null) {
                    const url = new URL(`erd-designer://documents/${documentId}/column_shares/${columnShareId}`);
                    throw initResourceNotFound(url);
                }

                nextColumnShareId = columnShare.columnShareModelId;
                nextColumnType = columnShare.columnType;
            } else if ("columnShare" in updatingColumn) {
                const updating = updatingColumn.columnShare;
                const columnType = previousDocument.databaseSettingModel
                    .findColumnType(updating.columnTypeId);
                if (columnType == null) {
                    const url = new URL(`erd-designer://documents/${documentId}/column_types/${updating.columnTypeId}`);
                    throw initResourceNotFound(url);
                }

                const physicalName = updating.columnName.physical;
                const logicalName = updating.columnName.logical ?? physicalName;

                if (columnType.withPrecision && (updating.precision == null)) {
                    throw initInvalidParams(`Precision must be specified for the selected column type : ${columnType.name}`);
                }
                if (!columnType.withPrecision && (updating.precision != null)) {
                    throw initInvalidParams(`Precision must not be specified for the selected column type : ${columnType.name}`);
                }

                if (columnType.withScale && (updating.scale == null)) {
                    throw initInvalidParams(`Scale must be specified for the selected column type : ${columnType.name}`);
                }
                if (!columnType.withScale && (updating.scale != null)) {
                    throw initInvalidParams(`Scale must not be specified for the selected column type : ${columnType.name}`);
                }

                if (!columnType.withUnsigned && (updating.unsigned === true)) {
                    throw initInvalidParams(`Unsigned must not be specified for the selected column type : ${columnType.name}`);
                }

                if (!database.supportsArrayType && (updating.isArray === true)) {
                    throw initInvalidParams(`Array type is not supported by the database : ${database.name}`);
                }

                nextColumnShareId = uuidV4();
                nextColumnType = columnType;
                const nextColumnShare = new ColumnShareModel({
                    columnShareModelId: nextColumnShareId,
                    physicalName, logicalName, columnType,
                    precision: updating.precision,
                    scale: updating.scale,
                    unsigned: updating.unsigned,
                    isArray: updating.isArray,
                    description: updating.description,
                });

                nextDocument = nextDocument.updateColumnShareModel(nextColumnShare);
            }

            if (!nextColumnType.withAutoIncrement && (updatingColumn.autoIncrement === true)) {
                throw initInvalidParams(`Auto-increment must not be specified for the selected column type : ${nextColumnType.name}`);
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

            nextDocument = nextDocument.updateColumnModel(nextColumn);
            documentResource.notify(documentId, nextDocument);

            const columnShare = nextDocument.findColumnShareModel(nextColumn.columnShareModelId) as ColumnShareModel;
            const overrideNames = overrideColumnName(nextColumn, columnShare);

            return {
                content: [
                    {
                        type: "resource_link",
                        uri: `erd-designer://documents/${documentId}/columns/${nextColumn.columnModelId}`,
                        name: overrideNames.physicalName,
                        mimeType: "application/json"
                    }
                ]
            };
        }

    ] as const;
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
        "list_column_shares",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/column_shares" + `{?${queryParams}*}`,
            { list: undefined }
        ),
        {
            title: "List column shares of a specified ERD document",
            description: descriptionListShares
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const database = erdDocument.getDatabase();

            const columnShares = doFilterColumnShares(url, erdDocument);
            const responses = columnShares.map(columnShare => toColumnShareSummary(documentId, columnShare, database));

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

const toColumnShareSummary = (documentId: string, columnShare: ColumnShareModel, database: Database) => {
    const columnType = columnShare.columnType;

    return {
        uri: `erd-designer://documents/${documentId}/column_shares/${columnShare.columnShareModelId}`,
        columnShareId: columnShare.columnShareModelId,
        columnName: {
            physical: columnShare.physicalName,
            logical: columnShare.logicalName
        },
        columnType: {
            uri: `erd-designer://documents/${documentId}/column_types/${columnType.id}`,
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
        "find_column_share",
        new ResourceTemplate(
            "erd-designer://documents/{documentId}/column_shares/{columnShareId}",
            { list: undefined }
        ),
        {
            title: "Find a column share of a specified ERD document",
            description: descriptionFindShare
        },
        async (url, variables) => {
            const documentId = variables.documentId as string;
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                throw initResourceNotFound(url);
            }

            const erdDocument = budget.erdDocument;
            const columnShareId = variables.columnShareId as string;
            const columnShare = erdDocument.findColumnShareModel(columnShareId);
            if (columnShare == null) {
                throw initResourceNotFound(url);
            }

            const response = toColumnShareDetail(documentId, columnShare, erdDocument);

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

const toColumnShareDetail = (
    documentId: string, columnShare: ColumnShareModel, erdDocument: ErdDocument
) => {
    const database = erdDocument.getDatabase();
    const columns = erdDocument.fetchReferencedColumnModelsForShareModel(columnShare.columnShareModelId);

    const summary = toColumnShareSummary(documentId, columnShare, database);
    const referencedColumns = columns.map(column => toColumnDetail(documentId, column));

    return {
        ...summary,
        referencedColumns
    };
};

type UpdateColumnShareInput = {
    documentId: z.ZodString;
    columnShareId: z.ZodString;
    columnShare: z.ZodObject<{
        columnName: z.ZodOptional<z.ZodObject<{
            physical: z.ZodOptional<z.ZodEffects<z.ZodString>>;
            logical: z.ZodOptional<z.ZodString>;
        }>>;
        columnTypeId: z.ZodOptional<z.ZodNumber>;
        precision: z.ZodOptional<z.ZodEffects<z.ZodString>>;
        scale: z.ZodOptional<z.ZodEffects<z.ZodString>>;
        unsigned: z.ZodOptional<z.ZodBoolean>;
        isArray: z.ZodOptional<z.ZodBoolean>;
        description: z.ZodOptional<z.ZodString>;
    }>;
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

const mcpUpdateColumnShare = (documentResource: DocumentResource): McpServerRegisterToolArgs<UpdateColumnShareInput> => {
    return [
        "update_column_share",
        {
            title: "Update a column share of a specified ERD document",
            description: descriptionUpdateColumnShare,
            inputSchema: {
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
            }
        },
        async ({ documentId, columnShareId, columnShare: updating }) => {
            const budget = documentResource.findById(documentId);
            if (budget == null) {
                const url = new URL(`erd-designer://documents/${documentId}`);
                throw initResourceNotFound(url);
            }

            const previousDocument = budget.erdDocument;
            const database = previousDocument.getDatabase();
            const previous = previousDocument.findColumnShareModel(columnShareId);
            if (previous == null) {
                const url = new URL(`erd-designer://documents/${documentId}/column_shares/${columnShareId}`);
                throw initResourceNotFound(url);
            }

            const nextColumnType = (updating.columnTypeId != null)
                ? previousDocument.databaseSettingModel.findColumnType(updating.columnTypeId)
                : previous.columnType;
            if (nextColumnType == null) {
                const url = new URL(`erd-designer://documents/${documentId}/column_types/${updating.columnTypeId}`);
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

            const nextDocument = previousDocument.updateColumnShareModel(nextColumnShare);

            documentResource.notify(documentId, nextDocument);

            return {
                content: [
                    {
                        type: "resource_link",
                        uri: `erd-designer://documents/${documentId}/column_shares/${columnShareId}`,
                        name: nextColumnShare.physicalName,
                        mimeType: "application/json"
                    }
                ]
            };
        }
    ] as const;
};