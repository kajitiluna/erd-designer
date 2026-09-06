// db-diff の PostgreSQL 向け実DB統合テスト(24差分カテゴリの網羅の観点)。
// column.logicalName は実DBが論理名を持たないため db-diff では構造的に発生しない(withLogicalName=false固定)。
// そのため対象は残り23カテゴリ(src/models/schema/schema-difference.ts の DifferenceCategory を参照)。
//
// 1つの包括フィクスチャ(DDL + .erd)に23カテゴリ分の不一致を同時に仕込み、db-diff の実行結果(JSON)を
// beforeEach で1度だけ取得して `report` に保持し、各カテゴリを個別の test() で検証する。
//
// ただし schema.unexpected だけは例外的に2回目の db-diff 実行が要る。db-diff の --schema はPostgreSQLの
// 対象スキーマを1つだけ指定するオプションで、--schema 未指定時は「.erd の設計側テーブルが実際に使っている
// スキーマ」だけを問い合わせる(DbDriver.toPostgresTargetSchemas / SchemaCompareOptions.toSnapshotTarget を参照)。
// つまり、design 側のどのテーブルにも紐付かない「実DBにだけ存在する未知のスキーマ」は、通常の1回の実行では
// そもそも問い合わせ対象に入らず検出しようがない。schema.unexpected を再現するには、そのスキーマを
// --schema で明示指定した2回目の実行が構造的に必須になる(この2回目は schema.unexpected 以外の差分は
// 全テーブルが table.missing 化するなど無意味になるため、schema.unexpected 差分だけを合流させる)。
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

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
import { DifferenceCategory, SchemaDifference } from '~/models/schema/schema-difference';
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

const writeErdDocument = (workDirectory: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, 'design.erd');
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

type DbDiffRunResult = { result: SchemaCommandResult, report: { differences: SchemaDifference[] } };

// console.log を実行のたびに個別のスパイで捕捉するため、2回連続で呼んでも前回分の出力と混ざらない。
const runDbDiff = async (
    workDirectory: string, erdDocument: ErdDocument, dsn: string, extraArgs: readonly string[] = []
): Promise<DbDiffRunResult> => {
    const erdPath = writeErdDocument(workDirectory, erdDocument);
    const capturedLines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => { capturedLines.push(String(message)); });

    try {
        const result = await CommandRunner.execute(
            dbDifference, ['--file', erdPath, '--dsn', dsn, '--format', 'json', ...extraArgs]
        );
        const report = JSON.parse(capturedLines.join('\n')) as { differences: SchemaDifference[] };

        return { result, report };
    } finally {
        logSpy.mockRestore();
    }
};

type ColumnBuild = { share: ColumnShareModel, column: SimpleColumnModel };

type ColumnSpec = {
    key: string;
    physicalName: string;
    columnTypeName: string;
    logicalName?: string;
    notNull?: boolean;
    primaryKey?: boolean;
    defaultValue?: string;
};

const buildColumn = (idPrefix: string, spec: ColumnSpec): ColumnBuild => {
    const share = new ColumnShareModel({
        columnShareModelId: `share-${idPrefix}-${spec.key}`, physicalName: spec.physicalName,
        logicalName: spec.logicalName ?? spec.physicalName, columnType: findColumnType(spec.columnTypeName)
    });
    const column = new SimpleColumnModel({
        columnModelId: `col-${idPrefix}-${spec.key}`, columnShareModelId: share.columnShareModelId,
        notNull: spec.notNull ?? false, primaryKey: spec.primaryKey ?? false, defaultValue: spec.defaultValue ?? ''
    });

    return { share, column };
};

const findColumnModelIdByPhysicalName = (builds: readonly ColumnBuild[], physicalName: string): string => {
    const found = builds.find(build => (build.share.physicalName === physicalName));
    if (found == null) {
        throw new Error(`column not found: ${physicalName}`);
    }
    return found.column.columnModelId;
};

// cat_parent の16列(design_only_col は design 側だけに存在し、DDL 側にはこの列を作らない)。
// db_only_col(DDL 側だけに存在)はここに含めず、DDL 生成側で別途 1 列を追加する。
const CAT_PARENT_COLUMN_SPECS: readonly ColumnSpec[] = [
    { key: 'id', physicalName: 'id', columnTypeName: 'serial', primaryKey: true, notNull: true },
    { key: 'design-only', physicalName: 'design_only_col', columnTypeName: 'varchar', notNull: true },
    { key: 'type-mismatch', physicalName: 'type_mismatch_col', columnTypeName: 'integer', notNull: true },
    { key: 'nullability', physicalName: 'nullability_col', columnTypeName: 'integer', notNull: false },
    { key: 'default', physicalName: 'default_col', columnTypeName: 'integer', notNull: true, defaultValue: '1' },
    { key: 'auto', physicalName: 'auto_col', columnTypeName: 'integer', notNull: true },
    {
        key: 'comment', physicalName: 'comment_col', columnTypeName: 'integer', notNull: true,
        logicalName: 'design comment'
    },
    { key: 'uk-missing', physicalName: 'uk_missing_col', columnTypeName: 'integer', notNull: true },
    { key: 'uk-unexpected', physicalName: 'uk_unexpected_col', columnTypeName: 'integer', notNull: true },
    { key: 'shared-uk-a', physicalName: 'shared_uk_col_a', columnTypeName: 'integer', notNull: true },
    { key: 'shared-uk-b', physicalName: 'shared_uk_col_b', columnTypeName: 'integer', notNull: true },
    { key: 'idx-missing', physicalName: 'idx_missing_col', columnTypeName: 'integer', notNull: true },
    { key: 'idx-unexpected', physicalName: 'idx_unexpected_col', columnTypeName: 'integer', notNull: true },
    { key: 'shared-idx-a', physicalName: 'shared_idx_col_a', columnTypeName: 'integer', notNull: true },
    { key: 'shared-idx-b', physicalName: 'shared_idx_col_b', columnTypeName: 'integer', notNull: true },
    { key: 'idx-type', physicalName: 'idx_type_col', columnTypeName: 'integer', notNull: true }
];

type CategoriesFixture = { erdDocument: ErdDocument, billingSchemaName: string };

const buildCategoriesDocument = (schemaName: string): CategoriesFixture => {
    const mainSchema = DbSchemaModel.create(schemaName, '');
    const billingSchema = DbSchemaModel.create(integrationDdl.uniqueName('cat_billing'), '');
    const schemaConfig = DbSchemaConfig.create({
        defaultSchemaId: mainSchema.schemaId, schemas: [mainSchema, billingSchema]
    });
    const schemaId = mainSchema.schemaId;

    const catParentColumns = CAT_PARENT_COLUMN_SPECS.map(spec => buildColumn('parent', spec));
    const ukMissingColumnModelId = findColumnModelIdByPhysicalName(catParentColumns, 'uk_missing_col');
    const sharedUkColumnModelId = findColumnModelIdByPhysicalName(catParentColumns, 'shared_uk_col_a');
    const idxMissingColumnModelId = findColumnModelIdByPhysicalName(catParentColumns, 'idx_missing_col');
    const sharedIdxColumnModelId = findColumnModelIdByPhysicalName(catParentColumns, 'shared_idx_col_a');
    const idxTypeColumnModelId = findColumnModelIdByPhysicalName(catParentColumns, 'idx_type_col');
    const parentIdColumnModelId = findColumnModelIdByPhysicalName(catParentColumns, 'id');

    const catParentTable = new TableModel({
        tableModelId: 'table-cat-parent', physicalName: 'cat_parent', logicalName: 'Parent design comment', schemaId,
        columnEntries: toSingleColumnEntries(catParentColumns.map(build => build.column.columnModelId)),
        uniqueKeysModels: [
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-parent-missing', physicalName: 'uk_parent_missing',
                uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: ukMissingColumnModelId, sortOrderType: '' })]
            }),
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: 'uk-parent-shared', physicalName: 'uk_parent_shared',
                uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: sharedUkColumnModelId, sortOrderType: '' })]
            })
        ],
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: 'idx-parent-missing', physicalName: 'idx_parent_missing',
                indexColumnModels: [new IndexColumnModel({ columnModelId: idxMissingColumnModelId })]
            }),
            new TableIndexModel({
                tableIndexModelId: 'idx-parent-shared', physicalName: 'idx_parent_shared',
                indexColumnModels: [new IndexColumnModel({ columnModelId: sharedIdxColumnModelId })]
            }),
            new TableIndexModel({
                tableIndexModelId: 'idx-parent-type', physicalName: 'idx_parent_type',
                indexColumnModels: [new IndexColumnModel({ columnModelId: idxTypeColumnModelId })]
            })
        ]
    });

    // cat_widget: 複合PKの列構成不一致(design=[code] / DB=[code, rev])を primaryKey カテゴリとして検出させる。
    const widgetCode = buildColumn('widget', {
        key: 'code', physicalName: 'code', columnTypeName: 'integer', notNull: true, primaryKey: true
    });
    const widgetRev = buildColumn('widget', { key: 'rev', physicalName: 'rev', columnTypeName: 'integer', notNull: true });
    const catWidgetTable = new TableModel({
        tableModelId: 'table-cat-widget', physicalName: 'cat_widget', schemaId,
        columnEntries: toSingleColumnEntries([widgetCode.column.columnModelId, widgetRev.column.columnModelId])
    });

    // cat_child: 3本のFKで missing / unexpected / reference をそれぞれ独立した列に割り当てる。
    const childId = buildColumn('child', { key: 'id', physicalName: 'id', columnTypeName: 'serial', primaryKey: true, notNull: true });
    const fkMissing = buildColumn('child', { key: 'fk-missing', physicalName: 'fk_missing_col', columnTypeName: 'integer', notNull: true });
    const fkUnexpected = buildColumn(
        'child', { key: 'fk-unexpected', physicalName: 'fk_unexpected_col', columnTypeName: 'integer', notNull: true }
    );
    const fkReference = buildColumn(
        'child', { key: 'fk-reference', physicalName: 'fk_reference_col', columnTypeName: 'integer', notNull: true }
    );
    const catChildTable = new TableModel({
        tableModelId: 'table-cat-child', physicalName: 'cat_child', schemaId,
        columnEntries: toSingleColumnEntries([
            childId.column.columnModelId, fkMissing.column.columnModelId,
            fkUnexpected.column.columnModelId, fkReference.column.columnModelId
        ])
    });

    const relationMissing = new RelationModel({
        relationModelId: 'rel-child-missing', parentTableModelId: catParentTable.tableModelId,
        childTableModelId: catChildTable.tableModelId, onUpdateAction: 'NO ACTION', onDeleteAction: 'NO ACTION',
        relationPairs: [new RelationPair({
            parentColumnModelId: parentIdColumnModelId, childColumnModelId: fkMissing.column.columnModelId
        })]
    });
    const relationReference = new RelationModel({
        relationModelId: 'rel-child-reference', parentTableModelId: catParentTable.tableModelId,
        childTableModelId: catChildTable.tableModelId, onUpdateAction: 'NO ACTION', onDeleteAction: 'CASCADE',
        relationPairs: [new RelationPair({
            parentColumnModelId: parentIdColumnModelId, childColumnModelId: fkReference.column.columnModelId
        })]
    });

    // cat_missing_table: design にだけ存在し、DDL では一切作らない → table.missing。
    const missingTableId = buildColumn(
        'missing', { key: 'id', physicalName: 'id', columnTypeName: 'integer', notNull: true, primaryKey: true }
    );
    const catMissingTable = new TableModel({
        tableModelId: 'table-cat-missing', physicalName: 'cat_missing_table', schemaId,
        columnEntries: toSingleColumnEntries([missingTableId.column.columnModelId])
    });

    const tableViews = [catParentTable, catWidgetTable, catChildTable, catMissingTable].map((tableModel, index) => {
        return new TableViewModel({ tableModel, corner: { top: 0, left: index * 300 }, headerColor: TEST_COLORS });
    });
    const relationViews = [relationMissing, relationReference].map(relationModel => {
        return new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });
    });

    const allColumnBuilds = [
        ...catParentColumns, widgetCode, widgetRev, childId, fkMissing, fkUnexpected, fkReference, missingTableId
    ];

    const erdDocument = ErdDocument.create({
        documentName: 'pg-categories', databaseSettingModel: DatabaseSettingModel.create('postgres'), schemaConfig,
        tableViewModels: tableViews,
        columnModels: allColumnBuilds.map(build => build.column),
        columnShareModels: allColumnBuilds.map(build => build.share),
        relationViewModels: relationViews
    });

    return { erdDocument, billingSchemaName: billingSchema.schemaName };
};

const buildCategoriesDdl = (schemaName: string): readonly string[] => [
    `CREATE TABLE ${schemaName}.cat_parent (
        id SERIAL PRIMARY KEY,
        db_only_col INTEGER NOT NULL,
        type_mismatch_col BIGINT NOT NULL,
        nullability_col INTEGER NOT NULL,
        default_col INTEGER NOT NULL DEFAULT 2,
        auto_col SERIAL,
        comment_col INTEGER NOT NULL,
        uk_missing_col INTEGER NOT NULL,
        uk_unexpected_col INTEGER NOT NULL,
        shared_uk_col_a INTEGER NOT NULL,
        shared_uk_col_b INTEGER NOT NULL,
        idx_missing_col INTEGER NOT NULL,
        idx_unexpected_col INTEGER NOT NULL,
        shared_idx_col_a INTEGER NOT NULL,
        shared_idx_col_b INTEGER NOT NULL,
        idx_type_col INTEGER NOT NULL,
        CONSTRAINT uk_parent_unexpected UNIQUE (uk_unexpected_col),
        CONSTRAINT uk_parent_shared UNIQUE (shared_uk_col_a, shared_uk_col_b)
    )`,
    `COMMENT ON TABLE ${schemaName}.cat_parent IS 'Parent actual comment'`,
    `COMMENT ON COLUMN ${schemaName}.cat_parent.comment_col IS 'actual comment'`,
    `CREATE INDEX idx_parent_unexpected ON ${schemaName}.cat_parent (idx_unexpected_col)`,
    `CREATE INDEX idx_parent_shared ON ${schemaName}.cat_parent (shared_idx_col_a, shared_idx_col_b)`,
    `CREATE INDEX idx_parent_type ON ${schemaName}.cat_parent USING HASH (idx_type_col)`,
    `CREATE TABLE ${schemaName}.cat_widget (
        code INTEGER NOT NULL,
        rev INTEGER NOT NULL,
        PRIMARY KEY (code, rev)
    )`,
    `CREATE TABLE ${schemaName}.cat_child (
        id SERIAL PRIMARY KEY,
        fk_missing_col INTEGER NOT NULL,
        fk_unexpected_col INTEGER NOT NULL,
        fk_reference_col INTEGER NOT NULL,
        CONSTRAINT fk_child_unexpected FOREIGN KEY (fk_unexpected_col) REFERENCES ${schemaName}.cat_parent (id),
        CONSTRAINT fk_child_reference FOREIGN KEY (fk_reference_col) REFERENCES ${schemaName}.cat_parent (id)
    )`,
    `CREATE TABLE ${schemaName}.cat_unexpected_table (id SERIAL PRIMARY KEY)`
];

const EXPECTED_CATEGORIES: readonly DifferenceCategory[] = [
    'table.missing', 'table.unexpected', 'table.comment',
    'column.missing', 'column.unexpected', 'column.type', 'column.nullability',
    'column.default', 'column.autoIncrement', 'column.comment',
    'primaryKey',
    'uniqueKey.missing', 'uniqueKey.unexpected', 'uniqueKey.columns',
    'index.missing', 'index.unexpected', 'index.columns', 'index.type',
    'foreignKey.missing', 'foreignKey.unexpected', 'foreignKey.reference',
    'schema.missing', 'schema.unexpected'
];

const containsDifference = (
    differences: readonly SchemaDifference[], category: DifferenceCategory, targetName: string
): boolean => {
    return differences.some(difference => (difference.category === category) && (difference.targetName === targetName));
};

const postgresTargets = IntegrationDatabaseTargets.selected().filter(target => (target.databaseType === 'postgres'));

describe.each(postgresTargets)('db-diff postgres categories ($id)', target => {
    let workDirectory: string;
    let client: Client;
    let schemaName: string;
    let orphanSchemaName: string;
    let billingSchemaName: string;
    let dsn: string;
    let report: { differences: SchemaDifference[] };

    // DB接続・DDL投入・db-diff実行はこの describe ブロック(=DBバージョン)ごとに1回だけ行い、
    // 23件のカテゴリ検証テストで同じ report を読み合う(テストごとの再接続・再投入を避けるため beforeAll を使う)。
    beforeAll(async () => {
        workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-categories-'));
        dsn = IntegrationDatabaseTargets.resolveDsn(target);
        schemaName = integrationDdl.uniqueName('cat_main');
        orphanSchemaName = integrationDdl.uniqueName('cat_orphan');

        client = await integrationDdl.postgres.connect(dsn);
        await integrationDdl.postgres.createSchema(client, schemaName);
        // schema.unexpected 用: design側には一切宣言しない、実DBにだけ存在するスキーマ。
        await integrationDdl.postgres.createSchema(client, orphanSchemaName);
        await integrationDdl.postgres.execute(client, buildCategoriesDdl(schemaName));

        const fixture = buildCategoriesDocument(schemaName);
        billingSchemaName = fixture.billingSchemaName;

        const primary = await runDbDiff(workDirectory, fixture.erdDocument, dsn);
        // ヘッダコメントの通り、schema.unexpected だけは orphanSchemaName を明示指定した別実行が必要。
        const secondary = await runDbDiff(workDirectory, fixture.erdDocument, dsn, ['--schema', orphanSchemaName]);
        const schemaUnexpectedDifferences = secondary.report.differences.filter(
            difference => (difference.category === 'schema.unexpected')
        );

        report = { differences: [...primary.report.differences, ...schemaUnexpectedDifferences] };
    }, 30_000);

    afterAll(async () => {
        await integrationDdl.postgres.dropSchema(client, schemaName);
        await integrationDdl.postgres.dropSchema(client, orphanSchemaName);
        await client.end();
        fs.rmSync(workDirectory, { recursive: true, force: true });
    });

    test('table.missing is detected for cat_missing_table', () => {
        expect(containsDifference(report.differences, 'table.missing', 'cat_missing_table')).toBe(true);
    });

    test('table.unexpected is detected for cat_unexpected_table', () => {
        expect(containsDifference(report.differences, 'table.unexpected', 'cat_unexpected_table')).toBe(true);
    });

    test('table.comment is detected for cat_parent', () => {
        expect(containsDifference(report.differences, 'table.comment', 'cat_parent')).toBe(true);
    });

    test('column.missing is detected for design_only_col', () => {
        expect(containsDifference(report.differences, 'column.missing', 'design_only_col')).toBe(true);
    });

    test('column.unexpected is detected for db_only_col', () => {
        expect(containsDifference(report.differences, 'column.unexpected', 'db_only_col')).toBe(true);
    });

    test('column.type is detected for type_mismatch_col', () => {
        expect(containsDifference(report.differences, 'column.type', 'type_mismatch_col')).toBe(true);
    });

    test('column.nullability is detected for nullability_col', () => {
        expect(containsDifference(report.differences, 'column.nullability', 'nullability_col')).toBe(true);
    });

    test('column.default is detected for default_col', () => {
        expect(containsDifference(report.differences, 'column.default', 'default_col')).toBe(true);
    });

    test('column.autoIncrement is detected for auto_col', () => {
        expect(containsDifference(report.differences, 'column.autoIncrement', 'auto_col')).toBe(true);
    });

    test('column.comment is detected for comment_col', () => {
        expect(containsDifference(report.differences, 'column.comment', 'comment_col')).toBe(true);
    });

    test('primaryKey is detected for cat_widget', () => {
        expect(containsDifference(report.differences, 'primaryKey', 'cat_widget')).toBe(true);
    });

    test('uniqueKey.missing is detected for uk_parent_missing', () => {
        expect(containsDifference(report.differences, 'uniqueKey.missing', 'uk_parent_missing')).toBe(true);
    });

    test('uniqueKey.unexpected is detected for uk_parent_unexpected', () => {
        expect(containsDifference(report.differences, 'uniqueKey.unexpected', 'uk_parent_unexpected')).toBe(true);
    });

    test('uniqueKey.columns is detected for uk_parent_shared', () => {
        expect(containsDifference(report.differences, 'uniqueKey.columns', 'uk_parent_shared')).toBe(true);
    });

    test('index.missing is detected for idx_parent_missing', () => {
        expect(containsDifference(report.differences, 'index.missing', 'idx_parent_missing')).toBe(true);
    });

    test('index.unexpected is detected for idx_parent_unexpected', () => {
        expect(containsDifference(report.differences, 'index.unexpected', 'idx_parent_unexpected')).toBe(true);
    });

    test('index.columns is detected for idx_parent_shared', () => {
        expect(containsDifference(report.differences, 'index.columns', 'idx_parent_shared')).toBe(true);
    });

    test('index.type is detected for idx_parent_type', () => {
        expect(containsDifference(report.differences, 'index.type', 'idx_parent_type')).toBe(true);
    });

    test('foreignKey.missing is detected for fk_missing_col', () => {
        expect(containsDifference(report.differences, 'foreignKey.missing', 'fk_missing_col')).toBe(true);
    });

    test('foreignKey.unexpected is detected for fk_unexpected_col', () => {
        expect(containsDifference(report.differences, 'foreignKey.unexpected', 'fk_unexpected_col')).toBe(true);
    });

    test('foreignKey.reference is detected for fk_reference_col', () => {
        expect(containsDifference(report.differences, 'foreignKey.reference', 'fk_reference_col')).toBe(true);
    });

    test('schema.missing is detected for the billing schema', () => {
        expect(containsDifference(report.differences, 'schema.missing', billingSchemaName)).toBe(true);
    });

    test('schema.unexpected is detected for the orphan schema', () => {
        expect(containsDifference(report.differences, 'schema.unexpected', orphanSchemaName)).toBe(true);
    });

    test('no categories other than the expected 23 are reported', () => {
        const actualCategories = new Set(report.differences.map(difference => difference.category));
        expect(actualCategories).toEqual(new Set(EXPECTED_CATEGORIES));
    });
});
