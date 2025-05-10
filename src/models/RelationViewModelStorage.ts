import RelationModel from "~/models/database/RelationModel";
import LineViewModel from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";

export default class RelationViewModelStorage {

    private relationIdMap: Map<string, RelationViewModel>;
    private parentTableModelIdMap: Map<string, RelationViewModel[]>;
    private childColumnModelIdMap: Map<string, ParentRelation>;

    constructor(relationViewModels: readonly RelationViewModel[]) {
        this.relationIdMap = new Map(relationViewModels.map((model) => [model.relationId, model]));

        this.parentTableModelIdMap = relationViewModels.reduce((pairs, model) => {
            let currentPair = pairs.get(model.relationModel.parentTableModelId);
            if (currentPair == null) {
                currentPair = [];
                pairs.set(model.relationModel.parentTableModelId, currentPair);
            }
            currentPair.push(model);
            return pairs;
        }, new Map<string, RelationViewModel[]>());

        this.childColumnModelIdMap = new Map(relationViewModels
            .filter(model => model.relationModel.relationPairs.length > 0)
            .flatMap(model => model.relationModel.relationPairs
                .map(pair => [
                    pair.childColumnModelId, {
                        tableModelId: model.relationModel.parentTableModelId,
                        columnModelId: pair.parentColumnModelId
                    }
                ])
            ));
    }

    public getModels(): RelationViewModel[] {
        const models = Array.from(this.relationIdMap.values());
        models.sort((first, second) => first.relationId.localeCompare(second.relationId, "en"));

        return models;
    }

    public findByRelationId(relationId: string): RelationViewModel | null {
        const model = this.relationIdMap.get(relationId);
        if (model == null) {
            return null;
        }

        return model;
    }

    public getRelationsByParent(parentTableId: string): RelationViewModel[] {
        const models = this.parentTableModelIdMap.get(parentTableId);
        return models ? models : [];
    }

    public inChildRelation(columnModelId: string): boolean {
        return this.childColumnModelIdMap.has(columnModelId);
    }

    public findParentRelation(childColumnModelId: string): ParentRelation | null {
        return this.childColumnModelIdMap.get(childColumnModelId) ?? null;
    }

    public updateRelationModel(updatingModel: RelationModel): RelationViewModelStorage {
        const currentViewModel = this.relationIdMap.get(updatingModel.relationModelId);
        const nextViewModel = (currentViewModel != null)
            ? currentViewModel.updateRelationModel(updatingModel)
            : new RelationViewModel({
                relationModel: updatingModel,
                lineViewModel: new LineViewModel({ strokeWidth: 1 })
            });

        return this.update(nextViewModel);
    }

    public deleteRelation(relationId: string): RelationViewModelStorage {
        const nextRelationIdMap = new Map(this.relationIdMap);
        const deleted = nextRelationIdMap.delete(relationId);
        if (deleted === false) {
            return this;
        }

        return new RelationViewModelStorage(Array.from(nextRelationIdMap.values()));
    }

    public updateLineViewModel(relationId: string, nextLineViewModel: LineViewModel): RelationViewModelStorage {
        const current = this.relationIdMap.get(relationId);
        if (current == null) {
            return this;
        }

        if (current.lineViewModel.isEquals(nextLineViewModel)) {
            return this;
        }

        const nextViewModel = new RelationViewModel({
            relationModel: current.relationModel,
            lineViewModel: nextLineViewModel
        });

        return this.update(nextViewModel);
    }

    private update(model: RelationViewModel): RelationViewModelStorage {
        const nextRelationMap = new Map(this.relationIdMap);
        nextRelationMap.set(model.relationId, model);

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
}

type ParentRelation = {
    tableModelId: string,
    columnModelId: string
};