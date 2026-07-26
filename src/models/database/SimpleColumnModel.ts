import { v4 as uuidV4 } from 'uuid';

import { requireProperty } from '~/models/util';

type SimpleColumnModelOptions = {
    columnModelId?: string, physicalName?: string, logicalName?: string, notNull?: boolean,
    columnShareModelId: string,
    primaryKey?: boolean, unique?: boolean, autoIncrement?: boolean, defaultValue?: string
};

/** 通常カラム。columnShareModelId で ColumnShareModel を参照し、PK・UNIQUE 等の属性を持つ。 */
export default class SimpleColumnModel {

    public readonly entityType = "simple" as const;
    public readonly columnModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly notNull: boolean;
    public readonly columnShareModelId: string;
    public readonly primaryKey: boolean;
    public readonly unique: boolean;
    public readonly autoIncrement: boolean;
    public readonly defaultValue: string;

    constructor(options: SimpleColumnModelOptions) {
        this.columnModelId = options.columnModelId ? options.columnModelId : uuidV4();
        this.physicalName = (options.physicalName ?? "").trim();
        this.logicalName = (options.logicalName ?? "").trim();
        this.notNull = options.notNull ?? false;
        this.columnShareModelId = options.columnShareModelId;
        this.primaryKey = options.primaryKey ?? false;
        this.unique = options.unique ?? false;
        this.autoIncrement = options.autoIncrement ?? false;
        this.defaultValue = (options.defaultValue ?? "").trim();
    }

    public toJSON(): Record<string, unknown> {
        // entityType は struct 判別子。simple はキーを省略する。
        return {
            columnModelId: this.columnModelId,
            columnShareModelId: this.columnShareModelId,
            ...((this.physicalName !== "") && { physicalName: this.physicalName }),
            ...((this.logicalName !== "") && { logicalName: this.logicalName }),
            ...(this.primaryKey && { primaryKey: this.primaryKey }),
            ...(this.notNull && { notNull: this.notNull }),
            ...(this.unique && { unique: this.unique }),
            ...(this.autoIncrement && { autoIncrement: this.autoIncrement }),
            ...((this.defaultValue !== "") && { defaultValue: this.defaultValue })
        };
    }

    public static toObject(obj: object): SimpleColumnModel {
        requireProperty(obj, "columnModelId");
        requireProperty(obj, "columnShareModelId");

        const physicalName = ("physicalName" in obj) ? obj.physicalName as string : "";
        const logicalName = ("logicalName" in obj) ? obj.logicalName as string : "";
        const notNull = ("notNull" in obj) ? obj.notNull as boolean : false;
        const primaryKey = ("primaryKey" in obj) ? obj.primaryKey as boolean : false;
        const unique = ("unique" in obj) ? obj.unique as boolean : false;
        const autoIncrement = ("autoIncrement" in obj) ? obj.autoIncrement as boolean : false;
        const defaultValue = ("defaultValue" in obj) ? obj.defaultValue as string : "";

        return new SimpleColumnModel({
            columnModelId: obj.columnModelId as string,
            columnShareModelId: obj.columnShareModelId as string,
            physicalName: physicalName,
            logicalName: logicalName,
            primaryKey: primaryKey,
            notNull: notNull,
            unique: unique,
            autoIncrement: autoIncrement,
            defaultValue: defaultValue
        });
    }

    public equals(other: SimpleColumnModel): boolean {
        return (this.columnModelId === other.columnModelId)
            && (this.physicalName === other.physicalName)
            && (this.logicalName === other.logicalName)
            && (this.notNull === other.notNull)
            && (this.columnShareModelId === other.columnShareModelId)
            && (this.primaryKey === other.primaryKey)
            && (this.unique === other.unique)
            && (this.autoIncrement === other.autoIncrement)
            && (this.defaultValue === other.defaultValue);
    }
}
