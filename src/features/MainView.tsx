import React from "react";
import { Box } from "@mui/material";

import DisplayScaleContext, { ScaleState } from "~/context/DisplayScaleContext";
import { DragActionContext, reduceDragAction, NO_DRAGGING } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import {
    SelectAction, reduceSelectAction, SelectEntityContext, EMPTY_SELECT_STATE, RELEASE_ACTION
} from "~/context/SelectEntityContext";
import ControlPanel from "~/features/canvas/ControlPanel";
import DisplayScalePanel from "~/features/canvas/DisplayScalePanel";
import ErdCanvas from "~/features/canvas/ErdCanvas";
import EditMode, { EditModeType } from "~/models/EditMode";
import ErdDocument from "~/models/ErdDocument";
import { DEFAULT_LOCAL_SETTING, LocalSettingContext, reduceLocalSetting } from "~/context/LocalSettingContext";
import TitlePanel from "~/features/canvas/TitlePanel";

type MainViewProps = {
    erdDocument: ErdDocument,
    onSave: (updating: ErdDocument, loggingMessage: string) => void,
    erdExportable?: boolean
};

type ErdDocumentsHolderOptions = {
    erdDocuments: ErdDocument[],
    cursor: number
};

const CANVAS_AREA = { width: 25000, height: 25000 } as const;

const MainView = ({ erdDocument, onSave, erdExportable = true }: MainViewProps) => {

    const [holderProps, setHolderProps] =
        React.useState<ErdDocumentsHolderOptions>({ erdDocuments: [erdDocument], cursor: 0 });
    const [selectState, dispatchSelectAction] = React.useReducer(reduceSelectAction, EMPTY_SELECT_STATE);
    const [editMode, dispatchEditMode] = React.useReducer(initReduceEditMode(dispatchSelectAction), EditModeType.SELECT);
    const [localSetting, dispatchLocalSetting] = React.useReducer(reduceLocalSetting, DEFAULT_LOCAL_SETTING);
    const [scale, setScale] = React.useState<ScaleState>({ scale: 1, phase: "idle" });
    const [dragState, dispatchDragAction] = React.useReducer(reduceDragAction, NO_DRAGGING);

    const handleOnSave = (documents: ErdDocument[], cursor: number, loggingMessage: string) => {
        if ((cursor < 0) || (cursor >= documents.length)) {
            console.warn(`Invalid cursor value. documents.length: ${documents.length}, cursor: ${cursor}`);
            return;
        }

        onSave(documents[cursor], loggingMessage);
        setHolderProps({ erdDocuments: documents, cursor });
    };

    const documentsHolder = new ErdDocumentsHolder(holderProps.erdDocuments, holderProps.cursor, handleOnSave);

    const roundedOrthogonalCorners =
        holderProps.erdDocuments[holderProps.cursor]?.erdSettingModel.roundedOrthogonalCorners ?? false;

    React.useEffect(() => {
        dispatchLocalSetting({ type: "roundedOrthogonalCorners", enabled: roundedOrthogonalCorners });
    }, [roundedOrthogonalCorners]);


    return (
        <ErdDocumentsHolderContext.Provider value={documentsHolder}>
            <EditModeContext.Provider value={{ editMode, dispatchEditMode }}>
                <SelectEntityContext.Provider value={{ selectState, dispatchSelectAction }}>
                    <LocalSettingContext.Provider value={{ localSetting, dispatchLocalSetting }}>
                        <DragActionContext.Provider value={dragState}>
                            <DisplayScaleContext.Provider value={scale} >
                                <Box sx={{ position: "relative", width: "100%", height: "100vh" }}>
                                    <ErdCanvas canvasArea={CANVAS_AREA} onDragAction={dispatchDragAction} />
                                </Box>
                                <Box sx={{ position: "fixed", top: "30px", left: "30px" }}>
                                    <TitlePanel />
                                </Box>
                                <Box sx={{ position: "fixed", top: "50%", left: "50px", transform: "translateY(-50%)" }}>
                                    <ControlPanel erdExportable={erdExportable} />
                                </Box>
                                <Box sx={{ position: "fixed", bottom: "30px", right: "30px" }}>
                                    <DisplayScalePanel canvasArea={CANVAS_AREA} scaleStatus={scale}
                                        onChangeScale={setScale} />
                                </Box>
                            </DisplayScaleContext.Provider>
                        </DragActionContext.Provider>
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
