import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toObjects } from "~/models/util";

export type SortOrderType = "ASC" | "DESC" | "";
export type NullsOrderType = "FIRST" | "LAST" | "";

type TableIndexModelOptions = {
    tableIndexModelId: string,
    physicalName: string,
    indexColumnModels: IndexColumnModel[],
    indexOption?: TableIndexOption,
    indexType?: TableIndexType,
    clustered?: boolean,
    description?: string
};

export default class TableIndexModel {

    public readonly tableIndexModelId: string;
    public readonly physicalName: string;
    public readonly indexColumnModels: readonly IndexColumnModel[];
    public readonly indexOption: TableIndexOption;
    public readonly indexType: TableIndexType;
    public readonly clustered: boolean;
    public readonly description: string

    constructor({
        tableIndexModelId,
        physicalName,
        indexColumnModels,
        indexOption = "",
        indexType = "",
        clustered = false,
        description = ""
    }: TableIndexModelOptions) {
        this.tableIndexModelId = tableIndexModelId;
        this.physicalName = physicalName.trim();
        this.indexColumnModels = [...indexColumnModels] as const;
        this.indexOption = indexOption;
        this.indexType = indexType;
        this.clustered = clustered;
        this.description = description;
    }

    public toJSON(): Record<string, unknown> {
        return {
            tableIndexModelId: this.tableIndexModelId,
            physicalName: this.physicalName,
            indexColumnModels: this.indexColumnModels.map(model => model.toJSON()),
            ...((this.indexOption !== "") && { indexOption: this.indexOption }),
            ...((this.indexType !== "") && { indexType: this.indexType }),
            ...(this.clustered && { clustered: this.clustered }),
            ...((this.description !== "") && { description: this.description })
        };
    }

    public static toObject(obj: object): TableIndexModel {
        if (!("tableIndexModelId" in obj)) {
            throw new PropertyNotExistsError("tableIndexModelId", obj);
        }
        if (!("physicalName" in obj)) {
            throw new PropertyNotExistsError("physicalName", obj);
        }
        if (!("indexColumnModels" in obj)) {
            throw new PropertyNotExistsError("indexColumnModels", obj);
        }

        const indexColumnModels = toObjects(obj.indexColumnModels, "indexColumnModels",
            (value) => IndexColumnModel.toObject(value));

        return new TableIndexModel({
            tableIndexModelId: obj.tableIndexModelId as string,
            physicalName: obj.physicalName as string,
            indexColumnModels: indexColumnModels,
            indexOption: parseIndexOption(obj),
            indexType: ("indexType" in obj) ? obj.indexType as TableIndexType : "",
            clustered: ("clustered" in obj) ? obj.clustered as boolean : false,
            description: ("description" in obj) ? obj.description as string : "",
        });
    }

    public equals(other: TableIndexModel): boolean {
        if (this.tableIndexModelId !== other.tableIndexModelId) {
            return false;
        }
        if (this.physicalName !== other.physicalName) {
            return false;
        }

        if (this.indexColumnModels.length !== other.indexColumnModels.length) {
            return false;
        }
        for (let index = 0; index < this.indexColumnModels.length; index++) {
            const thisColumn = this.indexColumnModels[index];
            const otherColumn = other.indexColumnModels[index];
            if (thisColumn.equals(otherColumn) === false) {
                return false;
            }
        }

        if (this.indexOption !== other.indexOption) {
            return false;
        }
        if (this.indexType !== other.indexType) {
            return false;
        }
        if (this.clustered !== other.clustered) {
            return false;
        }
        if (this.description !== other.description) {
            return false;
        }

        return true;
    }
}

const parseIndexOption = (obj: object) => {
    if ("indexOption" in obj) {
        return obj.indexOption as TableIndexOption;
    }

    // 過去バージョンで typo したフィールド名で保存を行っていたため、互換性のために当時のフィールド名でも取得している
    // cSpell:disable
    if ("indexOptioin" in obj) {
        return obj.indexOptioin as TableIndexOption;
    }
    // cSpell:enable

    return "";
};

type IndexColumnModelOptions = {
    columnModelId: string,
    sortOrderType?: SortOrderType,
    nullsOrderType?: NullsOrderType
};

export class IndexColumnModel {

    public readonly columnModelId: string;
    public readonly sortOrderType: SortOrderType;
    public readonly nullsOrderType: NullsOrderType;

    constructor({
        columnModelId, sortOrderType = "", nullsOrderType = ""
    }: IndexColumnModelOptions) {
        this.columnModelId = columnModelId;
        this.sortOrderType = sortOrderType;
        this.nullsOrderType = nullsOrderType;
    }

    querySort() {
        if (this.sortOrderType === "") {
            return "";
        }

        if (this.nullsOrderType === "") {
            return this.sortOrderType;
        }

        return `${this.sortOrderType} NULLS ${this.nullsOrderType}`;
    }

    public toJSON(): Record<string, unknown> {
        return {
            columnModelId: this.columnModelId,
            ...((this.sortOrderType !== "") && { sortOrderType: this.sortOrderType }),
            ...((this.nullsOrderType !== "") && { nullsOrderType: this.nullsOrderType })
        };
    }

    public static toObject(obj: object): IndexColumnModel {
        if (!("columnModelId" in obj)) {
            throw new PropertyNotExistsError("columnModelId", obj);
        }

        return new IndexColumnModel({
            columnModelId: obj.columnModelId as string,
            sortOrderType: ("sortOrderType" in obj) ? obj.sortOrderType as SortOrderType : "",
            nullsOrderType: ("nullsOrderType" in obj) ? obj.nullsOrderType as NullsOrderType : ""
        });
    }

    public equals(other: IndexColumnModel): boolean {
        if (this.columnModelId !== other.columnModelId) {
            return false;
        }
        if (this.sortOrderType !== other.sortOrderType) {
            return false;
        }
        if (this.nullsOrderType !== other.nullsOrderType) {
            return false;
        }

        return true;
    }
}