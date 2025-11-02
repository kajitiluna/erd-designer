import PerspectiveModel from "~/models/PerspectiveModel";

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

    public equals(other: PerspectiveModelStorage): boolean {
        const thisIds = this.perspectiveIds;
        const otherIds = other.perspectiveIds;

        if (thisIds.length !== otherIds.length) {
            return false;
        }

        for (let index = 0; index < thisIds.length; index++) {
            if (thisIds[index] !== otherIds[index]) {
                return false;
            }

            const thisModel = this.perspectiveMap.get(thisIds[index])!;
            const otherModel = other.perspectiveMap.get(otherIds[index])!;

            if (!thisModel.equals(otherModel)) {
                return false;
            }
        }

        return true;
    }
}

export default PerspectiveModelStorage;