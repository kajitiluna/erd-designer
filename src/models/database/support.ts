import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";

export const overrideColumnName = (columnModel: ColumnModel, shareModel: ColumnShareModel | StructColumnShareModel) => {
    const physicalName = (columnModel.physicalName != "") ? columnModel.physicalName : shareModel.physicalName;
    const logicalName = (columnModel.logicalName != "") ? columnModel.logicalName : shareModel.logicalName;

    return { physicalName, logicalName };
}

/**
 * Resolves the logical name to store, falling back to the physical name when none is given.
 * A model whose logical name is empty cannot be repaired from a screen that hides the logical-name
 * input, so every import path fills it at the boundary instead.
 */
export const resolveLogicalName = (physicalName: string, logicalName: string): string => {
    return (logicalName !== "") ? logicalName : physicalName;
}
