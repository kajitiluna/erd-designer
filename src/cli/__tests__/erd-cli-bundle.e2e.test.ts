import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

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

// out/cli/erd-cli.cjs は `npm run bundle:cli` の成果物。CommandRunner.execute() を直接呼ぶ既存の単体テストは
// erd-cli.ts の main関数・終了コード変換・esbuildバンドル自体の壊れ・動的ドライバ解決を一度も通さないため、
// 実プロセスとして起動して確認する。
const BUNDLE_PATH = path.resolve(process.cwd(), 'out/cli/erd-cli.cjs');

// CIでは事前に `npm run bundle:cli` を実行してから本テストを走らせる運用のため、ここではバンドル生成は行わない。
// 成果物が無いまま spawnSync すると ENOENT というcrypticな失敗になり、
// テストがサイレントにスキップされたかのように誤解されるため、実行環境チェックとして明確に落とす。
beforeAll(() => {
    if (fs.existsSync(BUNDLE_PATH) === false) {
        throw new Error(
            `out/cli/erd-cli.cjs が見つかりません。先に \`npm run bundle:cli\` を実行してください。 (expected: ${BUNDLE_PATH})`
        );
    }
});

let workDirectory: string;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-cli-bundle-e2e-'));
});

afterEach(() => {
    fs.rmSync(workDirectory, { recursive: true, force: true });
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
        documentName: 'erd-cli-bundle-e2e', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView], columnModels: columns, columnShareModels: shares
    });
};

const writeDocument = (fileName: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

describe('erd-cli bundle (e2e smoke)', () => {
    test('erd-diff exits 0 even when differences are detected, and reports them on stdout', () => {
        const basePath = writeDocument('base.erd', buildDocument(['id']));
        const currentPath = writeDocument('current.erd', buildDocument(['id', 'email']));

        const result = spawnSync(
            process.execPath,
            [BUNDLE_PATH, 'erd-diff', '--file', currentPath, '--from', basePath],
            { encoding: 'utf-8' }
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Added column: `email`');
    });

    test('db-diff exits 2 when the target database refuses the connection', () => {
        const documentPath = writeDocument('db-diff-target.erd', buildDocument(['id']));

        // 127.0.0.1 の未使用ポートは即座に ECONNREFUSED (相当) で落ちるため、
        // ネットワークアクセスが発生してもタイムアウト待ちにはならない。
        // --connect-timeout も併せて短く指定し、万一の環境差でも待ち続けない設計にする。
        const result = spawnSync(
            process.execPath,
            [
                BUNDLE_PATH, 'db-diff',
                '--file', documentPath,
                '--dsn', 'mysql://user:pass@127.0.0.1:59999/nonexistent',
                '--connect-timeout', '2'
            ],
            { encoding: 'utf-8', timeout: 10_000 }
        );

        expect(result.status).toBe(2);
    });

    test('an unknown command exits 2 and prints the usage', () => {
        const result = spawnSync(process.execPath, [BUNDLE_PATH, 'no-such-command'], { encoding: 'utf-8' });

        expect(result.status).toBe(2);
        expect(result.stderr).toContain('Unknown command: no-such-command');
    });
});

// 項目4 (ドライバ未解決時の案内メッセージ) について:
// pg/mysql2 が解決できない状況はこのリポジトリの devDependencies に両方インストールされているため、
// 通常の実行環境では再現できない。db-driver.ts の loadDriverModule を直接検証する既存の単体テストも
// 存在しない (db-driver.test.ts は driverConnectionSupport / maskDsn のみを対象にしている) ため、
// このE2Eファイルでは項目4を割愛する。
