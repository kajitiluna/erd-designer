import {
    ReadResourceCallback, ReadResourceTemplateCallback, ResourceMetadata, ResourceTemplate,
    ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { ZodRawShape } from "zod";

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

export const initResourceNotFound = (url: URL, message: string = "Resource not found.") => {
    return new McpError(McpErrorCode.ResourceNotFound, message, { uri: url.href });
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
