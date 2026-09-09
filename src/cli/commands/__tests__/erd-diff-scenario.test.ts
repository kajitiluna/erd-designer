import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { erdDifference } from '~/cli/commands/erd-diff';
import CommandRunner from '~/cli/command-runner';
import ColorValue from '~/models/ColorValue';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import { DatabaseType } from '~/models/database/DatabaseType';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import DbSchemaModel from '~/models/database/DbSchemaModel';
import RelationModel, { TableReferenceActionType } from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import { TableIndexType } from '~/models/database/TableIndexSupport';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import ErdDocument from '~/models/ErdDocument';
import LineViewModel from '~/models/LineViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import { SchemaDifference } from '~/models/schema/schema-difference';
import TableViewModel from '~/models/TableViewModel';

let workDirectory: string;
let logLines: string[];
let errorLines: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-diff-scenario-'));
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

const findColumnType = (name: string, databaseType: DatabaseType = 'mysql') => {
    const columnType = findDatabaseColumns(databaseType).find(candidate => candidate.name === name);
    if (columnType == null) {
        throw new Error(`column type not found: ${databaseType}/${name}`);
    }
    return columnType;
};

const writeDocument = (fileName: string, erdDocument: ErdDocument): string => {
    const filePath = path.join(workDirectory, fileName);
    fs.writeFileSync(filePath, JSON.stringify(erdDocument.toJSON(), null, 4));
    return filePath;
};

type DiffRunResult = { differences: SchemaDifference[] };

// erdDifference は1回の実行で console.log を1回だけ呼ぶため、直前までのログを捨ててから実行する
// (同一テスト内で複数回呼んでも前回分の出力と混ざらないようにするため)。
const runErdDiff = async (
    currentDocument: ErdDocument, baseDocument: ErdDocument, extraArgs: string[] = []
): Promise<DiffRunResult> => {
    const currentPath = writeDocument('current.erd', currentDocument);
    const basePath = writeDocument('base.erd', baseDocument);
    logLines.length = 0;

    await CommandRunner.execute(erdDifference, [
        '--file', currentPath, '--from', basePath, '--format', 'json', ...extraArgs
    ]);

    const output = logLines.join('\n');
    return JSON.parse(output) as DiffRunResult;
};

const findTableView = (document: ErdDocument, tableModelId: string): TableViewModel => {
    const tableView = document.findTableViewModel(tableModelId);
    if (tableView == null) {
        throw new Error(`table view not found: ${tableModelId}`);
    }
    return tableView;
};

const findSimpleColumn = (document: ErdDocument, columnModelId: string): SimpleColumnModel => {
    const columnModel = document.findColumnModel(columnModelId);
    if ((columnModel == null) || (ColumnModel.isSimpleColumn(columnModel) === false)) {
        throw new Error(`simple column not found: ${columnModelId}`);
    }
    return columnModel;
};

const findColumnShare = (document: ErdDocument, columnShareModelId: string): ColumnShareModel => {
    const columnShare = document.findColumnShareModel(columnShareModelId);
    if (columnShare == null) {
        throw new Error(`column share not found: ${columnShareModelId}`);
    }
    return columnShare;
};

// updateTableViewWithColumns の updatingColumns は「変更差分」ではなく「テーブルの全カラム」を渡す
// 実装規約になっている(src/agent-tools/tools/columns.ts 等の呼び出し元を参照)。
// これを守らないと、更新対象に含めなかった既存のPK列が「削除された」と誤認識され、
// リレーションの列構成が意図せず書き換わってしまう。
const allColumnsOfTable = (document: ErdDocument, tableModelId: string): SimpleColumnModel[] => {
    const tableView = findTableView(document, tableModelId);
    return document.toAllColumnsExceptStruct(tableView.tableModel);
};

const replaceSimpleColumn = (columnModel: SimpleColumnModel, replacement: SimpleColumnModel): SimpleColumnModel => {
    return (columnModel.columnModelId === replacement.columnModelId) ? replacement : columnModel;
};

// 列構成(columnEntries)を変えずに、既存カラム1件の属性だけを書き換える。
const replaceColumnInTable = (document: ErdDocument, tableModelId: string, nextColumn: SimpleColumnModel): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const updatingColumns = allColumnsOfTable(document, tableModelId)
        .map(columnModel => replaceSimpleColumn(columnModel, nextColumn));

    return document.updateTableViewWithColumns(tableView, updatingColumns);
};

const addColumnToTable = (
    document: ErdDocument, tableModelId: string, columnModel: SimpleColumnModel, columnShareModel: ColumnShareModel
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries = [
        ...tableView.tableModel.columnEntries,
        { modelType: 'single', columnModelId: columnModel.columnModelId } as ColumnEntry
    ];
    const nextTableView = new TableViewModel({
        ...tableView, tableModel: new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries })
    });
    const nextShareStorage = document.getColumnShareModelStorage().addColumnShare(columnShareModel);
    const updatingColumns = [...allColumnsOfTable(document, tableModelId), columnModel];

    return document.updateTableViewWithColumns(nextTableView, updatingColumns, nextShareStorage);
};

const removeColumnFromTable = (document: ErdDocument, tableModelId: string, columnModelId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries = tableView.tableModel.columnEntries
        .filter(entry => (entry.modelType !== 'single') || (entry.columnModelId !== columnModelId));
    const nextTableView = new TableViewModel({
        ...tableView, tableModel: new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries })
    });
    const remainingColumns = allColumnsOfTable(document, tableModelId)
        .filter(columnModel => (columnModel.columnModelId !== columnModelId));

    return document.updateTableViewWithColumns(nextTableView, remainingColumns);
};

// 型変更は共有カラム定義(ColumnShareModel)側の属性であり、テーブルの列構成には触れないため
// updateColumnModels で完結する(updateTableViewWithColumns の全カラム引き渡し規約は関係しない)。
const changeColumnType = (document: ErdDocument, columnShareModelId: string, columnTypeName: string): ErdDocument => {
    const previousShare = findColumnShare(document, columnShareModelId);
    const nextShare = new ColumnShareModel({
        columnShareModelId: previousShare.columnShareModelId,
        physicalName: previousShare.physicalName,
        logicalName: previousShare.logicalName,
        columnType: findColumnType(columnTypeName),
        description: previousShare.description,
        checkExpression: previousShare.checkExpression,
        optionExpression: previousShare.optionExpression
    });

    return document.updateColumnModels([], [nextShare]);
};

const changeColumnNotNull = (document: ErdDocument, columnModelId: string, notNull: boolean): ErdDocument => {
    const previousColumn = findSimpleColumn(document, columnModelId);
    const nextColumn = new SimpleColumnModel({ ...previousColumn, notNull });

    return document.updateColumnModels([nextColumn], []);
};

const changeColumnDefault = (document: ErdDocument, columnModelId: string, defaultValue: string): ErdDocument => {
    const previousColumn = findSimpleColumn(document, columnModelId);
    const nextColumn = new SimpleColumnModel({ ...previousColumn, defaultValue });

    return document.updateColumnModels([nextColumn], []);
};

const addUniqueKeyToTable = (
    document: ErdDocument, tableModelId: string, uniqueKeysModel: TableUniqueKeysModel
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextUniqueKeysModels = [...tableView.tableModel.uniqueKeysModels, uniqueKeysModel];
    const nextTableModel = new TableModel({ ...tableView.tableModel, uniqueKeysModels: nextUniqueKeysModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const addIndexToTable = (document: ErdDocument, tableModelId: string, indexModel: TableIndexModel): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = [...tableView.tableModel.tableIndexModels, indexModel];
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const replaceIndexType = (
    indexModel: TableIndexModel, tableIndexModelId: string, indexType: TableIndexType
): TableIndexModel => {
    return (indexModel.tableIndexModelId === tableIndexModelId)
        ? new TableIndexModel({ ...indexModel, indexColumnModels: [...indexModel.indexColumnModels], indexType })
        : indexModel;
};

const changeIndexType = (
    document: ErdDocument, tableModelId: string, tableIndexModelId: string, indexType: TableIndexType
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = tableView.tableModel.tableIndexModels
        .map(indexModel => replaceIndexType(indexModel, tableIndexModelId, indexType));
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

// ExportDdlSettingModel の commentStyle は既定で "logical_name" であり、この設定下では
// テーブルコメントは description ではなく logicalName から決まる(ddl-comment.ts の initDdlComment を参照)。
// そのためコメント変更のテストは logicalName を書き換える。
const changeTableComment = (document: ErdDocument, tableModelId: string, logicalName: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextTableModel = new TableModel({ ...tableView.tableModel, logicalName });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const addTableToDocument = (
    document: ErdDocument, tableView: TableViewModel, columns: SimpleColumnModel[], shares: ColumnShareModel[]
): ErdDocument => {
    const nextShareStorage = document.getColumnShareModelStorage().addColumnShare(...shares);

    return document.updateTableViewWithColumns(tableView, columns, nextShareStorage);
};

const changeForeignKeyOnDelete = (
    document: ErdDocument, relationModelId: string, onDeleteAction: TableReferenceActionType
): ErdDocument => {
    const previousView = document.findRelationViewModel(relationModelId);
    if (previousView == null) {
        throw new Error(`relation not found: ${relationModelId}`);
    }
    const nextModel = new RelationModel({
        ...previousView.relationModel, relationPairs: [...previousView.relationModel.relationPairs], onDeleteAction
    });

    return document.updateRelation(previousView.updateRelationModel(nextModel));
};

const addSchema = (document: ErdDocument, schemaName: string): ErdDocument => {
    const nextSchema = DbSchemaModel.create(schemaName, '');
    const nextConfig = DbSchemaConfig.create({
        defaultSchemaId: document.schemaConfig.defaultSchemaId,
        schemas: [...document.schemaConfig.getSchemas(), nextSchema]
    });

    return document.updateSchema(nextConfig);
};

// S1〜S3 で共有する基準ドキュメントの ID。テストをまたいで固定することで、
// 同じ編集を異なる順序で組み合わせても最終状態が決定的になるようにしている(S3で必要)。
const FIXTURE_IDS = {
    tableUser: 'table-user',
    tableOrder: 'table-order',
    shareUserId: 'share-user-id',
    shareUserName: 'share-user-name',
    shareUserEmail: 'share-user-email',
    shareOrderId: 'share-order-id',
    shareOrderUserId: 'share-order-user-id',
    shareOrderBackupOwnerId: 'share-order-backup-owner-id',
    shareOrderQuantity: 'share-order-quantity',
    columnUserId: 'col-user-id',
    columnUserName: 'col-user-name',
    columnUserEmail: 'col-user-email',
    columnOrderId: 'col-order-id',
    columnOrderUserId: 'col-order-user-id',
    columnOrderBackupOwnerId: 'col-order-backup-owner-id',
    columnOrderQuantity: 'col-order-quantity',
    indexUserName: 'idx-user-name',
    relationOrderUser: 'rel-order-user'
} as const;

type Fixture = { document: ErdDocument };

// user (親, PK=id) / order (子, user_id で user.id を参照) の2テーブル構成。
// - user.name には既存インデックス idx_user_name を持たせておき、種別変更のテストに使う。
// - order.backup_owner_id は両ドキュメントに最初から存在する未使用列で、
//   FK追加のテストで「子テーブルに元々ある列を参照する」ケースに使う
//   (存在しない列を参照すると updateRelation が列を自動生成する副作用が別途発生するため、
//   その副作用そのものを検証する S2 のテストとは切り分ける)。
const buildFixture = (): Fixture => {
    const shareUserId = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareUserId, physicalName: 'id', logicalName: 'id',
        columnType: findColumnType('int')
    });
    const shareUserName = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareUserName, physicalName: 'name', logicalName: 'name',
        columnType: findColumnType('int')
    });
    const shareUserEmail = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareUserEmail, physicalName: 'email', logicalName: 'email',
        columnType: findColumnType('char')
    });
    const shareOrderId = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareOrderId, physicalName: 'id', logicalName: 'id',
        columnType: findColumnType('int')
    });
    const shareOrderUserId = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareOrderUserId, physicalName: 'user_id', logicalName: 'user_id',
        columnType: findColumnType('int')
    });
    const shareOrderBackupOwnerId = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareOrderBackupOwnerId, physicalName: 'backup_owner_id',
        logicalName: 'backup_owner_id', columnType: findColumnType('int')
    });
    const shareOrderQuantity = new ColumnShareModel({
        columnShareModelId: FIXTURE_IDS.shareOrderQuantity, physicalName: 'quantity', logicalName: 'quantity',
        columnType: findColumnType('int')
    });

    const columnUserId = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnUserId, columnShareModelId: FIXTURE_IDS.shareUserId,
        primaryKey: true, notNull: true
    });
    const columnUserName = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnUserName, columnShareModelId: FIXTURE_IDS.shareUserName, notNull: true
    });
    const columnUserEmail = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnUserEmail, columnShareModelId: FIXTURE_IDS.shareUserEmail, notNull: true
    });
    const columnOrderId = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnOrderId, columnShareModelId: FIXTURE_IDS.shareOrderId,
        primaryKey: true, notNull: true
    });
    const columnOrderUserId = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnOrderUserId, columnShareModelId: FIXTURE_IDS.shareOrderUserId, notNull: true
    });
    const columnOrderBackupOwnerId = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnOrderBackupOwnerId,
        columnShareModelId: FIXTURE_IDS.shareOrderBackupOwnerId
    });
    const columnOrderQuantity = new SimpleColumnModel({
        columnModelId: FIXTURE_IDS.columnOrderQuantity, columnShareModelId: FIXTURE_IDS.shareOrderQuantity,
        notNull: true, defaultValue: '1'
    });

    const userTableModel = new TableModel({
        tableModelId: FIXTURE_IDS.tableUser, physicalName: 'user',
        columnEntries: [FIXTURE_IDS.columnUserId, FIXTURE_IDS.columnUserName, FIXTURE_IDS.columnUserEmail]
            .map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[],
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: FIXTURE_IDS.indexUserName, physicalName: 'idx_user_name',
                indexColumnModels: [new IndexColumnModel({ columnModelId: FIXTURE_IDS.columnUserName })]
            })
        ]
    });
    const orderTableModel = new TableModel({
        tableModelId: FIXTURE_IDS.tableOrder, physicalName: 'order',
        columnEntries: [
            FIXTURE_IDS.columnOrderId, FIXTURE_IDS.columnOrderUserId,
            FIXTURE_IDS.columnOrderBackupOwnerId, FIXTURE_IDS.columnOrderQuantity
        ].map(columnModelId => { return { modelType: 'single', columnModelId }; }) as ColumnEntry[]
    });

    const userTableView = new TableViewModel({
        tableModel: userTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS
    });
    const orderTableView = new TableViewModel({
        tableModel: orderTableModel, corner: { top: 0, left: 300 }, headerColor: TEST_COLORS
    });

    const relationModel = new RelationModel({
        relationModelId: FIXTURE_IDS.relationOrderUser,
        parentTableModelId: FIXTURE_IDS.tableUser, childTableModelId: FIXTURE_IDS.tableOrder,
        relationPairs: [new RelationPair({
            parentColumnModelId: FIXTURE_IDS.columnUserId, childColumnModelId: FIXTURE_IDS.columnOrderUserId
        })]
    });
    const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });

    const document = ErdDocument.create({
        documentName: 'erd-diff-scenario', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [userTableView, orderTableView],
        columnModels: [
            columnUserId, columnUserName, columnUserEmail,
            columnOrderId, columnOrderUserId, columnOrderBackupOwnerId, columnOrderQuantity
        ],
        columnShareModels: [
            shareUserId, shareUserName, shareUserEmail,
            shareOrderId, shareOrderUserId, shareOrderBackupOwnerId, shareOrderQuantity
        ],
        relationViewModels: [relationView]
    });

    return { document };
};

// スキーマ追加のテスト専用。postgres は明示スキーマを1つも作らなくても実際には
// "public" に作成されるため(design-snapshot.ts の既定スキーマ補完)、
// 最初から "public" を1つ宣言した状態を基準にし、2つ目のスキーマ追加だけを差分として検出させる。
const buildPostgresFixture = (): Fixture => {
    const schema = DbSchemaModel.create('public', '');
    const share = new ColumnShareModel({
        columnShareModelId: 'pg-share-account-id', physicalName: 'account_id', logicalName: 'account_id',
        columnType: findColumnType('integer', 'postgres')
    });
    const column = new SimpleColumnModel({
        columnModelId: 'pg-col-account-id', columnShareModelId: 'pg-share-account-id',
        primaryKey: true, notNull: true
    });
    const tableModel = new TableModel({
        tableModelId: 'pg-table-account', physicalName: 'account',
        columnEntries: [{ modelType: 'single', columnModelId: 'pg-col-account-id' }] as ColumnEntry[]
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    const document = ErdDocument.create({
        documentName: 'erd-diff-scenario-postgres', databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create({ defaultSchemaId: schema.schemaId, schemas: [schema] }),
        tableViewModels: [tableView], columnModels: [column], columnShareModels: [share]
    });

    return { document };
};

describe('S1: a single edit operation produces exactly the corresponding difference category', () => {
    test('adding a table is reported as table.missing', async () => {
        const fixture = buildFixture();
        const share = new ColumnShareModel({
            columnShareModelId: 'share-category-id', physicalName: 'id', logicalName: 'id',
            columnType: findColumnType('int')
        });
        const column = new SimpleColumnModel({
            columnModelId: 'col-category-id', columnShareModelId: 'share-category-id',
            primaryKey: true, notNull: true
        });
        const tableModel = new TableModel({
            tableModelId: 'table-category', physicalName: 'category',
            columnEntries: [{ modelType: 'single', columnModelId: 'col-category-id' }] as ColumnEntry[]
        });
        const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 600 }, headerColor: TEST_COLORS });
        const edited = addTableToDocument(fixture.document, tableView, [column], [share]);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'table.missing', targetName: 'category' });
    });

    test('deleting a table is reported as table.unexpected', async () => {
        const fixture = buildFixture();
        const edited = fixture.document.deleteTable(FIXTURE_IDS.tableOrder);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'table.unexpected', targetName: 'order' });
    });

    test('adding a column is reported as column.missing', async () => {
        const fixture = buildFixture();
        const share = new ColumnShareModel({
            columnShareModelId: 'share-user-nickname', physicalName: 'nickname', logicalName: 'nickname',
            columnType: findColumnType('char')
        });
        const column = new SimpleColumnModel({ columnModelId: 'col-user-nickname', columnShareModelId: 'share-user-nickname' });
        const edited = addColumnToTable(fixture.document, FIXTURE_IDS.tableUser, column, share);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.missing', tableName: 'user', targetName: 'nickname' });
    });

    test('deleting a column is reported as column.unexpected', async () => {
        const fixture = buildFixture();
        const edited = removeColumnFromTable(fixture.document, FIXTURE_IDS.tableUser, FIXTURE_IDS.columnUserEmail);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.unexpected', tableName: 'user', targetName: 'email' });
    });

    test('changing a column type is reported as column.type', async () => {
        const fixture = buildFixture();
        const edited = changeColumnType(fixture.document, FIXTURE_IDS.shareOrderQuantity, 'char');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.type', tableName: 'order', targetName: 'quantity' });
    });

    test('changing NOT NULL is reported as column.nullability', async () => {
        const fixture = buildFixture();
        const edited = changeColumnNotNull(fixture.document, FIXTURE_IDS.columnUserEmail, false);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.nullability', tableName: 'user', targetName: 'email' });
    });

    test('changing a default value is reported as column.default', async () => {
        const fixture = buildFixture();
        const edited = changeColumnDefault(fixture.document, FIXTURE_IDS.columnOrderQuantity, '5');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.default', tableName: 'order', targetName: 'quantity' });
    });

    test('changing the primary key composition is reported as primaryKey', async () => {
        const fixture = buildFixture();
        const previousColumn = findSimpleColumn(fixture.document, FIXTURE_IDS.columnOrderBackupOwnerId);
        const nextColumn = new SimpleColumnModel({ ...previousColumn, primaryKey: true });
        const edited = replaceColumnInTable(fixture.document, FIXTURE_IDS.tableOrder, nextColumn);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'primaryKey', tableName: 'order' });
    });

    test('adding a UNIQUE constraint is reported as uniqueKey.missing', async () => {
        const fixture = buildFixture();
        const uniqueKeysModel = new TableUniqueKeysModel({
            tableUniqueKeysModelId: 'uk-user-email', physicalName: 'uk_user_email',
            uniqueKeysColumnModels: [new UniqueKeysColumnModel({
                columnModelId: FIXTURE_IDS.columnUserEmail, sortOrderType: ''
            })]
        });
        const edited = addUniqueKeyToTable(fixture.document, FIXTURE_IDS.tableUser, uniqueKeysModel);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'uniqueKey.missing', tableName: 'user', targetName: 'uk_user_email' });
    });

    test('adding an index is reported as index.missing', async () => {
        const fixture = buildFixture();
        const indexModel = new TableIndexModel({
            tableIndexModelId: 'idx-order-quantity', physicalName: 'idx_order_quantity',
            indexColumnModels: [new IndexColumnModel({ columnModelId: FIXTURE_IDS.columnOrderQuantity })]
        });
        const edited = addIndexToTable(fixture.document, FIXTURE_IDS.tableOrder, indexModel);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'index.missing', tableName: 'order', targetName: 'idx_order_quantity' });
    });

    test('changing an index type is reported as index.type', async () => {
        const fixture = buildFixture();
        const edited = changeIndexType(fixture.document, FIXTURE_IDS.tableUser, FIXTURE_IDS.indexUserName, 'HASH');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'index.type', tableName: 'user', targetName: 'idx_user_name' });
    });

    test('adding a foreign key is reported as foreignKey.missing', async () => {
        const fixture = buildFixture();
        const relationModel = new RelationModel({
            relationModelId: 'rel-order-user-backup',
            parentTableModelId: FIXTURE_IDS.tableUser, childTableModelId: FIXTURE_IDS.tableOrder,
            childCardinality: '0..1',
            relationPairs: [new RelationPair({
                parentColumnModelId: FIXTURE_IDS.columnUserId, childColumnModelId: FIXTURE_IDS.columnOrderBackupOwnerId
            })]
        });
        const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });
        const edited = fixture.document.updateRelation(relationView);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'foreignKey.missing', tableName: 'order', targetName: 'backup_owner_id' });
    });

    test('deleting a foreign key is reported as foreignKey.unexpected', async () => {
        const fixture = buildFixture();
        const edited = fixture.document.deleteRelation(FIXTURE_IDS.relationOrderUser);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'foreignKey.unexpected', tableName: 'order', targetName: 'user_id' });
    });

    test('changing a foreign key ON DELETE action is reported as foreignKey.reference', async () => {
        const fixture = buildFixture();
        const edited = changeForeignKeyOnDelete(fixture.document, FIXTURE_IDS.relationOrderUser, 'CASCADE');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'foreignKey.reference', tableName: 'order', targetName: 'user_id' });
    });

    test('changing a table comment is reported as table.comment', async () => {
        const fixture = buildFixture();
        const edited = changeTableComment(fixture.document, FIXTURE_IDS.tableUser, 'Registered users');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'table.comment', targetName: 'user' });
    });

    test('adding a schema is reported as schema.missing', async () => {
        const fixture = buildPostgresFixture();
        const edited = addSchema(fixture.document, 'billing');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'schema.missing', targetName: 'billing' });
    });
});

describe('S4: scope options suppress the corresponding difference categories', () => {
    test('--no-index suppresses an added index', async () => {
        const fixture = buildFixture();
        const indexModel = new TableIndexModel({
            tableIndexModelId: 'idx-order-quantity', physicalName: 'idx_order_quantity',
            indexColumnModels: [new IndexColumnModel({ columnModelId: FIXTURE_IDS.columnOrderQuantity })]
        });
        const edited = addIndexToTable(fixture.document, FIXTURE_IDS.tableOrder, indexModel);

        const result = await runErdDiff(edited, fixture.document, ['--no-index']);

        expect(result.differences).toEqual([]);
    });

    test('--no-foreign-key suppresses an added foreign key', async () => {
        const fixture = buildFixture();
        const relationModel = new RelationModel({
            relationModelId: 'rel-order-user-backup',
            parentTableModelId: FIXTURE_IDS.tableUser, childTableModelId: FIXTURE_IDS.tableOrder,
            childCardinality: '0..1',
            relationPairs: [new RelationPair({
                parentColumnModelId: FIXTURE_IDS.columnUserId, childColumnModelId: FIXTURE_IDS.columnOrderBackupOwnerId
            })]
        });
        const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });
        const edited = fixture.document.updateRelation(relationView);

        const result = await runErdDiff(edited, fixture.document, ['--no-foreign-key']);

        expect(result.differences).toEqual([]);
    });

    test('--no-comment suppresses a table comment change', async () => {
        const fixture = buildFixture();
        const edited = changeTableComment(fixture.document, FIXTURE_IDS.tableUser, 'Registered users');

        const result = await runErdDiff(edited, fixture.document, ['--no-comment']);

        expect(result.differences).toEqual([]);
    });

    test('--ignore-table excludes an added column on the matching table entirely', async () => {
        const fixture = buildFixture();
        const share = new ColumnShareModel({
            columnShareModelId: 'share-order-note', physicalName: 'note', logicalName: 'note',
            columnType: findColumnType('char')
        });
        const column = new SimpleColumnModel({ columnModelId: 'col-order-note', columnShareModelId: 'share-order-note' });
        const edited = addColumnToTable(fixture.document, FIXTURE_IDS.tableOrder, column, share);

        const result = await runErdDiff(edited, fixture.document, ['--ignore-table', '^order$']);

        expect(result.differences).toEqual([]);
    });
});
