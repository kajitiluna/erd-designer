import { v4 as uuidV4 } from 'uuid';

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
        return {
            relationModelId: this.relationModelId,
            ...((this.relationName !== "") && { relationName: this.relationName }),
            parentTableModelId: this.parentTableModelId,
            parentCardinality: this.parentCardinality,
            childTableModelId: this.childTableModelId,
            childCardinality: this.childCardinality,
            relationPairs: this.relationPairs.map(item => item.toJSON()),
            onUpdateAction: this.onUpdateAction,
            onDeleteAction: this.onDeleteAction
        };
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
                value => RelationPair.toObject(value)),
            onUpdateAction: (("onUpdateAction" in obj)
                ? obj.onUpdateAction as TableReferenceActionType : "RESTRICT"),
            onDeleteAction: (("onDeleteAction" in obj)
                ? obj.onDeleteAction as TableReferenceActionType : "RESTRICT")
        });
    }

    public equals(other: RelationModel): boolean {
        if (this.relationModelId !== other.relationModelId) {
            return false;
        }
        if (this.relationName !== other.relationName) {
            return false;
        }
        if (this.parentTableModelId !== other.parentTableModelId) {
            return false;
        }
        if (this.parentCardinality !== other.parentCardinality) {
            return false;
        }
        if (this.childTableModelId !== other.childTableModelId) {
            return false;
        }
        if (this.childCardinality !== other.childCardinality) {
            return false;
        }

        if (this.relationPairs.length !== other.relationPairs.length) {
            return false;
        }
        for (let index = 0; index < this.relationPairs.length; index++) {
            if (!this.relationPairs[index].equals(other.relationPairs[index])) {
                return false;
            }
        }

        if (this.onUpdateAction !== other.onUpdateAction) {
            return false;
        }
        if (this.onDeleteAction !== other.onDeleteAction) {
            return false;
        }

        return true;
    }
}