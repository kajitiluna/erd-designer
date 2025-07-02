import LineViewModel from '../LineViewModel';
import ColorValue from '~/models/ColorValue';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('LineViewModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const line = new LineViewModel({});

            expect(line.strokeWidth).toBe(1);
            expect(line.edges).toEqual([]);
            expect(line.color).toBe(ColorValue.BLACK);
        });

        test('should create with provided values', () => {
            const edges = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            const color = new ColorValue({ red: 255, green: 0, blue: 0 });
            
            const line = new LineViewModel({
                strokeWidth: 3,
                edges: edges,
                color: color
            });

            expect(line.strokeWidth).toBe(3);
            expect(line.edges).toEqual(edges);
            expect(line.color).toBe(color);
        });

        test('should enforce minimum strokeWidth of 1', () => {
            const line1 = new LineViewModel({ strokeWidth: 0 });
            const line2 = new LineViewModel({ strokeWidth: -5 });

            expect(line1.strokeWidth).toBe(1);
            expect(line2.strokeWidth).toBe(1);
        });

        test('should create immutable copy of edges array', () => {
            const originalEdges = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            const line = new LineViewModel({ edges: originalEdges });

            originalEdges.push({ x: 200, y: 200 });

            expect(line.edges).toHaveLength(2); // Ensure immutability
            expect(line.edges).not.toBe(originalEdges); // Ensure deep copy
            expect(line.edges).toEqual([{ x: 0, y: 0 }, { x: 100, y: 100 }]); // Verify content
        });
    });

    describe('updateEdge', () => {
        test('should add virtual edge at specified position', () => {
            const line = new LineViewModel({
                edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
            });

            const updatedLine = line.updateEdge({
                edgeType: 'virtual',
                edgeId: 1,
                point: { x: 50, y: 50 }
            });

            expect(updatedLine.edges).toEqual([
                { x: 0, y: 0 },
                { x: 50, y: 50 },
                { x: 100, y: 100 }
            ]);
        });

        test('should update real edge at valid index', () => {
            const line = new LineViewModel({
                edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
            });

            const updatedLine = line.updateEdge({
                edgeType: 'real',
                edgeId: 1,
                point: { x: 150, y: 150 }
            });

            expect(updatedLine.edges).toEqual([
                { x: 0, y: 0 },
                { x: 150, y: 150 }
            ]);
        });

        test('should return same instance when real edge index is out of bounds', () => {
            const line = new LineViewModel({
                edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
            });

            const updatedLine1 = line.updateEdge({
                edgeType: 'real',
                edgeId: -1,
                point: { x: 50, y: 50 }
            });

            const updatedLine2 = line.updateEdge({
                edgeType: 'real',
                edgeId: 2,
                point: { x: 50, y: 50 }
            });

            expect(updatedLine1).toBe(line);
            expect(updatedLine2).toBe(line);
        });
    });

    describe('updateStrokeWidth', () => {
        test('should update stroke width when different', () => {
            const line = new LineViewModel({ strokeWidth: 1 });

            const updatedLine = line.updateStrokeWidth(3);

            expect(updatedLine.strokeWidth).toBe(3);
            expect(updatedLine).not.toBe(line);
        });

        test('should return same instance when width is unchanged', () => {
            const line = new LineViewModel({ strokeWidth: 2 });

            const updatedLine = line.updateStrokeWidth(2);

            expect(updatedLine).toBe(line);
        });

        test('should return same instance when width is invalid', () => {
            const line = new LineViewModel({ strokeWidth: 2 });

            const updatedLine1 = line.updateStrokeWidth(0);
            const updatedLine2 = line.updateStrokeWidth(-1);

            expect(updatedLine1).toBe(line);
            expect(updatedLine2).toBe(line);
        });
    });

    describe('updateColor', () => {
        test('should update color when different', () => {
            const line = new LineViewModel({ color: ColorValue.BLACK });
            const newColor = ColorValue.WHITE;

            const updatedLine = line.updateColor(newColor);

            expect(updatedLine.color).toBe(newColor);
            expect(updatedLine).not.toBe(line);
        });

        test('should return same instance when color is unchanged', () => {
            const color = new ColorValue({ red: 255, green: 0, blue: 0 });
            const sameColor = new ColorValue({ red: 255, green: 0, blue: 0 });
            const line = new LineViewModel({ color: color });

            const updatedLine = line.updateColor(sameColor);

            expect(updatedLine).toBe(line);
        });
    });

    describe('deleteEdge', () => {
        test('should delete edge at valid index', () => {
            const line = new LineViewModel({
                edges: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }]
            });

            const updatedLine = line.deleteEdge(1);

            expect(updatedLine.edges).toEqual([
                { x: 0, y: 0 },
                { x: 100, y: 100 }
            ]);
        });

        test('should return same instance when index is out of bounds', () => {
            const line = new LineViewModel({
                edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
            });

            const updatedLine1 = line.deleteEdge(-1);
            const updatedLine2 = line.deleteEdge(2);

            expect(updatedLine1).toBe(line);
            expect(updatedLine2).toBe(line);
        });
    });

    describe('equals', () => {
        test('should return true for identical lines', () => {
            const edges = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            const color = new ColorValue({ red: 255, green: 0, blue: 0 });
            
            const line1 = new LineViewModel({ strokeWidth: 2, edges: edges, color: color });
            const line2 = new LineViewModel({ strokeWidth: 2, edges: edges, color: color });

            expect(line1.equals(line2)).toBe(true);
        });

        test('should return true when comparing with itself', () => {
            const line = new LineViewModel({});

            expect(line.equals(line)).toBe(true);
        });

        test('should return false for different stroke widths', () => {
            const line1 = new LineViewModel({ strokeWidth: 1 });
            const line2 = new LineViewModel({ strokeWidth: 2 });

            expect(line1.equals(line2)).toBe(false);
        });

        test('should return false for different edge lengths', () => {
            const line1 = new LineViewModel({ edges: [{ x: 0, y: 0 }] });
            const line2 = new LineViewModel({ edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }] });

            expect(line1.equals(line2)).toBe(false);
        });

        test('should return false for different colors', () => {
            const line1 = new LineViewModel({ color: ColorValue.BLACK });
            const line2 = new LineViewModel({ color: ColorValue.WHITE });

            expect(line1.equals(line2)).toBe(false);
        });

        test('should return false for different edge coordinates', () => {
            const line1 = new LineViewModel({ edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }] });
            const line2 = new LineViewModel({ edges: [{ x: 0, y: 0 }, { x: 101, y: 100 }] });

            expect(line1.equals(line2)).toBe(false);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const edges = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            const color = new ColorValue({ red: 255, green: 0, blue: 0 });
            const line = new LineViewModel({ strokeWidth: 3, edges: edges, color: color });

            const json = line.toJSON();

            expect(json).toEqual({
                strokeWidth: 3,
                edges: edges,
                orthogonalLines: [],
                color: color.toJSON()
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const obj = {
                strokeWidth: 3,
                edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
                color: { red: 255, green: 0, blue: 0 }
            };

            const line = LineViewModel.toObject(obj);

            expect(line).toBeInstanceOf(LineViewModel);
            expect(line.strokeWidth).toBe(3);
            expect(line.edges).toEqual([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
            expect(line.color).toBeInstanceOf(ColorValue);
            expect(line.color.red).toBe(255);
        });

        test('should convert from plain object with defaults', () => {
            const obj = {
                strokeWidth: 2
            };

            const line = LineViewModel.toObject(obj);

            expect(line).toBeInstanceOf(LineViewModel);
            expect(line.strokeWidth).toBe(2);
            expect(line.edges).toEqual([]);
            expect(line.color).toBe(ColorValue.BLACK);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = new LineViewModel({
                strokeWidth: 3,
                edges: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
                color: new ColorValue({ red: 255, green: 0, blue: 0 })
            });

            const json = original.toJSON();
            const deserialized = LineViewModel.toObject(json);

            expect(deserialized).toBeInstanceOf(LineViewModel);
            expect(deserialized.equals(original)).toBe(true);
        });

        test('should throw error when strokeWidth is missing', () => {
            const obj = {
                edges: [{ x: 0, y: 0 }]
            };

            expect(() => LineViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});