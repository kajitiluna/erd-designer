import { v4 as uuidV4 } from 'uuid';
import ColorValue from '~/models/ColorValue';
import ColumnShareModelStorage from '~/models/ColumnShareModelStorage';
import { Database, databases } from '~/models/database';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import DisplayStyle from '~/models/database/DisplayStyle';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import TableModel from '~/models/database/TableModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import ErdSettingModel from '~/models/ErdSettingModel';
import { PropertyNotExistsError } from '~/models/exceptions';
import LineViewModel from '~/models/LineViewModel';
import MemoViewModel from '~/models/MemoViewModel';
import MemoViewModelStorage from '~/models/MemoViewModelStorage';
import RelationViewModel from '~/models/RelationViewModel';
import RelationViewModelStorage from '~/models/RelationViewModelStorage';
import TableViewModel from '~/models/TableViewModel';
import { toDateTime, toObjects } from '~/models/util';

type ErdDocumentOptions = {
    documentName: string,
    erdSettingModel: ErdSettingModel,
    tableViewModels?: readonly TableViewModel[],
    columnModels?: readonly ColumnModel[],
    columnShareModels?: readonly ColumnShareModel[],
    relationViewModels?: readonly RelationViewModel[],
    foregroundMemoViewModels?: MemoViewModel[],
    backgroundMemoViewModels?: MemoViewModel[],
    databaseSettingModel: DatabaseSettingModel,
    lastUpdatedAt?: Date | null
};

export default class ErdDocument {

    public readonly documentName: string;
    public readonly erdSettingModel: ErdSettingModel;
    private readonly columnShareModelStorage: ColumnShareModelStorage;
    private readonly tableViewModelIds: readonly string[];
    private readonly tableViewModelMap: Map<string, TableViewModel>;
    private readonly columnModelMap: Map<string, ColumnModel>;
    private readonly relationViewModelStorage: RelationViewModelStorage;
    private readonly memoViewModelStorage: MemoViewModelStorage;
    public readonly databaseSettingModel: DatabaseSettingModel;
    public readonly lastUpdatedAt: Date;

    private constructor(
        documentName: string, erdSettingModel: ErdSettingModel,
        tableViewModelIds: readonly string[], tableViewModelMap: Map<string, TableViewModel>,
        columnModelMap: Map<string, ColumnModel>, columnShareModelStorage: ColumnShareModelStorage,
        relationViewModelStorage: RelationViewModelStorage, memoViewModelStorage: MemoViewModelStorage,
        databaseSettingModel: DatabaseSettingModel, lastUpdatedAt: Date | null = null
    ) {
        this.documentName = documentName;
        this.erdSettingModel = erdSettingModel;
        this.columnShareModelStorage = columnShareModelStorage;
        this.tableViewModelIds = tableViewModelIds;
        this.tableViewModelMap = tableViewModelMap;
        this.columnModelMap = columnModelMap;
        this.relationViewModelStorage = relationViewModelStorage;
        this.memoViewModelStorage = memoViewModelStorage;
        this.databaseSettingModel = databaseSettingModel;
        this.lastUpdatedAt = lastUpdatedAt ? lastUpdatedAt : new Date();
    }

    public static create({
        documentName, erdSettingModel, databaseSettingModel,
        tableViewModels = [], columnModels = [], columnShareModels = [],
        relationViewModels = [], foregroundMemoViewModels = [], backgroundMemoViewModels = [],
        lastUpdatedAt = null
    }: ErdDocumentOptions): ErdDocument {

        return new ErdDocument(
            documentName, erdSettingModel,
            tableViewModels.map(viewModel => viewModel.tableId),
            new Map(tableViewModels.map(viewModel => [viewModel.tableId, viewModel])),
            new Map(columnModels.map((model) => [model.columnModelId, model])),
            ColumnShareModelStorage.create(columnShareModels),
            new RelationViewModelStorage(relationViewModels),
            MemoViewModelStorage.create(foregroundMemoViewModels, backgroundMemoViewModels),
            databaseSettingModel,
            lastUpdatedAt
        );
    }

    public getDatabase(): Database {
        return databases[this.databaseSettingModel.databaseType];
    }

    public getDisplayStyle(): DisplayStyle {
        return this.erdSettingModel.displayStyle;
    }

    public findTableViewModel(tableId: string): TableViewModel | null {
        const tableViewModel = this.tableViewModelMap.get(tableId);
        return tableViewModel ? tableViewModel : null;
    }

    public getTableViewModels(): TableViewModel[] {
        return this.tableViewModelIds
            .map(tableId => this.tableViewModelMap.get(tableId) as TableViewModel)
    }

    public findColumnModel(columnModelId: string): ColumnModel | null {
        const columnModel = this.columnModelMap.get(columnModelId);
        return columnModel ? columnModel : null;
    }

    public findColumnShareModel(columnShareModelId: string): ColumnShareModel | null {
        return this.columnShareModelStorage.find(columnShareModelId);
    }

    public getColumnShareModelStorage(): ColumnShareModelStorage {
        return this.columnShareModelStorage.copy();
    }

    public findRelationViewModel(relationId: string): RelationViewModel | null {
        return this.relationViewModelStorage.findByRelationId(relationId);
    }

    public getRelationViewModels(): RelationViewModel[] {
        return this.relationViewModelStorage.getModels();
    }

    public inChildRelation(columnModelId: string): boolean {
        return this.relationViewModelStorage.inChildRelation(columnModelId);
    }

    public findParentRelation(childColumnModelId: string) {
        return this.relationViewModelStorage.findParentRelation(childColumnModelId);
    }

    public getMemoViewModels() {
        return this.memoViewModelStorage.getMemos();
    }

    /**
     * 指定されたテーブルおよびカラム共有モデルを反映する。
     * 
     * @param updatingTableViewModel 更新後のテーブルモデル
     * @param updatingColumnModels 更新後のカラムモデル
     * @param updatingColumnShareModelStorage 更新後のカラム共有モデル
     * @returns 操作後のモデル
     */
    public updateTableViewModel(
        updatingTableViewModel: TableViewModel, updatingColumnModels: ColumnModel[],
        updatingColumnShareModelStorage: ColumnShareModelStorage
    ): ErdDocument {

        const previousTableViewModel = this.tableViewModelMap.get(updatingTableViewModel.tableId);
        if (previousTableViewModel == null) {
            return this.doAddTableViewModel(
                updatingTableViewModel, updatingColumnModels, updatingColumnShareModelStorage);
        }

        // 更新対象のテーブルに relation が親として定義されている場合、子テーブルに PK の変更を反映する
        const {
            tableViewModels: nextTableViewModels,
            columnModels: nextColumnModels,
            relationRepository: nextRelationViewModelRepository
        } = this.doUpdateTableViewModelWithRelation(
            previousTableViewModel, updatingTableViewModel, updatingColumnModels
        );

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        nextTableViewModels.forEach(nextTableViewModel => {
            nextTableViewModelMap.set(nextTableViewModel.tableId, nextTableViewModel);
        });

        const nextColumnModelMap = new Map(this.columnModelMap);
        previousTableViewModel.tableModel.columnModelIds.forEach(
            columnModelId => nextColumnModelMap.delete(columnModelId)
        );
        nextColumnModels.forEach(columnModel =>
            nextColumnModelMap.set(columnModel.columnModelId, columnModel)
        );

        // 更新時に削除したカラムに紐づく columnShareModel が他で利用されていない場合は columnShareModel も削除する
        const nextExistsColumnShareModelIds = new Set(
            Array.from(nextColumnModelMap.values())
                .map(columnModel => columnModel.columnShareModelId)
        );
        const deletingColumnShareModelIds = previousTableViewModel.tableModel.columnModelIds
            .filter(columnModelId => nextColumnModelMap.has(columnModelId) === false)
            .map(columnModelId => this.findColumnModel(columnModelId) as ColumnModel)
            .filter(columnModel => nextExistsColumnShareModelIds.has(columnModel.columnShareModelId) === false)
            .map(columnModel => columnModel.columnShareModelId);

        const nextColumnShareModelStorage = updatingColumnShareModelStorage.copy();
        if (deletingColumnShareModelIds.length > 0) {
            nextColumnShareModelStorage.deleteModels(deletingColumnShareModelIds);
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            nextTableViewModelMap,
            nextColumnModelMap,
            nextColumnShareModelStorage,
            nextRelationViewModelRepository,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    private doAddTableViewModel(
        addingTableViewModel: TableViewModel, addingColumnModels: ColumnModel[],
        columnShareModelStorage: ColumnShareModelStorage
    ): ErdDocument {
        const nextTableViewModelIds = [...this.tableViewModelIds, addingTableViewModel.tableId];

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        nextTableViewModelMap.set(addingTableViewModel.tableId, addingTableViewModel);

        const nextColumnModelMap = new Map(this.columnModelMap);
        addingColumnModels.forEach((columnModel) =>
            nextColumnModelMap.set(columnModel.columnModelId, columnModel)
        );

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            nextTableViewModelIds,
            nextTableViewModelMap,
            nextColumnModelMap,
            columnShareModelStorage.copy(),
            this.relationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    private doUpdateTableViewModelWithRelation(
        previousTableViewModel: TableViewModel,
        updatingTableViewModel: TableViewModel,
        updatingColumnModels: ColumnModel[]
    ) {
        const relationViewModels = this.relationViewModelStorage
            .getRelationsByParent(updatingTableViewModel.tableId);
        // relation が定義されていない場合は何もしない
        if (relationViewModels.length === 0) {
            return {
                tableViewModels: [updatingTableViewModel],
                columnModels: updatingColumnModels,
                relationRepository: this.relationViewModelStorage
            };
        }

        const updatingColumnModelMap =
            new Map(updatingColumnModels.map(model => [model.columnModelId, model]));
        const updatingPrimaryKeys = updatingTableViewModel.tableModel.columnModelIds
            .map(columnModelId => updatingColumnModelMap.get(columnModelId) as ColumnModel)
            .filter(columnModel => columnModel.primaryKey === true)

        const deletingPrimaryKeyIdSet = new Set(
            previousTableViewModel.tableModel.columnModelIds
                .map(columnModelId => this.findColumnModel(columnModelId) as ColumnModel)
                .filter(previousColumnModel => (previousColumnModel.primaryKey === true)
                    && (updatingPrimaryKeys.some(updatingKey =>
                        updatingKey.columnModelId === previousColumnModel.columnModelId) === false
                    ))
                .map(columnModel => columnModel.columnModelId)
        );

        const previousPrimaryKeySet = new Set(
            previousTableViewModel.tableModel.columnModelIds
                .map(columnModelId => this.findColumnModel(columnModelId) as ColumnModel)
                .filter(columnModel => columnModel.primaryKey === true)
                .map(columnModel => columnModel.columnModelId)
        );
        const addingPrimaryKeys = updatingPrimaryKeys
            .filter(updatingColumn => previousPrimaryKeySet.has(updatingColumn.columnModelId) === false);

        // PKに差分がない場合は relation に変更ないので、何もしない
        if ((deletingPrimaryKeyIdSet.size === 0) && (addingPrimaryKeys.length === 0)) {
            return {
                tableViewModels: [updatingTableViewModel],
                columnModels: updatingColumnModels,
                relationRepository: this.relationViewModelStorage
            };
        }

        return relationViewModels.reduce((updating, previousViewModel) => {
            const previousRelationModel = previousViewModel.relationModel;
            const nextRelationPairs = previousRelationModel.relationPairs
                .filter(pair => deletingPrimaryKeyIdSet.has(pair.parentColumnModelId) === false);

            const updatingColumnModels = [...updating.columnModels];
            const addingChildColumnIds = addingPrimaryKeys.map(addingParentColumn => {
                const addingChildColumnModel = new ColumnModel({
                    columnModelId: uuidV4(),
                    columnShareModelId: addingParentColumn.columnShareModelId,
                    notNull: true
                });

                updatingColumnModels.push(addingChildColumnModel);
                nextRelationPairs.push(new RelationPair({
                    parentColumnModelId: addingParentColumn.columnModelId,
                    childColumnModelId: addingChildColumnModel.columnModelId
                }));

                return addingChildColumnModel.columnModelId;
            });

            // PKが全て解除された場合は relation を削除する
            if (nextRelationPairs.length === 0) {
                return {
                    tableViewModels: updating.tableViewModels,
                    columnModels: updating.columnModels,
                    relationRepository: updating.relationRepository
                        .deleteRelation(previousViewModel.relationId)
                };
            }

            // TODO 子テーブルに新規に外部キーを追加する際に、それが子テーブルの PK になるか否かの判断および処理

            const updatingRelationModel = new RelationModel({
                ...previousRelationModel,
                relationPairs: nextRelationPairs
            });
            const nextRelationRepository = updating.relationRepository.updateRelationModel(updatingRelationModel);

            if (addingChildColumnIds.length === 0) {
                return {
                    tableViewModels: updating.tableViewModels,
                    columnModels: updatingColumnModels,
                    relationRepository: nextRelationRepository
                };
            }

            const previousChildTableViewModel = this.tableViewModelMap
                .get(previousRelationModel.childTableModelId) as TableViewModel;
            const previousTableModel = previousChildTableViewModel.tableModel;
            const updatingChildTableViewModel = new TableViewModel({
                ...previousChildTableViewModel,
                tableModel: new TableModel({
                    tableModelId: previousTableModel.tableModelId,
                    physicalName: previousTableModel.physicalName,
                    logicalName: previousTableModel.logicalName,
                    columnModelIds: [...previousTableModel.columnModelIds, ...addingChildColumnIds],
                    tableIndexModels: [...previousTableModel.tableIndexModels],
                    description: previousTableModel.description
                })
            });

            return {
                tableViewModels: [...updating.tableViewModels, updatingChildTableViewModel],
                columnModels: updatingColumnModels,
                relationRepository: nextRelationRepository
            };
        }, {
            tableViewModels: [updatingTableViewModel],
            columnModels: [...updatingColumnModels],
            relationRepository: this.relationViewModelStorage
        });
    }

    /**
     * 指定されたIDのテーブルを削除したモデルを作成する。
     * 
     * @param deletingTableId 削除対象のテーブルID
     * @returns 操作後のモデル。
     */
    public deleteTable(deletingTableId: string): ErdDocument {
        const deletingTarget = this.tableViewModelMap.get(deletingTableId);
        if (deletingTarget == null) {
            return this;
        }

        const nextTableViewModelIds = this.tableViewModelIds.filter(tableId => (tableId !== deletingTableId));
        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        nextTableViewModelMap.delete(deletingTableId);

        const nextColumnMap = new Map(this.columnModelMap);
        (deletingTarget as TableViewModel).tableModel.columnModelIds.forEach(
            columnModelId => nextColumnMap.delete(columnModelId)
        );

        const existedColumnShareModelIds = new Set(
            Array.from(nextColumnMap.values()).map(
                columnModel => columnModel.columnShareModelId
            )
        );
        const currentColumnShareModels = this.columnShareModelStorage.getModels();
        const updatingColumnShareModels = currentColumnShareModels.filter(
            shareModel => existedColumnShareModelIds.has(shareModel.columnShareModelId)
        );

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            nextTableViewModelIds,
            nextTableViewModelMap,
            nextColumnMap,
            ColumnShareModelStorage.create(updatingColumnShareModels),
            this.relationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    public updateRelationModel(updatingModel: RelationModel): ErdDocument {
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

        const isNotNullOption = ["1", "1..N"].includes(updatingModel.childCardinality)
        const nextAddingColumnModels = detailPairs
            .filter(pair => pair.childColumnModel == null)
            .map(pair => {
                const parentColumnModel = this.findColumnModel(pair.parentColumnModelId) as ColumnModel;
                return new ColumnModel({
                    columnModelId: pair.childColumnModelId,
                    columnShareModelId: parentColumnModel.columnShareModelId,
                    notNull: isNotNullOption
                });
            });

        const nextUpdatingColumnModels = detailPairs
            .filter((pair): pair is {
                parentColumnModelId: string,
                childColumnModelId: string,
                childColumnModel: ColumnModel
            } => (pair.childColumnModel != null) && (pair.childColumnModel.notNull === false))
            .map(pair => new ColumnModel({ ...pair.childColumnModel, notNull: isNotNullOption }));

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
        if ((nextAddingColumnModels.length > 0) || (nextUpdatingColumnModels.length > 0)) {
            nextColumnModelMap = new Map(this.columnModelMap);
            nextAddingColumnModels.forEach(model => nextColumnModelMap.set(model.columnModelId, model));
            nextUpdatingColumnModels.forEach(model => nextColumnModelMap.set(model.columnModelId, model));
        } else {
            nextColumnModelMap = this.columnModelMap;
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            nextTableViewModelMap,
            nextColumnModelMap,
            this.columnShareModelStorage,
            this.relationViewModelStorage.updateRelationModel(updatingModel),
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    public deleteRelation(relationId: string): ErdDocument {
        const next = this.relationViewModelStorage.deleteRelation(relationId);
        if (next === this.relationViewModelStorage) {
            return this;
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            next,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    public updateRelationLineModel(relationId: string, updatingModel: LineViewModel): ErdDocument {
        const nextRelationStorage = this.relationViewModelStorage.updateLineViewModel(relationId, updatingModel);
        if (this.relationViewModelStorage === nextRelationStorage) {
            return this;
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            nextRelationStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
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
    public moveTableView(tableIds: Set<string>, moving: { x: number, y: number }): ErdDocument {
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

        const nextRelationViewStorage = this.relationViewModelStorage.moveRelation(tableIds, moving);

        return this.doUpdateTableRectangle([...tableIds], doMoveTableView, nextRelationViewStorage);
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

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            nextTableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            (nextRelationViewStorage != null) ? nextRelationViewStorage : this.relationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
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

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            this.relationViewModelStorage,
            nextMemoViewStorage,
            this.databaseSettingModel
        );
    }

    /**
     * 指定されたメモの位置を移動させたモデルを作成する。
     * 
     * @param memoIds 移動対象のメモのID一覧
     * @param moving 移動距離
     * @returns 操作後のモデル
     */
    public moveMemoView(memoIds: string[], moving: { x: number, y: number }): ErdDocument {
        if (memoIds.length === 0) {
            return this;
        }

        const nextMemoViewStorage = this.memoViewModelStorage.moveMemo(memoIds, moving);
        if (nextMemoViewStorage === this.memoViewModelStorage) {
            return this;
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            this.relationViewModelStorage,
            nextMemoViewStorage,
            this.databaseSettingModel
        );
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

        return new ErdDocument(
            updating,
            this.erdSettingModel,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            this.relationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
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

        return new ErdDocument(
            this.documentName,
            updatingSetting,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnModelMap,
            this.columnShareModelStorage,
            this.relationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    public toJSON(): Record<string, unknown> {
        const tableViewModels = this.tableViewModelIds
            .map(tableId => this.tableViewModelMap.get(tableId))
            .filter((viewModel): viewModel is TableViewModel => viewModel != null)
            .map(viewModel => viewModel.toJSON());

        const { frontMemos, backMemos } = this.memoViewModelStorage.getMemos();

        return {
            documentName: this.documentName,
            lastUpdatedAt: this.lastUpdatedAt,
            tableViewModels: tableViewModels,
            columnModels: Array.from(this.columnModelMap.values()).map(model => model.toJSON()),
            columnShareModels: this.columnShareModelStorage.getModels().map(model => model.toJSON()),
            relationViewModels: this.relationViewModelStorage.getModels().map(model => model.toJSON()),
            foregroundMemos: frontMemos.map(memo => memo.toJSON()),
            backgroundMemos: backMemos.map(memo => memo.toJSON()),
            erdSettingModel: this.erdSettingModel.toJSON(),
            databaseSetting: this.databaseSettingModel.toJSON(),
        };
    }

    public static toObject(obj: object): ErdDocument {
        if (!("documentName" in obj)) {
            throw new PropertyNotExistsError("documentName", obj);
        }
        if (!("tableViewModels" in obj)) {
            throw new PropertyNotExistsError("tableViewModels", obj);
        }
        if (!("columnModels" in obj)) {
            throw new PropertyNotExistsError("columnModels", obj);
        }
        if (!("columnShareModels" in obj)) {
            throw new PropertyNotExistsError("columnShareModels", obj);
        }
        if (!("relationViewModels" in obj)) {
            throw new PropertyNotExistsError("relationViewModels", obj);
        }
        if (!("erdSettingModel" in obj)) {
            throw new PropertyNotExistsError("erdSettingModel", obj);
        }
        if (!("databaseSetting" in obj)) {
            throw new PropertyNotExistsError("databaseSetting", obj);
        }

        const erdSettingModel = ErdSettingModel.toObject(obj.erdSettingModel as object);
        const databaseSettingModel = DatabaseSettingModel.toObject(obj.databaseSetting as object);
        const toColumnType = databaseSettingModel.initToColumnTypeMapping();

        const tableViewModels = toObjects(obj.tableViewModels, "tableViewModels",
            (value) => TableViewModel.toObject(value))
        const columnModels = toObjects(obj.columnModels, "columnModels",
            (value) => ColumnModel.toObject(value))
        const columnShareModels = toObjects(obj.columnShareModels, "columnShareModels",
            (value) => ColumnShareModel.toObject(value, toColumnType));
        const relationViewModels = toObjects(obj.relationViewModels, "relationViewModels",
            (value) => RelationViewModel.toObject(value));
        const foregroundMemos = ("foregroundMemos" in obj)
            ? (toObjects(obj.foregroundMemos, "foregroundMemos", value => MemoViewModel.toObject(value))) : [];
        const backgroundMemos = ("backgroundMemos" in obj)
            ? (toObjects(obj.backgroundMemos, "backgroundMemos", value => MemoViewModel.toObject(value))) : [];
        const lastUpdatedAt = ("lastUpdatedAt" in obj) ? toDateTime(obj.lastUpdatedAt) : new Date();

        return ErdDocument.create({
            documentName: obj.documentName as string,
            erdSettingModel: erdSettingModel,
            tableViewModels: tableViewModels,
            columnModels: columnModels,
            columnShareModels: columnShareModels,
            relationViewModels: relationViewModels,
            foregroundMemoViewModels: foregroundMemos,
            backgroundMemoViewModels: backgroundMemos,
            databaseSettingModel: databaseSettingModel,
            lastUpdatedAt: lastUpdatedAt
        });
    }
}