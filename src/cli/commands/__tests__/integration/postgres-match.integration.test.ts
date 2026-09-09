// db-diff の PostgreSQL 向け実DB統合テスト(一致・検出・バージョン依存の観点)。
// docker-compose.yml の postgres1x サービスに実接続し、DDL を投入した実DBと .erd の設計を db-diff で比較する。
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { dbDifference } from '~/cli/commands/db-diff';
import CommandRunner from '~/cli/command-runner';
import { SchemaCommandResult } from '~/cli/commands/schema-command';
import { integrationDdl } from '~/cli/commands/__tests__/integration/support/integration-ddl';
import { IntegrationDatabaseTargets } from '~/cli/commands/__tests__/integration/support/integration-database';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import DbSchemaModel from '~/models/database/DbSchemaModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import ColumnType from '~/models/database/ColumnType';
import { findDatabaseColumns } from '~/models/database/columns';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import ErdDocument from '~/models/ErdDocument';
import LineViewModel from '~/models/LineViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import { SchemaDifference } from '~/models/schema/schema-difference';
import TableViewModel from '~/models/TableViewModel';

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (name: string): ColumnType => {
    const columnType = findDatabaseColumns('postgres').find(candidate => (candidate.name === name));
    if (columnType == null) {
        throw new Error(`column type not found: postgres/${name}`);
    }
    return columnType;
};

const toSingleColumnEntries = (columnModelIds: readonly string[]): ColumnEntry[] => {
    return columnModelIds.map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; });
};

type SchemaSetup = { schemaConfig: DbSchemaConfig, schemaId: string };

// テーブルを1つのスキーマだけに割り当てる、この試験ファイル共通の schemaConfig 構築。
const buildSingleSchemaConfig = (schemaName: string): SchemaSetup => {
    const schema = DbSchemaModel.create(schemaName, '');
    const schemaConfig = DbSchemaConfig.create({ defaultSchemaId: schema.schemaId, schemas: [schema] });

    return { schemaConfig, schemaId: schema.schemaId };
};

const writeErdDocument = (workDirectory: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, 'design.erd');
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

type DbDiffRunResult = { result: SchemaCommandResult, report: { differences: SchemaDifference[] } };

// console.log を実行のたびに個別のスパイで捕捉するため、テスト間で状態を共有しない。
const runDbDiff = async (workDirectory: string, erdDocument: ErdDocument, dsn: string): Promise<DbDiffRunResult> => {
    const erdPath = writeErdDocument(workDirectory, erdDocument);
    const capturedLines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => { capturedLines.push(String(message)); });

    try {
        const result = await CommandRunner.execute(dbDifference, ['--file', erdPath, '--dsn', dsn, '--format', 'json']);
        const report = JSON.parse(capturedLines.join('\n')) as { differences: SchemaDifference[] };

        return { result, report };
    } finally {
        logSpy.mockRestore();
    }
};

// --- Fixture 1: PK(SERIAL)/NOT NULL/NULL許容/デフォルト値/通常インデックス/UNIQUE/FK(2テーブル)/
//     テーブルコメント/列コメントを一通り含む、差分ゼロの一致ケース。 ---
const buildComprehensiveMatchDocument = (schemaName: string): ErdDocument => {
    const { schemaConfig, schemaId } = buildSingleSchemaConfig(schemaName);

    const shopIdShare = new ColumnShareModel({
        columnShareModelId: 'share-shop-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('serial')
    });
    const shopNameShare = new ColumnShareModel({
        columnShareModelId: 'share-shop-name', physicalName: 'name', logicalName: 'name', columnType: findColumnType('varchar')
    });
    const shopDescriptionShare = new ColumnShareModel({
        columnShareModelId: 'share-shop-description', physicalName: 'description', logicalName: 'explanation',
        columnType: findColumnType('text')
    });
    const shopStatusShare = new ColumnShareModel({
        columnShareModelId: 'share-shop-status', physicalName: 'status', logicalName: 'status',
        columnType: findColumnType('varchar')
    });
    const itemIdShare = new ColumnShareModel({
        columnShareModelId: 'share-item-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('serial')
    });
    const itemShopIdShare = new ColumnShareModel({
        columnShareModelId: 'share-item-shop-id', physicalName: 'shop_id', logicalName: 'shop_id',
        columnType: findColumnType('integer')
    });
    const itemNameShare = new ColumnShareModel({
        columnShareModelId: 'share-item-name', physicalName: 'name', logicalName: 'name', columnType: findColumnType('varchar')
    });

    const shopIdColumn = new SimpleColumnModel({
        columnModelId: 'col-shop-id', columnShareModelId: shopIdShare.columnShareModelId, primaryKey: true, notNull: true
    });
    const shopNameColumn = new SimpleColumnModel({
        columnModelId: 'col-shop-name', columnShareModelId: shopNameShare.columnShareModelId, notNull: true
    });
    const shopDescriptionColumn = new SimpleColumnModel({
        columnModelId: 'col-shop-description', columnShareModelId: shopDescriptionShare.columnShareModelId
    });
    const shopStatusColumn = new SimpleColumnModel({
        columnModelId: 'col-shop-status', columnShareModelId: shopStatusShare.columnShareModelId,
        notNull: true, defaultValue: 'active'
    });
    const itemIdColumn = new SimpleColumnModel({
        columnModelId: 'col-item-id', columnShareModelId: itemIdShare.columnShareModelId, primaryKey: true, notNull: true
    });
    const itemShopIdColumn = new SimpleColumnModel({
        columnModelId: 'col-item-shop-id', columnShareModelId: itemShopIdShare.columnShareModelId, notNull: true
    });
    const itemNameColumn = new SimpleColumnModel({
        columnModelId: 'col-item-name', columnShareModelId: itemNameShare.columnShareModelId, notNull: true
    });

    const shopUniqueKey = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uk-shop-name', physicalName: 'uk_shop_name',
        uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: shopNameColumn.columnModelId, sortOrderType: '' })]
    });
    const shopStatusIndex = new TableIndexModel({
        tableIndexModelId: 'idx-shop-status', physicalName: 'idx_shop_status',
        indexColumnModels: [new IndexColumnModel({ columnModelId: shopStatusColumn.columnModelId })]
    });

    const shopTable = new TableModel({
        tableModelId: 'table-shop', physicalName: 'shop', logicalName: 'Shops master', schemaId,
        columnEntries: toSingleColumnEntries([
            shopIdColumn.columnModelId, shopNameColumn.columnModelId,
            shopDescriptionColumn.columnModelId, shopStatusColumn.columnModelId
        ]),
        uniqueKeysModels: [shopUniqueKey], tableIndexModels: [shopStatusIndex]
    });
    const itemTable = new TableModel({
        tableModelId: 'table-item', physicalName: 'item', schemaId,
        columnEntries: toSingleColumnEntries([
            itemIdColumn.columnModelId, itemShopIdColumn.columnModelId, itemNameColumn.columnModelId
        ])
    });

    const shopView = new TableViewModel({ tableModel: shopTable, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    const itemView = new TableViewModel({ tableModel: itemTable, corner: { top: 0, left: 300 }, headerColor: TEST_COLORS });

    const relationModel = new RelationModel({
        relationModelId: 'rel-item-shop', parentTableModelId: shopTable.tableModelId, childTableModelId: itemTable.tableModelId,
        onUpdateAction: 'NO ACTION', onDeleteAction: 'NO ACTION',
        relationPairs: [new RelationPair({
            parentColumnModelId: shopIdColumn.columnModelId, childColumnModelId: itemShopIdColumn.columnModelId
        })]
    });
    const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });

    return ErdDocument.create({
        documentName: 'pg-match-ok', databaseSettingModel: DatabaseSettingModel.create('postgres'), schemaConfig,
        tableViewModels: [shopView, itemView],
        columnModels: [
            shopIdColumn, shopNameColumn, shopDescriptionColumn, shopStatusColumn,
            itemIdColumn, itemShopIdColumn, itemNameColumn
        ],
        columnShareModels: [
            shopIdShare, shopNameShare, shopDescriptionShare, shopStatusShare,
            itemIdShare, itemShopIdShare, itemNameShare
        ],
        relationViewModels: [relationView]
    });
};

const buildComprehensiveMatchDdl = (schemaName: string): readonly string[] => [
    `CREATE TABLE ${schemaName}.shop (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        description TEXT,
        status VARCHAR NOT NULL DEFAULT 'active',
        CONSTRAINT uk_shop_name UNIQUE (name)
    )`,
    `CREATE INDEX idx_shop_status ON ${schemaName}.shop (status)`,
    `COMMENT ON TABLE ${schemaName}.shop IS 'Shops master'`,
    `COMMENT ON COLUMN ${schemaName}.shop.description IS 'explanation'`,
    `CREATE TABLE ${schemaName}.item (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER NOT NULL REFERENCES ${schemaName}.shop (id),
        name VARCHAR NOT NULL
    )`
];

// --- Fixture 2: .erd 側だけの余分な列 → column.missing ---
const buildExtraDesignColumnDocument = (schemaName: string): ErdDocument => {
    const { schemaConfig, schemaId } = buildSingleSchemaConfig(schemaName);

    const idShare = new ColumnShareModel({
        columnShareModelId: 'share-widget-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('serial')
    });
    const nameShare = new ColumnShareModel({
        columnShareModelId: 'share-widget-name', physicalName: 'name', logicalName: 'name', columnType: findColumnType('varchar')
    });
    const noteShare = new ColumnShareModel({
        columnShareModelId: 'share-widget-note', physicalName: 'note', logicalName: 'note', columnType: findColumnType('varchar')
    });

    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-widget-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
    });
    const nameColumn = new SimpleColumnModel({
        columnModelId: 'col-widget-name', columnShareModelId: nameShare.columnShareModelId, notNull: true
    });
    const noteColumn = new SimpleColumnModel({
        columnModelId: 'col-widget-note', columnShareModelId: noteShare.columnShareModelId, notNull: true
    });

    const tableModel = new TableModel({
        tableModelId: 'table-widget', physicalName: 'widget', schemaId,
        columnEntries: toSingleColumnEntries([idColumn.columnModelId, nameColumn.columnModelId, noteColumn.columnModelId])
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'pg-match-extra-column', databaseSettingModel: DatabaseSettingModel.create('postgres'), schemaConfig,
        tableViewModels: [tableView], columnModels: [idColumn, nameColumn, noteColumn],
        columnShareModels: [idShare, nameShare, noteShare]
    });
};

const buildExtraDesignColumnDdl = (schemaName: string): readonly string[] => [
    `CREATE TABLE ${schemaName}.widget (id SERIAL PRIMARY KEY, name VARCHAR NOT NULL)`
];

// --- Fixture 3: スキーマ未宣言の .erd(既定スキーマ)が実際の public スキーマのテーブルと一致 ---
const buildDefaultSchemaDocument = (tableName: string): ErdDocument => {
    const idShare = new ColumnShareModel({
        columnShareModelId: 'share-public-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('serial')
    });
    const nameShare = new ColumnShareModel({
        columnShareModelId: 'share-public-name', physicalName: 'name', logicalName: 'name', columnType: findColumnType('varchar')
    });

    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-public-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
    });
    const nameColumn = new SimpleColumnModel({
        columnModelId: 'col-public-name', columnShareModelId: nameShare.columnShareModelId, notNull: true
    });

    // schemaId を割り当てない: database.defaultSchemaName("public")へ既定でフォールバックする経路を検証する。
    const tableModel = new TableModel({
        tableModelId: 'table-public', physicalName: tableName,
        columnEntries: toSingleColumnEntries([idColumn.columnModelId, nameColumn.columnModelId])
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'pg-match-default-schema', databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView], columnModels: [idColumn, nameColumn], columnShareModels: [idShare, nameShare]
    });
};

const buildDefaultSchemaDdl = (tableName: string): readonly string[] => [
    `CREATE TABLE public.${tableName} (id SERIAL PRIMARY KEY, name VARCHAR NOT NULL)`
];

// --- Fixture 4: INTEGER[] 配列型カラムが isArray: true の設計列と一致 ---
const buildArrayColumnDocument = (schemaName: string): ErdDocument => {
    const { schemaConfig, schemaId } = buildSingleSchemaConfig(schemaName);

    const idShare = new ColumnShareModel({
        columnShareModelId: 'share-tagged-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('serial')
    });
    const tagsShare = new ColumnShareModel({
        columnShareModelId: 'share-tagged-tags', physicalName: 'tags', logicalName: 'tags',
        columnType: findColumnType('integer'), isArray: true
    });

    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-tagged-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
    });
    const tagsColumn = new SimpleColumnModel({
        columnModelId: 'col-tagged-tags', columnShareModelId: tagsShare.columnShareModelId, notNull: true
    });

    const tableModel = new TableModel({
        tableModelId: 'table-tagged', physicalName: 'tagged_item', schemaId,
        columnEntries: toSingleColumnEntries([idColumn.columnModelId, tagsColumn.columnModelId])
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'pg-match-array-column', databaseSettingModel: DatabaseSettingModel.create('postgres'), schemaConfig,
        tableViewModels: [tableView], columnModels: [idColumn, tagsColumn], columnShareModels: [idShare, tagsShare]
    });
};

const buildArrayColumnDdl = (schemaName: string): readonly string[] => [
    `CREATE TABLE ${schemaName}.tagged_item (id SERIAL PRIMARY KEY, tags INTEGER[] NOT NULL)`
];

// --- Fixture 5: SERIAL PRIMARY KEY が設計側 serial 型カラムと一致(autoIncrement判定) ---
const buildSerialPrimaryKeyDocument = (schemaName: string): ErdDocument => {
    const { schemaConfig, schemaId } = buildSingleSchemaConfig(schemaName);

    const idShare = new ColumnShareModel({
        columnShareModelId: 'share-auto-id', physicalName: 'id', logicalName: 'id', columnType: findColumnType('serial')
    });
    const idColumn = new SimpleColumnModel({
        columnModelId: 'col-auto-id', columnShareModelId: idShare.columnShareModelId, primaryKey: true, notNull: true
    });

    const tableModel = new TableModel({
        tableModelId: 'table-auto', physicalName: 'auto_item', schemaId,
        columnEntries: toSingleColumnEntries([idColumn.columnModelId])
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'pg-match-serial-pk', databaseSettingModel: DatabaseSettingModel.create('postgres'), schemaConfig,
        tableViewModels: [tableView], columnModels: [idColumn], columnShareModels: [idShare]
    });
};

const buildSerialPrimaryKeyDdl = (schemaName: string): readonly string[] => [
    `CREATE TABLE ${schemaName}.auto_item (id SERIAL PRIMARY KEY)`
];

const postgresTargets = IntegrationDatabaseTargets.selected().filter(target => (target.databaseType === 'postgres'));

describe.each(postgresTargets)('db-diff postgres match ($id)', target => {
    let workDirectory: string;
    let client: Client;
    let schemaName: string;
    let dsn: string;

    beforeEach(async () => {
        workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-match-'));
        dsn = IntegrationDatabaseTargets.resolveDsn(target);
        // PostgreSQL は "pg_" で始まるスキーマ名の作成を予約済みとして拒否するため、接頭辞に pg_ を使わない。
        schemaName = integrationDdl.uniqueName('match');
        client = await integrationDdl.postgres.connect(dsn);
        await integrationDdl.postgres.createSchema(client, schemaName);
    });

    afterEach(async () => {
        await integrationDdl.postgres.dropSchema(client, schemaName);
        await client.end();
        fs.rmSync(workDirectory, { recursive: true, force: true });
    });

    test('a comprehensive matching schema reports ok with no differences', async () => {
        await integrationDdl.postgres.execute(client, buildComprehensiveMatchDdl(schemaName));
        const erdDocument = buildComprehensiveMatchDocument(schemaName);

        const { result, report } = await runDbDiff(workDirectory, erdDocument, dsn);

        expect(result).toBe('ok');
        expect(report.differences).toEqual([]);
    });

    test('a design-only extra column is detected as column.missing', async () => {
        await integrationDdl.postgres.execute(client, buildExtraDesignColumnDdl(schemaName));
        const erdDocument = buildExtraDesignColumnDocument(schemaName);

        const { result, report } = await runDbDiff(workDirectory, erdDocument, dsn);

        expect(result).toBe('detected');
        expect(report.differences).toContainEqual(
            expect.objectContaining({ category: 'column.missing', tableName: 'widget', targetName: 'note' })
        );
    });

    test('an .erd with no declared schema matches a table created in the public schema', async () => {
        const tableName = integrationDdl.uniqueName('match_public');

        try {
            await integrationDdl.postgres.execute(client, buildDefaultSchemaDdl(tableName));
            const erdDocument = buildDefaultSchemaDocument(tableName);

            const { result, report } = await runDbDiff(workDirectory, erdDocument, dsn);

            expect(result).toBe('ok');
            expect(report.differences).toEqual([]);
        } finally {
            await integrationDdl.postgres.execute(client, [`DROP TABLE IF EXISTS public.${tableName}`]);
        }
    });

    test('an INTEGER[] array column matches a design column with isArray: true', async () => {
        await integrationDdl.postgres.execute(client, buildArrayColumnDdl(schemaName));
        const erdDocument = buildArrayColumnDocument(schemaName);

        const { result, report } = await runDbDiff(workDirectory, erdDocument, dsn);

        expect(result).toBe('ok');
        expect(report.differences).toEqual([]);
    });

    test('a SERIAL PRIMARY KEY matches a design column typed as serial (autoIncrement)', async () => {
        await integrationDdl.postgres.execute(client, buildSerialPrimaryKeyDdl(schemaName));
        const erdDocument = buildSerialPrimaryKeyDocument(schemaName);

        const { result, report } = await runDbDiff(workDirectory, erdDocument, dsn);

        expect(result).toBe('ok');
        expect(report.differences).toEqual([]);
    });
});
