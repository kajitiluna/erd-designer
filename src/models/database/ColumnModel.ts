import { v4 as uuidV4 } from 'uuid';

import { PropertyNotExistsError } from "~/models/exceptions";

type ColumnModelOptions = {
    columnModelId?: string,
    columnShareModelId?: string,
    physicalName?: string,
    logicalName?: string,
    primaryKey?: boolean,
    notNull?: boolean,
    unique?: boolean,
    autoIncrement?: boolean,
    defaultValue?: string
}

export default class ColumnModel {

    public readonly columnModelId: string;
    public readonly columnShareModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly primaryKey: boolean;
    public readonly notNull: boolean;
    public readonly unique: boolean;
    public readonly autoIncrement: boolean;
    public readonly defaultValue: string;

    constructor({
        columnModelId = "",
        columnShareModelId = "",
        physicalName = "",
        logicalName = "",
        primaryKey = false,
        notNull = false,
        unique = false,
        autoIncrement = false,
        defaultValue = ""
    }: ColumnModelOptions) {
        this.columnModelId = columnModelId ? columnModelId : uuidV4();
        this.columnShareModelId = columnShareModelId;
        this.physicalName = physicalName.trim();
        this.logicalName = logicalName.trim();
        this.primaryKey = primaryKey;
        this.notNull = notNull;
        this.unique = unique;
        this.autoIncrement = autoIncrement;
        this.defaultValue = defaultValue.trim();
    }

    public toJSON(): Record<string, unknown> {
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

    public static toObject(obj: object): ColumnModel {
        if (!("columnModelId" in obj)) {
            throw new PropertyNotExistsError("columnModelId", obj);
        }
        if (!("columnShareModelId" in obj)) {
            throw new PropertyNotExistsError("columnShareModelId", obj);
        }

        const physicalName = ("physicalName" in obj) ? obj.physicalName as string : "";
        const logicalName = ("logicalName" in obj) ? obj.logicalName as string : "";
        const primaryKey = ("primaryKey" in obj) ? obj.primaryKey as boolean : false;
        const notNull = ("notNull" in obj) ? obj.notNull as boolean : false;
        const unique = ("unique" in obj) ? obj.unique as boolean : false;
        const autoIncrement = ("autoIncrement" in obj) ? obj.autoIncrement as boolean : false;
        const defaultValue = ("defaultValue" in obj) ? obj.defaultValue as string : "";

        return new ColumnModel({
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
}