import React from "react";

class OnDraggingState {
    public readonly status = "on_dragging" as const;
    public readonly start: Point;
    public readonly current: Point;

    constructor(start: Point, current: Point) {
        this.start = start;
        this.current = current;
    }

    public delta(): Point {
        return {
            x: this.current.x - this.start.x,
            y: this.current.y - this.start.y
        };
    }
}

export type DragState = OnDraggingState | { status: "none" };

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
        //{ status: "on_dragging", start: action.start, current: action.start };
    }

    if (action.type === "on_dragging") {
        if (currentStatus.status !== "on_dragging") {
            return NO_DRAGGING;
        }

        return new OnDraggingState(currentStatus.start, action.current);
        // { status: "on_dragging", start: currentStatus.start, current: action.current };
    }

    if (action.type === "clear") {
        return NO_DRAGGING;
    }

    return currentStatus;
};

export const DragActionContext = React.createContext<DragState>(NO_DRAGGING);
