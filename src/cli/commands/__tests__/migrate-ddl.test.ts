import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ddlMigration } from '~/cli/commands/migrate-ddl';
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
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-ddl-command-'));
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

const buildDocument = (databaseType: DatabaseType, columnNames: string[]): ErdDocument => {
    const integerTypeName = (databaseType === 'postgres') || (databaseType === 'sqlite') ? 'integer' : 'int';
    const shares = columnNames.map(name => new ColumnShareModel({
        columnShareModelId: `share-${name}`, physicalName: name, logicalName: name,
        columnType: findColumnType(databaseType, integerTypeName)
    }));
    const columns = columnNames.map((name, index) => new SimpleColumnModel({
        columnModelId: `col-${name}`, columnShareModelId: `share-${name}`, primaryKey: (index === 0), notNull: (index === 0)
    }));
    const tableModel = new TableModel({
        tableModelId: 'table-user', physicalName: 'user',
        columnEntries: columnNames.map(name => {
            return { modelType: 'single', columnModelId: `col-${name}` };
        }) as ColumnEntry[]
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'migrate-ddl-command', databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView], columnModels: columns, columnShareModels: shares
    });
};

const writeDocument = (fileName: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

describe('DdlMigration (--from mode)', () => {
    test('an added column produces an ADD COLUMN statement printed to stdout, with a review header', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id', 'email']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath]);

        expect(result).toBe('ok');
        const output = logLines.join('\n');
        expect(output).toContain('This script is not applied automatically. Review it before executing.');
        expect(output).toContain('ADD COLUMN');
    });

    test('identical revisions still succeed and report no differences', async () => {
        const path1 = writeDocument('a.erd', buildDocument('mysql', ['id']));
        const path2 = writeDocument('b.erd', buildDocument('mysql', ['id']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', path1, '--from', path2]);

        expect(result).toBe('ok');
        expect(logLines.join('\n')).toContain('No differences found.');
    });

    test('--out writes the script to a file and prints a summary instead of the SQL itself', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id', 'email']));
        const outPath = path.join(workDirectory, 'migrate.sql');

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath, '--out', outPath]);

        expect(result).toBe('ok');
        expect(fs.existsSync(outPath)).toBe(true);
        expect(fs.readFileSync(outPath, 'utf-8')).toContain('ADD COLUMN');
        expect(logLines.join('\n')).toContain('Wrote 1 statement(s)');
    });

    test('a destructive statement is commented out by default', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id', 'legacy']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath]);

        expect(result).toBe('ok');
        expect(logLines.join('\n')).toContain('-- ALTER TABLE');
    });

    test('--allow-destructive emits the destructive statement as executable SQL', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id', 'legacy']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath, '--allow-destructive']);

        expect(result).toBe('ok');
        const output = logLines.join('\n');
        expect(output).toContain('ALTER TABLE `user` DROP COLUMN `legacy`;');
        expect(output).not.toContain('-- ALTER TABLE `user` DROP COLUMN');
    });

    test('--ignore-table excludes a table from the generated script entirely', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id', 'email']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath, '--ignore-table', '^user$']);

        expect(result).toBe('ok');
        expect(logLines.join('\n')).toContain('No differences found.');
    });
});

describe('DdlMigration (option validation)', () => {
    test('missing --file returns "error"', async () => {
        const result = await CommandRunner.execute(ddlMigration, ['--from', 'whatever.erd']);

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('--file'))).toBe(true);
    });

    test('neither --from nor a database connection returns "error"', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath]);

        expect(result).toBe('error');
    });

    test('passing both --from and --dsn is rejected as ambiguous', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--from', basePath, '--dsn', 'mysql://user@host/db']
        );

        expect(result).toBe('error');
    });

    test('a --from file that does not exist returns "error"', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--from', path.join(workDirectory, 'absent.erd')]
        );

        expect(result).toBe('error');
    });

    test('an unsupported dialect on the --from side returns "error" instead of falling back to a MySQL-shaped dialect', async () => {
        const basePath = writeDocument('base.erd', buildDocument('sqlite', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('sqlite', ['id', 'email']));

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath]);

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('sqlite'))).toBe(true);
    });

    test('--from succeeds even when ERD_DB_URL is set in the environment', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id', 'email']));
        process.env.ERD_DB_URL = 'mysql://app:s3cr3t@db.internal:3306/shop';

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath, '--from', basePath]);

        expect(result).toBe('ok');
        expect(logLines.join('\n')).toContain('ADD COLUMN');
    });
});

describe('DdlMigration (database mode)', () => {
    const EMPTY_SNAPSHOT: SchemaSnapshot = {
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

    test('ERD_DB_URL is used to fetch the database snapshot, and the target label is masked', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));
        process.env.ERD_DB_URL = 'mysql://app:s3cr3t@db.internal:3306/shop';
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue({ resultType: 'fetched', snapshot: EMPTY_SNAPSHOT });

        const result = await CommandRunner.execute(ddlMigration, ['--file', currentPath]);

        expect(result).toBe('ok');
        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://app:s3cr3t@db.internal:3306/shop', { schemaOption: '', designSchemaNames: [] },
            expect.anything(), expect.anything()
        );
        expect(logLines.join('\n')).toContain('db.internal:3306');
        expect(logLines.join('\n')).not.toContain('s3cr3t');
    });

    test('mysql ignores --schema: the fetcher still receives an empty schemaOption, with a warning on stderr', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue({ resultType: 'fetched', snapshot: EMPTY_SNAPSHOT });

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--dsn', 'mysql://user@host/db', '--schema', 'shop']
        );

        expect(result).toBe('ok');
        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://user@host/db', { schemaOption: '', designSchemaNames: [] },
            expect.anything(), expect.anything()
        );
        expect(warnLines.some(line => line.includes('--schema is ignored'))).toBe(true);
    });

    test('a fetch failure returns "error"', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));
        vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue({ resultType: 'failed', message: 'connect ETIMEDOUT' });

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--dsn', 'mysql://user@host/db']
        );

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('connect ETIMEDOUT'))).toBe(true);
    });

    test('an unsupported dialect is rejected before calling the fetcher', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('sqlite', ['id']));
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot');

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--dsn', 'sqlite://whatever']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
    });

    test('a non-numeric --connect-timeout returns "error" without calling the fetcher', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue({ resultType: 'fetched', snapshot: EMPTY_SNAPSHOT });

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--dsn', 'mysql://user@host/db', '--connect-timeout', 'abc']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
        expect(errorLines.some(line => line.includes('--connect-timeout'))).toBe(true);
    });

    test('a --query-timeout of "0" returns "error" without calling the fetcher', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue({ resultType: 'fetched', snapshot: EMPTY_SNAPSHOT });

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--dsn', 'mysql://user@host/db', '--query-timeout', '0']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
        expect(errorLines.some(line => line.includes('--query-timeout'))).toBe(true);
    });

    test('--connect-timeout/--query-timeout are parsed and passed to the fetcher, overriding the defaults', async () => {
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id']));
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot').mockResolvedValue({ resultType: 'fetched', snapshot: EMPTY_SNAPSHOT });

        await CommandRunner.execute(ddlMigration, [
            '--file', currentPath, '--dsn', 'mysql://user@host/db', '--connect-timeout', '5', '--query-timeout', '45'
        ]);

        expect(fetchDatabaseSnapshot).toHaveBeenCalledWith(
            'mysql', 'mysql://user@host/db', expect.anything(), expect.anything(),
            { connectSeconds: 5, querySeconds: 45 }
        );
    });

    test('a --from run never invokes the fetcher, so an invalid --query-timeout only matters for database mode', async () => {
        const basePath = writeDocument('base.erd', buildDocument('mysql', ['id']));
        const currentPath = writeDocument('current.erd', buildDocument('mysql', ['id', 'email']));
        const fetchDatabaseSnapshot = vi.spyOn(DbDriver, 'fetchSnapshot');

        const result = await CommandRunner.execute(
            ddlMigration, ['--file', currentPath, '--from', basePath, '--query-timeout', 'not-a-number']
        );

        expect(result).toBe('error');
        expect(fetchDatabaseSnapshot).not.toHaveBeenCalled();
    });
});
