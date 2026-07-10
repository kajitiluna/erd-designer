import { describe, test, expect } from 'vitest';

import ColumnType from '../ColumnType';
import { findDatabaseColumns } from '../columns';

const findColumnType = (name: string) => {
    const columnType = findDatabaseColumns('postgres').find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

describe('ColumnType arrayQueryTemplate', () => {
    describe('default template (unspecified)', () => {
        test('should return type[] for postgres integer type as before', () => {
            const integerType = findColumnType('integer');
            expect(integerType.specifiedType({ isArray: true })).toBe('INTEGER[]');
        });

        test('should return non-array type unchanged when isArray is false', () => {
            const integerType = findColumnType('integer');
            expect(integerType.specifiedType({ isArray: false })).toBe('INTEGER');
        });

        test('should apply [] suffix to a custom ColumnType with no explicit template', () => {
            const type = new ColumnType({
                id: 1, name: 'INTEGER', description: 'Integer type', baseQuery: 'INTEGER'
            });

            expect(type.specifiedType({ isArray: true })).toBe('INTEGER[]');
        });
    });

    describe('custom template', () => {
        test('should render ARRAY<TYPE> style template', () => {
            const type = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            expect(type.specifiedType({ isArray: true })).toBe('ARRAY<INT64>');
        });

        test('should render ARRAY<TYPE> template with precision parameters expanded first', () => {
            const type = new ColumnType({
                id: 2, name: 'VARCHAR', description: 'Variable character type', baseQuery: 'VARCHAR[[PARAM]]',
                withPrecision: true,
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            expect(type.specifiedType({ precision: '100', isArray: true })).toBe('ARRAY<VARCHAR(100)>');
        });

        test('should not apply the template when isArray is false', () => {
            const type = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            expect(type.specifiedType({ isArray: false })).toBe('INT64');
        });
    });

    describe('toJSON', () => {
        test('should not include arrayQueryTemplate key when default', () => {
            const type = new ColumnType({
                id: 1, name: 'INTEGER', description: 'Integer type', baseQuery: 'INTEGER'
            });

            const json = type.toJSON();
            expect('arrayQueryTemplate' in json).toBe(false);
        });

        test('should include arrayQueryTemplate key when explicitly specified', () => {
            const type = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            const json = type.toJSON();
            expect(json.arrayQueryTemplate).toBe('ARRAY<[[TYPE]]>');
        });

        test('postgres columns serialized as-is should not include arrayQueryTemplate', () => {
            const integerType = findColumnType('integer');
            const json = JSON.stringify(integerType.toJSON());
            expect(json.includes('arrayQueryTemplate')).toBe(false);
        });
    });

    describe('toObject', () => {
        test('should restore default value when key is missing', () => {
            const type = new ColumnType({
                id: 1, name: 'INTEGER', description: 'Integer type', baseQuery: 'INTEGER'
            });

            const restored = ColumnType.toObject(type.toJSON());
            expect(restored.arrayQueryTemplate).toBe('[[TYPE]][]');
            expect(restored.specifiedType({ isArray: true })).toBe('INTEGER[]');
        });

        test('should round trip through toJSON -> toObject -> equals when template specified', () => {
            const original = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            const restored = ColumnType.toObject(original.toJSON());
            expect(restored.arrayQueryTemplate).toBe('ARRAY<[[TYPE]]>');
            expect(restored.equals(original)).toBe(true);
        });

        test('should round trip through toJSON -> toObject -> equals when template is default', () => {
            const original = new ColumnType({
                id: 1, name: 'INTEGER', description: 'Integer type', baseQuery: 'INTEGER'
            });

            const restored = ColumnType.toObject(original.toJSON());
            expect(restored.equals(original)).toBe(true);
        });
    });

    describe('equals', () => {
        test('should return false when only arrayQueryTemplate differs', () => {
            const withDefault = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64'
            });
            const withCustomTemplate = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            expect(withDefault.equals(withCustomTemplate)).toBe(false);
        });

        test('should return true when arrayQueryTemplate matches explicitly', () => {
            const first = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });
            const second = new ColumnType({
                id: 1, name: 'INT64', description: 'BigQuery integer type', baseQuery: 'INT64',
                arrayQueryTemplate: 'ARRAY<[[TYPE]]>'
            });

            expect(first.equals(second)).toBe(true);
        });
    });
});
