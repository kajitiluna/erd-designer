import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Connection as MySqlConnectionInstance } from 'mysql2/promise';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import CommandRunner from '~/cli/command-runner';
import { dbDifference } from '~/cli/commands/db-diff';
import { integrationDdl } from '~/cli/commands/__tests__/integration/support/integration-ddl';
import { IntegrationDatabaseTargets } from '~/cli/commands/__tests__/integration/support/integration-database';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import { DatabaseType } from '~/models/database/DatabaseType';
import DbSchemaConfig from '~/models/DbSchemaConfig';
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

/**
 * db-diff の MySQL/MariaDB 向け実DB統合テスト(一致ケース・単発の差分検出・バージョン依存の正規化)。
 * 24差分カテゴリの網羅は mysql-categories.integration.test.ts 側の責務であり、ここでは扱わない。
 */
const mysqlFamilyTargets = IntegrationDatabaseTargets.selected()
    .filter(target => (target.databaseType === 'mysql') || (target.databaseType === 'mariadb'));

const TEST_COLORS = {
    background: new ColorValue({ red: 255, green: 255, blue: 255 }),
    foreground: new ColorValue({ red: 0, green: 0, blue: 0 })
};

const findColumnType = (name: string, databaseType: DatabaseType): ColumnType => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => (candidate.name === name));
    if (columnType == null) {
        throw new Error(`column type not found: ${databaseType}/${name}`);
    }

    return columnType;
};

const writeErdDocument = (workDirectory: string, fileName: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));

    return filePath;
};

type DbDiffRunResult = { result: string, differences: SchemaDifference[] };

describe.each(mysqlFamilyTargets)('db-diff mysql/mariadb match ($id)', target => {
    const adminDsn = IntegrationDatabaseTargets.resolveDsn(target);

    let workDirectory: string;
    let logLines: string[];
    let logSpy: ReturnType<typeof vi.spyOn>;
    let databaseName: string;
    let databaseDsn: string;
    let connection: MySqlConnectionInstance;

    beforeEach(async () => {
        workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-match-'));
        logLines = [];
        logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
            logLines.push(String(message));
        });

        databaseName = integrationDdl.uniqueName('test_db');
        await integrationDdl.mysql.createDatabase(adminDsn, databaseName);
        databaseDsn = integrationDdl.mysql.toDatabaseDsn(adminDsn, databaseName);
        connection = await integrationDdl.mysql.connect(databaseDsn);
    });

    afterEach(async () => {
        await connection.end();
        await integrationDdl.mysql.dropDatabase(adminDsn, databaseName);
        fs.rmSync(workDirectory, { recursive: true, force: true });
        logSpy.mockRestore();
    });

    // db-diff 実行は1回で console.log を1回だけ呼ぶため、直前までのログを捨ててから実行する。
    const runDbDiff = async (erdDocument: ErdDocument): Promise<DbDiffRunResult> => {
        const erdPath = writeErdDocument(workDirectory, 'design.erd', erdDocument);
        logLines.length = 0;

        const result = await CommandRunner.execute(dbDifference, [
            '--file', erdPath, '--dsn', databaseDsn, '--format', 'json'
        ]);

        const report = JSON.parse(logLines.join('\n')) as { differences: SchemaDifference[] };
        return { result, differences: report.differences };
    };

    test('a design covering PK/NOT NULL/nullable/default/index/UNIQUE/FK/comments matches the real schema', async () => {
        const databaseType = target.databaseType;

        const shareShopId = new ColumnShareModel({
            columnShareModelId: 'share-shop-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int', databaseType)
        });
        const shareShopName = new ColumnShareModel({
            columnShareModelId: 'share-shop-name', physicalName: 'name', logicalName: 'name',
            columnType: findColumnType('varchar (m)', databaseType), precision: '100'
        });
        const shareShopEmail = new ColumnShareModel({
            columnShareModelId: 'share-shop-email', physicalName: 'email', logicalName: 'email',
            columnType: findColumnType('varchar (m)', databaseType), precision: '100'
        });
        const shareShopStatus = new ColumnShareModel({
            columnShareModelId: 'share-shop-status', physicalName: 'status', logicalName: 'Status',
            columnType: findColumnType('varchar (m)', databaseType), precision: '20'
        });
        const shareItemId = new ColumnShareModel({
            columnShareModelId: 'share-item-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int', databaseType)
        });
        const shareItemShopId = new ColumnShareModel({
            columnShareModelId: 'share-item-shop-id', physicalName: 'shop_id', logicalName: 'shop_id',
            columnType: findColumnType('int', databaseType)
        });
        const shareItemQuantity = new ColumnShareModel({
            columnShareModelId: 'share-item-quantity', physicalName: 'quantity', logicalName: 'quantity',
            columnType: findColumnType('int', databaseType)
        });

        const columnShopId = new SimpleColumnModel({
            columnModelId: 'col-shop-id', columnShareModelId: 'share-shop-id',
            primaryKey: true, notNull: true, autoIncrement: true
        });
        const columnShopName = new SimpleColumnModel({
            columnModelId: 'col-shop-name', columnShareModelId: 'share-shop-name', notNull: true
        });
        const columnShopEmail = new SimpleColumnModel({
            columnModelId: 'col-shop-email', columnShareModelId: 'share-shop-email', notNull: false
        });
        const columnShopStatus = new SimpleColumnModel({
            columnModelId: 'col-shop-status', columnShareModelId: 'share-shop-status',
            notNull: true, defaultValue: 'active'
        });
        const columnItemId = new SimpleColumnModel({
            columnModelId: 'col-item-id', columnShareModelId: 'share-item-id',
            primaryKey: true, notNull: true, autoIncrement: true
        });
        const columnItemShopId = new SimpleColumnModel({
            columnModelId: 'col-item-shop-id', columnShareModelId: 'share-item-shop-id', notNull: true
        });
        const columnItemQuantity = new SimpleColumnModel({
            columnModelId: 'col-item-quantity', columnShareModelId: 'share-item-quantity',
            notNull: true, defaultValue: '0'
        });

        const shopTableModel = new TableModel({
            tableModelId: 'table-shop', physicalName: 'shop', logicalName: 'Shop',
            columnEntries: ['col-shop-id', 'col-shop-name', 'col-shop-email', 'col-shop-status']
                .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[],
            tableIndexModels: [
                new TableIndexModel({
                    tableIndexModelId: 'idx-shop-name', physicalName: 'idx_shop_name',
                    indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-shop-name' })]
                })
            ],
            uniqueKeysModels: [
                new TableUniqueKeysModel({
                    tableUniqueKeysModelId: 'uk-shop-email', physicalName: 'uk_shop_email',
                    uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: 'col-shop-email', sortOrderType: '' })]
                })
            ]
        });
        const itemTableModel = new TableModel({
            tableModelId: 'table-item', physicalName: 'item', logicalName: 'Item',
            columnEntries: ['col-item-id', 'col-item-shop-id', 'col-item-quantity']
                .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[],
            tableIndexModels: [
                new TableIndexModel({
                    tableIndexModelId: 'idx-item-shop-id', physicalName: 'idx_item_shop_id',
                    indexColumnModels: [new IndexColumnModel({ columnModelId: 'col-item-shop-id' })]
                })
            ]
        });

        const shopTableView = new TableViewModel({ tableModel: shopTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
        const itemTableView = new TableViewModel({ tableModel: itemTableModel, corner: { top: 0, left: 400 }, headerColor: TEST_COLORS });

        const relationModel = new RelationModel({
            relationModelId: 'rel-item-shop', parentTableModelId: 'table-shop', childTableModelId: 'table-item',
            relationPairs: [new RelationPair({ parentColumnModelId: 'col-shop-id', childColumnModelId: 'col-item-shop-id' })],
            onUpdateAction: 'CASCADE', onDeleteAction: 'CASCADE'
        });
        const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });

        const erdDocument = ErdDocument.create({
            documentName: 'mysql-match-fixture', databaseSettingModel: DatabaseSettingModel.create(databaseType),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [shopTableView, itemTableView],
            columnModels: [columnShopId, columnShopName, columnShopEmail, columnShopStatus,
                columnItemId, columnItemShopId, columnItemQuantity],
            columnShareModels: [shareShopId, shareShopName, shareShopEmail, shareShopStatus,
                shareItemId, shareItemShopId, shareItemQuantity],
            relationViewModels: [relationView]
        });

        await integrationDdl.mysql.execute(connection, [
            `CREATE TABLE shop (
                id INT NOT NULL AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'Status',
                PRIMARY KEY (id),
                UNIQUE KEY uk_shop_email (email),
                INDEX idx_shop_name (name)
            ) ENGINE=InnoDB COMMENT='Shop'`,
            `CREATE TABLE item (
                id INT NOT NULL AUTO_INCREMENT,
                shop_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 0,
                PRIMARY KEY (id),
                INDEX idx_item_shop_id (shop_id),
                CONSTRAINT fk_item_shop FOREIGN KEY (shop_id) REFERENCES shop (id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB COMMENT='Item'`
        ]);

        const run = await runDbDiff(erdDocument);

        expect(run.differences).toEqual([]);
        expect(run.result).toBe('ok');
    });

    test('a design-only column is detected as column.missing', async () => {
        const databaseType = target.databaseType;

        const shareId = new ColumnShareModel({
            columnShareModelId: 'share-widget-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int', databaseType)
        });
        const shareName = new ColumnShareModel({
            columnShareModelId: 'share-widget-name', physicalName: 'name', logicalName: 'name',
            columnType: findColumnType('varchar (m)', databaseType), precision: '50'
        });
        const shareNote = new ColumnShareModel({
            columnShareModelId: 'share-widget-note', physicalName: 'note', logicalName: 'note',
            columnType: findColumnType('varchar (m)', databaseType), precision: '50'
        });

        const columnId = new SimpleColumnModel({
            columnModelId: 'col-widget-id', columnShareModelId: 'share-widget-id',
            primaryKey: true, notNull: true, autoIncrement: true
        });
        const columnName = new SimpleColumnModel({
            columnModelId: 'col-widget-name', columnShareModelId: 'share-widget-name', notNull: true
        });
        const columnNote = new SimpleColumnModel({
            columnModelId: 'col-widget-note', columnShareModelId: 'share-widget-note', notNull: false
        });

        const tableModel = new TableModel({
            tableModelId: 'table-widget', physicalName: 'widget',
            columnEntries: ['col-widget-id', 'col-widget-name', 'col-widget-note']
                .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[]
        });
        const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

        const erdDocument = ErdDocument.create({
            documentName: 'mysql-column-missing', databaseSettingModel: DatabaseSettingModel.create(databaseType),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [tableView],
            columnModels: [columnId, columnName, columnNote],
            columnShareModels: [shareId, shareName, shareNote]
        });

        await integrationDdl.mysql.execute(connection, [
            `CREATE TABLE widget (
                id INT NOT NULL AUTO_INCREMENT,
                name VARCHAR(50) NOT NULL,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB`
        ]);

        const run = await runDbDiff(erdDocument);

        expect(run.result).toBe('detected');
        expect(run.differences).toHaveLength(1);
        expect(run.differences[0]).toMatchObject({ category: 'column.missing', tableName: 'widget', targetName: 'note' });
    });

    test('INT(11) display width is discarded and matches a design without a display width', async () => {
        const databaseType = target.databaseType;

        const shareId = new ColumnShareModel({
            columnShareModelId: 'share-numbers-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int', databaseType)
        });
        const shareValue = new ColumnShareModel({
            columnShareModelId: 'share-numbers-value', physicalName: 'value', logicalName: 'value',
            columnType: findColumnType('int', databaseType)
        });

        const columnId = new SimpleColumnModel({
            columnModelId: 'col-numbers-id', columnShareModelId: 'share-numbers-id',
            primaryKey: true, notNull: true, autoIncrement: true
        });
        const columnValue = new SimpleColumnModel({
            columnModelId: 'col-numbers-value', columnShareModelId: 'share-numbers-value', notNull: true
        });

        const tableModel = new TableModel({
            tableModelId: 'table-numbers', physicalName: 'numbers',
            columnEntries: ['col-numbers-id', 'col-numbers-value']
                .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[]
        });
        const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

        const erdDocument = ErdDocument.create({
            documentName: 'mysql-int-display-width', databaseSettingModel: DatabaseSettingModel.create(databaseType),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [tableView],
            columnModels: [columnId, columnValue],
            columnShareModels: [shareId, shareValue]
        });

        await integrationDdl.mysql.execute(connection, [
            `CREATE TABLE numbers (
                id INT NOT NULL AUTO_INCREMENT,
                value INT(11) NOT NULL,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB`
        ]);

        const run = await runDbDiff(erdDocument);

        expect(run.differences).toEqual([]);
        expect(run.result).toBe('ok');
    });

    test('TIMESTAMP ... DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP is preserved', async () => {
        const databaseType = target.databaseType;

        const shareId = new ColumnShareModel({
            columnShareModelId: 'share-events-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int', databaseType)
        });
        const shareUpdatedAt = new ColumnShareModel({
            columnShareModelId: 'share-events-updated-at', physicalName: 'updated_at', logicalName: 'updated_at',
            columnType: findColumnType('timestamp', databaseType)
        });

        const columnId = new SimpleColumnModel({
            columnModelId: 'col-events-id', columnShareModelId: 'share-events-id',
            primaryKey: true, notNull: true, autoIncrement: true
        });
        const columnUpdatedAt = new SimpleColumnModel({
            columnModelId: 'col-events-updated-at', columnShareModelId: 'share-events-updated-at',
            notNull: true, defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        });

        const tableModel = new TableModel({
            tableModelId: 'table-events', physicalName: 'events',
            columnEntries: ['col-events-id', 'col-events-updated-at']
                .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[]
        });
        const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

        const erdDocument = ErdDocument.create({
            documentName: 'mysql-on-update-current-timestamp', databaseSettingModel: DatabaseSettingModel.create(databaseType),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [tableView],
            columnModels: [columnId, columnUpdatedAt],
            columnShareModels: [shareId, shareUpdatedAt]
        });

        await integrationDdl.mysql.execute(connection, [
            `CREATE TABLE events (
                id INT NOT NULL AUTO_INCREMENT,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB`
        ]);

        const run = await runDbDiff(erdDocument);

        expect(run.differences).toEqual([]);
        expect(run.result).toBe('ok');
    });

    test('TINYINT(1) matches a design boolean column', async () => {
        const databaseType = target.databaseType;

        const shareId = new ColumnShareModel({
            columnShareModelId: 'share-flags-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int', databaseType)
        });
        const shareIsActive = new ColumnShareModel({
            columnShareModelId: 'share-flags-is-active', physicalName: 'is_active', logicalName: 'is_active',
            columnType: findColumnType('boolean', databaseType)
        });

        const columnId = new SimpleColumnModel({
            columnModelId: 'col-flags-id', columnShareModelId: 'share-flags-id',
            primaryKey: true, notNull: true, autoIncrement: true
        });
        const columnIsActive = new SimpleColumnModel({
            columnModelId: 'col-flags-is-active', columnShareModelId: 'share-flags-is-active', notNull: true
        });

        const tableModel = new TableModel({
            tableModelId: 'table-flags', physicalName: 'flags',
            columnEntries: ['col-flags-id', 'col-flags-is-active']
                .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[]
        });
        const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

        const erdDocument = ErdDocument.create({
            documentName: 'mysql-tinyint1-boolean', databaseSettingModel: DatabaseSettingModel.create(databaseType),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [tableView],
            columnModels: [columnId, columnIsActive],
            columnShareModels: [shareId, shareIsActive]
        });

        await integrationDdl.mysql.execute(connection, [
            `CREATE TABLE flags (
                id INT NOT NULL AUTO_INCREMENT,
                is_active TINYINT(1) NOT NULL,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB`
        ]);

        const run = await runDbDiff(erdDocument);

        expect(run.differences).toEqual([]);
        expect(run.result).toBe('ok');
    });
});
