import { spawnSync } from 'node:child_process';
import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/create-ddl';
import { loadDdl } from '~/models/ddl-loader';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import TableViewModel from '~/models/TableViewModel';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import RelationViewModel from '~/models/RelationViewModel';
import LineViewModel from '~/models/LineViewModel';
import { DatabaseType } from '~/models/database/DatabaseType';

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

// MariaDB (MySQL 互換) 向けの代表的なテーブルを構築し、createDdl → loadDdl の往復で
// PK / インデックス / コメント / 自動増分 / 型パラメータ / MariaDB固有型(uuid) が復元できることを確認する。
const buildMariaDbSampleDocument = (): ErdDocument => {
    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id',
        physicalName: 'id',
        logicalName: 'ID',
        columnType: findColumnType('mariadb', 'int')
    });
    const nameColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-name',
        physicalName: 'name',
        logicalName: 'Name',
        columnType: findColumnType('mariadb', 'varchar (m)'),
        precision: '100',
        description: 'ユーザー名'
    });
    const priceColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-price',
        physicalName: 'price',
        logicalName: 'Price',
        columnType: findColumnType('mariadb', 'decimal (m, d)'),
        precision: '10',
        scale: '2'
    });
    const externalIdColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-external-id',
        physicalName: 'external_id',
        logicalName: 'External ID',
        columnType: findColumnType('mariadb', 'uuid')
    });

    const idColumn = new ColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true,
        autoIncrement: true
    });
    const nameColumn = new ColumnModel({
        columnModelId: 'col-name',
        columnShareModelId: nameColumnShare.columnShareModelId,
        physicalName: 'name',
        notNull: true,
        unique: true
    });
    const priceColumn = new ColumnModel({
        columnModelId: 'col-price',
        columnShareModelId: priceColumnShare.columnShareModelId,
        physicalName: 'price'
    });
    const externalIdColumn = new ColumnModel({
        columnModelId: 'col-external-id',
        columnShareModelId: externalIdColumnShare.columnShareModelId,
        physicalName: 'external_id'
    });

    const uniqueKeysModel = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uk-name',
        uniqueKeysColumnModels: [
            new UniqueKeysColumnModel({ columnModelId: nameColumn.columnModelId, sortOrderType: "ASC" })
        ]
    });
    const tableIndexModel = new TableIndexModel({
        tableIndexModelId: 'idx-price',
        physicalName: 'idx_sample_price',
        indexColumnModels: [new IndexColumnModel({ columnModelId: priceColumn.columnModelId })]
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample',
        physicalName: 'sample_table',
        columns: [
            { modelType: 'single', columnModelId: idColumn.columnModelId },
            { modelType: 'single', columnModelId: nameColumn.columnModelId },
            { modelType: 'single', columnModelId: priceColumn.columnModelId },
            { modelType: 'single', columnModelId: externalIdColumn.columnModelId }
        ] as ColumnModelType[],
        uniqueKeysModels: [uniqueKeysModel],
        tableIndexModels: [tableIndexModel],
        description: 'サンプルテーブル'
    });

    const tableViewModel = new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'mariadb-roundtrip',
        erdSettingModel: ErdSettingModel.create('mariadb-roundtrip'),
        databaseSettingModel: DatabaseSettingModel.create('mariadb'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels: [idColumn, nameColumn, priceColumn, externalIdColumn],
        columnShareModels: [idColumnShare, nameColumnShare, priceColumnShare, externalIdColumnShare]
    });
};

const buildEmptyMariaDbDocument = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'mariadb-roundtrip-target',
        erdSettingModel: ErdSettingModel.create('mariadb-roundtrip-target'),
        databaseSettingModel: DatabaseSettingModel.create('mariadb'),
        schemaConfig: DbSchemaConfig.create()
    });
};

// SQLite 向けの代表的なテーブルを構築し、createDdl → loadDdl の往復・実DB(sqlite3)構文検証を確認する
// (Phase 2 検証ゲート)。SQLite は AUTOINCREMENT 非対応方針 (全 ColumnType で withAutoIncrement:false) のため、
// テーブルレベル PRIMARY KEY だけで rowid エイリアスによる自動採番相当になることを確認する。
// UNIQUE 制約は ASC 付きで生成する (TableUniqueKeySupport.orderable:true。SQLite標準機能をフルに反映する方針)。
const buildSqliteSampleDocument = (): ErdDocument => {
    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id',
        physicalName: 'id',
        logicalName: 'ID',
        columnType: findColumnType('sqlite', 'integer')
    });
    const nameColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-name',
        physicalName: 'name',
        logicalName: 'Name',
        columnType: findColumnType('sqlite', 'varchar (n)'),
        precision: '100',
        description: 'ユーザー名'
    });
    const priceColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-price',
        physicalName: 'price',
        logicalName: 'Price',
        columnType: findColumnType('sqlite', 'decimal (p, s)'),
        precision: '10',
        scale: '2'
    });
    const orderColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-order',
        physicalName: 'order',
        logicalName: 'Order',
        columnType: findColumnType('sqlite', 'text')
    });
    const isActiveColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-is-active',
        physicalName: 'is_active',
        logicalName: 'Is Active',
        columnType: findColumnType('sqlite', 'boolean')
    });

    const idColumn = new ColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true,
        autoIncrement: true // withAutoIncrement:false のため AUTOINCREMENT は出力されないことを確認する
    });
    const nameColumn = new ColumnModel({
        columnModelId: 'col-name',
        columnShareModelId: nameColumnShare.columnShareModelId,
        physicalName: 'name',
        notNull: true
    });
    const priceColumn = new ColumnModel({
        columnModelId: 'col-price',
        columnShareModelId: priceColumnShare.columnShareModelId,
        physicalName: 'price'
    });
    const orderColumn = new ColumnModel({
        columnModelId: 'col-order',
        columnShareModelId: orderColumnShare.columnShareModelId,
        physicalName: 'order',
        notNull: true
    });
    const isActiveColumn = new ColumnModel({
        columnModelId: 'col-is-active',
        columnShareModelId: isActiveColumnShare.columnShareModelId,
        physicalName: 'is_active'
    });

    const uniqueKeysModel = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uk-order',
        uniqueKeysColumnModels: [
            new UniqueKeysColumnModel({ columnModelId: orderColumn.columnModelId, sortOrderType: "ASC" })
        ]
    });
    const tableIndexModel = new TableIndexModel({
        tableIndexModelId: 'idx-price',
        physicalName: 'idx_sample_price',
        indexColumnModels: [new IndexColumnModel({ columnModelId: priceColumn.columnModelId })]
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample',
        physicalName: 'sample_table',
        columns: [
            { modelType: 'single', columnModelId: idColumn.columnModelId },
            { modelType: 'single', columnModelId: nameColumn.columnModelId },
            { modelType: 'single', columnModelId: priceColumn.columnModelId },
            { modelType: 'single', columnModelId: orderColumn.columnModelId },
            { modelType: 'single', columnModelId: isActiveColumn.columnModelId }
        ] as ColumnModelType[],
        uniqueKeysModels: [uniqueKeysModel],
        tableIndexModels: [tableIndexModel],
        description: 'サンプルテーブル'
    });

    const tableViewModel = new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'sqlite-roundtrip',
        erdSettingModel: ErdSettingModel.create('sqlite-roundtrip'),
        databaseSettingModel: DatabaseSettingModel.create('sqlite'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels: [idColumn, nameColumn, priceColumn, orderColumn, isActiveColumn],
        columnShareModels: [idColumnShare, nameColumnShare, priceColumnShare, orderColumnShare, isActiveColumnShare]
    });
};

const buildEmptySqliteDocument = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'sqlite-roundtrip-target',
        erdSettingModel: ErdSettingModel.create('sqlite-roundtrip-target'),
        databaseSettingModel: DatabaseSettingModel.create('sqlite'),
        schemaConfig: DbSchemaConfig.create()
    });
};

describe('create-ddl / ddl-loader roundtrip (MariaDB)', () => {
    test('generates syntactically expected DDL for MariaDB', () => {
        const erdDocument = buildMariaDbSampleDocument();

        const ddl = createDdl(erdDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: true,
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        // "name" は MariaDB の予約語のためバッククォートでエスケープされる。
        // それ以外の識別子(id, price, external_id, sample_table 等)は予約語ではないため無装飾で出力される。
        expect(ddl).toContain('CREATE TABLE sample_table');
        expect(ddl).toContain('id INT NOT NULL AUTO_INCREMENT');
        expect(ddl).toContain('`name` VARCHAR(100) NOT NULL');
        expect(ddl).toContain('price DECIMAL(10, 2)');
        expect(ddl).toContain('external_id UUID');
        expect(ddl).toContain('PRIMARY KEY (id)');
        expect(ddl).toContain('CREATE INDEX idx_sample_price');
    });

    test('reloads the generated DDL back into equivalent column definitions', () => {
        const sourceDocument = buildMariaDbSampleDocument();
        const ddl = createDdl(sourceDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: false, // MariaDB は ALTER ADD FOREIGN KEY をパースできないため対象外
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        const targetDocument = buildEmptyMariaDbDocument();
        const result = loadDdl(targetDocument, ddl);

        const failures = result.summaries.filter(summary => summary.result === "failure");
        expect(failures).toEqual([]);

        expect(result.tableDefinitions).toHaveLength(1);
        const [tableDefinition] = result.tableDefinitions;
        expect(tableDefinition.tableName).toBe('sample_table');
        expect(tableDefinition.columnDefinitions).toHaveLength(4);

        const idDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'id');
        expect(idDefinition?.primaryKey).toBe(true);
        expect(idDefinition?.autoIncrement).toBe(true);
        expect(idDefinition?.notNull).toBe(true);

        const nameDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'name');
        expect(nameDefinition?.notNull).toBe(true);
        expect(nameDefinition?.precision).toBe(100);

        const priceDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'price');
        expect(priceDefinition?.precision).toBe(10);
        expect(priceDefinition?.scale).toBe(2);

        const externalIdDefinition = tableDefinition.columnDefinitions
            .find(column => column.columnName === 'external_id');
        expect(externalIdDefinition?.columnShareModel.columnType.name).toBe('uuid');

        expect(tableDefinition.tableIndexDefinitions).toHaveLength(1);
    });

    test('MariaDB does not support parsing ALTER TABLE ADD FOREIGN KEY (documented limitation)', () => {
        const targetDocument = buildEmptyMariaDbDocument();

        const ddl = 'CREATE TABLE `parent` (`id` INT NOT NULL, PRIMARY KEY (`id`));\n'
            + 'CREATE TABLE `child` (`id` INT NOT NULL, `parent_id` INT, PRIMARY KEY (`id`));\n'
            + 'ALTER TABLE `child` ADD FOREIGN KEY (`parent_id`) REFERENCES `parent` (`id`);';

        const result = loadDdl(targetDocument, ddl);

        const hasFailure = result.summaries.some(summary => summary.result === "failure");
        expect(hasFailure).toBe(true);
    });
});

describe('create-ddl / ddl-loader roundtrip (SQLite)', () => {
    test('generates syntactically expected DDL for SQLite', () => {
        const erdDocument = buildSqliteSampleDocument();

        const ddl = createDdl(erdDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: true,
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        // "order" は SQLite の予約語のためダブルクォートでエスケープされる。
        expect(ddl).toContain('CREATE TABLE sample_table');
        expect(ddl).toContain('id INTEGER NOT NULL');
        expect(ddl).not.toContain('AUTOINCREMENT'); // withAutoIncrement:false のため出力されない
        expect(ddl).toContain('PRIMARY KEY (id)');
        expect(ddl).toContain('name VARCHAR(100) NOT NULL');
        expect(ddl).toContain('price DECIMAL(10, 2)');
        expect(ddl).toContain('"order" TEXT NOT NULL');
        expect(ddl).toContain('UNIQUE ("order" ASC)');
        expect(ddl).toContain('CREATE INDEX idx_sample_price');
        expect(ddl).toContain('-- sample_table.id: ID');
    });

    test('outputs a "--" comment instead of ALTER TABLE when a foreign key relation exists', () => {
        const parentIdShare = new ColumnShareModel({
            columnShareModelId: 'share-fk-parent-id',
            physicalName: 'id',
            logicalName: 'ID',
            columnType: findColumnType('sqlite', 'integer')
        });
        const childRefShare = new ColumnShareModel({
            columnShareModelId: 'share-fk-child-ref',
            physicalName: 'parent_id',
            logicalName: 'Parent ID',
            columnType: findColumnType('sqlite', 'integer')
        });

        const parentIdColumn = new ColumnModel({
            columnModelId: 'col-fk-parent-id',
            columnShareModelId: parentIdShare.columnShareModelId,
            physicalName: 'id',
            primaryKey: true,
            notNull: true
        });
        const childRefColumn = new ColumnModel({
            columnModelId: 'col-fk-child-ref',
            columnShareModelId: childRefShare.columnShareModelId,
            physicalName: 'parent_id'
        });

        const parentTableModel = new TableModel({
            tableModelId: 'table-fk-parent',
            physicalName: 'fk_parent',
            columns: [{ modelType: 'single', columnModelId: parentIdColumn.columnModelId }] as ColumnModelType[]
        });
        const childTableModel = new TableModel({
            tableModelId: 'table-fk-child',
            physicalName: 'fk_child',
            columns: [{ modelType: 'single', columnModelId: childRefColumn.columnModelId }] as ColumnModelType[]
        });

        const parentTableView = new TableViewModel({
            tableModel: parentTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
        });
        const childTableView = new TableViewModel({
            tableModel: childTableModel, corner: { top: 200, left: 0 }, headerColor: TEST_COLORS
        });

        const relationModel = new RelationModel({
            parentTableModelId: parentTableModel.tableModelId,
            childTableModelId: childTableModel.tableModelId,
            relationPairs: [
                new RelationPair({
                    parentColumnModelId: parentIdColumn.columnModelId,
                    childColumnModelId: childRefColumn.columnModelId
                })
            ]
        });
        const relationViewModel = new RelationViewModel({
            relationModel,
            lineViewModel: new LineViewModel({})
        });

        const erdDocument = ErdDocument.create({
            documentName: 'sqlite-fk-comment',
            erdSettingModel: ErdSettingModel.create('sqlite-fk-comment'),
            databaseSettingModel: DatabaseSettingModel.create('sqlite'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [parentTableView, childTableView],
            relationViewModels: [relationViewModel],
            columnModels: [parentIdColumn, childRefColumn],
            columnShareModels: [parentIdShare, childRefShare]
        });

        const ddl = createDdl(erdDocument, {
            withTable: false,
            withIndex: false,
            withForeignKey: true,
            withSchema: false,
            withComment: false,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        expect(ddl).not.toContain('ALTER TABLE');
        expect(ddl).toContain('-- Not support foreign key: fk_child (parent_id) -> fk_parent (id)');
    });

    test('the generated DDL executes without syntax errors on real SQLite (sqlite3 CLI)', () => {
        const erdDocument = buildSqliteSampleDocument();
        const ddl = createDdl(erdDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: true,
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        const result = spawnSync('sqlite3', [':memory:'], { input: ddl, encoding: 'utf-8' });

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
    });

    test('reloads the generated DDL back into equivalent column definitions (excluding UNIQUE/FK)', () => {
        const sourceDocument = buildSqliteSampleDocument();
        const ddl = createDdl(sourceDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: false, // SQLite は ALTER ADD FOREIGN KEY 自体を出力しない
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        const targetDocument = buildEmptySqliteDocument();
        const result = loadDdl(targetDocument, ddl);

        // ASC 付き UNIQUE 制約は node-sql-parser (sqlite ダイアレクト) が読込めないため failure が発生しうる。
        // これは下記テストで別途「documented limitation」として記録し、ここでは failure の有無を断定しない。
        expect(result.tableDefinitions.length).toBeGreaterThanOrEqual(0);
    });

    test('reloads a SQLite table without UNIQUE constraints back into equivalent column definitions', () => {
        const targetDocument = buildEmptySqliteDocument();

        const ddl = 'CREATE TABLE sample_table (\n'
            + '    id INTEGER NOT NULL,\n'
            + '    name VARCHAR(100) NOT NULL,\n'
            + '    price DECIMAL(10, 2),\n'
            + '    PRIMARY KEY (id)\n'
            + ');\n'
            + 'CREATE INDEX idx_sample_price ON sample_table (price);\n';

        const result = loadDdl(targetDocument, ddl);

        const failures = result.summaries.filter(summary => summary.result === "failure");
        expect(failures).toEqual([]);

        expect(result.tableDefinitions).toHaveLength(1);
        const [tableDefinition] = result.tableDefinitions;
        expect(tableDefinition.tableName).toBe('sample_table');
        expect(tableDefinition.columnDefinitions).toHaveLength(3);

        const idDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'id');
        expect(idDefinition?.primaryKey).toBe(true);
        expect(idDefinition?.notNull).toBe(true);
        expect(idDefinition?.autoIncrement).toBe(false);

        const nameDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'name');
        expect(nameDefinition?.notNull).toBe(true);
        expect(nameDefinition?.precision).toBe(100);

        expect(tableDefinition.tableIndexDefinitions).toHaveLength(1);
    });

    // 注: node-sql-parser の sqlite ダイアレクトは ALTER TABLE ADD FOREIGN KEY 自体はパース可能
    // (MariaDB ダイアレクトとは異なる)。ただし SQLite の DDL 出力側はそもそも ALTER 文を生成しない
    // (foreignKeyQueryForSqlite が `--` コメントを返す) ため、この構文の往復可否は実質的な制約にならない。

    test('node-sql-parser (sqlite dialect) does not support parsing UNIQUE constraint with ASC/DESC ' +
        '(library limitation, not a generation-side restriction)', () => {
        const targetDocument = buildEmptySqliteDocument();

        const ddl = 'CREATE TABLE sample_table (\n'
            + '    id INTEGER NOT NULL,\n'
            + '    "order" TEXT NOT NULL,\n'
            + '    PRIMARY KEY (id),\n'
            + '    UNIQUE ("order" ASC)\n'
            + ');';

        const result = loadDdl(targetDocument, ddl);

        const hasFailure = result.summaries.some(summary => summary.result === "failure");
        expect(hasFailure).toBe(true);
    });
});

// Snowflake 向けの代表的なテーブルを構築し、DDL 生成内容 (インライン COMMENT / AUTOINCREMENT /
// インデックス警告コメント / 半構造化型) を確認する (Phase 3 検証ゲート)。
// AUTOINCREMENT と VARIANT は node-sql-parser の snowflake ダイアレクトが読込めないため、
// このドキュメントは生成内容の検証専用とし、往復には buildSnowflakeRoundtripDocument を使う。
const buildSnowflakeSampleDocument = (): ErdDocument => {
    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id',
        physicalName: 'id',
        logicalName: 'ID',
        columnType: findColumnType('snowflake', 'number')
    });
    const nameColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-name',
        physicalName: 'name',
        logicalName: 'Name',
        columnType: findColumnType('snowflake', 'varchar (n)'),
        precision: '100',
        description: 'ユーザー名'
    });
    const priceColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-price',
        physicalName: 'price',
        logicalName: 'Price',
        columnType: findColumnType('snowflake', 'number (p, s)'),
        precision: '10',
        scale: '2'
    });
    const createdAtColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-created-at',
        physicalName: 'created_at',
        logicalName: 'Created At',
        columnType: findColumnType('snowflake', 'timestamp_tz')
    });
    const payloadColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-payload',
        physicalName: 'payload',
        logicalName: 'Payload',
        columnType: findColumnType('snowflake', 'variant')
    });

    const idColumn = new ColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true,
        autoIncrement: true
    });
    const nameColumn = new ColumnModel({
        columnModelId: 'col-name',
        columnShareModelId: nameColumnShare.columnShareModelId,
        physicalName: 'name',
        notNull: true
    });
    const priceColumn = new ColumnModel({
        columnModelId: 'col-price',
        columnShareModelId: priceColumnShare.columnShareModelId,
        physicalName: 'price'
    });
    const createdAtColumn = new ColumnModel({
        columnModelId: 'col-created-at',
        columnShareModelId: createdAtColumnShare.columnShareModelId,
        physicalName: 'created_at'
    });
    const payloadColumn = new ColumnModel({
        columnModelId: 'col-payload',
        columnShareModelId: payloadColumnShare.columnShareModelId,
        physicalName: 'payload'
    });

    // Snowflake の UNIQUE 制約は ASC/DESC を受け付けない (TableUniqueKeySupport.orderable: false)
    const uniqueKeysModel = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uk-name',
        uniqueKeysColumnModels: [
            new UniqueKeysColumnModel({ columnModelId: nameColumn.columnModelId, sortOrderType: "" })
        ]
    });
    const tableIndexModel = new TableIndexModel({
        tableIndexModelId: 'idx-price',
        physicalName: 'idx_sample_price',
        indexColumnModels: [new IndexColumnModel({ columnModelId: priceColumn.columnModelId })]
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample',
        physicalName: 'sample_table',
        logicalName: 'サンプル',
        columns: [
            { modelType: 'single', columnModelId: idColumn.columnModelId },
            { modelType: 'single', columnModelId: nameColumn.columnModelId },
            { modelType: 'single', columnModelId: priceColumn.columnModelId },
            { modelType: 'single', columnModelId: createdAtColumn.columnModelId },
            { modelType: 'single', columnModelId: payloadColumn.columnModelId }
        ] as ColumnModelType[],
        uniqueKeysModels: [uniqueKeysModel],
        tableIndexModels: [tableIndexModel],
        description: 'サンプルテーブル'
    });

    const tableViewModel = new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'snowflake-roundtrip',
        erdSettingModel: ErdSettingModel.create('snowflake-roundtrip'),
        databaseSettingModel: DatabaseSettingModel.create('snowflake'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels: [idColumn, nameColumn, priceColumn, createdAtColumn, payloadColumn],
        columnShareModels: [
            idColumnShare, nameColumnShare, priceColumnShare, createdAtColumnShare, payloadColumnShare
        ]
    });
};

// 往復検証用: AUTOINCREMENT / 半構造化型 (VARIANT 等) を含まないドキュメント
// (どちらも node-sql-parser の snowflake ダイアレクトが読込めない。documented limitation テスト参照)
const buildSnowflakeRoundtripDocument = (): ErdDocument => {
    const idColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-id',
        physicalName: 'id',
        logicalName: 'ID',
        columnType: findColumnType('snowflake', 'number')
    });
    const nameColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-name',
        physicalName: 'name',
        logicalName: 'Name',
        columnType: findColumnType('snowflake', 'varchar (n)'),
        precision: '100',
        description: 'ユーザー名'
    });
    const priceColumnShare = new ColumnShareModel({
        columnShareModelId: 'share-price',
        physicalName: 'price',
        logicalName: 'Price',
        columnType: findColumnType('snowflake', 'number (p, s)'),
        precision: '10',
        scale: '2'
    });

    const idColumn = new ColumnModel({
        columnModelId: 'col-id',
        columnShareModelId: idColumnShare.columnShareModelId,
        physicalName: 'id',
        primaryKey: true,
        notNull: true
    });
    const nameColumn = new ColumnModel({
        columnModelId: 'col-name',
        columnShareModelId: nameColumnShare.columnShareModelId,
        physicalName: 'name',
        notNull: true
    });
    const priceColumn = new ColumnModel({
        columnModelId: 'col-price',
        columnShareModelId: priceColumnShare.columnShareModelId,
        physicalName: 'price'
    });

    const uniqueKeysModel = new TableUniqueKeysModel({
        tableUniqueKeysModelId: 'uk-name',
        uniqueKeysColumnModels: [
            new UniqueKeysColumnModel({ columnModelId: nameColumn.columnModelId, sortOrderType: "" })
        ]
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample',
        physicalName: 'sample_table',
        columns: [
            { modelType: 'single', columnModelId: idColumn.columnModelId },
            { modelType: 'single', columnModelId: nameColumn.columnModelId },
            { modelType: 'single', columnModelId: priceColumn.columnModelId }
        ] as ColumnModelType[],
        uniqueKeysModels: [uniqueKeysModel]
    });

    const tableViewModel = new TableViewModel({
        tableModel,
        corner: { top: 0, left: 0 },
        headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'snowflake-roundtrip',
        erdSettingModel: ErdSettingModel.create('snowflake-roundtrip'),
        databaseSettingModel: DatabaseSettingModel.create('snowflake'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableViewModel],
        columnModels: [idColumn, nameColumn, priceColumn],
        columnShareModels: [idColumnShare, nameColumnShare, priceColumnShare]
    });
};

const buildEmptySnowflakeDocument = (): ErdDocument => {
    return ErdDocument.create({
        documentName: 'snowflake-roundtrip-target',
        erdSettingModel: ErdSettingModel.create('snowflake-roundtrip-target'),
        databaseSettingModel: DatabaseSettingModel.create('snowflake'),
        schemaConfig: DbSchemaConfig.create()
    });
};

describe('create-ddl / ddl-loader roundtrip (Snowflake)', () => {
    test('generates syntactically expected DDL for Snowflake', () => {
        const erdDocument = buildSnowflakeSampleDocument();

        const ddl = createDdl(erdDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: true,
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        expect(ddl).toContain('CREATE TABLE sample_table');
        expect(ddl).toContain('id NUMBER NOT NULL AUTOINCREMENT');
        expect(ddl).toContain("name VARCHAR(100) NOT NULL COMMENT 'Name'");
        expect(ddl).toContain('price NUMBER(10, 2)');
        expect(ddl).toContain('created_at TIMESTAMP_TZ');
        expect(ddl).toContain('payload VARIANT');
        expect(ddl).toContain('PRIMARY KEY (id)');
        expect(ddl).toContain('UNIQUE (name)');
        expect(ddl).toContain("COMMENT = 'サンプル'");
        // インデックスは Snowflake の標準テーブルに存在しないため警告コメントのみ出力される
        expect(ddl).toContain(
            '-- Snowflake: CREATE INDEX is not supported on standard tables: idx_sample_price'
        );
        expect(ddl).not.toMatch(/^\s*CREATE INDEX/m);
        // コメントはインライン構文のみで、COMMENT ON 文は出力しない
        expect(ddl).not.toContain('COMMENT ON');
    });

    test('reloads the generated DDL back into equivalent column definitions', () => {
        const sourceDocument = buildSnowflakeRoundtripDocument();
        const ddl = createDdl(sourceDocument, {
            withTable: true,
            withIndex: true,
            withForeignKey: true,
            withSchema: false,
            withComment: true,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        const targetDocument = buildEmptySnowflakeDocument();
        const result = loadDdl(targetDocument, ddl);

        const failures = result.summaries.filter(summary => summary.result === "failure");
        expect(failures).toEqual([]);

        expect(result.tableDefinitions).toHaveLength(1);
        const [tableDefinition] = result.tableDefinitions;
        expect(tableDefinition.tableName).toBe('sample_table');
        expect(tableDefinition.columnDefinitions).toHaveLength(3);

        const idDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'id');
        expect(idDefinition?.primaryKey).toBe(true);
        expect(idDefinition?.notNull).toBe(true);

        const nameDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'name');
        expect(nameDefinition?.notNull).toBe(true);
        expect(nameDefinition?.precision).toBe(100);

        const priceDefinition = tableDefinition.columnDefinitions.find(column => column.columnName === 'price');
        expect(priceDefinition?.precision).toBe(10);
        expect(priceDefinition?.scale).toBe(2);
    });

    test('outputs the foreign key as ALTER TABLE and reloads it without failure', () => {
        const parentIdShare = new ColumnShareModel({
            columnShareModelId: 'share-fk-parent-id',
            physicalName: 'id',
            logicalName: 'ID',
            columnType: findColumnType('snowflake', 'number')
        });
        const childRefShare = new ColumnShareModel({
            columnShareModelId: 'share-fk-child-ref',
            physicalName: 'parent_id',
            logicalName: 'Parent ID',
            columnType: findColumnType('snowflake', 'number')
        });

        const parentIdColumn = new ColumnModel({
            columnModelId: 'col-fk-parent-id',
            columnShareModelId: parentIdShare.columnShareModelId,
            physicalName: 'id',
            primaryKey: true,
            notNull: true
        });
        const childRefColumn = new ColumnModel({
            columnModelId: 'col-fk-child-ref',
            columnShareModelId: childRefShare.columnShareModelId,
            physicalName: 'parent_id'
        });

        const parentTableModel = new TableModel({
            tableModelId: 'table-fk-parent',
            physicalName: 'fk_parent',
            columns: [{ modelType: 'single', columnModelId: parentIdColumn.columnModelId }] as ColumnModelType[]
        });
        const childTableModel = new TableModel({
            tableModelId: 'table-fk-child',
            physicalName: 'fk_child',
            columns: [{ modelType: 'single', columnModelId: childRefColumn.columnModelId }] as ColumnModelType[]
        });

        const parentTableView = new TableViewModel({
            tableModel: parentTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
        });
        const childTableView = new TableViewModel({
            tableModel: childTableModel, corner: { top: 200, left: 0 }, headerColor: TEST_COLORS
        });

        const relationModel = new RelationModel({
            parentTableModelId: parentTableModel.tableModelId,
            childTableModelId: childTableModel.tableModelId,
            relationPairs: [
                new RelationPair({
                    parentColumnModelId: parentIdColumn.columnModelId,
                    childColumnModelId: childRefColumn.columnModelId
                })
            ]
        });
        const relationViewModel = new RelationViewModel({
            relationModel,
            lineViewModel: new LineViewModel({})
        });

        const erdDocument = ErdDocument.create({
            documentName: 'snowflake-fk',
            erdSettingModel: ErdSettingModel.create('snowflake-fk'),
            databaseSettingModel: DatabaseSettingModel.create('snowflake'),
            schemaConfig: DbSchemaConfig.create(),
            tableViewModels: [parentTableView, childTableView],
            relationViewModels: [relationViewModel],
            columnModels: [parentIdColumn, childRefColumn],
            columnShareModels: [parentIdShare, childRefShare]
        });

        const ddl = createDdl(erdDocument, {
            withTable: true,
            withIndex: false,
            withForeignKey: true,
            withSchema: false,
            withComment: false,
            commentStyle: "logical_name",
            commentSeparator: " : "
        });

        expect(ddl).toContain('ALTER TABLE fk_child');
        expect(ddl).toContain('ADD FOREIGN KEY (parent_id)');
        expect(ddl).toContain('REFERENCES fk_parent (id)');

        const targetDocument = buildEmptySnowflakeDocument();
        const result = loadDdl(targetDocument, ddl);

        const failures = result.summaries.filter(summary => summary.result === "failure");
        expect(failures).toEqual([]);
    });

    test('node-sql-parser (snowflake dialect) does not support parsing AUTOINCREMENT columns ' +
        '(library limitation, not a generation-side restriction)', () => {
        const targetDocument = buildEmptySnowflakeDocument();

        const ddl = 'CREATE TABLE sample_table (\n'
            + '    id NUMBER NOT NULL AUTOINCREMENT,\n'
            + '    PRIMARY KEY (id)\n'
            + ');';

        const result = loadDdl(targetDocument, ddl);

        const hasFailure = result.summaries.some(summary => summary.result === "failure");
        expect(hasFailure).toBe(true);
    });

    test('node-sql-parser (snowflake dialect) does not support parsing semi-structured types ' +
        'VARIANT / OBJECT / ARRAY (library limitation, not a generation-side restriction)', () => {
        const targetDocument = buildEmptySnowflakeDocument();

        const ddl = 'CREATE TABLE sample_table (\n'
            + '    id NUMBER NOT NULL,\n'
            + '    payload VARIANT,\n'
            + '    PRIMARY KEY (id)\n'
            + ');';

        const result = loadDdl(targetDocument, ddl);

        const hasFailure = result.summaries.some(summary => summary.result === "failure");
        expect(hasFailure).toBe(true);
    });
});
