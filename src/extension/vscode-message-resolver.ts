import type * as vscode from 'vscode';
import { RectangleType } from '~/agent-tools/DocumentBudget';

import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from '~/components/constant';
import ErdDocument from '~/models/ErdDocument';
import RectangleViewModel from '~/models/RectangleViewModel';

export const ERD_MESSAGE_EVENT_SOURCE = "erd-designer";

// ================
//   初期化処理
// ================

// Webview → 拡張機能: React アプリの初期化準備が完了したことを通知する
type WebviewReadyMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "ready";
};

// 拡張機能 → Webview: 初期化完了後にファイル内容を渡す
type InitDocumentMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "init";
    documentUri: string;
    jsonContext: string;
};

/**
 * VSCode 側に準備完了を通知する。
 * VSCode 拡張機能が起動された時点で呼び出される。
 */
export const onStartedExtension = (vscodeApi: VsCodeApi) => {
    // VSCode 側に準備完了を通知する。その後、上記の message イベントが発火されるのを待つ。
    const message: WebviewReadyMessage = {
        eventSource: ERD_MESSAGE_EVENT_SOURCE,
        messageType: "ready"
    };

    vscodeApi.postMessage(message);
};

/**
 * ファイルの内容を React アプリケーションに渡す。
 */
export const initializeDocument = (
    _: WebviewReadyMessage, webview: vscode.Webview, textDocument: vscode.TextDocument, initContent: string
) => {
    const documentUri = textDocument.uri.toString();

    const message: InitDocumentMessage = {
        eventSource: ERD_MESSAGE_EVENT_SOURCE,
        messageType: "init",
        documentUri: documentUri,
        jsonContext: initContent
    };

    webview.postMessage(message);
};

/**
 * VSCode 拡張機能側より初期化処理が完了し、ファイルの内容を受信したときの制御。
 */
export const onInitializeCompleted = (message: InitDocumentMessage) => {
    const jsonContext = message.jsonContext as string;
    if (jsonContext.length === 0) {
        return { erdDocument: null };
    }

    try {
        const erdDocument = ErdDocument.toObject(JSON.parse(jsonContext));
        return { erdDocument: erdDocument };
    } catch (error) {
        return { error: error };
    }
};

// =====================
//   ファイル外部更新制御
// =====================

// 拡張機能 → Webview: 拡張機能側 (MCP 等) からのドキュメント変更を通知する
type ChangeDocumentMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "changeDocument";
    documentUri: string;
    jsonContext: string;
};

/**
 * 自身の操作以外で更新された場合は WebView に変更を通知する。
 */
export const notifyExternalChangedDocument = (
    webview: vscode.Webview, textDocument: vscode.TextDocument, updating: string
) => {
    const documentUri = textDocument.uri.toString();

    const message: ChangeDocumentMessage = {
        eventSource: ERD_MESSAGE_EVENT_SOURCE,
        messageType: "changeDocument",
        documentUri: documentUri,
        jsonContext: updating
    };

    webview.postMessage(message);
};

/**
 * React アプリケーションにて、外部で変更されたドキュメントを受信したときの制御。
 */
export const onExternalChangedDocument = (message: ChangeDocumentMessage) => {
    const jsonContext = message.jsonContext as string;

    let erdDocument: ErdDocument;
    try {
        erdDocument = ErdDocument.toObject(JSON.parse(jsonContext));
    } catch (error) {
        return { succeeded: false, error: error };
    }

    const customEvent = new CustomEvent(EXTERNAL_DOCUMENT_CHANGED_EVENT, {
        detail: {
            erdDocument: erdDocument
        }
    });

    // ドキュメントの履歴管理は MainView 管理の documentHolder で行うため、MainView に変更を通知する
    window.dispatchEvent(customEvent);
    return { succeeded: true };
};

// =====================
//   ファイル保存処理
// =====================

// Webview → 拡張機能: ドキュメントの保存を依頼する
type SaveDocumentMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "save";
    documentUri: string;
    erdDocument: Record<string, unknown>;
    loggingMessage: string;
};

/**
 * React アプリケーションから、VSCode 拡張機能に対して、ファイルの保存処理を依頼するハンドラを返却する。
 */
export const notifySaveDocument = (vscodeApi: VsCodeApi, documentUri: string) => {
    return (updating: ErdDocument, loggingMessage: string) => {
        // ファイル保存は VSCode 側に処理を委譲する
        const message: SaveDocumentMessage = {
            eventSource: ERD_MESSAGE_EVENT_SOURCE,
            messageType: "save",
            documentUri: documentUri,
            erdDocument: updating.toJSON(),
            loggingMessage: loggingMessage
        };

        vscodeApi.postMessage(message);
    };
};

/**
 * VSCode 拡張機能側にて、ファイルの保存を行う。
 */
export const onSaveDocument = async (
    vscodeModule: typeof import('vscode'), message: SaveDocumentMessage, textDocument: vscode.TextDocument
) => {
    const jsonContent = JSON.stringify(message.erdDocument, null, 4);

    const editRange = new vscodeModule.Range(0, 0, textDocument.lineCount, 0);

    const workspaceEdit = new vscodeModule.WorkspaceEdit();
    workspaceEdit.replace(textDocument.uri, editRange, jsonContent);

    const success = await vscodeModule.workspace.applyEdit(workspaceEdit);
    if (success === false) {
        // ファイル保存が失敗した場合にエラーメッセージを表示
        vscodeModule.window.showErrorMessage(`Failed to save erd file : ${textDocument.fileName}`);
        return false;
    }

    const result = await textDocument.save();
    if (result === false) {
        // ファイル保存が失敗した場合にエラーメッセージを表示
        vscodeModule.window.showErrorMessage(`Failed to save erd file : ${textDocument.fileName}`);
        return false;
    }

    return true;
};

// =====================
//   短形情報連携処理
// =====================

// Webview → 拡張機能: Canvas に描画されたテーブル矩形情報を通知する
type DrawnRectanglesMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "drawnRectangles";
    documentUri: string;
    rectangles: DrawnRectangle[];
};

type DrawnRectangle = {
    tableId: string;
    rectangle: RectangleType;
};

/**
 * Canvas 上に描画されたテーブルの矩形情報を受信し、拡張機能に伝搬する。
 */
export const onDrawnRectangles = (vscodeApi: VsCodeApi, documentUri: string, tableRectangles: Map<string, RectangleViewModel>) => {
    const rectangles = Array.from(tableRectangles.entries())
        .map(([tableId, rectangle]) => {
            return {
                tableId,
                rectangle: { ...rectangle }
            };
        });

    const drawnRectanglesMessage: DrawnRectanglesMessage = {
        eventSource: ERD_MESSAGE_EVENT_SOURCE,
        messageType: "drawnRectangles",
        documentUri: documentUri,
        rectangles: rectangles
    };

    vscodeApi.postMessage(drawnRectanglesMessage);
};