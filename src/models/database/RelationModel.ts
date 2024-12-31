import { v4 as uuidV4 } from 'uuid';
import { instanceToPlain } from 'class-transformer';

import RelationPair from '~/models/database/RelationPair';
import { PropertyNotExistsError } from '~/models/exceptions';
import { toObjects } from '~/models/util';


export type TableReferenceActionType = "RESTRICT" | "SET NULL" | "CASCADE" | "NO ACTION" | "SET DEFAULT";
export type CardinalityType = "1" | "0..1" | "0..N" | "1..N";

type RelationModelOptions = {
    relationModelId?: string,
    relationName?: string,
    parentTableModelId: string,
    parentCardinality?: CardinalityType,
    childTableModelId: string,
    childCardinality?: CardinalityType,
    relationPairs?: RelationPair[],
    onUpdateAction?: TableReferenceActionType,
    onDeleteAction?: TableReferenceActionType
}

export default class RelationModel {

    public readonly relationModelId: string;
    public readonly relationName: string;
    public readonly parentTableModelId: string;
    public readonly parentCardinality: CardinalityType;
    public readonly childTableModelId: string;
    public readonly childCardinality: CardinalityType;
    public readonly relationPairs: readonly RelationPair[];
    public readonly onUpdateAction: TableReferenceActionType;
    public readonly onDeleteAction: TableReferenceActionType;

    constructor({
        relationModelId = "", relationName = "",
        parentTableModelId, parentCardinality = "1",
        childTableModelId, childCardinality = "1",
        relationPairs = [], onUpdateAction = "RESTRICT", onDeleteAction = "RESTRICT"
    }: RelationModelOptions) {
        this.relationModelId = relationModelId ? relationModelId : uuidV4();
        this.relationName = relationName;
        this.parentTableModelId = parentTableModelId;
        this.parentCardinality = parentCardinality;
        this.childTableModelId = childTableModelId;
        this.childCardinality = childCardinality;
        this.relationPairs = [...relationPairs];
        this.onUpdateAction = onUpdateAction;
        this.onDeleteAction = onDeleteAction;
    }

    public toJSON(): Record<string, unknown> {
        return instanceToPlain(this);
    }

    public static toObject(obj: object): RelationModel {
        if (!("relationModelId" in obj)) {
            throw new PropertyNotExistsError("relationModelId", obj);
        }
        if (!("parentTableModelId" in obj)) {
            throw new PropertyNotExistsError("parentTableModelId", obj);
        }
        if (!("childTableModelId" in obj)) {
            throw new PropertyNotExistsError("childTableModelId", obj);
        }
        if (!("relationPairs" in obj)) {
            throw new PropertyNotExistsError("relationPairs", obj);
        }

        return new RelationModel({
            relationModelId: obj.relationModelId as string,
            relationName: (("relationName" in obj) ? obj.relationName as string : ""),
            parentTableModelId: obj.parentTableModelId as string,
            parentCardinality: (("parentCardinality" in obj)
                ? obj.parentCardinality as CardinalityType : "1"),
            childTableModelId: obj.childTableModelId as string,
            childCardinality: (("childCardinality" in obj)
                ? obj.childCardinality as CardinalityType : "1"),
            relationPairs: toObjects(obj.relationPairs, "relationPairs",
                (value) => RelationPair.toObject(value)),
            onUpdateAction: (("onUpdateAction" in obj)
                ? obj.onUpdateAction as TableReferenceActionType : "RESTRICT"),
            onDeleteAction: (("onDeleteAction" in obj)
                ? obj.onDeleteAction as TableReferenceActionType : "RESTRICT")
        });
    }
}