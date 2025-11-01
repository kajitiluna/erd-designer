import * as vscode from 'vscode';
import { ExtensionProvider } from '~/extension/ExtensionProvider';

export const activate = (context: vscode.ExtensionContext) => {
    console.info('ERD Designer extension is starting to activate.');

    const provider = new ExtensionProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
        'erdDesigner.erdEditor', provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false,
        }
    );

    context.subscriptions.push(providerRegistration);

    console.info('ERD Designer extension has been activated.');
};

export const deactivate = () => {
    console.info('ERD Designer extension is deactivating.');
};
