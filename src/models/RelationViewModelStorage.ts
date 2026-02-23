import RelationModel from "~/models/database/RelationModel";
import LineViewModel from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";

export default class RelationViewModelStorage {

    private relationIdMap: Map<string, RelationViewModel>;
    private parentTableModelIdMap: Map<string, RelationViewModel[]>;
    private childTableModelIdMap: Map<string, RelationViewModel[]>;
    // `子テーブルID:子カラムID` をキーに、親テーブルIDと親カラムIDのペアを値とするマップ
    private childColumnModelIdMap: Map<string, ParentRelation>;

    constructor(relationViewModels: readonly RelationViewModel[]) {
        this.relationIdMap = new Map(relationViewModels.map(model => [model.relationId, model]));

        this.parentTableModelIdMap = RelationViewModelStorage.toTableIdMapping(
            relationViewModels, relationModel => relationModel.parentTableModelId
        );
        this.childTableModelIdMap = RelationViewModelStorage.toTableIdMapping(
            relationViewModels, relationModel => relationModel.childTableModelId
        );

        this.childColumnModelIdMap = new Map(relationViewModels
            .filter(model => model.relationModel.relationPairs.length > 0)
            .flatMap(model => model.relationModel.relationPairs
                .map(pair => [
                    `${model.relationModel.childTableModelId}:${pair.childColumnModelId}`,
                    {
                        tableModelId: model.relationModel.parentTableModelId,
                        columnModelId: pair.parentColumnModelId
                    }
                ])
            ));
    }

    private static toTableIdMapping(
        relationViewModels: readonly RelationViewModel[], toTableId: (relationModel: RelationModel) => string
    ): Map<string, RelationViewModel[]> {
        const tableIdMap = new Map<string, RelationViewModel[]>();
        relationViewModels.forEach(viewModel => {
            const tableId = toTableId(viewModel.relationModel);

            const relationIds = tableIdMap.get(tableId);
            if (relationIds != null) {
                relationIds.push(viewModel);
            } else {
                tableIdMap.set(tableId, [viewModel]);
            }
        });

        return tableIdMap;
    }

    public getModels(): RelationViewModel[] {
        return Array.from(this.relationIdMap.values())
            .sort((first, second) => first.relationId.localeCompare(second.relationId, "en"));
    }

    public findByRelationId(relationId: string): RelationViewModel | null {
        const model = this.relationIdMap.get(relationId);
        if (model == null) {
            return null;
        }

        return model;
    }

    public fetchRelationsByParent(parentTableId: string): RelationViewModel[] {
        const models = this.parentTableModelIdMap.get(parentTableId);
        return models ? models : [];
    }

    public fetchRelationsByChild(childTableId: string): RelationViewModel[] {
        const models = this.childTableModelIdMap.get(childTableId);
        return models ? models : [];
    }

    public fetchRelationsByTableIds(tableIds: string[]): RelationViewModel[] {
        const parentModelIds = tableIds
            .flatMap(tableId => this.parentTableModelIdMap.get(tableId) || [])
            .map(model => model.relationId);
        const childModelIds = tableIds
            .flatMap(tableId => this.childTableModelIdMap.get(tableId) || [])
            .map(model => model.relationId);

        const allRelationIds = new Set([...parentModelIds, ...childModelIds]);
        if (allRelationIds.size === 0) {
            return [];
        }

        return [...allRelationIds].flatMap(relationId => this.relationIdMap.get(relationId) || []);
    }

    public inChildRelation(tableModelId: string, columnModelId: string): boolean {
        return this.childColumnModelIdMap.has(`${tableModelId}:${columnModelId}`);
    }

    public findParentRelation(childTableModelId: string, childColumnModelId: string): ParentRelation | null {
        return this.childColumnModelIdMap.get(`${childTableModelId}:${childColumnModelId}`) ?? null;
    }

    public updataeRelationView(updating: RelationViewModel): RelationViewModelStorage {
        return this.update([updating]);
    }

    public updateRelationModel(updatingModels: RelationModel[]): RelationViewModelStorage {
        if (updatingModels.length === 0) {
            return this;
        }

        const nextViewModels = updatingModels.map(updatingModel => {
            const currentViewModel = this.relationIdMap.get(updatingModel.relationModelId);

            return (currentViewModel != null)
                ? currentViewModel.updateRelationModel(updatingModel)
                : new RelationViewModel({
                    relationModel: updatingModel,
                    lineViewModel: new LineViewModel({})
                });
        });

        return this.update(nextViewModels);
    }

    public deleteRelation(relationIds: string[]): RelationViewModelStorage {
        if (relationIds.length === 0) {
            return this;
        }

        const nextRelationIdMap = new Map(this.relationIdMap);
        relationIds.forEach(relationId => nextRelationIdMap.delete(relationId));
        if (nextRelationIdMap.size === this.relationIdMap.size) {
            return this;
        }

        return new RelationViewModelStorage(Array.from(nextRelationIdMap.values()));
    }

    public deleteFromTableId(tableIds: string[]): RelationViewModelStorage {
        if (tableIds.length === 0) {
            return this;
        }

        const nextRelationIdMap = new Map(this.relationIdMap);
        for (const tableId of tableIds) {
            const relationModels = this.childTableModelIdMap.get(tableId) || [];
            relationModels.forEach(relationModel => {
                nextRelationIdMap.delete(relationModel.relationId);
            });
        }

        if (nextRelationIdMap.size === this.relationIdMap.size) {
            return this;
        }

        return new RelationViewModelStorage(Array.from(nextRelationIdMap.values()));
    }

    public updateLineViewModel(relationId: string, nextLineViewModel: LineViewModel): RelationViewModelStorage {
        const current = this.relationIdMap.get(relationId);
        if (current == null) {
            return this;
        }

        if (current.lineViewModel.equals(nextLineViewModel)) {
            return this;
        }

        const nextViewModel = new RelationViewModel({
            relationModel: current.relationModel,
            lineViewModel: nextLineViewModel
        });

        return this.update([nextViewModel]);
    }

    private update(models: RelationViewModel[]): RelationViewModelStorage {
        if (models.length === 0) {
            return this;
        }

        const nextRelationMap = new Map(this.relationIdMap);
        models.forEach(model => nextRelationMap.set(model.relationId, model));

        return new RelationViewModelStorage(Array.from(nextRelationMap.values()));
    }

    public moveRelation(tableIds: Set<string>, moving: { x: number, y: number }): RelationViewModelStorage {
        if (this.relationIdMap.size === 0) {
            return this;
        }

        if (tableIds.size <= 1) {
            return this;
        }
        if ((moving.x === 0) && (moving.y === 0)) {
            return this;
        }

        let hasChanged = false;
        const nextRelations = [...this.relationIdMap.values()].map(relationView => {
            const relation = relationView.relationModel;
            if ((tableIds.has(relation.parentTableModelId) == false)
                || (tableIds.has(relation.childTableModelId) == false)) {
                return relationView;
            }

            if (relationView.lineViewModel.edges.length === 0) {
                return relationView;
            }

            hasChanged = true;

            const nextEdges = relationView.lineViewModel.edges
                .map(edge => ({ x: edge.x + moving.x, y: edge.y + moving.y }));
            const nextLineView = new LineViewModel({
                ...relationView.lineViewModel,
                edges: nextEdges
            });

            return new RelationViewModel({
                ...relationView,
                lineViewModel: nextLineView
            });
        })

        if (hasChanged === false) {
            return this;
        }

        return new RelationViewModelStorage(nextRelations);
    }

    public equals(other: RelationViewModelStorage): boolean {
        if (this.relationIdMap.size !== other.relationIdMap.size) {
            return false;
        }

        for (const [relationId, model] of this.relationIdMap) {
            const otherModel = other.relationIdMap.get(relationId);
            if ((otherModel == null) || (!model.equals(otherModel))) {
                return false;
            }
        }

        return true;
    }
}

type ParentRelation = {
    tableModelId: string,
    columnModelId: string
};