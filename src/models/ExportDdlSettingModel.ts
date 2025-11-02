import { PropertyNotExistsError } from "~/models/exceptions";

type ExportDdlSettingModelOptions = {
    fileName: string,
    withTable?: boolean,
    withIndex?: boolean,
    withForeignKey?: boolean,
    withComment?: boolean,
    withSchema?: boolean
};

export default class ExportDdlSettingModel {

    public readonly fileName: string;
    public readonly withTable: boolean;
    public readonly withIndex: boolean;
    public readonly withForeignKey: boolean;
    public readonly withComment: boolean;
    public readonly withSchema: boolean;

    constructor({
        fileName, withTable = true, withIndex = true, withForeignKey = true, withComment = true,
        withSchema = true
    }: ExportDdlSettingModelOptions) {
        this.fileName = fileName;
        this.withTable = withTable;
        this.withIndex = withIndex;
        this.withForeignKey = withForeignKey;
        this.withComment = withComment;
        this.withSchema = withSchema;
    }

    public equals(other: ExportDdlSettingModel): boolean {
        if (this.fileName !== other.fileName) {
            return false;
        }

        if (this.withTable !== other.withTable) {
            return false;
        }
        if (this.withIndex !== other.withIndex) {
            return false;
        }
        if (this.withForeignKey !== other.withForeignKey) {
            return false;
        }
        if (this.withComment !== other.withComment) {
            return false;
        }
        if (this.withSchema !== other.withSchema) {
            return false;
        }

        return true;
    }

    public toJSON(): Record<string, unknown> {
        return {
            fileName: this.fileName,
            withTable: this.withTable,
            withIndex: this.withIndex,
            withForeignKey: this.withForeignKey,
            withComment: this.withComment,
            withSchema: this.withSchema
        };
    }

    public static toObject(obj: object): ExportDdlSettingModel {
        if (!("fileName" in obj)) {
            throw new PropertyNotExistsError("fileName", obj);
        }

        const withTable = ("withTable" in obj) ? obj.withTable as boolean : true;
        const withIndex = ("withIndex" in obj) ? obj.withIndex as boolean : true;
        const withForeignKey = ("withForeignKey" in obj) ? obj.withForeignKey as boolean : true;
        const withComment = ("withComment" in obj) ? obj.withComment as boolean : true;
        const withSchema = ("withSchema" in obj) ? obj.withSchema as boolean : false;

        return new ExportDdlSettingModel({
            fileName: obj.fileName as string,
            withTable, withIndex, withForeignKey, withComment, withSchema
        });
    }
}