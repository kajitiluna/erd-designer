import React from "react";
import { Box } from "@mui/material";

import DisplayScaleContext from "~/context/DisplayScaleContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import {
    SelectAction, reduceSelectAction, SelectEntityContext,
    EMPTY_SELECT_STATE, RELEASE_ACTION
} from "~/context/SelectEntityContext";
import { DRAWABLE_AREA } from "~/features/canvas/support";
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

const MIN_SCALE = 0.05;
const MAX_SCALE = 2;
const ZOOM_SENSITIVITY = 0.002;

const MainView = ({ erdDocument, onSave, erdExportable = true }: MainViewProps) => {

    const [holderProps, setHolderProps] =
        React.useState<ErdDocumentsHolderOptions>({ erdDocuments: [erdDocument], cursor: 0 });
    const [selectState, dispatchSelectAction] = React.useReducer(reduceSelectAction, EMPTY_SELECT_STATE);
    const [editMode, dispatchEditMode] = React.useReducer(initReduceEditMode(dispatchSelectAction), EditModeType.SELECT);
    const [localSetting, dispatchLocalSetting] = React.useReducer(reduceLocalSetting, DEFAULT_LOCAL_SETTING);
    const [scale, setScale] = React.useState<number>(1);
    const scaleRef = React.useRef<number>(1);

    const zoomTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        if (erdDocument.erdSettingModel.showRelationNames) {
            dispatchLocalSetting({ type: "showRelationNames", show: true });
        }
    }, []);

    React.useEffect(() => {
        scaleRef.current = scale;
    }, [scale]);

    React.useEffect(() => {
        const handleWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            event.stopPropagation();

            const oldScale = scaleRef.current;
            const factor = Math.pow(2, -event.deltaY * ZOOM_SENSITIVITY);
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor));
            if (newScale === oldScale) return;

            const originX = DRAWABLE_AREA.width / 2;
            const originY = DRAWABLE_AREA.height / 2;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const sx = window.scrollX;
            const sy = window.scrollY;
            const screenCenterCanvasX = sx + vw / 2;
            const screenCenterCanvasY = sy + vh / 2;
            const canvasPointX = (screenCenterCanvasX - originX * (1 - oldScale)) / oldScale;
            const canvasPointY = (screenCenterCanvasY - originY * (1 - oldScale)) / oldScale;
            const newScreenX = canvasPointX * newScale + originX * (1 - newScale) - vw / 2;
            const newScreenY = canvasPointY * newScale + originY * (1 - newScale) - vh / 2;

            scaleRef.current = newScale;

            const canvas = document.getElementById("erd-canvas");
            if (canvas) {
                canvas.style.transform = `scale(${newScale})`;
            }
            const hideIds = ["toolbar-portal", "relation-toolbar-container"];
            const hideElements = [
                ...hideIds.map(id => document.getElementById(id)),
                ...Array.from(document.querySelectorAll<HTMLElement>(".MuiPopover-root"))
            ].filter(Boolean) as HTMLElement[];
            hideElements.forEach(el => el.style.visibility = "hidden");
            window.scrollTo(newScreenX, newScreenY);

            if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
            zoomTimerRef.current = setTimeout(() => {
                setScale(scaleRef.current);
                hideElements.forEach(el => el.style.visibility = "");
                zoomTimerRef.current = null;
            }, 100);
        };

        window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
        return () => window.removeEventListener("wheel", handleWheel, { capture: true });
    }, []);

    const handleOnSave = (documents: ErdDocument[], cursor: number, loggingMessage: string) => {
        if ((cursor < 0) || (cursor >= documents.length)) {
            console.warn(`Invalid cursor value. documents.length: ${documents.length}, cursor: ${cursor}`);
            return;
        }

        onSave(documents[cursor], loggingMessage);
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
                                <ControlPanel erdExportable={erdExportable} />
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
