import React from "react";

export type ScaleState = { scale: number, phase: "idle" | "scaling" };

const DisplayScaleContext = React.createContext<ScaleState>({ scale: 1, phase: "idle" });

export default DisplayScaleContext;
