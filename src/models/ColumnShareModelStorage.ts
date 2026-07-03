import ColumnShareModel from "~/models/database/ColumnShareModel";
import { equalsModelMap } from "~/models/storage-support";

export default class ColumnShareModelStorage {

    private columnShareModelMap: Map<string, ColumnShareModel>;

    private constructor(columnShareModelMap: Map<string, ColumnShareModel>) {
        this.columnShareModelMap = columnShareModelMap;
    }

    public static create(columnShareModels: (readonly ColumnShareModel[] | null) = null) {
        const mapping = new Map<string, ColumnShareModel>((columnShareModels == null) ? []
            : columnShareModels.map((model) => [model.columnShareModelId, model])
        );

        return new ColumnShareModelStorage(mapping);
    }

    getModels(): ColumnShareModel[] {
        return Array.from(this.columnShareModelMap.values())
            .sort((first, second) => {
                const physicalNameResult = first.physicalName.localeCompare(second.physicalName, "en");
                if (physicalNameResult !== 0) {
                    return physicalNameResult;
                }
                const logicalNameResult = first.logicalName.localeCompare(second.logicalName, "en");
                if (logicalNameResult !== 0) {
                    return logicalNameResult;
                }
                const columnTypeResult = first.columnType.name.localeCompare(second.columnType.name, "en");
                if (columnTypeResult !== 0) {
                    return columnTypeResult;
                }

                return first.columnShareModelId.localeCompare(second.columnShareModelId, "en");
            });
    }

    find(columnShareModelId: string): ColumnShareModel | null {
        if (columnShareModelId === "") {
            return null;
        }

        const model = this.columnShareModelMap.get(columnShareModelId);
        if (model == null) {
            return null;
        }

        return model;
    }

    addModel(...columnShareModels: ColumnShareModel[]): ColumnShareModelStorage {
        if (columnShareModels.length === 0) {
            return this;
        }

        const nextShareModelMap = new Map(this.columnShareModelMap);
        columnShareModels.forEach(model =>
            nextShareModelMap.set(model.columnShareModelId, model));

        return new ColumnShareModelStorage(nextShareModelMap);
    }

    deleteModels(columnShareModelIds: string[]): ColumnShareModelStorage {
        const nextShareModelMap = new Map(this.columnShareModelMap);
        columnShareModelIds.forEach(
            columnShareModelId => nextShareModelMap.delete(columnShareModelId)
        );

        return new ColumnShareModelStorage(nextShareModelMap);
    }

    copy(): ColumnShareModelStorage {
        return new ColumnShareModelStorage(new Map(this.columnShareModelMap));
    }

    public equals(other: ColumnShareModelStorage): boolean {
        return equalsModelMap(this.columnShareModelMap, other.columnShareModelMap);
    }
}