import ExportDdlSettingModel from '../ExportDdlSettingModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ExportDdlSettingModel', () => {
    describe('constructor', () => {
        test('should create with minimum required value (fileName only)', () => {
            const model = new ExportDdlSettingModel({ fileName: 'test.sql' });

            expect(model.fileName).toBe('test.sql');
            expect(model.withTable).toBe(true);
            expect(model.withIndex).toBe(true);
            expect(model.withForeignKey).toBe(true);
            expect(model.withComment).toBe(true);
            expect(model.withSchema).toBe(true);
            expect(model.commentStyle).toBe('logical_name');
            expect(model.commentSeparator).toBe(' : ');
        });

        test('should create with all values provided', () => {
            const model = new ExportDdlSettingModel({
                fileName: 'custom.sql',
                withTable: false,
                withIndex: false,
                withForeignKey: false,
                withComment: false,
                withSchema: false,
                commentStyle: 'with_description',
                commentSeparator: ' - '
            });

            expect(model.fileName).toBe('custom.sql');
            expect(model.withTable).toBe(false);
            expect(model.withIndex).toBe(false);
            expect(model.withForeignKey).toBe(false);
            expect(model.withComment).toBe(false);
            expect(model.withSchema).toBe(false);
            expect(model.commentStyle).toBe('with_description');
            expect(model.commentSeparator).toBe(' - ');
        });

        test('should create with partial values (some true, some false)', () => {
            const model = new ExportDdlSettingModel({
                fileName: 'partial.sql',
                withTable: true,
                withIndex: false,
                withForeignKey: true,
                withComment: false,
                withSchema: false
            });

            expect(model.fileName).toBe('partial.sql');
            expect(model.withTable).toBe(true);
            expect(model.withIndex).toBe(false);
            expect(model.withForeignKey).toBe(true);
            expect(model.withComment).toBe(false);
            expect(model.withSchema).toBe(false);
        });

        test('should create with withSchema explicitly set to true', () => {
            const model = new ExportDdlSettingModel({
                fileName: 'schema.sql',
                withSchema: true
            });

            expect(model.fileName).toBe('schema.sql');
            expect(model.withSchema).toBe(true);
        });

        test('should create with withSchema explicitly set to false', () => {
            const model = new ExportDdlSettingModel({
                fileName: 'no-schema.sql',
                withSchema: false
            });

            expect(model.fileName).toBe('no-schema.sql');
            expect(model.withSchema).toBe(false);
        });
    });

    describe('equals', () => {
        test('should return true for identical settings', () => {
            const setting1 = new ExportDdlSettingModel({
                fileName: 'test.sql',
                withTable: true,
                withIndex: false,
                withForeignKey: true,
                withComment: false,
                withSchema: true,
                commentStyle: 'logical_name',
                commentSeparator: ' : '
            });

            const setting2 = new ExportDdlSettingModel({
                fileName: 'test.sql',
                withTable: true,
                withIndex: false,
                withForeignKey: true,
                withComment: false,
                withSchema: true,
                commentStyle: 'logical_name',
                commentSeparator: ' : '
            });

            expect(setting1.equals(setting2)).toBe(true);
        });

        test('should return false for different commentStyle', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', commentStyle: 'logical_name' });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', commentStyle: 'with_description' });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different commentSeparator', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', commentSeparator: ' : ' });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', commentSeparator: ' - ' });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different fileName', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test1.sql' });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test2.sql' });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different withTable', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', withTable: true });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', withTable: false });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different withIndex', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', withIndex: true });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', withIndex: false });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different withForeignKey', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', withForeignKey: true });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', withForeignKey: false });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different withComment', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', withComment: true });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', withComment: false });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return false for different withSchema', () => {
            const setting1 = new ExportDdlSettingModel({ fileName: 'test.sql', withSchema: true });
            const setting2 = new ExportDdlSettingModel({ fileName: 'test.sql', withSchema: false });

            expect(setting1.equals(setting2)).toBe(false);
        });

        test('should return true when comparing with itself', () => {
            const setting = new ExportDdlSettingModel({ fileName: 'test.sql' });

            expect(setting.equals(setting)).toBe(true);
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const model = new ExportDdlSettingModel({
                fileName: 'test.sql',
                withTable: true,
                withIndex: false,
                withForeignKey: true,
                withComment: false
            });

            const json = model.toJSON();

            expect(json).toEqual({
                fileName: 'test.sql',
                withTable: true,
                withIndex: false,
                withForeignKey: true,
                withComment: false,
                withSchema: true,
                commentStyle: 'logical_name',
                commentSeparator: ' : '
            });
        });

        test('should convert to plain object with default values', () => {
            const model = new ExportDdlSettingModel({ fileName: 'test.sql' });

            const json = model.toJSON();

            expect(json).toEqual({
                fileName: 'test.sql',
                withTable: true,
                withIndex: true,
                withForeignKey: true,
                withComment: true,
                withSchema: true,
                commentStyle: 'logical_name',
                commentSeparator: ' : '
            });
        });

        test('should convert to plain object with custom commentStyle and commentSeparator', () => {
            const model = new ExportDdlSettingModel({
                fileName: 'test.sql',
                commentStyle: 'with_description',
                commentSeparator: ' - '
            });

            const json = model.toJSON();

            expect(json).toEqual({
                fileName: 'test.sql',
                withTable: true,
                withIndex: true,
                withForeignKey: true,
                withComment: true,
                withSchema: true,
                commentStyle: 'with_description',
                commentSeparator: ' - '
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object with all properties', () => {
            const obj = {
                fileName: 'test.sql',
                withTable: false,
                withIndex: true,
                withForeignKey: false,
                withComment: true,
                withSchema: false,
                commentStyle: 'with_description' as const,
                commentSeparator: ' - '
            };

            const model = ExportDdlSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.fileName).toBe('test.sql');
            expect(model.withTable).toBe(false);
            expect(model.withIndex).toBe(true);
            expect(model.withForeignKey).toBe(false);
            expect(model.withComment).toBe(true);
            expect(model.withSchema).toBe(false);
            expect(model.commentStyle).toBe('with_description');
            expect(model.commentSeparator).toBe(' - ');
        });

        test('should convert from plain object with default commentStyle and commentSeparator', () => {
            const obj = { fileName: 'test.sql' };

            const model = ExportDdlSettingModel.toObject(obj);

            expect(model.commentStyle).toBe('logical_name');
            expect(model.commentSeparator).toBe(' : ');
        });

        test('should convert from plain object with missing optional properties (defaults to true)', () => {
            const obj = {
                fileName: 'test.sql'
            };

            const model = ExportDdlSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.fileName).toBe('test.sql');
            expect(model.withTable).toBe(true);
            expect(model.withIndex).toBe(true);
            expect(model.withForeignKey).toBe(true);
            expect(model.withComment).toBe(true);
            expect(model.withSchema).toBe(true);
        });

        test('should convert from plain object with some missing properties', () => {
            const obj = {
                fileName: 'test.sql',
                withTable: false,
                withForeignKey: false
            };

            const model = ExportDdlSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.fileName).toBe('test.sql');
            expect(model.withTable).toBe(false);
            expect(model.withIndex).toBe(true); // default
            expect(model.withForeignKey).toBe(false);
            expect(model.withComment).toBe(true); // default
            expect(model.withSchema).toBe(true); // default
        });

        test('should convert from plain object with withSchema explicitly set to true', () => {
            const obj = {
                fileName: 'test.sql',
                withSchema: true
            };

            const model = ExportDdlSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.fileName).toBe('test.sql');
            expect(model.withSchema).toBe(true);
        });

        test('should convert from plain object with withSchema explicitly set to false', () => {
            const obj = {
                fileName: 'test.sql',
                withSchema: false
            };

            const model = ExportDdlSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(ExportDdlSettingModel);
            expect(model.fileName).toBe('test.sql');
            expect(model.withSchema).toBe(false);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = new ExportDdlSettingModel({
                fileName: 'test.sql',
                withTable: false,
                withIndex: true,
                withForeignKey: false,
                withComment: true,
                withSchema: false,
                commentStyle: 'with_description',
                commentSeparator: ' - '
            });

            const json = original.toJSON();
            const deserialized = ExportDdlSettingModel.toObject(json);

            expect(deserialized).toBeInstanceOf(ExportDdlSettingModel);
            expect(deserialized.fileName).toBe(original.fileName);
            expect(deserialized.withTable).toBe(original.withTable);
            expect(deserialized.withIndex).toBe(original.withIndex);
            expect(deserialized.withForeignKey).toBe(original.withForeignKey);
            expect(deserialized.withComment).toBe(original.withComment);
            expect(deserialized.withSchema).toBe(original.withSchema);
            expect(deserialized.commentStyle).toBe(original.commentStyle);
            expect(deserialized.commentSeparator).toBe(original.commentSeparator);
            expect(deserialized.equals(original)).toBe(true);
        });

        test('should serialize and deserialize withSchema=true correctly', () => {
            const original = new ExportDdlSettingModel({
                fileName: 'test.sql',
                withSchema: true
            });

            const json = original.toJSON();
            const deserialized = ExportDdlSettingModel.toObject(json);

            expect(deserialized.withSchema).toBe(true);
            expect(deserialized.equals(original)).toBe(true);
        });

        test('should handle round-trip serialization with different withSchema values', () => {
            const testCases = [
                { fileName: 'with-schema.sql', withSchema: true },
                { fileName: 'without-schema.sql', withSchema: false }
            ];

            testCases.forEach(testCase => {
                const original = new ExportDdlSettingModel(testCase);
                const json = original.toJSON();
                const deserialized = ExportDdlSettingModel.toObject(json);

                expect(deserialized.withSchema).toBe(testCase.withSchema);
                expect(deserialized.equals(original)).toBe(true);
            });
        });

        test('should throw error when fileName is missing', () => {
            const obj = {
                withTable: true,
                withIndex: true,
                withForeignKey: true,
                withComment: true
            };

            expect(() => ExportDdlSettingModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when object is empty', () => {
            expect(() => ExportDdlSettingModel.toObject({}))
                .toThrow(PropertyNotExistsError);
        });
    });
});