import { v4 as uuidV4 } from 'uuid';

import ColorValue from '~/models/ColorValue';
import ColumnShareModelStorage from '~/models/ColumnShareModelStorage';
import { Database } from '~/models/database';
import ColumnEntry from '~/models/database/ColumnEntry';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import StructColumnShareModel from '~/models/database/StructColumnShareModel';
import DbSchemaModel from '~/models/database/DbSchemaModel';
import DisplayNameStyle from '~/models/DisplayNameStyle';
import RelationModel, { CardinalityType } from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import { overrideColumnName } from '~/models/database/support';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
import TableUniqueKeysModel from '~/models/database/TableUniqueKeysModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdSettingModel from '~/models/ErdSettingModel';
import LabelViewModel from '~/models/LabelViewModel';
import LineViewModel from '~/models/LineViewModel';
import MemoViewModel from '~/models/MemoViewModel';
import MemoViewModelStorage from '~/models/MemoViewModelStorage';
import RelationViewModel, { OrthogonalRelation } from '~/models/RelationViewModel';
import RelationViewModelStorage from '~/models/RelationViewModelStorage';
import TableViewModel from '~/models/TableViewModel';
import { requireProperty, toDateTime, toObjects } from '~/models/util';
import DisplayColumnStyle from '~/models/DisplayColumnStyle';

type ReachableModelIds = {
    columnModelIds: Set<string>,
    columnShareModelIds: Set<string>,
    structShareModelIds: Set<string>
};

type ErdDocumentOptions = {
    documentName: string,
    databaseSettingModel: DatabaseSettingModel,
    erdSettingModel?: ErdSettingModel,
    schemaConfig?: DbSchemaConfig,
    tableViewModels?: readonly TableViewModel[],
    columnGroupModels?: readonly ColumnGroupModel[],
    columnModels?: readonly ColumnModel[],
    columnShareModels?: readonly ColumnShareModel[],
    structShareModels?: readonly StructColumnShareModel[],
    relationViewModels?: readonly RelationViewModel[],
    foregroundMemoViewModels?: MemoViewModel[],
    backgroundMemoViewModels?: MemoViewModel[],
    lastUpdatedAt?: Date | null
};

export default class ErdDocument {

    public readonly documentName: string;
    public readonly erdSettingModel: ErdSettingModel;
    public readonly databaseSettingModel: DatabaseSettingModel;
    public readonly schemaConfig: DbSchemaConfig;
    private readonly tableViewModelIds: readonly string[];
    private readonly tableViewModelMap: Map<string, TableViewModel>;
    private readonly columnGroupModelMap: Map<string, ColumnGroupModel>;
    private readonly columnModelMap: Map<string, ColumnModel>;
    private readonly columnShareStorage: ColumnShareModelStorage;
    private readonly relationViewModelStorage: RelationViewModelStorage;
    private readonly memoViewModelStorage: MemoViewModelStorage;
    public readonly lastUpdatedAt: Date;

    private constructor(
        documentName: string, erdSettingModel: ErdSettingModel,
        databaseSettingModel: DatabaseSettingModel, schemaConfig: DbSchemaConfig,
        tableViewModelIds: readonly string[], tableViewModelMap: Map<string, TableViewModel>,
        columnGroupModelMap: Map<string, ColumnGroupModel>, columnModelMap: Map<string, ColumnModel>,
        columnShareModelStorage: ColumnShareModelStorage,
        relationViewModelStorage: RelationViewModelStorage,
        memoViewModelStorage: MemoViewModelStorage, lastUpdatedAt: Date | null = null
    ) {
        this.documentName = documentName;
        this.erdSettingModel = erdSettingModel;
        this.databaseSettingModel = databaseSettingModel;
        this.schemaConfig = schemaConfig;
        this.tableViewModelIds = tableViewModelIds;
        this.tableViewModelMap = tableViewModelMap;
        this.columnGroupModelMap = columnGroupModelMap;
        this.columnModelMap = columnModelMap;
        this.columnShareStorage = columnShareModelStorage;
        this.relationViewModelStorage = relationViewModelStorage;
        this.memoViewModelStorage = memoViewModelStorage;
        this.lastUpdatedAt = lastUpdatedAt ? lastUpdatedAt : new Date();
    }

    public static create({
        documentName, databaseSettingModel,
        erdSettingModel = ErdSettingModel.create(documentName),
        schemaConfig = DbSchemaConfig.create(),
        tableViewModels = [], columnGroupModels = [], structShareModels = [], columnModels = [], columnShareModels = [],
        relationViewModels = [], foregroundMemoViewModels = [], backgroundMemoViewModels = [],
        lastUpdatedAt = null
    }: ErdDocumentOptions): ErdDocument {

        return new ErdDocument(
            documentName, erdSettingModel, databaseSettingModel, schemaConfig,
            tableViewModels.map(viewModel => viewModel.tableId),
            new Map(tableViewModels.map(viewModel => [viewModel.tableId, viewModel])),
            new Map(columnGroupModels.map(groupModel => [groupModel.columnGroupId, groupModel])),
            new Map(columnModels.map(columnModel => [columnModel.columnModelId, columnModel])),
            ColumnShareModelStorage.create(columnShareModels, structShareModels),
            new RelationViewModelStorage(relationViewModels),
            MemoViewModelStorage.create(foregroundMemoViewModels, backgroundMemoViewModels),
            lastUpdatedAt
        );
    }

    /**
     * 現在のインスタンスをベースに、指定されたフィールドのみを更新した新しいインスタンスを作成する。
     *
     * @param overrides 更新するフィールドを含むオブジェクト
     * @returns 新しいErdDocumentインスタンス
     */
    private doUpdate(overrides: Partial<{
        documentName: string,
        erdSettingModel: ErdSettingModel,
        databaseSettingModel: DatabaseSettingModel,
        schemaConfig: DbSchemaConfig
        tableViewModelIds: readonly string[],
        tableViewModelMap: Map<string, TableViewModel>,
        columnGroupModelMap: Map<string, ColumnGroupModel>,
        columnModelMap: Map<string, ColumnModel>,
        columnShareModelStorage: ColumnShareModelStorage,
        relationViewModelStorage: RelationViewModelStorage,
        memoViewModelStorage: MemoViewModelStorage,
        lastUpdatedAt: Date
    }>): ErdDocument {
        const hasShareRelatedChange = (overrides.columnModelMap != null)
            || (overrides.columnGroupModelMap != null)
            || (overrides.columnShareModelStorage != null);
        const nextTableViewModelMap = overrides.tableViewModelMap ?? this.tableViewModelMap;
        const nextColumnGroupModelMap = overrides.columnGroupModelMap ?? this.columnGroupModelMap;
        const baseColumnModelMap = overrides.columnModelMap ?? this.columnModelMap;
        const baseShareStorage = overrides.columnShareModelStorage ?? this.columnShareStorage;

        const reachableModelIds = hasShareRelatedChange
            ? this.doCollectReachableModelIds(
                nextTableViewModelMap, nextColumnGroupModelMap, baseColumnModelMap, baseShareStorage
            ) : null;
        const nextColumnModelMap = (reachableModelIds == null) ? baseColumnModelMap
            : this.doRetainColumnModels(baseColumnModelMap, reachableModelIds.columnModelIds);
        const nextColumnShareStorage = (reachableModelIds == null) ? baseShareStorage
            : baseShareStorage.retain(
                reachableModelIds.columnShareModelIds, reachableModelIds.structShareModelIds,
                new Set(nextColumnModelMap.keys()), new Set(nextColumnGroupModelMap.keys())
            );

        return new ErdDocument(
            overrides.documentName ?? this.documentName,
            overrides.erdSettingModel ?? this.erdSettingModel,
            overrides.databaseSettingModel ?? this.databaseSettingModel,
            overrides.schemaConfig ?? this.schemaConfig,
            overrides.tableViewModelIds ?? this.tableViewModelIds,
            overrides.tableViewModelMap ?? this.tableViewModelMap,
            nextColumnGroupModelMap,
            nextColumnModelMap,
            nextColumnShareStorage,
            overrides.relationViewModelStorage ?? this.relationViewModelStorage,
            overrides.memoViewModelStorage ?? this.memoViewModelStorage,
            overrides.lastUpdatedAt ?? null
        );
    }

    // テーブルとカラムグループを根に、single 参照と struct 定義を推移的に辿って生存モデルを確定する。
    // ColumnGroupModel は明示削除でのみ消える管理対象のため、常に根として扱う。
    // ワークリスト走査により、struct 削除に伴うメンバー・共有定義の連鎖的な孤立が一度の走査で収束する。
    private doCollectReachableModelIds(
        nextTableViewModelMap: Map<string, TableViewModel>,
        nextColumnGroupModelMap: Map<string, ColumnGroupModel>,
        baseColumnModelMap: Map<string, ColumnModel>,
        baseShareStorage: ColumnShareModelStorage
    ): ReachableModelIds {
        const rootColumnIdsFromTable = Array.from(nextTableViewModelMap.values())
            .flatMap(tableViewModel => toSingleColumnIds(tableViewModel.tableModel.columnEntries));
        const rootColumnIdsFromGroup = Array.from(nextColumnGroupModelMap.values())
            .flatMap(groupModel => groupModel.columnModelIds);

        const columnModelIds = new Set<string>();
        const columnShareModelIds = new Set<string>();
        const structShareModelIds = new Set<string>();
        const pendingColumnModelIds = [...rootColumnIdsFromTable, ...rootColumnIdsFromGroup];

        while (pendingColumnModelIds.length > 0) {
            const columnModelId = pendingColumnModelIds.pop();
            if ((columnModelId == null) || columnModelIds.has(columnModelId)) {
                continue;
            }
            columnModelIds.add(columnModelId);

            const columnModel = baseColumnModelMap.get(columnModelId);
            if (columnModel == null) {
                continue;
            }
            if (ColumnModel.isSimpleColumn(columnModel)) {
                columnShareModelIds.add(columnModel.columnShareModelId);
                continue;
            }

            const structShareModelId = columnModel.structShareModelId;
            if (structShareModelIds.has(structShareModelId)) {
                continue;
            }
            structShareModelIds.add(structShareModelId);

            const structShareModel = baseShareStorage.findStructShare(structShareModelId);
            if (structShareModel == null) {
                continue;
            }
            pendingColumnModelIds.push(...toSingleColumnIds(structShareModel.columnEntries));
        }

        return { columnModelIds, columnShareModelIds, structShareModelIds };
    }

    private doRetainColumnModels(
        baseColumnModelMap: Map<string, ColumnModel>, reachableColumnModelIds: ReadonlySet<string>
    ): Map<string, ColumnModel> {
        const unreachableColumnModelIds = Array.from(baseColumnModelMap.keys())
            .filter(columnModelId => (reachableColumnModelIds.has(columnModelId) === false));

        if (unreachableColumnModelIds.length === 0) {
            return baseColumnModelMap;
        }

        const retainedColumnModelMap = new Map(baseColumnModelMap);
        unreachableColumnModelIds.forEach(columnModelId => retainedColumnModelMap.delete(columnModelId));

        return retainedColumnModelMap;
    }

    public getDatabase(): Database {
        return this.databaseSettingModel.getDatabase();
    }

    public getDisplayNameStyle(): DisplayNameStyle {
        return this.erdSettingModel.displayNameStyle;
    }

    public getDisplayColumnStyle(): DisplayColumnStyle {
        return this.erdSettingModel.displayColumnStyle;
    }

    public findSchema(schemaId: string): DbSchemaModel | null {
        const database = this.getDatabase();
        if (database.supportsSchema === false) {
            return null;
        }

        return this.schemaConfig.findSchema(schemaId);
    }

    public findDefaultSchema(): DbSchemaModel | null {
        const database = this.getDatabase();
        if (database.supportsSchema === false) {
            return null;
        }

        return this.schemaConfig.findDefaultSchema();
    }

    public findTableViewModel(tableId: string): TableViewModel | null {
        const tableViewModel = this.tableViewModelMap.get(tableId);
        return tableViewModel ? tableViewModel : null;
    }

    public getTableViewModels(): TableViewModel[] {
        return this.tableViewModelIds
            .map(tableId => this.tableViewModelMap.get(tableId) as TableViewModel)
    }

    public findColumnGroupModel(columnGroupId: string): ColumnGroupModel | null {
        const columnGroupModel = this.columnGroupModelMap.get(columnGroupId);
        return columnGroupModel ? columnGroupModel : null;
    }

    public getColumnGroupModels(): ColumnGroupModel[] {
        const models = Array.from(this.columnGroupModelMap.values());

        return models.sort((firsts, second) => {
            const nameCompared = firsts.groupName.localeCompare(second.groupName, "en");
            if (nameCompared !== 0) {
                return nameCompared;
            }

            return firsts.columnGroupId.localeCompare(second.columnGroupId, "en");
        });
    }

    public findStructColumnShareModel(structColumnShareModelId: string): StructColumnShareModel | null {
        return this.columnShareStorage.findStructShare(structColumnShareModelId);
    }

    public getStructColumnShareModels(): StructColumnShareModel[] {
        return this.columnShareStorage.getStructShareModels();
    }

    public findColumnModel(columnModelId: string): ColumnModel | null {
        const columnModel = this.columnModelMap.get(columnModelId);
        return columnModel ? columnModel : null;
    }

    /**
     * カラムエントリを表示順のまま ColumnModel 列へ解決する(struct バリアントは展開せずそのまま含む)。
     * group エントリはメンバーへフラット展開し、解決不能な参照(削除済みなど)はスキップする。
     * struct 定義の解決(findStructColumnShareModel)は消費側で行う。
     */
    public toAllColumnsWithStruct(container: TableModel | StructColumnShareModel): ColumnModel[] {
        return container.columnEntries
            .flatMap(column => {
                if (column.modelType === "single") {
                    return [column.columnModelId];
                }

                const columnGroup = this.findColumnGroupModel(column.columnGroupId);
                if (columnGroup == null) {
                    return [];
                }

                return columnGroup.columnModelIds;
            })
            .map(columnModelId => this.findColumnModel(columnModelId))
            .filter((columnModel): columnModel is ColumnModel => (columnModel != null));
    }

    /**
     * テーブルに属する simple バリアントの ColumnModel を全て取得する。
     * struct バリアントは PK・FK・UNIQUE・INDEX・検索候補から構造的に除外するため、常に対象外とする。
     */
    public toAllColumnsExceptStruct(tableModel: TableModel): SimpleColumnModel[] {
        return this.toAllColumnsWithStruct(tableModel)
            .filter(ColumnModel.isSimpleColumn);
    }

    public findColumnShareModel(columnShareModelId: string): ColumnShareModel | null {
        return this.columnShareStorage.findColumnShare(columnShareModelId);
    }

    public fetchReferencedColumnModelsForShareModel(columnShareModelId: string): SimpleColumnModel[] {
        return Array.from(this.columnModelMap.values())
            .filter(ColumnModel.isSimpleColumn)
            .filter(columnModel => (columnModel.columnShareModelId === columnShareModelId))
            .sort((first, second) => {
                const nameCompared = first.physicalName.localeCompare(second.physicalName, "en");
                if (nameCompared !== 0) {
                    return nameCompared;
                }

                return first.columnModelId.localeCompare(second.columnModelId, "en");
            });
    }

    public getColumnShareModelStorage(): ColumnShareModelStorage {
        return this.columnShareStorage.copy();
    }

    public findRelationViewModel(relationId: string): RelationViewModel | null {
        return this.relationViewModelStorage.findByRelationId(relationId);
    }

    public fetchRelationsByTableIds(tableIds: string[]): RelationViewModel[] {
        if (tableIds.length === 0) {
            return [];
        }

        return this.relationViewModelStorage.fetchRelationsByTableIds(tableIds);
    }

    public getRelationViewModels(): RelationViewModel[] {
        return this.relationViewModelStorage.getModels();
    }

    public inChildRelation(tableId: string, columnId: string): boolean {
        return this.relationViewModelStorage.inChildRelation(tableId, columnId);
    }

    public findParentRelation(childTableId: string, childColumnId: string) {
        return this.relationViewModelStorage.findParentRelation(childTableId, childColumnId);
    }

    public findRelatedRelations(tableId: string) {
        const parentRelations = this.relationViewModelStorage.fetchRelationsByParent(tableId);
        const childRelations = this.relationViewModelStorage.fetchRelationsByChild(tableId);

        return { parentRelations, childRelations };
    }

    public findMemoViewModel(memoId: string): MemoViewModel | null {
        return this.memoViewModelStorage.find(memoId);
    }

    public getMemoViewModels(): { frontMemos: MemoViewModel[], backMemos: MemoViewModel[] } {
        return this.memoViewModelStorage.getMemos();
    }

    /**
     * DBスキーマ設定を更新する。
     * 
     * @param next 更新後の状態
     * @returns 操作後のモデル
     */
    public updateSchema(next: DbSchemaConfig): ErdDocument {
        if (this.schemaConfig.equals(next)) {
            return this;
        }

        return this.doUpdate({
            schemaConfig: next
        });
    }

    /**
     * 指定されたテーブルの情報を更新する。
     * このメソッドは、カラムの追加・削除・更新を伴わない、テーブルメタ情報のみが更新される場合に使用する。
     * (MCP Server 経由の利用を想定している)
     */
    public updateTableMeta(...updatingTables: TableViewModel[]): ErdDocument {
        const nextTableViewMap = new Map(this.tableViewModelMap);
        updatingTables.forEach(updating => {
            nextTableViewMap.set(updating.tableId, updating);
        });

        return this.doUpdate({
            tableViewModelMap: nextTableViewMap
        });
    }

    /**
     * 指定されたテーブルおよびカラム共有モデルを反映する。
     * 
     * @param updatingTableView 更新後のテーブルモデル
     * @param updatingColumns 更新後のカラムモデル
     * @param updatingColumnShareModelStorage 更新後のカラム共有モデル
     * @returns 操作後のモデル
     */
    public updateTableViewWithColumns(
        updatingTableView: TableViewModel, updatingColumns: ColumnModel[],
        inputColumnShareModelStorage: ColumnShareModelStorage | null = null
    ): ErdDocument {

        const updatingColumnShareStorage = inputColumnShareModelStorage || this.columnShareStorage;
        const previousTableView = this.tableViewModelMap.get(updatingTableView.tableId);
        if (previousTableView == null) {
            return this.doAddTableViewModel(
                updatingTableView, updatingColumns, updatingColumnShareStorage
            );
        }

        // 更新対象のテーブルに relation が親として定義されている場合、子テーブルに PK の変更を反映する
        const {
            nextTableViewModels,
            nextColumnModelMap: updatingColumnMap,
            nextRelationViewModelStorage
        } = this.doUpdateTableViewModelWithRelation(
            previousTableView, updatingTableView, updatingColumns, updatingColumnShareStorage
        );

        const nextTableViewMap = new Map(this.tableViewModelMap);
        nextTableViewModels.forEach(nextTableViewModel => {
            nextTableViewMap.set(nextTableViewModel.tableId, nextTableViewModel);
        });

        // カラムの追加・更新のみ反映する。テーブルの columnEntries から外れたことによる
        // ColumnModel の生存判定は doUpdate に集約されており、他所から参照されていれば残る。
        const nextColumnMap = new Map(this.columnModelMap);
        updatingColumnMap.forEach(columnModel => nextColumnMap.set(columnModel.columnModelId, columnModel));

        return this.doUpdate({
            tableViewModelMap: nextTableViewMap,
            columnModelMap: nextColumnMap,
            columnShareModelStorage: updatingColumnShareStorage.copy(),
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    private doAddTableViewModel(
        addingTableView: TableViewModel, addingColumns: ColumnModel[], columnShareStorage: ColumnShareModelStorage
    ): ErdDocument {
        const nextTableViewIds = [...this.tableViewModelIds, addingTableView.tableId];

        const nextTableViewMap = new Map(this.tableViewModelMap);
        nextTableViewMap.set(addingTableView.tableId, addingTableView);

        const nextColumnMap = new Map(this.columnModelMap);
        addingColumns.forEach(columnModel =>
            nextColumnMap.set(columnModel.columnModelId, columnModel)
        );

        // columnShare の physicalName 変更時に、他 table の checkExpression も更新する必要がある
        const updatingTableViews = this.doUpdateTableCheckExpression(addingTableView, nextColumnMap, columnShareStorage);
        updatingTableViews.forEach(tableView => nextTableViewMap.set(tableView.tableId, tableView));

        return this.doUpdate({
            tableViewModelIds: nextTableViewIds,
            tableViewModelMap: nextTableViewMap,
            columnModelMap: nextColumnMap,
            columnShareModelStorage: columnShareStorage.copy()
        });
    }

    private doUpdateTableCheckExpression(
        updatingTableView: TableViewModel, nextColumnMap: Map<string, ColumnModel>,
        columnShareStorage: ColumnShareModelStorage
    ) {
        if (columnShareStorage.equals(this.columnShareStorage) === true) {
            return [];
        }

        const updatingPairs = updatingTableView.tableModel.columnEntries.map(wrapColumn => {
            if (wrapColumn.modelType !== "single") {
                return null;
            }

            const columnModel = nextColumnMap.get(wrapColumn.columnModelId);
            if ((columnModel == null) || (ColumnModel.isSimpleColumn(columnModel) === false)) {
                return null;
            }

            const previousColumnShare = this.columnShareStorage.findColumnShare(columnModel.columnShareModelId);
            const nextColumnShare = columnShareStorage.findColumnShare(columnModel.columnShareModelId);
            if ((previousColumnShare == null) || (nextColumnShare == null)) {
                return null;
            }
            if (previousColumnShare.physicalName === nextColumnShare.physicalName) {
                return null;
            }

            return { previousColumnShare, nextColumnShare };
        }).filter(columnShare => columnShare !== null);

        if (updatingPairs.length === 0) {
            return [];
        }

        const targetColumnShareMapping =
            new Map(updatingPairs.map(pair => [pair.nextColumnShare.columnShareModelId, pair]));
        const updatingTableViews = Array.from(this.tableViewModelMap.entries()).map(([tableId, tableView]) => {
            const tableModel = tableView.tableModel;
            if ((tableModel.checkExpression == "") || (tableId === updatingTableView.tableId)) {
                return null;
            }

            const changingNames = this.toAllColumnsExceptStruct(tableModel).map(column => {
                const updatingPair = targetColumnShareMapping.get(column.columnShareModelId);
                if (updatingPair == null) {
                    return null;
                }

                const previousName = overrideColumnName(column, updatingPair.previousColumnShare);
                const nextName = overrideColumnName(column, updatingPair.nextColumnShare);
                if (previousName.physicalName === nextName.physicalName) {
                    return null;
                }

                return { previousName, nextName };
            }).filter(target => (target !== null));

            const updatingTable = tableModel.updateCheckExpression(changingNames);
            if (updatingTable === tableModel) {
                return null;
            }

            console.debug(`Update checkExpression. tableId: ${tableId}, tableName: ${tableModel.physicalName}, `
                + `before: ${tableModel.checkExpression}, after: ${updatingTable.checkExpression}`);

            return new TableViewModel({ ...tableView, tableModel: updatingTable });
        }).filter(tableView => (tableView !== null));

        return updatingTableViews;
    }

    private doUpdateTableViewModelWithRelation(
        previousTableView: TableViewModel, nextTableView: TableViewModel, updatingColumns: ColumnModel[],
        columnShareStorage: ColumnShareModelStorage
    ) {
        const updatingColumnMap = new Map(updatingColumns.map(model => [model.columnModelId, model]));
        const relationViewModels = this.relationViewModelStorage.fetchRelationsByParent(nextTableView.tableId);

        // columnShare の physicalName 変更時に、他 table の checkExpression も更新する必要がある
        const nextColumnMap = new Map(this.columnModelMap);
        updatingColumns.forEach(columnModel =>
            nextColumnMap.set(columnModel.columnModelId, columnModel)
        );
        const updatingTableViews = this.doUpdateTableCheckExpression(nextTableView, nextColumnMap, columnShareStorage);

        const nextTableViewModels = [nextTableView, ...updatingTableViews];

        // relation が定義されていない場合は何もしない
        if (relationViewModels.length === 0) {
            return {
                nextTableViewModels,
                nextColumnModelMap: updatingColumnMap,
                nextRelationViewModelStorage: this.relationViewModelStorage
            };
        }

        const updatingPrimaryKeys = nextTableView.tableModel.columnEntries
            .flatMap(column => {
                if (column.modelType === "single") {
                    const updatingColumn = updatingColumnMap.get(column.columnModelId);
                    return (updatingColumn != null) ? [updatingColumn] : [];
                }

                // GroupColumn は参照のみなので、変更前の ErdDocument から取得する
                const columnGroupModel = this.columnGroupModelMap.get(column.columnGroupId);
                if (columnGroupModel == null) {
                    return [];
                }

                return columnGroupModel.columnModelIds
                    .map(columnModelId => this.findColumnModel(columnModelId))
                    .filter((columnModel): columnModel is ColumnModel => (columnModel != null));
            })
            .filter(ColumnModel.isSimpleColumn)
            .filter(columnModel => columnModel.primaryKey === true)

        const previousColumnModels = this.toAllColumnsExceptStruct(previousTableView.tableModel);

        // 更新に伴い、PK の削除となる ColumnModelId
        const deletingPrimaryKeyIds = previousColumnModels
            .filter(previousColumnModel =>
                (previousColumnModel.primaryKey === true)
                && (updatingPrimaryKeys.some(updatingKey =>
                    updatingKey.columnModelId === previousColumnModel.columnModelId
                ) === false)
            )
            .map(columnModel => columnModel.columnModelId);

        const previousPrimaryKeyIds = previousColumnModels
            .filter(columnModel => columnModel.primaryKey === true)
            .map(columnModel => columnModel.columnModelId);
        // 更新に伴い、PK の追加となる ColumnModelId
        const addingPrimaryKeys = updatingPrimaryKeys.filter(updatingColumn =>
            previousPrimaryKeyIds.includes(updatingColumn.columnModelId) === false);

        // PKに差分がない場合は relation に変更ないので、何もしない
        if ((deletingPrimaryKeyIds.length === 0) && (addingPrimaryKeys.length === 0)) {
            return {
                nextTableViewModels,
                nextColumnModelMap: updatingColumnMap,
                nextRelationViewModelStorage: this.relationViewModelStorage
            };
        }

        const nextTableViewModelMap = new Map(nextTableViewModels.map(table => [table.tableId, table]));

        const changeResult = this.doUpdateRelationWithPrimaryKeyChanged(
            relationViewModels, nextTableViewModelMap, updatingColumnMap,
            addingPrimaryKeys, deletingPrimaryKeyIds
        );

        return { ...changeResult, nextTableViewModels: Array.from(changeResult.nextTableViewMap.values()) }
    }

    private doUpdateRelationWithPrimaryKeyChanged(
        relationViews: RelationViewModel[],
        tableViewMap: Map<string, TableViewModel>,
        updatingColumnModelMap: Map<string, ColumnModel>,
        addingPrimaryKeys: SimpleColumnModel[],
        deletingPrimaryKeyIds: string[],
        updatingColumnGroupModel: ColumnGroupModel | null = null
    ) {
        const nextTableViewMap = new Map(tableViewMap);
        const nextColumnModelMap = new Map(updatingColumnModelMap);
        const updatingRelationMap = new Map<string, RelationModel>();
        const deletingRelationIds = new Set<string>();

        // PK に指定したカラムが削除された場合、該当カラムを利用したリレーション定義を削除する
        if (deletingPrimaryKeyIds.length > 0) {
            for (const relationView of relationViews) {
                const previousRelation = relationView.relationModel;
                const nextPairs = previousRelation.relationPairs
                    .filter(pair => deletingPrimaryKeyIds.includes(pair.parentColumnModelId) === false);

                // リレーション定義に変更がない場合は何もしない
                if (previousRelation.relationPairs.length === nextPairs.length) {
                    continue;
                }

                // リレーション定義がなくなった場合は削除候補 (PK追加により、削除されない場合もある)
                if (nextPairs.length === 0) {
                    deletingRelationIds.add(relationView.relationId);
                }

                const nextRelation = new RelationModel({
                    ...relationView.relationModel,
                    relationPairs: nextPairs
                });
                updatingRelationMap.set(nextRelation.relationModelId, nextRelation);
            }
        }

        // PK にカラムが追加される場合、子テーブルに新規にカラムを追加する
        if (addingPrimaryKeys.length > 0) {
            for (const beforeView of relationViews) {
                const previousRelation = updatingRelationMap.get(beforeView.relationId)
                    || beforeView.relationModel;

                const childTableView = nextTableViewMap.get(previousRelation.childTableModelId)
                    || this.tableViewModelMap.get(previousRelation.childTableModelId);
                if (childTableView == null) {
                    continue;
                }

                // 子テーブルにも同じカラムグループが存在するならば、同じカラムグループを利用する
                const hasSameGroupColumn = (updatingColumnGroupModel === null) ? false
                    : childTableView.tableModel.columnEntries
                        .some(column => (column.modelType === "group")
                            && (column.columnGroupId === updatingColumnGroupModel.columnGroupId));
                if (hasSameGroupColumn) {
                    const nextRelationPairs = [
                        ...previousRelation.relationPairs,
                        ...addingPrimaryKeys.map(addingColumn => new RelationPair({
                            parentColumnModelId: addingColumn.columnModelId,
                            childColumnModelId: addingColumn.columnModelId
                        }))
                    ];

                    const nextRelation = new RelationModel({
                        ...previousRelation,
                        relationPairs: nextRelationPairs
                    });

                    updatingRelationMap.set(nextRelation.relationModelId, nextRelation);
                    deletingRelationIds.delete(nextRelation.relationModelId);
                    continue;
                }

                // 子テーブルに同じカラムグループが存在しない場合は、子テーブルに新規にカラムを追加する。
                // 新規作成なので、updateRelation と同じ基準(childCardinality)でNOT NULLを決める。
                const isChildMandatory = isMandatoryCardinality(previousRelation.childCardinality);
                const addingObjects = addingPrimaryKeys.map(addingParentColumn => {
                    const addingChildColumnModel = new SimpleColumnModel({
                        columnModelId: uuidV4(),
                        columnShareModelId: addingParentColumn.columnShareModelId,
                        physicalName: addingParentColumn.physicalName,
                        logicalName: addingParentColumn.logicalName,
                        notNull: isChildMandatory
                    });

                    return {
                        columnModel: addingChildColumnModel,
                        relationPair: new RelationPair({
                            parentColumnModelId: addingParentColumn.columnModelId,
                            childColumnModelId: addingChildColumnModel.columnModelId
                        })
                    };
                });

                const addingColumnModels = addingObjects.map(addingObj => addingObj.columnModel);
                const addingRelationPairs = addingObjects.map(addingObj => addingObj.relationPair);

                addingColumnModels.forEach(addingColumn => {
                    nextColumnModelMap.set(addingColumn.columnModelId, addingColumn);
                });

                const childTable = childTableView.tableModel;
                const nextChildTableView = new TableViewModel({
                    ...childTableView,
                    tableModel: new TableModel({
                        ...childTable,
                        columnEntries: [
                            ...childTable.columnEntries,
                            ...addingColumnModels.map(columnModel => (
                                {
                                    modelType: "single",
                                    columnModelId: columnModel.columnModelId,
                                } as ColumnEntry
                            ))
                        ]
                    })
                });
                nextTableViewMap.set(nextChildTableView.tableId, nextChildTableView);

                const nextRelationPairs = [...previousRelation.relationPairs, ...addingRelationPairs];
                const nextRelation = new RelationModel({
                    ...previousRelation,
                    relationPairs: nextRelationPairs
                });
                updatingRelationMap.set(nextRelation.relationModelId, nextRelation);
                deletingRelationIds.delete(nextRelation.relationModelId);
            }
        }

        deletingRelationIds.forEach(deletingId => updatingRelationMap.delete(deletingId));

        return {
            nextTableViewMap, nextColumnModelMap,
            nextRelationViewModelStorage: this.relationViewModelStorage
                .updateRelationModel(Array.from(updatingRelationMap.values()))
                .deleteRelation(Array.from(deletingRelationIds))
        };
    }

    /**
     * 指定されたIDのテーブルを削除したモデルを作成する。
     * 
     * @param deletingTableId 削除対象のテーブルID
     * @returns 操作後のモデル
     */
    public deleteTable(deletingTableId: string): ErdDocument {
        const deletingTarget = this.tableViewModelMap.get(deletingTableId);
        if (deletingTarget == null) {
            return this;
        }

        const nextTableViewModelIds = this.tableViewModelIds.filter(tableId => (tableId !== deletingTableId));
        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        nextTableViewModelMap.delete(deletingTableId);

        // テーブルが持っていた列の生存判定は doUpdate に集約されており、他所から参照されていれば残る。
        return this.doUpdate({
            tableViewModelIds: nextTableViewModelIds,
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: this.columnModelMap,
            relationViewModelStorage: this.relationViewModelStorage.deleteFromTableId([deletingTableId])
        });
    }

    /**
     * 指定されたカラムグループの追加もしくは更新を行う。
     * 
     * @param updatingModel 更新対象
     * @param updatingColumnModels 更新カラム
     * @param updatingColumnShareStorage 更新後のカラム共有モデルストレージ 
     * @returns 操作後のモデル。
     */
    public updateColumnGroup(
        updatingModel: ColumnGroupModel,
        updatingColumnModels: ColumnModel[],
        updatingColumnShareStorage: ColumnShareModelStorage
    ): ErdDocument {
        const previousModel = this.columnGroupModelMap.get(updatingModel.columnGroupId) || null;

        const nextColumnGroupModelMap = new Map(this.columnGroupModelMap);
        nextColumnGroupModelMap.set(updatingModel.columnGroupId, updatingModel);

        // グループから外れたメンバーの生存判定は doUpdate に集約されており、他所から参照されていれば残る。
        const preNextColumnModelMap = new Map(this.columnModelMap);
        updatingColumnModels.forEach(columnModel => {
            preNextColumnModelMap.set(columnModel.columnModelId, columnModel);
        });

        // インデクス、およびリレーションの更新
        const { nextTableViewMap, nextColumnModelMap, nextRelationViewModelStorage }
            = this.doUpdateTableViewModelsWithUpdatingColumnGroup(
                previousModel, updatingModel, updatingColumnModels, preNextColumnModelMap, updatingColumnShareStorage
            );

        return this.doUpdate({
            tableViewModelMap: (nextTableViewMap.size > 0)
                ? new Map([...this.tableViewModelMap, ...nextTableViewMap]) : this.tableViewModelMap,
            columnGroupModelMap: nextColumnGroupModelMap,
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: updatingColumnShareStorage.copy(),
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    private doUpdateTableViewModelsWithUpdatingColumnGroup(
        previousModel: ColumnGroupModel | null, updatingColumnGroupModel: ColumnGroupModel,
        updatingColumnModels: ColumnModel[], columnModelMap: Map<string, ColumnModel>,
        updatingColumnShareStorage: ColumnShareModelStorage
    ) {
        const tableViewModels = Array.from(this.tableViewModelMap.values())
            .filter(tableViewModel => tableViewModel.tableModel.columnEntries
                .some(column => (column.modelType === "group")
                    && (column.columnGroupId === updatingColumnGroupModel.columnGroupId)));

        const nextTableViewMap = new Map<string, TableViewModel>();
        // 該当カラムグループを参照しているテーブルが存在しない場合は、何もしない
        if (tableViewModels.length === 0) {
            return {
                nextTableViewMap: nextTableViewMap,
                nextColumnModelMap: columnModelMap,
                nextRelationViewModelStorage: this.relationViewModelStorage
            };
        }

        // カラム名変更時は、checkExpression に変更前のカラム名が含まれる場合に更新が必要 (struct は checkExpression の対象外)
        const changingNames = updatingColumnModels.filter(ColumnModel.isSimpleColumn).map(updatingColumn => {
            const previousColumn = this.columnModelMap.get(updatingColumn.columnModelId);
            if ((previousColumn == null) || (ColumnModel.isSimpleColumn(previousColumn) === false)) {
                return null;
            }
            const previousColumnShare = this.columnShareStorage.findColumnShare(previousColumn.columnShareModelId);
            if (previousColumnShare == null) {
                return null;
            }

            const updatingColumnShare = updatingColumnShareStorage.findColumnShare(updatingColumn.columnShareModelId);
            if (updatingColumnShare == null) {
                return null;
            }

            const previousName = overrideColumnName(previousColumn, previousColumnShare);
            const nextName = overrideColumnName(updatingColumn, updatingColumnShare);
            if (previousName.physicalName === nextName.physicalName) {
                return null;
            }

            return { previousName, nextName };
        }).filter(pair => pair !== null);

        const changedTableIds = new Set<string>();
        const nextTableViews = tableViewModels.map(tableView => {
            const beforeTable = tableView.tableModel;
            const updatingTable = beforeTable.updateCheckExpression(changingNames);
            if (updatingTable === beforeTable) {
                return tableView;
            }

            changedTableIds.add(tableView.tableId);
            console.debug(`Update checkExpression. tableId: ${tableView.tableId}, tableName: ${beforeTable.physicalName}, `
                + `before: ${beforeTable.checkExpression}, after: ${updatingTable.checkExpression}`);

            const nextTableView = new TableViewModel({ ...tableView, tableModel: updatingTable });
            nextTableViewMap.set(nextTableView.tableId, nextTableView);

            return nextTableView;
        });

        const deletingColumnModelIds = new Set((previousModel == null) ? []
            : previousModel.columnModelIds.filter(previousId =>
                (updatingColumnGroupModel.columnModelIds.includes(previousId) === false))
        );

        // 削除したカラムにインデクス定義がある場合は、インデクス定義から削除する
        if (deletingColumnModelIds.size > 0) {
            for (const tableView of nextTableViews) {
                const beforeTableModel = tableView.tableModel;

                const updatedUniqueKeys = TableUniqueKeysModel.filterColumns(
                    beforeTableModel.uniqueKeysModels,
                    column => (deletingColumnModelIds.has(column.columnModelId) === false)
                );

                const updatedTableIndex = TableIndexModel.filterColumns(
                    beforeTableModel.tableIndexModels,
                    column => (deletingColumnModelIds.has(column.columnModelId) === false)
                );

                if ((changedTableIds.has(tableView.tableId) === false) &&
                    (updatedUniqueKeys.hasChanged === false) && (updatedTableIndex.hasChanged === false)
                ) {
                    continue;
                }

                const nextTableViewModel = new TableViewModel({
                    ...tableView,
                    tableModel: new TableModel({
                        ...beforeTableModel,
                        uniqueKeysModels: updatedUniqueKeys.tableUniqueKeysModels,
                        tableIndexModels: updatedTableIndex.tableIndexModels
                    })
                });
                nextTableViewMap.set(nextTableViewModel.tableId, nextTableViewModel);
            }
        }

        const previousPrimaryKeyIds = (previousModel == null) ? []
            : previousModel.columnModelIds
                .map(columnModelId => this.columnModelMap.get(columnModelId))
                .filter((columnModel): columnModel is SimpleColumnModel =>
                    (columnModel != null) && ColumnModel.isSimpleColumn(columnModel) && (columnModel.primaryKey === true))
                .map(columnModel => columnModel.columnModelId);
        const nextPrimaryColumnModels = updatingColumnGroupModel.columnModelIds
            .map(columnModelId => columnModelMap.get(columnModelId))
            .filter((columnModel): columnModel is SimpleColumnModel =>
                (columnModel != null) && ColumnModel.isSimpleColumn(columnModel) && (columnModel.primaryKey === true));

        const deletingPrimaryKeyIds = previousPrimaryKeyIds.filter(previousId =>
            (nextPrimaryColumnModels.every(nextPk => (nextPk.columnModelId !== previousId)))
        );
        const addingPrimaryKeys = nextPrimaryColumnModels.filter(nextColumn =>
            (previousPrimaryKeyIds.includes(nextColumn.columnModelId) === false)
        );

        // PK のチェックはリレーションが定義されているテーブルのみが対象
        const relationViewModels = tableViewModels.flatMap(tableViewModel =>
            this.relationViewModelStorage.fetchRelationsByParent(tableViewModel.tableId)
        );

        return this.doUpdateRelationWithPrimaryKeyChanged(
            relationViewModels, nextTableViewMap, columnModelMap,
            addingPrimaryKeys, deletingPrimaryKeyIds, updatingColumnGroupModel
        );
    }

    /**
     * 指定したカラムグループを削除する。
     * 
     * @param columnGroupId 削除対象のカラムグループID
     * @returns 操作後のモデル
     */
    public deleteColumnGroup(columnGroupId: string): ErdDocument {
        const previousModel = this.columnGroupModelMap.get(columnGroupId);
        if (previousModel == null) {
            return this;
        }

        const nextColumnGroupModelMap = new Map(this.columnGroupModelMap);
        nextColumnGroupModelMap.delete(columnGroupId);

        const { nextTableViewModelMap, nextRelationViewModelStorage }
            = this.doUpdateTableViewModelsWithDeletingColumnGroup(previousModel);

        // グループが持っていたメンバーの生存判定は doUpdate に集約されており、他所から参照されていれば残る。
        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            columnGroupModelMap: nextColumnGroupModelMap,
            columnModelMap: this.columnModelMap,
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    private doUpdateTableViewModelsWithDeletingColumnGroup(deletingModel: ColumnGroupModel) {
        const previousColumnModels = deletingModel.columnModelIds
            .map(columnModelId => this.columnModelMap.get(columnModelId))
            .filter((columnModel): columnModel is SimpleColumnModel =>
                (columnModel != null) && ColumnModel.isSimpleColumn(columnModel));
        const previousPkColumnModelIds = previousColumnModels
            .filter(columnModel => (columnModel.primaryKey === true))
            .map(columnModel => columnModel.columnModelId);

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        const changedPreviousTableModels: TableModel[] = [];
        const deleteTableIds: string[] = [];
        const deleteRelationIds = new Set<string>();
        let hasChanged = false;

        // インデクスの更新
        for (const [tableId, tableViewModel] of this.tableViewModelMap.entries()) {
            const nextColumns = tableViewModel.tableModel.columnEntries
                .filter(column => (column.modelType !== "group")
                    || (column.columnGroupId !== deletingModel.columnGroupId)
                );

            if (tableViewModel.tableModel.columnEntries.length === nextColumns.length) {
                continue;
            }

            hasChanged = true;
            if (nextColumns.length === 0) {
                nextTableViewModelMap.delete(tableId);
                deleteTableIds.push(tableId);
                continue;
            }

            changedPreviousTableModels.push(tableViewModel.tableModel);

            const notContainedInDeletingModel = (columnModelId: string) => {
                return (deletingModel.columnModelIds.includes(columnModelId) === false);
            }

            const updatedUniqueKeys = TableUniqueKeysModel.filterColumns(
                tableViewModel.tableModel.uniqueKeysModels,
                column => notContainedInDeletingModel(column.columnModelId)
            );
            const updatedTableIndex = TableIndexModel.filterColumns(
                tableViewModel.tableModel.tableIndexModels,
                column => notContainedInDeletingModel(column.columnModelId)
            );

            const nextTableViewModel = new TableViewModel({
                ...tableViewModel,
                tableModel: new TableModel({
                    ...tableViewModel.tableModel,
                    columnEntries: nextColumns,
                    uniqueKeysModels: updatedUniqueKeys.tableUniqueKeysModels,
                    tableIndexModels: updatedTableIndex.tableIndexModels,
                })
            });
            nextTableViewModelMap.set(tableId, nextTableViewModel);
        }

        // 親リレーションの更新
        // 削除される PK カラムを参照するペアを取り除き、ペアがなくなったリレーションは削除対象とする
        const updatingParentRelationMapping = (previousPkColumnModelIds.length === 0) ? new Map<string, RelationModel>()
            : new Map(changedPreviousTableModels
                .flatMap(tableModel =>
                    this.relationViewModelStorage.fetchRelationsByParent(tableModel.tableModelId)
                        .map(relationViewModel => {
                            const nextPairs = relationViewModel.relationModel.relationPairs.filter(pair =>
                                (previousPkColumnModelIds.includes(pair.parentColumnModelId) === false)
                            );

                            if (nextPairs.length === 0) {
                                deleteRelationIds.add(relationViewModel.relationId);
                                return null;
                            }

                            return new RelationModel({
                                ...relationViewModel.relationModel,
                                relationPairs: nextPairs
                            });
                        })
                        .filter((relationViewModel): relationViewModel is RelationModel => (relationViewModel != null))
                )
                .map(relationModel => [relationModel.relationModelId, relationModel])
            );

        // 子リレーションの削除判定
        // 削除されるカラムを子側ペアに含むリレーションは、ペア単位の除去ではなくリレーションごと削除対象とする。
        // 削除対象とならないリレーションには、親側の更新 (updatingParentRelationModels) 以外の変更は発生しない。
        const deletingColumnModelIds = new Set(deletingModel.columnModelIds);
        const deletingChildRelationIds = changedPreviousTableModels
            .flatMap(tableModel => this.relationViewModelStorage.fetchRelationsByChild(tableModel.tableModelId))
            .filter(viewModel => (deleteRelationIds.has(viewModel.relationId) === false))
            .map(viewModel => updatingParentRelationMapping.get(viewModel.relationId) ?? viewModel.relationModel)
            .filter(relationModel => relationModel.relationPairs
                .some(pair => deletingColumnModelIds.has(pair.childColumnModelId)))
            .map(relationModel => relationModel.relationModelId);
        deletingChildRelationIds.forEach(relationId => deleteRelationIds.add(relationId));

        const nextRelationViewModelStorage = this.relationViewModelStorage
            .updateRelationModel(Array.from(updatingParentRelationMapping.values()))
            .deleteFromTableId(deleteTableIds)
            .deleteRelation(Array.from(deleteRelationIds));

        return {
            nextTableViewModelMap: hasChanged ? nextTableViewModelMap : this.tableViewModelMap,
            nextRelationViewModelStorage: nextRelationViewModelStorage
        }
    }

    /**
     * 指定された StructColumnShare 群の追加もしくは更新を行う。
     * struct は PK・リレーション・unique/index に関与しないため、column-group の更新と異なりテーブル側の
     * インデクス・リレーション更新は発生しない。
     * 既存メンバーカラム自体の追加・更新は本メソッドの対象外(別途カラム操作 API を用いる)。
     * updatingModels を配列で受けるのは、新規 struct の作成とそれを参照する親 struct の更新のように、
     * 複数の struct 定義を同一トランザクションで反映する必要がある場合があるため(生存判定は参照有無で行われる)。
     * addingWrapperColumns は、updatingModels が新規に参照するネスト struct のラッパー ColumnModel など、
     * この更新と不可分な新規列を同一 doUpdate 内で反映するための引数。
     *
     * @param updatingModels 更新対象の struct 群
     * @param addingWrapperColumns この更新に伴い新規に追加する ColumnModel (未指定なら追加なし)
     * @returns 操作後のモデル
     */
    public updateStructColumnShare(
        updatingModels: readonly StructColumnShareModel[], addingWrapperColumns: readonly ColumnModel[] = []
    ): ErdDocument {
        // struct から外れたメンバーの生存判定は doUpdate に集約されており、他所から参照されていれば残る。
        const nextColumnShareModelStorage = this.columnShareStorage.addStructShare(...updatingModels);

        if (addingWrapperColumns.length === 0) {
            return this.doUpdate({
                columnShareModelStorage: nextColumnShareModelStorage
            });
        }

        const nextColumnModelMap = new Map(this.columnModelMap);
        addingWrapperColumns.forEach(columnModel => nextColumnModelMap.set(columnModel.columnModelId, columnModel));

        return this.doUpdate({
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: nextColumnShareModelStorage
        });
    }

    /**
     * 指定した StructColumnShare を削除する。
     * 当該 struct を参照する struct バリアントの ColumnModel (ラッパー) への参照を、
     * テーブル・カラムグループ・他の struct 定義のすべてから除去する。ラッパー自身・メンバーカラムの
     * 生存判定は doUpdate に集約されており、除去の結果どこからも参照されなくなったものだけが取り除かれる。
     *
     * @param structColumnShareModelId 削除対象の StructColumnShare ID
     * @returns 操作後のモデル
     */
    public deleteStructColumnShare(structColumnShareModelId: string): ErdDocument {
        const previousModel = this.columnShareStorage.findStructShare(structColumnShareModelId);
        if (previousModel == null) {
            return this;
        }

        // 当該 struct を参照する struct バリアントのラッパー ColumnModel への参照を除去対象にする
        const wrapperColumnIdSet = new Set(
            Array.from(this.columnModelMap.values())
                .filter(columnModel =>
                    (columnModel.entityType === "struct") && (columnModel.structShareModelId === structColumnShareModelId))
                .map(columnModel => columnModel.columnModelId)
        );

        // 全テーブルの columns から、ラッパーへの single 参照エントリを除去する。空になったテーブルは削除する。
        const nextTableViewModelIds = [...this.tableViewModelIds];
        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        const deleteTableIds: string[] = [];
        for (const [tableId, tableViewModel] of this.tableViewModelMap.entries()) {
            const nextColumns = tableViewModel.tableModel.columnEntries
                .filter(column => (column.modelType !== "single")
                    || (wrapperColumnIdSet.has(column.columnModelId) === false));

            if (nextColumns.length === tableViewModel.tableModel.columnEntries.length) {
                continue;
            }

            if (nextColumns.length === 0) {
                nextTableViewModelMap.delete(tableId);
                deleteTableIds.push(tableId);
                continue;
            }

            const nextTableViewModel = new TableViewModel({
                ...tableViewModel,
                tableModel: new TableModel({ ...tableViewModel.tableModel, columnEntries: nextColumns })
            });
            nextTableViewModelMap.set(tableId, nextTableViewModel);
        }
        const nextRelationViewModelStorage = (deleteTableIds.length > 0)
            ? this.relationViewModelStorage.deleteFromTableId(deleteTableIds) : this.relationViewModelStorage;
        const filteredTableViewModelIds = (deleteTableIds.length > 0)
            ? nextTableViewModelIds.filter(tableId => (deleteTableIds.includes(tableId) === false))
            : nextTableViewModelIds;

        // 全カラムグループの columnModelIds から、ラッパーへの参照を除去する
        const nextColumnGroupModelMap = new Map(this.columnGroupModelMap);
        for (const [groupId, groupModel] of this.columnGroupModelMap.entries()) {
            const nextColumnModelIds = groupModel.columnModelIds
                .filter(columnModelId => (wrapperColumnIdSet.has(columnModelId) === false));

            if (nextColumnModelIds.length === groupModel.columnModelIds.length) {
                continue;
            }

            nextColumnGroupModelMap.set(groupId, new ColumnGroupModel({ ...groupModel, columnModelIds: nextColumnModelIds }));
        }

        // 他の struct 定義の columnEntries から、ラッパーへの参照を除去したうえで struct 自体を削除する。
        // ラッパー・メンバーへの参照整合は doUpdate で追随される。
        const nextColumnShareModelStorage = this.columnShareStorage
            .getStructShareModels()
            .filter(structModel => (structModel.structShareModelId !== structColumnShareModelId))
            .reduce((storage, structModel) => {
                const nextEntries = structModel.columnEntries.filter(entry =>
                    (entry.modelType !== "single") || (wrapperColumnIdSet.has(entry.columnModelId) === false));

                if (nextEntries.length === structModel.columnEntries.length) {
                    return storage;
                }

                return storage.addStructShare(new StructColumnShareModel({ ...structModel, columnEntries: nextEntries }));
            }, this.columnShareStorage)
            .deleteStructShare([structColumnShareModelId]);

        return this.doUpdate({
            tableViewModelIds: filteredTableViewModelIds,
            tableViewModelMap: nextTableViewModelMap,
            columnGroupModelMap: nextColumnGroupModelMap,
            columnModelMap: this.columnModelMap,
            columnShareModelStorage: nextColumnShareModelStorage,
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    /**
     * カラムモデル、および共有カラムモデルを追加、更新する。
     * (MCP Server 経由の利用を想定している)
     * 
     * @param columns 追加、更新対象のカラムモデル
     * @param columnShares 追加、更新対象の共有カラムモデル
     * @returns 更新後のドキュメント
     */
    public updateColumnModels(columns: ColumnModel[], columnShares: ColumnShareModel[]): ErdDocument {
        if ((columns.length === 0) && (columnShares.length === 0)) {
            return this;
        }

        const nextShareModelStorage = this.columnShareStorage.addColumnShare(...columnShares);

        if (columns.length === 0) {
            return this.doUpdate({
                columnShareModelStorage: nextShareModelStorage
            });
        }

        const nextColumnModelMap = new Map(this.columnModelMap);
        columns.forEach(columnModel => {
            nextColumnModelMap.set(columnModel.columnModelId, columnModel);
        });

        return this.doUpdate({
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: nextShareModelStorage
        });
    }

    /**
     * リレーションを更新する。
     * 
     * @param updatingView 更新対象のリレーションビューモデル
     * @returns 更新後のドキュメント
     */
    public updateRelation(updatingView: RelationViewModel): ErdDocument {
        const updatingModel = updatingView.relationModel;
        const tempChildTableViewModel = this.tableViewModelMap.get(updatingModel.childTableModelId);
        if (tempChildTableViewModel == null) {
            return this;
        }

        const childTableModel = tempChildTableViewModel.tableModel;

        const detailPairs = updatingModel.relationPairs.map(relationPair => {
            return {
                parentColumnModelId: relationPair.parentColumnModelId,
                childColumnModelId: relationPair.childColumnModelId,
                childColumnModel: this.findColumnModel(relationPair.childColumnModelId)
            }
        });

        // 子カラムを新規作成する場合に限り、カーディナリティから NOT NULL を決める。
        // 既存カラムに紐づける場合は、そのカラムの NOT NULL を一切変更しない
        // (relationName や参照アクションだけを変えるつもりの更新が、無関係な既存カラムの
        // NOT NULL を書き換えてしまう副作用を防ぐため)。
        const nextAddingColumnModels = detailPairs
            .filter(pair => pair.childColumnModel == null)
            .map(pair => {
                // PK は simple カラムに限定されるため、リレーション親カラムは常に simple となる
                const parentColumnModel = this.findColumnModel(pair.parentColumnModelId) as SimpleColumnModel;
                return new SimpleColumnModel({
                    columnModelId: pair.childColumnModelId,
                    columnShareModelId: parentColumnModel.columnShareModelId,
                    physicalName: parentColumnModel.physicalName,
                    logicalName: parentColumnModel.logicalName,
                    notNull: isMandatoryCardinality(updatingModel.childCardinality)
                });
            });

        let nextTableViewModelMap: Map<string, TableViewModel>;
        if (nextAddingColumnModels.length > 0) {
            nextTableViewModelMap = new Map(this.tableViewModelMap);
            nextTableViewModelMap.set(
                childTableModel.tableModelId,
                new TableViewModel({
                    ...tempChildTableViewModel,
                    tableModel: childTableModel.addColumnModelIds(
                        nextAddingColumnModels.map(model => model.columnModelId)
                    )
                })
            );
        } else {
            nextTableViewModelMap = this.tableViewModelMap;
        }

        let nextColumnModelMap: Map<string, ColumnModel>;
        if (nextAddingColumnModels.length > 0) {
            nextColumnModelMap = new Map(this.columnModelMap);
            nextAddingColumnModels.forEach(model => nextColumnModelMap.set(model.columnModelId, model));
        } else {
            nextColumnModelMap = this.columnModelMap;
        }

        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: nextColumnModelMap,
            relationViewModelStorage: this.relationViewModelStorage.updateRelationView(updatingView)
        });
    }

    /**
     * 指定されたリレーションを削除する。
     * 
     * @param relationId 削除対象のリレーションID
     * @returns 更新後のドキュメント
     */
    public deleteRelation(relationId: string): ErdDocument {
        return this.doUpdateRelationStorage(() => this.relationViewModelStorage.deleteRelation([relationId]));
    }

    /**
     * 指定されたリレーションの線描画を更新する。
     * 
     * @param relationId 更新対象のリレーションID
     * @param updating 更新後の線描画モデル
     * @returns 更新後のドキュメント
     */
    public updateRelationLine(relationId: string, updating: LineViewModel): ErdDocument {
        return this.doUpdateRelationStorage(() => this.relationViewModelStorage.updateLineView(relationId, updating));
    }

    /**
     * 指定されたリレーションのラベルを更新する。
     * 
     * @param relationId 更新対象のリレーションID
     * @param updating 更新後のラベルモデル
     * @returns 更新後のドキュメント
     */
    public updateRelationLabel(relationId: string, updating: LabelViewModel): ErdDocument {
        return this.doUpdateRelationStorage(() => this.relationViewModelStorage.updateLabelView(relationId, updating));
    }

    /**
     * 指定されたリレーションの線描画を更新関数により書き換える。
     * リレーションが存在しない、または変更が発生しない場合は自身を返す。
     *
     * @param relationId 更新対象のリレーションID
     * @param updateLine 線描画モデルの更新関数
     * @returns 更新後のドキュメント
     */
    public updateRelationLineBy(
        relationId: string, updateLine: (previous: LineViewModel) => LineViewModel
    ): ErdDocument {
        const previousRelation = this.findRelationViewModel(relationId);
        if (previousRelation == null) {
            return this;
        }

        const previousLineView = previousRelation.lineViewModel;
        const nextLineView = updateLine(previousLineView);
        if (previousLineView.equals(nextLineView)) {
            return this;
        }

        return this.updateRelationLine(relationId, nextLineView);
    }

    /**
     * 指定されたリレーションのラベルを更新関数により書き換える。
     * リレーションが存在しない、または変更が発生しない場合は自身を返す。
     *
     * @param relationId 更新対象のリレーションID
     * @param updateLabel ラベルモデルの更新関数
     * @returns 更新後のドキュメント
     */
    public updateRelationLabelBy(
        relationId: string, updateLabel: (previous: LabelViewModel) => LabelViewModel
    ): ErdDocument {
        const previousRelation = this.findRelationViewModel(relationId);
        if (previousRelation == null) {
            return this;
        }

        const previousLabel = previousRelation.labelViewModel;
        const nextLabel = updateLabel(previousLabel);
        if (nextLabel.equals(previousLabel)) {
            return this;
        }

        return this.updateRelationLabel(relationId, nextLabel);
    }

    /**
     * 選択中の要素 (リレーション・テーブル・メモ) を一括削除する。
     *
     * @param selection 削除対象の選択状態
     * @returns 更新後のドキュメント
     */
    public deleteSelectedElements(
        selection: { relationId: string | null, tableIds: Set<string>, memoIds: Set<string> }
    ): ErdDocument {
        const afterRelation = ((selection.relationId != null) && (selection.relationId !== ""))
            ? this.deleteRelation(selection.relationId) : this;
        const afterTables = Array.from(selection.tableIds)
            .reduce((erdDocument, tableId) => erdDocument.deleteTable(tableId), afterRelation);

        return Array.from(selection.memoIds)
            .reduce((erdDocument, memoId) => erdDocument.deleteMemo(memoId), afterTables);
    }

    /**
     * 指定されたリレーションの線の描画方法を更新する。
     *
     * @param nextOrthogonals 更新後の直交リレーション情報
     * @returns 更新後のドキュメント
     */
    public updateRelationOrthogonal(nextOrthogonals: OrthogonalRelation[]): ErdDocument {
        return this.doUpdateRelationStorage(() =>
            this.relationViewModelStorage.updateRelationOrthogonal(nextOrthogonals));
    }

    private doUpdateRelationStorage(updateFunction: () => RelationViewModelStorage): ErdDocument {
        const nextRelationStorage = updateFunction();
        if (this.relationViewModelStorage === nextRelationStorage) {
            return this;
        }

        return this.doUpdate({ relationViewModelStorage: nextRelationStorage });
    }

    /**
     * 指定されたテーブルの配色を変更する。
     * 
     * @param tableIds 変更対象のテーブルID一覧
     * @param background 背景色
     * @param foreground 前景色
     * @returns 更新後のドキュメント
     */
    public updateTableViewColor(tableIds: string[], background: ColorValue, foreground: ColorValue): ErdDocument {
        if (tableIds.length === 0) {
            return this;
        }

        const doUpdateTableViewColor = (current: TableViewModel) =>
            new TableViewModel({
                ...current,
                headerColor: { background, foreground }
            });

        return this.doUpdateTableRectangle(tableIds, doUpdateTableViewColor);
    }

    /**
     * 指定されたテーブルの位置を移動させたモデルを作成する。
     * 
     * @param tableIds 移動対象のテーブルのID一覧
     * @param moving 移動距離
     * @returns 操作後のモデル
     */
    public moveTableView(
        tableIds: Set<string>, moving: { x: number, y: number }, nextOrthogonals: OrthogonalRelation[]
    ): ErdDocument {
        if (tableIds.size === 0) {
            return this;
        }

        const doMoveTableView = (current: TableViewModel) => new TableViewModel({
            ...current,
            corner: {
                left: current.corner.left + moving.x,
                top: current.corner.top + moving.y
            }
        });

        const nextRelationStorage = this.relationViewModelStorage.moveRelation(tableIds, moving)
            .updateRelationOrthogonal(nextOrthogonals);

        return this.doUpdateTableRectangle([...tableIds], doMoveTableView, nextRelationStorage);
    }

    private doUpdateTableRectangle(
        tableIds: string[],
        updateTableView: (tableViewModel: TableViewModel) => TableViewModel,
        nextRelationViewStorage: RelationViewModelStorage | null = null
    ) {
        if (tableIds.length === 0) {
            return this;
        }

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        tableIds.forEach(tableId => {
            const currentModel = this.tableViewModelMap.get(tableId);
            if (currentModel == null) {
                return;
            }

            nextTableViewModelMap.set(tableId, updateTableView(currentModel));
        });

        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            relationViewModelStorage: (nextRelationViewStorage != null) ? nextRelationViewStorage : this.relationViewModelStorage
        });
    }

    /**
     * メモを追加する。
     * 
     * @param addingMemo 追加対象のメモ
     * @returns 操作後のモデル
     */
    public addMemo(addingMemo: MemoViewModel): ErdDocument {
        return this.doUpdateMemoViewModel(() => this.memoViewModelStorage.addMemo(addingMemo));
    }

    /**
     * メモを更新する。
     * 
     * @param updatingMemo 更新対象のメモ
     * @returns 操作後のモデル
     */
    public updateMemo(updatingMemo: MemoViewModel): ErdDocument {
        return this.doUpdateMemoViewModel(() => this.memoViewModelStorage.updateMemo(updatingMemo));
    }

    /**
     * メモを削除する。
     * 
     * @param memoId 削除対象のメモID
     * @returns 操作後のモデル
     */
    public deleteMemo(memoId: string): ErdDocument {
        return this.doUpdateMemoViewModel(() => this.memoViewModelStorage.deleteMemo(memoId));
    }

    /**
     * メモの配置場所を変更する。
     * 
     * @param memoId メモID
     * @param direction 変更方向
     * @returns 操作後のモデル
     */
    public arrangeMemo(memoId: string, direction: "front" | "back"): ErdDocument {
        return this.doUpdateMemoViewModel(() => this.memoViewModelStorage.arrangeMemo(memoId, direction));
    }

    private doUpdateMemoViewModel(updateFunction: () => MemoViewModelStorage): ErdDocument {
        const nextMemoViewStorage = updateFunction();
        if (nextMemoViewStorage === this.memoViewModelStorage) {
            return this;
        }

        return this.doUpdate({
            memoViewModelStorage: nextMemoViewStorage
        });
    }

    /**
     * 指定されたメモの位置を移動させたモデルを作成する。
     * 
     * @param memoIds 移動対象のメモのID一覧
     * @param moving 移動距離
     * @returns 操作後のモデル
     */
    public moveMemoView(memoIds: Set<string>, moving: { x: number, y: number }): ErdDocument {
        if (memoIds.size === 0) {
            return this;
        }

        const nextMemoViewStorage = this.memoViewModelStorage.moveMemo(memoIds, moving);
        if (nextMemoViewStorage === this.memoViewModelStorage) {
            return this;
        }

        return this.doUpdate({
            memoViewModelStorage: nextMemoViewStorage
        });
    }

    /**
     * ドキュメント名を更新する。
     * 
     * @param updating 更新後のドキュメント名
     * @returns 操作後のモデル
     */
    public updateDocumentName(updating: string): ErdDocument {
        if (this.documentName === updating) {
            return this;
        }

        return this.doUpdate({
            documentName: updating
        });
    }

    /**
     * 設定を更新する。
     * 
     * @param updatingSetting 更新対象の設定
     * @returns 操作後のモデル
     */
    public updateErdSetting(updatingSetting: ErdSettingModel): ErdDocument {
        if (this.erdSettingModel === updatingSetting) {
            return this;
        }

        return this.doUpdate({
            erdSettingModel: updatingSetting
        });
    }

    /**
     * インポートした DDL を反映する。
     * 
     * @param params インポート内容
     * @returns 操作後のモデル
     */
    public importDdl({ tableViewModels, columnModels, columnShareModels, relationViewModels }: ImportDdlArgs) {
        const nextTableViewModelIds = [...this.tableViewModelIds, ...tableViewModels.map(model => model.tableId)];

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        tableViewModels.forEach(model => nextTableViewModelMap.set(model.tableId, model));

        const nextColumnModelMap = new Map(this.columnModelMap);
        columnModels.forEach(model => nextColumnModelMap.set(model.columnModelId, model));

        const nextColumnShareModelStorage = this.columnShareStorage.addColumnShare(...columnShareModels);
        const nextRelationViewModelStorage = new RelationViewModelStorage(
            [...this.relationViewModelStorage.getModels(), ...relationViewModels]
        )

        return this.doUpdate({
            tableViewModelIds: nextTableViewModelIds,
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: nextColumnShareModelStorage,
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    public toJSON(): Record<string, unknown> {
        const database = this.getDatabase();
        const tableViewModels = this.tableViewModelIds
            .map(tableId => this.tableViewModelMap.get(tableId))
            .filter((viewModel): viewModel is TableViewModel => viewModel != null)
            .map(viewModel => viewModel.toJSON());
        const columnGroupModels = Array.from(this.columnGroupModelMap.values())
            .sort((first, second) => first.groupName.localeCompare(second.groupName, "en"))
            .map(model => model.toJSON())
        const structColumnShareModels = this.getStructColumnShareModels().map(model => model.toJSON());
        const columnModels = Array.from(this.columnModelMap.values())
            .sort((first, second) => first.columnModelId.localeCompare(second.columnModelId, "en"))
            .map(model => model.toJSON());
        const { frontMemos, backMemos } = this.memoViewModelStorage.getMemos();

        return {
            documentName: this.documentName,
            lastUpdatedAt: this.lastUpdatedAt,
            ...((database.supportsSchema) && { schemaConfig: this.schemaConfig.toJSON() }),
            tableViewModels: tableViewModels,
            columnGroupModels: columnGroupModels,
            ...((structColumnShareModels.length > 0) && { structColumnShareModels: structColumnShareModels }),
            columnModels: columnModels,
            columnShareModels: this.columnShareStorage.getColumnShareModels().map(model => model.toJSON()),
            relationViewModels: this.relationViewModelStorage.getModels().map(model => model.toJSON()),
            foregroundMemos: frontMemos.map(memo => memo.toJSON()),
            backgroundMemos: backMemos.map(memo => memo.toJSON()),
            erdSettingModel: this.erdSettingModel.toJSON(),
            databaseSetting: this.databaseSettingModel.toJSON(),
        };
    }

    public static toObject(obj: object): ErdDocument {
        requireProperty(obj, "documentName");
        requireProperty(obj, "tableViewModels");
        requireProperty(obj, "columnModels");
        requireProperty(obj, "columnShareModels");
        requireProperty(obj, "relationViewModels");
        requireProperty(obj, "erdSettingModel");
        requireProperty(obj, "databaseSetting");

        const erdSettingModel = ErdSettingModel.toObject(obj.erdSettingModel as object);
        const databaseSettingModel = DatabaseSettingModel.toObject(obj.databaseSetting as object);
        const toColumnType = databaseSettingModel.initToColumnTypeMapping();

        const schemaConfig = ("schemaConfig" in obj)
            ? DbSchemaConfig.toObject(obj.schemaConfig as object)
            : DbSchemaConfig.create();

        const tableViewModels = toObjects(obj.tableViewModels, "tableViewModels",
            value => TableViewModel.toObject(value))
        const columnGroupModels = ("columnGroupModels" in obj)
            ? toObjects(obj.columnGroupModels, "columnGroupModels", value => ColumnGroupModel.toObject(value)) : [];
        const structColumnShareModels = ("structColumnShareModels" in obj)
            ? toObjects(obj.structColumnShareModels, "structColumnShareModels", value => StructColumnShareModel.toObject(value)) : [];
        const columnModels = toObjects(obj.columnModels, "columnModels",
            value => ColumnModel.toObject(value))
        const columnShareModels = toObjects(obj.columnShareModels, "columnShareModels",
            value => ColumnShareModel.toObject(value, toColumnType));
        const relationViewModels = toObjects(obj.relationViewModels, "relationViewModels",
            value => RelationViewModel.toObject(value));
        const foregroundMemos = ("foregroundMemos" in obj)
            ? toObjects(obj.foregroundMemos, "foregroundMemos", value => MemoViewModel.toObject(value)) : [];
        const backgroundMemos = ("backgroundMemos" in obj)
            ? toObjects(obj.backgroundMemos, "backgroundMemos", value => MemoViewModel.toObject(value)) : [];
        const lastUpdatedAt = ("lastUpdatedAt" in obj) ? toDateTime(obj.lastUpdatedAt) : new Date();

        return ErdDocument.create({
            documentName: obj.documentName as string,
            erdSettingModel: erdSettingModel,
            schemaConfig: schemaConfig,
            tableViewModels: tableViewModels,
            columnGroupModels: columnGroupModels,
            structShareModels: structColumnShareModels,
            columnModels: columnModels,
            columnShareModels: columnShareModels,
            relationViewModels: relationViewModels,
            foregroundMemoViewModels: foregroundMemos,
            backgroundMemoViewModels: backgroundMemos,
            databaseSettingModel: databaseSettingModel,
            lastUpdatedAt: lastUpdatedAt
        });
    }

    public equals(other: ErdDocument): boolean {
        if (this === other) {
            return true;
        }

        if (this.documentName !== other.documentName) {
            return false;
        }

        if (this.tableViewModelIds.length !== other.tableViewModelIds.length) {
            return false;
        }
        for (let index = 0; index < this.tableViewModelIds.length; index++) {
            if (this.tableViewModelIds[index] !== other.tableViewModelIds[index]) {
                return false;
            }
        }

        if (this.tableViewModelMap.size !== other.tableViewModelMap.size) {
            return false;
        }
        for (const [tableId, tableViewModel] of this.tableViewModelMap.entries()) {
            const otherTableViewModel = other.tableViewModelMap.get(tableId);
            if ((otherTableViewModel == null) || (tableViewModel.equals(otherTableViewModel) === false)) {
                return false;
            }
        }

        if (this.columnGroupModelMap.size !== other.columnGroupModelMap.size) {
            return false;
        }
        for (const [columnGroupId, columnGroupModel] of this.columnGroupModelMap.entries()) {
            const otherColumnGroupModel = other.columnGroupModelMap.get(columnGroupId);
            if ((otherColumnGroupModel == null) || (columnGroupModel.equals(otherColumnGroupModel) === false)) {
                return false;
            }
        }

        if (this.columnModelMap.size !== other.columnModelMap.size) {
            return false;
        }
        for (const [columnModelId, columnModel] of this.columnModelMap.entries()) {
            const otherColumnModel = other.columnModelMap.get(columnModelId);
            if ((otherColumnModel == null) || (ColumnModel.equals(columnModel, otherColumnModel) === false)) {
                return false;
            }
        }

        if (this.columnShareStorage.equals(other.columnShareStorage) === false) {
            return false;
        }

        if (this.relationViewModelStorage.equals(other.relationViewModelStorage) === false) {
            return false;
        }

        if (this.memoViewModelStorage.equals(other.memoViewModelStorage) === false) {
            return false;
        }

        if (this.erdSettingModel.equals(other.erdSettingModel) === false) {
            return false;
        }

        if (this.databaseSettingModel.equals(other.databaseSettingModel) === false) {
            return false;
        }

        if (this.schemaConfig.equals(other.schemaConfig) === false) {
            return false;
        }

        return true;
    }

    /**
     * 直前世代 (previous) と内容が同じモデルのインスタンスを引き継いだドキュメントを返す。
     * JSON から復元したドキュメント (Google Drive の外部更新取り込み等) は全モデルが別インスタンスになり、
     * ローカル編集のような未変更モデルの参照共有が起きない。
     * そのまま undo 履歴に積むと変更されていない部分まで世代数分の複製が残るため、呼び出し側が任意でこれを通してから履歴へ渡す。
     */
    public reuseInstancesFrom(previous: ErdDocument): ErdDocument {
        const tableViewModelIds = doReuseIds(previous.tableViewModelIds, this.tableViewModelIds);
        const tableViewModelMap = doReuseModelMap(
            previous.tableViewModelMap, this.tableViewModelMap,
            (previousModel, nextModel) => previousModel.equals(nextModel)
        );
        const columnGroupModelMap = doReuseModelMap(
            previous.columnGroupModelMap, this.columnGroupModelMap,
            (previousModel, nextModel) => previousModel.equals(nextModel)
        );
        const columnModelMap = doReuseModelMap(
            previous.columnModelMap, this.columnModelMap,
            (previousModel, nextModel) => ColumnModel.equals(previousModel, nextModel)
        );

        const columnShareStorage = this.columnShareStorage.reuseInstancesFrom(previous.columnShareStorage);
        const relationViewModelStorage =
            this.relationViewModelStorage.reuseInstancesFrom(previous.relationViewModelStorage);
        const memoViewModelStorage = this.memoViewModelStorage.reuseInstancesFrom(previous.memoViewModelStorage);
        const erdSettingModel = (this.erdSettingModel.equals(previous.erdSettingModel) === true)
            ? previous.erdSettingModel : this.erdSettingModel;
        const databaseSettingModel = (this.databaseSettingModel.equals(previous.databaseSettingModel) === true)
            ? previous.databaseSettingModel : this.databaseSettingModel;
        const schemaConfig = (this.schemaConfig.equals(previous.schemaConfig) === true)
            ? previous.schemaConfig : this.schemaConfig;

        // .equals() が比較する全フィールドが previous 側へ再利用された場合、内容は previous と完全に同一である。
        // 呼び出し側 (GoogleDriveFile 等) が === で無変更検知できるよう、その場合は previous 自身を返す。
        const allReused = (this.documentName === previous.documentName)
            && (tableViewModelIds === previous.tableViewModelIds)
            && (tableViewModelMap === previous.tableViewModelMap)
            && (columnGroupModelMap === previous.columnGroupModelMap)
            && (columnModelMap === previous.columnModelMap)
            && (columnShareStorage === previous.columnShareStorage)
            && (relationViewModelStorage === previous.relationViewModelStorage)
            && (memoViewModelStorage === previous.memoViewModelStorage)
            && (erdSettingModel === previous.erdSettingModel)
            && (databaseSettingModel === previous.databaseSettingModel)
            && (schemaConfig === previous.schemaConfig);
        if (allReused === true) {
            return previous;
        }

        return new ErdDocument(
            this.documentName, erdSettingModel, databaseSettingModel, schemaConfig,
            tableViewModelIds, tableViewModelMap, columnGroupModelMap, columnModelMap,
            columnShareStorage, relationViewModelStorage, memoViewModelStorage, this.lastUpdatedAt
        );
    }
}

type ImportDdlArgs = {
    tableViewModels: TableViewModel[],
    columnModels: ColumnModel[],
    columnShareModels: ColumnShareModel[],
    relationViewModels: RelationViewModel[]
};

/**
 * ColumnModelType の配列から、single 参照の columnModelId のみを抽出する。
 *
 * @param columns 抽出対象のカラムエントリ一覧
 * @returns single 参照の columnModelId 一覧
 */
const toSingleColumnIds = (columns: readonly ColumnEntry[]): string[] => {
    return columns.flatMap(column => (column.modelType === "single") ? [column.columnModelId] : []);
};

/**
 * previous と next の要素数・並び順が同じであれば previous の配列参照を再利用する。
 * テーブル追加/削除/並び替えがあった場合のみ next をそのまま返す。
 */
const doReuseIds = (
    previousIds: readonly string[], nextIds: readonly string[]
): readonly string[] => {
    if (previousIds.length !== nextIds.length) {
        return nextIds;
    }

    const sameOrder = nextIds.every((tableId, index) => previousIds[index] === tableId);
    return sameOrder ? previousIds : nextIds;
};

/**
 * next の各エントリについて、同じキーの previous エントリと isSameModel が真であれば
 * previous 側のインスタンスへ差し替える。キーが一致しないエントリは next のまま返す。
 * 全エントリが previous 側へ差し替わった場合は previous のマップ参照をそのまま返す。
 */
const doReuseModelMap = <MODEL>(
    previousModels: Map<string, MODEL>, nextModels: Map<string, MODEL>,
    isSameModel: (previousModel: MODEL, nextModel: MODEL) => boolean
): Map<string, MODEL> => {
    let allReused = (previousModels.size === nextModels.size);

    const entries = Array.from(nextModels.entries()).map(([modelId, nextModel]): [string, MODEL] => {
        const previousModel = previousModels.get(modelId);
        if ((previousModel != null) && isSameModel(previousModel, nextModel)) {
            return [modelId, previousModel];
        }

        allReused = false;
        return [modelId, nextModel];
    });

    return allReused ? previousModels : new Map(entries);
};

/**
 * このカーディナリティが「子は必ず1件存在する」ことを表すか(子カラムのNOT NULL可否の判定に使う)。
 */
const isMandatoryCardinality = (cardinality: CardinalityType): boolean => {
    return (cardinality === "1") || (cardinality === "1..N");
};
