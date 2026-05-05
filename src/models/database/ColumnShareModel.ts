import ColumnType from "~/models/database/ColumnType";
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
    isArray?: boolean,
    description?: string,
    characterSet?: string,
    collate?: string,
    optionExpression?: string,
    createdAt?: Date | null
}

export default class ColumnShareModel {

    public readonly columnShareModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly columnType: ColumnType;
    public readonly precision: string;
    public readonly scale: string;
    public readonly unsigned: boolean;
    public readonly isArray: boolean;
    public readonly description: string;
    public readonly characterSet: string;
    public readonly collate: string;
    public readonly optionExpression: string;
    private readonly createdAt: Date;

    constructor({
        columnShareModelId, physicalName, logicalName,
        columnType, precision = "", scale = "", unsigned = false, isArray = false,
        description = "", characterSet = "", collate = "", optionExpression = "", createdAt = null
    }: ColumnShareModelOptions) {

        this.columnShareModelId = columnShareModelId;
        this.physicalName = physicalName;
        this.logicalName = logicalName;
        this.columnType = columnType;
        this.precision = columnType.withPrecision ? precision : "";
        this.scale = columnType.withScale ? scale : "";
        this.unsigned = columnType.withUnsigned ? unsigned : false;
        this.isArray = isArray;
        this.description = description.trim();
        this.characterSet = characterSet.trim();
        this.collate = collate.trim();
        this.optionExpression = optionExpression.trim();
        this.createdAt = createdAt ? createdAt : new Date();
    }

    public specifiedColumnType(inChildRelation: boolean = false): string {
        return this.columnType.specifiedType({
            precision: this.precision, scale: this.scale,
            isArray: this.isArray, inChildRelation
        });
    }

    public matchForReferenceType(parent: ColumnShareModel): boolean {
        const columnType = this.specifiedColumnType(true)
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
            ...((this.precision !== "") && { precision: this.precision }),
            ...((this.scale !== "") && { scale: this.scale }),
            ...(this.unsigned && { unsigned: this.unsigned }),
            ...(this.isArray && { isArray: this.isArray }),
            ...((this.description !== "") && { description: this.description }),
            ...((this.characterSet !== "") && { characterSet: this.characterSet }),
            ...((this.collate !== "") && { collate: this.collate }),
            ...((this.optionExpression !== "") && { optionExpression: this.optionExpression }),
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

        return new ColumnShareModel({
            columnShareModelId: obj.columnShareModelId as string,
            physicalName: obj.physicalName as string,
            logicalName: obj.logicalName as string,
            columnType: toColumnType(obj.columnTypeId as number),
            precision: ("precision" in obj) ? (obj.precision as string) : "",
            scale: ("scale" in obj) ? (obj.scale as string) : "",
            unsigned: ("unsigned" in obj) ? (obj.unsigned as boolean) : false,
            isArray: ("isArray" in obj) ? (obj.isArray as boolean) : false,
            description: ("description" in obj) ? (obj.description as string) : "",
            characterSet: ("characterSet" in obj) ? (obj.characterSet as string) : "",
            collate: ("collate" in obj) ? (obj.collate as string) : "",
            optionExpression: ("optionExpression" in obj) ? (obj.optionExpression as string) : "",
            createdAt: ("createdAt" in obj) ? toDateTime(obj.createdAt) : new Date()
        });
    }

    public equals(other: ColumnShareModel): boolean {
        return (
            (this.columnShareModelId === other.columnShareModelId)
            && (this.physicalName === other.physicalName)
            && (this.logicalName === other.logicalName)
            && (this.columnType.id === other.columnType.id)
            && (this.precision === other.precision)
            && (this.scale === other.scale)
            && (this.unsigned === other.unsigned)
            && (this.isArray === other.isArray)
            && (this.description === other.description)
            && (this.characterSet === other.characterSet)
            && (this.collate === other.collate)
            && (this.optionExpression === other.optionExpression)
        );
    }
}