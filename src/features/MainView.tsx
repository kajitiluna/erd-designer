import React from "react";
import { Box } from "@mui/material";

import { DragActionContext, reduceDragAction, NO_DRAGGING } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import {
    SelectAction, reduceSelectAction, SelectEntityContext, EMPTY_SELECT_STATE, RELEASE_ACTION
} from "~/context/SelectEntityContext";
import CanvasSearchPanel from "~/features/canvas/CanvasSearchPanel";
import ControlPanel from "~/features/canvas/ControlPanel";
import DisplayScalePanel from "~/features/canvas/DisplayScalePanel";
import ErdCanvas from "~/features/canvas/ErdCanvas";
import EditMode, { EditModeType } from "~/models/EditMode";
import ErdDocument from "~/models/ErdDocument";
import { DEFAULT_LOCAL_SETTING, LocalSettingContext, reduceLocalSetting } from "~/context/LocalSettingContext";
import TitlePanel from "~/features/canvas/TitlePanel";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";

type MainViewProps = {
    erdDocument: ErdDocument,
    onSave: (updating: ErdDocument, loggingMessage: string) => void,
    erdExportable?: boolean,
    remoteSyncable?: boolean
};

type ErdDocumentsHolderOptions = {
    erdDocuments: ErdDocument[],
    cursor: number
};

const MainView = ({ erdDocument, onSave, erdExportable = true, remoteSyncable = false }: MainViewProps) => {

    const { documentsHolder, editModeHolder, selectEntityHolder, localSettingHolder } =
        useMainHolder({ erdDocument, onSave });
    const [dragState, dispatchDragAction] = React.useReducer(reduceDragAction, NO_DRAGGING);

    // 外部からの変更を Canvas の表示に反映する
    React.useEffect(() => {
        const handleDocumentChange = initHandleExternallyChangedDocument(documentsHolder);
        window.addEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleDocumentChange);

        return () => {
            window.removeEventListener(EXTERNAL_DOCUMENT_CHANGED_EVENT, handleDocumentChange);
        };
    }, [documentsHolder]);

    const erdCanvas = (
        <ErdCanvas onDragAction={dispatchDragAction}>
            <Box sx={{ position: "fixed", top: "30px", left: "30px" }}>
                <TitlePanel remoteSyncable={remoteSyncable} />
            </Box>
            <Box sx={{ position: "fixed", top: "50%", left: "50px", transform: "translateY(-50%)" }}>
                <ControlPanel erdExportable={erdExportable} />
            </Box>
            <Box sx={{ position: "fixed", bottom: "30px", right: "30px" }}>
                <DisplayScalePanel />
            </Box>
            <Box sx={{ position: "fixed", top: "34px", right: "34px", zIndex: 10 }}>
                <CanvasSearchPanel />
            </Box>
        </ErdCanvas>
    );

    return (
        <ErdDocumentsHolderContext.Provider value={documentsHolder}>
            <EditModeContext.Provider value={editModeHolder}>
                <SelectEntityContext.Provider value={selectEntityHolder}>
                    <LocalSettingContext.Provider value={localSettingHolder}>
                        <DragActionContext.Provider value={dragState}>
                            {erdCanvas}
                        </DragActionContext.Provider>
                    </LocalSettingContext.Provider>
                </SelectEntityContext.Provider>
            </EditModeContext.Provider>
        </ErdDocumentsHolderContext.Provider>
    );
};

const useMainHolder = ({ erdDocument, onSave }: MainViewProps) => {
    const [holderProps, setHolderProps] =
        React.useState<ErdDocumentsHolderOptions>({ erdDocuments: [erdDocument], cursor: 0 });
    const [selectState, dispatchSelectAction] = React.useReducer(reduceSelectAction, EMPTY_SELECT_STATE);
    const [editMode, dispatchEditMode] = React.useReducer(initReduceEditMode(dispatchSelectAction), EditModeType.SELECT);
    const [localSetting, dispatchLocalSetting] = React.useReducer(reduceLocalSetting, DEFAULT_LOCAL_SETTING);

    // コンテキスト値は参照が変わると全コンシューマが再レンダーされるため、useMemo で安定化する
    const documentsHolder = React.useMemo(
        () => initDocumentsHolder(holderProps, onSave, setHolderProps),
        [holderProps, onSave]
    );
    const editModeHolder = React.useMemo(() => {
        return { editMode, dispatchEditMode };
    }, [editMode]);
    const selectEntityHolder = React.useMemo(() => {
        return { selectState, dispatchSelectAction };
    }, [selectState]);
    const localSettingHolder = React.useMemo(() => {
        return { localSetting, dispatchLocalSetting };
    }, [localSetting]);

    return { documentsHolder, editModeHolder, selectEntityHolder, localSettingHolder };
};

const initDocumentsHolder = (
    holderProps: ErdDocumentsHolderOptions,
    onSave: (updating: ErdDocument, loggingMessage: string) => void,
    setHolderProps: (holderProps: ErdDocumentsHolderOptions) => void
): ErdDocumentsHolder => {
    const handleOnSave = (documents: ErdDocument[], cursor: number, loggingMessage: string) => {
        if ((cursor < 0) || (cursor >= documents.length)) {
            console.warn(`Invalid cursor value. documents.length: ${documents.length}, cursor: ${cursor}`);
            return;
        }

        onSave(documents[cursor], loggingMessage);
        setHolderProps({ erdDocuments: documents, cursor });
    };

    return new ErdDocumentsHolder(holderProps.erdDocuments, holderProps.cursor, handleOnSave);
};

const initReduceEditMode = (dispatchSelectAction: (action: SelectAction) => void) => {
    return (_current: EditMode, action: EditMode) => {
        dispatchSelectAction(RELEASE_ACTION);

        return action;
    };
};

const initHandleExternallyChangedDocument = (documentsHolder: ErdDocumentsHolder) => {
    return (event: Event) => {
        const customEvent = event as CustomEvent;
        const eventDetail = customEvent.detail;
        if (("erdDocument" in eventDetail) === false) {
            console.warn(`Unexpected event detail structure: ${JSON.stringify(eventDetail)}`);
            return;
        }

        const erdDocument = eventDetail.erdDocument as ErdDocument;
        documentsHolder.update(erdDocument, `Update document from external change: ${erdDocument.documentName}`);
        console.info("MainView: External document change has been applied.");
    };
};

export default MainView;
