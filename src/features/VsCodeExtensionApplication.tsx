import React from "react";
import { CircularProgress } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import exportExcelFormatSpecification from "~/features/spec/ExcelFormatSpecification";
import download from "~/components/file-downloader";
import MainView from "~/features/MainView";

const VsCodeExtensionApplication = (prop: { vscodeApi: VsCodeApi }) => {
    const [documentUri, setDocumentUri] = React.useState<string>("");
    const [initDocument, setInitDocument] = React.useState<ErdDocument | null>(null);

    const vscodeApi = prop.vscodeApi;

    // 初期化処理
    React.useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleMessage = (event: MessageEvent<any>) => {
            const message = event.data;
            if (!("eventSource" in message) || !("messageType" in message)
                || !("documentUri" in message) || !("jsonContext" in message)) {
                console.error("Invalid message format received.");
                return;
            }

            if (message.eventSource !== "erd-designer") {
                return;
            }
            const uri = message.documentUri as string;
            if (uri === "") {
                console.error("Received empty document URI during initialization.");
                return;
            }

            // VSCode 拡張機能側より初期化処理が完了し、ファイルの内容を受信したときの制御
            if (message.messageType === "init") {
                const jsonContext = message.jsonContext as (string | null);
                const erdDocument = (jsonContext != null)
                    ? ErdDocument.toObject(JSON.parse(jsonContext)) : null;

                setInitDocument(erdDocument);
                setDocumentUri(uri);
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
                const customEvent = new CustomEvent("externalDocumentChanged", {
                    detail: {
                        erdDocument: erdDocument
                    }
                });
                window.dispatchEvent(customEvent);

                return;
            }
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [documentUri]);

    // 初期化処理が終わっていない場合は、読み込み中であることを示す
    if (documentUri === "") {
        // VSCode 側に準備完了を通知する。その後、上記の message イベントが発火されるのを待つ。
        vscodeApi.postMessage({
            messageType: "ready"
        });

        return (<CircularProgress />);
    }

    // VSCode 上のファイル保存処理
    const handleSaveDocument = (updating: ErdDocument) => {
        // ファイル保存は VSCode 側に処理を委譲する
        vscodeApi.postMessage({
            messageType: "save",
            documentUri: documentUri,
            erdDocument: updating.toJSON()
        });
    };

    if (initDocument === null) {
        const handleCreated = (erdDocument: ErdDocument) => {
            setInitDocument(erdDocument);
            handleSaveDocument(erdDocument);
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

    const exportSpecification = (erdDocument: ErdDocument, contents: ImageContent) => {
        exportExcelFormatSpecification(erdDocument, contents).then((specs: Blob) => {
            const fileName = `${erdDocument.documentName}.xlsx`;
            download(fileName, specs);
        });
    };

    return (
        <ExportSpecificationContext.Provider value={{ exportSpecification }}>
            <MainView erdDocument={initDocument} onSave={handleSaveDocument} erdExportable={false} />
        </ExportSpecificationContext.Provider>
    );
};

export default VsCodeExtensionApplication;