import { instanceToPlain } from "class-transformer";
import { PropertyNotExistsError } from "~/models/exceptions";

type RelationPairOptions = { parentColumnModelId: string, childColumnModelId: string };

export default class RelationPair {

    public readonly parentColumnModelId: string;
    public readonly childColumnModelId: string;

    constructor({ parentColumnModelId, childColumnModelId }: RelationPairOptions) {
        this.parentColumnModelId = parentColumnModelId;
        this.childColumnModelId = childColumnModelId;
    }

    public toJSON(): Record<string, unknown> {
        return instanceToPlain(this);
    }

    public static toObject(obj: object): RelationPair {
        if (!("parentColumnModelId" in obj)) {
            throw new PropertyNotExistsError("parentColumnModelId", obj);
        }
        if (!("childColumnModelId" in obj)) {
            throw new PropertyNotExistsError("childColumnModelId", obj);
        }

        return new RelationPair({
            parentColumnModelId: obj.parentColumnModelId as string,
            childColumnModelId: obj.childColumnModelId as string
        });
    }
}