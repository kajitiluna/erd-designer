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

            expect(color.toHex()).toBe('rgba(255, 128, 64, 1)');
        });

        test('should convert to rgba format with custom alpha', () => {
            const color = new ColorValue({ red: 255, green: 128, blue: 64 });

            expect(color.toHex(0.5)).toBe('rgba(255, 128, 64, 0.5)');
            expect(color.toHex(0)).toBe('rgba(255, 128, 64, 0)');
            expect(color.toHex(0.75)).toBe('rgba(255, 128, 64, 0.75)');
        });

        test('should handle edge case RGB values', () => {
            const black = new ColorValue({ red: 0, green: 0, blue: 0 });
            const white = new ColorValue({ red: 255, green: 255, blue: 255 });

            expect(black.toHex()).toBe('rgba(0, 0, 0, 1)');
            expect(white.toHex()).toBe('rgba(255, 255, 255, 1)');
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