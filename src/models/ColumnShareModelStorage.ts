import ColumnShareModel from "~/models/database/ColumnShareModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";
import { equalsModelMap } from "~/models/storage-support";

export default class ColumnShareModelStorage {

    private columnShareModelMap: Map<string, ColumnShareModel>;
    private structShareModelMap: Map<string, StructColumnShareModel>;

    private constructor(
        columnShareModelMap: Map<string, ColumnShareModel>,
        structShareModelMap: Map<string, StructColumnShareModel>
    ) {
        this.columnShareModelMap = columnShareModelMap;
        this.structShareModelMap = structShareModelMap;
    }

    public static create(
        columnShareModels: (readonly ColumnShareModel[] | null) = null,
        structShareModels: (readonly StructColumnShareModel[] | null) = null
    ) {
        const columnMapping = new Map<string, ColumnShareModel>((columnShareModels == null) ? []
            : columnShareModels.map(model => [model.columnShareModelId, model])
        );
        const structMapping = new Map<string, StructColumnShareModel>((structShareModels == null) ? []
            : structShareModels.map(model => [model.structShareModelId, model])
        );

        return new ColumnShareModelStorage(columnMapping, structMapping);
    }

    getColumnShareModels(): ColumnShareModel[] {
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

    findColumnShare(columnShareModelId: string): ColumnShareModel | null {
        if (columnShareModelId === "") {
            return null;
        }

        const model = this.columnShareModelMap.get(columnShareModelId);
        if (model == null) {
            return null;
        }

        return model;
    }

    addColumnShare(...columnShareModels: ColumnShareModel[]): ColumnShareModelStorage {
        if (columnShareModels.length === 0) {
            return this;
        }

        const nextShareModelMap = new Map(this.columnShareModelMap);
        columnShareModels.forEach(model =>
            nextShareModelMap.set(model.columnShareModelId, model));

        return new ColumnShareModelStorage(nextShareModelMap, this.structShareModelMap);
    }

    private deleteColumnShare(columnShareModelIds: string[]): ColumnShareModelStorage {
        if (columnShareModelIds.length === 0) {
            return this;
        }

        const nextShareModelMap = new Map(this.columnShareModelMap);
        columnShareModelIds.forEach(
            columnShareModelId => nextShareModelMap.delete(columnShareModelId)
        );

        return new ColumnShareModelStorage(nextShareModelMap, this.structShareModelMap);
    }

    getStructShareModels(): StructColumnShareModel[] {
        if (this.structShareModelMap.size === 0) {
            return [];
        }

        return Array.from(this.structShareModelMap.values())
            .sort((first, second) => {
                const nameCompared = first.physicalName.localeCompare(second.physicalName, "en");
                if (nameCompared !== 0) {
                    return nameCompared;
                }

                return first.structShareModelId.localeCompare(second.structShareModelId, "en");
            });
    }

    findStructShare(structShareModelId: string): StructColumnShareModel | null {
        if (structShareModelId === "") {
            return null;
        }

        const model = this.structShareModelMap.get(structShareModelId);
        if (model == null) {
            return null;
        }

        return model;
    }

    addStructShare(...structShareModels: StructColumnShareModel[]): ColumnShareModelStorage {
        if (structShareModels.length === 0) {
            return this;
        }

        const nextStructShareModelMap = new Map(this.structShareModelMap);
        structShareModels.forEach(model =>
            nextStructShareModelMap.set(model.structShareModelId, model));

        return new ColumnShareModelStorage(this.columnShareModelMap, nextStructShareModelMap);
    }

    deleteStructShare(structShareModelIds: string[]): ColumnShareModelStorage {
        if (structShareModelIds.length === 0) {
            return this;
        }

        const nextStructShareModelMap = new Map(this.structShareModelMap);
        structShareModelIds.forEach(
            structShareModelId => nextStructShareModelMap.delete(structShareModelId)
        );

        return new ColumnShareModelStorage(this.columnShareModelMap, nextStructShareModelMap);
    }

    /**
     * ドキュメント側で存在・参照が失われたモデルへの追随削除を行う。
     * どの simple カラムからも参照されない ColumnShareModel を削除し、全 StructColumnShareModel
     * の columnEntries から現存しないカラム・カラムグループへの参照エントリを除去する。
     * 判定材料 (残存カラムの参照・現存 ID) はドキュメント側が所有する事実のため引数で受け、
     * どのモデルを削除するかの判断は本クラス内部で完結する。
     * StructColumnShareModel 自体は明示的な削除操作 (deleteStructShare) でのみ削除され、対象外。
     *
     * @param referencedColumnShareIds 残存カラムが参照している columnShareModelId 一覧
     * @param existingColumnModelIds 現存する columnModelId 一覧
     * @param existingColumnGroupIds 現存する columnGroupId 一覧
     * @returns 更新後の ColumnShareModelStorage (変更がない場合は自身を返す)
     */
    deleteUnreferencedModels(
        referencedColumnShareIds: readonly string[],
        existingColumnModelIds: readonly string[],
        existingColumnGroupIds: readonly string[]
    ): ColumnShareModelStorage {
        const referencedShareIdSet = new Set(referencedColumnShareIds);
        const unreferencedShareIds = Array.from(this.columnShareModelMap.keys())
            .filter(columnShareModelId => (referencedShareIdSet.has(columnShareModelId) === false));

        const afterShareDeleted = this.deleteColumnShare(unreferencedShareIds);
        return afterShareDeleted.deleteDanglingColumnEntries(existingColumnModelIds, existingColumnGroupIds);
    }

    // 全 StructColumnShareModel の columnEntries から、現存しないカラム・カラムグループへの
    // 参照エントリを除去する。single/group 両参照の判定は同種の1走査のため統合している。
    // ネストした struct 参照はラッパー ColumnModel への single 参照のため columnModelId 側で判定される。
    private deleteDanglingColumnEntries(
        existingColumnModelIds: readonly string[],
        existingColumnGroupIds: readonly string[]
    ): ColumnShareModelStorage {
        const existingColumnIdSet = new Set(existingColumnModelIds);
        const existingGroupIdSet = new Set(existingColumnGroupIds);

        let hasChanged = false;
        const nextStructShareModelMap = new Map(this.structShareModelMap);

        for (const [structShareModelId, structShareModel] of this.structShareModelMap.entries()) {
            const nextColumns = structShareModel.columnEntries.filter(column => {
                if (column.modelType === "single") {
                    return existingColumnIdSet.has(column.columnModelId);
                }

                return existingGroupIdSet.has(column.columnGroupId);
            });

            if (nextColumns.length === structShareModel.columnEntries.length) {
                continue;
            }

            hasChanged = true;

            const nextStructShare = new StructColumnShareModel({ ...structShareModel, columnEntries: nextColumns });
            nextStructShareModelMap.set(structShareModelId, nextStructShare);
        }

        return hasChanged ? new ColumnShareModelStorage(this.columnShareModelMap, nextStructShareModelMap) : this;
    }

    copy(): ColumnShareModelStorage {
        return new ColumnShareModelStorage(new Map(this.columnShareModelMap), new Map(this.structShareModelMap));
    }

    public equals(other: ColumnShareModelStorage): boolean {
        return equalsModelMap(this.columnShareModelMap, other.columnShareModelMap)
            && equalsModelMap(this.structShareModelMap, other.structShareModelMap);
    }
}
