import RelationModel from "~/models/database/RelationModel";
import { PropertyNotExistsError } from "~/models/exceptions";
import LabelViewModel from "~/models/LabelViewModel";
import LineViewModel, { OrthogonalDirection } from "~/models/LineViewModel";
import { toDateTime } from "~/models/util";

export type OrthogonalRelation = { relationId: string, orthogonalLines: OrthogonalDirection[], changedIndex: number };

type RelationViewModelOptions = {
    relationModel: RelationModel,
    lineViewModel: LineViewModel,
    labelViewModel?: LabelViewModel | null,
    createdAt?: Date | null
}

export default class RelationViewModel {

    public readonly relationModel: RelationModel;
    public readonly lineViewModel: LineViewModel;
    public readonly labelViewModel: LabelViewModel;
    public readonly createdAt: Date;

    constructor({ relationModel, lineViewModel, labelViewModel = null, createdAt = null }: RelationViewModelOptions) {
        this.relationModel = relationModel;
        this.lineViewModel = lineViewModel;
        this.labelViewModel = labelViewModel ?? new LabelViewModel({ label: relationModel.relationName });
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
        const nextLabel = (updatingModel.relationName === this.labelViewModel.label)
            ? this.labelViewModel : new LabelViewModel({ ...this.labelViewModel, label: updatingModel.relationName });

        return new RelationViewModel({
            relationModel: updatingModel,
            lineViewModel: this.lineViewModel,
            labelViewModel: nextLabel,
            createdAt: this.createdAt
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            relationModel: this.relationModel.toJSON(),
            lineViewModel: this.lineViewModel.toJSON(),
            ...((this.labelViewModel.label != "") && { labelViewModel: this.labelViewModel.toJSON() }),
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

        const labelView = ("labelViewModel" in obj) ? LabelViewModel.toObject(obj.labelViewModel as object) : null;
        const createdAt = ("createdAt" in obj) ? toDateTime(obj.createdAt) : new Date();

        return new RelationViewModel({
            relationModel: RelationModel.toObject(obj.relationModel as object),
            lineViewModel: LineViewModel.toObject(obj.lineViewModel as object),
            labelViewModel: labelView,
            createdAt: createdAt
        });
    }

    public equals(other: RelationViewModel): boolean {
        return this.relationModel.equals(other.relationModel)
            && this.lineViewModel.equals(other.lineViewModel)
            && this.labelViewModel.equals(other.labelViewModel);
    }
}