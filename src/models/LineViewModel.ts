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

export type LabelPosition = { segment: number, fraction: number, dx: number, dy: number };
export type LabelStyle = { bold: boolean, italic: boolean, strikethrough: boolean, fontSize: number, color?: string };

type LineViewModelOptions = {
    strokeWidth?: number,
    edges?: Point[],
    orthogonalLines?: OrthogonalDirection[],
    color?: ColorValue,
    labelPosition?: LabelPosition,
    labelStyle?: LabelStyle
};

export default class LineViewModel {

    public readonly strokeWidth: number;
    public readonly edges: Point[];
    public readonly orthogonalLines: OrthogonalDirection[];
    public readonly color: ColorValue;
    public readonly labelPosition: LabelPosition;
    public readonly labelStyle: LabelStyle;

    constructor({ strokeWidth = 1, edges = [], orthogonalLines = [], color = ColorValue.BLACK, labelPosition = { segment: -1, fraction: 0, dx: 0, dy: 0 }, labelStyle = { bold: false, italic: false, strikethrough: false, fontSize: 13 } }: LineViewModelOptions) {
        this.strokeWidth = (strokeWidth > 0) ? strokeWidth : 1;
        this.edges = [...edges] as const;
        this.orthogonalLines = [...orthogonalLines] as const;
        this.color = color;
        this.labelPosition = labelPosition;
        this.labelStyle = labelStyle;
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

    public updateLabelPosition(next: LabelPosition): LineViewModel {
        if (this.labelPosition.segment === next.segment
            && this.labelPosition.fraction === next.fraction
            && this.labelPosition.dx === next.dx
            && this.labelPosition.dy === next.dy) {
            return this;
        }

        return new LineViewModel({ ...this, labelPosition: next });
    }

    public updateLabelStyle(next: LabelStyle): LineViewModel {
        if (this.labelStyle.bold === next.bold
            && this.labelStyle.italic === next.italic
            && this.labelStyle.strikethrough === next.strikethrough
            && this.labelStyle.fontSize === next.fontSize
            && this.labelStyle.color === next.color) {
            return this;
        }

        return new LineViewModel({ ...this, labelStyle: next });
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
        const isMatchOrthogonal = this.orthogonalLines.every((line, index) => {
            const otherLine = other.orthogonalLines[index];
            return (line.direction === otherLine.direction)
                && (line.position === otherLine.position);
        });
        if (!isMatchOrthogonal) {
            return false;
        }

        if (this.labelPosition.segment !== other.labelPosition.segment
            || this.labelPosition.fraction !== other.labelPosition.fraction
            || this.labelPosition.dx !== other.labelPosition.dx
            || this.labelPosition.dy !== other.labelPosition.dy) {
            return false;
        }

        if (this.labelStyle.bold !== other.labelStyle.bold
            || this.labelStyle.italic !== other.labelStyle.italic
            || this.labelStyle.strikethrough !== other.labelStyle.strikethrough
            || this.labelStyle.fontSize !== other.labelStyle.fontSize
            || this.labelStyle.color !== other.labelStyle.color) {
            return false;
        }

        return true;
    }

    public toJSON(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            strokeWidth: this.strokeWidth,
            edges: this.edges,
            orthogonalLines: this.orthogonalLines,
            color: this.color.toJSON()
        };

        if (this.labelPosition.segment >= 0) {
            json.labelPosition = this.labelPosition;
        }

        if (this.labelStyle.bold || this.labelStyle.italic || this.labelStyle.strikethrough
            || this.labelStyle.fontSize !== 13 || this.labelStyle.color) {
            json.labelStyle = this.labelStyle;
        }

        return json;
    }

    public static toObject(obj: object): LineViewModel {
        if (!("strokeWidth" in obj)) {
            throw new PropertyNotExistsError("strokeWidth", obj);
        }

        const edges = ("edges" in obj) ? obj.edges as Point[] : [];
        const orthogonalLines = ("orthogonalLines" in obj) ? obj.orthogonalLines as OrthogonalDirection[] : [];
        const color = ("color" in obj) ? ColorValue.toObject(obj.color as object) : ColorValue.BLACK;
        const labelPosition = ("labelPosition" in obj)
            ? obj.labelPosition as LabelPosition
            : { segment: -1, fraction: 0, dx: 0, dy: 0 };
        const labelStyle = ("labelStyle" in obj)
            ? obj.labelStyle as LabelStyle
            : { bold: false, italic: false, strikethrough: false, fontSize: 13 };

        return new LineViewModel({
            strokeWidth: obj.strokeWidth as number,
            edges: edges,
            orthogonalLines: orthogonalLines,
            color: color,
            labelPosition: labelPosition,
            labelStyle: labelStyle
        });
    }
}