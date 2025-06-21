import { instanceToPlain } from "class-transformer";
import { PropertyNotExistsError } from "~/models/exceptions";

type ColorModelOptions = {
    red: number, green: number, blue: number
}

export default class ColorValue {

    public static readonly WHITE = new ColorValue({ red: 255, green: 255, blue: 255 });
    public static readonly BLACK = new ColorValue({ red: 0, green: 0, blue: 0 });

    public readonly red: number;
    public readonly green: number;
    public readonly blue: number;

    constructor({ red, green, blue }: ColorModelOptions) {
        this.red = red;
        this.green = green;
        this.blue = blue;
    }

    public toHex(alpha: number = 1): string {
        return `rgba(${this.red}, ${this.green}, ${this.blue}, ${alpha})`
    }

    public reverseGrayscale(): ColorValue {
        const reverseAverage = 255 - (this.red + this.green + this.blue) / 3;
        return new ColorValue({ red: reverseAverage, green: reverseAverage, blue: reverseAverage });
    }

    public equals(other: ColorValue): boolean {
        return (this.red === other.red) && (this.green === other.green) && (this.blue === other.blue);
    }

    public static toObject(obj: object): ColorValue {
        if (!("red" in obj)) {
            throw new PropertyNotExistsError("red", obj);
        }
        if (!("green" in obj)) {
            throw new PropertyNotExistsError("green", obj);
        }
        if (!("blue" in obj)) {
            throw new PropertyNotExistsError("blue", obj);
        }

        return new ColorValue({
            red: obj.red as number,
            green: obj.green as number,
            blue: obj.blue as number
        });
    }

    public toJSON(): Record<string, unknown> {
        return instanceToPlain(this);
    }
}