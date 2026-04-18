import React from "react";

const ToolbarPortalContext = React.createContext<React.RefObject<HTMLDivElement | null>>({ current: null });

export default ToolbarPortalContext;
