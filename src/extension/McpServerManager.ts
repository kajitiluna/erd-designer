import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export class McpServerManager {

    private readonly mcpServer: McpServer;
    private serverEnabled: boolean;
    private serverPort: number;

    constructor(serverEnabled: boolean, serverPort: number) {
        this.mcpServer = new McpServer({
            name: "erd-designer_mcp-server",
            version: "0.1.0"
        });
        this.serverEnabled = serverEnabled;
        this.serverPort = serverPort;
    }
    // TODO
}