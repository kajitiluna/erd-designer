import React from "react";
import { Alert, AlertTitle, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";

import ErdDocument from "~/models/ErdDocument";
import { ErmLoadSummary } from "~/models/erm";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import {
    createGdriveFile, findSiblingGdriveFile, GdriveOpenResult, openGdriveFile, updateGdriveFile,
    verifyGdriveVersionOrThrow
} from "~/features/gdrive/gdrive-file-support";
import GoogleDriveNoticeLayout from "~/features/gdrive/GoogleDriveNoticeLayout";
import { containedButtonStyle, descriptionStyle } from "~/features/start_up/start-up-styles";
import { GdriveAuthorization } from "~/features/gdrive/gdrive-authorization";
import ConversionReportAlert from "~/components/ConversionReportAlert";

type GoogleDriveInitializerProp = {
    authorization: GdriveAuthorization,
    onInitialize: (gdriveFile: GdriveFile) => void
};

type GdriveFile = {
    fileId: string,
    erdDocument: ErdDocument,
    version: string
};

const GoogleDriveInitializer = ({ authorization: gdriveAuthorization, onInitialize }: GoogleDriveInitializerProp) => {
    const { authorization, authorize } = gdriveAuthorization;
    const [gdriveFolderId, setGdriveFolderId] = React.useState<string | null>(null);
    const [erdDocument, setErdDocument] = React.useState<ErdDocument | null>(null);
    const [ermImportUiState, setErmImportUiState] = React.useState<ErmImportUiState>({ phase: "idle" });

    const gdriveState = useGdriveStateParam();

    const handleCreateDocument = (erdDocument: ErdDocument) => {
        if ((gdriveFolderId == null) || (authorization.state !== "authorized")) {
            return;
        }

        setErdDocument(erdDocument);
    };

    React.useEffect(() => {
        if (authorization.state !== "authorized") {
            return;
        }

        if (gdriveState.action === "open") {
            const handleOpened = initHandleOpenedFile(authorization.accessToken, onInitialize, setErmImportUiState);

            openGdriveFile({
                accessToken: authorization.accessToken, fileId: gdriveState.fileId
            }).then(handleOpened).catch(error => {
                console.error(`Failed to open file. ${error}`);
            });
        }

        if (gdriveState.action === "create") {
            setGdriveFolderId(gdriveState.folderId);
        }
    }, [authorization, gdriveState, onInitialize]);

    // GoogleDrive にファイルを新規作成する
    React.useEffect(() => {
        if ((erdDocument == null) || (gdriveFolderId == null)) {
            return;
        }

        createGdriveFile({
            accessToken: authorization.accessToken, folderId: gdriveFolderId, erdDocument
        }).then(gdriveFile => {
            onInitialize(gdriveFile);
        }).catch(error => {
            console.error(`Failed to create file. ${error}`);
        });
    }, [erdDocument, gdriveFolderId, authorization.accessToken, onInitialize]);

    const handleConfirmErmImport = () => {
        if (ermImportUiState.phase !== "confirming") {
            return;
        }

        const pending = ermImportUiState.pending;
        const handleFinalized = initHandleFinalizedErmImport(onInitialize, setErmImportUiState);
        finalizeErmImport(pending, authorization.accessToken).then(handleFinalized).catch(error => {
            console.error(`Failed to save the converted file. ${error}`);
            setErmImportUiState({
                phase: "failed", message: `Failed to save "${pending.documentName}.erd" to Google Drive.`
            });
        });

        setErmImportUiState({ phase: "idle" });
    };

    const handleCancelErmImport = () => {
        setErmImportUiState({ phase: "idle" });
    };

    const isOpening = (authorization.state === "authorized") && (gdriveState.action === "open")
        && (ermImportUiState.phase === "idle");
    const onProcessing = (erdDocument != null) || isOpening;

    return (
        <GoogleDriveNoticeLayout>
            {(authorization.state !== "authorized") && (
                <Stack spacing={3} sx={{ justifyContent: "center", alignItems: "center", margin: 3 }}>
                    <Typography variant="body1" sx={descriptionStyle}>
                        Need to authorize to edit the ERD file on the Google Drive.
                    </Typography>
                    <Button variant="contained" size="large" sx={containedButtonStyle} onClick={authorize}>
                        Authorize with Google
                    </Button>
                </Stack>
            )}

            {(gdriveFolderId != null) && (erdDocument == null) && (
                <InitializeDatabaseDialog
                    isOpen={(gdriveFolderId != null) && (erdDocument == null)}
                    onCreate={handleCreateDocument}
                    onClose={() => { }} />
            )}

            {(ermImportUiState.phase === "confirming") &&
                initErmImportConfirmation(ermImportUiState.pending, handleConfirmErmImport, handleCancelErmImport)}

            {(ermImportUiState.phase === "failed") && (
                <Stack spacing={2} sx={{ margin: 3 }}>
                    <Alert severity="error">
                        <AlertTitle>Failed to import the .erm file.</AlertTitle>
                        {ermImportUiState.message}
                    </Alert>
                </Stack>
            )}

            {onProcessing && (<CircularProgress />)}
        </GoogleDriveNoticeLayout>
    );
};

// .erm インポートは「確認待ち」と「失敗表示」を同時に取り得ないため、1つの判別可能ユニオンで表現する
// (coding-style.md ルール16: 独立した2つの useState による疑似ブール状態を禁止)。
type ErmImportUiState = { phase: "idle" }
    | { phase: "confirming", pending: PendingErmImport }
    | { phase: "failed", message: string };

// .erm を変換済みだが、同名 .erd の有無をユーザーに確認してから保存を確定させるための保留状態。
// 既存の設計成果を無言で失わないため (VSCode 拡張の ErmImportProvider と同じ方針)。
type PendingErmImport = {
    ermFileName: string,
    documentName: string,
    erdDocument: ErdDocument,
    summaries: ErmLoadSummary[],
    folderId: string,
    // 上書き先ファイルの情報。null は同名の .erd がまだ存在しない (新規作成) ことを表す。
    existingErdFile: { fileId: string, version: string } | null
};

type GdriveState = { action: "open", fileId: string }
    | { action: "create", folderId: string }
    | { action: "none" };

const useGdriveStateParam = (): GdriveState => {
    const [urlParams] = useSearchParams();
    const stateValue = urlParams.get("state") || "{}";

    // JSON.parse は毎レンダー新規オブジェクトを返すため、そのまま使うと参照が安定せず
    // これを依存配列に含む useEffect が無限に再実行される。実体は stateValue (文字列) なので、
    // それをキーに useMemo でラップして参照を安定させる。
    return React.useMemo((): GdriveState => {
        const gdriveState = JSON.parse(stateValue);
        if (("action" in gdriveState) === false) {
            console.error(`Not found action value in state query. ${stateValue}`);
            return { action: "none" };
        }

        if ((gdriveState.action === "open") && ("ids" in gdriveState)) {
            const fileIds = gdriveState.ids as string[];
            return { action: "open", fileId: fileIds[0] };
        }

        if ((gdriveState.action === "create") && ("folderId" in gdriveState)) {
            const folderId = gdriveState.folderId as string;
            return { action: "create", folderId };
        }

        console.error(`Invalid state. ${stateValue}`);

        return { action: "none" };
    }, [stateValue]);
};

const initHandleOpenedFile = (
    accessToken: string,
    onInitialize: (gdriveFile: GdriveFile) => void,
    setErmImportUiState: (state: ErmImportUiState) => void
) => {
    return (result: GdriveOpenResult) => {
        if (result.fileType === "erd") {
            onInitialize(result);
            return;
        }

        if (result.fileType === "erm-failed") {
            setErmImportUiState({ phase: "failed", message: `"${result.ermFileName}": ${result.failureMessage}` });
            return;
        }

        if (result.folderId == null) {
            setErmImportUiState({
                phase: "failed",
                message: `Could not determine the folder of "${result.ermFileName}". ` +
                    "Please try opening it again from Google Drive."
            });

            return;
        }

        const folderId = result.folderId;
        findSiblingGdriveFile({ accessToken, folderId, fileName: `${result.documentName}.erd` })
            .then(sibling => {
                const pending: PendingErmImport = { ...result, folderId, existingErdFile: sibling };
                setErmImportUiState({ phase: "confirming", pending });
            }).catch(error => {
                // 検索失敗を「同名ファイルなし」として扱うと重複ファイル作成につながるため、
                // 確認状態には進めずに失敗として提示する (サイレントな補正をしない)。
                console.error(`Failed to check for an existing file. ${error}`);

                setErmImportUiState({
                    phase: "failed",
                    message: `Failed to check for an existing "${result.documentName}.erd" in the destination folder.`
                });
            });
    };
};

const finalizeErmImport = async (pending: PendingErmImport, accessToken: string): Promise<GdriveFile> => {
    if (pending.existingErdFile == null) {
        return createGdriveFile({ accessToken, folderId: pending.folderId, erdDocument: pending.erdDocument });
    }

    const { fileId, version } = pending.existingErdFile;

    // GoogleDriveFile の doUpdateDocument と同じ楽観的排他チェックを、上書き直前にも経由させる。
    await verifyGdriveVersionOrThrow({ accessToken, fileId, currentVersion: version });

    const result = await updateGdriveFile({ accessToken, fileId, erdDocument: pending.erdDocument });
    return { fileId, erdDocument: pending.erdDocument, version: result.version };
};

const initHandleFinalizedErmImport = (
    onInitialize: (gdriveFile: GdriveFile) => void,
    setErmImportUiState: (state: ErmImportUiState) => void
) => {
    return (gdriveFile: GdriveFile) => {
        setErmImportUiState({ phase: "idle" });
        onInitialize(gdriveFile);
    };
};

const initErmImportConfirmation = (pending: PendingErmImport, onConfirm: () => void, onCancel: () => void) => {
    const reportedSummaries = pending.summaries.filter(summary => (summary.result !== "success"));

    return (
        <Stack spacing={2} sx={{ margin: 3, maxWidth: 480 }}>
            <Alert severity="info">
                <AlertTitle>Import &quot;{pending.ermFileName}&quot;</AlertTitle>
                {(pending.existingErdFile != null)
                    ? `This will overwrite the existing "${pending.documentName}.erd" in the same folder.`
                    : `This will create a new "${pending.documentName}.erd" in the same folder.`}
            </Alert>
            <ConversionReportAlert items={reportedSummaries} />
            <Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
                <Button variant="outlined" onClick={onCancel}>Cancel</Button>
                <Button variant="contained" sx={containedButtonStyle} onClick={onConfirm}>
                    {(pending.existingErdFile != null) ? "Overwrite and open" : "Import and open"}
                </Button>
            </Stack>
        </Stack>
    );
};

export default GoogleDriveInitializer;
