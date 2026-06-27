import html2canvas from "html2canvas";
import { ImageContent } from "~/context/ExportSpecificationContext";
import { calculateImageArea } from "~/features/canvas/canvasArea";

export const downloadPng = (erdCanvas: HTMLElement, exportImage: (contents: ImageContent) => void) => {
    const orgTransform = erdCanvas.style.transform;

    erdCanvas.style.transform = "scale(1)";
    const canvasRect = erdCanvas.getBoundingClientRect();
    const { leftEdge, topEdge, rightEdge, bottomEdge } = calculateImageArea(erdCanvas);
    erdCanvas.style.transform = orgTransform;

    const contentLeft = leftEdge - canvasRect.left;
    const contentTop = topEdge - canvasRect.top;
    const contentRight = rightEdge - canvasRect.left;
    const contentBottom = bottomEdge - canvasRect.top;

    const padding = 10;
    const captureWidth = contentRight - contentLeft + padding * 2;
    const captureHeight = contentBottom - contentTop + padding * 2;

    const options = {
        windowWidth: Math.max(captureWidth + 200, window.innerWidth),
        windowHeight: Math.max(captureHeight + 200, window.innerHeight),
        x: leftEdge - padding,
        y: topEdge - padding,
        width: captureWidth,
        height: captureHeight,
        // cSpell:ignore onclone
        onclone: (_doc: Document, element: HTMLElement) => {
            element.style.transform = "scale(1)";
            return rasterizeSvgOnClonedCanvas(element, contentLeft, contentTop, captureWidth, captureHeight);
        },
    };

    html2canvas(erdCanvas, options).then(drawCanvas => {
        const width = drawCanvas.width;
        const height = drawCanvas.height;
        const contents = drawCanvas.toDataURL("image/png");
        exportImage({ base64Value: contents, width, height });
    });
};

const SVG_RASTERIZE_MARGIN = 100;

const rasterizeSvgOnClonedCanvas = (
    clonedCanvas: HTMLElement, contentLeft: number, contentTop: number, captureWidth: number, captureHeight: number
): Promise<void> => {
    const svgElement = clonedCanvas.querySelector("svg");
    if (svgElement == null) {
        return Promise.resolve();
    }

    const svgLeft = contentLeft - SVG_RASTERIZE_MARGIN;
    const svgTop = contentTop - SVG_RASTERIZE_MARGIN;
    const svgWidth = captureWidth + SVG_RASTERIZE_MARGIN * 2;
    const svgHeight = captureHeight + SVG_RASTERIZE_MARGIN * 2;

    const allSvgChildren = svgElement.querySelectorAll("*");
    allSvgChildren.forEach(child => child.removeAttribute("style"));

    svgElement.removeAttribute("style");
    svgElement.setAttribute("width", `${svgWidth}`);
    svgElement.setAttribute("height", `${svgHeight}`);
    svgElement.setAttribute("viewBox", `${svgLeft} ${svgTop} ${svgWidth} ${svgHeight}`);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise<void>(resolve => {
        const img = new Image();

        img.onload = () => {
            const rasterCanvas = document.createElement("canvas");
            rasterCanvas.width = svgWidth;
            rasterCanvas.height = svgHeight;

            const ctx = rasterCanvas.getContext("2d");
            if (ctx != null) {
                ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
            }

            URL.revokeObjectURL(svgUrl);

            rasterCanvas.style.position = "absolute";
            rasterCanvas.style.left = `${svgLeft}px`;
            rasterCanvas.style.top = `${svgTop}px`;

            const parentNode = svgElement.parentNode;
            if (parentNode != null) {
                parentNode.replaceChild(rasterCanvas, svgElement);
            }

            resolve();
        };

        img.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            resolve();
        };

        img.src = svgUrl;
    });
};
