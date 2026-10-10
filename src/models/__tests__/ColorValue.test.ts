import ColorValue from '../ColorValue';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ColorValue', () => {
    describe('constructor', () => {
        test('should create with provided RGB values', () => {
            const color = new ColorValue({ red: 255, green: 128, blue: 64 });

            expect(color.red).toBe(255);
            expect(color.green).toBe(128);
            expect(color.blue).toBe(64);
        });

        test('should create with zero values', () => {
            const color = new ColorValue({ red: 0, green: 0, blue: 0 });

            expect(color.red).toBe(0);
            expect(color.green).toBe(0);
            expect(color.blue).toBe(0);
        });
    });

    describe('static constants', () => {
        test('WHITE should have correct RGB values', () => {
            expect(ColorValue.WHITE.red).toBe(255);
            expect(ColorValue.WHITE.green).toBe(255);
            expect(ColorValue.WHITE.blue).toBe(255);
        });

        test('BLACK should have correct RGB values', () => {
            expect(ColorValue.BLACK.red).toBe(0);
            expect(ColorValue.BLACK.green).toBe(0);
            expect(ColorValue.BLACK.blue).toBe(0);
        });
    });

    describe('toHex', () => {
        test('should convert to rgba format with default alpha', () => {
            const color = new ColorValue({ red: 255, green: 128, blue: 64 });

            expect(color.toRgba()).toBe('rgba(255, 128, 64, 1)');
        });

        test('should convert to rgba format with custom alpha', () => {
            const color = new ColorValue({ red: 255, green: 128, blue: 64 });

            expect(color.toRgba('light', 0.5)).toBe('rgba(255, 128, 64, 0.5)');
            expect(color.toRgba('light', 0)).toBe('rgba(255, 128, 64, 0)');
            expect(color.toRgba('light', 0.75)).toBe('rgba(255, 128, 64, 0.75)');
        });

        test('should handle edge case RGB values', () => {
            const black = new ColorValue({ red: 0, green: 0, blue: 0 });
            const white = new ColorValue({ red: 255, green: 255, blue: 255 });

            expect(black.toRgba()).toBe('rgba(0, 0, 0, 1)');
            expect(white.toRgba()).toBe('rgba(255, 255, 255, 1)');
        });
    });

    describe('reverseGrayscale', () => {
        test('should calculate reverse grayscale correctly', () => {
            const color = new ColorValue({ red: 100, green: 150, blue: 200 });
            const reversed = color.reverseGrayscale();

            // Average: (100 + 150 + 200) / 3 = 150
            // Reverse: 255 - 150 = 105
            expect(reversed.red).toBe(105);
            expect(reversed.green).toBe(105);
            expect(reversed.blue).toBe(105);
        });

        test('should handle black color', () => {
            const black = new ColorValue({ red: 0, green: 0, blue: 0 });
            const reversed = black.reverseGrayscale();

            // Average: 0, Reverse: 255 - 0 = 255
            expect(reversed.red).toBe(255);
            expect(reversed.green).toBe(255);
            expect(reversed.blue).toBe(255);
        });

        test('should handle white color', () => {
            const white = new ColorValue({ red: 255, green: 255, blue: 255 });
            const reversed = white.reverseGrayscale();

            // Average: 255, Reverse: 255 - 255 = 0
            expect(reversed.red).toBe(0);
            expect(reversed.green).toBe(0);
            expect(reversed.blue).toBe(0);
        });

        test('should handle gray color', () => {
            const gray = new ColorValue({ red: 128, green: 128, blue: 128 });
            const reversed = gray.reverseGrayscale();

            // Average: 128, Reverse: 255 - 128 = 127
            expect(reversed.red).toBe(127);
            expect(reversed.green).toBe(127);
            expect(reversed.blue).toBe(127);
        });
    });

    describe('equals', () => {
        test('should return true for identical colors', () => {
            const color1 = new ColorValue({ red: 255, green: 128, blue: 64 });
            const color2 = new ColorValue({ red: 255, green: 128, blue: 64 });

            expect(color1.equals(color2)).toBe(true);
        });

        test('should return false for different colors', () => {
            const color1 = new ColorValue({ red: 255, green: 128, blue: 64 });
            const color2 = new ColorValue({ red: 255, green: 128, blue: 65 });

            expect(color1.equals(color2)).toBe(false);
        });

        test('should return true when comparing with itself', () => {
            const color = new ColorValue({ red: 255, green: 128, blue: 64 });

            expect(color.equals(color)).toBe(true);
        });

        test('should return true for static constants', () => {
            const white = new ColorValue({ red: 255, green: 255, blue: 255 });
            const black = new ColorValue({ red: 0, green: 0, blue: 0 });

            expect(white.equals(ColorValue.WHITE)).toBe(true);
            expect(black.equals(ColorValue.BLACK)).toBe(true);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const color = new ColorValue({ red: 255, green: 128, blue: 64 });

            const json = color.toJSON();

            expect(json).toEqual({
                red: 255,
                green: 128,
                blue: 64
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const obj = {
                red: 255,
                green: 128,
                blue: 64
            };

            const color = ColorValue.toObject(obj);

            expect(color).toBeInstanceOf(ColorValue);
            expect(color.red).toBe(255);
            expect(color.green).toBe(128);
            expect(color.blue).toBe(64);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = new ColorValue({ red: 255, green: 128, blue: 64 });

            const json = original.toJSON();
            const deserialized = ColorValue.toObject(json);

            expect(deserialized).toBeInstanceOf(ColorValue);
            expect(deserialized.red).toBe(original.red);
            expect(deserialized.green).toBe(original.green);
            expect(deserialized.blue).toBe(original.blue);
            expect(deserialized.equals(original)).toBe(true);
        });

        test('should throw error when red is missing', () => {
            const obj = {
                green: 128,
                blue: 64
            };

            expect(() => ColorValue.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when green is missing', () => {
            const obj = {
                red: 255,
                blue: 64
            };

            expect(() => ColorValue.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when blue is missing', () => {
            const obj = {
                red: 255,
                green: 128
            };

            expect(() => ColorValue.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when all properties are missing', () => {
            expect(() => ColorValue.toObject({}))
                .toThrow(PropertyNotExistsError);
        });
    });
});

const toLightness = (color: ColorValue): number => {
    const max = Math.max(color.red, color.green, color.blue) / 255;
    const min = Math.min(color.red, color.green, color.blue) / 255;
    return (max + min) / 2;
};

const toHue = (color: ColorValue): number => {
    const red = color.red / 255;
    const green = color.green / 255;
    const blue = color.blue / 255;
    const max = Math.max(red, green, blue);
    const delta = max - Math.min(red, green, blue);
    if (max === red) {
        return 60 * (((green - blue) / delta + 6) % 6);
    }
    if (max === green) {
        return 60 * ((blue - red) / delta + 2);
    }
    return 60 * ((red - green) / delta + 4);
};

const SAMPLE_COLORS = [
    new ColorValue({ red: 250, green: 250, blue: 250 }),
    new ColorValue({ red: 33, green: 33, blue: 33 }),
    new ColorValue({ red: 255, green: 235, blue: 238 }),
    new ColorValue({ red: 183, green: 28, blue: 28 }),
    new ColorValue({ red: 233, green: 30, blue: 99 }),
    new ColorValue({ red: 74, green: 20, blue: 140 }),
    new ColorValue({ red: 227, green: 242, blue: 253 })
];

describe("ColorValue to light", () => {
    test("to は同一インスタンスを返す", () => {
        const color = new ColorValue({ red: 12, green: 34, blue: 56 });

        expect(color.to("light")).toBe(color);
    });

    test("toRgba / toHex の light 指定は既定値と一致する", () => {
        const color = new ColorValue({ red: 12, green: 34, blue: 56 });

        expect(color.toRgba("light")).toBe(color.toRgba());
        expect(color.toRgba("light", 0.95)).toBe(color.toRgba(undefined, 0.95));
        expect(color.toHex("light")).toBe(color.toHex());
    });
});

describe("ColorValue to dark", () => {
    test("黒は明るい灰になる", () => {
        const converted = ColorValue.BLACK.to("dark");

        expect(converted.toHex()).toBe("#E6E6E6");
    });

    test("白は暗い灰になる", () => {
        const converted = ColorValue.WHITE.to("dark");

        expect(converted.toHex()).toBe("#1A1A1A");
    });

    test("アルファは保持される", () => {
        expect(ColorValue.BLACK.toRgba("dark", 0.95)).toBe("rgba(230, 230, 230, 0.95)");
    });

    test.each(SAMPLE_COLORS)("色相が保たれ、明度が [0.1, 0.9] に収まる (%#)", (color) => {
        const converted = color.to("dark");
        const lightness = toLightness(converted);

        expect(lightness).toBeGreaterThanOrEqual(0.1 - 0.01);
        expect(lightness).toBeLessThanOrEqual(0.9 + 0.01);
        if ((toLightness(color) < 0.95) && (color.red !== color.green)) {
            expect(Math.abs(toHue(converted) - toHue(color))).toBeLessThan(3);
        }
    });

    test.each(SAMPLE_COLORS)("明度が写像式どおりに反転する (%#)", (color) => {
        const converted = color.to("dark");
        const expected = 0.1 + 0.8 * (1 - toLightness(color));

        expect(Math.abs(toLightness(converted) - expected)).toBeLessThan(0.01);
    });

    test("二重適用しても有効な RGB のまま", () => {
        const once = SAMPLE_COLORS[4].to("dark");
        const twice = once.to("dark");

        [twice.red, twice.green, twice.blue].forEach(channel => {
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(255);
            expect(Number.isInteger(channel)).toBe(true);
        });
    });

    test("入力の ColorValue を変更しない", () => {
        const color = new ColorValue({ red: 233, green: 30, blue: 99 });

        color.to("dark");

        expect(color.toHex()).toBe("#E91E63");
    });
});
