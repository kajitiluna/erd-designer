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
 * db-diff の MySQL/MariaDB 向け実DB統合テスト(24差分カテゴリのうち mysql/mariadb が対象とする21種の網羅)。
 * MySQL/MariaDB は supportsSchema=false のため schema.missing/schema.unexpected は対象外、
 * db-diff は常に direction="designToDatabase"(withLogicalName=false)で動くため column.logicalName も
 * どの方言でも発生しない(SchemaCompareOptions.toCompareScope を参照)。
 * 1つの包括フィクスチャに21カテゴリを同時に仕込み、db-diff は beforeEach で1回だけ実行する。
 */
const mysqlFamilyTargets = IntegrationDatabaseTargets.selected()
    .filter(target => (target.databaseType === 'mysql') || (target.databaseType === 'mariadb'));

const EXPECTED_CATEGORIES = [
    'table.missing', 'table.unexpected', 'table.comment',
    'column.missing', 'column.unexpected', 'column.type', 'column.nullability',
    'column.default', 'column.autoIncrement', 'column.comment',
    'primaryKey',
    'uniqueKey.missing', 'uniqueKey.unexpected', 'uniqueKey.columns',
    'index.missing', 'index.unexpected', 'index.columns', 'index.type',
    'foreignKey.missing', 'foreignKey.unexpected', 'foreignKey.reference'
] as const;

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

type ColumnBuildOptions = {
    notNull?: boolean;
    primaryKey?: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    logicalName?: string;
};

type ColumnBuild = { columnModel: SimpleColumnModel, columnShareModel: ColumnShareModel };

// logicalName の既定値を physicalName 自身にすることで、initDdlComment の
// 「物理名と一致するコメントは空文字」規則により、明示指定しない限り comment="" になる。
const buildColumn = (
    idPrefix: string, physicalName: string, columnType: ColumnType, options: ColumnBuildOptions = {}
): ColumnBuild => {
    const columnShareModel = new ColumnShareModel({
        columnShareModelId: `share-${idPrefix}`, physicalName, logicalName: options.logicalName ?? physicalName,
        columnType
    });
    const columnModel = new SimpleColumnModel({
        columnModelId: `col-${idPrefix}`, columnShareModelId: `share-${idPrefix}`,
        notNull: options.notNull ?? false, primaryKey: options.primaryKey ?? false,
        autoIncrement: options.autoIncrement ?? false, defaultValue: options.defaultValue ?? ''
    });

    return { columnModel, columnShareModel };
};

const toColumnEntries = (columns: readonly ColumnBuild[]): ColumnEntry[] => {
    return columns.map(column => {
        return { modelType: 'single', columnModelId: column.columnModel.columnModelId } as ColumnEntry;
    });
};

type CategoryTableFixture = {
    tableView: TableViewModel;
    columnModels: SimpleColumnModel[];
    columnShareModels: ColumnShareModel[];
    statements: string[];
    relationViewModels?: RelationViewModel[];
};

// cat_parent 1テーブルに、primaryKey/foreignKey.*/table.missing/table.unexpected を除く
// 15カテゴリ(table.comment + column系7種 + uniqueKey系3種 + index系4種)をまとめて仕込む。
const buildCatParentTable = (databaseType: DatabaseType): CategoryTableFixture => {
    const intType = findColumnType('int', databaseType);
    const bigintType = findColumnType('bigint', databaseType);
    const textType = findColumnType('text', databaseType);

    const id = buildColumn('cat-parent-id', 'id', intType, { primaryKey: true, notNull: true, autoIncrement: true });
    const colMissing = buildColumn('cat-parent-col-missing', 'col_missing', intType);
    const colType = buildColumn('cat-parent-col-type', 'col_type', intType);
    const colNullability = buildColumn('cat-parent-col-nullability', 'col_nullability', intType, { notNull: true });
    const colDefault = buildColumn('cat-parent-col-default', 'col_default', intType, { defaultValue: '1' });
    const colAutoIncrement = buildColumn(
        'cat-parent-col-autoincrement', 'col_autoincrement', intType, { notNull: true, autoIncrement: true }
    );
    const colComment = buildColumn(
        'cat-parent-col-comment', 'col_comment', intType, { logicalName: 'Design Comment' }
    );
    const ukMissingCol = buildColumn('cat-parent-uk-missing-col', 'uk_missing_col', intType);
    const ukUnexpectedCol = buildColumn('cat-parent-uk-unexpected-col', 'uk_unexpected_col', intType);
    const ukColumnsColA = buildColumn('cat-parent-uk-columns-col-a', 'uk_columns_col_a', intType);
    const ukColumnsColB = buildColumn('cat-parent-uk-columns-col-b', 'uk_columns_col_b', intType);
    const idxMissingCol = buildColumn('cat-parent-idx-missing-col', 'idx_missing_col', intType);
    const idxUnexpectedCol = buildColumn('cat-parent-idx-unexpected-col', 'idx_unexpected_col', intType);
    const idxColumnsColA = buildColumn('cat-parent-idx-columns-col-a', 'idx_columns_col_a', intType);
    const idxColumnsColB = buildColumn('cat-parent-idx-columns-col-b', 'idx_columns_col_b', intType);
    // FULLTEXT は CHAR/VARCHAR/TEXT にしか張れないため、index.type 用の列だけ text にする。
    const idxTypeCol = buildColumn('cat-parent-idx-type-col', 'idx_type_col', textType);

    const designColumns = [
        id, colMissing, colType, colNullability, colDefault, colAutoIncrement, colComment,
        ukMissingCol, ukUnexpectedCol, ukColumnsColA, ukColumnsColB,
        idxMissingCol, idxUnexpectedCol, idxColumnsColA, idxColumnsColB, idxTypeCol
    ];

    const tableModel = new TableModel({
        tableModelId: 'table-cat-parent', physicalName: 'cat_parent', logicalName: 'Parent design comment',
        columnEntries: toColumnEntries(designColumns),
        uniqueKeysModels: [
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-missing', physicalName: 'uk_missing',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ columnModelId: ukMissingCol.columnModel.columnModelId, sortOrderType: '' })
                ]
            }),
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-columns', physicalName: 'uk_columns',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ columnModelId: ukColumnsColA.columnModel.columnModelId, sortOrderType: '' })
                ]
            })
        ],
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: 'idx-missing', physicalName: 'idx_missing',
                indexColumnModels: [new IndexColumnModel({ columnModelId: idxMissingCol.columnModel.columnModelId })]
            }),
            new TableIndexModel({
                tableIndexModelId: 'idx-columns', physicalName: 'idx_columns',
                indexColumnModels: [new IndexColumnModel({ columnModelId: idxColumnsColA.columnModel.columnModelId })]
            }),
            // indexOption 未指定の通常インデックスとして宣言する。DB 側は同名を FULLTEXT にしており、
            // 索引種別の差(formatIndexKind: "BTREE" vs "FULLTEXT")が index.type として検出される。
            new TableIndexModel({
                tableIndexModelId: 'idx-type', physicalName: 'idx_type',
                indexColumnModels: [new IndexColumnModel({ columnModelId: idxTypeCol.columnModel.columnModelId })]
            })
        ]
    });

    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    const statements = [
        `CREATE TABLE cat_parent (
            id INT NOT NULL AUTO_INCREMENT,
            col_unexpected INT NULL,
            col_type ${bigintType.baseQuery} NULL,
            col_nullability INT NULL,
            col_default INT NULL DEFAULT 2,
            col_autoincrement INT NOT NULL,
            col_comment INT NULL COMMENT 'DB Comment',
            uk_missing_col INT NULL,
            uk_unexpected_col INT NULL,
            uk_columns_col_a INT NULL,
            uk_columns_col_b INT NULL,
            idx_missing_col INT NULL,
            idx_unexpected_col INT NULL,
            idx_columns_col_a INT NULL,
            idx_columns_col_b INT NULL,
            idx_type_col TEXT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uk_unexpected (uk_unexpected_col),
            UNIQUE KEY uk_columns (uk_columns_col_b),
            INDEX idx_unexpected (idx_unexpected_col),
            INDEX idx_columns (idx_columns_col_b)
        ) ENGINE=InnoDB COMMENT='Parent actual comment'`,
        // FULLTEXT は列定義と同じ CREATE TABLE 文の中でも書けるが、可読性のため別文にする。
        'CREATE FULLTEXT INDEX idx_type ON cat_parent (idx_type_col)'
    ];

    return {
        tableView,
        columnModels: designColumns.map(column => column.columnModel),
        columnShareModels: designColumns.map(column => column.columnShareModel),
        statements
    };
};

// 複合PKの構成不一致(primaryKey)専用のテーブル。
const buildCatWidgetTable = (databaseType: DatabaseType): CategoryTableFixture => {
    const intType = findColumnType('int', databaseType);

    const widgetCode = buildColumn('cat-widget-code', 'widget_code', intType, { primaryKey: true, notNull: true });
    const widgetVariant = buildColumn('cat-widget-variant', 'widget_variant', intType, { notNull: true });
    const designColumns = [widgetCode, widgetVariant];

    const tableModel = new TableModel({
        tableModelId: 'table-cat-widget', physicalName: 'cat_widget', columnEntries: toColumnEntries(designColumns)
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 400 }, headerColor: TEST_COLORS });

    const statements = [
        `CREATE TABLE cat_widget (
            widget_code INT NOT NULL,
            widget_variant INT NOT NULL,
            PRIMARY KEY (widget_code, widget_variant)
        ) ENGINE=InnoDB`
    ];

    return {
        tableView,
        columnModels: designColumns.map(column => column.columnModel),
        columnShareModels: designColumns.map(column => column.columnShareModel),
        statements
    };
};

// foreignKey.missing/unexpected/reference 専用のテーブル。
// InnoDB は FK 列に自動でインデックスを作るため、設計側にも同名インデックスを宣言して対称にする。
const buildCatChildTable = (
    databaseType: DatabaseType, parentTableModelId: string, parentIdColumnModelId: string
): CategoryTableFixture => {
    const intType = findColumnType('int', databaseType);

    const id = buildColumn('cat-child-id', 'id', intType, { primaryKey: true, notNull: true, autoIncrement: true });
    const parentRefA = buildColumn('cat-child-parent-ref-a', 'parent_ref_a', intType, { notNull: true });
    const parentRefB = buildColumn('cat-child-parent-ref-b', 'parent_ref_b', intType, { notNull: true });
    const parentRefC = buildColumn('cat-child-parent-ref-c', 'parent_ref_c', intType, { notNull: true });
    const designColumns = [id, parentRefA, parentRefB, parentRefC];

    const tableModel = new TableModel({
        tableModelId: 'table-cat-child', physicalName: 'cat_child', columnEntries: toColumnEntries(designColumns),
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: 'idx-cat-child-parent-ref-a', physicalName: 'idx_cat_child_parent_ref_a',
                indexColumnModels: [new IndexColumnModel({ columnModelId: parentRefA.columnModel.columnModelId })]
            }),
            new TableIndexModel({
                tableIndexModelId: 'idx-cat-child-parent-ref-c', physicalName: 'idx_cat_child_parent_ref_c',
                indexColumnModels: [new IndexColumnModel({ columnModelId: parentRefC.columnModel.columnModelId })]
            })
        ]
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 800 }, headerColor: TEST_COLORS });

    // onDeleteAction/onUpdateAction は既定の RESTRICT のまま: 実DBの CASCADE と食い違わせて foreignKey.reference を、
    // 実DBに制約が無い状態と組み合わせて foreignKey.missing を発生させる。
    const relationToA = new RelationModel({
        relationModelId: 'rel-cat-child-parent-ref-a', parentTableModelId, childTableModelId: 'table-cat-child',
        relationPairs: [new RelationPair({
            parentColumnModelId: parentIdColumnModelId, childColumnModelId: parentRefA.columnModel.columnModelId
        })]
    });
    const relationToB = new RelationModel({
        relationModelId: 'rel-cat-child-parent-ref-b', parentTableModelId, childTableModelId: 'table-cat-child',
        relationPairs: [new RelationPair({
            parentColumnModelId: parentIdColumnModelId, childColumnModelId: parentRefB.columnModel.columnModelId
        })]
    });
    const relationViewModels = [relationToA, relationToB].map(relationModel => {
        return new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });
    });

    const statements = [
        `CREATE TABLE cat_child (
            id INT NOT NULL AUTO_INCREMENT,
            parent_ref_a INT NOT NULL,
            parent_ref_b INT NOT NULL,
            parent_ref_c INT NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_cat_child_parent_ref_a (parent_ref_a),
            INDEX idx_cat_child_parent_ref_c (parent_ref_c),
            CONSTRAINT fk_cat_child_parent_ref_a FOREIGN KEY (parent_ref_a) REFERENCES cat_parent (id)
                ON DELETE CASCADE ON UPDATE RESTRICT,
            CONSTRAINT fk_cat_child_parent_ref_c FOREIGN KEY (parent_ref_c) REFERENCES cat_parent (id)
                ON DELETE RESTRICT ON UPDATE RESTRICT
        ) ENGINE=InnoDB`
    ];

    return {
        tableView,
        columnModels: designColumns.map(column => column.columnModel),
        columnShareModels: designColumns.map(column => column.columnShareModel),
        statements, relationViewModels
    };
};

// table.missing 専用: 設計にのみ存在し、実DBには作らない。
const buildCatMissingTable = (databaseType: DatabaseType): CategoryTableFixture => {
    const intType = findColumnType('int', databaseType);
    const id = buildColumn('cat-missing-table-id', 'id', intType, { primaryKey: true, notNull: true, autoIncrement: true });

    const tableModel = new TableModel({
        tableModelId: 'table-cat-missing', physicalName: 'cat_missing_table', columnEntries: toColumnEntries([id])
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 400, left: 0 }, headerColor: TEST_COLORS });

    return { tableView, columnModels: [id.columnModel], columnShareModels: [id.columnShareModel], statements: [] };
};

type CategoriesFixture = { erdDocument: ErdDocument, statements: string[] };

const buildCategoriesFixture = (databaseType: DatabaseType): CategoriesFixture => {
    const catParent = buildCatParentTable(databaseType);
    const catWidget = buildCatWidgetTable(databaseType);
    const catChild = buildCatChildTable(databaseType, 'table-cat-parent', catParent.columnModels[0].columnModelId);
    const catMissing = buildCatMissingTable(databaseType);

    // table.unexpected 専用: 実DBにのみ存在し、設計には含めない。
    const unexpectedTableStatement = `CREATE TABLE cat_unexpected_table (
        id INT NOT NULL AUTO_INCREMENT,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB`;

    const erdDocument = ErdDocument.create({
        documentName: 'mysql-categories-fixture', databaseSettingModel: DatabaseSettingModel.create(databaseType),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [catParent.tableView, catWidget.tableView, catChild.tableView, catMissing.tableView],
        columnModels: [
            ...catParent.columnModels, ...catWidget.columnModels, ...catChild.columnModels, ...catMissing.columnModels
        ],
        columnShareModels: [
            ...catParent.columnShareModels, ...catWidget.columnShareModels,
            ...catChild.columnShareModels, ...catMissing.columnShareModels
        ],
        relationViewModels: catChild.relationViewModels ?? []
    });

    const statements = [
        ...catParent.statements, ...catWidget.statements, ...catChild.statements, unexpectedTableStatement
    ];

    return { erdDocument, statements };
};

describe.each(mysqlFamilyTargets)('db-diff mysql/mariadb categories ($id)', target => {
    const adminDsn = IntegrationDatabaseTargets.resolveDsn(target);

    let workDirectory: string;
    let logLines: string[];
    let logSpy: ReturnType<typeof vi.spyOn>;
    let databaseName: string;
    let databaseDsn: string;
    let connection: MySqlConnectionInstance;
    let report: SchemaDifference[];

    beforeEach(async () => {
        workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mysql-categories-'));
        logLines = [];
        logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
            logLines.push(String(message));
        });

        databaseName = integrationDdl.uniqueName('test_db');
        await integrationDdl.mysql.createDatabase(adminDsn, databaseName);
        databaseDsn = integrationDdl.mysql.toDatabaseDsn(adminDsn, databaseName);
        connection = await integrationDdl.mysql.connect(databaseDsn);

        const fixture = buildCategoriesFixture(target.databaseType);
        await integrationDdl.mysql.execute(connection, fixture.statements);

        const erdPath = writeErdDocument(workDirectory, 'design.erd', fixture.erdDocument);
        await CommandRunner.execute(dbDifference, ['--file', erdPath, '--dsn', databaseDsn, '--format', 'json']);

        const parsed = JSON.parse(logLines.join('\n')) as { differences: SchemaDifference[] };
        report = parsed.differences;
    });

    afterEach(async () => {
        await connection.end();
        await integrationDdl.mysql.dropDatabase(adminDsn, databaseName);
        fs.rmSync(workDirectory, { recursive: true, force: true });
        logSpy.mockRestore();
    });

    test('table.missing is detected for cat_missing_table', () => {
        expect(report.some(difference =>
            (difference.category === 'table.missing') && (difference.targetName === 'cat_missing_table')
        )).toBe(true);
    });

    test('table.unexpected is detected for cat_unexpected_table', () => {
        expect(report.some(difference =>
            (difference.category === 'table.unexpected') && (difference.targetName === 'cat_unexpected_table')
        )).toBe(true);
    });

    test('table.comment is detected for cat_parent', () => {
        expect(report.some(difference =>
            (difference.category === 'table.comment') && (difference.targetName === 'cat_parent')
        )).toBe(true);
    });

    test('column.missing is detected for cat_parent.col_missing', () => {
        expect(report.some(difference =>
            (difference.category === 'column.missing') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_missing')
        )).toBe(true);
    });

    test('column.unexpected is detected for cat_parent.col_unexpected', () => {
        expect(report.some(difference =>
            (difference.category === 'column.unexpected') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_unexpected')
        )).toBe(true);
    });

    test('column.type is detected for cat_parent.col_type', () => {
        expect(report.some(difference =>
            (difference.category === 'column.type') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_type')
        )).toBe(true);
    });

    test('column.nullability is detected for cat_parent.col_nullability', () => {
        expect(report.some(difference =>
            (difference.category === 'column.nullability') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_nullability')
        )).toBe(true);
    });

    test('column.default is detected for cat_parent.col_default', () => {
        expect(report.some(difference =>
            (difference.category === 'column.default') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_default')
        )).toBe(true);
    });

    test('column.autoIncrement is detected for cat_parent.col_autoincrement', () => {
        expect(report.some(difference =>
            (difference.category === 'column.autoIncrement') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_autoincrement')
        )).toBe(true);
    });

    test('column.comment is detected for cat_parent.col_comment', () => {
        expect(report.some(difference =>
            (difference.category === 'column.comment') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'col_comment')
        )).toBe(true);
    });

    test('primaryKey is detected for cat_widget', () => {
        expect(report.some(difference =>
            (difference.category === 'primaryKey') && (difference.tableName === 'cat_widget')
        )).toBe(true);
    });

    test('uniqueKey.missing is detected for cat_parent.uk_missing', () => {
        expect(report.some(difference =>
            (difference.category === 'uniqueKey.missing') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'uk_missing')
        )).toBe(true);
    });

    test('uniqueKey.unexpected is detected for cat_parent.uk_unexpected', () => {
        expect(report.some(difference =>
            (difference.category === 'uniqueKey.unexpected') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'uk_unexpected')
        )).toBe(true);
    });

    test('uniqueKey.columns is detected for cat_parent.uk_columns', () => {
        expect(report.some(difference =>
            (difference.category === 'uniqueKey.columns') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'uk_columns')
        )).toBe(true);
    });

    test('index.missing is detected for cat_parent.idx_missing', () => {
        expect(report.some(difference =>
            (difference.category === 'index.missing') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'idx_missing')
        )).toBe(true);
    });

    test('index.unexpected is detected for cat_parent.idx_unexpected', () => {
        expect(report.some(difference =>
            (difference.category === 'index.unexpected') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'idx_unexpected')
        )).toBe(true);
    });

    test('index.columns is detected for cat_parent.idx_columns', () => {
        expect(report.some(difference =>
            (difference.category === 'index.columns') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'idx_columns')
        )).toBe(true);
    });

    test('index.type is detected for cat_parent.idx_type', () => {
        expect(report.some(difference =>
            (difference.category === 'index.type') && (difference.tableName === 'cat_parent')
                && (difference.targetName === 'idx_type')
        )).toBe(true);
    });

    test('foreignKey.missing is detected for cat_child.parent_ref_b', () => {
        expect(report.some(difference =>
            (difference.category === 'foreignKey.missing') && (difference.tableName === 'cat_child')
                && (difference.targetName === 'parent_ref_b')
        )).toBe(true);
    });

    test('foreignKey.unexpected is detected for cat_child.parent_ref_c', () => {
        expect(report.some(difference =>
            (difference.category === 'foreignKey.unexpected') && (difference.tableName === 'cat_child')
                && (difference.targetName === 'parent_ref_c')
        )).toBe(true);
    });

    test('foreignKey.reference is detected for cat_child.parent_ref_a', () => {
        expect(report.some(difference =>
            (difference.category === 'foreignKey.reference') && (difference.tableName === 'cat_child')
                && (difference.targetName === 'parent_ref_a')
        )).toBe(true);
    });

    test('no categories other than the expected 21 are reported', () => {
        const actualCategories = new Set(report.map(difference => difference.category));
        expect(actualCategories).toEqual(new Set(EXPECTED_CATEGORIES));
    });
});
