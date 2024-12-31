import TableModel from "~/models/database/TableModel";
import RelationViewModel from "~/models/RelationViewModel";
import TableViewModel from "~/models/TableViewModel";

type EditAction = { editType: "none" }
    | { editType: "table", tableViewModel: TableViewModel }
    | {
        editType: "relation", relationViewModel: RelationViewModel,
        parentTable: TableModel, childTable: TableModel
    };

export default EditAction;
