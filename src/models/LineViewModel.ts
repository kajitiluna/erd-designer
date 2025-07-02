import { instanceToPlain } from "class-transformer";

import ColorValue from "~/models/ColorValue";
import { PropertyNotExistsError } from "~/models/exceptions";

type Point = { x: number, y: number };

export type OrthogonalDirection = {
    direction: "horizontal" | "vertical",
    position: number
};

type MarkerDraggingType = {
    edgeType: "real" | "virtual",
    edgeId: number,
    point: Point
};

type LineViewModelOptions = {
    strokeWidth?: number,
    edges?: Point[],
    orthogonalLines?: OrthogonalDirection[],
    color?: ColorValue
};

export default class LineViewModel {

    public readonly strokeWidth: number;
    public readonly edges: Point[];
    public readonly orthogonalLines: OrthogonalDirection[];
    public readonly color: ColorValue;

    constructor({ strokeWidth = 1, edges = [], orthogonalLines = [], color = ColorValue.BLACK }: LineViewModelOptions) {
        this.strokeWidth = (strokeWidth > 0) ? strokeWidth : 1;
        this.edges = [...edges] as const;
        this.orthogonalLines = [...orthogonalLines] as const;
        this.color = color;
    }

    public get lineType(): ("orthogonal" | "straight") {
        return (this.orthogonalLines.length > 0) ? "orthogonal" : "straight";
    }

    public updateEdge(marker: MarkerDraggingType): LineViewModel {
        if (marker.edgeType === "virtual") {
            const nextEdges = [...this.edges];
            nextEdges.splice(marker.edgeId, 0, marker.point);

            return new LineViewModel({ ...this, edges: nextEdges, orthogonalLines: [] });
        }

        if ((marker.edgeId < 0) || (marker.edgeId >= this.edges.length)) {
            return this;
        }

        const nextEdges = [...this.edges];
        nextEdges[marker.edgeId] = marker.point;

        return new LineViewModel({ ...this, edges: nextEdges, orthogonalLines: [] });
    }

    public updateOrthogonalLines(orthogonalLines: OrthogonalDirection[]): LineViewModel {
        return new LineViewModel({ ...this, orthogonalLines: [...orthogonalLines], edges: [] });
    }

    public updateStrokeWidth(nextWidth: number): LineViewModel {
        if ((this.strokeWidth === nextWidth) || (nextWidth <= 0)) {
            return this;
        }

        return new LineViewModel({ ...this, strokeWidth: nextWidth });
    }

    public updateColor(nextColor: ColorValue): LineViewModel {
        if (this.color.equals(nextColor)) {
            return this;
        }

        return new LineViewModel({ ...this, color: nextColor });
    }

    public deleteEdge(index: number): LineViewModel {
        if ((index < 0) || (index >= this.edges.length)) {
            return this;
        }

        const nextEdges = [...this.edges];
        nextEdges.splice(index, 1);

        return new LineViewModel({ ...this, edges: nextEdges });
    }

    public equals(other: LineViewModel): boolean {
        if (this === other) {
            return true;
        }

        if (this.strokeWidth !== other.strokeWidth) {
            return false;
        }

        if (this.edges.length !== other.edges.length) {
            return false;
        }

        if (!this.color.equals(other.color)) {
            return false;
        }

        const isMatchEdges = this.edges.every((edge, index) => {
            const otherEdge = other.edges[index];
            return (edge.x === otherEdge.x) && (edge.y === otherEdge.y);
        });
        if (!isMatchEdges) {
            return false;
        }

        if (this.orthogonalLines.length !== other.orthogonalLines.length) {
            return false;
        }
        return this.orthogonalLines.every((line, index) => {
            const otherLine = other.orthogonalLines[index];
            return (line.direction === otherLine.direction)
                && (line.position === otherLine.position);
        });
    }

    public toJSON(): Record<string, unknown> {
        return instanceToPlain(this);
    }

    public static toObject(obj: object): LineViewModel {
        if (!("strokeWidth" in obj)) {
            throw new PropertyNotExistsError("strokeWidth", obj);
        }

        const edges = ("edges" in obj) ? obj.edges as Point[] : [];
        const orthogonalLines = ("orthogonalLines" in obj) ? obj.orthogonalLines as OrthogonalDirection[] : [];
        const color = ("color" in obj) ? ColorValue.toObject(obj.color as object) : ColorValue.BLACK;

        return new LineViewModel({
            strokeWidth: obj.strokeWidth as number,
            edges: edges,
            orthogonalLines: orthogonalLines,
            color: color
        });
    }
}