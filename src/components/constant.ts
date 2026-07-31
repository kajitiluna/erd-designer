
export const GRID_CELL_STYLE: React.CSSProperties = {
    borderBottomColor: "#e0e0e0",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    borderCollapse: "separate",
    colorScheme: "lightDark",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "16px",
    paddingRight: "16px",
    textAlign: "left",
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.43,
    letterSpacing: "0.01071em",
    minHeight: "30px"
} as const;

/** Webview 内部 CustomEvent: 外部からのドキュメント変更を MainView へ伝搬する */
export const EXTERNAL_DOCUMENT_CHANGED_EVENT = "externalDocumentChanged";

/** Webview 内部 CustomEvent: Canvas 描画矩形の更新を VsCodeExtensionApplication へ伝搬する */
export const CANVAS_RECTANGLES_DRAWN_EVENT = "canvasRectanglesDrawn";

/**
 * Webview 内部 CustomEvent: Google Drive の外部変更チェック要求を GoogleDriveFile へ伝搬する。
 * 定期実行 (TitlePanel の RemoteSyncIndicator) と手動更新ボタンの双方がこのイベントを発火する
 * 唯一の起点であり、読み込み契機を 1 本に統一する。
 */
export const REMOTE_SYNC_REQUESTED_EVENT = "remoteSyncRequested";

/** Google Drive の外部変更チェック間隔。RemoteSyncIndicator のカウントダウンにも用いる */
export const REMOTE_SYNC_INTERVAL_MILLISECOND = 10 * 1000;
