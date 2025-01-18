import RelationModel from "~/models/database/RelationModel";
import LineViewModel from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";

export default class RelationViewModelStrage {

    private relationIdMap: Map<string, RelationViewModel>;
    private parentTableModelIdMap: Map<string, RelationViewModel[]>;
    private childColumnModels: Set<string>;

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
        this.childColumnModels = new Set(
            relationViewModels.flatMap(
                model => model.relationModel.relationPairs.map(pair => pair.childColumnModelId)
            )
        );
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
        return this.childColumnModels.has(columnModelId);
    }

    public updateRelationModel(updatingModel: RelationModel): RelationViewModelStrage {
        const currentViewModel = this.relationIdMap.get(updatingModel.relationModelId);
        const nextViewModel = (currentViewModel != null)
            ? currentViewModel.updateRelationModel(updatingModel)
            : new RelationViewModel({
                relationModel: updatingModel,
                lineViewModel: new LineViewModel({ strokeWidth: 1 })
            });

        return this.update(nextViewModel);
    }

    public deleteRelation(relationId: string): RelationViewModelStrage {
        const nextRelationIdMap = new Map(this.relationIdMap);
        const deleted = nextRelationIdMap.delete(relationId);
        if (deleted === false) {
            return this;
        }

        return new RelationViewModelStrage(Array.from(nextRelationIdMap.values()));
    }

    public updateLineViewModel(relationId: string, nextLineViewModel: LineViewModel): RelationViewModelStrage {
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

    private update(model: RelationViewModel): RelationViewModelStrage {
        const nextRelationMap = new Map(this.relationIdMap);
        nextRelationMap.set(model.relationId, model);

        return new RelationViewModelStrage(Array.from(nextRelationMap.values()));
    }
}