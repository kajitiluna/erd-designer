import { v4 as uuidV4 } from 'uuid';

import { requireProperty } from "~/models/util";

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
        this.columnModelIds = [...columnModelIds];
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
        requireProperty(obj, "columnGroupId");
        requireProperty(obj, "groupName");
        requireProperty(obj, "columnModelIds");

        return new ColumnGroupModel({
            columnGroupId: obj.columnGroupId as string,
            groupName: obj.groupName as string,
            columnModelIds: obj.columnModelIds as string[],
            description: ("description" in obj) ? obj.description as string : ""
        });
    }

    public equals(other: ColumnGroupModel): boolean {
        return (
            (this.columnGroupId === other.columnGroupId)
            && (this.groupName === other.groupName)
            && (this.description === other.description)
            && (this.columnModelIds.length === other.columnModelIds.length)
            && this.columnModelIds.every((value, index) => (value === other.columnModelIds[index]))
        );
    }
}