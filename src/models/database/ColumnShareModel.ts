import ColumnType from "~/models/database/ColumnType";
import { Database } from "~/models/database/DatabaseType";
import DisplayStyle from "~/models/database/DisplayStyle";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toDateTime } from "~/models/util";

type ColumnShareModelOptions = {
    columnShareModelId: string,
    physicalName: string,
    logicalName: string,
    columnType: ColumnType,
    precision?: string,
    scale?: string,
    unsigned?: boolean,
    defaultValue?: string,
    description?: string,
    createdAt?: Date | null
}

type ColumnShareQueryType = {
    database: Database,
    notNull?: boolean
    autoIncrement?: boolean,
    inChildRelation?: boolean
};

export default class ColumnShareModel {

    public readonly columnShareModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly columnType: ColumnType;
    public readonly precision: string;
    public readonly scale: string;
    public readonly unsigned: boolean;
    public readonly defaultValue: string;
    public readonly description: string;
    private readonly createdAt: Date;

    constructor({
        columnShareModelId,
        physicalName,
        logicalName,
        columnType,
        precision = "",
        scale = "",
        unsigned = false,
        defaultValue = "",
        description = "",
        createdAt = null }: ColumnShareModelOptions
    ) {
        this.columnShareModelId = columnShareModelId;
        this.physicalName = physicalName;
        this.logicalName = logicalName;
        this.columnType = columnType;
        this.precision = columnType.withPrecision ? precision : "";
        this.scale = columnType.withScale ? scale : "";
        this.unsigned = columnType.withUnsigned ? unsigned : false;
        this.defaultValue = defaultValue;
        this.description = description;
        this.createdAt = createdAt ? createdAt : new Date();
    }

    public query({
        database, notNull = false, autoIncrement = false, inChildRelation = false
    }: ColumnShareQueryType): string {

        return `${database.escape(this.physicalName)} ` + this.columnType.query(
            {
                precision: this.precision,
                scale: this.scale,
                onNotNull: notNull,
                defaultValue: this.defaultValue,
                onUnsigned: this.unsigned,
                onAutoIncrement: autoIncrement,
                inChildRelation
            }
        );
    }

    public displayName(displayStyle: DisplayStyle): string {
        return displayStyle.displayName(this.physicalName, this.logicalName);
    }

    public specifiedColumnType(inChildRelation: boolean = false): string {
        return this.columnType.specifiedType({ precision: this.precision, scale: this.scale, inChildRelation });
    }

    public matchForReferenceType(parent: ColumnShareModel): boolean {
        const columnType = this.specifiedColumnType()
        const parentColumnType = parent.specifiedColumnType(true);
        if (columnType !== parentColumnType) {
            return false;
        }

        if (this.columnType.withUnsigned && (this.unsigned !== parent.unsigned)) {
            return false;
        }

        return true;
    }


    public toJSON(): Record<string, unknown> {
        return {
            columnShareModelId: this.columnShareModelId,
            physicalName: this.physicalName,
            logicalName: this.logicalName,
            columnTypeId: this.columnType.id,
            precision: this.precision,
            scale: this.scale,
            unsigned: this.unsigned,
            defaultValue: this.defaultValue,
            description: this.description,
            createdAt: this.createdAt
        };
    }

    public static toObject(obj: object, toColumnType: (columnTypeId: number) => ColumnType) {
        if (!("columnShareModelId" in obj)) {
            throw new PropertyNotExistsError("columnShareModelId", obj);
        }
        if (!("physicalName" in obj)) {
            throw new PropertyNotExistsError("physicalName", obj);
        }
        if (!("logicalName" in obj)) {
            throw new PropertyNotExistsError("logicalName", obj);
        }
        if (!("columnTypeId" in obj)) {
            throw new PropertyNotExistsError("columnTypeId", obj);
        }
        if (!("precision" in obj)) {
            throw new PropertyNotExistsError("precision", obj);
        }
        if (!("scale" in obj)) {
            throw new PropertyNotExistsError("scale", obj);
        }
        if (!("unsigned" in obj)) {
            throw new PropertyNotExistsError("unsigned", obj);
        }
        if (!("defaultValue" in obj)) {
            throw new PropertyNotExistsError("defaultValue", obj);
        }
        if (!("description" in obj)) {
            throw new PropertyNotExistsError("description", obj);
        }

        return new ColumnShareModel({
            columnShareModelId: obj.columnShareModelId as string,
            physicalName: obj.physicalName as string,
            logicalName: obj.logicalName as string,
            columnType: toColumnType(obj.columnTypeId as number),
            precision: obj.precision as string,
            scale: obj.scale as string,
            unsigned: obj.unsigned as boolean,
            defaultValue: obj.defaultValue as string,
            description: obj.description as string,
            createdAt: ("createdAt" in obj) ? toDateTime(obj.createdAt) : new Date()
        });
    }
}