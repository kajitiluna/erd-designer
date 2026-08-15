import { describe, expect, test } from 'vitest';
import { DeclaredColumnType } from '~/models/schema/column-type-match';
import { findDatabaseColumns } from '~/models/database/columns';

describe('DeclaredColumnType.find', () => {
    test('precision-less MySQL INT matches the type with no [[PARAM]]', () => {
        const matched = DeclaredColumnType.find('mysql', {
            columnType: 'INT', timezone: '', precision: null, scale: null, isArray: false
        });

        expect(matched?.name).toBe('int');
    });

    test('MySQL INT with a display width matches the precision-bearing variant', () => {
        const matched = DeclaredColumnType.find('mysql', {
            columnType: 'INT', timezone: '', precision: 11, scale: null, isArray: false
        });

        expect(matched?.name).toBe('int (m)');
    });

    test('a precision is rejected against a type that does not support it', () => {
        const matched = DeclaredColumnType.find('mysql', {
            columnType: 'BOOLEAN', timezone: '', precision: 1, scale: null, isArray: false
        });

        expect(matched).toBeNull();
    });

    test('PostgreSQL NUMERIC(p, s) matches the type carrying both precision and scale', () => {
        const matched = DeclaredColumnType.find('postgres', {
            columnType: 'NUMERIC', timezone: '', precision: 10, scale: 2, isArray: false
        });

        expect(matched?.name).toBe('numeric (p, s)');
    });

    test('PostgreSQL timestamp keeps precision ahead of the time zone clause', () => {
        const matched = DeclaredColumnType.find('postgres', {
            columnType: 'TIMESTAMP', timezone: 'with time zone', precision: 3, scale: null, isArray: false
        });

        expect(matched?.baseQuery).toBe('TIMESTAMP[[PARAM]] WITH TIME ZONE');
    });

    test('MS SQL Server precision "max" matches the dedicated (MAX) type without a precision check', () => {
        const matched = DeclaredColumnType.find('ms_sqlserver', {
            columnType: 'VARCHAR', timezone: '', precision: 'max', scale: null, isArray: false
        });

        expect(matched?.name).toBe('varchar (max)');
    });

    test('an unknown type name matches nothing', () => {
        const matched = DeclaredColumnType.find('mysql', {
            columnType: 'NOT_A_REAL_TYPE', timezone: '', precision: null, scale: null, isArray: false
        });

        expect(matched).toBeNull();
    });

    test('candidates are tried in columns.ts definition order, so the first structural match wins', () => {
        const columnTypes = findDatabaseColumns('mysql');
        const tinyintIndex = columnTypes.findIndex(columnType => columnType.name === 'tinyint');
        const tinyintWithWidthIndex = columnTypes.findIndex(columnType => columnType.name === 'tinyint (m)');

        expect(tinyintIndex).toBeLessThan(tinyintWithWidthIndex);
    });
});
