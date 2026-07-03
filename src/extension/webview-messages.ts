import { RectangleType } from "~/extension/mcpserver/DocumentBudget";

/**
 * VSCode 拡張機能と Webview (React アプリ) 間で交換するメッセージ、
 * および Webview 内部で伝搬する CustomEvent の型付き定義。
 * 文字列リテラルが両者に分散しないよう、プロトコルはここで一元管理する。
 */

export const ERD_MESSAGE_EVENT_SOURCE = "erd-designer";

export type DrawnRectangle = {
    tableId: string;
    rectangle: RectangleType;
};

/** Webview → 拡張機能: React アプリの初期化準備が完了したことを通知する */
export type WebviewReadyMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "ready";
};

/** Webview → 拡張機能: Canvas に描画されたテーブル矩形情報を通知する */
export type DrawnRectanglesMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "drawnRectangles";
    documentUri: string;
    rectangles: DrawnRectangle[];
};

/** Webview → 拡張機能: ドキュメントの保存を依頼する */
export type SaveDocumentMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "save";
    documentUri: string;
    erdDocument: Record<string, unknown>;
    loggingMessage: string;
};

export type MessageToExtension = WebviewReadyMessage | DrawnRectanglesMessage | SaveDocumentMessage;

/** 拡張機能 → Webview: 初期化完了後にファイル内容を渡す */
export type InitDocumentMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "init";
    documentUri: string;
    jsonContext: string;
};

/** 拡張機能 → Webview: 拡張機能側 (MCP 等) からのドキュメント変更を通知する */
export type ChangeDocumentMessage = {
    eventSource: typeof ERD_MESSAGE_EVENT_SOURCE;
    messageType: "changeDocument";
    documentUri: string;
    jsonContext: string;
};

export type MessageToWebview = InitDocumentMessage | ChangeDocumentMessage;

/** Webview 内部 CustomEvent: 外部からのドキュメント変更を ErdCanvas へ伝搬する */
export const EXTERNAL_DOCUMENT_CHANGED_EVENT = "externalDocumentChanged";

/** Webview 内部 CustomEvent: Canvas 描画矩形の更新を VsCodeExtensionApplication へ伝搬する */
export const CANVAS_RECTANGLES_DRAWN_EVENT = "canvasRectanglesDrawn";
