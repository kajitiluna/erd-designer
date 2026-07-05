import * as vscode from 'vscode';
import * as fs from 'fs';
import { RectangleType } from '~/agent-tools/DocumentBudget';
import { VsCodeDocumentResource } from '~/extension/VsCodeDocumentResource';
import { ERD_MESSAGE_EVENT_SOURCE, initializeDocument, notifyExternalChangedDocument, onSaveDocument } from '~/extension/vscode-message-resolver';

export class ExtensionProvider implements vscode.CustomTextEditorProvider {

    private readonly context: vscode.ExtensionContext
    private readonly documentResource: VsCodeDocumentResource;

    constructor(context: vscode.ExtensionContext, documentResource: VsCodeDocumentResource) {
        this.context = context;
        this.documentResource = documentResource;
    }

    resolveCustomTextEditor(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken
    ): Thenable<void> | void {
        handleResolvingTextEditor(this.context, this.documentResource, textDocument, webviewPanel);
    }
}

const handleResolvingTextEditor = (
    context: vscode.ExtensionContext, documentResource: VsCodeDocumentResource,
    textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel
) => {
    // Webviewの設定
    webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'dist')
        ]
    };

    // ファイル変更 (WebView 保存 / 外部 CLI 等) を検知し、documentResource へ一方向に反映する
    const handleDocumentChanged = initHandleDocumentChanged(documentResource, textDocument, webviewPanel);
    const watcher = vscode.workspace.onDidChangeTextDocument(handleDocumentChanged);

    const handleReceivedMessage = initHandleReceivedMessage(documentResource, textDocument, webviewPanel);

    // HTMLコンテンツ、およびメッセージ受信時の制御の設定
    webviewPanel.webview.html = initWebViewHtml(context, webviewPanel.webview);
    webviewPanel.webview.onDidReceiveMessage(handleReceivedMessage);

    // Webviewが閉じられたときのクリーンアップ
    webviewPanel.onDidDispose(() => {
        watcher.dispose();
        documentResource.remove(textDocument);
    });
};

const initHandleDocumentChanged = (
    documentResource: VsCodeDocumentResource, textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel
) => {
    const documentUri = textDocument.uri.toString();

    return (event: vscode.TextDocumentChangeEvent) => {
        if (event.document.uri.toString() !== documentUri) {
            return;
        }

        if (event.contentChanges.length === 0) {
            return;
        }

        const jsonContent = event.document.getText().trim();
        const parsedContent = tryParseJson(jsonContent);
        if (parsedContent == null) {
            console.warn(`Skipped notifying invalid external change: ${documentUri}`);
            return;
        }

        // MCP サーバー側が保持するドキュメントも最新化する
        const updated = documentResource.update(event.document, parsedContent);
        if (updated === false) {
            return;
        }

        notifyExternalChangedDocument(webviewPanel.webview, textDocument, jsonContent);

        console.info(`Notified external document change to webview: ${documentUri}`);
    };
};

const tryParseJson = (content: string): Record<string, unknown> | null => {
    if (content.length === 0) {
        return null;
    }

    try {
        return JSON.parse(content) as Record<string, unknown>;
    } catch {
        return null;
    }
};

const initHandleReceivedMessage = (
    documentResource: VsCodeDocumentResource, textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel
) => {
    const documentUri = textDocument.uri.toString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (message: any) => {
        if ((("eventSource" in message) === false) || (("messageType" in message) === false)) {
            return;
        }
        if (message.eventSource !== ERD_MESSAGE_EVENT_SOURCE) {
            return;
        }

        if (message.messageType === "ready") {
            // resolve 〜 ready の間に外部変更が入っても最新の内容で初期化できるよう、ここで取得する
            const jsonContent = textDocument.getText().trim();

            const handleChangeView = (updating: string) => {
                // 自身の操作以外で更新された場合は WebView に変更を通知する
                notifyExternalChangedDocument(webviewPanel.webview, textDocument, updating);
            };
            documentResource.register(textDocument, jsonContent, handleChangeView);

            // React アプリケーションの準備が完了してから、ファイルの内容を React アプリケーションに渡す
            initializeDocument(message, webviewPanel.webview, textDocument, jsonContent);

            console.info(`Received ready event from webview and sent init event: ${documentUri}`);
            return;
        }

        if (("documentUri" in message) === false) {
            return;
        }
        if (documentUri !== message.documentUri) {
            return;
        }

        // 描画処理更新の反映
        if (message.messageType === "drawnRectangles") {
            if (("rectangles" in message) === false) {
                return;
            }

            const rectangles = message.rectangles as { tableId: string; rectangle: RectangleType }[];
            documentResource.updateDrawnRectangles(textDocument, rectangles);
            return;
        }

        // 保存処理の実行
        if (message.messageType === "save") {
            if (("erdDocument" in message) === false) {
                return;
            }

            const succeeded = await onSaveDocument(vscode, message, textDocument);
            if (succeeded) {
                const loggingMessage = ("loggingMessage" in message) ? message.loggingMessage as string : "";
                console.info(`Succeed to save document: ${textDocument.uri.toString()}. ${loggingMessage}`);
            }

            return;
        }
    };
};

const initWebViewHtml = (context: vscode.ExtensionContext, webview: vscode.Webview) => {
    // dist/index.htmlを読み込む
    const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'index.html');
    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf-8');

    // スクリプトとCSSのパスを抽出
    const scriptMatch = htmlContent.match(/src="([^"]+\.js)"/);
    const styleMatch = htmlContent.match(/href="([^"]+\.css)"/);

    if ((scriptMatch == null) || (styleMatch == null)) {
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
    // script[src]タグを削除
    htmlContent = htmlContent.replace(/<script\b[^>]+\bsrc\b[^>]*>[\s\S]*?<\/script>/gi, '');
    // link[rel="stylesheet"]タグを削除
    htmlContent = htmlContent.replace(/<link\b[^>]+rel=["']stylesheet["'][^>]*\/?>/gi, '');
    // headに必要な要素を追加
    htmlContent = htmlContent.replace('</head>', `
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
                padding: 0 !important;
                margin: 0 !important;
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
