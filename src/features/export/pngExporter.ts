import html2canvas from "html2canvas";
import { ImageContent } from "~/context/ExportSpecificationContext";
import { calculateImageArea } from "~/features/canvas/canvasArea";

export const downloadPng = (erdCanvas: HTMLElement, exportImage: (contents: ImageContent) => void) => {
    const orgScale = erdCanvas.style.transform;

    // 描画領域を算出するために、一時的に拡大率をリセットする
    erdCanvas.style.transform = "scale(1)";
    const { leftEdge, topEdge, rightEdge, bottomEdge } = calculateImageArea(erdCanvas);
    erdCanvas.style.transform = orgScale;

    const options = {
        windowWidth: erdCanvas.scrollWidth,
        windowHeight: erdCanvas.scrollHeight,
        x: leftEdge - 10,
        y: topEdge - 10,
        width: rightEdge - leftEdge + 20,
        height: bottomEdge - topEdge + 20,
        onclone: (_doc: Document, element: HTMLElement) => {
            element.style.transform = "scale(1)";
        },
    };

    html2canvas(erdCanvas, options).then(drawCanvas => {
        const width = drawCanvas.width;
        const height = drawCanvas.height;

        const contents = drawCanvas.toDataURL("image/png");

        exportImage({ base64Value: contents, width, height });
    });
};

