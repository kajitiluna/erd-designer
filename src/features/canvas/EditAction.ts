import TableModel from "~/models/database/TableModel";
import RelationViewModel from "~/models/RelationViewModel";
import TableViewModel from "~/models/TableViewModel";

type EditAction = { editType: "none" }
    | { editType: "table", tableView: TableViewModel }
    | {
        editType: "relation", relationView: RelationViewModel,
        parentTable: TableModel, childTable: TableModel
    }
    | { editType: "perspective", targetId: string };

export default EditAction;
