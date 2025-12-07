import { PropertyNotExistsError } from "~/models/exceptions";

type ColorModelOptions = {
    red: number, green: number, blue: number
}

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

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

    public static fromHex(color: string): ColorValue {
        if (!hexColorRegex.test(color)) {
            throw new Error(`Invalid color hex string: ${color}`);
        }

        const red = parseInt(color.substring(1, 3), 16);
        const green = parseInt(color.substring(3, 5), 16);
        const blue = parseInt(color.substring(5, 7), 16);
        return new ColorValue({ red, green, blue });
    }

    public toHex(): string {
        const rHex = this.red.toString(16).padStart(2, "0");
        const gHex = this.green.toString(16).padStart(2, "0");
        const bHex = this.blue.toString(16).padStart(2, "0");

        return `#${rHex}${gHex}${bHex}`.toUpperCase();
    }

    public toRgba(alpha: number = 1): string {
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
        return {
            red: this.red,
            green: this.green,
            blue: this.blue
        };
    }
}