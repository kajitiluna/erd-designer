import ColumnShareModel from '../ColumnShareModel';
import ColumnType from '../ColumnType';
import { Database } from '../DatabaseType';
import { PropertyNotExistsError } from '../../exceptions';

describe('ColumnShareModel', () => {
    // unsigned を定義できない (withUnsigned === false) の ColumnType
    const mockWithoutUnsigned = new ColumnType({
        id: 1,
        name: "TEST_TYPE",
        description: "Test type",
        baseQuery: "TEST",
        withPrecision: true,
        withScale: true
    });

    // unsigned を定義できる (withUnsigned === true) の ColumnType
    const mockWithUnsigned = new ColumnType({
        id: 1,
        name: "TEST_TYPE",
        description: "Test type",
        baseQuery: "TEST",
        withUnsigned: true,
        withPrecision: true,
        withScale: true
    });

    // 異なる id を持つ ColumnType (equals テスト用)
    const mockDifferentType = new ColumnType({
        id: 2,
        name: "OTHER_TYPE",
        description: "Other type",
        baseQuery: "OTHER"
    });

    // category: "text" の ColumnType (characterSet, collate テスト用)
    const mockTextType = new ColumnType({
        id: 3,
        name: "TEXT_TYPE",
        description: "Text type",
        baseQuery: "TEXT",
        category: "text"
    });

    // category: "text" かつ unsigned / precision / scale 対応の ColumnType
    const mockTextUnsignedType = new ColumnType({
        id: 4,
        name: "TEXT_UNSIGNED_TYPE",
        description: "Text unsigned type",
        baseQuery: "TEXT",
        category: "text",
        withUnsigned: true,
        withPrecision: true,
        withScale: true
    });

    describe('constructor', () => {
        test('should create with minimum required values', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            expect(model.columnShareModelId).toBe('test-id');
            expect(model.physicalName).toBe('test_column');
            expect(model.logicalName).toBe('Test Column');
            expect(model.columnType).toBe(mockWithoutUnsigned);
            expect(model.precision).toBe('');
            expect(model.scale).toBe('');
            expect(model.unsigned).toBe(false);
            expect(model.description).toBe('');
            expect(model.checkExpression).toBe('');
            expect(model.characterSet(Database.get('mysql'))).toBe('');
            expect(model.collate).toBe('');
            expect(model.optionExpression).toBe('');
        });

        test('should create with all values with no-unsigned column type', () => {
            const now = new Date();
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                precision: '10',
                scale: '2',
                unsigned: true,
                description: 'test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr',
                createdAt: now
            });

            expect(model.precision).toBe('10');
            expect(model.scale).toBe('2');
            expect(model.unsigned).toBe(false);
            expect(model.description).toBe('test description');
            expect(model.characterSet(Database.get('mysql'))).toBe('');
            expect(model.collate).toBe('');
            expect(model.optionExpression).toBe('opt expr');
        });

        test('should create with all values with unsigned column type', () => {
            const now = new Date();
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithUnsigned,
                precision: '10',
                scale: '2',
                unsigned: true,
                description: 'test description',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr',
                createdAt: now
            });

            expect(model.precision).toBe('10');
            expect(model.scale).toBe('2');
            expect(model.unsigned).toBe(true);
            expect(model.description).toBe('test description');
            expect(model.characterSet(Database.get('mysql'))).toBe('');
            expect(model.collate).toBe('');
            expect(model.optionExpression).toBe('opt expr');
        });

        test('should trim characterSet, collate, and optionExpression', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockTextType,
                characterSet: '  utf8mb4  ',
                collate: '  utf8mb4_unicode_ci  ',
                optionExpression: '  opt expr  '
            });

            expect(model.characterSet(Database.get('mysql'))).toBe('utf8mb4');
            expect(model.collate).toBe('utf8mb4_unicode_ci');
            expect(model.optionExpression).toBe('opt expr');
        });

        test('should set and trim checkExpression when provided', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                checkExpression: '  ${col} > 0  '
            });

            expect(model.checkExpression).toBe('${col} > 0');
        });
    });

    describe('matchForReferenceType', () => {
        test('should match same column types', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id-1',
                physicalName: 'test_column_1',
                logicalName: 'Test Column 1',
                columnType: mockWithoutUnsigned
            });

            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id-2',
                physicalName: 'test_column_2',
                logicalName: 'Test Column 2',
                columnType: mockWithoutUnsigned
            });

            expect(model1.matchForReferenceType(model2)).toBe(true);
        });

        test('should return false for different column types', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id-1',
                physicalName: 'test_column_1',
                logicalName: 'Test Column 1',
                columnType: mockWithoutUnsigned
            });

            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id-2',
                physicalName: 'test_column_2',
                logicalName: 'Test Column 2',
                columnType: mockDifferentType
            });

            expect(model1.matchForReferenceType(model2)).toBe(false);
        });

        test('should return false when unsigned differs and withUnsigned is true', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id-1',
                physicalName: 'test_column_1',
                logicalName: 'Test Column 1',
                columnType: mockWithUnsigned,
                unsigned: true
            });

            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id-2',
                physicalName: 'test_column_2',
                logicalName: 'Test Column 2',
                columnType: mockWithUnsigned,
                unsigned: false
            });

            expect(model1.matchForReferenceType(model2)).toBe(false);
        });

        test('should return true when unsigned differs but withUnsigned is false', () => {
            // withUnsigned=false の型では unsigned は常に false に正規化されるため、一致する
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id-1',
                physicalName: 'test_column_1',
                logicalName: 'Test Column 1',
                columnType: mockWithoutUnsigned,
                unsigned: true  // 正規化されて false になる
            });

            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id-2',
                physicalName: 'test_column_2',
                logicalName: 'Test Column 2',
                columnType: mockWithoutUnsigned,
                unsigned: false
            });

            expect(model1.matchForReferenceType(model2)).toBe(true);
        });
    });

    describe('equals', () => {
        test('should return true for identical models', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithUnsigned,
                precision: '10',
                scale: '2',
                unsigned: true,
                isArray: true,
                description: 'desc',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr'
            });

            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithUnsigned,
                precision: '10',
                scale: '2',
                unsigned: true,
                isArray: true,
                description: 'desc',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr'
            });

            expect(model1.equals(model2)).toBe(true);
        });

        test('should return false for different columnShareModelId', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'id-1',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'id-2',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different physicalName', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'column_1',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'column_2',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different columnType id', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockDifferentType
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different characterSet', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                characterSet: 'utf8mb4'
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                characterSet: 'utf8'
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different collate', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                collate: 'utf8mb4_unicode_ci'
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                collate: 'utf8mb4_general_ci'
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different optionExpression', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                optionExpression: 'opt 1'
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                optionExpression: 'opt 2'
            });

            expect(model1.equals(model2)).toBe(false);
        });

        test('should return false for different checkExpression', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                checkExpression: '${col} > 0'
            });
            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                checkExpression: '${col} > 1'
            });

            expect(model1.equals(model2)).toBe(false);
        });
    });

    describe('toJSON', () => {
        test('should serialize model with all properties', () => {
            const createdAt = new Date('2024-01-01T00:00:00.000Z');
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockTextUnsignedType,
                precision: '10',
                scale: '2',
                unsigned: true,
                isArray: true,
                description: 'desc',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr',
                createdAt
            });

            const json = model.toJSON();

            expect(json.columnShareModelId).toBe('test-id');
            expect(json.physicalName).toBe('test_column');
            expect(json.logicalName).toBe('Test Column');
            expect(json.columnTypeId).toBe(4);
            expect(json.precision).toBe('10');
            expect(json.scale).toBe('2');
            expect(json.unsigned).toBe(true);
            expect(json.isArray).toBe(true);
            expect(json.description).toBe('desc');
            expect(json.characterSet).toBe('utf8mb4');
            expect(json.collate).toBe('utf8mb4_unicode_ci');
            expect(json.optionExpression).toBe('opt expr');
            expect(json.createdAt).toBe(createdAt);
        });

        test('should omit optional properties when empty or falsy', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('precision');
            expect(json).not.toHaveProperty('scale');
            expect(json).not.toHaveProperty('unsigned');
            expect(json).not.toHaveProperty('isArray');
            expect(json).not.toHaveProperty('description');
            expect(json).not.toHaveProperty('checkExpression');
            expect(json).not.toHaveProperty('characterSet');
            expect(json).not.toHaveProperty('collate');
            expect(json).not.toHaveProperty('optionExpression');
        });

        test('should omit precision and scale when columnType does not support them', () => {
            const typeWithoutPrecisionScale = new ColumnType({
                id: 3,
                name: "INT",
                description: "Integer",
                baseQuery: "INT"
            });
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: typeWithoutPrecisionScale,
                precision: '10',
                scale: '2'
            });

            const json = model.toJSON();

            expect(json).not.toHaveProperty('precision');
            expect(json).not.toHaveProperty('scale');
        });

        test('should include characterSet, collate, and optionExpression in JSON when set', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockTextType,
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr'
            });

            const json = model.toJSON();

            expect(json.characterSet).toBe('utf8mb4');
            expect(json.collate).toBe('utf8mb4_unicode_ci');
            expect(json.optionExpression).toBe('opt expr');
        });

        test('should include checkExpression in JSON when set', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                checkExpression: '${col} > 0'
            });

            const json = model.toJSON();

            expect(json.checkExpression).toBe('${col} > 0');
        });
    });

    describe('toObject', () => {
        const toColumnType = (id: number): ColumnType => {
            if (id === 1) return mockWithUnsigned;
            if (id === 2) return mockDifferentType;
            if (id === 4) return mockTextUnsignedType;
            throw new Error(`Unknown columnTypeId: ${id}`);
        };

        test('should deserialize model with all properties', () => {
            const createdAt = new Date('2024-01-01T00:00:00.000Z');
            const jsonData = {
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnTypeId: 4,
                precision: '10',
                scale: '2',
                unsigned: true,
                isArray: true,
                description: 'desc',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr',
                createdAt
            };

            const model = ColumnShareModel.toObject(jsonData, toColumnType);

            expect(model.columnShareModelId).toBe('test-id');
            expect(model.physicalName).toBe('test_column');
            expect(model.logicalName).toBe('Test Column');
            expect(model.columnType).toBe(mockTextUnsignedType);
            expect(model.precision).toBe('10');
            expect(model.scale).toBe('2');
            expect(model.unsigned).toBe(true);
            expect(model.isArray).toBe(true);
            expect(model.description).toBe('desc');
            expect(model.characterSet(Database.get('mysql'))).toBe('utf8mb4');
            expect(model.collate).toBe('utf8mb4_unicode_ci');
            expect(model.optionExpression).toBe('opt expr');
        });

        test('should handle missing optional properties with defaults', () => {
            const jsonData = {
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnTypeId: 1,
                createdAt: new Date()
            };

            const model = ColumnShareModel.toObject(jsonData, toColumnType);

            expect(model.precision).toBe('');
            expect(model.scale).toBe('');
            expect(model.unsigned).toBe(false);
            expect(model.isArray).toBe(false);
            expect(model.description).toBe('');
            expect(model.checkExpression).toBe('');
            expect(model.characterSet(Database.get('mysql'))).toBe('');
            expect(model.collate).toBe('');
            expect(model.optionExpression).toBe('');
        });

        test('should throw PropertyNotExistsError for missing required properties', () => {
            expect(() => {
                ColumnShareModel.toObject({}, toColumnType);
            }).toThrow(PropertyNotExistsError);

            expect(() => {
                ColumnShareModel.toObject({ columnShareModelId: 'id' }, toColumnType);
            }).toThrow(PropertyNotExistsError);

            expect(() => {
                ColumnShareModel.toObject({
                    columnShareModelId: 'id',
                    physicalName: 'col'
                }, toColumnType);
            }).toThrow(PropertyNotExistsError);

            expect(() => {
                ColumnShareModel.toObject({
                    columnShareModelId: 'id',
                    physicalName: 'col',
                    logicalName: 'Col'
                }, toColumnType);
            }).toThrow(PropertyNotExistsError);
        });
    });

    describe('serialization roundtrip', () => {
        const toColumnType = (id: number): ColumnType => {
            if (id === 1) return mockWithUnsigned;
            if (id === 4) return mockTextUnsignedType;
            throw new Error(`Unknown columnTypeId: ${id}`);
        };

        test('should maintain equality after serialization and deserialization', () => {
            const original = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockTextUnsignedType,
                precision: '10',
                scale: '2',
                unsigned: true,
                isArray: true,
                description: 'desc',
                characterSet: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci',
                optionExpression: 'opt expr',
                createdAt: new Date('2024-01-01T00:00:00.000Z')
            });

            const json = original.toJSON();
            const deserialized = ColumnShareModel.toObject(json, toColumnType);

            expect(original.equals(deserialized)).toBe(true);
        });

        test('should handle empty optional values correctly in roundtrip', () => {
            const original = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithUnsigned,
                createdAt: new Date('2024-01-01T00:00:00.000Z')
            });

            const json = original.toJSON();
            const deserialized = ColumnShareModel.toObject(json, toColumnType);

            expect(original.equals(deserialized)).toBe(true);
        });
    });
});