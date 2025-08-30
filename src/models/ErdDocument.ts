import { v4 as uuidV4 } from 'uuid';

import ColorValue from '~/models/ColorValue';
import ColumnShareModelStorage from '~/models/ColumnShareModelStorage';
import { Database } from '~/models/database';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import DisplayStyle from '~/models/database/DisplayStyle';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import DbSchemaConfig from '~/models/DbSchemaConfig';
import ErdSettingModel from '~/models/ErdSettingModel';
import { PropertyNotExistsError } from '~/models/exceptions';
import LineViewModel, { OrthogonalDirection } from '~/models/LineViewModel';
import MemoViewModel from '~/models/MemoViewModel';
import MemoViewModelStorage from '~/models/MemoViewModelStorage';
import RelationViewModel from '~/models/RelationViewModel';
import RelationViewModelStorage from '~/models/RelationViewModelStorage';
import TableViewModel from '~/models/TableViewModel';
import { toDateTime, toObjects } from '~/models/util';

type ErdDocumentOptions = {
    documentName: string,
    erdSettingModel: ErdSettingModel,
    databaseSettingModel: DatabaseSettingModel,
    schemaConfig: DbSchemaConfig,
    tableViewModels?: readonly TableViewModel[],
    columnGroupModels?: readonly ColumnGroupModel[],
    columnModels?: readonly ColumnModel[],
    columnShareModels?: readonly ColumnShareModel[],
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
    private readonly columnShareModelStorage: ColumnShareModelStorage;
    private readonly tableViewModelIds: readonly string[];
    private readonly tableViewModelMap: Map<string, TableViewModel>;
    private readonly columnGroupModelMap: Map<string, ColumnGroupModel>;
    private readonly columnModelMap: Map<string, ColumnModel>;
    private readonly relationViewModelStorage: RelationViewModelStorage;
    private readonly memoViewModelStorage: MemoViewModelStorage;
    public readonly lastUpdatedAt: Date;

    private constructor(
        documentName: string, erdSettingModel: ErdSettingModel,
        databaseSettingModel: DatabaseSettingModel, schemaConfig: DbSchemaConfig,
        tableViewModelIds: readonly string[], tableViewModelMap: Map<string, TableViewModel>,
        columnGroupModelMap: Map<string, ColumnGroupModel>,
        columnModelMap: Map<string, ColumnModel>, columnShareModelStorage: ColumnShareModelStorage,
        relationViewModelStorage: RelationViewModelStorage,
        memoViewModelStorage: MemoViewModelStorage, lastUpdatedAt: Date | null = null
    ) {
        this.documentName = documentName;
        this.erdSettingModel = erdSettingModel;
        this.databaseSettingModel = databaseSettingModel;
        this.schemaConfig = schemaConfig;
        this.columnShareModelStorage = columnShareModelStorage;
        this.tableViewModelIds = tableViewModelIds;
        this.tableViewModelMap = tableViewModelMap;
        this.columnGroupModelMap = columnGroupModelMap;
        this.columnModelMap = columnModelMap;
        this.relationViewModelStorage = relationViewModelStorage;
        this.memoViewModelStorage = memoViewModelStorage;
        this.lastUpdatedAt = lastUpdatedAt ? lastUpdatedAt : new Date();
    }

    public static create({
        documentName, erdSettingModel, databaseSettingModel, schemaConfig,
        tableViewModels = [], columnGroupModels = [], columnModels = [], columnShareModels = [],
        relationViewModels = [], foregroundMemoViewModels = [], backgroundMemoViewModels = [],
        lastUpdatedAt = null
    }: ErdDocumentOptions): ErdDocument {

        return new ErdDocument(
            documentName, erdSettingModel, databaseSettingModel, schemaConfig,
            tableViewModels.map(viewModel => viewModel.tableId),
            new Map(tableViewModels.map(viewModel => [viewModel.tableId, viewModel])),
            new Map(columnGroupModels.map(groupModel => [groupModel.columnGroupId, groupModel])),
            new Map(columnModels.map(columnModel => [columnModel.columnModelId, columnModel])),
            ColumnShareModelStorage.create(columnShareModels),
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
        return new ErdDocument(
            overrides.documentName ?? this.documentName,
            overrides.erdSettingModel ?? this.erdSettingModel,
            overrides.databaseSettingModel ?? this.databaseSettingModel,
            overrides.schemaConfig ?? this.schemaConfig,
            overrides.tableViewModelIds ?? this.tableViewModelIds,
            overrides.tableViewModelMap ?? this.tableViewModelMap,
            overrides.columnGroupModelMap ?? this.columnGroupModelMap,
            overrides.columnModelMap ?? this.columnModelMap,
            overrides.columnShareModelStorage ?? this.columnShareModelStorage,
            overrides.relationViewModelStorage ?? this.relationViewModelStorage,
            overrides.memoViewModelStorage ?? this.memoViewModelStorage,
            overrides.lastUpdatedAt ?? null
        );
    }

    public getDatabase(): Database {
        return this.databaseSettingModel.getDatabase();
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

    public findColumnGroupModel(columnGroupId: string): ColumnGroupModel | null {
        const columnGroupModel = this.columnGroupModelMap.get(columnGroupId);
        return columnGroupModel ? columnGroupModel : null;
    }

    public getColumnGroupModels(): ColumnGroupModel[] {
        const models = Array.from(this.columnGroupModelMap.values());

        return models.sort((firsts, seconde) => {
            const nameCompared = firsts.groupName.localeCompare(seconde.groupName, "en");
            if (nameCompared !== 0) {
                return nameCompared;
            }

            return firsts.columnGroupId.localeCompare(seconde.columnGroupId, "en");
        });
    }

    public findColumnModel(columnModelId: string): ColumnModel | null {
        const columnModel = this.columnModelMap.get(columnModelId);
        return columnModel ? columnModel : null;
    }

    public toAllColumnModels(tableModel: TableModel): ColumnModel[] {
        return tableModel.columns
            .flatMap(column => {
                if (column.modelType === "single") {
                    return [column.columnModelId];
                }

                const columnGroupModel = this.findColumnGroupModel(column.columnGroupId);
                if (columnGroupModel == null) {
                    return [];
                }

                return columnGroupModel.columnModelIds;
            })
            .map(columnModelId => this.findColumnModel(columnModelId))
            .filter(columnModel => columnModel != null);
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

    public fetchRelationsByTableIds(tableIds: string[]): RelationViewModel[] {
        if (tableIds.length === 0) {
            return [];
        }

        return this.relationViewModelStorage.fetchRelationsByTableIds(tableIds);
    }

    public getRelationViewModels(): RelationViewModel[] {
        return this.relationViewModelStorage.getModels();
    }

    public inChildRelation(tableModelId: string, columnModelId: string): boolean {
        return this.relationViewModelStorage.inChildRelation(tableModelId, columnModelId);
    }

    public findParentRelation(childTableModelId: string, childColumnModelId: string) {
        return this.relationViewModelStorage.findParentRelation(childTableModelId, childColumnModelId);
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
                updatingTableViewModel, updatingColumnModels, updatingColumnShareModelStorage
            );
        }

        // 更新対象のテーブルに relation が親として定義されている場合、子テーブルに PK の変更を反映する
        const {
            nextTableViewModels,
            nextColumnModelMap: updatingColumnModelMap,
            nextRelationViewModelStorage
        } = this.doUpdateTableViewModelWithRelation(
            previousTableViewModel, updatingTableViewModel, updatingColumnModels
        );

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        nextTableViewModels.forEach(nextTableViewModel => {
            nextTableViewModelMap.set(nextTableViewModel.tableId, nextTableViewModel);
        });

        const nextColumnModelMap = new Map(this.columnModelMap);
        previousTableViewModel.tableModel.columns.forEach(column => {
            if (column.modelType === "single") {
                nextColumnModelMap.delete(column.columnModelId);
            }
        });
        updatingColumnModelMap.forEach(columnModel =>
            nextColumnModelMap.set(columnModel.columnModelId, columnModel)
        );

        // 更新時に他で利用されていない columnShareModel を削除する
        const nextExistsColumnShareModelIds = new Set(
            Array.from(nextColumnModelMap.values())
                .map(columnModel => columnModel.columnShareModelId)
        );
        const deletingColumnShareModelIds = previousTableViewModel.tableModel.columns
            .flatMap(column => {
                if (column.modelType === "single") {
                    return [column.columnModelId];
                }

                const columnGroupModel = this.columnGroupModelMap.get(column.columnGroupId) as ColumnGroupModel;
                return columnGroupModel.columnModelIds;
            }).map(columnModelId => this.findColumnModel(columnModelId) as ColumnModel)
            .filter(columnModel => nextExistsColumnShareModelIds.has(columnModel.columnShareModelId) === false)
            .map(columnModel => columnModel.columnShareModelId);

        const nextColumnShareModelStorage = (deletingColumnShareModelIds.length > 0)
            ? updatingColumnShareModelStorage.deleteModels(deletingColumnShareModelIds)
            : updatingColumnShareModelStorage.copy();

        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: nextColumnShareModelStorage,
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    private doAddTableViewModel(
        addingTableViewModel: TableViewModel, addingColumnModels: ColumnModel[],
        columnShareModelStorage: ColumnShareModelStorage
    ): ErdDocument {
        const nextTableViewModelIds = [...this.tableViewModelIds, addingTableViewModel.tableId];

        const nextTableViewModelMap = new Map(this.tableViewModelMap);
        nextTableViewModelMap.set(addingTableViewModel.tableId, addingTableViewModel);

        const nextColumnModelMap = new Map(this.columnModelMap);
        addingColumnModels.forEach(columnModel =>
            nextColumnModelMap.set(columnModel.columnModelId, columnModel)
        );

        return this.doUpdate({
            tableViewModelIds: nextTableViewModelIds,
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: columnShareModelStorage.copy()
        });
    }

    private doUpdateTableViewModelWithRelation(
        previousTableViewModel: TableViewModel,
        updatingTableViewModel: TableViewModel,
        updatingColumnModels: ColumnModel[]
    ) {
        const nextColumnModelMap = new Map(updatingColumnModels
            .map(model => [model.columnModelId, model]));

        const relationViewModels = this.relationViewModelStorage
            .fetchRelationsByParent(updatingTableViewModel.tableId);

        // relation が定義されていない場合は何もしない
        if (relationViewModels.length === 0) {
            return {
                nextTableViewModels: [updatingTableViewModel],
                nextColumnModelMap: nextColumnModelMap,
                nextRelationViewModelStorage: this.relationViewModelStorage
            };
        }

        const updatingPrimaryKeys = updatingTableViewModel.tableModel.columns
            .flatMap(column => {
                if (column.modelType === "single") {
                    return [nextColumnModelMap.get(column.columnModelId) as ColumnModel]
                }

                // GroupColumn は参照のみなので、変更前の ErdDocument から取得する
                const columnGroupModel = this.columnGroupModelMap.get(column.columnGroupId);
                if (columnGroupModel == null) {
                    return [];
                }

                return columnGroupModel.columnModelIds
                    .map(columnModelId => this.findColumnModel(columnModelId) as ColumnModel);
            })
            .filter(columnModel => columnModel.primaryKey === true)

        const previousColumnModels = this.toAllColumnModels(previousTableViewModel.tableModel);

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
                nextTableViewModels: [updatingTableViewModel],
                nextColumnModelMap: nextColumnModelMap,
                nextRelationViewModelStorage: this.relationViewModelStorage
            };
        }

        const nextTableViewModels = new Map([[updatingTableViewModel.tableId, updatingTableViewModel]]);

        return this.doUpdateRelationWithPrimaryKeyChanged(
            relationViewModels, nextTableViewModels, nextColumnModelMap,
            addingPrimaryKeys, deletingPrimaryKeyIds
        );
    }

    private doUpdateRelationWithPrimaryKeyChanged(
        relationViewModels: RelationViewModel[],
        tableViewModels: Map<string, TableViewModel>,
        updatingColumnModelMap: Map<string, ColumnModel>,
        addingPrimaryKeys: ColumnModel[],
        deletingPrimaryKeyIds: string[],
        updatingColumnGroupModel: ColumnGroupModel | null = null
    ) {
        const nextTableViewModels = new Map(tableViewModels);
        const nextColumnModelMap = new Map(updatingColumnModelMap);
        const updatingRelationModels = new Map<string, RelationModel>();
        const deletingRelationIds = new Set<string>();

        // PK に指定したカラムが削除された場合、該当カラムを利用したリレーション定義を削除する
        if (deletingPrimaryKeyIds.length > 0) {
            for (const relationViewModel of relationViewModels) {
                const previousRelationModel = relationViewModel.relationModel;
                const nextPairs = previousRelationModel.relationPairs
                    .filter(pair => deletingPrimaryKeyIds.includes(pair.parentColumnModelId) === false);

                // リレーション定義に変更がない場合は何もしない
                if (previousRelationModel.relationPairs.length === nextPairs.length) {
                    continue;
                }

                // リレーション定義がなくなった場合は削除候補 (PK追加により、削除されない場合もある)
                if (nextPairs.length === 0) {
                    deletingRelationIds.add(relationViewModel.relationId);
                }

                const nextRelationModel = new RelationModel({
                    ...relationViewModel.relationModel,
                    relationPairs: nextPairs
                });
                updatingRelationModels.set(nextRelationModel.relationModelId, nextRelationModel);
            }
        }

        // PK にカラムが追加される場合、子テーブルに新規にカラムを追加する
        if (addingPrimaryKeys.length > 0) {
            for (const beforeViewModel of relationViewModels) {
                const previousRelationModel = updatingRelationModels.get(beforeViewModel.relationId)
                    || beforeViewModel.relationModel;

                const childTableViewModel = nextTableViewModels.get(previousRelationModel.childTableModelId)
                    || this.tableViewModelMap.get(previousRelationModel.childTableModelId);
                if (childTableViewModel == null) {
                    continue;
                }

                // 子テーブルにも同じカラムグループが存在するならば、同じカラムグループを利用する
                const hasSameGroupColumn = (updatingColumnGroupModel === null) ? false
                    : childTableViewModel.tableModel.columns
                        .some(column => (column.modelType === "group")
                            && (column.columnGroupId === updatingColumnGroupModel.columnGroupId));
                if (hasSameGroupColumn) {
                    const nextRelationPairs = [
                        ...previousRelationModel.relationPairs,
                        ...addingPrimaryKeys.map(addingColumn => new RelationPair({
                            parentColumnModelId: addingColumn.columnModelId,
                            childColumnModelId: addingColumn.columnModelId
                        }))
                    ];

                    const nextRelationModel = new RelationModel({
                        ...previousRelationModel,
                        relationPairs: nextRelationPairs
                    });

                    updatingRelationModels.set(nextRelationModel.relationModelId, nextRelationModel);
                    deletingRelationIds.delete(nextRelationModel.relationModelId);
                    continue;
                }

                // 子テーブルに同じカラムグループが存在しない場合は、子テーブルに新規にカラムを追加する
                const addingObjects = addingPrimaryKeys.map(addingParentColumn => {
                    const addingChildColumnModel = new ColumnModel({
                        columnModelId: uuidV4(),
                        columnShareModelId: addingParentColumn.columnShareModelId,
                        physicalName: addingParentColumn.physicalName,
                        logicalName: addingParentColumn.logicalName,
                        notNull: true
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

                addingColumnModels.forEach(addingColumnModel => {
                    nextColumnModelMap.set(addingColumnModel.columnModelId, addingColumnModel);
                });

                const nextChildTableViewModel = new TableViewModel({
                    ...childTableViewModel,
                    tableModel: new TableModel({
                        ...childTableViewModel.tableModel,
                        columns: [
                            ...childTableViewModel.tableModel.columns,
                            ...addingColumnModels.map(columnModel => (
                                {
                                    modelType: "single",
                                    columnModelId: columnModel.columnModelId,
                                } as ColumnModelType
                            ))
                        ],
                        tableIndexModels: [...childTableViewModel.tableModel.tableIndexModels]
                    })
                });
                nextTableViewModels.set(nextChildTableViewModel.tableId, nextChildTableViewModel);

                const nextRelationPairs = [...previousRelationModel.relationPairs, ...addingRelationPairs];
                const nextRelationModel = new RelationModel({
                    ...previousRelationModel,
                    relationPairs: nextRelationPairs
                });
                updatingRelationModels.set(nextRelationModel.relationModelId, nextRelationModel);
                deletingRelationIds.delete(nextRelationModel.relationModelId);
            }
        }

        deletingRelationIds.forEach(deletingId => updatingRelationModels.delete(deletingId));

        return {
            nextTableViewModels, nextColumnModelMap,
            nextRelationViewModelStorage: this.relationViewModelStorage
                .updateRelationModel(Array.from(updatingRelationModels.values()))
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

        const nextColumnMap = new Map(this.columnModelMap);
        deletingTarget.tableModel.columns
            .flatMap(column => (column.modelType === "single") ? [column.columnModelId] : [])
            .forEach(columnModelId => nextColumnMap.delete(columnModelId));

        const existedColumnShareModelIds = new Set(
            Array.from(nextColumnMap.values()).map(
                columnModel => columnModel.columnShareModelId
            )
        );
        const currentColumnShareModels = this.columnShareModelStorage.getModels();
        const updatingColumnShareModels = currentColumnShareModels.filter(
            shareModel => existedColumnShareModelIds.has(shareModel.columnShareModelId)
        );

        return this.doUpdate({
            tableViewModelIds: nextTableViewModelIds,
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: nextColumnMap,
            columnShareModelStorage: ColumnShareModelStorage.create(updatingColumnShareModels),
            relationViewModelStorage: this.relationViewModelStorage.deleteFromTableId([deletingTableId])
        });
    }

    /**
     * 指定された絡むグループの追加もしくは更新を行う。
     * 
     * @param updatingModel 更新対象
     * @param updatingColumnModels 更新カラム
     * @param updatingColumnShareModelStorage 更新後のカラム共有モデルストレージ 
     * @returns 操作後のモデル。
     */
    public updateColumnGroup(
        updatingModel: ColumnGroupModel,
        updatingColumnModels: ColumnModel[],
        updatingColumnShareModelStorage: ColumnShareModelStorage
    ): ErdDocument {
        const previousModel = this.columnGroupModelMap.get(updatingModel.columnGroupId) || null;

        const nextColumnGroupModelMap = new Map(this.columnGroupModelMap);
        nextColumnGroupModelMap.set(updatingModel.columnGroupId, updatingModel);

        const preNextColumnModelMap = new Map(this.columnModelMap);
        previousModel?.columnModelIds.forEach(columnModelId => {
            preNextColumnModelMap.delete(columnModelId);
        });
        updatingColumnModels.forEach(columnModel => {
            preNextColumnModelMap.set(columnModel.columnModelId, columnModel);
        });

        // インデクス、およびリレーションの更新
        const { nextTableViewModels, nextColumnModelMap, nextRelationViewModelStorage }
            = this.doUpdateTableViewModelsWithUpdatingColumnGroup(
                previousModel, updatingModel, preNextColumnModelMap
            );

        const nextTableViewModelMap = (nextTableViewModels.size > 0)
            ? new Map([...this.tableViewModelMap, ...nextTableViewModels])
            : this.tableViewModelMap;

        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            columnGroupModelMap: nextColumnGroupModelMap,
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: updatingColumnShareModelStorage.copy(),
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    private doUpdateTableViewModelsWithUpdatingColumnGroup(
        previousModel: ColumnGroupModel | null, updatingColumnGroupModel: ColumnGroupModel,
        columnModelMap: Map<string, ColumnModel>
    ) {
        const tableViewModels = Array.from(this.tableViewModelMap.values())
            .filter(tableViewModel => tableViewModel.tableModel.columns
                .some(column => (column.modelType === "group")
                    && (column.columnGroupId === updatingColumnGroupModel.columnGroupId)));

        // 該当カラムグループを参照しているテーブルが存在しない場合は、何もしない
        if (tableViewModels.length === 0) {
            return {
                nextTableViewModels: new Map<string, TableViewModel>(),
                nextColumnModelMap: columnModelMap,
                nextRelationViewModelStorage: this.relationViewModelStorage
            };
        }

        const deletingColumnModelIds = new Set((previousModel == null) ? []
            : previousModel.columnModelIds.filter(previousId =>
                (updatingColumnGroupModel.columnModelIds.includes(previousId) === false))
        );

        const nextTableViewModels = new Map<string, TableViewModel>();

        // 削除したカラムにインデクス定義がある場合は、インデクス定義から削除する
        if (deletingColumnModelIds.size > 0) {
            for (const beforeTableViewModel of tableViewModels) {
                const beforeTableModel = beforeTableViewModel.tableModel;

                let hasChanged = false;
                const nextTableIndexModels = beforeTableModel.tableIndexModels.flatMap(tableIndexModel => {
                    const nextIndexColumnModels = tableIndexModel.indexColumnModels
                        .filter(indexModel => deletingColumnModelIds.has(indexModel.columnModelId) === false);
                    if (tableIndexModel.indexColumnModels.length === nextIndexColumnModels.length) {
                        return tableIndexModel;
                    }

                    hasChanged = true;
                    // インデクス定義がなくなった場合は削除
                    if (nextIndexColumnModels.length === 0) {
                        return [];
                    }

                    return [
                        new TableIndexModel({
                            ...tableIndexModel,
                            indexColumnModels: nextIndexColumnModels
                        })
                    ];
                });

                if (hasChanged === false) {
                    continue;
                }

                const nextTableViewModel = new TableViewModel({
                    ...beforeTableViewModel,
                    tableModel: new TableModel({
                        ...beforeTableModel,
                        columns: [...beforeTableModel.columns],
                        tableIndexModels: nextTableIndexModels
                    })
                });
                nextTableViewModels.set(nextTableViewModel.tableId, nextTableViewModel);
            }
        }

        const previousPrimaryKeyIds = (previousModel == null) ? []
            : previousModel.columnModelIds
                .map(columnModelId => this.columnModelMap.get(columnModelId))
                .filter((columnModel): columnModel is ColumnModel =>
                    (columnModel != null) && (columnModel.primaryKey === true))
                .map(columnModel => columnModel.columnModelId);
        const nextPrimaryColumnModels = updatingColumnGroupModel.columnModelIds
            .map(columnModelId => columnModelMap.get(columnModelId))
            .filter((columnModel): columnModel is ColumnModel =>
                (columnModel != null) && (columnModel.primaryKey === true));

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
            relationViewModels, nextTableViewModels, columnModelMap,
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

        const nextColumnModelMap = new Map(this.columnModelMap);
        previousModel.columnModelIds.forEach(columnModelId => {
            nextColumnModelMap.delete(columnModelId);
        });

        const existedColumnShareModelIds = new Set(
            Array.from(nextColumnModelMap.values()).map(
                columnModel => columnModel.columnShareModelId
            )
        );
        const currentColumnShareModels = this.columnShareModelStorage.getModels();
        const updatingColumnShareModels = currentColumnShareModels.filter(
            shareModel => existedColumnShareModelIds.has(shareModel.columnShareModelId)
        );

        const { nextTableViewModelMap, nextRelationViewModelStorage }
            = this.doUpdateTableViewModelsWithDeletingColumnGroup(previousModel);

        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            columnGroupModelMap: nextColumnGroupModelMap,
            columnModelMap: nextColumnModelMap,
            columnShareModelStorage: ColumnShareModelStorage.create(updatingColumnShareModels),
            relationViewModelStorage: nextRelationViewModelStorage
        });
    }

    private doUpdateTableViewModelsWithDeletingColumnGroup(previousModel: ColumnGroupModel) {
        const previousColumnModels = previousModel.columnModelIds
            .map(columnModelId => this.columnModelMap.get(columnModelId))
            .filter((columnModel): columnModel is ColumnModel => (columnModel != null));
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
            const nextColumns = tableViewModel.tableModel.columns
                .filter(column => (column.modelType === "single")
                    || (column.columnGroupId !== previousModel.columnGroupId)
                );

            if (tableViewModel.tableModel.columns.length === nextColumns.length) {
                continue;
            }

            hasChanged = true;
            if (nextColumns.length === 0) {
                nextTableViewModelMap.delete(tableId);
                deleteTableIds.push(tableId);
                continue;
            }

            changedPreviousTableModels.push(tableViewModel.tableModel);

            const nextTableIndexModels = tableViewModel.tableModel.tableIndexModels
                .map(tableIndexModel => {
                    const nextIndexColumnModels = tableIndexModel.indexColumnModels
                        .filter(indexColumnModel =>
                            previousModel.columnModelIds.includes(indexColumnModel.columnModelId) === false
                        );

                    if (nextIndexColumnModels.length === tableIndexModel.indexColumnModels.length) {
                        return tableIndexModel;
                    }
                    if (nextIndexColumnModels.length === 0) {
                        return null;
                    }

                    return new TableIndexModel({
                        ...tableIndexModel,
                        indexColumnModels: nextIndexColumnModels
                    });
                })
                .filter(tableIndexModel => tableIndexModel != null);

            const nextTableViewModel = new TableViewModel({
                ...tableViewModel,
                tableModel: new TableModel({
                    ...tableViewModel.tableModel,
                    columns: nextColumns,
                    tableIndexModels: nextTableIndexModels,
                })
            });
            nextTableViewModelMap.set(tableId, nextTableViewModel);
        }

        // 親リレーションの更新
        const updatingParentRelationViewModels: Map<string, RelationModel> = (previousPkColumnModelIds.length > 0)
            ? new Map(changedPreviousTableModels
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
            ) : new Map();

        // 子リレーションの更新
        const updatingChildRelationModels = changedPreviousTableModels.flatMap(tableModel =>
            this.relationViewModelStorage.fetchRelationsByChild(tableModel.tableModelId)
                .filter(viewModel => deleteRelationIds.has(viewModel.relationId) === false)
                .map(viewModel => updatingParentRelationViewModels.get(viewModel.relationId) || viewModel.relationModel)
                .filter(relationModel => {
                    // 子テーブルから削除されたカラムに紐づくリレーションが存在する場合、該当リレーションを削除する
                    for (const pair of relationModel.relationPairs) {
                        for (const columnModelId of previousModel.columnModelIds) {
                            if (pair.childColumnModelId === columnModelId) {
                                deleteRelationIds.add(relationModel.relationModelId);
                                return false;
                            }
                        }
                    }

                    return true;
                })
                .filter(relationModel => updatingParentRelationViewModels.has(relationModel.relationModelId))
        );

        // 最終的なリレーション更新
        const updatingRelationModels = new Map(updatingParentRelationViewModels);
        updatingChildRelationModels.forEach(model => updatingRelationModels.set(model.relationModelId, model));

        const nextRelationViewModelStorage = this.relationViewModelStorage
            .updateRelationModel(Array.from(updatingRelationModels.values()))
            .deleteFromTableId(deleteTableIds)
            .deleteRelation(Array.from(deleteRelationIds));

        return {
            nextTableViewModelMap: hasChanged ? nextTableViewModelMap : this.tableViewModelMap,
            nextRelationViewModelStorage: nextRelationViewModelStorage
        }
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
                    physicalName: parentColumnModel.physicalName,
                    logicalName: parentColumnModel.logicalName,
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

        return this.doUpdate({
            tableViewModelMap: nextTableViewModelMap,
            columnModelMap: nextColumnModelMap,
            relationViewModelStorage: this.relationViewModelStorage.updateRelationModel([updatingModel])
        });
    }

    public deleteRelation(relationId: string): ErdDocument {
        const next = this.relationViewModelStorage.deleteRelation([relationId]);
        if (next === this.relationViewModelStorage) {
            return this;
        }

        return this.doUpdate({
            relationViewModelStorage: next
        });
    }

    public updateRelationLineModel(relationId: string, updatingModel: LineViewModel): ErdDocument {
        const nextRelationStorage = this.relationViewModelStorage.updateLineViewModel(relationId, updatingModel);
        if (this.relationViewModelStorage === nextRelationStorage) {
            return this;
        }

        return this.doUpdate({
            relationViewModelStorage: nextRelationStorage
        });
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
        tableIds: Set<string>, moving: { x: number, y: number },
        nextOrthogonalObjects: { relationId: string, orthogonalLines: OrthogonalDirection[] }[]
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

        const nextRelationViewStorage = nextOrthogonalObjects
            .reduce((previousStorage, { relationId, orthogonalLines }) => {
                const previousRelation = previousStorage.findByRelationId(relationId);
                if (previousRelation == null) {
                    return previousStorage;
                }

                const previousLineView = previousRelation.lineViewModel;
                const nextLineView = previousLineView.updateOrthogonalLines(orthogonalLines);
                if (previousLineView.equals(nextLineView)) {
                    return previousStorage;
                }

                return previousStorage.updateLineViewModel(relationId, nextLineView);
            }, this.relationViewModelStorage.moveRelation(tableIds, moving));

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
    public moveMemoView(memoIds: string[], moving: { x: number, y: number }): ErdDocument {
        if (memoIds.length === 0) {
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

        const nextColumnShareModelStorage = this.columnShareModelStorage.addModel(...columnShareModels);
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
            columnModels: columnModels,
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

        const schemaConfig = ("schemaConfig" in obj)
            ? DbSchemaConfig.toObject(obj.schemaConfig as object)
            : DbSchemaConfig.create();

        const tableViewModels = toObjects(obj.tableViewModels, "tableViewModels",
            value => TableViewModel.toObject(value))
        const columnGroupModels = ("columnGroupModels" in obj)
            ? toObjects(obj.columnGroupModels, "columnGroupModels", value => ColumnGroupModel.toObject(value)) : [];
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

type ImportDdlArgs = {
    tableViewModels: TableViewModel[],
    columnModels: ColumnModel[],
    columnShareModels: ColumnShareModel[],
    relationViewModels: RelationViewModel[]
};