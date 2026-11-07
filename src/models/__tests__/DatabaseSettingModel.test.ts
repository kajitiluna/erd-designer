import DatabaseSettingModel from '../DatabaseSettingModel';
import ColumnType from '~/models/database/ColumnType';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('DatabaseSettingModel', () => {
    describe('constructor', () => {
        test('should create with provided values', () => {
            const columnType1 = new ColumnType({
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER'
            });
            const columnType2 = new ColumnType({
                id: 2,
                name: 'VARCHAR',
                description: 'Variable character type',
                baseQuery: 'VARCHAR'
            });
            const columnTypes = [columnType1, columnType2];

            const model = new DatabaseSettingModel({
                databaseType: 'postgres',
                columnTypes: columnTypes,
                version: 20250612
            });

            expect(model.databaseType).toBe('postgres');
            expect(model.columnTypes).toEqual(columnTypes);
        });
    });

    describe('create static method', () => {
        test('should create with postgres database type', () => {
            const model = DatabaseSettingModel.create('postgres');

            expect(model.databaseType).toBe('postgres');
            expect(model.columnTypes).toBeDefined();
            expect(model.columnTypes.length).toBeGreaterThan(0);
        });

        test('should create with mysql database type', () => {
            const model = DatabaseSettingModel.create('mysql');

            expect(model.databaseType).toBe('mysql');
            expect(model.columnTypes).toBeDefined();
            expect(model.columnTypes.length).toBeGreaterThan(0);
        });

        test('should define default candidates for postgres date type', () => {
            const model = DatabaseSettingModel.create('postgres');

            const columnType = model.findColumnType(101);
            expect(columnType?.candidateDefaultValues('', '')).toEqual(['CURRENT_DATE']);
        });
    });

    describe('initToColumnTypeMapping', () => {
        test('should create mapping function that returns correct column types', () => {
            const columnType1 = new ColumnType({
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER'
            });
            const columnType2 = new ColumnType({
                id: 2,
                name: 'VARCHAR',
                description: 'Variable character type',
                baseQuery: 'VARCHAR'
            });

            const model = new DatabaseSettingModel({
                databaseType: 'postgres',
                columnTypes: [columnType1, columnType2],
                version: 20250612
            });

            const mapping = model.initToColumnTypeMapping();

            expect(mapping(1)).toBe(columnType1);
            expect(mapping(2)).toBe(columnType2);
        });

        test('should return EMPTY column type for non-existent id', () => {
            const columnType = new ColumnType({
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER'
            });

            const model = new DatabaseSettingModel({
                databaseType: 'postgres',
                columnTypes: [columnType],
                version: 20250612
            });

            const mapping = model.initToColumnTypeMapping();

            expect(mapping(999)).toBe(ColumnType.EMPTY);
        });
    });

    describe('findColumnType', () => {
        test('should find existing column type by id', () => {
            const columnType1 = new ColumnType({
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER'
            });
            const columnType2 = new ColumnType({
                id: 2,
                name: 'VARCHAR',
                description: 'Variable character type',
                baseQuery: 'VARCHAR'
            });

            const model = new DatabaseSettingModel({
                databaseType: 'postgres',
                columnTypes: [columnType1, columnType2],
                version: 20250612
            });

            expect(model.findColumnType(1)).toBe(columnType1);
            expect(model.findColumnType(2)).toBe(columnType2);
        });

        test('should return null for non-existent column type id', () => {
            const columnType = new ColumnType({
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER'
            });

            const model = new DatabaseSettingModel({
                databaseType: 'postgres',
                columnTypes: [columnType],
                version: 20250612
            });

            expect(model.findColumnType(999)).toBeNull();
        });
    });

    describe('toJSON', () => {
        test('should convert to plain object', () => {
            const columnType = new ColumnType({
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER'
            });

            const model = new DatabaseSettingModel({
                databaseType: 'postgres',
                columnTypes: [columnType],
                version: 20250612
            });

            const json = model.toJSON();

            expect(json).toEqual({
                databaseType: 'postgres',
                columnTypes: [columnType.toJSON()],
                version: 20250612
            });
        });
    });

    describe('toObject', () => {
        test('should convert from plain object', () => {
            const columnTypeJson = {
                id: 1,
                name: 'INTEGER',
                description: 'Integer type',
                baseQuery: 'INTEGER',
                withPrecision: false,
                withScale: false,
                withUnsigned: false,
                withAutoIncrement: false,
                foreignColumn: null
            };

            const obj = {
                databaseType: 'postgres',
                columnTypes: [columnTypeJson],
                version: 20250612
            };

            const model = DatabaseSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(DatabaseSettingModel);
            expect(model.databaseType).toBe('postgres');
            // postgres の場合、version 20250718 で OID カラムが追加されるため、columnType の数は増える
            expect(model.columnTypes).not.toHaveLength(1);
            expect(model.columnTypes[0]).toBeInstanceOf(ColumnType);
            // version 更新のため、元の値から変わる
            expect(model.version).not.toBe(20250612);
        });

        test('should serialize to JSON and deserialize back correctly', () => {
            const original = DatabaseSettingModel.create('postgres');

            const json = original.toJSON();
            const deserialized = DatabaseSettingModel.toObject(json);

            expect(deserialized).toBeInstanceOf(DatabaseSettingModel);
            expect(deserialized.databaseType).toBe(original.databaseType);
            expect(deserialized.version).toBe(original.version);
            expect(deserialized.columnTypes.length).toBe(original.columnTypes.length);
        });

        test('should restore date/time default candidates for postgres files saved without them', () => {
            const obj = {
                databaseType: 'postgres',
                columnTypes: [{
                    id: 122,
                    name: 'timestamp (p) with time zone',
                    description: '時間帯付き日付と時刻',
                    baseQuery: 'TIMESTAMP[[PARAM]] WITH TIME ZONE',
                    withPrecision: true
                }],
                version: 20260504
            };

            const model = DatabaseSettingModel.toObject(obj);

            const columnType = model.findColumnType(122);
            expect(columnType?.candidateDefaultValues('3', '')).toEqual(['CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP(3)']);
        });

        test('should replace outdated postgres default candidates with the latest definition', () => {
            const obj = {
                databaseType: 'postgres',
                columnTypes: [{
                    id: 111,
                    name: 'timestamp without time zone',
                    description: '日付と時刻 (時間帯なし)',
                    baseQuery: 'TIMESTAMP WITHOUT TIME ZONE',
                    defaultValueCandidates: ['CURRENT_TIMESTAMP']
                }],
                version: 20260504
            };

            const model = DatabaseSettingModel.toObject(obj);

            const columnType = model.findColumnType(111);
            expect(columnType?.candidateDefaultValues('', '')).toEqual(['LOCALTIMESTAMP']);
        });

        test('should not touch default candidates of non-postgres databases at version 20260504', () => {
            const obj = {
                databaseType: 'mysql',
                columnTypes: [{
                    id: 111,
                    name: 'timestamp',
                    description: 'timestamp',
                    baseQuery: 'TIMESTAMP',
                    defaultValueCandidates: ['CUSTOM_VALUE']
                }],
                version: 20260504
            };

            const model = DatabaseSettingModel.toObject(obj);

            const columnType = model.findColumnType(111);
            expect(columnType?.candidateDefaultValues('', '')).toEqual(['CUSTOM_VALUE']);
        });

        test('should throw error when databaseType is missing', () => {
            const obj = {
                columnTypes: [],
                version: 20250612
            };

            expect(() => DatabaseSettingModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw error when columnTypes is missing', () => {
            const obj = {
                databaseType: 'postgres',
                version: 20250612
            };

            expect(() => DatabaseSettingModel.toObject(obj))
                .toThrow(PropertyNotExistsError);
        });
    });
});