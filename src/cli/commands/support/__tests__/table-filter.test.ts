import { describe, expect, test } from 'vitest';

import { TableFilter } from '~/cli/commands/support/table-filter';
import { SchemaSnapshot } from '~/models/schema/schema-snapshot';

const parseFilter = (patterns: readonly string[]): TableFilter => {
    const result = TableFilter.create(patterns);
    if (result.resultType !== 'parsed') {
        throw new Error(`unexpected invalid pattern in test setup: ${result.message}`);
    }

    return result.filter;
};

describe('TableFilter.parse', () => {
    test('an empty pattern list keeps every table', () => {
        const result = TableFilter.create([]);

        expect(result.resultType).toBe('parsed');
        if (result.resultType === 'parsed') {
            expect(result.filter.filterTables(toSnapshot(['user'])).tables.map(table => table.tableName)).toEqual(['user']);
        }
    });

    test('a table matching any pattern is excluded', () => {
        const result = TableFilter.create(['^flyway_schema_history$', '_backup_[0-9]{8}$']);

        expect(result.resultType).toBe('parsed');
        if (result.resultType === 'parsed') {
            const snapshot = toSnapshot(['flyway_schema_history', 'order_item_backup_20260701', 'user']);
            expect(result.filter.filterTables(snapshot).tables.map(table => table.tableName)).toEqual(['user']);
        }
    });

    test('an invalid regex pattern is rejected without throwing', () => {
        const result = TableFilter.create(['(unclosed']);

        expect(result.resultType).toBe('invalid');
    });
});

describe('TableFilter#filterTables / #ignoredTableNames', () => {
    const snapshot = toSnapshot(['user', 'flyway_schema_history']);

    test('filterTables removes tables the filter rejects', () => {
        const filter = parseFilter(['^flyway_schema_history$']);

        const filtered = filter.filterTables(snapshot);

        expect(filtered.tables.map(table => table.tableName)).toEqual(['user']);
    });

    test('ignoredTableNames reports exactly the tables the filter rejects', () => {
        const filter = parseFilter(['^flyway_schema_history$']);

        expect(filter.ignoredTableNames(snapshot)).toEqual(['flyway_schema_history']);
    });
});

describe('TableFilter: schema-qualified matching', () => {
    test('a pattern anchored to a schema excludes only that schema\'s table, not the same table name elsewhere', () => {
        const snapshot = toSnapshotWithSchemas([
            { schemaName: 'app', tableName: 'session' },
            { schemaName: 'audit', tableName: 'session' }
        ]);
        const filter = parseFilter(['^audit\\.']);

        const filtered = filter.filterTables(snapshot);

        expect(filtered.tables.map(table => `${table.schemaName}.${table.tableName}`)).toEqual(['app.session']);
    });

    test('a bare table-name pattern still matches regardless of schema', () => {
        const snapshot = toSnapshotWithSchemas([
            { schemaName: 'app', tableName: 'flyway_schema_history' },
            { schemaName: 'audit', tableName: 'flyway_schema_history' },
            { schemaName: 'app', tableName: 'user' }
        ]);
        const filter = parseFilter(['^flyway_schema_history$']);

        const filtered = filter.filterTables(snapshot);

        expect(filtered.tables.map(table => table.tableName)).toEqual(['user']);
    });

    test('ignoredTableNames reports the schema-qualified name', () => {
        const snapshot = toSnapshotWithSchemas([{ schemaName: 'audit', tableName: 'session' }]);
        const filter = parseFilter(['^audit\\.']);

        expect(filter.ignoredTableNames(snapshot)).toEqual(['audit.session']);
    });

    test('a schema-less table (mysql/mariadb) is unaffected by schema-qualified matching', () => {
        const snapshot = toSnapshot(['user']);
        const filter = parseFilter(['^audit\\.']);

        expect(filter.filterTables(snapshot).tables.map(table => table.tableName)).toEqual(['user']);
    });
});

const toSnapshot = (tableNames: readonly string[]): SchemaSnapshot => {
    return toSnapshotWithSchemas(tableNames.map(tableName => { return { schemaName: '', tableName }; }));
};

const toSnapshotWithSchemas = (tables: readonly { schemaName: string, tableName: string }[]): SchemaSnapshot => {
    return {
        databaseType: 'mysql', schemaNames: [], warnings: [],
        tables: tables.map(({ schemaName, tableName }) => {
            return {
                schemaName, tableName, logicalName: '', comment: '', columns: [],
                primaryKeyColumnNames: [], uniqueKeys: [], indexes: [], foreignKeys: []
            };
        })
    };
};
