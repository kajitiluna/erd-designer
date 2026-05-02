import html2canvas from "html2canvas";
import { ImageContent } from "~/context/ExportSpecificationContext";
import { calculateImageArea } from "~/features/canvas/canvasArea";

export const downloadPng = (erdCanvas: HTMLElement, exportImage: (contents: ImageContent) => void) => {
    const orgScale = erdCanvas.style.transform;
    erdCanvas.style.transform = "scale(1)";

    const { leftEdge, topEdge, rightEdge, bottomEdge } = calculateImageArea(erdCanvas);

    const options = {
        windowWidth: erdCanvas.scrollWidth,
        windowHeight: erdCanvas.scrollHeight,
        x: leftEdge - 10,
        y: topEdge - 10,
        width: rightEdge - leftEdge + 20,
        height: bottomEdge - topEdge + 20,
    };

    html2canvas(erdCanvas, options).then(drawCanvas => {
        const width = drawCanvas.width;
        const height = drawCanvas.height;

        erdCanvas.style.transform = orgScale;
        const contents = drawCanvas.toDataURL("image/png");

        exportImage({ base64Value: contents, width, height });
    });
};

