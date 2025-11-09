import {
    ReadResourceCallback, ReadResourceTemplateCallback, ResourceMetadata, ResourceTemplate,
    ToolCallback
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { ZodRawShape } from "zod";

export const McpErrorCode = {
    ResourceNotFound: -32002,
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