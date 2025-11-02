import * as vscode from 'vscode';
import { ExtensionProvider } from '~/extension/ExtensionProvider';

export const activate = (context: vscode.ExtensionContext) => {
    console.info("ERD Designer extension is starting to activate.");

    const provider = new ExtensionProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
        'erdDesigner.erdEditor', provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false,
        }
    );

    // 設定変更の監視
    const configChangeWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("erdDesigner.mcpServer")) {
            handleChangeConfiguration();
        }
    });

    context.subscriptions.push(providerRegistration);
    context.subscriptions.push(configChangeWatcher);

    console.info("ERD Designer extension has been activated.");
};

const handleChangeConfiguration = () => {
    const config = vscode.workspace.getConfiguration("erdDesigner.mcpServer");
    const serverEnabled = config.get<boolean>("enabled", false);
    const serverPort = config.get<number>("port", 53753);

    // TODO
};

export const deactivate = () => {
    console.info("ERD Designer extension is deactivating.");
};
