import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { RectangleType } from '~/agent-tools/DocumentBudget';
import { VsCodeDocumentResource } from '~/extension/VsCodeDocumentResource';
import {
    ERD_MESSAGE_EVENT_SOURCE, initializeDocument, notifyExternalChangedDocument, onSaveDocument
} from '~/extension/vscode-message-resolver';

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

    // ファイル変更 (WebView 保存 / 外部 CLI 等) を検知し、documentResource へ一方向に反映する。
    // ただし同一プロセス (このウィンドウ) 内の TextDocument に対する変更にしか反応しないため、
    // 別ウィンドウでの保存はこれだけでは捕捉できない。
    const handleDocumentChanged = initHandleDocumentChanged(documentResource, textDocument, webviewPanel);
    const documentWatcher = vscode.workspace.onDidChangeTextDocument(handleDocumentChanged);

    // 別ウィンドウが同じファイルへ保存した場合は、そちらの TextDocument 経由の変更通知がこのプロセスへ届かないため、
    // ファイルシステムを直接監視して補う。
    // VSCode 自身が未編集 (dirty でない) TextDocument をディスクの内容へ追従させた場合はここと二重に検知しうるが、
    // 後続の通知は内容が変わらなければ webview 側で無害に無視される。
    //
    // 監視対象は「このファイルの親ディレクトリ配下の、このファイル名」という RelativePattern で与える。
    // 文字列の GlobPattern はワークスペースフォルダ内だけを対象とし、区切りをスラッシュとして照合するため、
    // Windows のパス・フォルダ未開封・ワークスペース外・glob メタ文字を含む親フォルダのいずれでも一致しない。
    const filePath = textDocument.uri.fsPath;
    const directoryPath = path.dirname(filePath);
    const directoryUri = vscode.Uri.file(directoryPath);
    const fileName = path.basename(filePath);
    const filePattern = new vscode.RelativePattern(directoryUri, fileName);

    const fileWatcher = vscode.workspace.createFileSystemWatcher(filePattern);
    const handleFileChangedOnDisk = initHandleFileChangedOnDisk(documentResource, textDocument, webviewPanel);

    // 一時ファイル + rename による保存や git checkout はファイルを置換するため、変更ではなく
    // 削除 + 作成として届く。作成側も同じハンドラで受けないと、この経路の更新をすべて取り逃す。
    const changeSubscription = fileWatcher.onDidChange(handleFileChangedOnDisk);
    const createSubscription = fileWatcher.onDidCreate(handleFileChangedOnDisk);

    // register (ready 受信時) が完了するまでは、このパネル自身の登録解除手段を持たない。
    // ready は webview のリロードや再レンダリングで再送されうる。登録を上書きするだけでは
    // 前回のハンドラが documentResource 側の Set に残り続け、MCP の 1 編集が同じパネルへ
    // 複数回届く (保存往復と undo 履歴がその回数だけ増える) ため、差し替える前に必ず解除する。
    let unregisterPanel: (() => void) | null = null;
    const onRegistered = (unregister: () => void): void => {
        if (unregisterPanel != null) {
            unregisterPanel();
        }

        unregisterPanel = unregister;
    };

    const handleReceivedMessage = initHandleReceivedMessage(documentResource, textDocument, webviewPanel, onRegistered);

    // HTMLコンテンツ、およびメッセージ受信時の制御の設定
    webviewPanel.webview.html = initWebViewHtml(context, webviewPanel.webview);
    webviewPanel.webview.onDidReceiveMessage(handleReceivedMessage);

    // Webviewが閉じられたときのクリーンアップ。同じ URI を開く他パネルの登録には触れない
    webviewPanel.onDidDispose(() => {
        documentWatcher.dispose();
        changeSubscription.dispose();
        createSubscription.dispose();
        fileWatcher.dispose();

        if (unregisterPanel != null) {
            unregisterPanel();
        }
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
        applyExternalContentChange(documentResource, textDocument, webviewPanel, jsonContent);
    };
};

/**
 * 別ウィンドウがディスク上のファイルを直接書き換えた場合を捕捉する。このプロセスの
 * TextDocument は経由しないため、変更のたびにファイル本体を読み直して比較する。
 */
const initHandleFileChangedOnDisk = (
    documentResource: VsCodeDocumentResource, textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel
) => {
    return async () => {
        let jsonContent: string;
        try {
            const diskBytes = await vscode.workspace.fs.readFile(textDocument.uri);
            jsonContent = Buffer.from(diskBytes).toString('utf-8').trim();
        } catch (error) {
            console.warn(`Failed to read externally changed file: ${textDocument.uri.toString()}`, error);
            return;
        }

        // このウィンドウの TextDocument が既に (VSCode 自身の自動追従、または自分自身の保存で)
        // 同じ内容になっている場合は、onDidChangeTextDocument 側の経路に任せて何もしない。
        if (jsonContent === textDocument.getText().trim()) {
            return;
        }

        applyExternalContentChange(documentResource, textDocument, webviewPanel, jsonContent);
    };
};

const applyExternalContentChange = (
    documentResource: VsCodeDocumentResource, textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel,
    jsonContent: string
) => {
    const documentUri = textDocument.uri.toString();

    const parsedContent = tryParseJson(jsonContent);
    if (parsedContent == null) {
        console.warn(`Skipped notifying invalid external change: ${documentUri}`);
        return;
    }

    // MCP サーバー側が保持するドキュメントも最新化する
    const updated = documentResource.update(textDocument, parsedContent);
    if (updated === false) {
        return;
    }

    // TextDocument の変更・ファイル監視のどちらの経路で来た内容も、呼び出された時点で既にファイルへ
    // 書き込まれているため、webview 側の echo 抑止 (保存し返さない) の対象にしてよい。
    notifyExternalChangedDocument(webviewPanel.webview, textDocument, jsonContent, true);

    console.info(`Notified external document change to webview: ${documentUri}`);
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
    documentResource: VsCodeDocumentResource, textDocument: vscode.TextDocument, webviewPanel: vscode.WebviewPanel,
    onRegistered: (unregister: () => void) => void
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
                // MCP ツール経由の変更はまだファイルへ書き込まれていないため、webview からの
                // 保存往復を経て初めて永続化される (alreadyPersisted: false)
                notifyExternalChangedDocument(webviewPanel.webview, textDocument, updating, false);
            };

            const unregister = documentResource.register(textDocument, jsonContent, handleChangeView);
            onRegistered(unregister);

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
