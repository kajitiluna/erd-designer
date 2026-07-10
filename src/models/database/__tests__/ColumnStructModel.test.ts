import ColumnStructModel from '../ColumnStructModel';
import { ColumnEntry } from '../TableModel';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ColumnStructModel', () => {
    describe('constructor', () => {
        test('should create with default values when no options provided', () => {
            const model = new ColumnStructModel({});

            expect(model.columnStructId).toBeTruthy(); // UUID should be generated
            expect(model.physicalName).toBe('');
            expect(model.logicalName).toBe('');
            expect(model.description).toBe('');
            expect(model.isArray).toBe(false);
            expect(model.notNull).toBe(false);
            expect(model.columnEntries).toEqual([]);
        });

        test('should create with provided columnStructId', () => {
            const id = 'test-struct-id';
            const model = new ColumnStructModel({ columnStructId: id });

            expect(model.columnStructId).toBe(id);
        });

        test('should generate new UUID when columnStructId is empty string', () => {
            const model = new ColumnStructModel({ columnStructId: '' });

            expect(model.columnStructId).toBeTruthy();
            expect(model.columnStructId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });

        test('should trim physicalName and logicalName', () => {
            const model = new ColumnStructModel({
                physicalName: '  struct_col  ',
                logicalName: '  Struct Column  '
            });

            expect(model.physicalName).toBe('struct_col');
            expect(model.logicalName).toBe('Struct Column');
        });

        test('should trim description', () => {
            const model = new ColumnStructModel({ description: '  a description  ' });

            expect(model.description).toBe('a description');
        });

        test('should create with provided values', () => {
            const columns: ColumnEntry[] = [
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' },
                { modelType: 'struct', columnStructId: 'nested-struct' }
            ];

            const model = new ColumnStructModel({
                columnStructId: 'struct-id',
                physicalName: 'address',
                logicalName: 'Address',
                description: 'Address struct',
                isArray: true,
                notNull: true,
                columnEntries: columns
            });

            expect(model.columnStructId).toBe('struct-id');
            expect(model.physicalName).toBe('address');
            expect(model.logicalName).toBe('Address');
            expect(model.description).toBe('Address struct');
            expect(model.isArray).toBe(true);
            expect(model.notNull).toBe(true);
            expect(model.columnEntries).toEqual(columns);
        });
    });

    describe('displayTypeQuery', () => {
        test('should return "STRUCT" when isArray is false', () => {
            const model = new ColumnStructModel({ isArray: false });

            expect(model.displayTypeQuery()).toBe('STRUCT');
        });

        test('should return "ARRAY<STRUCT>" when isArray is true', () => {
            const model = new ColumnStructModel({ isArray: true });

            expect(model.displayTypeQuery()).toBe('ARRAY<STRUCT>');
        });
    });

    describe('toJSON', () => {
        test('should serialize model with mixed columns (single/group/struct prefixes)', () => {
            const model = new ColumnStructModel({
                columnStructId: 'struct-id',
                physicalName: 'address',
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' },
                    { modelType: 'struct', columnStructId: 'nested-struct' }
                ]
            });

            const json = model.toJSON();

            expect(json).toEqual({
                columnStructId: 'struct-id',
                physicalName: 'address',
                columnModelIds: ['col1', 'group:group1', 'struct:nested-struct']
            });
        });

        test('should omit logicalName when empty', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p' });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('logicalName');
        });

        test('should include logicalName when set', () => {
            const model = new ColumnStructModel({
                columnStructId: 'id', physicalName: 'p', logicalName: 'Logical'
            });

            const json = model.toJSON();

            expect(json.logicalName).toBe('Logical');
        });

        test('should omit description when empty', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p' });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('description');
        });

        test('should include description when set', () => {
            const model = new ColumnStructModel({
                columnStructId: 'id', physicalName: 'p', description: 'desc'
            });

            const json = model.toJSON();

            expect(json.description).toBe('desc');
        });

        test('should omit isArray when false', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p', isArray: false });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('isArray');
        });

        test('should include isArray when true', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p', isArray: true });

            const json = model.toJSON();

            expect(json.isArray).toBe(true);
        });

        test('should omit notNull when false', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p', notNull: false });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('notNull');
        });

        test('should include notNull when true', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p', notNull: true });

            const json = model.toJSON();

            expect(json.notNull).toBe(true);
        });

        test('should always include columnModelIds even when empty', () => {
            const model = new ColumnStructModel({ columnStructId: 'id', physicalName: 'p', columnEntries: [] });

            const json = model.toJSON();

            expect(json.columnModelIds).toEqual([]);
        });
    });

    describe('toObject', () => {
        test('should deserialize from plain object with mixed columns', () => {
            const obj = {
                columnStructId: 'struct-id',
                physicalName: 'address',
                logicalName: 'Address',
                description: 'desc',
                isArray: true,
                notNull: true,
                columnModelIds: ['col1', 'group:group1', 'struct:nested-struct']
            };

            const model = ColumnStructModel.toObject(obj);

            expect(model).toBeInstanceOf(ColumnStructModel);
            expect(model.columnStructId).toBe('struct-id');
            expect(model.physicalName).toBe('address');
            expect(model.logicalName).toBe('Address');
            expect(model.description).toBe('desc');
            expect(model.isArray).toBe(true);
            expect(model.notNull).toBe(true);
            expect(model.columnEntries).toEqual([
                { modelType: 'single', columnModelId: 'col1' },
                { modelType: 'group', columnGroupId: 'group1' },
                { modelType: 'struct', columnStructId: 'nested-struct' }
            ]);
        });

        test('should handle missing optional properties', () => {
            const obj = {
                columnStructId: 'struct-id',
                physicalName: 'address',
                columnModelIds: []
            };

            const model = ColumnStructModel.toObject(obj);

            expect(model.logicalName).toBe('');
            expect(model.description).toBe('');
            expect(model.isArray).toBe(false);
            expect(model.notNull).toBe(false);
            expect(model.columnEntries).toEqual([]);
        });

        test('should throw error when columnStructId is missing', () => {
            const obj = { physicalName: 'address', columnModelIds: [] };

            expect(() => ColumnStructModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should throw error when physicalName is missing', () => {
            const obj = { columnStructId: 'id', columnModelIds: [] };

            expect(() => ColumnStructModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should throw error when columnModelIds is missing', () => {
            const obj = { columnStructId: 'id', physicalName: 'address' };

            expect(() => ColumnStructModel.toObject(obj)).toThrow(PropertyNotExistsError);
        });

        test('should serialize to JSON and deserialize back correctly (roundtrip)', () => {
            const original = new ColumnStructModel({
                columnStructId: 'struct-id',
                physicalName: 'address',
                logicalName: 'Address',
                description: 'desc',
                isArray: true,
                notNull: true,
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'group', columnGroupId: 'group1' },
                    { modelType: 'struct', columnStructId: 'nested-struct' }
                ]
            });

            const json = original.toJSON();
            const deserialized = ColumnStructModel.toObject(json);

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
                columnStructId: 'id', physicalName: 'p', logicalName: 'L',
                description: 'd', isArray: true, notNull: true, columns: baseColumns
            };
            const model1 = new ColumnStructModel(data);
            const model2 = new ColumnStructModel(data);

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false for different columnStructId', () => {
            const model1 = new ColumnStructModel({ columnStructId: 'id1' });
            const model2 = new ColumnStructModel({ columnStructId: 'id2' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different physicalName', () => {
            const model1 = new ColumnStructModel({ physicalName: 'a' });
            const model2 = new ColumnStructModel({ physicalName: 'b' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different logicalName', () => {
            const model1 = new ColumnStructModel({ logicalName: 'a' });
            const model2 = new ColumnStructModel({ logicalName: 'b' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different description', () => {
            const model1 = new ColumnStructModel({ description: 'a' });
            const model2 = new ColumnStructModel({ description: 'b' });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different isArray', () => {
            const model1 = new ColumnStructModel({ isArray: true });
            const model2 = new ColumnStructModel({ isArray: false });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different notNull', () => {
            const model1 = new ColumnStructModel({ notNull: true });
            const model2 = new ColumnStructModel({ notNull: false });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different number of columns', () => {
            const model1 = new ColumnStructModel({
                columnEntries: [{ modelType: 'single', columnModelId: 'col1' }]
            });
            const model2 = new ColumnStructModel({
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column order (order matters)', () => {
            const model1 = new ColumnStructModel({
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col1' },
                    { modelType: 'single', columnModelId: 'col2' }
                ]
            });
            const model2 = new ColumnStructModel({
                columnEntries: [
                    { modelType: 'single', columnModelId: 'col2' },
                    { modelType: 'single', columnModelId: 'col1' }
                ]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different column model types at same position', () => {
            const model1 = new ColumnStructModel({
                columnEntries: [{ modelType: 'single', columnModelId: 'col1' }]
            });
            const model2 = new ColumnStructModel({
                columnEntries: [{ modelType: 'group', columnGroupId: 'col1' }]
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different struct references', () => {
            const model1 = new ColumnStructModel({
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct1' }]
            });
            const model2 = new ColumnStructModel({
                columnEntries: [{ modelType: 'struct', columnStructId: 'struct2' }]
            });

            expect(model1.equals(model2)).toBe(false);
        });
    });
});
