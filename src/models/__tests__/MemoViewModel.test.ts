import MemoViewModel, { AlignType } from '../MemoViewModel';
import ColorValue from '~/models/ColorValue';
import RectangleViewModel from '~/models/RectangleViewModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('MemoViewModel', () => {
    const testRectangle = new RectangleViewModel({
        positionX: 100,
        positionY: 200,
        width: 300,
        height: 150
    });

    const testColors = {
        background: new ColorValue({ red: 255, green: 255, blue: 255 }),
        foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
    };

    describe('create static method', () => {
        test('should create with default values', () => {
            const memo = MemoViewModel.create(testRectangle, testColors);

            expect(memo.memoId).toBeTruthy(); // UUID generated
            expect(memo.memo).toBe('');
            expect(memo.rectangleViewModel).toBe(testRectangle);
            expect(memo.backgroundColor).toBe(testColors.background);
            expect(memo.foregroundColor).toBe(testColors.foreground);
            expect(memo.verticalAlign).toBe('center');
            expect(memo.horizontalAlign).toBe('center');
            expect(memo.fontSize).toBe(9);
            expect(memo.createdAt).toBeInstanceOf(Date);
        });

        test('should create with custom font size', () => {
            const memo = MemoViewModel.create(testRectangle, testColors, 12);

            expect(memo.fontSize).toBe(12);
        });

        test('should generate unique memoId for each instance', () => {
            const memo1 = MemoViewModel.create(testRectangle, testColors);
            const memo2 = MemoViewModel.create(testRectangle, testColors);

            expect(memo1.memoId).not.toBe(memo2.memoId);
        });
    });

    describe('updateMemo', () => {
        test('should update memo text when different', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateMemo('New memo text');

            expect(updated.memo).toBe('New memo text');
            expect(updated).not.toBe(original);
            expect(updated.memoId).toBe(original.memoId);
        });

        test('should return same instance when memo is unchanged', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateMemo('');

            expect(updated).toBe(original);
        });
    });

    describe('updateRectangle', () => {
        test('should update rectangle when different', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const newRectangle = new RectangleViewModel({
                positionX: 200,
                positionY: 300,
                width: 400,
                height: 200
            });

            const updated = original.updateRectangle(newRectangle);

            expect(updated.rectangleViewModel).toBe(newRectangle);
            expect(updated).not.toBe(original);
        });

        test('should return same instance when rectangle is unchanged', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const sameRectangle = new RectangleViewModel({
                positionX: 100,
                positionY: 200,
                width: 300,
                height: 150
            });

            const updated = original.updateRectangle(sameRectangle);

            expect(updated).toBe(original);
        });
    });

    describe('updateColor', () => {
        test('should update background color only', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const newBackground = new ColorValue({ red: 255, green: 0, blue: 0 });

            const updated = original.updateColor(newBackground);

            expect(updated.backgroundColor).toBe(newBackground);
            expect(updated.foregroundColor).toBe(testColors.foreground);
            expect(updated).not.toBe(original);
        });

        test('should update foreground color only', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const newForeground = new ColorValue({ red: 0, green: 255, blue: 0 });

            const updated = original.updateColor(null, newForeground);

            expect(updated.backgroundColor).toBe(testColors.background);
            expect(updated.foregroundColor).toBe(newForeground);
            expect(updated).not.toBe(original);
        });

        test('should update both colors', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const newBackground = new ColorValue({ red: 255, green: 0, blue: 0 });
            const newForeground = new ColorValue({ red: 0, green: 255, blue: 0 });

            const updated = original.updateColor(newBackground, newForeground);

            expect(updated.backgroundColor).toBe(newBackground);
            expect(updated.foregroundColor).toBe(newForeground);
            expect(updated).not.toBe(original);
        });

        test('should return same instance when colors are unchanged', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const sameBackground = new ColorValue({ red: 255, green: 255, blue: 255 });
            const sameForeground = new ColorValue({ red: 0, green: 0, blue: 0 });

            const updated = original.updateColor(sameBackground, sameForeground);

            expect(updated).toBe(original);
        });
    });

    describe('updateVerticalAlign', () => {
        test('should update vertical alignment when different', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateVerticalAlign('start');

            expect(updated.verticalAlign).toBe('start');
            expect(updated).not.toBe(original);
        });

        test('should return same instance when alignment is unchanged', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateVerticalAlign('center');

            expect(updated).toBe(original);
        });
    });

    describe('updateHorizontalAlign', () => {
        test('should update horizontal alignment when different', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateHorizontalAlign('end');

            expect(updated.horizontalAlign).toBe('end');
            expect(updated).not.toBe(original);
        });

        test('should return same instance when alignment is unchanged', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateHorizontalAlign('center');

            expect(updated).toBe(original);
        });
    });

    describe('updateFontSize', () => {
        test('should update font size when different and valid', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateFontSize(14);

            expect(updated.fontSize).toBe(14);
            expect(updated).not.toBe(original);
        });

        test('should return same instance when font size is unchanged', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated = original.updateFontSize(9);

            expect(updated).toBe(original);
        });

        test('should return same instance when font size is invalid', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updated1 = original.updateFontSize(0);
            const updated2 = original.updateFontSize(-1);

            expect(updated1).toBe(original);
            expect(updated2).toBe(original);
        });

        test('should enforce minimum font size of 1 in constructor', () => {
            const memo = MemoViewModel.create(testRectangle, testColors, 0);

            expect(memo.fontSize).toBe(1);
        });
    });

    describe('move', () => {
        test('should move memo by moving its rectangle', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const moved = original.move({ x: 50, y: -25 });

            expect(moved.rectangleViewModel.positionX).toBe(150);
            expect(moved.rectangleViewModel.positionY).toBe(175);
            expect(moved).not.toBe(original);
        });
    });

    describe('equals', () => {
        test('should return true for memos with identical properties', () => {
            const date = new Date();
            const memo1 = MemoViewModel.create(testRectangle, testColors);
            // Create memo2 with same properties by using toObject/toJSON
            const json = memo1.toJSON();
            const memo2 = MemoViewModel.toObject(json);

            expect(memo1.equals(memo2)).toBe(true);
        });

        test('should return false for different memoIds', () => {
            const memo1 = MemoViewModel.create(testRectangle, testColors);
            const memo2 = MemoViewModel.create(testRectangle, testColors);

            expect(memo1.equals(memo2)).toBe(false);
        });

        test('should return false for different memos', () => {
            const memo1 = MemoViewModel.create(testRectangle, testColors);
            const memo2 = memo1.updateMemo('Different text');

            expect(memo1.equals(memo2)).toBe(false);
        });

        test('should return false for different rectangles', () => {
            const memo1 = MemoViewModel.create(testRectangle, testColors);
            const newRectangle = new RectangleViewModel({
                positionX: 200,
                positionY: 300,
                width: 400,
                height: 200
            });
            const memo2 = memo1.updateRectangle(newRectangle);

            expect(memo1.equals(memo2)).toBe(false);
        });

        test('should return false for different colors', () => {
            const memo1 = MemoViewModel.create(testRectangle, testColors);
            const memo2 = memo1.updateColor(new ColorValue({ red: 255, green: 0, blue: 0 }));

            expect(memo1.equals(memo2)).toBe(false);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const memo = MemoViewModel.create(testRectangle, testColors);
            const json = memo.toJSON();

            expect(json).toEqual({
                memoId: memo.memoId,
                memo: memo.memo,
                rectangleViewModel: testRectangle.toJSON(),
                backgroundColor: testColors.background.toJSON(),
                foregroundColor: testColors.foreground.toJSON(),
                verticalAlign: 'center',
                horizontalAlign: 'center',
                fontSize: 9,
                createdAt: memo.createdAt
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const obj = {
                memoId: 'test-memo-id',
                memo: 'Test memo',
                rectangleViewModel: {
                    positionX: 100,
                    positionY: 200,
                    width: 300,
                    height: 150
                },
                backgroundColor: { red: 255, green: 255, blue: 255 },
                foregroundColor: { red: 0, green: 0, blue: 0 },
                verticalAlign: 'start' as AlignType,
                horizontalAlign: 'end' as AlignType,
                fontSize: 12,
                createdAt: new Date('2023-01-01T00:00:00.000Z')
            };

            const memo = MemoViewModel.toObject(obj);

            expect(memo).toBeInstanceOf(MemoViewModel);
            expect(memo.memoId).toBe('test-memo-id');
            expect(memo.memo).toBe('Test memo');
            expect(memo.rectangleViewModel).toBeInstanceOf(RectangleViewModel);
            expect(memo.backgroundColor).toBeInstanceOf(ColorValue);
            expect(memo.foregroundColor).toBeInstanceOf(ColorValue);
            expect(memo.verticalAlign).toBe('start');
            expect(memo.horizontalAlign).toBe('end');
            expect(memo.fontSize).toBe(12);
        });

        test('should convert from plain object with defaults', () => {
            const obj = {
                memoId: 'test-memo-id',
                memo: 'Test memo',
                rectangleViewModel: {
                    positionX: 100,
                    positionY: 200,
                    width: 300,
                    height: 150
                }
            };

            const memo = MemoViewModel.toObject(obj);

            expect(memo).toBeInstanceOf(MemoViewModel);
            expect(memo.backgroundColor).toEqual(ColorValue.WHITE);
            expect(memo.foregroundColor).toEqual(ColorValue.BLACK);
            expect(memo.verticalAlign).toBe('center');
            expect(memo.horizontalAlign).toBe('center');
            expect(memo.fontSize).toBe(9);
            expect(memo.createdAt).toBeInstanceOf(Date);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = MemoViewModel.create(testRectangle, testColors);
            const updatedMemo = original
                .updateMemo('Test memo')
                .updateVerticalAlign('start')
                .updateHorizontalAlign('end')
                .updateFontSize(12);

            const json = updatedMemo.toJSON();
            const deserialized = MemoViewModel.toObject(json);

            expect(deserialized).toBeInstanceOf(MemoViewModel);
            expect(deserialized.equals(updatedMemo)).toBe(true);
        });

        test('should throw error when memoId is missing', () => {
            const obj = {
                memo: 'Test memo',
                rectangleViewModel: testRectangle.toJSON()
            };

            expect(() => MemoViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when memo is missing', () => {
            const obj = {
                memoId: 'test-memo-id',
                rectangleViewModel: testRectangle.toJSON()
            };

            expect(() => MemoViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when rectangleViewModel is missing', () => {
            const obj = {
                memoId: 'test-memo-id',
                memo: 'Test memo'
            };

            expect(() => MemoViewModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});