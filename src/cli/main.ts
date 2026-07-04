import process from 'node:process';

import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult, McpError } from "@modelcontextprotocol/sdk/types.js";
import z, { ZodRawShape } from "zod";
// zod-to-json-schema は @modelcontextprotocol/sdk の依存として提供される
import { zodToJsonSchema } from "zod-to-json-schema";

import { DocumentResource } from "~/agent-tools/DocumentResource";
import { FileDocumentResource } from "~/agent-tools/FileDocumentResource";
import { initToolRegistrations } from "~/agent-tools/tools";
import { McpServerRegisterToolArgs } from "~/agent-tools/tools/support";

const USAGE = `\
erd-cli : Edit ERD Designer (.erd) files from the command line.

USAGE:
  node erd-cli.cjs list-tools
      List all available tools with a one-line summary.

  node erd-cli.cjs describe <tool-name>
      Show the full description and the JSON schema of the tool arguments.

  node erd-cli.cjs run <tool-name> --file <path.erd> [--args '<json>']
      Run a tool against the given .erd file. Mutating tools save the file in place.
      'documentId' in the arguments is injected automatically from --file.

  node erd-cli.cjs validate --file <path.erd>
      Check that the file can be parsed as an ERD document.
`;

const main = async (): Promise<number> => {
    const argv = process.argv.slice(2);
    const command = argv[0];

    if ((command == null) || (command === "help") || (command === "--help")) {
        console.log(USAGE);
        return 0;
    }

    if (command === "list-tools") {
        return runListTools();
    }
    if (command === "describe") {
        return runDescribe(argv[1]);
    }
    if (command === "run") {
        return await runTool(argv[1], argv.slice(2));
    }
    if (command === "validate") {
        return runValidate(argv.slice(1));
    }

    console.error(`Unknown command: ${command}\n`);
    console.error(USAGE);
    return 1;
};

const initTools = (documentResource: DocumentResource): McpServerRegisterToolArgs[] => {
    const registrations = initToolRegistrations(documentResource);

    return registrations.flatMap(config => config.tools);
};

const findTool = (
    tools: McpServerRegisterToolArgs[], toolName: string | undefined
): McpServerRegisterToolArgs | null => {
    if (toolName == null) {
        return null;
    }

    return tools.find(tool => tool[0] === toolName) ?? null;
};

const runListTools = (): number => {
    const documentResource = new FileDocumentResource();
    const tools = initTools(documentResource);

    const lines = tools.map(tool => toSummaryLine(tool));
    console.log(lines.join("\n"));

    return 0;
};

const toSummaryLine = (tool: McpServerRegisterToolArgs): string => {
    const [name, config] = tool;
    const readOnly = (config.annotations?.readOnlyHint === true) ? " [read-only]" : "";
    const summary = (config.description ?? "").split("\n")[0];

    return `${name}${readOnly} : ${summary}`;
};

const runDescribe = (toolName: string | undefined): number => {
    const documentResource = new FileDocumentResource();
    const tools = initTools(documentResource);

    const tool = findTool(tools, toolName);
    if (tool == null) {
        console.error(`Tool not found: ${toolName ?? "(missing tool name)"}. Use 'list-tools' to see available tools.`);
        return 1;
    }

    const [name, config] = tool;
    const inputSchema = z.object(config.inputSchema ?? {});
    const jsonSchema = zodToJsonSchema(inputSchema);
    const jsonSchemaText = JSON.stringify(jsonSchema, null, 2);

    console.log(`Tool: ${name}`);
    console.log("");
    console.log(config.description ?? "(no description)");
    console.log("Arguments (JSON Schema):");
    console.log(jsonSchemaText);

    return 0;
};

const runTool = async (toolName: string | undefined, optionArgv: string[]): Promise<number> => {
    const filePath = readOption(optionArgv, "--file");
    if (filePath == null) {
        console.error("Missing required option: --file <path.erd>");
        return 1;
    }

    const documentResource = new FileDocumentResource();
    const tools = initTools(documentResource);

    const tool = findTool(tools, toolName);
    if (tool == null) {
        console.error(`Tool not found: ${toolName ?? "(missing tool name)"}. Use 'list-tools' to see available tools.`);
        return 1;
    }

    const documentId = documentResource.register(filePath);

    const argsJson = readOption(optionArgv, "--args");
    const toolArguments = parseToolArguments(argsJson);

    const [name, config, callback] = tool;
    const inputSchemaShape = config.inputSchema ?? {};
    const needsDocumentId = ("documentId" in inputSchemaShape) && (toolArguments.documentId == null);
    const mergedArguments = needsDocumentId
        ? { ...toolArguments, documentId }
        : toolArguments;

    const parsedArguments = z.object(inputSchemaShape).safeParse(mergedArguments);
    if (parsedArguments.success === false) {
        const issueText = JSON.stringify(parsedArguments.error.issues, null, 2);
        console.error(`Invalid arguments for tool '${name}'. Use 'describe ${name}' to see the schema.`);
        console.error(issueText);
        return 1;
    }

    const extra = initToolCallbackExtra();
    const result = await callback(parsedArguments.data, extra);
    printToolResult(result);

    return 0;
};

const parseToolArguments = (argsJson: string | null): Record<string, unknown> => {
    if (argsJson == null) {
        return {};
    }

    const parsed: unknown = JSON.parse(argsJson);
    if ((typeof parsed !== "object") || (parsed == null) || Array.isArray(parsed)) {
        throw new Error("--args must be a JSON object.");
    }

    return parsed as Record<string, unknown>;
};

const initToolCallbackExtra = (): Parameters<ToolCallback<ZodRawShape>>[1] => {
    const abortController = new AbortController();
    const extra = {
        signal: abortController.signal,
        requestId: "erd-cli",
        sendNotification: async () => { return; },
        sendRequest: async () => {
            throw new Error("sendRequest is not supported in erd-cli.");
        }
    };

    return extra as unknown as Parameters<ToolCallback<ZodRawShape>>[1];
};

const printToolResult = (result: CallToolResult): void => {
    if (result.structuredContent != null) {
        const structuredText = JSON.stringify(result.structuredContent, null, 2);
        console.log(structuredText);
        return;
    }

    const contents = result.content ?? [];
    const textContents = contents.filter(content => content.type === "text");
    if (textContents.length === contents.length) {
        textContents.forEach(content => console.log(content.text));
        return;
    }

    // resource_link などテキスト以外を含む場合は content 全体を JSON で出力する
    const contentText = JSON.stringify(contents, null, 2);
    console.log(contentText);
};

const runValidate = (optionArgv: string[]): number => {
    const filePath = readOption(optionArgv, "--file");
    if (filePath == null) {
        console.error("Missing required option: --file <path.erd>");
        return 1;
    }

    const documentResource = new FileDocumentResource();
    const documentId = documentResource.register(filePath);

    const budget = documentResource.findById(documentId);
    if (budget == null) {
        console.error(`Failed to load document: ${filePath}`);
        return 1;
    }

    const document = budget.erdDocument.toJSON() as {
        tableViewModels?: unknown[];
        columnModels?: unknown[];
        relationViewModels?: unknown[];
    };
    const tableCount = document.tableViewModels?.length ?? 0;
    const columnCount = document.columnModels?.length ?? 0;
    const relationCount = document.relationViewModels?.length ?? 0;

    console.log(`OK: valid ERD document (tables: ${tableCount}, columns: ${columnCount}, relations: ${relationCount})`);

    return 0;
};

const readOption = (argv: string[], optionName: string): string | null => {
    const optionIndex = argv.indexOf(optionName);
    if (optionIndex < 0) {
        return null;
    }

    const value = argv[optionIndex + 1];
    if ((value == null) || value.startsWith("--")) {
        return null;
    }

    return value;
};

main().then(exitCode => {
    process.exitCode = exitCode;
}).catch((error: unknown) => {
    if (error instanceof McpError) {
        console.error(`Tool error: ${error.message}`);
    } else if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
    } else {
        console.error(`Error: ${String(error)}`);
    }

    process.exitCode = 1;
});
