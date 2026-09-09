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
import ColumnType from '~/models/database/ColumnType';
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

// このファイルは src/cli/commands/__tests__/erd-diff-scenario.test.ts の S1 (16カテゴリ) を補完し、
// 残る8カテゴリと操作バリエーションを扱う。S1 のテスト・フィクスチャは参照のみとし、
// 物理名・モデル定義は一切共有しない(重複防止のため、このファイル内で完結させる)。

let workDirectory: string;
let logLines: string[];
let errorLines: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-diff-categories-'));
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

// erdDifference は1回の実行で console.log を1回だけ呼ぶため、直前までのログを捨ててから実行する。
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

const findRelationView = (document: ErdDocument, relationModelId: string): RelationViewModel => {
    const relationView = document.findRelationViewModel(relationModelId);
    if (relationView == null) {
        throw new Error(`relation not found: ${relationModelId}`);
    }
    return relationView;
};

// updateTableViewWithColumns の updatingColumns は「テーブルの全カラム」を渡す実装規約になっている。
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

const addGroupEntryToTable = (document: ErdDocument, tableModelId: string, columnGroupId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries = [
        ...tableView.tableModel.columnEntries, { modelType: 'group', columnGroupId } as ColumnEntry
    ];
    const nextTableModel = new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const removeGroupEntryFromTable = (document: ErdDocument, tableModelId: string, columnGroupId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextColumnEntries = tableView.tableModel.columnEntries
        .filter(entry => (entry.modelType !== 'group') || (entry.columnGroupId !== columnGroupId));
    const nextTableModel = new TableModel({ ...tableView.tableModel, columnEntries: nextColumnEntries });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const removeUniqueKeyFromTable = (
    document: ErdDocument, tableModelId: string, tableUniqueKeysModelId: string
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextUniqueKeysModels = tableView.tableModel.uniqueKeysModels
        .filter(model => (model.tableUniqueKeysModelId !== tableUniqueKeysModelId));
    const nextTableModel = new TableModel({ ...tableView.tableModel, uniqueKeysModels: nextUniqueKeysModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const replaceUniqueKeyModelColumns = (
    model: TableUniqueKeysModel, tableUniqueKeysModelId: string, columnModelIds: readonly string[]
): TableUniqueKeysModel => {
    if (model.tableUniqueKeysModelId !== tableUniqueKeysModelId) {
        return model;
    }
    const nextColumns = columnModelIds.map(columnModelId => new UniqueKeysColumnModel({ columnModelId, sortOrderType: '' }));

    return new TableUniqueKeysModel({ ...model, uniqueKeysColumnModels: nextColumns });
};

const replaceUniqueKeyColumns = (
    document: ErdDocument, tableModelId: string, tableUniqueKeysModelId: string, columnModelIds: readonly string[]
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextUniqueKeysModels = tableView.tableModel.uniqueKeysModels
        .map(model => replaceUniqueKeyModelColumns(model, tableUniqueKeysModelId, columnModelIds));
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

const replaceIndexModelColumns = (
    model: TableIndexModel, tableIndexModelId: string, columnModelIds: readonly string[]
): TableIndexModel => {
    if (model.tableIndexModelId !== tableIndexModelId) {
        return model;
    }
    const nextColumns = columnModelIds.map(columnModelId => new IndexColumnModel({ columnModelId }));

    return new TableIndexModel({ ...model, indexColumnModels: nextColumns });
};

const replaceIndexColumns = (
    document: ErdDocument, tableModelId: string, tableIndexModelId: string, columnModelIds: readonly string[]
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = tableView.tableModel.tableIndexModels
        .map(model => replaceIndexModelColumns(model, tableIndexModelId, columnModelIds));
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const replaceIndexOption = (
    indexModel: TableIndexModel, tableIndexModelId: string, indexOption: TableIndexOption
): TableIndexModel => {
    return (indexModel.tableIndexModelId === tableIndexModelId)
        ? new TableIndexModel({ ...indexModel, indexColumnModels: [...indexModel.indexColumnModels], indexOption })
        : indexModel;
};

const changeIndexOption = (
    document: ErdDocument, tableModelId: string, tableIndexModelId: string, indexOption: TableIndexOption
): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextIndexModels = tableView.tableModel.tableIndexModels
        .map(indexModel => replaceIndexOption(indexModel, tableIndexModelId, indexOption));
    const nextTableModel = new TableModel({ ...tableView.tableModel, tableIndexModels: nextIndexModels });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

// ColumnShareModel の一部属性だけを書き換える。characterSet/collate は getter 由来のため対象外とし、
// 呼び出し側が明示的に必要とする属性のみ overrides で渡す(コンストラクタの spread は checkExpression 等を
// 意図せず初期値へ戻してしまうため使わない)。
type ColumnShareOverride = Partial<{
    logicalName: string, columnType: ColumnType, precision: string, scale: string, unsigned: boolean, description: string
}>;

const replaceColumnShareAttributes = (
    document: ErdDocument, columnShareModelId: string, overrides: ColumnShareOverride
): ErdDocument => {
    const previousShare = findColumnShare(document, columnShareModelId);
    const nextShare = new ColumnShareModel({
        columnShareModelId: previousShare.columnShareModelId,
        physicalName: previousShare.physicalName,
        logicalName: overrides.logicalName ?? previousShare.logicalName,
        columnType: overrides.columnType ?? previousShare.columnType,
        precision: overrides.precision ?? previousShare.precision,
        scale: overrides.scale ?? previousShare.scale,
        unsigned: overrides.unsigned ?? previousShare.unsigned,
        description: overrides.description ?? previousShare.description,
        checkExpression: previousShare.checkExpression,
        optionExpression: previousShare.optionExpression
    });

    return document.updateColumnModels([], [nextShare]);
};

const changeColumnAutoIncrement = (document: ErdDocument, columnModelId: string, autoIncrement: boolean): ErdDocument => {
    const previousColumn = findSimpleColumn(document, columnModelId);
    const nextColumn = new SimpleColumnModel({ ...previousColumn, autoIncrement });

    return document.updateColumnModels([nextColumn], []);
};

const renameTable = (document: ErdDocument, tableModelId: string, physicalName: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextTableModel = new TableModel({ ...tableView.tableModel, physicalName });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const moveTableToSchema = (document: ErdDocument, tableModelId: string, schemaId: string): ErdDocument => {
    const tableView = findTableView(document, tableModelId);
    const nextTableModel = new TableModel({ ...tableView.tableModel, schemaId });

    return document.updateTableMeta(new TableViewModel({ ...tableView, tableModel: nextTableModel }));
};

const removeSchema = (document: ErdDocument, schemaId: string): ErdDocument => {
    const nextSchemas = document.schemaConfig.getSchemas().filter(schema => (schema.schemaId !== schemaId));
    const nextConfig = DbSchemaConfig.create({
        defaultSchemaId: document.schemaConfig.defaultSchemaId, schemas: nextSchemas
    });

    return document.updateSchema(nextConfig);
};

const changeForeignKeyOnUpdate = (
    document: ErdDocument, relationModelId: string, onUpdateAction: TableReferenceActionType
): ErdDocument => {
    const previousView = findRelationView(document, relationModelId);
    const nextModel = new RelationModel({
        ...previousView.relationModel, relationPairs: [...previousView.relationModel.relationPairs], onUpdateAction
    });

    return document.updateRelation(previousView.updateRelationModel(nextModel));
};

// user (親, PK=id) / order (子, user_id で user.id を参照) の2テーブル構成。
// erd-diff-scenario.test.ts の buildFixture と同型だが、物理名・IDは独立させ重複を避けている。
const FIXTURE_IDS = {
    tableUser: 'cat-table-user',
    tableOrder: 'cat-table-order',
    shareUserId: 'cat-share-user-id',
    shareUserName: 'cat-share-user-name',
    shareUserEmail: 'cat-share-user-email',
    shareOrderId: 'cat-share-order-id',
    shareOrderUserId: 'cat-share-order-user-id',
    shareOrderBackupOwnerId: 'cat-share-order-backup-owner-id',
    shareOrderQuantity: 'cat-share-order-quantity',
    columnUserId: 'cat-col-user-id',
    columnUserName: 'cat-col-user-name',
    columnUserEmail: 'cat-col-user-email',
    columnOrderId: 'cat-col-order-id',
    columnOrderUserId: 'cat-col-order-user-id',
    columnOrderBackupOwnerId: 'cat-col-order-backup-owner-id',
    columnOrderQuantity: 'cat-col-order-quantity',
    indexUserName: 'cat-idx-user-name',
    relationOrderUser: 'cat-rel-order-user'
} as const;

type Fixture = { document: ErdDocument };

const buildFixture = (erdSettingModel?: ErdSettingModel): Fixture => {
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
        documentName: 'erd-diff-categories', databaseSettingModel: DatabaseSettingModel.create('mysql'),
        erdSettingModel,
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

// uniqueKey.unexpected / uniqueKey.columns / index.unexpected / index.columns の検証には、
// 基準ドキュメント側に「既に存在する」制約・インデックスが要る。order テーブルに単独/複合を1組ずつ用意する。
const CONSTRAINT_IDS = {
    uniqueSingle: 'cat-uk-order-quantity',
    uniqueComposite: 'cat-uk-order-user-quantity',
    indexSingle: 'cat-idx-order-backup',
    indexComposite: 'cat-idx-order-user-backup'
} as const;

const buildFixtureWithConstraints = (): Fixture => {
    const base = buildFixture();
    const orderTableView = findTableView(base.document, FIXTURE_IDS.tableOrder);
    const nextTableModel = new TableModel({
        ...orderTableView.tableModel,
        uniqueKeysModels: [
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: CONSTRAINT_IDS.uniqueSingle, physicalName: 'uk_order_quantity',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ columnModelId: FIXTURE_IDS.columnOrderQuantity, sortOrderType: '' })
                ]
            }),
            new TableUniqueKeysModel({
                tableUniqueKeysModelId: CONSTRAINT_IDS.uniqueComposite, physicalName: 'uk_order_user_quantity',
                uniqueKeysColumnModels: [
                    new UniqueKeysColumnModel({ columnModelId: FIXTURE_IDS.columnOrderUserId, sortOrderType: '' }),
                    new UniqueKeysColumnModel({ columnModelId: FIXTURE_IDS.columnOrderQuantity, sortOrderType: '' })
                ]
            })
        ],
        tableIndexModels: [
            new TableIndexModel({
                tableIndexModelId: CONSTRAINT_IDS.indexSingle, physicalName: 'idx_order_backup',
                indexColumnModels: [new IndexColumnModel({ columnModelId: FIXTURE_IDS.columnOrderBackupOwnerId })]
            }),
            new TableIndexModel({
                tableIndexModelId: CONSTRAINT_IDS.indexComposite, physicalName: 'idx_order_user_backup',
                indexColumnModels: [
                    new IndexColumnModel({ columnModelId: FIXTURE_IDS.columnOrderUserId }),
                    new IndexColumnModel({ columnModelId: FIXTURE_IDS.columnOrderBackupOwnerId })
                ]
            })
        ]
    });
    const document = base.document.updateTableMeta(new TableViewModel({ ...orderTableView, tableModel: nextTableModel }));

    return { document };
};

// column.missing/column.unexpected(グループ経由)の検証専用。カラムグループは明示削除でのみ消える
// 常時ルートのため、どのテーブルからも参照されていない状態で先に登録しておける(ErdDocument.doUpdate 参照)。
const GROUP_IDS = {
    groupId: 'cat-group-audit-columns', shareCreatedAt: 'cat-share-audit-created-at',
    columnCreatedAt: 'cat-col-audit-created-at'
} as const;

const buildGroupFixture = (): Fixture & { groupId: string } => {
    const base = buildFixture();
    const share = new ColumnShareModel({
        columnShareModelId: GROUP_IDS.shareCreatedAt, physicalName: 'created_at', logicalName: 'created_at',
        columnType: findColumnType('int')
    });
    const column = new SimpleColumnModel({
        columnModelId: GROUP_IDS.columnCreatedAt, columnShareModelId: GROUP_IDS.shareCreatedAt
    });
    const group = new ColumnGroupModel({
        columnGroupId: GROUP_IDS.groupId, groupName: 'audit columns', columnModelIds: [GROUP_IDS.columnCreatedAt]
    });
    const nextShareStorage = base.document.getColumnShareModelStorage().addColumnShare(share);
    const document = base.document.updateColumnGroup(group, [column], nextShareStorage);

    return { document, groupId: GROUP_IDS.groupId };
};

// schema.unexpected / テーブルのスキーマ移動の検証専用。postgres は明示スキーマが1つもないと
// 既定の "public" が補完されるため、2スキーマとも最初から明示宣言しておく。
const buildPostgresTwoSchemaFixture = () => {
    const publicSchema = DbSchemaModel.create('public', '');
    const billingSchema = DbSchemaModel.create('billing', '');
    const share = new ColumnShareModel({
        columnShareModelId: 'cat-pg-share-account-id', physicalName: 'account_id', logicalName: 'account_id',
        columnType: findColumnType('integer', 'postgres')
    });
    const column = new SimpleColumnModel({
        columnModelId: 'cat-pg-col-account-id', columnShareModelId: 'cat-pg-share-account-id',
        primaryKey: true, notNull: true
    });
    const tableModelId = 'cat-pg-table-account';
    const tableModel = new TableModel({
        tableModelId, physicalName: 'account', schemaId: publicSchema.schemaId,
        columnEntries: [{ modelType: 'single', columnModelId: 'cat-pg-col-account-id' }] as ColumnEntry[]
    });
    const tableView = new TableViewModel({ tableModel, corner: { top: 0, left: 0 }, headerColor: TEST_COLORS });

    const document = ErdDocument.create({
        documentName: 'erd-diff-categories-postgres', databaseSettingModel: DatabaseSettingModel.create('postgres'),
        schemaConfig: DbSchemaConfig.create({
            defaultSchemaId: publicSchema.schemaId, schemas: [publicSchema, billingSchema]
        }),
        tableViewModels: [tableView], columnModels: [column], columnShareModels: [share]
    });

    return { document, tableModelId, publicSchemaId: publicSchema.schemaId, billingSchemaId: billingSchema.schemaId };
};

describe('single edit operation produces exactly the corresponding difference category: remaining 8 categories', () => {
    test('removing a declared schema is reported as schema.unexpected', async () => {
        const fixture = buildPostgresTwoSchemaFixture();
        const edited = removeSchema(fixture.document, fixture.billingSchemaId);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'schema.unexpected', targetName: 'billing' });
    });

    test('toggling autoIncrement on an int column is reported as column.autoIncrement', async () => {
        const fixture = buildFixture();
        const edited = changeColumnAutoIncrement(fixture.document, FIXTURE_IDS.columnUserId, true);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.autoIncrement', tableName: 'user', targetName: 'id' });
    });

    test('changing only the description under with_description style is reported as column.comment', async () => {
        const withDescriptionSetting = ErdSettingModel.create('erd-diff-categories').update({
            exportDdlSetting: new ExportDdlSettingModel({ fileName: 'erd-diff-categories', commentStyle: 'with_description' })
        });
        const fixture = buildFixture(withDescriptionSetting);
        const based = replaceColumnShareAttributes(fixture.document, FIXTURE_IDS.shareOrderQuantity, { description: 'v1' });
        const edited = replaceColumnShareAttributes(based, FIXTURE_IDS.shareOrderQuantity, { description: 'v2' });

        const result = await runErdDiff(edited, based);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.comment', tableName: 'order', targetName: 'quantity' });
    });

    test('changing only the logical name under the default style is reported as column.logicalName', async () => {
        const fixture = buildFixture();
        const edited = replaceColumnShareAttributes(fixture.document, FIXTURE_IDS.shareUserEmail, {
            logicalName: 'email_address'
        });

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.logicalName', tableName: 'user', targetName: 'email' });
    });

    test('removing an existing UNIQUE constraint is reported as uniqueKey.unexpected', async () => {
        const fixture = buildFixtureWithConstraints();
        const edited = removeUniqueKeyFromTable(fixture.document, FIXTURE_IDS.tableOrder, CONSTRAINT_IDS.uniqueSingle);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({
            category: 'uniqueKey.unexpected', tableName: 'order', targetName: 'uk_order_quantity'
        });
    });

    test('swapping one column of a composite UNIQUE constraint is reported as uniqueKey.columns', async () => {
        const fixture = buildFixtureWithConstraints();
        const edited = replaceUniqueKeyColumns(
            fixture.document, FIXTURE_IDS.tableOrder, CONSTRAINT_IDS.uniqueComposite,
            [FIXTURE_IDS.columnOrderUserId, FIXTURE_IDS.columnOrderBackupOwnerId]
        );

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({
            category: 'uniqueKey.columns', tableName: 'order', targetName: 'uk_order_user_quantity'
        });
    });

    test('removing an existing index is reported as index.unexpected', async () => {
        const fixture = buildFixtureWithConstraints();
        const edited = removeIndexFromTable(fixture.document, FIXTURE_IDS.tableOrder, CONSTRAINT_IDS.indexSingle);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({
            category: 'index.unexpected', tableName: 'order', targetName: 'idx_order_backup'
        });
    });

    test('swapping one column of a composite index is reported as index.columns', async () => {
        const fixture = buildFixtureWithConstraints();
        const edited = replaceIndexColumns(
            fixture.document, FIXTURE_IDS.tableOrder, CONSTRAINT_IDS.indexComposite,
            [FIXTURE_IDS.columnOrderUserId, FIXTURE_IDS.columnOrderQuantity]
        );

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({
            category: 'index.columns', tableName: 'order', targetName: 'idx_order_user_backup'
        });
    });
});

describe('single edit operation produces exactly the corresponding difference category: operation variations', () => {
    test('changing a varchar(m) column precision is reported as column.type', async () => {
        const fixture = buildFixture();
        const based = replaceColumnShareAttributes(fixture.document, FIXTURE_IDS.shareUserName, {
            columnType: findColumnType('varchar (m)'), precision: '255'
        });
        const edited = replaceColumnShareAttributes(based, FIXTURE_IDS.shareUserName, { precision: '100' });

        const result = await runErdDiff(edited, based);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.type', tableName: 'user', targetName: 'name' });
    });

    test('toggling unsigned on a numeric column is reported as column.type', async () => {
        const fixture = buildFixture();
        const edited = replaceColumnShareAttributes(fixture.document, FIXTURE_IDS.shareOrderQuantity, { unsigned: true });

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.type', tableName: 'order', targetName: 'quantity' });
    });

    test('renaming a table is reported as table.missing and table.unexpected', async () => {
        const fixture = buildFixture();
        const edited = renameTable(fixture.document, FIXTURE_IDS.tableOrder, 'purchase_order');

        const result = await runErdDiff(edited, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual(['table.missing:purchase_order', 'table.unexpected:order']);
    });

    test('moving a table to a different schema is reported as table.missing and table.unexpected', async () => {
        const fixture = buildPostgresTwoSchemaFixture();
        const edited = moveTableToSchema(fixture.document, fixture.tableModelId, fixture.billingSchemaId);

        const result = await runErdDiff(edited, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual(['table.missing:account', 'table.unexpected:account']);
        const missing = result.differences.find(difference => (difference.category === 'table.missing'));
        const unexpected = result.differences.find(difference => (difference.category === 'table.unexpected'));
        expect(missing).toMatchObject({ schemaName: 'billing' });
        expect(unexpected).toMatchObject({ schemaName: 'public' });
    });

    test('changing a foreign key ON UPDATE action is reported as foreignKey.reference', async () => {
        const fixture = buildFixture();
        const edited = changeForeignKeyOnUpdate(fixture.document, FIXTURE_IDS.relationOrderUser, 'CASCADE');

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'foreignKey.reference', tableName: 'order', targetName: 'user_id' });
    });

    test('replacing the foreign key column pair reports both a missing and an unexpected foreign key, ' +
        'without touching the existing child column NOT NULL', async () => {
        const fixture = buildFixture();
        const previousView = findRelationView(fixture.document, FIXTURE_IDS.relationOrderUser);
        // childCardinality は既定値("1")のまま: backup_owner_id は既存カラムに紐づけるだけなので、
        // ErdDocument.updateRelation は notNull を書き換えない(新規カラム作成時のみカーディナリティを見る)。
        const nextModel = new RelationModel({
            ...previousView.relationModel,
            relationPairs: [new RelationPair({
                parentColumnModelId: FIXTURE_IDS.columnUserId, childColumnModelId: FIXTURE_IDS.columnOrderBackupOwnerId
            })]
        });
        const edited = fixture.document.updateRelation(previousView.updateRelationModel(nextModel));

        const result = await runErdDiff(edited, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual([
            'foreignKey.missing:backup_owner_id', 'foreignKey.unexpected:user_id'
        ]);
    });

    test('adding a composite foreign key reports foreignKey.missing with a joined column list', async () => {
        const fixture = buildFixture();
        const relationModel = new RelationModel({
            relationModelId: 'cat-rel-order-user-composite',
            parentTableModelId: FIXTURE_IDS.tableUser, childTableModelId: FIXTURE_IDS.tableOrder,
            relationPairs: [
                new RelationPair({
                    parentColumnModelId: FIXTURE_IDS.columnUserId, childColumnModelId: FIXTURE_IDS.columnOrderBackupOwnerId
                }),
                new RelationPair({
                    parentColumnModelId: FIXTURE_IDS.columnUserEmail, childColumnModelId: FIXTURE_IDS.columnOrderQuantity
                })
            ]
        });
        const relationView = new RelationViewModel({ relationModel, lineViewModel: new LineViewModel({}) });
        const edited = fixture.document.updateRelation(relationView);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({
            category: 'foreignKey.missing', tableName: 'order', targetName: 'backup_owner_id, quantity'
        });
    });

    test('adding a column group entry to a table is reported as column.missing', async () => {
        const fixture = buildGroupFixture();
        const edited = addGroupEntryToTable(fixture.document, FIXTURE_IDS.tableOrder, fixture.groupId);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.missing', tableName: 'order', targetName: 'created_at' });
    });

    test('removing a column group entry from a table is reported as column.unexpected', async () => {
        const fixture = buildGroupFixture();
        const withEntry = addGroupEntryToTable(fixture.document, FIXTURE_IDS.tableOrder, fixture.groupId);
        const edited = removeGroupEntryFromTable(withEntry, FIXTURE_IDS.tableOrder, fixture.groupId);

        const result = await runErdDiff(edited, withEntry);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'column.unexpected', tableName: 'order', targetName: 'created_at' });
    });

    test('overriding a column physical name at the column level reports a missing/unexpected pair', async () => {
        const fixture = buildFixture();
        const previousColumn = findSimpleColumn(fixture.document, FIXTURE_IDS.columnOrderQuantity);
        const nextColumn = new SimpleColumnModel({ ...previousColumn, physicalName: 'qty' });
        const edited = replaceColumnInTable(fixture.document, FIXTURE_IDS.tableOrder, nextColumn);

        const result = await runErdDiff(edited, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual(['column.missing:qty', 'column.unexpected:quantity']);
    });

    test('promoting a regular index to a UNIQUE index reports index.unexpected and uniqueKey.missing', async () => {
        const fixture = buildFixture();
        const edited = changeIndexOption(fixture.document, FIXTURE_IDS.tableUser, FIXTURE_IDS.indexUserName, 'UNIQUE');

        const result = await runErdDiff(edited, fixture.document);

        expect(toDifferenceKeys(result.differences)).toEqual(['index.unexpected:idx_user_name', 'uniqueKey.missing:idx_user_name']);
    });

    test('changing a text column index option to FULLTEXT is reported as index.type', async () => {
        const fixture = buildFixture();
        const share = new ColumnShareModel({
            columnShareModelId: 'cat-share-order-notes', physicalName: 'notes', logicalName: 'notes',
            columnType: findColumnType('text')
        });
        const column = new SimpleColumnModel({ columnModelId: 'cat-col-order-notes', columnShareModelId: 'cat-share-order-notes' });
        const withColumn = addColumnToTable(fixture.document, FIXTURE_IDS.tableOrder, column, share);
        const indexModel = new TableIndexModel({
            tableIndexModelId: 'cat-idx-order-notes', physicalName: 'idx_order_notes',
            indexColumnModels: [new IndexColumnModel({ columnModelId: 'cat-col-order-notes' })]
        });
        const based = addIndexToTable(withColumn, FIXTURE_IDS.tableOrder, indexModel);
        const edited = changeIndexOption(based, FIXTURE_IDS.tableOrder, 'cat-idx-order-notes', 'FULLTEXT');

        const result = await runErdDiff(edited, based);

        expect(result.differences).toHaveLength(1);
        expect(result.differences[0]).toMatchObject({ category: 'index.type', tableName: 'order', targetName: 'idx_order_notes' });
    });
});

describe('scope option: --no-schema', () => {
    test('--no-schema matches tables by name only, ignoring a schema move', async () => {
        const fixture = buildPostgresTwoSchemaFixture();
        const edited = moveTableToSchema(fixture.document, fixture.tableModelId, fixture.billingSchemaId);

        const result = await runErdDiff(edited, fixture.document, ['--no-schema']);

        expect(result.differences).toEqual([]);
    });
});

describe('fields that never affect the diff', () => {
    test('table and column-level cosmetic fields never affect the diff', async () => {
        const fixture = buildFixture();
        const userTableView = findTableView(fixture.document, FIXTURE_IDS.tableUser);
        const nextTableModel = new TableModel({
            ...userTableView.tableModel,
            checkExpression: 'CHECK (id > 0)',
            characterSet: 'utf8mb4',
            collate: 'utf8mb4_bin',
            definitionExpression: 'ENGINE=InnoDB',
            optionExpression: "COMMENT='ignored'",
            description: 'ignored table description'
        });
        const withTableEdits = fixture.document.updateTableMeta(
            new TableViewModel({ ...userTableView, tableModel: nextTableModel })
        );

        const previousEmailShare = findColumnShare(withTableEdits, FIXTURE_IDS.shareUserEmail);
        const nextEmailShare = new ColumnShareModel({
            columnShareModelId: previousEmailShare.columnShareModelId,
            physicalName: previousEmailShare.physicalName,
            logicalName: previousEmailShare.logicalName,
            columnType: previousEmailShare.columnType,
            checkExpression: 'LENGTH(email) > 0',
            optionExpression: 'CHARACTER SET utf8mb4',
            characterSet: 'utf8mb4',
            collate: 'utf8mb4_bin'
        });
        const edited = withTableEdits.updateColumnModels([], [nextEmailShare]);

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toEqual([]);
    });

    test('relation cardinalities/name and index ordering fields never affect the diff', async () => {
        const fixture = buildFixture();
        const userTableView = findTableView(fixture.document, FIXTURE_IDS.tableUser);
        const previousIndex = userTableView.tableModel.tableIndexModels[0];
        const nextIndex = new TableIndexModel({
            ...previousIndex,
            indexColumnModels: previousIndex.indexColumnModels.map(
                column => new IndexColumnModel({ ...column, sortOrderType: 'ASC' })
            ),
            clustered: true
        });
        const nextTableModel = new TableModel({ ...userTableView.tableModel, tableIndexModels: [nextIndex] });
        const withIndexEdits = fixture.document.updateTableMeta(
            new TableViewModel({ ...userTableView, tableModel: nextTableModel })
        );

        const previousRelationView = findRelationView(withIndexEdits, FIXTURE_IDS.relationOrderUser);
        const nextRelationModel = new RelationModel({
            ...previousRelationView.relationModel,
            relationPairs: [...previousRelationView.relationModel.relationPairs],
            relationName: 'user_order_relation',
            parentCardinality: '0..1',
            childCardinality: '1..N'
        });
        const edited = withIndexEdits.updateRelation(previousRelationView.updateRelationModel(nextRelationModel));

        const result = await runErdDiff(edited, fixture.document);

        expect(result.differences).toEqual([]);
    });
});
