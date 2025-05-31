import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";

export const overrideColumnName = (columnModel: ColumnModel, shareModel: ColumnShareModel) => {
    const physicalName = (columnModel.physicalName != "") ? columnModel.physicalName : shareModel.physicalName;
    const logicalName = (columnModel.logicalName != "") ? columnModel.logicalName : shareModel.logicalName;

    return { physicalName, logicalName };
}