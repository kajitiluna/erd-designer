import ColumnModel from "~/models/database/ColumnModel";
import { equalsModelMap } from "~/models/storage-support";

export default class ColumnModelStorage {

    private columnModelMap: Map<string, ColumnModel>;

    private constructor(columnModelMap: Map<string, ColumnModel>) {
        this.columnModelMap = columnModelMap;
    }

    public static create(columnModels: (readonly ColumnModel[] | null) = null) {
        const mapping = new Map<string, ColumnModel>((columnModels == null) ? []
            : columnModels.map(model => [model.columnModelId, model])
        );

        return new ColumnModelStorage(mapping);
    }

    public static from(columnModelMap: Map<string, ColumnModel>) {
        return new ColumnModelStorage(new Map(columnModelMap));
    }

    getColumnModels(): ColumnModel[] {
        if (this.columnModelMap.size === 0) {
            return [];
        }

        return Array.from(this.columnModelMap.values())
            .sort((first, second) => {
                const physicalNameResult = first.physicalName.localeCompare(second.physicalName, "en");
                if (physicalNameResult !== 0) {
                    return physicalNameResult;
                }
                const logicalNameResult = first.logicalName.localeCompare(second.logicalName, "en");
                if (logicalNameResult !== 0) {
                    return logicalNameResult;
                }

                return first.columnModelId.localeCompare(second.columnModelId, "en");
            });
    }

    findColumn(columnModelId: string): ColumnModel | null {
        if (columnModelId === "") {
            return null;
        }

        const model = this.columnModelMap.get(columnModelId);
        if (model == null) {
            return null;
        }

        return model;
    }

    addColumn(columns: ColumnModel[]): ColumnModelStorage {
        if (columns.length === 0) {
            return this;
        }

        const nextColumnMap = new Map(this.columnModelMap);
        columns.forEach(column => nextColumnMap.set(column.columnModelId, column));

        return new ColumnModelStorage(nextColumnMap);
    }

    deleteColumn(columnModelIds: string[]): ColumnModelStorage {
        if (columnModelIds.length === 0) {
            return this;
        }

        const nextColumnMap = new Map(this.columnModelMap);
        columnModelIds.forEach(columnId => nextColumnMap.delete(columnId));

        return new ColumnModelStorage(nextColumnMap);
    }

    copy(): ColumnModelStorage {
        return new ColumnModelStorage(new Map(this.columnModelMap));
    }

    public equals(other: ColumnModelStorage): boolean {
        return equalsModelMap(this.columnModelMap, other.columnModelMap);
    }
}