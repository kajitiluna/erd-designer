import StructColumnShareModel from '../StructColumnShareModel';
import ColumnEntry from '../ColumnEntry';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('StructColumnShareModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const model = new StructColumnShareModel({});

            expect(model.structShareModelId).toBeTruthy(); // UUID should be generated
            expect(model.physicalName).toBe('');
            expect(model.logicalName).toBe('');
            expect(model.description).toBe('');
            expect(model.isArray).toBe(false);
            expect(model.columnEntries).toEqual([]);
        });

        test('should create with provided structColumnShareModelId', () => {
            const id = 'test-struct-id';
            const model = new StructColumnShareModel({ structShareModelId: id });

            expect(model.structShareModelId).toBe(id);
        });

        test('should generate new UUID when structColumnShareModelId is empty string', () => {
            const model = new StructColumnShareModel({ structShareModelId: '' });

            expect(model.structShareModelId).toBeTruthy();
            expect(model.structShareModelId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });

        test('should trim physicalName and logicalName', () => {
            const model = new StructColumnShareModel({
                physicalName: '  struct_col  ',
                logicalName: '  Struct Column  '
            });

            expect(model.physicalName).toBe('struct_col');
            expect(model.logicalName).toBe('Struct Column');
        });

        test('should trim description', () => {
            const model = new StructColumnShareModel({ description: '  a description  ' });

            expect(model.description).toBe('a description');
        });

        test('should create with provided values', () => {
            const columns: ColumnEntry[] = [
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' },
                { modelType: 'single', columnModelId: 'nested-struct-wrapper' }
            ];

            const model = new StructColumnShareModel({
                structShareModelId: 'struct-id',
                physicalName: 'address',
                logicalName: 'Address',
                description: 'Address struct',
                isArray: true,
                columnEntries: columns
            });

            expect(model.structShareModelId).toBe('struct-id');
            expect(model.physicalName).toBe('address');
            expect(model.logicalName).toBe('Address');
            expect(model.description).toBe('Address struct');
            expect(model.isArray).toBe(true);
            expect(model.columnEntries).toEqual(columns);
        });
    });

    describe('displayTypeQuery', () => {
        test('should return "STRUCT" when isArray is false', () => {
            const model = new StructColumnShareModel({ isArray: false });

            expect(model.simpleColumnType()).toBe('STRUCT');
        });

        test('should return "ARRAY<STRUCT>" when isArray is true', () => {
            const model = new StructColumnShareModel({ isArray: true });

            expect(model.simpleColumnType()).toBe('ARRAY<STRUCT>');
        });
    });

    describe('toJSON', () => {
        test('should serialize model with mixed columns (single/group, nested struct as single wrapper)', () => {
            const model = new StructColumnShareModel({
                structShareModelId: 'struct-id',
                physicalName: 'address',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' },
                    { modelType: 'single', columnModelId: 'nested-struct-wrapper' }
                ]
            });

            const json = model.toJSON();

            expect(json).toEqual({
                structShareModelId: 'struct-id',
                physicalName: 'address',
                columnModelIds: ['col1', 'group:group1', 'nested-struct-wrapper']
            });
        });

        test('should omit logicalName when empty', () => {
            const model = new StructColumnShareModel({ structShareModelId: 'id', physicalName: 'p' });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('logicalName');
        });

        test('should include logicalName when set', () => {
            const model = new StructColumnShareModel({
                structShareModelId: 'id', physicalName: 'p', logicalName: 'Logical'
            });

            const json = model.toJSON();

            expect(json.logicalName).toBe('Logical');
        });

        test('should omit description when empty', () => {
            const model = new StructColumnShareModel({ structShareModelId: 'id', physicalName: 'p' });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('description');
        });

        test('should include description when set', () => {
            const model = new StructColumnShareModel({
                structShareModelId: 'id', physicalName: 'p', description: 'desc'
            });

            const json = model.toJSON();

            expect(json.description).toBe('desc');
        });

        test('should omit isArray when false', () => {
            const model = new StructColumnShareModel({ structShareModelId: 'id', physicalName: 'p', isArray: false });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('isArray');
        });

        test('should include isArray when true', () => {
            const model = new StructColumnShareModel({ structShareModelId: 'id', physicalName: 'p', isArray: true });

            const json = model.toJSON();

            expect(json.isArray).toBe(true);
        });

        test('should always include columnModelIds even when empty', () => {
            const model = new StructColumnShareModel({ structShareModelId: 'id', physicalName: 'p', columnEntries: [] });

            const json = model.toJSON();

            expect(json.columnModelIds).toEqual([]);
        });
    });

    describe('toObject', () => {
        test('should deserialize from plain object with mixed columns', () => {
            const obj = {
                structShareModelId: 'struct-id',
                physicalName: 'address',
                logicalName: 'Address',
                description: 'desc',
                isArray: true,
                columnModelIds: ['col1', 'group:group1', 'nested-struct-wrapper']
            };

            const model = StructColumnShareModel.toObject(obj);

            expect(model).toBeInstanceOf(StructColumnShareModel);
            expect(model.structShareModelId).toBe('struct-id');
            expect(model.physicalName).toBe('address');
            expect(model.logicalName).toBe('Address');
            expect(model.description).toBe('desc');
            expect(model.isArray).toBe(true);
            expect(model.columnEntries).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' },
                { modelType: 'single', columnModelId: 'nested-struct-wrapper' }
            ]);
        });

        test('should handle missing optional properties', () => {
            const obj = {
                structShareModelId: 'struct-id',
                physicalName: 'address',
                columnModelIds: []
            };

            const model = StructColumnShareModel.toObject(obj);

            expect(model.logicalName).toBe('');
            expect(model.description).toBe('');
            expect(model.isArray).toBe(false);
            expect(model.columnEntries).toEqual([]);
        });

        test('should throw error when structColumnShareModelId is missing', () => {
            const obj = { physicalName: 'address', columnModelIds: [] };

            expect(() => StructColumnShareModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should throw error when physicalName is missing', () => {
            const obj = { structColumnShareModelId: 'id', columnModelIds: [] };

            expect(() => StructColumnShareModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should throw error when columnModelIds is missing', () => {
            const obj = { structColumnShareModelId: 'id', physicalName: 'address' };

            expect(() => StructColumnShareModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should serialize to JSON and deserialize back correctly (roundtrip)', () => {
            const original = new StructColumnShareModel({
                structShareModelId: 'struct-id',
                physicalName: 'address',
                logicalName: 'Address',
                description: 'desc',
                isArray: true,
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' },
                    { modelType: 'single', columnModelId: 'nested-struct-wrapper' }
                ]
            });

            const json = original.toJSON();
            const deserialized = StructColumnShareModel.toObject(json);

            expect(original.equals(deserialized)).toBe(true);
        });
    });

    describe('equals', () => {
        const baseColumns: ColumnEntry[] = [
            { modelType: 'single', columnModelId: 'col1' },
            { modelType: 'group', columnGroupId: 'group1' }
        ];

        test('should return true for identical models', () => {
            const data = {
                structShareModelId: 'id', physicalName: 'p', logicalName: 'L',
                description: 'd', isArray: true, columnEntries: baseColumns
            };
            const model1 = new StructColumnShareModel(data);
            const model2 = new StructColumnShareModel(data);

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false for different structShareModelId', () => {
            const model1 = new StructColumnShareModel({ structShareModelId: 'id1' });
            const model2 = new StructColumnShareModel({ structShareModelId: 'id2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different physicalName', () => {
            const model1 = new StructColumnShareModel({ physicalName: 'a' });
            const model2 = new StructColumnShareModel({ physicalName: 'b' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different logicalName', () => {
            const model1 = new StructColumnShareModel({ logicalName: 'a' });
            const model2 = new StructColumnShareModel({ logicalName: 'b' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different description', () => {
            const model1 = new StructColumnShareModel({ description: 'a' });
            const model2 = new StructColumnShareModel({ description: 'b' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different isArray', () => {
            const model1 = new StructColumnShareModel({ isArray: true });
            const model2 = new StructColumnShareModel({ isArray: false });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of columns', () => {
            const model1 = new StructColumnShareModel({
                columnEntries: [{ modelType: 'single', columnModelId: 'col1' }]
            });
            const model2 = new StructColumnShareModel({
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column order (order matters)', () => {
            const model1 = new StructColumnShareModel({
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ]
            });
            const model2 = new StructColumnShareModel({
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col2' },
                    { modelType: 'single', columnModelId: 'col1' }
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column model types at same position', () => {
            const model1 = new StructColumnShareModel({
                columnEntries: [{ modelType: 'single', columnModelId: 'col1' }]
            });
            const model2 = new StructColumnShareModel({
                columnEntries: [{ modelType: 'group', columnGroupId: 'col1' }]
            });

            expect(model1.equals(model2)).toBe(false);
        });
    });
});
