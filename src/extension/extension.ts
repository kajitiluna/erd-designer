import * as vscode from 'vscode';
import { DocumentResource } from '~/extension/DocumentResource';

import { ExtensionProvider } from '~/extension/ExtensionProvider';
import { McpServerManager } from '~/extension/McpServerManager';

const documentResource = new DocumentResource();
const mcpManager = new McpServerManager(documentResource);

export const activate = (context: vscode.ExtensionContext) => {
    console.info("ERD Designer extension is starting to activate.");

    const provider = new ExtensionProvider(context, documentResource);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
        'erdDesigner.erdEditor', provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false,
        }
    );

    // 設定変更の監視
    const configChangeWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("erdDesigner.mcpServer")) {
            handleChangeConfiguration(mcpManager);
        }
    });

    const { serverEnabled, serverPort } = getConfiguration();
    mcpManager.start(serverEnabled, serverPort);

    context.subscriptions.push(providerRegistration);
    context.subscriptions.push(configChangeWatcher);

    console.info("ERD Designer extension has been activated.");
};

const getConfiguration = () => {
    const config = vscode.workspace.getConfiguration("erdDesigner.mcpServer");
    const serverEnabled = config.get<boolean>("enabled", false);
    const serverPort = config.get<number>("port", 53753);

    return { serverEnabled, serverPort };
};

const handleChangeConfiguration = (mcpManager: McpServerManager) => {
    const config = getConfiguration();
    mcpManager.changeConfiguration(config.serverEnabled, config.serverPort);
};

export const deactivate = () => {
    mcpManager.stop()
        .then(() => {
            console.info("ERD Designer extension is deactivating.");
        });
};
