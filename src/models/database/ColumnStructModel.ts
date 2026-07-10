import { v4 as uuidV4 } from 'uuid';

import { requireProperty } from "~/models/util";

type ColumnStructModelOptions = {
    columnStructId?: string,
    structName?: string,
    columnModelIds?: string[],
    description?: string
}

export default class ColumnStructModel {

    public readonly columnStructId: string;
    public readonly structName: string;
    public readonly columnModelIds: readonly string[];
    public readonly description: string;

    constructor({
        columnStructId = "", structName = "", columnModelIds = [], description = ""
    }: ColumnStructModelOptions) {
        this.columnStructId = columnStructId ? columnStructId : uuidV4();
        this.structName = structName.trim();
        this.columnModelIds = [...columnModelIds];
        this.description = description;
    }

    public toJSON(): Record<string, unknown> {
        return {
            columnStructId: this.columnStructId,
            structName: this.structName,
            columnModelIds: this.columnModelIds,
            ...((this.description !== "") && { description: this.description })
        };
    }

    public static toObject(obj: object): ColumnStructModel {
        requireProperty(obj, "columnStructId");
        requireProperty(obj, "structName");
        requireProperty(obj, "columnModelIds");

        return new ColumnStructModel({
            columnStructId: obj.columnStructId as string,
            structName: obj.structName as string,
            columnModelIds: obj.columnModelIds as string[],
            description: ("description" in obj) ? obj.description as string : ""
        });
    }

    public equals(other: ColumnStructModel): boolean {
        return (
            (this.columnStructId === other.columnStructId)
            && (this.structName === other.structName)
            && (this.description === other.description)
            && (this.columnModelIds.length === other.columnModelIds.length)
            && this.columnModelIds.every((value, index) => (value === other.columnModelIds[index]))
        );
    }
}
