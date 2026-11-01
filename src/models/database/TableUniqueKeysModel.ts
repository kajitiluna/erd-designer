import { v4 as uuidV4 } from "uuid";

import { SortOrderType } from "~/models/database/ValueType";
import { requireProperty, toObjects } from "~/models/util";

type TableUniqueKeysModelOptions = {
    tableUniqueKeysModelId: string,
    physicalName?: string,
    uniqueKeysColumnModels: UniqueKeysColumnModel[],
    description?: string
}

export default class TableUniqueKeysModel {

    public readonly tableUniqueKeysModelId: string;
    public readonly physicalName: string;
    public readonly uniqueKeysColumnModels: readonly UniqueKeysColumnModel[];
    public readonly description: string;

    constructor({
        tableUniqueKeysModelId,
        physicalName = "",
        uniqueKeysColumnModels,
        description = ""
    }: TableUniqueKeysModelOptions) {
        this.tableUniqueKeysModelId = tableUniqueKeysModelId;
        this.physicalName = physicalName.trim();
        this.uniqueKeysColumnModels = [...uniqueKeysColumnModels];
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

    /**
     * Creates a copy with a newly issued tableUniqueKeysModelId.
     *
     * @param args.physicalName name of the copy
     * @param args.columnModelIdMap original columnModelId to duplicated columnModelId.
     *      Columns absent from the map (e.g. members of a Column Group) keep referencing the original.
     */
    public duplicate(
        args: { physicalName: string, columnModelIdMap: ReadonlyMap<string, string> }
    ): TableUniqueKeysModel {
        const { physicalName, columnModelIdMap } = args;
        const uniqueKeysColumnModels = this.uniqueKeysColumnModels.map(column => column.duplicate(columnModelIdMap));

        return new TableUniqueKeysModel({
            ...this,
            tableUniqueKeysModelId: uuidV4(),
            physicalName,
            uniqueKeysColumnModels
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            tableUniqueKeysModelId: this.tableUniqueKeysModelId,
            ...((this.physicalName !== "") && { physicalName: this.physicalName }),
            uniqueKeysColumnModels: this.uniqueKeysColumnModels.map(model => model.toJSON()),
            ...((this.description !== "") && { description: this.description })
        };
    }

    public static toObject(obj: object): TableUniqueKeysModel {
        requireProperty(obj, "tableUniqueKeysModelId");
        requireProperty(obj, "uniqueKeysColumnModels");

        const physicalName = ("physicalName" in obj) ? obj.physicalName as string : "";
        const uniqueKeysColumnModels = toObjects(obj.uniqueKeysColumnModels, "uniqueKeysColumnModels",
            value => UniqueKeysColumnModel.toObject(value));

        return new TableUniqueKeysModel({
            tableUniqueKeysModelId: obj.tableUniqueKeysModelId as string,
            physicalName: physicalName,
            uniqueKeysColumnModels: uniqueKeysColumnModels,
            description: ("description" in obj) ? obj.description as string : "",
        });
    }

    public equals(other: TableUniqueKeysModel): boolean {
        if (this.tableUniqueKeysModelId !== other.tableUniqueKeysModelId) {
            return false;
        }

        if (this.physicalName !== other.physicalName) {
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

    /** Creates a copy whose columnModelId is replaced by the mapped one; an unmapped id is kept. */
    public duplicate(columnModelIdMap: ReadonlyMap<string, string>): UniqueKeysColumnModel {
        const columnModelId = columnModelIdMap.get(this.columnModelId) ?? this.columnModelId;

        return new UniqueKeysColumnModel({ ...this, columnModelId });
    }

    public toJSON(): Record<string, unknown> {
        return {
            columnModelId: this.columnModelId,
            ...((this.sortOrderType !== "") && { sortOrderType: this.sortOrderType }),
        };
    }

    public static toObject(obj: object): UniqueKeysColumnModel {
        requireProperty(obj, "columnModelId");

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