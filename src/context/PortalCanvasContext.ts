import React from "react";

type PortalCanvas = {
    toolbarCanvasRef: React.RefObject<HTMLDivElement | null>,
    svgCanvasRef: React.RefObject<SVGSVGElement | null>
};

const PortalCanvasContext = React.createContext<PortalCanvas>({
    toolbarCanvasRef: { current: null }, svgCanvasRef: { current: null }
});

export default PortalCanvasContext;
