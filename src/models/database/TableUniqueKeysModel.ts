import { SortOrderType } from "~/models/database/ValueType";
import { PropertyNotExistsError } from "~/models/exceptions";
import { toObjects } from "~/models/util";

type TableUniqueKeysModelOptions = {
    tableUniqueKeysModelId: string,
    uniqueKeysColumnModels: UniqueKeysColumnModel[],
    description?: string
}

export default class TableUniqueKeysModel {

    public readonly tableUniqueKeysModelId: string;
    public readonly uniqueKeysColumnModels: readonly UniqueKeysColumnModel[];
    public readonly description: string;

    constructor({
        tableUniqueKeysModelId,
        uniqueKeysColumnModels,
        description = ""
    }: TableUniqueKeysModelOptions) {
        this.tableUniqueKeysModelId = tableUniqueKeysModelId;
        this.uniqueKeysColumnModels = uniqueKeysColumnModels;
        this.description = description;
    }

    public static filterColumns(
        uniqueKeysModels: TableUniqueKeysModel[] | readonly TableUniqueKeysModel[],
        filterCondition: (column: UniqueKeysColumnModel) => boolean
    ): { tableUniqueKeysModels: TableUniqueKeysModel[], hasChanged: boolean } {
        let hasChanged = false;

        const nextUniqueKeysModels = uniqueKeysModels.flatMap(uniqueKeysModel => {
            const nextColumns = uniqueKeysModel.uniqueKeysColumnModels.filter(filterCondition);
            if (nextColumns.length === uniqueKeysModel.uniqueKeysColumnModels.length) {
                return [uniqueKeysModel];
            }

            hasChanged = true;
            if (nextColumns.length === 0) {
                return [];
            }

            return [
                new TableUniqueKeysModel({
                    ...uniqueKeysModel,
                    uniqueKeysColumnModels: nextColumns
                })
            ];
        });

        return { tableUniqueKeysModels: nextUniqueKeysModels, hasChanged };
    }

    public toJSON(): Record<string, unknown> {
        return {
            tableUniqueKeysModelId: this.tableUniqueKeysModelId,
            uniqueKeysColumnModels: this.uniqueKeysColumnModels.map(model => model.toJSON()),
            ...((this.description !== "") && { description: this.description })
        };
    }

    public static toObject(obj: object): TableUniqueKeysModel {
        if (!("tableUniqueKeysModelId" in obj)) {
            throw new PropertyNotExistsError("tableUniqueKeysModelId", obj);
        }
        if (!("uniqueKeysColumnModels" in obj)) {
            throw new PropertyNotExistsError("uniqueKeysColumnModels", obj);
        }

        const uniqueKeysColumnModels = toObjects(obj.uniqueKeysColumnModels, "uniqueKeysColumnModels",
            value => UniqueKeysColumnModel.toObject(value));

        return new TableUniqueKeysModel({
            tableUniqueKeysModelId: obj.tableUniqueKeysModelId as string,
            uniqueKeysColumnModels: uniqueKeysColumnModels,
            description: ("description" in obj) ? obj.description as string : "",
        });
    }

    public equals(other: TableUniqueKeysModel): boolean {
        if (this.tableUniqueKeysModelId !== other.tableUniqueKeysModelId) {
            return false;
        }

        if (this.uniqueKeysColumnModels.length !== other.uniqueKeysColumnModels.length) {
            return false;
        }
        for (let index = 0; index < this.uniqueKeysColumnModels.length; index++) {
            const thisColumn = this.uniqueKeysColumnModels[index];
            const otherColumn = other.uniqueKeysColumnModels[index];
            if (thisColumn.equals(otherColumn) === false) {
                return false;
            }
        }

        if (this.description !== other.description) {
            return false;
        }

        return true;
    }
}

type UniqueKeysColumnModelOptions = {
    columnModelId: string,
    sortOrderType: SortOrderType
}

export class UniqueKeysColumnModel {

    public readonly columnModelId: string;
    public readonly sortOrderType: SortOrderType;

    constructor({
        columnModelId,
        sortOrderType
    }: UniqueKeysColumnModelOptions) {
        this.columnModelId = columnModelId;
        this.sortOrderType = sortOrderType;
    }

    public toJSON(): Record<string, unknown> {
        return {
            columnModelId: this.columnModelId,
            ...((this.sortOrderType !== "") && { sortOrderType: this.sortOrderType }),
        };
    }

    public static toObject(obj: object): UniqueKeysColumnModel {
        if (!("columnModelId" in obj)) {
            throw new PropertyNotExistsError("columnModelId", obj);
        }

        return new UniqueKeysColumnModel({
            columnModelId: obj.columnModelId as string,
            sortOrderType: ("sortOrderType" in obj) ? obj.sortOrderType as SortOrderType : "",
        });
    }

    public equals(other: UniqueKeysColumnModel): boolean {
        if (this.columnModelId !== other.columnModelId) {
            return false;
        }
        if (this.sortOrderType !== other.sortOrderType) {
            return false;
        }

        return true;
    }
}