import { describe, test, expect } from 'vitest';

import { createDdl } from '~/models/schema/create-ddl';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import TableModel from '~/models/database/TableModel';
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

// primaryKeyQuery フックと supportsUniqueKey フラグの導入前後で、既存6DB
// (postgres/mysql/mariadb/ms_sqlserver/sqlite/snowflake) の DDL 出力が1文字も
// 変わらないことを完全一致 (toBe) で証明する。
// テーブルは複合PK + テーブルレベルUNIQUE制約 + カラム属性UNIQUE + 通常カラムを含む。
const buildPkUniqueSampleDocument = (
    databaseType: DatabaseType, integerTypeName: string, varcharTypeName: string
): ErdDocument => {
    const idAShare = new ColumnShareModel({
        columnShareModelId: 'share-id-a',
        physicalName: 'id_a',
        logicalName: 'ID A',
        columnType: findColumnType(databaseType, integerTypeName)
    });
    const idBShare = new ColumnShareModel({
        columnShareModelId: 'share-id-b',
        physicalName: 'id_b',
        logicalName: 'ID B',
        columnType: findColumnType(databaseType, integerTypeName)
    });
    const emailShare = new ColumnShareModel({
        columnShareModelId: 'share-email',
        physicalName: 'email',
        logicalName: 'Email',
        columnType: findColumnType(databaseType, varcharTypeName),
        precision: '255'
    });
    const codeShare = new ColumnShareModel({
        columnShareModelId: 'share-code',
        physicalName: 'code',
        logicalName: 'Code',
        columnType: findColumnType(databaseType, varcharTypeName),
        precision: '255'
    });
    const nameShare = new ColumnShareModel({
        columnShareModelId: 'share-name',
        physicalName: 'name',
        logicalName: 'Name',
        columnType: findColumnType(databaseType, varcharTypeName),
        precision: '255'
    });

    const idAColumn = new SimpleColumnModel({
        columnModelId: 'col-id-a', columnShareModelId: idAShare.columnShareModelId,
        physicalName: 'id_a', primaryKey: true, notNull: true
    });
    const idBColumn = new SimpleColumnModel({
        columnModelId: 'col-id-b', columnShareModelId: idBShare.columnShareModelId,
        physicalName: 'id_b', primaryKey: true, notNull: true
    });
    const emailColumn = new SimpleColumnModel({
        columnModelId: 'col-email', columnShareModelId: emailShare.columnShareModelId,
        physicalName: 'email', unique: true
    });
    const codeColumn = new SimpleColumnModel({
        columnModelId: 'col-code', columnShareModelId: codeShare.columnShareModelId,
        physicalName: 'code'
    });
    const nameColumn = new SimpleColumnModel({
        columnModelId: 'col-name', columnShareModelId: nameShare.columnShareModelId,
        physicalName: 'name'
    });

    const tableModel = new TableModel({
        tableModelId: 'table-sample',
        physicalName: 'sample_table',
        columnEntries: [
            { modelType: 'single', columnModelId: idAColumn.columnModelId },
            { modelType: 'single', columnModelId: idBColumn.columnModelId },
            { modelType: 'single', columnModelId: emailColumn.columnModelId },
            { modelType: 'single', columnModelId: codeColumn.columnModelId },
            { modelType: 'single', columnModelId: nameColumn.columnModelId }
        ] as ColumnEntry[],
        uniqueKeysModels: [
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'unique-code-name',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ columnModelId: codeColumn.columnModelId, sortOrderType: "" }),
                    new UniqueKeysColumnModel({ columnModelId: nameColumn.columnModelId, sortOrderType: "" })
                ]
            })
        ]
    });

    const tableView = new TableViewModel({
        tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
    });

    return ErdDocument.create({
        documentName: 'pk-unique-hook-regression',
        erdSettingModel: ErdSettingModel.create('pk-unique-hook-regression'),
        databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [tableView],
        relationViewModels: [],
        columnModels: [idAColumn, idBColumn, emailColumn, codeColumn, nameColumn],
        columnShareModels: [idAShare, idBShare, emailShare, codeShare, nameShare]
    });
};

const buildTableOnlyDdl = (
    databaseType: DatabaseType, integerTypeName: string, varcharTypeName: string
): string => {
    const erdDocument = buildPkUniqueSampleDocument(databaseType, integerTypeName, varcharTypeName);
    return createDdl(erdDocument, {
        withTable: true,
        withIndex: false,
        withForeignKey: false,
        withSchema: false,
        withComment: false,
        commentStyle: "logical_name",
        commentSeparator: " : "
    });
};

describe('primaryKeyQuery / supportsUniqueKey hook regression (existing 6 databases unchanged)', () => {
    test('postgres: table DDL output matches the pre-existing format exactly', () => {
        const ddl = buildTableOnlyDdl('postgres', 'integer', 'varchar (n)');
        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE sample_table (\n"
            + "    id_a INTEGER NOT NULL,\n"
            + "    id_b INTEGER NOT NULL,\n"
            + "    email VARCHAR(255) UNIQUE,\n"
            + "    code VARCHAR(255),\n"
            + "    \"name\" VARCHAR(255),\n"
            + "    PRIMARY KEY (id_a, id_b),\n"
            + "    UNIQUE (code, \"name\")\n"
            + ");\n"
            + "\n"
        );
    });

    test('mysql: table DDL output matches the pre-existing format exactly', () => {
        const ddl = buildTableOnlyDdl('mysql', 'int', 'varchar (m)');
        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE sample_table (\n"
            + "    id_a INT NOT NULL,\n"
            + "    id_b INT NOT NULL,\n"
            + "    email VARCHAR(255) UNIQUE,\n"
            + "    `code` VARCHAR(255),\n"
            + "    `name` VARCHAR(255),\n"
            + "    PRIMARY KEY (id_a, id_b),\n"
            + "    UNIQUE (`code`, `name`)\n"
            + ");\n"
            + "\n"
        );
    });

    test('mariadb: table DDL output matches the pre-existing format exactly', () => {
        const ddl = buildTableOnlyDdl('mariadb', 'int', 'varchar (m)');
        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE sample_table (\n"
            + "    id_a INT NOT NULL,\n"
            + "    id_b INT NOT NULL,\n"
            + "    email VARCHAR(255) UNIQUE,\n"
            + "    `code` VARCHAR(255),\n"
            + "    `name` VARCHAR(255),\n"
            + "    PRIMARY KEY (id_a, id_b),\n"
            + "    UNIQUE (`code`, `name`)\n"
            + ");\n"
            + "\n"
        );
    });

    test('ms_sqlserver: table DDL output matches the pre-existing format exactly', () => {
        const ddl = buildTableOnlyDdl('ms_sqlserver', 'int', 'varchar (n)');
        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE sample_table (\n"
            + "    id_a INT NOT NULL,\n"
            + "    id_b INT NOT NULL,\n"
            + "    email VARCHAR(255) UNIQUE,\n"
            + "    code VARCHAR(255),\n"
            + "    name VARCHAR(255),\n"
            + "    PRIMARY KEY (id_a, id_b),\n"
            + "    UNIQUE (code, name)\n"
            + ");\n"
            + "\n"
        );
    });

    test('sqlite: table DDL output matches the pre-existing format exactly', () => {
        const ddl = buildTableOnlyDdl('sqlite', 'integer', 'varchar (n)');
        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE sample_table (\n"
            + "    id_a INTEGER NOT NULL,\n"
            + "    id_b INTEGER NOT NULL,\n"
            + "    email VARCHAR(255) UNIQUE,\n"
            + "    code VARCHAR(255),\n"
            + "    name VARCHAR(255),\n"
            + "    PRIMARY KEY (id_a, id_b),\n"
            + "    UNIQUE (code, name)\n"
            + ");\n"
            + "\n"
        );
    });

    test('snowflake: table DDL output matches the pre-existing format exactly', () => {
        const ddl = buildTableOnlyDdl('snowflake', 'number', 'varchar (n)');
        expect(ddl).toBe(
            "/* create tables. */\n"
            + "CREATE TABLE sample_table (\n"
            + "    id_a NUMBER NOT NULL,\n"
            + "    id_b NUMBER NOT NULL,\n"
            + "    email VARCHAR(255) UNIQUE,\n"
            + "    code VARCHAR(255),\n"
            + "    name VARCHAR(255),\n"
            + "    PRIMARY KEY (id_a, id_b),\n"
            + "    UNIQUE (code, name)\n"
            + ");\n"
            + "\n"
        );
    });
});

// primaryKeyQuery / supportsUniqueKey フックの単体動作 (BigQuery 等が exportConfigs に
// 未登録の現時点では、DatabaseDdlCreator クラスも exportConfigs も export されていないため、
// createDdl (exportConfigs 経由) からしかフックへ到達できない。よって現時点のフック単体の
// 直接検証はできず、次フェーズ (BigQuery 登録) で実設定としての検証に委ねる。
// ここでは、既存6DBがすべてデフォルト値 (primaryKeyQueryForConstraint / supportsUniqueKey: true)
// を経由していることを踏まえ、上記の回帰テストがデフォルト実装の正しさの検証を兼ねる。
