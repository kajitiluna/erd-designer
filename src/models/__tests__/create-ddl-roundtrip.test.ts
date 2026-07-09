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

// MariaDB (MySQL 互換) 向けの代表的なテーブルを構築し、
// createDdl → loadDdl の往復で PK / インデックス / コメント / 自動増分 / 型パラメータ / MariaDB固有型(uuid) が
// 復元できることを確認する。往復テスト資産がリポジトリに存在しなかったため新規作成 (Phase 1 検証ゲート)。
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
