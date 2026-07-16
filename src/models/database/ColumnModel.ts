import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";

type ColumnModel = SimpleColumnModel | StructColumnModel;

// type エイリアス(union)は静的メソッドを持てないため、同名の const を companion object として併置する。
// variant を保持したまま比較する呼び出し元に静的比較を提供する。
const ColumnModel = {

    isSimpleColumn(columnModel: ColumnModel): columnModel is SimpleColumnModel {
        return columnModel.entityType === "simple";
    },

    isStructColumn(columnModel: ColumnModel): columnModel is StructColumnModel {
        return columnModel.entityType === "struct";
    },

    equals(first: ColumnModel, second: ColumnModel): boolean {
        if (ColumnModel.isSimpleColumn(first) && ColumnModel.isSimpleColumn(second)) {
            return first.equals(second);
        }
        if (ColumnModel.isStructColumn(first) && ColumnModel.isStructColumn(second)) {
            return first.equals(second);
        }
        return false;
    },

    toObject(obj: object): ColumnModel {
        const entityType = ("entityType" in obj) ? obj.entityType as string : "simple";
        if (entityType === "struct") {
            return StructColumnModel.toObject(obj);
        }

        return SimpleColumnModel.toObject(obj);
    }
} as const;

export default ColumnModel;
