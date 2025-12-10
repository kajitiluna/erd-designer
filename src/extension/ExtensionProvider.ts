import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import { DocumentResource } from '~/extension/DocumentResource';
import { RectangleType } from '~/extension/mcpserver/DocumentBudget';

export class ExtensionProvider implements vscode.CustomTextEditorProvider {

    private readonly context: vscode.ExtensionContext
    private readonly documentResource: DocumentResource;

    constructor(context: vscode.ExtensionContext, documentResource: DocumentResource) {
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
    context: vscode.ExtensionContext, documentResource: DocumentResource,
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
    const jsonContent = textDocument.getText().trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleReceivedMessage = async (message: any) => {
        if (!("eventSource" in message) || !("messageType" in message)) {
            return;
        }
        if (message.eventSource !== "erd-designer") {
            return;
        }

        if (message.messageType === "ready") {
            const handleChangeView = (updating: string) => {
                // 自身の操作以外で更新された場合は WebView に変更を通知する
                webviewPanel.webview.postMessage({
                    eventSource: "erd-designer",
                    messageType: "changeDocument",
                    documentUri: documentUri,
                    jsonContext: updating
                });
            };
            documentResource.register(textDocument, jsonContent, handleChangeView);

            // React アプリケーションの準備が完了してから、ファイルの内容を React アプリケーションに渡す
            webviewPanel.webview.postMessage({
                eventSource: "erd-designer",
                messageType: "init",
                documentUri: documentUri,
                jsonContext: jsonContent
            });

            console.info(`Received ready event from webview and sent init event: ${documentUri}`);

            return;
        }

        if (!("documentUri" in message)) {
            return;
        }
        if (documentUri !== message.documentUri) {
            return;
        }

        // 描画処理更新の反映
        if (message.messageType === "drawnRectangles") {
            if (!("rectangles" in message)) {
                return;
            }

            const rectangles = message.rectangles as { tableId: string; rectangle: RectangleType }[];
            documentResource.updateDrawnRectangles(textDocument, rectangles);
            return;
        }

        // 保存処理の実行
        if (message.messageType === "save") {
            if (!("erdDocument" in message)) {
                return;
            }

            const updating = message.erdDocument as Record<string, unknown>;
            documentResource.update(textDocument, JSON.stringify(updating));
            saveDocument(textDocument, updating);
            return;
        }
    };

    // HTMLコンテンツ、およびメッセージ受信時の制御の設定
    webviewPanel.webview.html = initWebViewHtml(context, webviewPanel.webview);
    webviewPanel.webview.onDidReceiveMessage(handleReceivedMessage);

    // Webviewが閉じられたときのクリーンアップ
    webviewPanel.onDidDispose(() => {
        documentResource.remove(textDocument);
    });
};

const saveDocument = async (
    textDocument: vscode.TextDocument, content: Record<string, unknown>
) => {
    const jsonContent = JSON.stringify(content, null, 4);
    const editRange = new vscode.Range(0, 0, textDocument.lineCount, 0);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(textDocument.uri, editRange, jsonContent);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        // ファイル保存が失敗した場合にエラーメッセージを表示
        vscode.window.showErrorMessage(`Failed to save erd file : ${textDocument.fileName}`);
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
    // 安全なHTMLパースとタグ削除のためcheerioを使用
    const $ = cheerio.load(htmlContent);
    // script[src]タグを削除
    $('script[src]').remove();
    // link[rel="stylesheet"]タグを削除
    $('link[rel="stylesheet"]').remove();
    // headに必要な要素を追加
    $('head').append(`
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
    `);
    htmlContent = $.html();

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
