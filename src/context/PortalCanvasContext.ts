import React from "react";

type PortalCanvas = {
    toolbarCanvasElement: HTMLDivElement | null,
    svgCanvasElement: SVGSVGElement | null
};

const PortalCanvasContext = React.createContext<PortalCanvas>({
    toolbarCanvasElement: null, svgCanvasElement: null
});

export default PortalCanvasContext;
