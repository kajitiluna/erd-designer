import { v4 as uuidV4 } from 'uuid';

import ColumnEntry from '~/models/database/ColumnEntry';
import { requireProperty } from "~/models/util";

type StructColumnShareModelOptions = {
    structShareModelId?: string,
    physicalName?: string,
    logicalName?: string,
    columnEntries?: readonly ColumnEntry[]
    isArray?: boolean,
    description?: string,
}

/**
 * STRUCT 型の再利用可能な型定義を表すモデル。
 * physicalName / logicalName は定義側のデフォルト名で、使用側の ColumnModel (struct バリアント) の
 * 名前が空でない場合はそちらが優先される (overrideColumnName)。
 * 使用位置ごとの属性 (notNull) は ColumnModel 側が保持する。
 * ネストした struct は columnEntries 内の single エントリから struct バリアントの ColumnModel を参照して表現する。
 */
export default class StructColumnShareModel {

    public readonly structShareModelId: string;
    public readonly physicalName: string;
    public readonly logicalName: string;
    public readonly columnEntries: readonly ColumnEntry[];
    public readonly isArray: boolean;
    public readonly description: string;

    constructor({
        structShareModelId = "", physicalName = "", logicalName = "", columnEntries = [],
        isArray = false, description = ""
    }: StructColumnShareModelOptions) {
        this.structShareModelId = structShareModelId ? structShareModelId : uuidV4();
        this.physicalName = physicalName.trim();
        this.logicalName = logicalName.trim();
        this.columnEntries = columnEntries;
        this.isArray = isArray;
        this.description = description.trim();
    }

    /**
     * DDL 等で使用する型表記を返す。
     *
     * @returns isArray が true の場合は "ARRAY<STRUCT>"、それ以外は "STRUCT"
     */
    public simpleColumnType(): string {
        return (this.isArray === true) ? "ARRAY<STRUCT>" : "STRUCT";
    }

    public toJSON(): Record<string, unknown> {
        const columnModelIds = ColumnEntry.serializeEntries(this.columnEntries);

        return {
            structShareModelId: this.structShareModelId,
            physicalName: this.physicalName,
            ...((this.logicalName !== "") && { logicalName: this.logicalName }),
            columnModelIds: columnModelIds,
            ...((this.isArray === true) && { isArray: this.isArray }),
            ...((this.description !== "") && { description: this.description })
        };
    }

    public static toObject(obj: object): StructColumnShareModel {
        requireProperty(obj, "structShareModelId");
        requireProperty(obj, "physicalName");
        requireProperty(obj, "columnModelIds");

        const logicalName = ("logicalName" in obj) ? obj.logicalName as string : "";
        const columnEntries = ColumnEntry.deserializeEntries(obj.columnModelIds as string[]);
        const isArray = ("isArray" in obj) ? obj.isArray as boolean : false;
        const description = ("description" in obj) ? obj.description as string : "";

        return new StructColumnShareModel({
            structShareModelId: obj.structShareModelId as string,
            physicalName: obj.physicalName as string,
            logicalName: logicalName,
            columnEntries: columnEntries,
            isArray: isArray,
            description: description
        });
    }

    public equals(other: StructColumnShareModel): boolean {
        if (this.structShareModelId !== other.structShareModelId) {
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

        return ColumnEntry.equalsEntries(this.columnEntries, other.columnEntries);
    }
}
