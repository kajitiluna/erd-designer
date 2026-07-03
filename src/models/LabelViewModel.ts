import ColorValue from "~/models/ColorValue";
import { requireProperty } from "~/models/util";

export type LabelPosition = {
    segment: number,
    /** 該当 segment における位置比率を 0 から 1 の範囲で表す */
    fraction: number,
    /** x 軸方向のオフセット */
    offsetX: number,
    /** y 軸方向のオフセット */
    offsetY: number
};

export type FontStyle = {
    bold: boolean,
    italic: boolean,
    strikethrough: boolean,
    fontSize: number
};

type LabelViewModelOptions = {
    label: string,
    position?: LabelPosition,
    color?: ColorValue,
    style?: FontStyle
};

const DEFAULT_POSITION: LabelPosition = { segment: -1, fraction: 0, offsetX: 0, offsetY: 0 };
const DEFAULT_STYLE: FontStyle = {
    bold: false, italic: false, strikethrough: false, fontSize: 10
};

export default class LabelViewModel {

    public readonly label: string;
    public readonly position: LabelPosition;
    public readonly color: ColorValue;
    public readonly style: FontStyle;

    constructor({
        label, position = DEFAULT_POSITION, color = ColorValue.BLACK, style = DEFAULT_STYLE
    }: LabelViewModelOptions) {
        this.label = label;
        this.position = position;
        this.color = color;
        this.style = style;
    }

    public updateLabelPosition(next: LabelPosition): LabelViewModel {
        if (isSamePosition(this.position, next)) {
            return this;
        }

        return new LabelViewModel({ ...this, position: next });
    }

    public updateLabelStyle(next: FontStyle): LabelViewModel {
        if (isSameStyle(this.style, next)) {
            return this;
        }

        return new LabelViewModel({ ...this, style: next });
    }

    public updateColor(next: ColorValue): LabelViewModel {
        if (this.color.equals(next)) {
            return this;
        }

        return new LabelViewModel({ ...this, color: next });
    }

    public equals(other: LabelViewModel): boolean {
        if (this.label !== other.label) {
            return false;
        }
        if (isSamePosition(this.position, other.position) === false) {
            return false;
        }
        if (this.color.equals(other.color) === false) {
            return false;
        }
        if (isSameStyle(this.style, other.style) === false) {
            return false;
        }

        return true;
    }

    public toJSON(): Record<string, unknown> {
        return {
            label: this.label,
            position: this.position,
            color: this.color.toJSON(),
            style: this.style
        };
    }

    public static toObject(obj: object): LabelViewModel {
        requireProperty(obj, "label");
        requireProperty(obj, "position");
        requireProperty(obj, "color");
        requireProperty(obj, "style");

        return new LabelViewModel({
            label: obj.label as string,
            position: obj.position as LabelPosition,
            color: ColorValue.toObject(obj.color as object),
            style: obj.style as FontStyle
        });
    }
}

const isSamePosition = (first: LabelPosition, second: LabelPosition): boolean => {
    return (first.segment === second.segment)
        && (first.fraction === second.fraction)
        && (first.offsetX === second.offsetX)
        && (first.offsetY === second.offsetY);
};

const isSameStyle = (first: FontStyle, second: FontStyle): boolean => {
    return (first.bold === second.bold)
        && (first.italic === second.italic)
        && (first.strikethrough === second.strikethrough)
        && (first.fontSize === second.fontSize);
};