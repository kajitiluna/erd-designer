import * as vscode from 'vscode';
import * as fs from 'fs';
import { RectangleType } from '~/agent-tools/DocumentBudget';
import {
    ChangeDocumentMessage, ERD_MESSAGE_EVENT_SOURCE, InitDocumentMessage
} from '~/extension/webview-messages';
import { VsCodeDocumentResource } from '~/extension/VsCodeDocumentResource';

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

    const documentUri = textDocument.uri.toString();

    // 外部 (CLI 等) によるファイル変更の監視
    const { watcher: externalChangeWatcher, recordSavedContent } =
        initWatcherForExternalChange(documentResource, textDocument, webviewPanel);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleReceivedMessage = async (message: any) => {
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
                const changeDocumentMessage: ChangeDocumentMessage = {
                    eventSource: ERD_MESSAGE_EVENT_SOURCE,
                    messageType: "changeDocument",
                    documentUri: documentUri,
                    jsonContext: updating
                };
                webviewPanel.webview.postMessage(changeDocumentMessage);
            };
            documentResource.register(textDocument, jsonContent, handleChangeView);

            // React アプリケーションの準備が完了してから、ファイルの内容を React アプリケーションに渡す
            const initDocumentMessage: InitDocumentMessage = {
                eventSource: ERD_MESSAGE_EVENT_SOURCE,
                messageType: "init",
                documentUri: documentUri,
                jsonContext: jsonContent
            };
            webviewPanel.webview.postMessage(initDocumentMessage);

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

            const updating = message.erdDocument as Record<string, unknown>;
            const loggingMessage = ("loggingMessage" in message) ? message.loggingMessage as string : "";

            const jsonContent = JSON.stringify(updating, null, 4);
            recordSavedContent(jsonContent);

            // 外部変更通知 (changeDocument) に対する WebView からの保存返送など、
            // ディスク上の内容と同一の場合は書き込みしない
            if (jsonContent === textDocument.getText().trim()) {
                console.debug(`Skipped saving identical content: ${documentUri}`);
                return;
            }

            documentResource.update(textDocument, JSON.stringify(updating));
            await saveDocument(textDocument, updating, loggingMessage);
            return;
        }
    };

    // HTMLコンテンツ、およびメッセージ受信時の制御の設定
    webviewPanel.webview.html = initWebViewHtml(context, webviewPanel.webview);
    webviewPanel.webview.onDidReceiveMessage(handleReceivedMessage);

    // Webviewが閉じられたときのクリーンアップ
    webviewPanel.onDidDispose(() => {
        externalChangeWatcher.dispose();
        documentResource.remove(textDocument);
    });
};

type ExternalChangeWatching = {
    watcher: vscode.Disposable;
    recordSavedContent: (content: string) => void;
};

const initWatcherForExternalChange = (
    documentResource: VsCodeDocumentResource, textDocument: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
): ExternalChangeWatching => {
    const documentUri = textDocument.uri.toString();

    // WebView が保持している最新の内容。自身の保存に起因する change イベントを
    // 外部変更として WebView にエコーバックしないための照合に使う。
    let lastSavedContent = "";

    const recordSavedContent = (content: string) => {
        lastSavedContent = content;
    };

    const watcher = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() !== documentUri) {
            return;
        }

        if (event.contentChanges.length === 0) {
            return;
        }

        // WebView 発の保存 (applyEdit) は dirty 状態で発火するため無視する。
        // 外部 (CLI 等) からのディスク変更は VSCode の自動リロード後に非 dirty で発火する。
        if (event.document.isDirty === true) {
            return;
        }

        const jsonContent = event.document.getText().trim();
        // WebView が既に保持している内容なら通知不要（自己保存のエコー防止）
        if (jsonContent === lastSavedContent) {
            return;
        }

        if (isParsableJson(jsonContent) === false) {
            console.warn(`Skipped notifying invalid external change: ${documentUri}`);
            return;
        }

        // MCP サーバー側が保持するドキュメントも最新化する
        documentResource.update(event.document, jsonContent);

        const changeDocumentMessage: ChangeDocumentMessage = {
            eventSource: ERD_MESSAGE_EVENT_SOURCE,
            messageType: "changeDocument",
            documentUri: documentUri,
            jsonContext: jsonContent
        };
        webviewPanel.webview.postMessage(changeDocumentMessage);

        console.info(`Notified external document change to webview: ${documentUri}`);
    });

    return { watcher, recordSavedContent };
};

const isParsableJson = (content: string): boolean => {
    if (content.length === 0) {
        return false;
    }
    try {
        JSON.parse(content);
        return true;
    } catch {
        return false;
    }
};

const saveDocument = async (
    textDocument: vscode.TextDocument, content: Record<string, unknown>, loggingMessage: string
) => {
    const jsonContent = JSON.stringify(content, null, 4);
    const editRange = new vscode.Range(0, 0, textDocument.lineCount, 0);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(textDocument.uri, editRange, jsonContent);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (success === false) {
        // ファイル保存が失敗した場合にエラーメッセージを表示
        vscode.window.showErrorMessage(`Failed to save erd file : ${textDocument.fileName}`);
        return;
    }

    const result = await textDocument.save();
    if (result === false) {
        // ファイル保存が失敗した場合にエラーメッセージを表示
        vscode.window.showErrorMessage(`Failed to save erd file : ${textDocument.fileName}`);
        return;
    }

    console.info(`Succeed to save document: ${textDocument.uri.toString()}. ${loggingMessage}`);
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
