import PerspectiveModel from "~/models/PerspectiveModel";
import { equalsIdSequence, equalsModelMap } from "~/models/storage-support";

class PerspectiveModelStorage {

    private readonly perspectiveIds: string[];

    private readonly perspectiveMap: Map<string, PerspectiveModel>;

    constructor(models: PerspectiveModel[]) {
        this.perspectiveIds = models.map(model => model.perspectiveId);
        this.perspectiveMap = new Map(models.map(model => [model.perspectiveId, model]));
    }

    public findModel(perspectiveId: string): PerspectiveModel | null {
        return this.perspectiveMap.get(perspectiveId) || null;
    }

    public getModels(): PerspectiveModel[] {
        return this.perspectiveIds.map(id => this.perspectiveMap.get(id)!);
    }

    public updateModel(perspective: PerspectiveModel): PerspectiveModelStorage {
        const previous = this.perspectiveMap.get(perspective.perspectiveId);
        if (previous == null) {
            const nextModels = [...this.getModels(), perspective];
            return new PerspectiveModelStorage(nextModels);
        }

        if (previous.equals(perspective) === true) {
            return this;
        }

        const nextModels = this.getModels().map(model => {
            if (model.perspectiveId !== perspective.perspectiveId) {
                return model;
            }

            return perspective;
        });

        return new PerspectiveModelStorage(nextModels);
    }

    public equals(other: PerspectiveModelStorage): boolean {
        if (equalsIdSequence(this.perspectiveIds, other.perspectiveIds) === false) {
            return false;
        }

        return equalsModelMap(this.perspectiveMap, other.perspectiveMap);
    }
}

export default PerspectiveModelStorage;