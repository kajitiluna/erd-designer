import { instanceToPlain } from "class-transformer";
import { PropertyNotExistsError } from "~/models/exceptions";

type Point = { x: number, y: number };

type MarkerDraggingType = {
    index: number,
    markerType: "real" | "virtual",
    point: Point,
    inDragging: boolean
};

type LineViewModelOptions = {
    strokeWidth?: number,
    edges?: Point[]
};

export default class LineViewModel {

    public readonly strokeWidth: number;
    public readonly edges: Point[];

    constructor({ strokeWidth = 1, edges = [] }: LineViewModelOptions) {
        this.strokeWidth = (strokeWidth > 0) ? strokeWidth : 1;
        this.edges = [...edges];
    }

    public updateEdge(marker: MarkerDraggingType): LineViewModel {
        if (marker.markerType === "virtual") {
            const nextEdges = [...this.edges];
            nextEdges.splice(marker.index, 0, marker.point);

            return new LineViewModel({ strokeWidth: this.strokeWidth, edges: nextEdges });
        }

        if ((marker.index < 0) || (marker.index >= this.edges.length)) {
            return this;
        }

        const nextEdges = [...this.edges];
        nextEdges[marker.index] = marker.point;

        return new LineViewModel({ strokeWidth: this.strokeWidth, edges: nextEdges });
    }

    public deleteEdge(index: number): LineViewModel {
        if ((index < 0) || (index >= this.edges.length)) {
            return this;
        }

        const nextEdges = [...this.edges];
        nextEdges.splice(index, 1);

        return new LineViewModel({ strokeWidth: this.strokeWidth, edges: nextEdges });
    }

    public svgPath(startEdge: Point, endEdge: Point, markerDragging: MarkerDraggingType | null): string {
        if ((markerDragging == null) || (markerDragging.inDragging === false)) {
            const path = this.edges.map(edge => ` L ${edge.x},${edge.y}`).join("");
            return `M ${startEdge.x},${startEdge.y}${path} L ${endEdge.x},${endEdge.y}`
        }

        const subPathes = [];
        for (let index = 0; index < this.edges.length; index++) {
            const currentEdge = this.edges[index];
            if (index !== markerDragging.index) {
                subPathes.push(` L ${currentEdge.x},${currentEdge.y}`);
                continue;
            }

            subPathes.push(` L ${markerDragging.point.x},${markerDragging.point.y}`);
            if (markerDragging.markerType === "virtual") {
                subPathes.push(` L ${currentEdge.x},${currentEdge.y}`);
            }
        }

        if ((markerDragging.index === this.edges.length) && (markerDragging.markerType === "virtual")) {
            subPathes.push(` L ${markerDragging.point.x},${markerDragging.point.y}`);
        }

        return `M ${startEdge.x},${startEdge.y}${subPathes.join("")} L ${endEdge.x},${endEdge.y}`;
    }

    public toJSON(): Record<string, unknown> {
        return instanceToPlain(this);
    }

    public static toObject(obj: object): LineViewModel {
        if (!("strokeWidth" in obj)) {
            throw new PropertyNotExistsError("strokeWidth", obj);
        }

        const edges = ("edges" in obj) ? obj.edges as { x: number, y: number }[] : [];

        return new LineViewModel({
            strokeWidth: obj.strokeWidth as number,
            edges: edges
        });
    }
}