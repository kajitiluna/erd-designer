import { v4 as uuidV4 } from 'uuid';

import { ColumnEntry, deserializeColumnEntries, serializeColumnEntries } from '~/models/database/TableModel';
import { requireProperty } from "~/models/util";

type ColumnStructModelOptions = {
    columnStructId?: string,
    physicalName?: string,
    logicalName?: string,
    columnEntries?: readonly ColumnEntry[]
    notNull?: boolean,
    isArray?: boolean,
    description?: string,
}

export default class ColumnStructModel {

    public readonly columnStructId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly columnEntries: readonly ColumnEntry[];
    public readonly notNull: boolean;
    public readonly isArray: boolean;
    public readonly description: string;

    constructor({
        columnStructId = "", physicalName = "", logicalName = "", columnEntries = [],
        notNull = false, isArray = false, description = ""
    }: ColumnStructModelOptions) {
        this.columnStructId = columnStructId ? columnStructId : uuidV4();
        this.physicalName = physicalName.trim();
        this.logicalName = logicalName.trim();
        this.columnEntries = columnEntries;
        this.notNull = notNull;
        this.isArray = isArray;
        this.description = description.trim();
    }

    /**
     * DDL 等で使用する型表記を返す。
     *
     * @returns isArray が true の場合は "ARRAY<STRUCT>"、それ以外は "STRUCT"
     */
    public displayTypeQuery(): string {
        return (this.isArray === true) ? "ARRAY<STRUCT>" : "STRUCT";
    }

    public toJSON(): Record<string, unknown> {
        const columnModelIds = serializeColumnEntries(this.columnEntries);

        return {
            columnStructId: this.columnStructId,
            physicalName: this.physicalName,
            ...((this.logicalName !== "") && { logicalName: this.logicalName }),
            ...((this.description !== "") && { description: this.description }),
            ...((this.isArray === true) && { isArray: this.isArray }),
            ...((this.notNull === true) && { notNull: this.notNull }),
            columnModelIds: columnModelIds
        };
    }

    public static toObject(obj: object): ColumnStructModel {
        requireProperty(obj, "columnStructId");
        requireProperty(obj, "physicalName");
        requireProperty(obj, "columnModelIds");

        const logicalName = ("logicalName" in obj) ? obj.logicalName as string : "";
        const columnEntries = deserializeColumnEntries(obj.columnModelIds as string[]);
        const notNull = ("notNull" in obj) ? obj.notNull as boolean : false;
        const isArray = ("isArray" in obj) ? obj.isArray as boolean : false;
        const description = ("description" in obj) ? obj.description as string : "";

        return new ColumnStructModel({
            columnStructId: obj.columnStructId as string,
            physicalName: obj.physicalName as string,
            logicalName: logicalName,
            columnEntries: columnEntries,
            notNull: notNull,
            isArray: isArray,
            description: description
        });
    }

    public equals(other: ColumnStructModel): boolean {
        if (this.columnStructId !== other.columnStructId) {
            return false;
        }
        if (this.physicalName !== other.physicalName) {
            return false;
        }
        if (this.logicalName !== other.logicalName) {
            return false;
        }
        if (this.description !== other.description) {
            return false;
        }
        if (this.isArray !== other.isArray) {
            return false;
        }
        if (this.notNull !== other.notNull) {
            return false;
        }

        if (this.columnEntries.length !== other.columnEntries.length) {
            return false;
        }
        for (let index = 0; index < this.columnEntries.length; index++) {
            const thisColumn = this.columnEntries[index];
            const otherColumn = other.columnEntries[index];
            if (thisColumn.modelType !== otherColumn.modelType) {
                return false;
            }
            if ((thisColumn.modelType === "single") && (otherColumn.modelType === "single")
                && (thisColumn.columnModelId !== otherColumn.columnModelId)) {
                return false;
            } else if ((thisColumn.modelType === "group") && (otherColumn.modelType === "group")
                && (thisColumn.columnGroupId !== otherColumn.columnGroupId)) {
                return false;
            } else if ((thisColumn.modelType === "struct") && (otherColumn.modelType === "struct")
                && (thisColumn.columnStructId !== otherColumn.columnStructId)) {
                return false;
            }
        }

        return true;
    }
}
