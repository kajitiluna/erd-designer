import React from "react";
import { DragState, OnDraggingState } from "~/models/DragState";

export type DragAction = { type: "start_dragging", start: Point }
    | { type: "on_dragging", current: Point }
    | { type: "clear" };

type Point = { x: number; y: number; };

export const NO_DRAGGING: DragState = { status: "none" } as const;

export const reduceDragAction = (currentStatus: DragState, action: DragAction): DragState => {
    if (action.type === "start_dragging") {
        if (currentStatus.status !== "none") {
            return NO_DRAGGING;
        }

        return new OnDraggingState(action.start, action.start);
    }

    if (action.type === "on_dragging") {
        if (currentStatus.status !== "on_dragging") {
            return NO_DRAGGING;
        }

        return new OnDraggingState(currentStatus.start, action.current);
    }

    if (action.type === "clear") {
        return NO_DRAGGING;
    }

    return currentStatus;
};

export const DragActionContext = React.createContext<DragState>(NO_DRAGGING);
