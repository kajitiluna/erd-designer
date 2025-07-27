import { v4 as uuidV4 } from 'uuid';

import { PropertyNotExistsError } from "~/models/exceptions";

type ColumnGroupModelOptions = {
    columnGroupId?: string,
    groupName?: string,
    columnModelIds?: string[],
    description?: string
}

export default class ColumnGroupModel {

    public readonly columnGroupId: string;
    public readonly groupName: string;
    public readonly columnModelIds: readonly string[];
    public readonly description: string;

    constructor({
        columnGroupId = "", groupName = "", columnModelIds = [], description = ""
    }: ColumnGroupModelOptions) {
        this.columnGroupId = columnGroupId ? columnGroupId : uuidV4();
        this.groupName = groupName.trim();
        this.columnModelIds = columnModelIds;
        this.description = description;
    }

    public toJSON(): Record<string, unknown> {
        return {
            columnGroupId: this.columnGroupId,
            groupName: this.groupName,
            columnModelIds: this.columnModelIds,
            ...((this.description !== "") && { description: this.description })
        };
    }

    public static toObject(obj: object): ColumnGroupModel {
        if (!("columnGroupId" in obj)) {
            throw new PropertyNotExistsError("columnGroupId", obj);
        }
        if (!("groupName" in obj)) {
            throw new PropertyNotExistsError("groupName", obj);
        }
        if (!("columnModelIds" in obj)) {
            throw new PropertyNotExistsError("columnModelIds", obj);
        }

        return new ColumnGroupModel({
            columnGroupId: obj.columnGroupId as string,
            groupName: obj.groupName as string,
            columnModelIds: obj.columnModelIds as string[],
            description: ("description" in obj) ? obj.description as string : ""
        });
    }
}