import React from "react";
import { CircularProgress } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import ErdApplicationShell from "~/features/ErdApplicationShell";
import RectangleViewModel from "~/models/RectangleViewModel";
import {
    ERD_MESSAGE_EVENT_SOURCE, notifySaveDocument,
    onDrawnRectangles, onExternalChangedDocument, onInitializeCompleted, onStartedExtension
} from "~/extension/vscode-message-resolver";
import { CANVAS_RECTANGLES_DRAWN_EVENT } from "~/components/constant";

const VsCodeExtensionApplication = (prop: { vscodeApi: VsCodeApi }) => {
    const vscodeApi = prop.vscodeApi;

    // 初期化処理
    const { documentUri, initDocument, setInitDocument, loadResult } = useInitialize();
    // Canvas 上に描画されたテーブルの矩形情報を受信し、拡張機能に伝搬する。
    useSyncRectangles(vscodeApi, documentUri);

    // ErdApplicationShell は React.memo でラップされているため、
    // onSave の参照が render のたびに変わると memo が素通りし MainView 以下が再構築される。useCallback で安定化する。
    const handleSaveDocument = React.useCallback((erdDocument: ErdDocument, message: string) => {
        notifySaveDocument(vscodeApi, documentUri)(erdDocument, message);
    }, [vscodeApi, documentUri]);

    // 初期化処理が終わっていない場合は、読み込み中であることを示す
    if (documentUri === "") {
        // VSCode 側に準備完了を通知する。その後、上記の message イベントが発火されるのを待つ。
        onStartedExtension(vscodeApi);
        console.debug("Sent ready event to vscode extension.");

        return (<CircularProgress />);
    }

    // 開いた .erd ファイルの形式が不正だった場合
    if (loadResult === "failure") {
        return (<div>Failed to load erd file.</div>);
    }

    if (initDocument === null) {
        const handleCreated = (erdDocument: ErdDocument) => {
            setInitDocument(erdDocument);
            handleSaveDocument(erdDocument, "Created new erd document.");
        };

        return (
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
                <InitializeDatabaseDialog
                    isOpen={initDocument === null}
                    onCreate={handleCreated}
                    onClose={() => { }} />
            </div>
        );
    }

    return (
        <ErdApplicationShell erdDocument={initDocument} onSave={handleSaveDocument} erdExportable={false} />
    );
};

const useInitialize = () => {
    const [documentUri, setDocumentUri] = React.useState<string>("");
    const [loadResult, setLoadResult] = React.useState<"" | "failure">("");
    const [initDocument, setInitDocument] = React.useState<ErdDocument | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessageFromVsCode = React.useCallback((event: MessageEvent<any>) => {
        const message = event.data;
        if ((("eventSource" in message) === false) || (("messageType" in message) === false)
            || (("documentUri" in message) === false) || (("jsonContext" in message) === false)) {
            console.error("Invalid message format received.");
            return;
        }

        if (message.eventSource !== ERD_MESSAGE_EVENT_SOURCE) {
            return;
        }
        const uri = message.documentUri as string;
        if (uri === "") {
            console.error("Received empty document uri during initialization.");
            return;
        }

        // VSCode 拡張機能側より初期化処理が完了し、ファイルの内容を受信したときの制御
        if (message.messageType === "init") {
            const result = onInitializeCompleted(message);
            if ("error" in result) {
                console.warn(`Failed to parse erd document. uri: ${uri}\n\tdetail: ${result.error}`);
                setLoadResult("failure");
                return;

            }

            setInitDocument(result.erdDocument);
            setDocumentUri(uri);

            console.info(`Initialized erd-designer: ${uri}`);
            return;
        }

        if (documentUri !== uri) {
            console.debug(`Document URI mismatch: ${documentUri} !== ${uri}`);
            return;
        }

        if (message.messageType === "changeDocument") {
            const result = onExternalChangedDocument(message);
            if (result.succeeded === false) {
                console.warn(`Failed to parse externally changed document: ${result.error}`);
                return;
            }

            console.debug("Dispatching a changeDocument event from vscode"
                + ` to externalDocumentChanged event: ${documentUri}`);

            return;
        }
    }, [documentUri]);


    // 初期化処理
    React.useEffect(() => {

        window.addEventListener("message", handleMessageFromVsCode);

        return () => {
            window.removeEventListener("message", handleMessageFromVsCode);
        };
    }, [handleMessageFromVsCode]);

    return { documentUri, initDocument, setInitDocument, loadResult };
};

const useSyncRectangles = (vscodeApi: VsCodeApi, documentUri: string) => {
    const handleCanvasRectanglesDrawn = React.useCallback((event: Event) => {
        const customEvent = event as CustomEvent;
        const eventDetail = customEvent.detail;
        if (("tableRectangles" in eventDetail) === false) {
            return;
        }

        const tableRectangles = eventDetail.tableRectangles as Map<string, RectangleViewModel>;
        onDrawnRectangles(vscodeApi, documentUri, tableRectangles);
    }, [documentUri, vscodeApi]);

    React.useEffect(() => {
        window.addEventListener(CANVAS_RECTANGLES_DRAWN_EVENT, handleCanvasRectanglesDrawn);

        return () => {
            window.removeEventListener(CANVAS_RECTANGLES_DRAWN_EVENT, handleCanvasRectanglesDrawn);
        };
    }, [handleCanvasRectanglesDrawn]);
};

export default VsCodeExtensionApplication;