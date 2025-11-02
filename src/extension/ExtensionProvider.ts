import * as vscode from 'vscode';
import * as fs from 'fs';

import ErdDocument from '~/models/ErdDocument';

export class ExtensionProvider implements vscode.CustomTextEditorProvider {

    private readonly context: vscode.ExtensionContext
    private readonly selfUpdating: WeakMap<vscode.TextDocument, boolean>;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.selfUpdating = new WeakMap<vscode.TextDocument, boolean>();
    }

    resolveCustomTextEditor(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken
    ): Thenable<void> | void {
        handleResolvingTextEditor(this.context, this.selfUpdating, textDocument, webviewPanel);
    }
}

const handleResolvingTextEditor = (
    context: vscode.ExtensionContext, selfUpdatingMap: WeakMap<vscode.TextDocument, boolean>,
    textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel
) => {
    // Webviewの設定
    webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'dist')
        ]
    };

    let erdDocument: ErdDocument | null = null;
    try {
        erdDocument = loadErdDocument(textDocument);
    } catch (error) {
        console.warn(`Failed to load ERD document. detail : ${error}`);
        handleLoadFailure(textDocument);

        // 現在のWebviewを閉じる
        webviewPanel.dispose();
        return;
    }

    const documentUri = textDocument.uri.toString();
    const jsonContent = (erdDocument != null) ? JSON.stringify(erdDocument.toJSON()) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleReceivedMessage = async (message: any) => {
        if (!("messageType" in message)) {
            return;
        }

        if (message.messageType === "ready") {
            // React アプリケーションの準備が完了してから、ファイルの内容を React アプリケーションに渡す
            webviewPanel.webview.postMessage({
                eventSource: "erd-designer",
                messageType: "init",
                documentUri: documentUri,
                jsonContext: jsonContent
            });

            return;
        }

        if (!("documentUri" in message) || !("erdDocument" in message)) {
            return;
        }
        if (documentUri !== message.documentUri) {
            return;
        }

        const updating = message.erdDocument as string;
        // 保存処理の実行
        if (message.messageType === "save") {
            selfUpdatingMap.set(textDocument, true);
            saveErdDocument(textDocument, updating);
        }
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() != textDocument.uri.toString()) {
            return;
        }

        const selfUpdating = selfUpdatingMap.get(textDocument);
        if (selfUpdating) {
            selfUpdatingMap.delete(textDocument);
            return;
        }

        // 自身の操作以外で更新された場合は WebView に反映する
        webviewPanel.webview.postMessage({
            eventSource: "erd-designer",
            messageType: "changeDocument",
            documentUri: documentUri,
            jsonContext: JSON.stringify(event.document.getText())
        });
    });

    // HTMLコンテンツ、およびメッセージ受信時の制御の設定
    webviewPanel.webview.html = initWebViewHtml(context, webviewPanel.webview);
    webviewPanel.webview.onDidReceiveMessage(handleReceivedMessage);

    // Webviewが閉じられたときのクリーンアップ
    webviewPanel.onDidDispose(() => {
        changeSubscription.dispose();
        selfUpdatingMap.delete(textDocument);
    });
};

const loadErdDocument = (textDocument: vscode.TextDocument) => {
    const text = textDocument.getText().trim();
    if (text.length === 0) {
        return null;
    }

    const jsonContext = JSON.parse(text);
    return ErdDocument.toObject(jsonContext);
};

const failureMessage = "This file does not appear to be an ERD Designer file." +
    " Would you like to open it as a text file instead?";

const handleLoadFailure = async (textDocument: vscode.TextDocument) => {
    // 不正な形式の場合、デフォルトエディタで開くオプションを提供
    const action = await vscode.window.showErrorMessage(failureMessage, "Open as Text", "Cancel");
    if (action === "Open as Text") {
        await vscode.commands.executeCommand("vscode.openWith", textDocument.uri, "default");
    }
};

const saveErdDocument = async (textDocument: vscode.TextDocument, erdDocument: string) => {
    const jsonContent = JSON.stringify(erdDocument, null, 4);
    const editRange = new vscode.Range(0, 0, textDocument.lineCount, 0);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(textDocument.uri, editRange, jsonContent);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        vscode.window.showErrorMessage(`Failed to save ERD file : ${textDocument.fileName}`);
        return;
    }

    await textDocument.save();
};

const initWebViewHtml = (context: vscode.ExtensionContext, webview: vscode.Webview) => {
    // dist/index.htmlを読み込む
    const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'index.html');
    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf-8');

    // スクリプトとCSSのパスを抽出
    const scriptMatch = htmlContent.match(/src="([^"]+\.js)"/);
    const styleMatch = htmlContent.match(/href="([^"]+\.css)"/);

    if (!scriptMatch || !styleMatch) {
        throw new Error('Failed to extract script or style paths from dist/index.html');
    }

    // パスから先頭の /erd-designer または / を削除
    const scriptPath = scriptMatch[1].replace(/^\/(?:erd-designer\/)?/, '');
    const stylePath = styleMatch[1].replace(/^\/(?:erd-designer\/)?/, '');

    // Webview用のURIに変換
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'dist', scriptPath)
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'dist', stylePath)
    );

    const nonce = createNonce();

    // CSPの設定
    const cspContent = [
        `default-src 'none'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `img-src ${webview.cspSource} data:`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');

    // HTMLを書き換え：VSCode API とCSPを追加、パスを置換
    htmlContent = htmlContent
        // 元のscriptタグを削除
        .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '')
        // 元のlinkタグを削除
        .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '')
        // CSPを追加
        .replace('</head>', `
    <meta http-equiv="Content-Security-Policy" content="${cspContent};">
    <link rel="stylesheet" href="${styleUri}">
    <style nonce="${nonce}">
        :root {
            font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        body {
            font-size: 16px !important;
        }
    </style>
    <script nonce="${nonce}">
        const vscodeApi = acquireVsCodeApi();
        window.vscodeApi = vscodeApi;

        document.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </head>`);

    return htmlContent;
};

const createNonce = () => {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let index = 0; index < 32; index++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
};
