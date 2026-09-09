import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { erdDifference } from '~/cli/commands/erd-diff';
import CommandRunner from '~/cli/command-runner';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableModel from '~/models/database/TableModel';
import ErdDocument from '~/models/ErdDocument';
import TableViewModel from '~/models/TableViewModel';

let workDirectory: string;
let logLines: string[];
let errorLines: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-diff-command-'));
    logLines = [];
    errorLines = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
        logLines.push(String(message));
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
        errorLines.push(String(message));
    });
});

afterEach(() => {
    fs.rmSync(workDirectory, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
});

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (name: string) => {
    const columnType = findDatabaseColumns('mysql').find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${name}`);
    }
    return columnType;
};

// columnNames の各名前で1列ずつ持つ "user" テーブル1枚だけの ErdDocument を作る。
const buildDocument = (columnNames: string[]): ErdDocument => {
    const shares = columnNames.map(name => new ColumnShareModel({
        columnShareModelId: `share-${name}`, physicalName: name, logicalName: name,
        columnType: findColumnType('int')
    }));
    const columns = columnNames.map((name, index) => new SimpleColumnModel({
        columnModelId: `col-${name}`, columnShareModelId: `share-${name}`,
        primaryKey: (index === 0), notNull: true
    }));
    const tableModel = new TableModel({
        tableModelId: 'table-user', physicalName: 'user',
        columnEntries: columnNames.map(name => {
            return { modelType: 'single', columnModelId: `col-${name}` };
        }) as ColumnEntry[]
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'erd-diff-command', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView], columnModels: columns, columnShareModels: shares
    });
};

const writeDocument = (fileName: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

describe('runErdDiff', () => {
    test('an added column is reported with "Added column" wording and returns "ok" even with differences', async () => {
        const basePath = writeDocument('base.erd', buildDocument(['id']));
        const currentPath = writeDocument('current.erd', buildDocument(['id', 'email']));

        const result = await CommandRunner.execute(erdDifference, ['--file', currentPath, '--from', basePath]);

        expect(result).toBe('ok');
        const output = logLines.join('\n');
        expect(output).toContain('Added column: `email`');
    });

    test('identical revisions report no differences and still return "ok"', async () => {
        const path1 = writeDocument('a.erd', buildDocument(['id']));
        const path2 = writeDocument('b.erd', buildDocument(['id']));

        const result = await CommandRunner.execute(erdDifference, ['--file', path1, '--from', path2]);

        expect(result).toBe('ok');
        const output = logLines.join('\n');
        expect(output).toContain('No differences found.');
    });

    test('--format json emits parseable JSON with the differences array', async () => {
        const basePath = writeDocument('base.erd', buildDocument(['id']));
        const currentPath = writeDocument('current.erd', buildDocument(['id', 'email']));

        await CommandRunner.execute(erdDifference, ['--file', currentPath, '--from', basePath, '--format', 'json']);

        const output = logLines.join('\n');
        const parsed = JSON.parse(output);
        expect(parsed.differences).toHaveLength(1);
        expect(parsed.differences[0].category).toBe('column.missing');
    });

    test('missing --file returns "error" without touching the filesystem', async () => {
        const result = await CommandRunner.execute(erdDifference, ['--from', 'whatever.erd']);

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('--file'))).toBe(true);
    });

    test('missing --from returns "error"', async () => {
        const currentPath = writeDocument('current.erd', buildDocument(['id']));

        const result = await CommandRunner.execute(erdDifference, ['--file', currentPath]);

        expect(result).toBe('error');
        expect(errorLines.some(line => line.includes('--from'))).toBe(true);
    });

    test('a --from file that does not exist returns "error"', async () => {
        const currentPath = writeDocument('current.erd', buildDocument(['id']));

        const result = await CommandRunner.execute(erdDifference, ['--file', currentPath, '--from', path.join(workDirectory, 'absent.erd')]);

        expect(result).toBe('error');
    });

    test('an invalid --format value returns "error"', async () => {
        const basePath = writeDocument('base.erd', buildDocument(['id']));
        const currentPath = writeDocument('current.erd', buildDocument(['id']));

        const result = await CommandRunner.execute(erdDifference, ['--file', currentPath, '--from', basePath, '--format', 'xml']);

        expect(result).toBe('error');
    });

    test('--ignore-table excludes a matching table from comparison entirely', async () => {
        const basePath = writeDocument('base.erd', buildDocument(['id']));
        const currentPath = writeDocument('current.erd', buildDocument(['id', 'email']));

        const result = await CommandRunner.execute(erdDifference, [
            '--file', currentPath, '--from', basePath, '--ignore-table', '^user$', '--format', 'json'
        ]);

        expect(result).toBe('ok');
        const output = logLines.join('\n');
        const parsed = JSON.parse(output);
        expect(parsed.differences).toEqual([]);
    });
});
