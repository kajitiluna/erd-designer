import ColumnShareModel from "~/models/database/ColumnShareModel";

export default class ColumnShareModelStrage {

    private columnShareModelMap: Map<string, ColumnShareModel>;

    private constructor(columnShareModelMap: Map<string, ColumnShareModel>) {
        this.columnShareModelMap = columnShareModelMap;
    }

    public static create(columnShareModels: (readonly ColumnShareModel[] | null) = null) {
        const mapping = new Map<string, ColumnShareModel>((columnShareModels == null) ? []
            : columnShareModels.map((model) => [model.columnShareModelId, model])
        );

        return new ColumnShareModelStrage(mapping);
    }

    getModels(): ColumnShareModel[] {
        const models = Array.from(this.columnShareModelMap.values());

        models.sort((first, second) => {
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

        return models;
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

    addModel(columnShareModel: ColumnShareModel) {
        this.columnShareModelMap.set(columnShareModel.columnShareModelId, columnShareModel);
    }

    copy(): ColumnShareModelStrage {
        return new ColumnShareModelStrage(new Map(this.columnShareModelMap));
    }
}