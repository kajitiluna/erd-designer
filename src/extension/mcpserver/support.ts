import {
    ReadResourceTemplateCallback,
    ResourceMetadata, ResourceTemplate
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export const McpErrorCode = {
    ResourceNotFound: -32002,
    InternalError: ErrorCode.InternalError
} as const;

export type McpServerRegisterResourceTemplateArgs = readonly [
    name: string,
    uriOrTemplate: ResourceTemplate,
    config: ResourceMetadata,
    readCallback: ReadResourceTemplateCallback
];

export const initResourceNotFound = (url: URL, message: string = "Resource not found.") => {
    return new McpError(McpErrorCode.ResourceNotFound, message, { uri: url.href });
};