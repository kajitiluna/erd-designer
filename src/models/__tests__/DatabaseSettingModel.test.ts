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
            expect(model.version).toBe(20250612);
        });
    });

    describe('create static method', () => {
        test('should create with postgres database type', () => {
            const model = DatabaseSettingModel.create('postgres');

            expect(model.databaseType).toBe('postgres');
            expect(model.columnTypes).toBeDefined();
            expect(model.columnTypes.length).toBeGreaterThan(0);
            expect(model.version).toBe(20250612);
        });

        test('should create with mysql database type', () => {
            const model = DatabaseSettingModel.create('mysql');

            expect(model.databaseType).toBe('mysql');
            expect(model.columnTypes).toBeDefined();
            expect(model.columnTypes.length).toBeGreaterThan(0);
            expect(model.version).toBe(20250612);
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
            expect(model.columnTypes).toHaveLength(1);
            expect(model.columnTypes[0]).toBeInstanceOf(ColumnType);
            expect(model.version).toBe(20250612);
        });

        test('should convert from plain object without version (defaults to 0, then migrates)', () => {
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
                columnTypes: [columnTypeJson]
            };

            const model = DatabaseSettingModel.toObject(obj);

            expect(model).toBeInstanceOf(DatabaseSettingModel);
            expect(model.version).toBe(20250612); // Should be migrated to current version
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