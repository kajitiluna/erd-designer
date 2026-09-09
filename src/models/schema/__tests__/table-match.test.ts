import { describe, expect, test } from 'vitest';

import { TableSnapshot } from '~/models/schema/schema-snapshot';
import TableMatcher from '~/models/schema/table-matcher';

const baseTable = (overrides: Partial<TableSnapshot> = {}): TableSnapshot => {
    return {
        schemaName: '', tableName: 'user', logicalName: '', comment: '',
        columns: [], primaryKeyColumnNames: [],
        uniqueKeys: [], indexes: [], foreignKeys: [],
        ...overrides
    };
};

describe('tableMatcher.match (withSchema: true)', () => {
    test('same table name in different schemas are matched to their own schema, not cross-paired', () => {
        const appUsers = baseTable({ schemaName: 'app', tableName: 'users' });
        const reportingUsers = baseTable({ schemaName: 'reporting', tableName: 'users' });

        const result = TableMatcher.match([appUsers, reportingUsers], [appUsers, reportingUsers], true);

        expect(result.pairs).toEqual([
            { expected: appUsers, actual: appUsers }, { expected: reportingUsers, actual: reportingUsers }
        ]);
        expect(result.missingExpected).toEqual([]);
        expect(result.unexpectedActual).toEqual([]);
    });

    test('a table existing only in one schema is missing/unexpected, not matched across schemas', () => {
        const appUsers = baseTable({ schemaName: 'app', tableName: 'users' });
        const reportingUsers = baseTable({ schemaName: 'reporting', tableName: 'users' });

        const result = TableMatcher.match([appUsers], [reportingUsers], true);

        expect(result.pairs).toEqual([]);
        expect(result.missingExpected).toEqual([appUsers]);
        expect(result.unexpectedActual).toEqual([reportingUsers]);
    });

    test('a table name differing only in case is paired and reported via caseFoldedPairs, not missing/unexpected', () => {
        const expectedTable = baseTable({ tableName: 'User' });
        const actualTable = baseTable({ tableName: 'user' });

        const result = TableMatcher.match([expectedTable], [actualTable], true);

        expect(result.pairs).toEqual([{ expected: expectedTable, actual: actualTable }]);
        expect(result.caseFoldedPairs).toEqual([{ expected: expectedTable, actual: actualTable }]);
        expect(result.missingExpected).toEqual([]);
        expect(result.unexpectedActual).toEqual([]);
    });
});

describe('tableMatcher.match (withSchema: false)', () => {
    test('tables are matched by name alone, ignoring schemaName', () => {
        const expectedTable = baseTable({ schemaName: 'shop_a', tableName: 'user' });
        const actualTable = baseTable({ schemaName: 'shop_b', tableName: 'user' });

        const result = TableMatcher.match([expectedTable], [actualTable], false);

        expect(result.pairs).toEqual([{ expected: expectedTable, actual: actualTable }]);
    });
});
