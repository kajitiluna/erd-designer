import React from "react";
import { CircularProgress } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import ErdApplicationShell from "~/features/ErdApplicationShell";
import RectangleViewModel from "~/models/RectangleViewModel";
import {
    CANVAS_RECTANGLES_DRAWN_EVENT, ERD_MESSAGE_EVENT_SOURCE, EXTERNAL_DOCUMENT_CHANGED_EVENT,
    DrawnRectanglesMessage, SaveDocumentMessage, WebviewReadyMessage
} from "~/extension/webview-messages";

const VsCodeExtensionApplication = (prop: { vscodeApi: VsCodeApi }) => {
    const [documentUri, setDocumentUri] = React.useState<string>("");
    const [loadResult, setLoadResult] = React.useState<"" | "failure">("");
    const [initDocument, setInitDocument] = React.useState<ErdDocument | null>(null);

    const vscodeApi = prop.vscodeApi;

    // 初期化処理
    React.useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleMessageFromVsCode = (event: MessageEvent<any>) => {
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
                const jsonContext = message.jsonContext as string;
                let erdDocument: ErdDocument | null = null;
                if (jsonContext.length > 0) {
                    try {
                        erdDocument = ErdDocument.toObject(JSON.parse(jsonContext));
                    } catch (error) {
                        console.warn(`Failed to parse erd document. uri: ${uri}\n\tdetail: ${error}`);
                        setLoadResult("failure");
                        return;
                    }
                }

                setInitDocument(erdDocument);
                setDocumentUri(uri);

                console.info(`Initialized erd-designer: ${uri}`);
                return;
            }

            if (documentUri !== uri) {
                console.debug(`Document URI mismatch: ${documentUri} !== ${uri}`);
                return;
            }

            if (message.messageType === "changeDocument") {
                const jsonContext = message.jsonContext as string;
                const erdDocument = ErdDocument.toObject(JSON.parse(jsonContext));

                // ドキュメントの履歴管理は MainView 配下で行うため、MainView 配下の ErdCanvas に変更を通知する
                const customEvent = new CustomEvent(EXTERNAL_DOCUMENT_CHANGED_EVENT, {
                    detail: {
                        erdDocument: erdDocument
                    }
                });
                window.dispatchEvent(customEvent);

                console.debug("Dispatching a changeDocument event from vscode"
                    + ` to externalDocumentChanged event: ${documentUri}`);

                return;
            }
        };

        window.addEventListener("message", handleMessageFromVsCode);

        return () => {
            window.removeEventListener("message", handleMessageFromVsCode);
        };
    }, [documentUri]);

    // Canvas 上に描画されたテーブルの矩形情報を受信し、拡張機能に伝搬する。
    React.useEffect(() => {
        const handleCanvasRectanglesDrawn = (event: Event) => {
            const customEvent = event as CustomEvent;
            const eventDetail = customEvent.detail;
            if (("tableRectangles" in eventDetail) === false) {
                return;
            }

            const tableRectangles = eventDetail.tableRectangles as Map<string, RectangleViewModel>;
            const rectangles = Array.from(tableRectangles.entries())
                .map(([tableId, rectangle]) => {
                    return {
                        tableId,
                        rectangle: { ...rectangle }
                    };
                });

            const drawnRectanglesMessage: DrawnRectanglesMessage = {
                eventSource: ERD_MESSAGE_EVENT_SOURCE,
                messageType: "drawnRectangles",
                documentUri: documentUri,
                rectangles: rectangles
            };
            vscodeApi.postMessage(drawnRectanglesMessage);
        };

        window.addEventListener(CANVAS_RECTANGLES_DRAWN_EVENT, handleCanvasRectanglesDrawn);

        return () => {
            window.removeEventListener(CANVAS_RECTANGLES_DRAWN_EVENT, handleCanvasRectanglesDrawn);
        };
    }, [documentUri, vscodeApi]);

    // 初期化処理が終わっていない場合は、読み込み中であることを示す
    if (documentUri === "") {
        // VSCode 側に準備完了を通知する。その後、上記の message イベントが発火されるのを待つ。
        const readyMessage: WebviewReadyMessage = {
            eventSource: ERD_MESSAGE_EVENT_SOURCE,
            messageType: "ready"
        };
        vscodeApi.postMessage(readyMessage);

        console.debug("Sent ready event to vscode extension.");

        return (<CircularProgress />);
    }

    // 開いた .erd ファイルの形式が不正だった場合
    if (loadResult === "failure") {
        return (<div>Failed to load erd file.</div>);
    }

    // VSCode 上のファイル保存処理
    const handleSaveDocument = (updating: ErdDocument, loggingMessage: string) => {
        // ファイル保存は VSCode 側に処理を委譲する
        const saveMessage: SaveDocumentMessage = {
            eventSource: ERD_MESSAGE_EVENT_SOURCE,
            messageType: "save",
            documentUri: documentUri,
            erdDocument: updating.toJSON(),
            loggingMessage: loggingMessage
        };
        vscodeApi.postMessage(saveMessage);
    };

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

export default VsCodeExtensionApplication;