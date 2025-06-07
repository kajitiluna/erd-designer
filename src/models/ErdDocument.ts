import { v4 as uuidV4 } from 'uuid';

import ColorValue from '~/models/ColorValue';
import ColumnShareModelStorage from '~/models/ColumnShareModelStorage';
import { Database, databases } from '~/models/database';
import ColumnGroupModel from '~/models/database/ColumnGroupModel';
import ColumnModel from '~/models/database/ColumnModel';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import DisplayStyle from '~/models/database/DisplayStyle';
import RelationModel from '~/models/database/RelationModel';
import RelationPair from '~/models/database/RelationPair';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
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
    columnGroupModels?: readonly ColumnGroupModel[],
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
    private readonly columnGroupModelMap: Map<string, ColumnGroupModel>;
    private readonly columnModelMap: Map<string, ColumnModel>;
    private readonly relationViewModelStorage: RelationViewModelStorage;
    private readonly memoViewModelStorage: MemoViewModelStorage;
    public readonly databaseSettingModel: DatabaseSettingModel;
    public readonly lastUpdatedAt: Date;

    private constructor(
        documentName: string, erdSettingModel: ErdSettingModel,
        tableViewModelIds: readonly string[], tableViewModelMap: Map<string, TableViewModel>,
        columnGroupModelMap: Map<string, ColumnGroupModel>,
        columnModelMap: Map<string, ColumnModel>, columnShareModelStorage: ColumnShareModelStorage,
        relationViewModelStorage: RelationViewModelStorage, memoViewModelStorage: MemoViewModelStorage,
        databaseSettingModel: DatabaseSettingModel, lastUpdatedAt: Date | null = null
    ) {
        this.documentName = documentName;
        this.erdSettingModel = erdSettingModel;
        this.columnShareModelStorage = columnShareModelStorage;
        this.tableViewModelIds = tableViewModelIds;
        this.tableViewModelMap = tableViewModelMap;
        this.columnGroupModelMap = columnGroupModelMap;
        this.columnModelMap = columnModelMap;
        this.relationViewModelStorage = relationViewModelStorage;
        this.memoViewModelStorage = memoViewModelStorage;
        this.databaseSettingModel = databaseSettingModel;
        this.lastUpdatedAt = lastUpdatedAt ? lastUpdatedAt : new Date();
    }

    public static create({
        documentName, erdSettingModel, databaseSettingModel,
        tableViewModels = [], columnGroupModels = [], columnModels = [], columnShareModels = [],
        relationViewModels = [], foregroundMemoViewModels = [], backgroundMemoViewModels = [],
        lastUpdatedAt = null
    }: ErdDocumentOptions): ErdDocument {

        return new ErdDocument(
            documentName, erdSettingModel,
            tableViewModels.map(viewModel => viewModel.tableId),
            new Map(tableViewModels.map(viewModel => [viewModel.tableId, viewModel])),
            new Map(columnGroupModels.map(groupModel => [groupModel.columnGroupId, groupModel])),
            new Map(columnModels.map(columnModel => [columnModel.columnModelId, columnModel])),
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

    public getRelationViewModels(): RelationViewModel[] {
        return this.relationViewModelStorage.getModels();
    }

    public inChildRelation(tableModelId: string, columnModelId: string): boolean {
        return this.relationViewModelStorage.inChildRelation(tableModelId, columnModelId);
    }

    public findParentRelation(childTableModelId: string, childColumnModelId: string) {
        return this.relationViewModelStorage.findParentRelation(childTableModelId, childColumnModelId);
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
                updatingTableViewModel, updatingColumnModels, updatingColumnShareModelStorage
            );
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
        previousTableViewModel.tableModel.columns.forEach(column => {
            if (column.modelType === "single") {
                nextColumnModelMap.delete(column.columnModelId);
            }
        });
        nextColumnModels.forEach(columnModel =>
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

        const nextColumnShareModelStorage = updatingColumnShareModelStorage.copy();
        if (deletingColumnShareModelIds.length > 0) {
            nextColumnShareModelStorage.deleteModels(deletingColumnShareModelIds);
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            nextTableViewModelMap,
            this.columnGroupModelMap,
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
        addingColumnModels.forEach(columnModel =>
            nextColumnModelMap.set(columnModel.columnModelId, columnModel)
        );

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            nextTableViewModelIds,
            nextTableViewModelMap,
            this.columnGroupModelMap,
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
            .fetchRelationsByParent(updatingTableViewModel.tableId);
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
        const updatingPrimaryKeys = updatingTableViewModel.tableModel.columns
            .flatMap(column => {
                if (column.modelType === "single") {
                    return [updatingColumnModelMap.get(column.columnModelId) as ColumnModel]
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

        const previousColumnModels = previousTableViewModel.tableModel.columns
            .flatMap(previousColumn => {
                if (previousColumn.modelType === "single") {
                    return [previousColumn.columnModelId];
                }

                const columnGroupModel = this.columnGroupModelMap.get(previousColumn.columnGroupId);
                if (columnGroupModel == null) {
                    return [];
                }

                return columnGroupModel.columnModelIds;
            })
            .map(columnModelId => this.findColumnModel(columnModelId) as ColumnModel);

        // 更新に伴い、PK の削除となる ColumnModelId
        const deletingPrimaryKeyIdSet = new Set(previousColumnModels
            .filter(previousColumnModel =>
                (previousColumnModel.primaryKey === true)
                && (updatingPrimaryKeys.some(updatingKey =>
                    updatingKey.columnModelId === previousColumnModel.columnModelId
                ) === false)
            )
            .map(columnModel => columnModel.columnModelId)
        );

        const previousPrimaryKeySet = new Set(previousColumnModels
            .filter(columnModel => columnModel.primaryKey === true)
            .map(columnModel => columnModel.columnModelId)
        );
        // 更新に伴い、PK の追加となる ColumnModelId
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

                return {
                    modelType: "single",
                    columnModelId: addingChildColumnModel.columnModelId,
                } as ColumnModelType;
            });

            // PKが全て解除された場合は relation を削除する
            if (nextRelationPairs.length === 0) {
                return {
                    tableViewModels: updating.tableViewModels,
                    columnModels: updating.columnModels,
                    relationRepository: updating.relationRepository
                        .deleteRelation([previousViewModel.relationId])
                };
            }

            // TODO 子テーブルに新規に外部キーを追加する際に、それが子テーブルの PK になるか否かの判断および処理

            const updatingRelationModel = new RelationModel({
                ...previousRelationModel,
                relationPairs: nextRelationPairs
            });
            const nextRelationRepository = updating.relationRepository.updateRelationModel([updatingRelationModel]);

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
                    columns: [...previousTableModel.columns, ...addingChildColumnIds],
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

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            nextTableViewModelIds,
            nextTableViewModelMap,
            this.columnGroupModelMap,
            nextColumnMap,
            ColumnShareModelStorage.create(updatingColumnShareModels),
            this.relationViewModelStorage.deleteFromTableId([deletingTableId]),
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
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
        const { changedTableViewModels, nextColumnModelMap, updatingRelationViewModels, deletingRelationIds }
            = this.doUpdateTableViewModelsWithUpdatingColumnGroup(
                previousModel, updatingModel, preNextColumnModelMap
            );

        const nextTableViewModelMap = (changedTableViewModels.size > 0)
            ? new Map([...this.tableViewModelMap, ...changedTableViewModels])
            : this.tableViewModelMap;

        const nextRelationViewModelStorage = this.relationViewModelStorage
            .deleteRelation([...deletingRelationIds])
            .updateRelationModel([...updatingRelationViewModels.values()].map(view => view.relationModel));

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            nextTableViewModelMap,
            nextColumnGroupModelMap,
            nextColumnModelMap,
            updatingColumnShareModelStorage.copy(),
            nextRelationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    private doUpdateTableViewModelsWithUpdatingColumnGroup(
        previousModel: ColumnGroupModel | null, updatingModel: ColumnGroupModel,
        columnModelMap: Map<string, ColumnModel>
    ) {
        const tableViewModels = Array.from(this.tableViewModelMap.values())
            .filter(tableViewModel => tableViewModel.tableModel.columns
                .some(column => (column.modelType === "group")
                    && (column.columnGroupId === updatingModel.columnGroupId)));

        // 該当カラムグループを参照しているテーブルが存在しない場合は、何もしない
        if (tableViewModels.length === 0) {
            return {
                changedTableViewModels: new Map<string, TableViewModel>(),
                nextColumnModelMap: columnModelMap,
                updatingRelationViewModels: new Map<string, RelationViewModel>(),
                deletingRelationIds: new Set<string>()
            };
        }

        const deletingColumnModelIds = new Set((previousModel == null) ? []
            : previousModel.columnModelIds.filter(previousId =>
                (updatingModel.columnModelIds.includes(previousId) === false))
        );

        const changedTableViewModels = new Map<string, TableViewModel>();

        // 削除したカラムにインデクス定義がある場合は、インデクス定義から削除する
        if (deletingColumnModelIds.size > 0) {
            for (const tableViewModel of tableViewModels) {
                const tableModel = tableViewModel.tableModel;

                let hasChanged = false;
                const nextTableIndexModels = tableModel.tableIndexModels.flatMap(tableIndexModel => {
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
                    ...tableViewModel,
                    tableModel: new TableModel({
                        ...tableModel,
                        columns: [...tableModel.columns],
                        tableIndexModels: nextTableIndexModels
                    })
                });
                changedTableViewModels.set(nextTableViewModel.tableId, nextTableViewModel);
            }
        }

        const previousPkColumnModelIds = (previousModel == null) ? []
            : previousModel.columnModelIds
                .map(columnModelId => this.columnModelMap.get(columnModelId))
                .filter((columnModel): columnModel is ColumnModel =>
                    (columnModel != null) && (columnModel.primaryKey === true))
                .map(columnModel => columnModel.columnModelId);
        const nextPrimaryColumnModels = updatingModel.columnModelIds
            .map(columnModelId => columnModelMap.get(columnModelId))
            .filter((columnModel): columnModel is ColumnModel =>
                (columnModel != null) && (columnModel.primaryKey === true));

        const deletingPkColumnModelIds = previousPkColumnModelIds
            .filter(previousId => (nextPrimaryColumnModels.every(nextPk => (nextPk.columnModelId !== previousId))));
        const addingPrimaryKeys = nextPrimaryColumnModels
            .filter(nextColumn => (previousPkColumnModelIds.includes(nextColumn.columnModelId) === false));

        // PK のチェックはリレーションが定義されているテーブルのみが対象
        const hasRelationPairs = tableViewModels.map(tableViewModel => {
            const relationViewModels = this.relationViewModelStorage.fetchRelationsByParent(tableViewModel.tableId);
            return (relationViewModels.length === 0) ? null : { tableViewModel, relationViewModels };
        }).filter(pair => (pair != null));

        const updatingRelationViewModels = new Map<string, RelationViewModel>();
        const deletingRelationIds = new Set<string>();

        // PK に指定したカラムが削除された場合、該当カラムを利用したリレーション定義を削除する
        if (deletingPkColumnModelIds.length > 0) {
            for (const pair of hasRelationPairs) {
                const { relationViewModels } = pair;

                for (const relationViewModel of relationViewModels) {
                    const relationModel = relationViewModel.relationModel;
                    const nextPairs = relationModel.relationPairs
                        .filter(pair => deletingPkColumnModelIds.includes(pair.parentColumnModelId) === false);

                    // リレーション定義に変更がない場合は何もしない
                    if (relationModel.relationPairs.length === nextPairs.length) {
                        continue;
                    }

                    // リレーション定義がなくなった場合は削除候補 (PK追加により、削除されない場合もある)
                    if (nextPairs.length === 0) {
                        deletingRelationIds.add(relationViewModel.relationId);
                        continue;
                    }

                    const nextViewModel = new RelationViewModel({
                        ...relationViewModel,
                        relationModel: new RelationModel({
                            ...relationViewModel.relationModel,
                            relationPairs: nextPairs
                        })
                    });
                    updatingRelationViewModels.set(nextViewModel.relationId, nextViewModel);
                }
            }
        }

        const nextColumnModelMap = new Map(columnModelMap);

        if (addingPrimaryKeys.length > 0) {
            for (const pair of hasRelationPairs) {
                const { tableViewModel: beforeTableView, relationViewModels } = pair;
                for (const beforeViewModel of relationViewModels) {
                    const relationViewModel = updatingRelationViewModels.get(beforeViewModel.relationId) || beforeViewModel;

                    const relationModel = relationViewModel.relationModel;
                    const childTableViewModel = changedTableViewModels.get(relationModel.childTableModelId)
                        || this.tableViewModelMap.get(relationModel.childTableModelId);
                    if (childTableViewModel == null) {
                        continue;
                    }

                    // 子テーブルにも同じカラムグループが存在するならば、同じカラムグループを利用する
                    const hasSameGroupColumn = childTableViewModel.tableModel.columns
                        .some(column => (column.modelType === "group")
                            && (column.columnGroupId === updatingModel.columnGroupId));
                    if (hasSameGroupColumn) {
                        const nextRelationPairs = [
                            ...relationModel.relationPairs,
                            ...addingPrimaryKeys.map(addingColumn => new RelationPair({
                                parentColumnModelId: addingColumn.columnModelId,
                                childColumnModelId: addingColumn.columnModelId
                            }))
                        ];

                        const nextViewModel = new RelationViewModel({
                            ...relationViewModel,
                            relationModel: new RelationModel({
                                ...relationModel,
                                relationPairs: nextRelationPairs
                            })
                        });

                        updatingRelationViewModels.set(nextViewModel.relationId, nextViewModel);
                        deletingRelationIds.delete(nextViewModel.relationId);
                        continue;
                    }

                    // 子テーブルに同じカラムグループが存在しない場合は、子テーブルに新規にカラムを追加する
                    const addingObjects = addingPrimaryKeys.map(addingParentColumn => {
                        const addingChildColumnModel = new ColumnModel({
                            columnModelId: uuidV4(),
                            columnShareModelId: addingParentColumn.columnShareModelId,
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

                    const tableViewModel = changedTableViewModels.get(childTableViewModel.tableId) || beforeTableView;
                    const addingColumnModels = addingObjects.map(addingObj => addingObj.columnModel);
                    const addingRelationPairs = addingObjects.map(addingObj => addingObj.relationPair);

                    addingColumnModels.forEach(addingColumnModel => {
                        nextColumnModelMap.set(addingColumnModel.columnModelId, addingColumnModel);
                    });

                    const nextTableViewModel = new TableViewModel({
                        ...tableViewModel,
                        tableModel: new TableModel({
                            ...tableViewModel.tableModel,
                            columns: [
                                ...tableViewModel.tableModel.columns,
                                ...addingColumnModels.map(columnModel => (
                                    {
                                        modelType: "single",
                                        columnModelId: columnModel.columnModelId,
                                    } as ColumnModelType
                                ))
                            ],
                            tableIndexModels: [...tableViewModel.tableModel.tableIndexModels]
                        })
                    });
                    changedTableViewModels.set(nextTableViewModel.tableId, nextTableViewModel);

                    const nextRelationPairs = [...relationModel.relationPairs, ...addingRelationPairs];
                    const nextViewModel = new RelationViewModel({
                        ...relationViewModel,
                        relationModel: new RelationModel({
                            ...relationModel,
                            relationPairs: nextRelationPairs
                        })
                    });
                    updatingRelationViewModels.set(nextViewModel.relationId, nextViewModel);
                    deletingRelationIds.delete(nextViewModel.relationId);
                }
            }
        }

        return { changedTableViewModels, nextColumnModelMap, updatingRelationViewModels, deletingRelationIds };
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

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            nextTableViewModelMap,
            nextColumnGroupModelMap,
            nextColumnModelMap,
            ColumnShareModelStorage.create(updatingColumnShareModels),
            nextRelationViewModelStorage,
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
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
        for (const entry of this.tableViewModelMap.entries()) {
            const [tableId, tableViewModel] = entry;
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
            this.columnGroupModelMap,
            nextColumnModelMap,
            this.columnShareModelStorage,
            this.relationViewModelStorage.updateRelationModel([updatingModel]),
            this.memoViewModelStorage,
            this.databaseSettingModel
        );
    }

    public deleteRelation(relationId: string): ErdDocument {
        const next = this.relationViewModelStorage.deleteRelation([relationId]);
        if (next === this.relationViewModelStorage) {
            return this;
        }

        return new ErdDocument(
            this.documentName,
            this.erdSettingModel,
            this.tableViewModelIds,
            this.tableViewModelMap,
            this.columnGroupModelMap,
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
            this.columnGroupModelMap,
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
            this.columnGroupModelMap,
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
            this.columnGroupModelMap,
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
            this.columnGroupModelMap,
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
            this.columnGroupModelMap,
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
            this.columnGroupModelMap,
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

        const tableViewModels = toObjects(obj.tableViewModels, "tableViewModels",
            (value) => TableViewModel.toObject(value))
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