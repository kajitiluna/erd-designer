import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";

export const overrideColumnName = (columnModel: ColumnModel, shareModel: ColumnShareModel | StructColumnShareModel) => {
    const physicalName = (columnModel.physicalName != "") ? columnModel.physicalName : shareModel.physicalName;
    const logicalName = (columnModel.logicalName != "") ? columnModel.logicalName : shareModel.logicalName;

    return { physicalName, logicalName };
}