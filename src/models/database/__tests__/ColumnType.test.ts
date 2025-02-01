import ColumnType from '../ColumnType';
import { PropertyNotExistsError } from '~/models/exceptions';

describe('ColumnType', () => {
    describe('constructor', () => {
        test('should create with minimum required values', () => {
            const type = new ColumnType({
                id: 1,
                name: "INTEGER",
                description: "Integer type",
                baseQuery: "INTEGER"
            });

            expect(type.id).toBe(1);
            expect(type.name).toBe("INTEGER");
            expect(type.description).toBe("Integer type");
            expect(type.baseQuery).toBe("INTEGER");
            expect(type.withPrecision).toBe(false);
            expect(type.withScale).toBe(false);
            expect(type.withUnsigned).toBe(false);
            expect(type.withAuthIncrement).toBe(false);
            expect(type.foreignId).toBe(1);
        });

        test('should create with all options', () => {
            const type = new ColumnType({
                id: 2,
                name: "DECIMAL",
                description: "Decimal type",
                baseQuery: "DECIMAL",
                withPrecision: true,
                withScale: true,
                withUnsigned: true,
                withAuthIncrement: true,
                foreignId: 1
            });

            expect(type.withPrecision).toBe(true);
            expect(type.withScale).toBe(true);
            expect(type.withUnsigned).toBe(true);
            expect(type.withAuthIncrement).toBe(true);
            expect(type.foreignId).toBe(1);
        });
    });

    describe('EMPTY', () => {
        test('should have empty values', () => {
            expect(ColumnType.EMPTY.id).toBe(0);
            expect(ColumnType.EMPTY.name).toBe("");
            expect(ColumnType.EMPTY.description).toBe("");
            expect(ColumnType.EMPTY.baseQuery).toBe("");
        });
    });

    describe('specifiedType', () => {
        test('should return base query when no precision/scale supported', () => {
            const type = new ColumnType({
                id: 1,
                name: "INTEGER",
                description: "Integer type",
                baseQuery: "INTEGER"
            });

            expect(type.specifiedType({ precision: "10", scale: "2" })).toBe("INTEGER");
        });

        test('should return base query when precision/scale supported', () => {
            const type = new ColumnType({
                id: 1,
                name: "INTEGER",
                description: "Integer type",
                baseQuery: "INTEGER[[PARAM]]"
            });

            expect(type.specifiedType({ precision: "10", scale: "2" })).toBe("INTEGER(10, 2)");
        });

        test('should return query without precision when not supported', () => {
            const type = new ColumnType({
                id: 2,
                name: "VARCHAR",
                description: "Variable character type",
                baseQuery: "VARCHAR",
                withPrecision: true
            });

            expect(type.specifiedType({ precision: "255" })).toBe("VARCHAR");
        });

        test('should return query with precision when supported', () => {
            const type = new ColumnType({
                id: 2,
                name: "VARCHAR",
                description: "Variable character type",
                baseQuery: "VARCHAR[[PARAM]]",
                withPrecision: true
            });

            expect(type.specifiedType({ precision: "255" })).toBe("VARCHAR(255)");
        });

        test('should return query with precision and scale when supported', () => {
            const type = new ColumnType({
                id: 3,
                name: "DECIMAL",
                description: "Decimal type",
                baseQuery: "DECIMAL[[PARAM]]",
                withPrecision: true,
                withScale: true
            });

            expect(type.specifiedType({ precision: "10", scale: "2" })).toBe("DECIMAL(10, 2)");
        });
    });

    describe('serialization', () => {
        test('should serialize to JSON and deserialize back', () => {
            const original = new ColumnType({
                id: 1,
                name: "INTEGER",
                description: "Integer type",
                baseQuery: "INTEGER",
                withPrecision: true,
                withScale: true
            });

            const json = original.toJSON();
            const deserialized = ColumnType.toObject(json);

            expect(deserialized).toBeInstanceOf(ColumnType);
            expect(deserialized.id).toBe(original.id);
            expect(deserialized.name).toBe(original.name);
            expect(deserialized.description).toBe(original.description);
            expect(deserialized.baseQuery).toBe(original.baseQuery);
            expect(deserialized.withPrecision).toBe(original.withPrecision);
            expect(deserialized.withScale).toBe(original.withScale);
        });

        test('should throw error when required properties are missing', () => {
            expect(() => ColumnType.toObject({})).toThrow(PropertyNotExistsError);
            expect(() => ColumnType.toObject({ id: 1 })).toThrow(PropertyNotExistsError);
        });
    });
});