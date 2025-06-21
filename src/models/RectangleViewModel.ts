import { PropertyNotExistsError } from "~/models/exceptions";

type RectangleViewModelOptions = {
    positionX: number;
    positionY: number;
    width: number;
    height: number;
}

export default class RectangleViewModel {

    public readonly positionX: number;
    public readonly positionY: number;
    public readonly width: number;
    public readonly height: number;

    constructor({ positionX, positionY, width, height }: RectangleViewModelOptions) {
        this.positionX = positionX;
        this.positionY = positionY;
        this.width = width;
        this.height = height;
    }

    public static createFromPoints(
        first: { x: number, y: number }, second: { x: number, y: number }
    ): RectangleViewModel {
        const positionX = Math.min(first.x, second.x);
        const positionY = Math.min(first.y, second.y);
        const width = Math.max(Math.abs(first.x - second.x), 2);
        const height = Math.max(Math.abs(first.y - second.y), 2);

        return new RectangleViewModel({ positionX, positionY, width, height });
    }

    public static createFromEdges(rectangle: { left: number, top: number, right: number, bottom: number }): RectangleViewModel {
        const positionX = rectangle.left;
        const positionY = rectangle.top;
        const width = rectangle.right - rectangle.left;
        const height = rectangle.bottom - rectangle.top;

        return new RectangleViewModel({ positionX, positionY, width, height });
    }

    public move(moving: { x: number, y: number }): RectangleViewModel {
        return new RectangleViewModel({
            positionX: this.positionX + moving.x,
            positionY: this.positionY + moving.y,
            width: this.width,
            height: this.height
        });
    }

    public get left() {
        return this.positionX;
    }

    public get right() {
        return this.positionX + this.width;
    }

    public get xCenter() {
        return this.positionX + this.width / 2;
    }

    public get top() {
        return this.positionY;
    }

    public get bottom() {
        return this.positionY + this.height;
    }

    public get yCenter() {
        return this.positionY + this.height / 2;
    }

    public get center() {
        return { x: this.xCenter, y: this.yCenter };
    }

    public contains(target: { x: number, y: number } | RectangleViewModel): boolean {
        if (target instanceof RectangleViewModel) {
            return this.containsArea(target);
        }

        return this.containsPoint(target);
    }

    private containsArea(rectangle: RectangleViewModel): boolean {
        if (this.left > rectangle.left) {
            return false;
        }
        if (this.right < rectangle.right) {
            return false;
        }
        if (this.top > rectangle.top) {
            return false;
        }
        if (this.bottom < rectangle.bottom) {
            return false;
        }

        return true;
    }

    private containsPoint(point: { x: number, y: number }): boolean {
        if (point.x < this.left) {
            return false;
        }
        if (point.x > this.right) {
            return false;
        }
        if (point.y < this.top) {
            return false;
        }
        if (point.y > this.bottom) {
            return false;
        }

        return true;
    }

    public static toObject(obj: object): RectangleViewModel {
        if (!("positionX" in obj)) {
            throw new PropertyNotExistsError("positionX", obj);
        }
        if (!("positionY" in obj)) {
            throw new PropertyNotExistsError("positionY", obj);
        }
        if (!("width" in obj)) {
            throw new PropertyNotExistsError("width", obj);
        }
        if (!("height" in obj)) {
            throw new PropertyNotExistsError("height", obj);
        }

        return new RectangleViewModel({
            positionX: obj.positionX as number,
            positionY: obj.positionY as number,
            width: obj.width as number,
            height: obj.height as number
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            positionX: this.positionX,
            positionY: this.positionY,
            width: this.width,
            height: this.height
        };
    }

    public equals(other: RectangleViewModel): boolean {
        if (this.positionX !== other.positionX) {
            return false;
        }
        if (this.positionY !== other.positionY) {
            return false;
        }
        if (this.width !== other.width) {
            return false;
        }
        if (this.height !== other.height) {
            return false;
        }

        return true;
    }
}