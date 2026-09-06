import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { dbDifference } from '~/cli/commands/db-diff';
import DbDriver from '~/cli/introspect/db-driver';
import CommandRunner from '~/cli/command-runner';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { DatabaseType } from '~/models/database/DatabaseType';
import { findDatabaseColumns } from '~/models/database/columns';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableModel from '~/models/database/TableModel';
import ErdDocument from '~/models/ErdDocument';
import { SchemaSnapshot } from '~/models/schema/schema-snapshot';
import TableViewModel from '~/models/TableViewModel';

let workDirectory: string;
let logLines: string[];
let errorLines: string[];
let warnLines: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let originalErdDbUrl: string | undefined;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'db-diff-command-'));
    logLines = [];
    errorLines = [];
    warnLines = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => { logLines.push(String(message)); });
    errorSpy = vi.spyOn(console, 'error').mockImplementation((message: unknown) => { errorLines.push(String(message)); });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => { warnLines.push(String(message)); });
    originalErdDbUrl = process.env.ERD_DB_URL;
    delete process.env.ERD_DB_URL;
});

afterEach(() => {
    fs.rmSync(workDirectory, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    vi.restoreAllMocks();
    if (originalErdDbUrl != null) {
        process.env.ERD_DB_URL = originalErdDbUrl;
    } else {
        delete process.env.ERD_DB_URL;
    }
});

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (databaseType: DatabaseType, name: string) => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

const buildDocument = (databaseType: DatabaseType): ErdDocument => {
    const integerTypeName = (databaseType === 'postgres') || (databaseType === 'sqlite') ? 'integer' : 'int';
    const idShare = new ColumnShareModel({
        columnShareModelId: 'share-id', physicalName: 'id', logicalName: 'id',
        columnType: findColumnType(databaseType, integerTypeName)
    });
    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
    });
    const tableModel = new TableModel({
        tableModelId: 'table-user', physicalName: 'user',
        columnEntries: [{ modelType: 'single', columnModelId: 'col-id' }] as ColumnEntry[]
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'db-diff-command', databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView], columnModels: [idColumn], columnShareModels: [idShare]
    });
};

const writeDocument = (fileName: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

const EMPTY_MYSQL_SNAPSHOT: SchemaSnapshot = {
    databaseType: 'mysql', schemaNames: [], warnings: [],
    tables: [{
        schemaName: '', tableName: 'user', logicalName: '', comment: '',
        columns: [{
            columnName: 'id', logicalName: '', typeExpression: 'INT', unsigned: false,
            notNull: true, defaultValue: '', autoIncrement: false, comment: ''
        }],
        primaryKeyColumnNames: ['id'], uniqueKeys: [], indexes: [], foreignKeys: []
    }]
};

type FetchDatabaseSnapshotResult =
    { resultType: "fetched", snapshot: SchemaSnapshot }
    | { resultType: "failed", message: string };

const stubFetcher = (result: FetchDatabaseSnapshotResult) => {
    return vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue(result);
};

describe('DbDifference', () => {
    test('an identical database snapshot returns "ok" (no differences)', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db']
        );

        expect(result).toBe('ok');
        expect(logLines.join('\n')).toContain('No differences found.');
    });

    test('a database snapshot with a differing type returns "detected" (differences exist)', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const databaseSnapshot: SchemaSnapshot = {
            ...EMPTY_MYSQL_SNAPSHOT,
            tables: [{ ...EMPTY_MYSQL_SNAPSHOT.tables[0], columns: [{ ...EMPTY_MYSQL_SNAPSHOT.tables[0].columns[0], typeExpression: 'SMALLINT' }] }]
        };
        stubFetcher({ resultType: 'fetched', snapshot: databaseSnapshot });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db']
        );

        expect(result).toBe('detected');
        expect(logLines.join('\n')).toContain('Type mismatch');
    });

    test('a fetch failure returns "error" and prints the failure message', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        stubFetcher({ resultType: 'failed', message: 'connect ETIMEDOUT 10.0.3.21:3306' });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db']
        );

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('connect ETIMEDOUT'))).toBe(true);
    });

    test('missing --file returns "error"', async () => {
        stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(dbDifference, ['--dsn', 'mysql://user@host/db']);

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('--file'))).toBe(true);
    });

    test('no ERD_DB_URL and no --dsn returns "error" without ever calling the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(dbDifference, ['--file', filePath]);

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
    });

    test('ERD_DB_URL takes precedence over --dsn', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        process.env.ERD_DB_URL = 'mysql://from-env@host/db';
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://from-flag@host/db']
        );

        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://from-env@host/db', { schemaOption: '', designSchemaNames: [] },
            expect.anything(), expect.anything()
        );
    });

    test('an unsupported dialect is rejected before ever calling the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('sqlite'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'sqlite://whatever']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
        expect(errorLines.some(line => line.includes('Unsupported database type for db-diff: sqlite'))).toBe(true);
    });

    test('--schema is passed straight through to the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('postgres'));
        const fetchDatabaseSnapshot = stubFetcher({
            resultType: 'fetched', snapshot: { ...EMPTY_MYSQL_SNAPSHOT, databaseType: 'postgres' as const }
        });

        await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'postgres://user@host/db', '--schema', 'shop']
        );

        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'postgres', 'postgres://user@host/db', { schemaOption: 'shop', designSchemaNames: ['public'] },
            expect.anything(), expect.anything()
        );
    });

    test('mysql ignores --schema: the fetcher still receives an empty schemaOption, with a warning on stderr', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db', '--schema', 'shop']
        );

        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://user@host/db', { schemaOption: '', designSchemaNames: [] },
            expect.anything(), expect.anything()
        );
        expect(warnLines.some(line => line.includes('--schema is ignored'))).toBe(true);
    });

    test('--ignore-table excludes a table from both sides before comparing', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const databaseSnapshot: SchemaSnapshot = {
            ...EMPTY_MYSQL_SNAPSHOT,
            tables: [
                EMPTY_MYSQL_SNAPSHOT.tables[0],
                { ...EMPTY_MYSQL_SNAPSHOT.tables[0], tableName: 'flyway_schema_history' }
            ]
        };
        stubFetcher({ resultType: 'fetched', snapshot: databaseSnapshot });

        const result = await CommandRunner.execute(dbDifference, [
            '--file', filePath, '--dsn', 'mysql://user@host/db', '--ignore-table', '^flyway_schema_history$', '--format', 'json'
        ]);

        expect(result).toBe('ok');
        const parsed = JSON.parse(logLines.join('\n'));
        expect(parsed.differences).toEqual([]);
    });

    test('an invalid --format value returns "error" without calling the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db', '--format', 'xml']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
    });

    test('a non-numeric --connect-timeout returns "error" without calling the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db', '--connect-timeout', 'abc']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
        expect(errorLines.some(line => line.includes('--connect-timeout'))).toBe(true);
    });

    test('a --query-timeout of "0" returns "error" without calling the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db', '--query-timeout', '0']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
        expect(errorLines.some(line => line.includes('--query-timeout'))).toBe(true);
    });

    test('a negative --connect-timeout returns "error" without calling the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        const result = await CommandRunner.execute(
            dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db', '--connect-timeout', '-1']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
    });

    test('--connect-timeout/--query-timeout are parsed and passed to the fetcher, overriding the defaults', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        await CommandRunner.execute(dbDifference, [
            '--file', filePath, '--dsn', 'mysql://user@host/db', '--connect-timeout', '5', '--query-timeout', '45'
        ]);

        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://user@host/db', expect.anything(), expect.anything(),
            { connectSeconds: 5, querySeconds: 45 }
        );
    });

    test('omitting --connect-timeout/--query-timeout passes the documented defaults to the fetcher', async () => {
        const filePath = writeDocument('schema.erd', buildDocument('mysql'));
        const fetchDatabaseSnapshot = stubFetcher({ resultType: 'fetched', snapshot: EMPTY_MYSQL_SNAPSHOT });

        await CommandRunner.execute(dbDifference, ['--file', filePath, '--dsn', 'mysql://user@host/db']);

        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://user@host/db', expect.anything(), expect.anything(),
            { connectSeconds: 10, querySeconds: 30 }
        );
    });
});
