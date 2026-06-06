
export class OnDraggingState {

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

type Point = { x: number; y: number; };

export type DragState = OnDraggingState | { status: "none" };