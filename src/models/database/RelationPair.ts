import { requireProperty } from "~/models/util";

type RelationPairOptions = { parentColumnModelId: string, childColumnModelId: string };

export default class RelationPair {

    public readonly parentColumnModelId: string;
    public readonly childColumnModelId: string;

    constructor({ parentColumnModelId, childColumnModelId }: RelationPairOptions) {
        this.parentColumnModelId = parentColumnModelId;
        this.childColumnModelId = childColumnModelId;
    }

    public toJSON(): Record<string, unknown> {
        return {
            parentColumnModelId: this.parentColumnModelId,
            childColumnModelId: this.childColumnModelId
        };
    }

    public static toObject(obj: object): RelationPair {
        requireProperty(obj, "parentColumnModelId");
        requireProperty(obj, "childColumnModelId");

        return new RelationPair({
            parentColumnModelId: obj.parentColumnModelId as string,
            childColumnModelId: obj.childColumnModelId as string
        });
    }

    public equals(other: RelationPair): boolean {
        return (this.parentColumnModelId === other.parentColumnModelId)
            && (this.childColumnModelId === other.childColumnModelId);
    }
}