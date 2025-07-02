import RectangleViewModel from '../RectangleViewModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('RectangleViewModel', () => {
    describe('constructor', () => {
        test('should create with provided values', () => {
            const rect = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            expect(rect.positionX).toBe(100);
            expect(rect.positionY).toBe(200);
            expect(rect.width).toBe(300);
            expect(rect.height).toBe(150);
        });
    });

    describe('createFromPoints', () => {
        test('should create rectangle from two points (first smaller)', () => {
            const rect = RectangleViewModel.createFromPoints(
                { x: 10, y: 20 },
                { x: 110, y: 120 }
            );

            expect(rect.positionX).toBe(10);
            expect(rect.positionY).toBe(20);
            expect(rect.width).toBe(100);
            expect(rect.height).toBe(100);
        });

        test('should create rectangle from two points (second smaller)', () => {
            const rect = RectangleViewModel.createFromPoints(
                { x: 110, y: 120 },
                { x: 10, y: 20 }
            );

            expect(rect.positionX).toBe(10);
            expect(rect.positionY).toBe(20);
            expect(rect.width).toBe(100);
            expect(rect.height).toBe(100);
        });

        test('should enforce minimum width and height of 2', () => {
            const rect = RectangleViewModel.createFromPoints(
                { x: 50, y: 50 },
                { x: 51, y: 51 }
            );

            expect(rect.width).toBe(2);
            expect(rect.height).toBe(2);
        });

        test('should handle identical points', () => {
            const rect = RectangleViewModel.createFromPoints(
                { x: 50, y: 50 },
                { x: 50, y: 50 }
            );

            expect(rect.positionX).toBe(50);
            expect(rect.positionY).toBe(50);
            expect(rect.width).toBe(2);
            expect(rect.height).toBe(2);
        });
    });

    describe('createFromEdges', () => {
        test('should create rectangle from edge coordinates', () => {
            const rect = RectangleViewModel.createFromEdges({
                left: 10,
                top: 20,
                right: 110,
                bottom: 120
            });

            expect(rect.positionX).toBe(10);
            expect(rect.positionY).toBe(20);
            expect(rect.width).toBe(100);
            expect(rect.height).toBe(100);
        });
    });

    describe('move', () => {
        test('should move rectangle by specified offset', () => {
            const rect = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const movedRect = rect.move({ x: 50, y: -25 });

            expect(movedRect.positionX).toBe(150);
            expect(movedRect.positionY).toBe(175);
            expect(movedRect.width).toBe(300);
            expect(movedRect.height).toBe(150);
        });

        test('should return new instance', () => {
            const rect = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const movedRect = rect.move({ x: 0, y: 0 });

            expect(movedRect).not.toBe(rect);
            expect(movedRect.equals(rect)).toBe(true);
        });
    });

    describe('computed properties', () => {
        const rect = new RectangleViewModel({
            positionX: 100,
            positionY: 200,
            width: 300,
            height: 150
        });

        test('should calculate left edge', () => {
            expect(rect.left).toBe(100);
        });

        test('should calculate right edge', () => {
            expect(rect.right).toBe(400);
        });

        test('should calculate xCenter', () => {
            expect(rect.xCenter).toBe(250);
        });

        test('should calculate top edge', () => {
            expect(rect.top).toBe(200);
        });

        test('should calculate bottom edge', () => {
            expect(rect.bottom).toBe(350);
        });

        test('should calculate yCenter', () => {
            expect(rect.yCenter).toBe(275);
        });

        test('should calculate center point', () => {
            expect(rect.center).toEqual({ x: 250, y: 275 });
        });
    });

    describe('contains', () => {
        const rect = new RectangleViewModel({
            positionX: 100,
            positionY: 200,
            width: 300,
            height: 150
        });

        describe('point containment', () => {
            test('should contain point inside rectangle', () => {
                expect(rect.contains({ x: 250, y: 275 })).toBe(true);
                expect(rect.contains({ x: 100, y: 200 })).toBe(true); // corner
                expect(rect.contains({ x: 400, y: 350 })).toBe(true); // corner
            });

            test('should not contain point outside rectangle', () => {
                expect(rect.contains({ x: 50, y: 275 })).toBe(false); // left
                expect(rect.contains({ x: 450, y: 275 })).toBe(false); // right
                expect(rect.contains({ x: 250, y: 150 })).toBe(false); // above
                expect(rect.contains({ x: 250, y: 400 })).toBe(false); // below
            });
        });

        describe('rectangle containment', () => {
            test('should contain smaller rectangle inside', () => {
                const innerRect = new RectangleViewModel({
                    positionX: 150,
                    positionY: 225,
                    width: 200,
                    height: 100
                });

                expect(rect.contains(innerRect)).toBe(true);
            });

            test('should contain rectangle with same dimensions', () => {
                const sameRect = new RectangleViewModel({
                    positionX: 100,
                    positionY: 200,
                    width: 300,
                    height: 150
                });

                expect(rect.contains(sameRect)).toBe(true);
            });

            test('should not contain overlapping rectangle', () => {
                const overlappingRect = new RectangleViewModel({
                    positionX: 50,
                    positionY: 150,
                    width: 200,
                    height: 200
                });

                expect(rect.contains(overlappingRect)).toBe(false);
            });

            test('should not contain rectangle extending outside', () => {
                const extendingRect = new RectangleViewModel({
                    positionX: 150,
                    positionY: 225,
                    width: 300,
                    height: 100
                });

                expect(rect.contains(extendingRect)).toBe(false);
            });
        });
    });

    describe('equals', () => {
        test('should return true for identical rectangles', () => {
            const rect1 = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const rect2 = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            expect(rect1.equals(rect2)).toBe(true);
        });

        test('should return false for different positions', () => {
            const rect1 = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const rect2 = new RectangleViewModel({
                positionX: 101,
                positionY: 200,
                width: 300,
                height: 150
            });

            expect(rect1.equals(rect2)).toBe(false);
        });

        test('should return false for different dimensions', () => {
            const rect1 = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const rect2 = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 301,
                height: 150
            });

            expect(rect1.equals(rect2)).toBe(false);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const rect = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const json = rect.toJSON();

            expect(json).toEqual({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const obj = {
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            };

            const rect = RectangleViewModel.toObject(obj);

            expect(rect).toBeInstanceOf(RectangleViewModel);
            expect(rect.positionX).toBe(100);
            expect(rect.positionY).toBe(200);
            expect(rect.width).toBe(300);
            expect(rect.height).toBe(150);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const json = original.toJSON();
            const deserialized = RectangleViewModel.toObject(json);

            expect(deserialized).toBeInstanceOf(RectangleViewModel);
            expect(deserialized.equals(original)).toBe(true);
        });

        test('should throw error when positionX is missing', () => {
            const obj = {
                positionY: 200,
                width: 300,
                height: 150
            };

            expect(() => RectangleViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when positionY is missing', () => {
            const obj = {
                positionX: 100,
                width: 300,
                height: 150
            };

            expect(() => RectangleViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when width is missing', () => {
            const obj = {
                positionX: 100,
                positionY: 200,
                height: 150
            };

            expect(() => RectangleViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when height is missing', () => {
            const obj = {
                positionX: 100,
                positionY: 200,
                width: 300
            };

            expect(() => RectangleViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});