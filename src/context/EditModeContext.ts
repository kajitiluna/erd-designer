import React from "react";
import EditMode from "~/models/EditMode";

type EditModeState = {
    editMode: EditMode,
    dispatchEditMode: (action: EditMode) => void,
};

const EditModeContext = React.createContext<EditModeState>({} as EditModeState);

export default EditModeContext;
