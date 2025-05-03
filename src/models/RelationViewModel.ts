import RelationModel from "~/models/database/RelationModel";
import { PropertyNotExistsError } from "~/models/exceptions";
import LineViewModel from "~/models/LineViewModel";
import { toDateTime } from "~/models/util";

type RelationViewModelOptions = {
    relationModel: RelationModel,
    lineViewModel: LineViewModel,
    createdAt?: Date | null
}

export default class RelationViewModel {

    public readonly relationModel: RelationModel;
    public readonly lineViewModel: LineViewModel;
    private readonly createdAt: Date;

    constructor({ relationModel, lineViewModel, createdAt = null }: RelationViewModelOptions) {
        this.relationModel = relationModel;
        this.lineViewModel = lineViewModel;
        this.createdAt = createdAt ? createdAt : new Date();
    }

    get relationId(): string {
        return this.relationModel.relationModelId;
    }

    get parentTableModelId(): string {
        return this.relationModel.parentTableModelId;
    }

    get childTableModelId(): string {
        return this.relationModel.childTableModelId;
    }

    public updateRelationModel(updatingModel: RelationModel): RelationViewModel {
        return new RelationViewModel({
            relationModel: updatingModel,
            lineViewModel: this.lineViewModel,
            createdAt: this.createdAt
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            relationModel: this.relationModel.toJSON(),
            lineViewModel: this.lineViewModel.toJSON(),
            createdAt: this.createdAt
        };
    }

    public static toObject(obj: object): RelationViewModel {
        if (!("relationModel" in obj)) {
            throw new PropertyNotExistsError("relationModel", obj);
        }
        if (!("lineViewModel" in obj)) {
            throw new PropertyNotExistsError("lineViewModel", obj);
        }
        const createdAt = ("createdAt" in obj) ? toDateTime(obj.createdAt) : new Date();

        return new RelationViewModel({
            relationModel: RelationModel.toObject(obj.relationModel as object),
            lineViewModel: LineViewModel.toObject(obj.lineViewModel as object),
            createdAt: createdAt
        });
    }
}