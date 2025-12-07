import {
    ReadResourceCallback, ReadResourceTemplateCallback, ResourceMetadata, ResourceTemplate,
    ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import z, { ZodRawShape } from "zod";

import { DocumentResource } from "~/extension/DocumentResource";
import { uriTemplates } from "~/extension/mcpserver/DocumentBudget";

export const McpErrorCode = {
    ResourceNotFound: -32002,
    InvalidParams: ErrorCode.InvalidParams,
    InternalError: ErrorCode.InternalError
} as const;

export type McpServerRegisterResourceArgs = readonly [
    name: string,
    uriOrTemplate: string,
    config: ResourceMetadata,
    readCallback: ReadResourceCallback
];

export type McpServerRegisterResourceTemplateArgs = readonly [
    name: string,
    uriOrTemplate: ResourceTemplate,
    config: ResourceMetadata,
    readCallback: ReadResourceTemplateCallback
];

export type McpServerRegisterToolArgs<InputArgs extends ZodRawShape = ZodRawShape>
    = readonly [
        name: string,
        config: {
            title?: string;
            description?: string;
            inputSchema?: InputArgs;
            outputSchema?: ZodRawShape;
            annotations?: ToolAnnotations;
            _meta?: Record<string, unknown>;
        },
        callback: ToolCallback<InputArgs>
    ];

export type McpRegisterConfig = {
    resources: McpServerRegisterResourceArgs[];
    resourceTemplates: McpServerRegisterResourceTemplateArgs[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: McpServerRegisterToolArgs<any>[];
};

export const colorValueSchema = z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be in hex format (e.g., #FFFFFF).");

export const initPositionSchema = <RECORD extends Record<string, z.ZodType>>(keyName: string, keyInfo: RECORD) => {
    return {
        position: z.union([
            z.object({ type: z.literal("start") }).strict()
                .describe(`Add the new column at the start of the ${keyName} list.`),
            z.object({ type: z.literal("end") }).strict()
                .describe(`Add the new column at the end of the ${keyName} list.`),
            z.object({
                type: z.literal("before"),
                ...keyInfo
            }).strict().describe(`Add the new ${keyName} before the specified existing ${keyName}.`),
            z.object({
                type: z.literal("after"),
                ...keyInfo
            }).strict().describe(`Add the new ${keyName} after the specified existing ${keyName}.`),
            z.object({
                type: z.literal("index"),
                index: z.number()
                    .describe(`The zero-based index to insert the new ${keyName} at in the ${keyName} list.`)
            }).strict().describe(`Add the new ${keyName} at the specified index in the ${keyName} list.`)
        ]).describe(`The position to add the new ${keyName} at in the ${keyName} list.`)
    };
};

export const calculateIndexFromPosition = <KEY extends string>(
    position: { type: "start" | "end" }
        | ({ type: "before" | "after" } & { [K in KEY]: string })
        | { type: "index"; index: number },
    keyName: KEY,
    keyToIndex: Map<string, number>,
    length: number
) => {
    if (position.type === "start") {
        return 0;
    }
    if (position.type === "end") {
        return length;
    }

    if (position.type === "index") {
        if (position.index < 0) {
            return 0;
        }
        if (position.index > length) {
            return length;
        }

        return position.index;
    }

    const refId = (position as { [K in KEY]: string })[keyName];
    const refIndex = keyToIndex.get(refId);
    if (refIndex == null) {
        throw initInvalidParams(`${keyName} to add not found: ${refId}`);
    }

    return refIndex + (position.type === "before" ? 0 : 1);
};

export const findDocumentAndTable = (documentResource: DocumentResource, documentId: string, tableId: string) => {
    const erdBudget = documentResource.findById(documentId);
    if (erdBudget == null) {
        const url = new URL(uriTemplates.documentFor(documentId));
        throw initResourceNotFound(url);
    }

    const erdDocument = erdBudget.erdDocument;
    const tableView = erdDocument.findTableViewModel(tableId);
    if (tableView == null) {
        const url = new URL(erdBudget.tableUri(tableId));
        throw initResourceNotFound(url);
    }

    return { erdBudget, erdDocument, tableView }
};

export const initResourceNotFound = (url: URL, message: string = "Resource not found.") => {
    return new McpError(McpErrorCode.ResourceNotFound, message, { uri: url.href });
};

export const initResourceResponse = (url: URL, response: object) => {
    return {
        contents: [
            {
                uri: url.href,
                text: JSON.stringify(response),
                mimeType: "application/json"
            }
        ]
    };
};

export const initInvalidParams = (message: string) => new McpError(McpErrorCode.InvalidParams, message);

export const searchParameters = (url: URL, param: string) =>
    url.searchParams.getAll(param).filter(value => (value !== ""));

const PHYSICAL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const validatePhysicalName = (value: string): boolean => PHYSICAL_PATTERN.test(value);

export const validatePositiveNumber = (val: string): boolean => /^\d+$/.test(val);

export const indent = (text: string, indentation: number) => {
    if (indentation <= 0) {
        return text;
    }

    const indentString = "  ".repeat(indentation);
    return text.split("\n").map(line => indentString + line).join("\n");
}
