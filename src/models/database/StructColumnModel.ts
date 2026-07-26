import { v4 as uuidV4 } from 'uuid';

import { requireProperty } from '~/models/util';

type StructColumnModelOptions = {
    columnModelId?: string, physicalName?: string, logicalName?: string, notNull?: boolean,
    structShareModelId: string
};

/** STRUCT カラム。structColumnShareModelId で StructColumnShareModel (再利用可能な型定義) を参照する。 */
export default class StructColumnModel {

    public readonly entityType = "struct" as const;
    public readonly columnModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly notNull: boolean;
    public readonly structShareModelId: string;

    constructor(options: StructColumnModelOptions) {
        this.columnModelId = options.columnModelId ? options.columnModelId : uuidV4();
        this.physicalName = (options.physicalName ?? "").trim();
        this.logicalName = (options.logicalName ?? "").trim();
        this.notNull = options.notNull ?? false;
        this.structShareModelId = options.structShareModelId;
    }

    public toJSON(): Record<string, unknown> {
        return {
            columnModelId: this.columnModelId,
            entityType: "struct",
            structShareModelId: this.structShareModelId,
            ...((this.physicalName !== "") && { physicalName: this.physicalName }),
            ...((this.logicalName !== "") && { logicalName: this.logicalName }),
            ...(this.notNull && { notNull: this.notNull })
        };
    }

    public static toObject(obj: object): StructColumnModel {
        requireProperty(obj, "columnModelId");
        requireProperty(obj, "structShareModelId");

        const physicalName = ("physicalName" in obj) ? obj.physicalName as string : "";
        const logicalName = ("logicalName" in obj) ? obj.logicalName as string : "";
        const notNull = ("notNull" in obj) ? obj.notNull as boolean : false;

        return new StructColumnModel({
            columnModelId: obj.columnModelId as string,
            physicalName: physicalName,
            logicalName: logicalName,
            notNull: notNull,
            structShareModelId: obj.structShareModelId as string
        });
    }

    public equals(other: StructColumnModel): boolean {
        return (this.columnModelId === other.columnModelId)
            && (this.physicalName === other.physicalName)
            && (this.logicalName === other.logicalName)
            && (this.notNull === other.notNull)
            && (this.structShareModelId === other.structShareModelId);
    }
}
