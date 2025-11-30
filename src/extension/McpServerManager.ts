import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Server } from "http";

import { DocumentResource } from "~/extension/DocumentResource";
import { mcpRegisterColumn } from "~/extension/mcpserver/columns";
import { mcpRegisterErdDocument } from "~/extension/mcpserver/documents";
import { mcpRegisterPerspective } from "~/extension/mcpserver/perspectives";
import { McpErrorCode } from "~/extension/mcpserver/support";
import { mcpRegisterTable } from "~/extension/mcpserver/tables";
import { ShowMessage } from "~/extension/vscode-message";

export class McpServerManager {

    private readonly expressApp: express.Express;
    private readonly onShowMessage: ShowMessage;
    private operationQueue: Promise<void>;
    private httpServer: Server | null;
    private serverEnabled: boolean;
    private serverPort: number;

    constructor(documentResource: DocumentResource, onShowMessage: ShowMessage = () => { }) {
        const mcpServer = createMcpServer(documentResource);

        this.expressApp = createExpressServer(mcpServer);
        this.onShowMessage = onShowMessage;
        this.operationQueue = Promise.resolve();
        this.httpServer = null;
        this.serverEnabled = false;
        this.serverPort = 0;
    }

    private withLock(operation: () => Promise<void>): Promise<void> {
        this.operationQueue = this.operationQueue
            .then(operation)
            .catch(error => {
                console.error("Error in MCP server operation:", error);
                return Promise.reject(error);
            });

        return this.operationQueue;
    }

    public start(serverEnabled: boolean, serverPort: number): Promise<void> {
        return this.withLock(async () => {
            this.serverEnabled = serverEnabled;
            this.serverPort = serverPort;

            if (!this.serverEnabled) {
                console.info("MCP server is disabled by configuration.");
                return;
            }

            this.httpServer = startExpress(this.expressApp, this.serverPort, this.onShowMessage);
        });
    }

    public stop(): Promise<void> {
        return this.withLock(async () => {
            await this.doStop();
        });
    }

    private doStop(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if ((this.httpServer == null) || (this.httpServer.listening === false)) {
                resolve();
                return;
            }

            this.httpServer.close(error => {
                if (error) {
                    console.error("Error occurred while stopping MCP server:", error);
                    reject(error);
                    return;
                }

                this.httpServer = null;
                console.info("MCP server has been stopped.");
                resolve();
            });
        });
    }

    public changeConfiguration(serverEnabled: boolean, serverPort: number): Promise<void> {
        return this.withLock(async () => {
            if ((this.serverEnabled === serverEnabled) && (this.serverPort === serverPort)) {
                return;
            }
            if ((this.serverEnabled === false) && (serverEnabled === false)) {
                return;
            }

            // 以降のケースにおいて、変更内容は少なくとも以下のひとつは満たす。
            //  - serverEnabled の変更
            //  - serverPort の変更
            // このため、現在サーバ稼働中の場合は停止し、更新後のサーバ稼働が有効な場合は再起動する

            await this.doStop();

            this.serverEnabled = serverEnabled;
            this.serverPort = serverPort;

            if (this.serverEnabled) {
                this.httpServer = startExpress(this.expressApp, this.serverPort, this.onShowMessage);
            }
        });
    }
}

const createMcpServer = (documentResource: DocumentResource) => {
    const mcpServer = new McpServer({
        name: "erd-designer_mcp-server",
        version: "0.1.0"
    });

    const mcpConfig = [
        // `erd-designer://documents`
        mcpRegisterErdDocument(documentResource),
        // `erd-designer://documents/{documentId}/tables`
        mcpRegisterTable(documentResource),
        // `erd-designer://documents/{documentId}/columns`
        // `erd-designer://documents/{documentId}/column_shares/`
        mcpRegisterColumn(documentResource),
        // `erd-designer://documents/{documentId}/perspectives`
        mcpRegisterPerspective(documentResource)
    ].reduce((merged, config) => ({
        resources: [...merged.resources, ...config.resources],
        resourceTemplates: [...merged.resourceTemplates, ...config.resourceTemplates],
        tools: [...merged.tools, ...config.tools]
    }), { resources: [], resourceTemplates: [], tools: [] });

    mcpConfig.resources.forEach(args => mcpServer.registerResource(...args));
    mcpConfig.resourceTemplates.forEach(args => mcpServer.registerResource(...args));
    mcpConfig.tools.forEach(args => mcpServer.registerTool(...args));

    return mcpServer
};

const createExpressServer = (mcpServer: McpServer) => {
    const app: express.Express = express();
    app.use(express.json());

    app.post('/mcp', async (request, response) => {
        try {
            console.debug(`Received request : [${request.method}] ${request.path} : ${JSON.stringify(request.body)}`);

            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true
            });

            response.on("close", () => {
                transport.close();
            });

            await mcpServer.connect(transport);
            await transport.handleRequest(request, response, request.body);
        } catch (error) {
            console.error('Error handling MCP request:', error);
            if (!response.headersSent) {
                response.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: McpErrorCode.InternalError,
                        message: 'Internal server error'
                    },
                    id: null
                });
            }
        }
    });

    return app;
};

const startExpress = (expressApp: express.Express, serverPort: number, onShowMessage: ShowMessage) => {
    return expressApp.listen(serverPort, () => {
        console.info(`ERD Designer's MCP server is running on 'http://localhost:${serverPort}/mcp'`);
        onShowMessage("INFO", `ERD Designer's MCP server started on 'http://localhost:${serverPort}/mcp'`);
    }).on('error', error => {
        console.error('Server error:', error);
        onShowMessage("ERROR", `Failed to start ERD Designer's MCP server: ${error.message}`);
    });
};