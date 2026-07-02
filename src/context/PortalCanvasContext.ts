import React from "react";

type PortalCanvas = {
    canvasElement: HTMLDivElement | null,
    toolbarCanvasElement: HTMLDivElement | null,
    svgCanvasElement: SVGSVGElement | null
};

const PortalCanvasContext = React.createContext<PortalCanvas>({
    canvasElement: null, toolbarCanvasElement: null, svgCanvasElement: null
});

export default PortalCanvasContext;
