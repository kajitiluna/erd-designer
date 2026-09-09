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
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { findDatabaseColumns } from '~/models/database/columns';
import DbSchemaModel from '~/models/database/DbSchemaModel';
import RelationModel, { TableReferenceActionType } from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableIndexModel, { IndexColumnModel } from '~/models/database/TableIndexModel';
import { TableIndexOption } from '~/models/database/TableIndexSupport';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import ErdDocument from '~/models/ErdDocument';
import ErdSettingModel from '~/models/ErdSettingModel';
import ExportDdlSettingModel from '~/models/ExportDdlSettingModel';
import LineViewModel from '~/models/LineViewModel';
import RelationViewModel from '~/models/RelationViewModel';
import { SchemaDifference } from '~/models/schema/schema-difference';
import TableViewModel from '~/models/TableViewModel';

let workDirectory: string;
let logLines: string[];
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-diff-stacked-'));
    logLines = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
        logLines.push(String(message));
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // do nothing
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

// erdDifference は1回の実行で console.log を1回だけ呼ぶため、直前までのログを捨ててから実行する。
const runErdDiff = async (currentDocument: ErdDocument, baseDocument: ErdDocument): Promise<DiffRunResult> => {
    const currentPath = writeDocument('current.erd', currentDocument);
    const basePath = writeDocument('base.erd', baseDocument);
    logLines.length = 0;

    await CommandRunner.execute(erdDifference, ['--file', currentPath, '--from', basePath, '--format', 'json']);

    const output = logLines.join('\n');
    return JSON.parse(output) as DiffRunResult;
};

const toDifferenceKeys = (differences: readonly SchemaDifference[]): string[] => {
    return differences.map(difference => `${difference.category}:${difference.targetName}`).sort();
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

// updateTableViewWithColumns の updatingColumns は「テーブルの全カラム」を渡す実装規約になっている。
// 一部だけを渡すと、渡さなかった既存PK列が「削除された」と誤認識され、リレーションの列構成が
// 意図せず書き換わる(doUpdateTableViewModelWithRelation が updatingColumns だけを基準に判定するため)。
const replaceColumnInTable = (document: ErdDocument, tableModelId: string, nextColumn: SimpleColumnModel): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const updatingColumns = document.toAllColumnsExceptStruct(tableView.tableModel)
        .map(columnModel => ((columnModel.columnModelId === nextColumn.columnModelId) ? nextColumn : columnModel));

    return document.updateTableViewWithColumns(tableView, updatingColumns);
};

const addColumnToTable = (
    document: ErdDocument, tableModelId: string, columnModel: SimpleColumnModel, columnShareModel: ColumnShareModel
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries: ColumnEntry[] = [
        ...tableView.tableModel.columnEntries, { modelType: 'single', columnModelId: columnModel.columnModelId }
    ];
    const nextTableView = new TableViewModel({
        ...tableView, tableModel: new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries })
    });
    const nextShareStorage = document.getColumnShareModelStorage().addColumnShare(columnShareModel);
    const updatingColumns = [...document.toAllColumnsExceptStruct(tableView.tableModel), columnModel];

    return document.updateTableViewWithColumns(nextTableView, updatingColumns, nextShareStorage);
};

const removeColumnFromTable = (document: ErdDocument, tableModelId: string, columnModelId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries = tableView.tableModel.columnEntries
        .filter(entry => (entry.modelType !== 'single') || (entry.columnModelId !== columnModelId));
    const nextTableView = new TableViewModel({
        ...tableView, tableModel: new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries })
    });
    const remainingColumns = document.toAllColumnsExceptStruct(tableView.tableModel)
        .filter(columnModel => (columnModel.columnModelId !== columnModelId));

    return document.updateTableViewWithColumns(nextTableView, remainingColumns);
};

// group エントリはメンバー列を toAllColumnsExceptStruct(nextTableModel) が展開してくれるため、
// updatingColumns は「更新後の columnEntries から機械的に導出する」だけで済む。
const addGroupEntryToTable = (document: ErdDocument, tableModelId: string, columnGroupId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries: ColumnEntry[] = [...tableView.tableModel.columnEntries, { modelType: 'group', columnGroupId }];
    const nextTableModel = new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries });
    const nextTableView = new TableViewModel({ ...tableView, tableModel: nextTableModel });
    const updatingColumns = document.toAllColumnsExceptStruct(nextTableModel);

    return document.updateTableViewWithColumns(nextTableView, updatingColumns);
};

const removeGroupEntryFromTable = (document: ErdDocument, tableModelId: string, columnGroupId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries = tableView.tableModel.columnEntries
        .filter(entry => (entry.modelType !== 'group') || (entry.columnGroupId !== columnGroupId));
    const nextTableModel = new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries });
    const nextTableView = new TableViewModel({ ...tableView, tableModel: nextTableModel });
    const updatingColumns = document.toAllColumnsExceptStruct(nextTableModel);

    return document.updateTableViewWithColumns(nextTableView, updatingColumns);
};

type ColumnShareOverrides = Partial<{
    precision: string, scale: string, unsigned: boolean, logicalName: string, description: string
}>;

// precision/scale/unsigned は型変更(columnType差し替え)とは別の関心であり、columnType はここでは常に
// 据え置く。scenario A(precision/unsigned)と scenario D(logicalName/description)の両方で使う汎用ヘルパー。
const updateColumnShare = (
    document: ErdDocument, columnShareModelId: string, overrides: ColumnShareOverrides
): ErdDocument => {
    const previous = findColumnShare(document, columnShareModelId);
    const nextShare = new ColumnShareModel({
        columnShareModelId: previous.columnShareModelId,
        physicalName: previous.physicalName,
        logicalName: overrides.logicalName ?? previous.logicalName,
        columnType: previous.columnType,
        precision: overrides.precision ?? previous.precision,
        scale: overrides.scale ?? previous.scale,
        unsigned: overrides.unsigned ?? previous.unsigned,
        description: overrides.description ?? previous.description,
        checkExpression: previous.checkExpression,
        optionExpression: previous.optionExpression
    });

    return document.updateColumnModels([], [nextShare]);
};

const changeColumnType = (document: ErdDocument, columnShareModelId: string, columnTypeName: string): ErdDocument => {
    const previous = findColumnShare(document, columnShareModelId);
    const nextShare = new ColumnShareModel({
        columnShareModelId: previous.columnShareModelId,
        physicalName: previous.physicalName,
        logicalName: previous.logicalName,
        columnType: findColumnType(columnTypeName),
        description: previous.description,
        checkExpression: previous.checkExpression,
        optionExpression: previous.optionExpression
    });

    return document.updateColumnModels([], [nextShare]);
};

// primaryKey はここでは意図的に扱わない — PKの昇格/降格はリレーションの列構成に波及するため、
// 常に replaceColumnInTable(updateTableViewWithColumns 経由)を通す必要がある。updateColumnModels
// で直接 primaryKey を書き換えると、その波及処理を素通りしてしまう。
type SimpleColumnOverrides = Partial<{ notNull: boolean, unique: boolean, autoIncrement: boolean, defaultValue: string }>;

const updateSimpleColumnAttributes = (
    document: ErdDocument, columnModelId: string, overrides: SimpleColumnOverrides
): ErdDocument => {
    const previous = findSimpleColumn(document, columnModelId);
    const nextColumn = new SimpleColumnModel({ ...previous, ...overrides });

    return document.updateColumnModels([nextColumn], []);
};

const addUniqueKeyToTable = (document: ErdDocument, tableModelId: string, uniqueKeysModel: TableUniqueKeysModel): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextUniqueKeysModels = [...tableView.tableModel.uniqueKeysModels, uniqueKeysModel];
    const nextTableModel = new TableModel({ ...tableView.tableModel, uniqueKeysModels: nextUniqueKeysModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const removeUniqueKeyFromTable = (document: ErdDocument, tableModelId: string, tableUniqueKeysModelId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextUniqueKeysModels = tableView.tableModel.uniqueKeysModels
        .filter(model => (model.tableUniqueKeysModelId !== tableUniqueKeysModelId));
    const nextTableModel = new TableModel({ ...tableView.tableModel, uniqueKeysModels: nextUniqueKeysModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const replaceUniqueKeyColumns = (
    document: ErdDocument, tableModelId: string, tableUniqueKeysModelId: string, columnModelIds: readonly string[]
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumns = columnModelIds.map(columnModelId => new UniqueKeysColumnModel({ columnModelId, sortOrderType: '' }));
    const nextUniqueKeysModels = tableView.tableModel.uniqueKeysModels.map(model =>
        ((model.tableUniqueKeysModelId === tableUniqueKeysModelId)
            ? new TableUniqueKeysModel({ ...model, uniqueKeysColumnModels: nextColumns })
            : model)
    );
    const nextTableModel = new TableModel({ ...tableView.tableModel, uniqueKeysModels: nextUniqueKeysModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const addIndexToTable = (document: ErdDocument, tableModelId: string, indexModel: TableIndexModel): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = [...tableView.tableModel.tableIndexModels, indexModel];
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const removeIndexFromTable = (document: ErdDocument, tableModelId: string, tableIndexModelId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = tableView.tableModel.tableIndexModels
        .filter(model => (model.tableIndexModelId !== tableIndexModelId));
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const changeIndexOption = (
    document: ErdDocument, tableModelId: string, tableIndexModelId: string, indexOption: TableIndexOption
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = tableView.tableModel.tableIndexModels.map(model =>
        ((model.tableIndexModelId === tableIndexModelId)
            ? new TableIndexModel({ ...model, indexColumnModels: [...model.indexColumnModels], indexOption })
            : model)
    );
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const replaceIndexColumns = (
    document: ErdDocument, tableModelId: string, tableIndexModelId: string, columnModelIds: readonly string[]
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumns = columnModelIds.map(columnModelId => new IndexColumnModel({ columnModelId }));
    const nextIndexModels = tableView.tableModel.tableIndexModels.map(model =>
        ((model.tableIndexModelId === tableIndexModelId)
            ? new TableIndexModel({ ...model, indexColumnModels: nextColumns })
            : model)
    );
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const renameTablePhysicalName = (document: ErdDocument, tableModelId: string, physicalName: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextTableModel = new TableModel({ ...tableView.tableModel, physicalName });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const changeTableLogicalName = (document: ErdDocument, tableModelId: string, logicalName: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextTableModel = new TableModel({ ...tableView.tableModel, logicalName });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const addRelation = (document: ErdDocument, relationModel: RelationModel): ErdDocument => {
    const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });

    return document.updateRelation(relationView);
};

const changeForeignKeyOnUpdate = (
    document: ErdDocument, relationModelId: string, onUpdateAction: TableReferenceActionType
): ErdDocument => {
    const previousView = document.findRelationViewModel(relationModelId);
    if (previousView == null) {
        throw new Error(`relation not found: ${relationModelId}`);
    }
    const nextModel = new RelationModel({
        ...previousView.relationModel, relationPairs: [...previousView.relationModel.relationPairs], onUpdateAction
    });

    return document.updateRelation(previousView.updateRelationModel(nextModel));
};

const replaceRelationPairs = (document: ErdDocument, relationModelId: string, relationPairs: RelationPair[]): ErdDocument => {
    const previousView = document.findRelationViewModel(relationModelId);
    if (previousView == null) {
        throw new Error(`relation not found: ${relationModelId}`);
    }
    const nextModel = new RelationModel({ ...previousView.relationModel, relationPairs });

    return document.updateRelation(previousView.updateRelationModel(nextModel));
};

const addSchema = (document: ErdDocument, schema: DbSchemaModel): ErdDocument => {
    const nextConfig = DbSchemaConfig.create({
        defaultSchemaId: document.schemaConfig.defaultSchemaId,
        schemas: [...document.schemaConfig.getSchemas(), schema]
    });

    return document.updateSchema(nextConfig);
};

const removeSchema = (document: ErdDocument, schemaId: string): ErdDocument => {
    const remainingSchemas = document.schemaConfig.getSchemas().filter(schema => (schema.schemaId !== schemaId));
    const nextConfig = DbSchemaConfig.create({
        defaultSchemaId: document.schemaConfig.defaultSchemaId, schemas: remainingSchemas
    });

    return document.updateSchema(nextConfig);
};

// 1件の編集が複数の差分を生む場合がある(FK列ペアの差し替え・テーブルリネーム・グループ経由の複数列など)
// ため、expectedDifferences は配列で持つ。StackEdit/applyStack/revertEditsAt/toExpectedKeys は
// シナリオA・B・D・Eで共有する(シナリオCは相互汚染があるため個別に実測値でアサートする。後述)。
type StackEdit = {
    apply: (document: ErdDocument) => ErdDocument;
    revert: (document: ErdDocument) => ErdDocument;
    expectedDifferences: readonly { category: string, targetName: string }[];
};

const applyStack = (document: ErdDocument, edits: readonly StackEdit[]): ErdDocument => {
    return edits.reduce((accumulated, edit) => edit.apply(accumulated), document);
};

const revertEditsAt = (document: ErdDocument, edits: readonly StackEdit[], indexesToRevert: readonly number[]): ErdDocument => {
    return indexesToRevert.reduce((accumulated, index) => edits[index].revert(accumulated), document);
};

const toExpectedKeys = (edits: readonly StackEdit[], indexes: readonly number[]): string[] => {
    return indexes.flatMap(index => edits[index].expectedDifferences)
        .map(expected => `${expected.category}:${expected.targetName}`)
        .sort();
};

// =====================================================================================
// シナリオA: 列属性の積み上げ(mysql)
// =====================================================================================
//
// order.quantity は仕様上は numeric(precision, scale) の想定だったが、mysql の
// "numeric (m, d)" 型定義(src/models/database/columns.ts)は withUnsigned: false であり、
// ColumnShareModel は columnType.withUnsigned が false の場合 unsigned を常に false に強制する
// (ColumnShareModel のコンストラクタ参照)。そのため numeric 型のまま unsigned を切り替えても
// 実際には何も変化せず差分が出ない。quantity は unsigned 切替を検証する必要があるため、
// withUnsigned:true を持つ "int" 型を使う(price 側で numeric (m, d) の precision 変更を検証する)。

const SCENARIO_A_IDS = {
    tableUser: 'a-table-user', tableOrder: 'a-table-order',
    shareUserId: 'a-share-user-id', shareUserName: 'a-share-user-name', shareUserEmail: 'a-share-user-email',
    shareOrderId: 'a-share-order-id', shareOrderQuantity: 'a-share-order-quantity', shareOrderPrice: 'a-share-order-price',
    shareUserNickname: 'a-share-user-nickname',
    columnUserId: 'a-col-user-id', columnUserName: 'a-col-user-name', columnUserEmail: 'a-col-user-email',
    columnOrderId: 'a-col-order-id', columnOrderQuantity: 'a-col-order-quantity', columnOrderPrice: 'a-col-order-price',
    columnUserNickname: 'a-col-user-nickname'
} as const;

const buildScenarioAFixture = (): ErdDocument => {
    const shareUserId = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareUserId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareUserName = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareUserName, physicalName: 'name', logicalName: 'name', columnType: findColumnType('int')
    });
    const shareUserEmail = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareUserEmail, physicalName: 'email', logicalName: 'email', columnType: findColumnType('char')
    });
    const shareOrderId = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareOrderId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareOrderQuantity = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareOrderQuantity, physicalName: 'quantity', logicalName: 'quantity',
        columnType: findColumnType('int'), unsigned: false
    });
    const shareOrderPrice = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareOrderPrice, physicalName: 'price', logicalName: 'price',
        columnType: findColumnType('numeric (m, d)'), precision: '10', scale: '2'
    });

    const columnUserId = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnUserId, columnShareModelId: SCENARIO_A_IDS.shareUserId,
        primaryKey: true, notNull: true, autoIncrement: false
    });
    const columnUserName = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnUserName, columnShareModelId: SCENARIO_A_IDS.shareUserName
    });
    const columnUserEmail = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnUserEmail, columnShareModelId: SCENARIO_A_IDS.shareUserEmail, notNull: true
    });
    const columnOrderId = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnOrderId, columnShareModelId: SCENARIO_A_IDS.shareOrderId,
        primaryKey: true, notNull: true
    });
    const columnOrderQuantity = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnOrderQuantity, columnShareModelId: SCENARIO_A_IDS.shareOrderQuantity,
        notNull: true, defaultValue: ''
    });
    const columnOrderPrice = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnOrderPrice, columnShareModelId: SCENARIO_A_IDS.shareOrderPrice, notNull: true
    });

    const userTableModel = new TableModel({
        tableModelId: SCENARIO_A_IDS.tableUser, physicalName: 'user',
        columnEntries: [SCENARIO_A_IDS.columnUserId, SCENARIO_A_IDS.columnUserName, SCENARIO_A_IDS.columnUserEmail]
            .map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; })
    });
    const orderTableModel = new TableModel({
        tableModelId: SCENARIO_A_IDS.tableOrder, physicalName: 'order',
        columnEntries: [SCENARIO_A_IDS.columnOrderId, SCENARIO_A_IDS.columnOrderQuantity, SCENARIO_A_IDS.columnOrderPrice]
            .map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; })
    });

    const userTableView = new TableViewModel({ tableModel: userTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    const orderTableView = new TableViewModel({ tableModel: orderTableModel, corner: { top: 0, left: 300 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'scenario-a', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [userTableView, orderTableView],
        columnModels: [columnUserId, columnUserName, columnUserEmail, columnOrderId, columnOrderQuantity, columnOrderPrice],
        columnShareModels: [shareUserId, shareUserName, shareUserEmail, shareOrderId, shareOrderQuantity, shareOrderPrice]
    });
};

const buildScenarioAEdits = (): StackEdit[] => {
    const nicknameShare = new ColumnShareModel({
        columnShareModelId: SCENARIO_A_IDS.shareUserNickname, physicalName: 'nickname', logicalName: 'nickname',
        columnType: findColumnType('char')
    });
    const nicknameColumn = new SimpleColumnModel({
        columnModelId: SCENARIO_A_IDS.columnUserNickname, columnShareModelId: SCENARIO_A_IDS.shareUserNickname,
        notNull: true, defaultValue: 'guest'
    });

    return [
        {
            apply: document => addColumnToTable(document, SCENARIO_A_IDS.tableUser, nicknameColumn, nicknameShare),
            revert: document => removeColumnFromTable(document, SCENARIO_A_IDS.tableUser, SCENARIO_A_IDS.columnUserNickname),
            expectedDifferences: [{ category: 'column.missing', targetName: 'nickname' }]
        },
        {
            apply: document => updateColumnShare(document, SCENARIO_A_IDS.shareOrderPrice, { precision: '8' }),
            revert: document => updateColumnShare(document, SCENARIO_A_IDS.shareOrderPrice, { precision: '10' }),
            expectedDifferences: [{ category: 'column.type', targetName: 'price' }]
        },
        {
            apply: document => updateColumnShare(document, SCENARIO_A_IDS.shareOrderQuantity, { unsigned: true }),
            revert: document => updateColumnShare(document, SCENARIO_A_IDS.shareOrderQuantity, { unsigned: false }),
            expectedDifferences: [{ category: 'column.type', targetName: 'quantity' }]
        },
        {
            apply: document => updateSimpleColumnAttributes(document, SCENARIO_A_IDS.columnUserId, { autoIncrement: true }),
            revert: document => updateSimpleColumnAttributes(document, SCENARIO_A_IDS.columnUserId, { autoIncrement: false }),
            expectedDifferences: [{ category: 'column.autoIncrement', targetName: 'id' }]
        },
        {
            apply: document => updateSimpleColumnAttributes(document, SCENARIO_A_IDS.columnOrderQuantity, { defaultValue: '0' }),
            revert: document => updateSimpleColumnAttributes(document, SCENARIO_A_IDS.columnOrderQuantity, { defaultValue: '' }),
            expectedDifferences: [{ category: 'column.default', targetName: 'quantity' }]
        }
    ];
};

describe('scenario A: stacked column attribute edits (mysql)', () => {
    test('applying all 5 edits produces exactly the 5 corresponding differences', async () => {
        const base = buildScenarioAFixture();
        const edits = buildScenarioAEdits();
        const fullyEdited = applyStack(base, edits);

        const result = await runErdDiff(fullyEdited, base);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [0, 1, 2, 3, 4]));
        expect(result.differences).toHaveLength(5);
    });

    test('reverting the precision and autoIncrement edits leaves the other 3 differences intact', async () => {
        const base = buildScenarioAFixture();
        const edits = buildScenarioAEdits();
        const fullyEdited = applyStack(base, edits);

        const reverted = revertEditsAt(fullyEdited, edits, [1, 3]);
        const result = await runErdDiff(reverted, base);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [0, 2, 4]));
    });
});

describe('S3: scenario A differences are independent of edit application order', () => {
    test('applying the same 5 edits in a shuffled order yields the same differences', async () => {
        const base = buildScenarioAFixture();
        const edits = buildScenarioAEdits();

        const forwardOrder = [0, 1, 2, 3, 4];
        const shuffledOrder = [4, 1, 0, 3, 2];

        const documentA = forwardOrder.reduce((accumulated, index) => edits[index].apply(accumulated), base);
        const documentB = shuffledOrder.reduce((accumulated, index) => edits[index].apply(accumulated), base);

        const resultA = await runErdDiff(documentA, base);
        const resultB = await runErdDiff(documentB, base);

        expect(toDifferenceKeys(resultA.differences)).toEqual(toExpectedKeys(edits, forwardOrder));
        expect(toDifferenceKeys(resultB.differences)).toEqual(toExpectedKeys(edits, forwardOrder));
    });
});

// =====================================================================================
// シナリオB: 制約の積み上げ(mysql)
// =====================================================================================

const SCENARIO_B_IDS = {
    tableUser: 'b-table-user', tableOrder: 'b-table-order',
    shareUserId: 'b-share-user-id', shareUserName: 'b-share-user-name', shareUserEmail: 'b-share-user-email',
    shareUserStatus: 'b-share-user-status',
    shareOrderId: 'b-share-order-id', shareOrderOrderNo: 'b-share-order-order-no', shareOrderRegionCode: 'b-share-order-region-code',
    shareOrderWarehouseCode: 'b-share-order-warehouse-code', shareOrderCreatedAt: 'b-share-order-created-at',
    columnUserId: 'b-col-user-id', columnUserName: 'b-col-user-name', columnUserEmail: 'b-col-user-email',
    columnUserStatus: 'b-col-user-status',
    columnOrderId: 'b-col-order-id', columnOrderOrderNo: 'b-col-order-order-no', columnOrderRegionCode: 'b-col-order-region-code',
    columnOrderWarehouseCode: 'b-col-order-warehouse-code', columnOrderCreatedAt: 'b-col-order-created-at',
    uniqueUserNameEmail: 'b-uk-user-name-email', uniqueOrderRef: 'b-uk-order-ref', uniqueLegacy: 'b-uk-legacy',
    indexUserStatus: 'b-idx-user-status', indexOrderCreated: 'b-idx-order-created'
} as const;

const buildScenarioBFixture = (): ErdDocument => {
    const shareUserId = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareUserId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareUserName = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareUserName, physicalName: 'name', logicalName: 'name', columnType: findColumnType('int')
    });
    const shareUserEmail = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareUserEmail, physicalName: 'email', logicalName: 'email', columnType: findColumnType('char')
    });
    const shareUserStatus = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareUserStatus, physicalName: 'status', logicalName: 'status', columnType: findColumnType('text')
    });
    const shareOrderId = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareOrderId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareOrderOrderNo = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareOrderOrderNo, physicalName: 'order_no', logicalName: 'order_no', columnType: findColumnType('int')
    });
    const shareOrderRegionCode = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareOrderRegionCode, physicalName: 'region_code', logicalName: 'region_code',
        columnType: findColumnType('int')
    });
    const shareOrderWarehouseCode = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareOrderWarehouseCode, physicalName: 'warehouse_code', logicalName: 'warehouse_code',
        columnType: findColumnType('int')
    });
    const shareOrderCreatedAt = new ColumnShareModel({
        columnShareModelId: SCENARIO_B_IDS.shareOrderCreatedAt, physicalName: 'created_at', logicalName: 'created_at',
        columnType: findColumnType('int')
    });

    const columnUserId = new SimpleColumnModel({
        columnModelId: SCENARIO_B_IDS.columnUserId, columnShareModelId: SCENARIO_B_IDS.shareUserId, primaryKey: true, notNull: true
    });
    const columnUserName = new SimpleColumnModel({ columnModelId: SCENARIO_B_IDS.columnUserName, columnShareModelId: SCENARIO_B_IDS.shareUserName });
    const columnUserEmail = new SimpleColumnModel({ columnModelId: SCENARIO_B_IDS.columnUserEmail, columnShareModelId: SCENARIO_B_IDS.shareUserEmail });
    const columnUserStatus = new SimpleColumnModel({ columnModelId: SCENARIO_B_IDS.columnUserStatus, columnShareModelId: SCENARIO_B_IDS.shareUserStatus });
    const columnOrderId = new SimpleColumnModel({
        columnModelId: SCENARIO_B_IDS.columnOrderId, columnShareModelId: SCENARIO_B_IDS.shareOrderId, primaryKey: true, notNull: true
    });
    const columnOrderOrderNo = new SimpleColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderOrderNo, columnShareModelId: SCENARIO_B_IDS.shareOrderOrderNo });
    const columnOrderRegionCode = new SimpleColumnModel({
        columnModelId: SCENARIO_B_IDS.columnOrderRegionCode, columnShareModelId: SCENARIO_B_IDS.shareOrderRegionCode
    });
    const columnOrderWarehouseCode = new SimpleColumnModel({
        columnModelId: SCENARIO_B_IDS.columnOrderWarehouseCode, columnShareModelId: SCENARIO_B_IDS.shareOrderWarehouseCode
    });
    const columnOrderCreatedAt = new SimpleColumnModel({
        columnModelId: SCENARIO_B_IDS.columnOrderCreatedAt, columnShareModelId: SCENARIO_B_IDS.shareOrderCreatedAt
    });

    const userTableModel = new TableModel({
        tableModelId: SCENARIO_B_IDS.tableUser, physicalName: 'user',
        columnEntries: [SCENARIO_B_IDS.columnUserId, SCENARIO_B_IDS.columnUserName, SCENARIO_B_IDS.columnUserEmail, SCENARIO_B_IDS.columnUserStatus]
            .map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; }),
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: SCENARIO_B_IDS.indexUserStatus, physicalName: 'idx_user_status',
                indexColumnModels: [new IndexColumnModel({ columnModelId: SCENARIO_B_IDS.columnUserStatus })]
            })
        ]
    });
    const orderTableModel = new TableModel({
        tableModelId: SCENARIO_B_IDS.tableOrder, physicalName: 'order',
        columnEntries: [
            SCENARIO_B_IDS.columnOrderId, SCENARIO_B_IDS.columnOrderOrderNo, SCENARIO_B_IDS.columnOrderRegionCode,
            SCENARIO_B_IDS.columnOrderWarehouseCode, SCENARIO_B_IDS.columnOrderCreatedAt
        ].map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; }),
        uniqueKeysModels: [
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: SCENARIO_B_IDS.uniqueOrderRef, physicalName: 'uk_order_ref',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderOrderNo, sortOrderType: '' }),
                    new UniqueKeysColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderRegionCode, sortOrderType: '' })
                ]
            }),
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: SCENARIO_B_IDS.uniqueLegacy, physicalName: 'uk_legacy',
                uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderOrderNo, sortOrderType: '' })]
            })
        ],
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: SCENARIO_B_IDS.indexOrderCreated, physicalName: 'idx_order_created',
                indexColumnModels: [new IndexColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderCreatedAt })]
            })
        ]
    });

    const userTableView = new TableViewModel({ tableModel: userTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    const orderTableView = new TableViewModel({ tableModel: orderTableModel, corner: { top: 0, left: 300 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'scenario-b', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [userTableView, orderTableView],
        columnModels: [
            columnUserId, columnUserName, columnUserEmail, columnUserStatus,
            columnOrderId, columnOrderOrderNo, columnOrderRegionCode, columnOrderWarehouseCode, columnOrderCreatedAt
        ],
        columnShareModels: [
            shareUserId, shareUserName, shareUserEmail, shareUserStatus,
            shareOrderId, shareOrderOrderNo, shareOrderRegionCode, shareOrderWarehouseCode, shareOrderCreatedAt
        ]
    });
};

const buildScenarioBEdits = (): StackEdit[] => {
    const uniqueUserNameEmail = new TableUniqueKeysModel({
        tableUniqueKeysModelId: SCENARIO_B_IDS.uniqueUserNameEmail, physicalName: 'uk_user_name_email',
        uniqueKeysColumnModels: [
            new UniqueKeysColumnModel({ columnModelId: SCENARIO_B_IDS.columnUserName, sortOrderType: '' }),
            new UniqueKeysColumnModel({ columnModelId: SCENARIO_B_IDS.columnUserEmail, sortOrderType: '' })
        ]
    });
    const orderRefOriginalColumns = [SCENARIO_B_IDS.columnOrderOrderNo, SCENARIO_B_IDS.columnOrderRegionCode];
    const orderRefChangedColumns = [SCENARIO_B_IDS.columnOrderOrderNo, SCENARIO_B_IDS.columnOrderWarehouseCode];
    const originalOrderCreatedIndex = new TableIndexModel({
        tableIndexModelId: SCENARIO_B_IDS.indexOrderCreated, physicalName: 'idx_order_created',
        indexColumnModels: [new IndexColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderCreatedAt })]
    });
    const originalUniqueLegacy = new TableUniqueKeysModel({
        tableUniqueKeysModelId: SCENARIO_B_IDS.uniqueLegacy, physicalName: 'uk_legacy',
        uniqueKeysColumnModels: [new UniqueKeysColumnModel({ columnModelId: SCENARIO_B_IDS.columnOrderOrderNo, sortOrderType: '' })]
    });

    return [
        {
            apply: document => addUniqueKeyToTable(document, SCENARIO_B_IDS.tableUser, uniqueUserNameEmail),
            revert: document => removeUniqueKeyFromTable(document, SCENARIO_B_IDS.tableUser, SCENARIO_B_IDS.uniqueUserNameEmail),
            expectedDifferences: [{ category: 'uniqueKey.missing', targetName: 'uk_user_name_email' }]
        },
        {
            apply: document => replaceUniqueKeyColumns(document, SCENARIO_B_IDS.tableOrder, SCENARIO_B_IDS.uniqueOrderRef, orderRefChangedColumns),
            revert: document => replaceUniqueKeyColumns(document, SCENARIO_B_IDS.tableOrder, SCENARIO_B_IDS.uniqueOrderRef, orderRefOriginalColumns),
            expectedDifferences: [{ category: 'uniqueKey.columns', targetName: 'uk_order_ref' }]
        },
        {
            apply: document => changeIndexOption(document, SCENARIO_B_IDS.tableUser, SCENARIO_B_IDS.indexUserStatus, 'FULLTEXT'),
            revert: document => changeIndexOption(document, SCENARIO_B_IDS.tableUser, SCENARIO_B_IDS.indexUserStatus, ''),
            expectedDifferences: [{ category: 'index.type', targetName: 'idx_user_status' }]
        },
        {
            apply: document => removeIndexFromTable(document, SCENARIO_B_IDS.tableOrder, SCENARIO_B_IDS.indexOrderCreated),
            revert: document => addIndexToTable(document, SCENARIO_B_IDS.tableOrder, originalOrderCreatedIndex),
            expectedDifferences: [{ category: 'index.unexpected', targetName: 'idx_order_created' }]
        },
        {
            apply: document => removeUniqueKeyFromTable(document, SCENARIO_B_IDS.tableOrder, SCENARIO_B_IDS.uniqueLegacy),
            revert: document => addUniqueKeyToTable(document, SCENARIO_B_IDS.tableOrder, originalUniqueLegacy),
            expectedDifferences: [{ category: 'uniqueKey.unexpected', targetName: 'uk_legacy' }]
        }
    ];
};

describe('scenario B: stacked constraint edits (mysql)', () => {
    test('applying all 5 edits produces exactly the 5 corresponding differences', async () => {
        const base = buildScenarioBFixture();
        const edits = buildScenarioBEdits();
        const fullyEdited = applyStack(base, edits);

        const result = await runErdDiff(fullyEdited, base);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [0, 1, 2, 3, 4]));
        expect(result.differences).toHaveLength(5);
    });

    test('reverting the uk_order_ref and idx_order_created edits leaves the other 3 differences intact', async () => {
        const base = buildScenarioBFixture();
        const edits = buildScenarioBEdits();
        const fullyEdited = applyStack(base, edits);

        const reverted = revertEditsAt(fullyEdited, edits, [1, 3]);
        const result = await runErdDiff(reverted, base);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [0, 2, 4]));
    });
});

// =====================================================================================
// シナリオC: リレーション&テーブルの積み上げ(mysql, 2FK)
// =====================================================================================
//
// item・shop のテーブルリネーム(④⑤)は、TableMatcher が名前だけでテーブルを突き合わせる実装のため、
// リネームされた側は「まったく別のテーブル」として missing/unexpected の対にしかならず、
// そのテーブルに属する列・PK・FK等のフィールド単位の比較(compareTablePair)自体が丸ごとスキップされる
// (table-matcher.ts の matchTables 参照)。さらに FK の突き合わせ(isSameForeignKeyReference)は
// parentTableName の一致も要求するため、親テーブル(shop)をリネームすると、その親を参照する
// 既存FK全てが「無関係の理由で」不一致になる。そのため④⑤は他の編集の可視性そのものを変えてしまい、
// 「5編集それぞれの差分を単純合算する」という他シナリオの前提が成立しない。
// full-stack/revert のどちらも積み上げ計算(toExpectedKeys)ではなく、実測した差分集合をそのまま
// ハードコードしてアサートする。

const SCENARIO_C_IDS = {
    tableShop: 'c-table-shop', tableItem: 'c-table-item', tableShipper: 'c-table-shipper',
    shareShopId: 'c-share-shop-id', shareItemId: 'c-share-item-id', shareItemShopId: 'c-share-item-shop-id',
    shareItemBackupShopId: 'c-share-item-backup-shop-id', shareItemAltShopId: 'c-share-item-alt-shop-id',
    shareItemShipperId: 'c-share-item-shipper-id', shareShipperId: 'c-share-shipper-id',
    columnShopId: 'c-col-shop-id', columnItemId: 'c-col-item-id', columnItemShopId: 'c-col-item-shop-id',
    columnItemBackupShopId: 'c-col-item-backup-shop-id', columnItemAltShopId: 'c-col-item-alt-shop-id',
    columnItemShipperId: 'c-col-item-shipper-id', columnShipperId: 'c-col-shipper-id',
    relationItemShop: 'c-rel-item-shop', relationItemShopBackup: 'c-rel-item-shop-backup', relationItemShipper: 'c-rel-item-shipper'
} as const;

const buildScenarioCFixture = (): ErdDocument => {
    const shareShopId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareShopId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareItemId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareItemId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareItemShopId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareItemShopId, physicalName: 'shop_id', logicalName: 'shop_id', columnType: findColumnType('int')
    });
    const shareItemBackupShopId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareItemBackupShopId, physicalName: 'backup_shop_id', logicalName: 'backup_shop_id',
        columnType: findColumnType('int')
    });
    const shareItemAltShopId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareItemAltShopId, physicalName: 'alt_shop_id', logicalName: 'alt_shop_id',
        columnType: findColumnType('int')
    });
    const shareItemShipperId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareItemShipperId, physicalName: 'shipper_id', logicalName: 'shipper_id',
        columnType: findColumnType('int')
    });
    const shareShipperId = new ColumnShareModel({
        columnShareModelId: SCENARIO_C_IDS.shareShipperId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });

    const columnShopId = new SimpleColumnModel({
        columnModelId: SCENARIO_C_IDS.columnShopId, columnShareModelId: SCENARIO_C_IDS.shareShopId, primaryKey: true, notNull: true
    });
    const columnItemId = new SimpleColumnModel({
        columnModelId: SCENARIO_C_IDS.columnItemId, columnShareModelId: SCENARIO_C_IDS.shareItemId, primaryKey: true, notNull: true
    });
    const columnItemShopId = new SimpleColumnModel({ columnModelId: SCENARIO_C_IDS.columnItemShopId, columnShareModelId: SCENARIO_C_IDS.shareItemShopId });
    const columnItemBackupShopId = new SimpleColumnModel({
        columnModelId: SCENARIO_C_IDS.columnItemBackupShopId, columnShareModelId: SCENARIO_C_IDS.shareItemBackupShopId
    });
    const columnItemAltShopId = new SimpleColumnModel({
        columnModelId: SCENARIO_C_IDS.columnItemAltShopId, columnShareModelId: SCENARIO_C_IDS.shareItemAltShopId
    });
    const columnItemShipperId = new SimpleColumnModel({
        columnModelId: SCENARIO_C_IDS.columnItemShipperId, columnShareModelId: SCENARIO_C_IDS.shareItemShipperId
    });
    const columnShipperId = new SimpleColumnModel({
        columnModelId: SCENARIO_C_IDS.columnShipperId, columnShareModelId: SCENARIO_C_IDS.shareShipperId, primaryKey: true, notNull: true
    });

    const shopTableModel = new TableModel({
        tableModelId: SCENARIO_C_IDS.tableShop, physicalName: 'shop',
        columnEntries: [{ modelType: 'single', columnModelId: SCENARIO_C_IDS.columnShopId }]
    });
    const itemTableModel = new TableModel({
        tableModelId: SCENARIO_C_IDS.tableItem, physicalName: 'item',
        columnEntries: [
            SCENARIO_C_IDS.columnItemId, SCENARIO_C_IDS.columnItemShopId, SCENARIO_C_IDS.columnItemBackupShopId,
            SCENARIO_C_IDS.columnItemAltShopId, SCENARIO_C_IDS.columnItemShipperId
        ].map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; })
    });
    const shipperTableModel = new TableModel({
        tableModelId: SCENARIO_C_IDS.tableShipper, physicalName: 'shipper',
        columnEntries: [{ modelType: 'single', columnModelId: SCENARIO_C_IDS.columnShipperId }]
    });

    const shopTableView = new TableViewModel({ tableModel: shopTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    const itemTableView = new TableViewModel({ tableModel: itemTableModel, corner: { top: 0, left: 300 }, headerColor: TEST_COLORS });
    const shipperTableView = new TableViewModel({ tableModel: shipperTableModel, corner: { top: 0, left: 600 }, headerColor: TEST_COLORS });

    // relationPairs はすべて既存カラム(item.shop_id 等、上で columnEntries に含めた列)を指す。
    // ErdDocument.updateRelation は新規カラムを作るときだけ childCardinality から notNull を決めるため、
    // 既存カラムへ紐づけるここでは childCardinality を明示する必要がない(既定値のままで notNull は変わらない)。
    const relationItemShop = new RelationModel({
        relationModelId: SCENARIO_C_IDS.relationItemShop,
        parentTableModelId: SCENARIO_C_IDS.tableShop, childTableModelId: SCENARIO_C_IDS.tableItem,
        relationPairs: [new RelationPair({ parentColumnModelId: SCENARIO_C_IDS.columnShopId, childColumnModelId: SCENARIO_C_IDS.columnItemShopId })]
    });
    const relationItemShopBackup = new RelationModel({
        relationModelId: SCENARIO_C_IDS.relationItemShopBackup,
        parentTableModelId: SCENARIO_C_IDS.tableShop, childTableModelId: SCENARIO_C_IDS.tableItem,
        relationPairs: [new RelationPair({
            parentColumnModelId: SCENARIO_C_IDS.columnShopId, childColumnModelId: SCENARIO_C_IDS.columnItemBackupShopId
        })]
    });

    const relationViews = [relationItemShop, relationItemShopBackup]
        .map(relationModel => new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) }));

    return ErdDocument.create({
        documentName: 'scenario-c', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [shopTableView, itemTableView, shipperTableView],
        columnModels: [
            columnShopId, columnItemId, columnItemShopId, columnItemBackupShopId,
            columnItemAltShopId, columnItemShipperId, columnShipperId
        ],
        columnShareModels: [
            shareShopId, shareItemId, shareItemShopId, shareItemBackupShopId,
            shareItemAltShopId, shareItemShipperId, shareShipperId
        ],
        relationViewModels: relationViews
    });
};

type SimpleStackEdit = { apply: (document: ErdDocument) => ErdDocument, revert: (document: ErdDocument) => ErdDocument };

const buildScenarioCEdits = (): SimpleStackEdit[] => {
    const shipperRelation = new RelationModel({
        relationModelId: SCENARIO_C_IDS.relationItemShipper,
        parentTableModelId: SCENARIO_C_IDS.tableShipper, childTableModelId: SCENARIO_C_IDS.tableItem,
        relationPairs: [new RelationPair({
            parentColumnModelId: SCENARIO_C_IDS.columnShipperId, childColumnModelId: SCENARIO_C_IDS.columnItemShipperId
        })]
    });
    const originalBackupPairs = [new RelationPair({
        parentColumnModelId: SCENARIO_C_IDS.columnShopId, childColumnModelId: SCENARIO_C_IDS.columnItemBackupShopId
    })];
    const swappedBackupPairs = [new RelationPair({
        parentColumnModelId: SCENARIO_C_IDS.columnShopId, childColumnModelId: SCENARIO_C_IDS.columnItemAltShopId
    })];

    return [
        {
            apply: document => addRelation(document, shipperRelation),
            revert: document => document.deleteRelation(SCENARIO_C_IDS.relationItemShipper)
        },
        {
            apply: document => changeForeignKeyOnUpdate(document, SCENARIO_C_IDS.relationItemShop, 'CASCADE'),
            revert: document => changeForeignKeyOnUpdate(document, SCENARIO_C_IDS.relationItemShop, 'RESTRICT')
        },
        {
            apply: document => replaceRelationPairs(document, SCENARIO_C_IDS.relationItemShopBackup, swappedBackupPairs),
            revert: document => replaceRelationPairs(document, SCENARIO_C_IDS.relationItemShopBackup, originalBackupPairs)
        },
        {
            apply: document => renameTablePhysicalName(document, SCENARIO_C_IDS.tableItem, 'items'),
            revert: document => renameTablePhysicalName(document, SCENARIO_C_IDS.tableItem, 'item')
        },
        {
            apply: document => renameTablePhysicalName(document, SCENARIO_C_IDS.tableShop, 'shops'),
            revert: document => renameTablePhysicalName(document, SCENARIO_C_IDS.tableShop, 'shop')
        }
    ];
};

describe('scenario C: stacked relation and table edits (mysql, 2 FKs)', () => {
    test('applying all 5 edits collapses to only the two table rename pairs, because renaming ' +
        'item/shop makes TableMatcher treat them as wholly unmatched tables and skip all ' +
        'per-field comparison (including the FK diffs from the other 3 edits)', async () => {
        const base = buildScenarioCFixture();
        const edits = buildScenarioCEdits();
        const fullyEdited = edits.reduce((accumulated, edit) => edit.apply(accumulated), base);

        const result = await runErdDiff(fullyEdited, base);

        expect(toDifferenceKeys(result.differences)).toEqual([
            'table.missing:items', 'table.missing:shops', 'table.unexpected:item', 'table.unexpected:shop'
        ]);
    });

    test('reverting only the onUpdateAction and item-rename edits does not restore a clean rel-item-shop, ' +
        'because the still-renamed shop breaks FK matching for every relation parented by shop ' +
        '(parentTableName is part of the FK match key)', async () => {
        const base = buildScenarioCFixture();
        const edits = buildScenarioCEdits();
        const fullyEdited = edits.reduce((accumulated, edit) => edit.apply(accumulated), base);

        const reverted = [1, 3].reduce((accumulated, index) => edits[index].revert(accumulated), fullyEdited);
        const result = await runErdDiff(reverted, base);

        expect(toDifferenceKeys(result.differences)).toEqual([
            'foreignKey.missing:alt_shop_id', 'foreignKey.missing:shipper_id', 'foreignKey.missing:shop_id',
            'foreignKey.unexpected:backup_shop_id', 'foreignKey.unexpected:shop_id',
            'table.missing:shops', 'table.unexpected:shop'
        ]);
    });
});

// =====================================================================================
// シナリオD: コメント&スキーマの積み上げ(postgres, commentStyle="with_description")
// =====================================================================================

const SCENARIO_D_IDS = {
    tableUser: 'd-table-user',
    shareId: 'd-share-id', shareDisplayName: 'd-share-display-name', shareAccountStatus: 'd-share-account-status',
    columnId: 'd-col-id', columnDisplayName: 'd-col-display-name', columnAccountStatus: 'd-col-account-status'
} as const;

const buildScenarioDFixture = (): { document: ErdDocument, publicSchema: DbSchemaModel, legacySchema: DbSchemaModel } => {
    const publicSchema = DbSchemaModel.create('public', '');
    const legacySchema = DbSchemaModel.create('legacy', '');

    const shareId = new ColumnShareModel({
        columnShareModelId: SCENARIO_D_IDS.shareId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('integer', 'postgres')
    });
    const shareDisplayName = new ColumnShareModel({
        columnShareModelId: SCENARIO_D_IDS.shareDisplayName, physicalName: 'display_name', logicalName: 'Display Name',
        columnType: findColumnType('varchar', 'postgres'), description: 'User-facing display name'
    });
    const shareAccountStatus = new ColumnShareModel({
        columnShareModelId: SCENARIO_D_IDS.shareAccountStatus, physicalName: 'account_status', logicalName: 'Account Status',
        columnType: findColumnType('varchar', 'postgres'), description: 'Lifecycle status code'
    });

    const columnId = new SimpleColumnModel({ columnModelId: SCENARIO_D_IDS.columnId, columnShareModelId: SCENARIO_D_IDS.shareId, primaryKey: true, notNull: true });
    const columnDisplayName = new SimpleColumnModel({ columnModelId: SCENARIO_D_IDS.columnDisplayName, columnShareModelId: SCENARIO_D_IDS.shareDisplayName });
    const columnAccountStatus = new SimpleColumnModel({
        columnModelId: SCENARIO_D_IDS.columnAccountStatus, columnShareModelId: SCENARIO_D_IDS.shareAccountStatus
    });

    const userTableModel = new TableModel({
        tableModelId: SCENARIO_D_IDS.tableUser, physicalName: 'user', logicalName: 'Users',
        columnEntries: [SCENARIO_D_IDS.columnId, SCENARIO_D_IDS.columnDisplayName, SCENARIO_D_IDS.columnAccountStatus]
            .map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; })
    });
    const userTableView = new TableViewModel({ tableModel: userTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    const erdSettingModel = ErdSettingModel.create('scenario-d').update({
        exportDdlSetting: new ExportDdlSettingModel({ fileName: 'scenario-d', commentStyle: 'with_description' })
    });

    const document = ErdDocument.create({
        documentName: 'scenario-d', databaseSettingModel: DatabaseSettingModel.create('postgres'),
        erdSettingModel,
        schemaConfig: DbSchemaConfig.create({ defaultSchemaId: publicSchema.schemaId, schemas: [publicSchema, legacySchema] }),
        tableViewModels: [userTableView],
        columnModels: [columnId, columnDisplayName, columnAccountStatus],
        columnShareModels: [shareId, shareDisplayName, shareAccountStatus]
    });

    return { document, publicSchema, legacySchema };
};

const buildScenarioDEdits = (legacySchema: DbSchemaModel): StackEdit[] => {
    const archiveSchema = DbSchemaModel.create('archive', '');

    return [
        {
            apply: document => changeTableLogicalName(document, SCENARIO_D_IDS.tableUser, 'Registered Users'),
            revert: document => changeTableLogicalName(document, SCENARIO_D_IDS.tableUser, 'Users'),
            expectedDifferences: [{ category: 'table.comment', targetName: 'user' }]
        },
        {
            apply: document => updateColumnShare(document, SCENARIO_D_IDS.shareDisplayName, {
                description: 'Public profile name shown across the app'
            }),
            revert: document => updateColumnShare(document, SCENARIO_D_IDS.shareDisplayName, {
                description: 'User-facing display name'
            }),
            expectedDifferences: [{ category: 'column.comment', targetName: 'display_name' }]
        },
        {
            apply: document => updateColumnShare(document, SCENARIO_D_IDS.shareAccountStatus, { logicalName: 'Account Lifecycle Status' }),
            revert: document => updateColumnShare(document, SCENARIO_D_IDS.shareAccountStatus, { logicalName: 'Account Status' }),
            expectedDifferences: [
                { category: 'column.logicalName', targetName: 'account_status' },
                { category: 'column.comment', targetName: 'account_status' }
            ]
        },
        {
            apply: document => addSchema(document, archiveSchema),
            revert: document => removeSchema(document, archiveSchema.schemaId),
            expectedDifferences: [{ category: 'schema.missing', targetName: 'archive' }]
        },
        {
            apply: document => removeSchema(document, legacySchema.schemaId),
            revert: document => addSchema(document, legacySchema),
            expectedDifferences: [{ category: 'schema.unexpected', targetName: 'legacy' }]
        }
    ];
};

describe('scenario D: stacked comment and schema edits (postgres, with_description)', () => {
    test('applying all 5 edits produces exactly the 6 corresponding differences ' +
        '(changing a logicalName under with_description always also changes the comment string)', async () => {
        const fixture = buildScenarioDFixture();
        const edits = buildScenarioDEdits(fixture.legacySchema);
        const fullyEdited = applyStack(fixture.document, edits);

        const result = await runErdDiff(fullyEdited, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [0, 1, 2, 3, 4]));
        expect(result.differences).toHaveLength(6);
    });

    test('reverting the table logicalName and archive-schema edits leaves the other 4 differences intact', async () => {
        const fixture = buildScenarioDFixture();
        const edits = buildScenarioDEdits(fixture.legacySchema);
        const fullyEdited = applyStack(fixture.document, edits);

        const reverted = revertEditsAt(fullyEdited, edits, [0, 3]);
        const result = await runErdDiff(reverted, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [1, 2, 4]));
    });
});

// =====================================================================================
// シナリオE: キー構造の積み上げ(mysql)
// =====================================================================================

const SCENARIO_E_IDS = {
    tableOrder: 'e-table-order',
    shareId: 'e-share-id', shareQuantity: 'e-share-quantity', shareBackupOwnerId: 'e-share-backup-owner-id',
    shareWarehouseId: 'e-share-warehouse-id', shareShelfCode: 'e-share-shelf-code',
    shareCreatedBy: 'e-share-created-by', shareUpdatedBy: 'e-share-updated-by',
    shareFlagA: 'e-share-flag-a', shareFlagB: 'e-share-flag-b',
    columnId: 'e-col-id', columnQuantity: 'e-col-quantity', columnBackupOwnerId: 'e-col-backup-owner-id',
    columnWarehouseId: 'e-col-warehouse-id', columnShelfCode: 'e-col-shelf-code',
    columnCreatedBy: 'e-col-created-by', columnUpdatedBy: 'e-col-updated-by',
    columnFlagA: 'e-col-flag-a', columnFlagB: 'e-col-flag-b',
    groupSharedAudit: 'e-group-shared-audit', groupLegacyFlags: 'e-group-legacy-flags',
    indexOrderLocation: 'e-idx-order-location'
} as const;

const buildScenarioEFixture = (): ErdDocument => {
    const shareId = new ColumnShareModel({ columnShareModelId: SCENARIO_E_IDS.shareId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int') });
    const shareQuantity = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareQuantity, physicalName: 'quantity', logicalName: 'quantity', columnType: findColumnType('int')
    });
    const shareBackupOwnerId = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareBackupOwnerId, physicalName: 'backup_owner_id', logicalName: 'backup_owner_id',
        columnType: findColumnType('int')
    });
    const shareWarehouseId = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareWarehouseId, physicalName: 'warehouse_id', logicalName: 'warehouse_id', columnType: findColumnType('int')
    });
    const shareShelfCode = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareShelfCode, physicalName: 'shelf_code', logicalName: 'shelf_code', columnType: findColumnType('char')
    });
    const shareCreatedBy = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareCreatedBy, physicalName: 'created_by', logicalName: 'created_by', columnType: findColumnType('int')
    });
    const shareUpdatedBy = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareUpdatedBy, physicalName: 'updated_by', logicalName: 'updated_by', columnType: findColumnType('int')
    });
    const shareFlagA = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareFlagA, physicalName: 'flag_a', logicalName: 'flag_a', columnType: findColumnType('int')
    });
    const shareFlagB = new ColumnShareModel({
        columnShareModelId: SCENARIO_E_IDS.shareFlagB, physicalName: 'flag_b', logicalName: 'flag_b', columnType: findColumnType('int')
    });

    const columnId = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnId, columnShareModelId: SCENARIO_E_IDS.shareId, primaryKey: true, notNull: true });
    const columnQuantity = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnQuantity, columnShareModelId: SCENARIO_E_IDS.shareQuantity, notNull: true });
    const columnBackupOwnerId = new SimpleColumnModel({
        columnModelId: SCENARIO_E_IDS.columnBackupOwnerId, columnShareModelId: SCENARIO_E_IDS.shareBackupOwnerId, notNull: false
    });
    const columnWarehouseId = new SimpleColumnModel({
        columnModelId: SCENARIO_E_IDS.columnWarehouseId, columnShareModelId: SCENARIO_E_IDS.shareWarehouseId
    });
    const columnShelfCode = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnShelfCode, columnShareModelId: SCENARIO_E_IDS.shareShelfCode });
    const columnCreatedBy = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnCreatedBy, columnShareModelId: SCENARIO_E_IDS.shareCreatedBy });
    const columnUpdatedBy = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnUpdatedBy, columnShareModelId: SCENARIO_E_IDS.shareUpdatedBy });
    const columnFlagA = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnFlagA, columnShareModelId: SCENARIO_E_IDS.shareFlagA });
    const columnFlagB = new SimpleColumnModel({ columnModelId: SCENARIO_E_IDS.columnFlagB, columnShareModelId: SCENARIO_E_IDS.shareFlagB });

    const groupSharedAudit = new ColumnGroupModel({
        columnGroupId: SCENARIO_E_IDS.groupSharedAudit, groupName: 'shared_audit_columns',
        columnModelIds: [SCENARIO_E_IDS.columnCreatedBy, SCENARIO_E_IDS.columnUpdatedBy]
    });
    const groupLegacyFlags = new ColumnGroupModel({
        columnGroupId: SCENARIO_E_IDS.groupLegacyFlags, groupName: 'legacy_flags',
        columnModelIds: [SCENARIO_E_IDS.columnFlagA, SCENARIO_E_IDS.columnFlagB]
    });

    // shared_audit_columns は「あらかじめ定義だけされ、まだ columnEntries には含めない」グループ。
    // legacy_flags は逆に、基準の時点から group エントリとして order.columnEntries に含まれている。
    const orderTableModel = new TableModel({
        tableModelId: SCENARIO_E_IDS.tableOrder, physicalName: 'order',
        columnEntries: [
            ...[
                SCENARIO_E_IDS.columnId, SCENARIO_E_IDS.columnQuantity, SCENARIO_E_IDS.columnBackupOwnerId,
                SCENARIO_E_IDS.columnWarehouseId, SCENARIO_E_IDS.columnShelfCode
            ].map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; }),
            { modelType: 'group', columnGroupId: SCENARIO_E_IDS.groupLegacyFlags }
        ],
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: SCENARIO_E_IDS.indexOrderLocation, physicalName: 'idx_order_location',
                indexColumnModels: [
                    new IndexColumnModel({ columnModelId: SCENARIO_E_IDS.columnWarehouseId }),
                    new IndexColumnModel({ columnModelId: SCENARIO_E_IDS.columnShelfCode })
                ]
            })
        ]
    });
    const orderTableView = new TableViewModel({ tableModel: orderTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    return ErdDocument.create({
        documentName: 'scenario-e', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [orderTableView],
        columnGroupModels: [groupSharedAudit, groupLegacyFlags],
        columnModels: [
            columnId, columnQuantity, columnBackupOwnerId, columnWarehouseId, columnShelfCode,
            columnCreatedBy, columnUpdatedBy, columnFlagA, columnFlagB
        ],
        columnShareModels: [
            shareId, shareQuantity, shareBackupOwnerId, shareWarehouseId, shareShelfCode,
            shareCreatedBy, shareUpdatedBy, shareFlagA, shareFlagB
        ]
    });
};

const buildScenarioEEdits = (): StackEdit[] => {
    const locationOriginalColumns = [SCENARIO_E_IDS.columnWarehouseId, SCENARIO_E_IDS.columnShelfCode];
    const locationChangedColumns = [SCENARIO_E_IDS.columnWarehouseId, SCENARIO_E_IDS.columnBackupOwnerId];

    return [
        {
            apply: document => replaceColumnInTable(
                document, SCENARIO_E_IDS.tableOrder,
                new SimpleColumnModel({ ...findSimpleColumn(document, SCENARIO_E_IDS.columnQuantity), primaryKey: true })
            ),
            revert: document => replaceColumnInTable(
                document, SCENARIO_E_IDS.tableOrder,
                new SimpleColumnModel({ ...findSimpleColumn(document, SCENARIO_E_IDS.columnQuantity), primaryKey: false })
            ),
            expectedDifferences: [{ category: 'primaryKey', targetName: 'order' }]
        },
        {
            apply: document => updateSimpleColumnAttributes(document, SCENARIO_E_IDS.columnBackupOwnerId, { notNull: true }),
            revert: document => updateSimpleColumnAttributes(document, SCENARIO_E_IDS.columnBackupOwnerId, { notNull: false }),
            expectedDifferences: [{ category: 'column.nullability', targetName: 'backup_owner_id' }]
        },
        {
            apply: document => replaceIndexColumns(document, SCENARIO_E_IDS.tableOrder, SCENARIO_E_IDS.indexOrderLocation, locationChangedColumns),
            revert: document => replaceIndexColumns(document, SCENARIO_E_IDS.tableOrder, SCENARIO_E_IDS.indexOrderLocation, locationOriginalColumns),
            expectedDifferences: [{ category: 'index.columns', targetName: 'idx_order_location' }]
        },
        {
            apply: document => addGroupEntryToTable(document, SCENARIO_E_IDS.tableOrder, SCENARIO_E_IDS.groupSharedAudit),
            revert: document => removeGroupEntryFromTable(document, SCENARIO_E_IDS.tableOrder, SCENARIO_E_IDS.groupSharedAudit),
            expectedDifferences: [
                { category: 'column.missing', targetName: 'created_by' },
                { category: 'column.missing', targetName: 'updated_by' }
            ]
        },
        {
            apply: document => removeGroupEntryFromTable(document, SCENARIO_E_IDS.tableOrder, SCENARIO_E_IDS.groupLegacyFlags),
            revert: document => addGroupEntryToTable(document, SCENARIO_E_IDS.tableOrder, SCENARIO_E_IDS.groupLegacyFlags),
            expectedDifferences: [
                { category: 'column.unexpected', targetName: 'flag_a' },
                { category: 'column.unexpected', targetName: 'flag_b' }
            ]
        }
    ];
};

describe('scenario E: stacked key-structure edits (mysql)', () => {
    test('applying all 5 edits produces exactly the 7 corresponding differences ' +
        '(the two group-entry edits each move 2 columns at once)', async () => {
        const base = buildScenarioEFixture();
        const edits = buildScenarioEEdits();
        const fullyEdited = applyStack(base, edits);

        const result = await runErdDiff(fullyEdited, base);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [0, 1, 2, 3, 4]));
        expect(result.differences).toHaveLength(7);
    });

    test('reverting the composite-PK and index-columns edits leaves the other 5 differences intact', async () => {
        const base = buildScenarioEFixture();
        const edits = buildScenarioEEdits();
        const fullyEdited = applyStack(base, edits);

        const reverted = revertEditsAt(fullyEdited, edits, [0, 2]);
        const result = await runErdDiff(reverted, base);

        expect(toDifferenceKeys(result.differences)).toEqual(toExpectedKeys(edits, [1, 3, 4]));
    });
});

// =====================================================================================
// 独立した検証: シナリオに誤分類しない単発の性質確認(mysql、専用の branch/branch_log フィクスチャ)
// =====================================================================================

const SINGLE_COLUMN_IDS = {
    tableBranch: 'x-table-branch', tableBranchLog: 'x-table-branch-log',
    shareBranchId: 'x-share-branch-id', shareBranchName: 'x-share-branch-name',
    shareLogId: 'x-share-log-id', shareLogBranchId: 'x-share-log-branch-id',
    columnBranchId: 'x-col-branch-id', columnBranchName: 'x-col-branch-name',
    columnLogId: 'x-col-log-id', columnLogBranchId: 'x-col-log-branch-id',
    relationBranchLog: 'x-rel-branch-log'
} as const;

const buildSingleColumnFixture = (): ErdDocument => {
    const shareBranchId = new ColumnShareModel({
        columnShareModelId: SINGLE_COLUMN_IDS.shareBranchId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareBranchName = new ColumnShareModel({
        columnShareModelId: SINGLE_COLUMN_IDS.shareBranchName, physicalName: 'name', logicalName: 'name', columnType: findColumnType('int')
    });
    const shareLogId = new ColumnShareModel({
        columnShareModelId: SINGLE_COLUMN_IDS.shareLogId, physicalName: 'id', logicalName: 'id', columnType: findColumnType('int')
    });
    const shareLogBranchId = new ColumnShareModel({
        columnShareModelId: SINGLE_COLUMN_IDS.shareLogBranchId, physicalName: 'branch_id', logicalName: 'branch_id', columnType: findColumnType('int')
    });

    const columnBranchId = new SimpleColumnModel({
        columnModelId: SINGLE_COLUMN_IDS.columnBranchId, columnShareModelId: SINGLE_COLUMN_IDS.shareBranchId, primaryKey: true, notNull: true
    });
    const columnBranchName = new SimpleColumnModel({ columnModelId: SINGLE_COLUMN_IDS.columnBranchName, columnShareModelId: SINGLE_COLUMN_IDS.shareBranchName });
    const columnLogId = new SimpleColumnModel({
        columnModelId: SINGLE_COLUMN_IDS.columnLogId, columnShareModelId: SINGLE_COLUMN_IDS.shareLogId, primaryKey: true, notNull: true
    });
    const columnLogBranchId = new SimpleColumnModel({
        columnModelId: SINGLE_COLUMN_IDS.columnLogBranchId, columnShareModelId: SINGLE_COLUMN_IDS.shareLogBranchId, notNull: true
    });

    const branchTableModel = new TableModel({
        tableModelId: SINGLE_COLUMN_IDS.tableBranch, physicalName: 'branch',
        columnEntries: [SINGLE_COLUMN_IDS.columnBranchId, SINGLE_COLUMN_IDS.columnBranchName]
            .map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; })
    });
    const branchLogTableModel = new TableModel({
        tableModelId: SINGLE_COLUMN_IDS.tableBranchLog, physicalName: 'branch_log',
        columnEntries: [SINGLE_COLUMN_IDS.columnLogId, SINGLE_COLUMN_IDS.columnLogBranchId]
            .map(columnModelId => { return { modelType: 'single', columnModelId } as ColumnEntry; })
    });

    const branchTableView = new TableViewModel({ tableModel: branchTableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });
    const branchLogTableView = new TableViewModel({ tableModel: branchLogTableModel, corner: { top: 0, left: 300 }, headerColor: TEST_COLORS });

    const relationModel = new RelationModel({
        relationModelId: SINGLE_COLUMN_IDS.relationBranchLog,
        parentTableModelId: SINGLE_COLUMN_IDS.tableBranch, childTableModelId: SINGLE_COLUMN_IDS.tableBranchLog,
        relationPairs: [new RelationPair({
            parentColumnModelId: SINGLE_COLUMN_IDS.columnBranchId, childColumnModelId: SINGLE_COLUMN_IDS.columnLogBranchId
        })]
    });
    const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });

    return ErdDocument.create({
        documentName: 'single-column-fixture', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        schemaConfig: DbSchemaConfig.create(),
        tableViewModels: [branchTableView, branchLogTableView],
        columnModels: [columnBranchId, columnBranchName, columnLogId, columnLogBranchId],
        columnShareModels: [shareBranchId, shareBranchName, shareLogId, shareLogBranchId],
        relationViewModels: [relationView]
    });
};

describe('single-column layered edits and side effects', () => {
    test('reverting only the older of two edits on the same column leaves just the later difference', async () => {
        const base = buildSingleColumnFixture();
        const typeChanged = changeColumnType(base, SINGLE_COLUMN_IDS.shareBranchName, 'char');
        const alsoNullabilityChanged = updateSimpleColumnAttributes(typeChanged, SINGLE_COLUMN_IDS.columnBranchName, { notNull: true });

        const beforeRevert = await runErdDiff(alsoNullabilityChanged, base);
        expect(toDifferenceKeys(beforeRevert.differences)).toEqual(['column.nullability:name', 'column.type:name']);

        const typeReverted = changeColumnType(alsoNullabilityChanged, SINGLE_COLUMN_IDS.shareBranchName, 'int');
        const afterRevert = await runErdDiff(typeReverted, base);

        expect(afterRevert.differences).toHaveLength(1);
        expect(afterRevert.differences[0]).toMatchObject({ category: 'column.nullability', targetName: 'name' });
    });

    test(
        'promoting a column to primary key cascades a mirrored column into the child table via ' +
        'updateTableViewWithColumns, and demoting it back leaves that mirrored column behind ' +
        'until it is explicitly removed',
        async () => {
            const base = buildSingleColumnFixture();

            const namePromoted = replaceColumnInTable(
                base, SINGLE_COLUMN_IDS.tableBranch,
                new SimpleColumnModel({ ...findSimpleColumn(base, SINGLE_COLUMN_IDS.columnBranchName), primaryKey: true })
            );

            // branch は branch_log の親であるリレーションを持つため、name を PK に昇格すると
            // そのリレーションの列構成に name が追加され、branch_log 側に対応する列が自動生成される。
            const afterPromote = await runErdDiff(namePromoted, base);
            const promoteCategories = new Set(afterPromote.differences.map(difference => difference.category));
            expect(promoteCategories.has('primaryKey')).toBe(true);
            expect(promoteCategories.has('foreignKey.missing')).toBe(true);
            expect(promoteCategories.has('foreignKey.unexpected')).toBe(true);
            expect(promoteCategories.has('column.missing')).toBe(true);

            const nameAfterPromote = findSimpleColumn(namePromoted, SINGLE_COLUMN_IDS.columnBranchName);
            const nameDemoted = new SimpleColumnModel({ ...nameAfterPromote, primaryKey: false });
            const reverted = replaceColumnInTable(namePromoted, SINGLE_COLUMN_IDS.tableBranch, nameDemoted);

            // PK を戻すとリレーションの列構成は基準と一致するが、子テーブルに追加された列自体は
            // updateTableViewWithColumns の内部処理では削除されないため、column 差分として残留する。
            const afterRevertPk = await runErdDiff(reverted, base);
            expect(afterRevertPk.differences).toHaveLength(1);
            expect(afterRevertPk.differences[0]).toMatchObject({ category: 'column.missing', tableName: 'branch_log' });

            const baseLogColumnIds = new Set(
                findTableView(base, SINGLE_COLUMN_IDS.tableBranchLog).tableModel.columnEntries
                    .filter(entry => (entry.modelType === 'single'))
                    .map(entry => (entry as { modelType: 'single', columnModelId: string }).columnModelId)
            );
            const revertedLogEntries = findTableView(reverted, SINGLE_COLUMN_IDS.tableBranchLog).tableModel.columnEntries;
            const residualEntry = revertedLogEntries.find(entry =>
                (entry.modelType === 'single') && (baseLogColumnIds.has(entry.columnModelId) === false)
            );
            if ((residualEntry == null) || (residualEntry.modelType !== 'single')) {
                throw new Error('residual column was not found on the branch_log table');
            }

            const cleaned = removeColumnFromTable(reverted, SINGLE_COLUMN_IDS.tableBranchLog, residualEntry.columnModelId);
            const afterCleanup = await runErdDiff(cleaned, base);
            expect(afterCleanup.differences).toEqual([]);
        }
    );
});
