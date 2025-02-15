import { useReducer, useState } from "react";
import { Box } from "@mui/material";

import DisplayScaleContext from "~/context/DisplayScaleContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import {
    SelectAction, reduceSelectAction, SelectEntityContext,
    EMPTY_SELECT_STATE, RELEASE_ACTION
} from "~/context/SelectEntityContext";
import ControlPanel from "~/features/canvas/ControlPanel";
import DisplayScalePanel from "~/features/canvas/DisplayScalePanel";
import ErdCanvas from "~/features/canvas/ErdCanvas";
import EditMode, { EditModeType } from "~/models/EditMode";
import ErdDocument from "~/models/ErdDocument";
import { DEFAULT_LOVAL_SETTING, LocalSettingContext, reduceLocalSetting } from "~/context/LocalSettingContext";
import TitlePanel from "~/features/canvas/TitlePanel";

type MainViewProps = {
    erdDocument: ErdDocument,
    onSave: (updating: ErdDocument) => void,
    erdExortable?: boolean
};

type ErdDocumentsHolderOptions = {
    erdDocuments: ErdDocument[],
    cursor: number
};

const MainView = ({ erdDocument, onSave, erdExortable = true }: MainViewProps) => {

    const [holderProps, setHolderProps] = useState<ErdDocumentsHolderOptions>({ erdDocuments: [erdDocument], cursor: 0 });
    const [selectState, dispatchSelectAction] = useReducer(reduceSelectAction, EMPTY_SELECT_STATE);
    const [editMode, dispatchEditMode] = useReducer(initReduceEditMode(dispatchSelectAction), EditModeType.SELECT);
    const [localSetting, dispatchLocalSetting] = useReducer(reduceLocalSetting, DEFAULT_LOVAL_SETTING);
    const [scale, setScale] = useState<number>(1);

    const handleOnSave = (documents: ErdDocument[], cursor: number) => {
        if ((cursor < 0) || (cursor >= documents.length)) {
            console.warn(`Invalid cursor value. documents.length: ${documents.length}, cursor: ${cursor}`);
            return;
        }

        onSave(documents[cursor]);
        setHolderProps({ erdDocuments: documents, cursor });
    };

    const documentsHolder = new ErdDocumentsHolder(holderProps.erdDocuments, holderProps.cursor, handleOnSave);

    const titlePanelStyle = {
        position: "fixed",
        top: "30px",
        left: "30px",
    };
    const controlPanelStyle = {
        position: "fixed",
        top: "50%",
        left: "50px",
        transform: "translateY(-50%)",
    };
    const scalePanelStyle = {
        position: "fixed",
        bottom: "30px",
        right: "30px",
    };

    return (
        <ErdDocumentsHolderContext.Provider value={documentsHolder}>
            <EditModeContext.Provider value={{ editMode, dispatchEditMode }}>
                <SelectEntityContext.Provider value={{ selectState, dispatchSelectAction }}>
                    <LocalSettingContext.Provider value={{ localSetting, dispatchLocalSetting }}>
                        <DisplayScaleContext.Provider value={scale} >
                            <Box sx={{ position: "relative", width: "100%", height: "100vh" }}>
                                <ErdCanvas />
                            </Box>
                            <Box sx={titlePanelStyle}>
                                <TitlePanel />
                            </Box>
                            <Box sx={controlPanelStyle}>
                                <ControlPanel erdExortable={erdExortable} />
                            </Box>
                            <Box sx={scalePanelStyle}>
                                <DisplayScalePanel scale={scale} onChangeScale={setScale} />
                            </Box>
                        </DisplayScaleContext.Provider>
                    </LocalSettingContext.Provider>
                </SelectEntityContext.Provider>
            </EditModeContext.Provider>
        </ErdDocumentsHolderContext.Provider>
    );
};

const initReduceEditMode = (dispatchSelectAction: (action: SelectAction) => void) => {
    return (_current: EditMode, action: EditMode) => {
        dispatchSelectAction(RELEASE_ACTION);

        return action;
    };
};

export default MainView;
