import ColumnType from '~/models/database/ColumnType';
import { resolveErmColumnType } from '../erm-sql-type';

describe('resolveErmColumnType', () => {
    test('should resolve a parameterized varchar for MySQL', () => {
        const columnType = resolveErmColumnType('mysql', 'MySQL', 'varchar(n)');

        expect(columnType.baseQuery).toBe('VARCHAR[[PARAM]]');
        expect(columnType.withPrecision).toBe(true);
        expect(columnType.withScale).toBe(false);
    });

    test('should resolve a parameterized char for PostgreSQL from the "character(n)" id', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'character(n)');

        expect(columnType.baseQuery).toBe('CHAR[[PARAM]]');
        expect(columnType.withPrecision).toBe(true);
    });

    test('should resolve double precision for PostgreSQL', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'double precision');

        expect(columnType.baseQuery).toBe('DOUBLE PRECISION');
    });

    test('should resolve a serial to the dedicated PostgreSQL serial type (not its foreign column)', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'serial');

        expect(columnType.baseQuery).toBe('SERIAL');
    });

    // PostgreSQL のカタログには時間帯指定なしの裸の TIME/TIMESTAMP が存在せず、
    // WITH/WITHOUT TIME ZONE のいずれかを必ず要求する。ブラウザでの実データ検証で発覚した実バグ。
    test('should resolve a bare "timestamp" for PostgreSQL to the WITHOUT TIME ZONE variant', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'timestamp');

        expect(columnType).not.toBe(ColumnType.EMPTY);
        expect(columnType.baseQuery).toBe('TIMESTAMP WITHOUT TIME ZONE');
    });

    test('should resolve a bare "time" for PostgreSQL to the WITHOUT TIME ZONE variant', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'time');

        expect(columnType).not.toBe(ColumnType.EMPTY);
        expect(columnType.baseQuery).toBe('TIME WITHOUT TIME ZONE');
    });

    test('should still resolve "time with time zone" for PostgreSQL to the WITH TIME ZONE variant', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'time with time zone');

        expect(columnType).not.toBe(ColumnType.EMPTY);
        expect(columnType.baseQuery).toBe('TIME WITH TIME ZONE');
    });

    test('should resolve a bare "timestamp" for MySQL without needing the synonym (unaffected)', () => {
        const columnType = resolveErmColumnType('mysql', 'MySQL', 'timestamp');

        expect(columnType).not.toBe(ColumnType.EMPTY);
        expect(columnType.baseQuery).toBe('TIMESTAMP');
    });

    // SQLite has no precision/scale-capable numeric type; ERMaster's own alias table already
    // collapses "decimal(p,s)" and "numeric(p,s)" to the parameterless "numeric" alias for SQLite.
    test('should resolve decimal(p,s) to the parameterless numeric type for SQLite', () => {
        const columnType = resolveErmColumnType('sqlite', 'SQLite', 'decimal(p,s)');

        expect(columnType.baseQuery).toBe('NUMERIC');
        expect(columnType.withPrecision).toBe(false);
    });

    test('should resolve a plain integer for SQLite', () => {
        const columnType = resolveErmColumnType('sqlite', 'SQLite', 'integer');

        expect(columnType.baseQuery).toBe('INTEGER');
    });

    test('should resolve a parameterized varbinary for MS SQL Server', () => {
        const columnType = resolveErmColumnType('ms_sqlserver', 'SQLServer', 'varbinary(n)');

        expect(columnType.baseQuery).toBe('VARBINARY[[PARAM]]');
        expect(columnType.withPrecision).toBe(true);
    });

    test('should resolve differently for SQLServer and SQLServer 2008 sources when the alias text differs', () => {
        const sqlServer = resolveErmColumnType('ms_sqlserver', 'SQLServer', 'blob');
        const sqlServer2008 = resolveErmColumnType('ms_sqlserver', 'SQLServer 2008', 'blob');

        // "SQLServer" resolves to the plain parameterized varbinary type ("varbinary(max)" alias).
        expect(sqlServer).not.toBe(ColumnType.EMPTY);
        expect(sqlServer.baseQuery).toBe('VARBINARY[[PARAM]]');
        // "SQLServer 2008"'s alias ("varbinary(max) filestream") has no equivalent in the catalog.
        expect(sqlServer2008).toBe(ColumnType.EMPTY);
    });

    test('should return ColumnType.EMPTY when the ERMaster type has no alias for the source database', () => {
        const columnType = resolveErmColumnType('postgres', 'PostgreSQL', 'enum');

        expect(columnType).toBe(ColumnType.EMPTY);
    });

    test('should return ColumnType.EMPTY for a type with no alias in any database (a component-only marker)', () => {
        expect(resolveErmColumnType('mysql', 'MySQL', 'array')).toBe(ColumnType.EMPTY);
        expect(resolveErmColumnType('postgres', 'PostgreSQL', 'array')).toBe(ColumnType.EMPTY);
    });

    test('should return ColumnType.EMPTY for a SqlType id that is not in the alias table at all', () => {
        const columnType = resolveErmColumnType('mysql', 'MySQL', 'totally_unknown_type');

        expect(columnType).toBe(ColumnType.EMPTY);
    });

    test('should disambiguate same-named types by required parameter count', () => {
        const withoutParam = resolveErmColumnType('mysql', 'MySQL', 'bigint');
        const withParam = resolveErmColumnType('mysql', 'MySQL', 'bigint(n)');

        expect(withoutParam.baseQuery).toBe('BIGINT');
        expect(withoutParam.withPrecision).toBe(false);
        expect(withParam.baseQuery).toBe('BIGINT[[PARAM]]');
        expect(withParam.withPrecision).toBe(true);
    });
});
