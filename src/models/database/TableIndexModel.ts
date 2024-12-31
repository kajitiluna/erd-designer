import { instanceToPlain } from "class-transformer";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toObjects } from "~/models/util";


export type SortOrderType = "ASC" | "DESC" | "";
export type NullsOrderType = "FIRST" | "LAST" | "";

type TableIndexModelOptions = {
    tableIndexModelId: string,
    physicalName: string,
    indexColumnModels: IndexColumnModel[],
    indexOptioin?: TableIndexOption,
    indexType?: TableIndexType,
    description?: string
};

export default class TableIndexModel {

    public readonly tableIndexModelId: string;
    public readonly physicalName: string;
    public readonly indexColumnModels: readonly IndexColumnModel[];
    public readonly indexOptioin: TableIndexOption;
    public readonly indexType: TableIndexType;
    public readonly description: string

    constructor({
        tableIndexModelId,
        physicalName,
        indexColumnModels,
        indexOptioin = "",
        indexType = "",
        description = ""
    }: TableIndexModelOptions) {
        this.tableIndexModelId = tableIndexModelId;
        this.physicalName = physicalName;
        this.indexColumnModels = [...indexColumnModels];
        this.indexOptioin = indexOptioin;
        this.indexType = indexType;
        this.description = description;
    }

    public toJSON(): Record<string, unknown> {
        return {
            tableIndexModelId: this.tableIndexModelId,
            physicalName: this.physicalName,
            indexColumnModels: this.indexColumnModels.map((model) => model.toJSON()),
            indexOptioin: this.indexOptioin,
            indexType: this.indexType,
            description: this.description
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
            indexOptioin: ("indexOptioin" in obj) ? obj.indexOptioin as TableIndexOption : "",
            indexType: ("indexType" in obj) ? obj.indexType as TableIndexType : "",
            description: ("description" in obj) ? obj.description as string : "",
        });
    }
}

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
        return instanceToPlain(this);
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
}