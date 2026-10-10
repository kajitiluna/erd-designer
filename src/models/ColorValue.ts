import { requireProperty } from "~/models/util";

export type ColorTheme = "light" | "dark";

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
        if (hexColorRegex.test(color) === false) {
            throw new Error(`Invalid color hex string: ${color}`);
        }

        const red = parseInt(color.substring(1, 3), 16);
        const green = parseInt(color.substring(3, 5), 16);
        const blue = parseInt(color.substring(5, 7), 16);

        return new ColorValue({ red, green, blue });
    }

    /** `#RRGGBB` of this color as drawn in the given theme. */
    public toHex(theme: ColorTheme = "light"): string {
        const color = this.to(theme);

        const rHex = color.red.toString(16).padStart(2, "0");
        const gHex = color.green.toString(16).padStart(2, "0");
        const bHex = color.blue.toString(16).padStart(2, "0");

        return `#${rHex}${gHex}${bHex}`.toUpperCase();
    }

    /** CSS `rgba(...)` of this color as drawn in the given theme. Alpha is applied as is. */
    public toRgba(theme: ColorTheme = "light", alpha: number = 1): string {
        const color = this.to(theme);

        return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
    }

    /** Returns the color to draw in the given theme. Light returns the same instance untouched. */
    public to(theme: ColorTheme): ColorValue {
        // 保存値は不変で描画時のみ変換する。light は丸め誤差を避けるため変換を通さない。
        if (theme === "light") {
            return this;
        }

        const hsl = rgbToHsl(this);
        const lightness = DARK_LIGHTNESS_MIN + DARK_LIGHTNESS_RANGE * (1 - hsl.lightness);

        return hslToRgb({ hue: hsl.hue, saturation: hsl.saturation, lightness });
    }

    public reverseGrayscale(): ColorValue {
        const reverseAverage = 255 - (this.red + this.green + this.blue) / 3;
        return new ColorValue({ red: reverseAverage, green: reverseAverage, blue: reverseAverage });
    }

    public equals(other: ColorValue): boolean {
        return (this.red === other.red) && (this.green === other.green) && (this.blue === other.blue);
    }

    public static toObject(obj: object): ColorValue {
        requireProperty(obj, "red");
        requireProperty(obj, "green");
        requireProperty(obj, "blue");

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

// 明度を反転しつつ [0.1, 0.9] に収め、純白・純黒を避けて暗い UI になじませる。
const DARK_LIGHTNESS_MIN = 0.1;
const DARK_LIGHTNESS_RANGE = 0.8;

type Hsl = { hue: number, saturation: number, lightness: number };

const rgbToHsl = (color: ColorValue): Hsl => {
    const red = color.red / 255;
    const green = color.green / 255;
    const blue = color.blue / 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);

    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) {
        return { hue: 0, saturation: 0, lightness };
    }

    const hue = calcHue(red, green, blue, max, delta);
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));

    return { hue, saturation, lightness };
};

const calcHue = (red: number, green: number, blue: number, maxValue: number, delta: number): number => {
    if (maxValue === red) {
        return 60 * (((green - blue) / delta + 6) % 6);
    }

    if (maxValue === green) {
        return 60 * ((blue - red) / delta + 2);
    }

    return 60 * ((red - green) / delta + 4);
};

const hslToRgb = ({ hue, saturation, lightness }: Hsl): ColorValue => {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const offset = lightness - chroma / 2;

    const channel = (shift: number): number => {
        const position = (hue / 60 + shift) % 6;
        const ratio = Math.min(Math.max(Math.abs(position - 3) - 1, 0), 1);

        return Math.round((offset + chroma * ratio) * 255);
    };

    return new ColorValue({ red: channel(0), green: channel(4), blue: channel(2) });
};