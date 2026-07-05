
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

/** Webview 内部 CustomEvent: 外部からのドキュメント変更を ErdCanvas へ伝搬する */
export const EXTERNAL_DOCUMENT_CHANGED_EVENT = "externalDocumentChanged";

/** Webview 内部 CustomEvent: Canvas 描画矩形の更新を VsCodeExtensionApplication へ伝搬する */
export const CANVAS_RECTANGLES_DRAWN_EVENT = "canvasRectanglesDrawn";
