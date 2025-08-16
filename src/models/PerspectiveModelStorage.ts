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
}

export default PerspectiveModelStorage;