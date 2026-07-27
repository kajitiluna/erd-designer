import React from "react";
import {
    Alert, Box, Button, CircularProgress, IconButton, Snackbar, Stack, Typography
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';

import {
    createSpreadSheet, findGdriveMetadata, findRemoteUpdate, GdriveRequestError, openGdriveFile, updateGdriveFile
} from "~/features/gdrive/gdrive-file-support";
import ErdApplicationShell from "~/features/ErdApplicationShell";
import ErdDocument from "~/models/ErdDocument";
import Logo from "~/logo.svg";
import exportSpreadSheetFormatSpecification from "~/features/spec/GoogleSpreadSheetFormatSpecification";
import { containedButtonStyle } from "~/features/start_up/start-up-styles";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT } from "~/components/constant";

type GoogleDriveFileProp = {
    implicitToken: { accessToken: string, expiresAt: number },
    authorize: () => void
};

const GoogleDriveFile = ({ implicitToken, authorize }: GoogleDriveFileProp) => {
    const [sessionDocument, setSessionDocument] = React.useState<SessionDocument | null>(initSessionDocument);
    const [messageToast, setMessageToast] = React.useState<MessageToast | null>(null);
    const updateQueueRef = React.useRef<Promise<string>>(Promise.resolve(""));
    const latestDocumentRef = React.useRef<ErdDocument | null>(null);
    const importedDocumentRef = React.useRef<ErdDocument | null>(null);
    const pollingStateRef = React.useRef<PollingState>({ suspended: false, inFlight: false });

    const gdriveFileId = sessionStorage.getItem("gdriveFileId");

    const enqueueUpdateTask = React.useCallback((task: UpdateTask, taskName: string) => {
        const safeTask = initSafeUpdateTask(task, taskName);
        updateQueueRef.current = updateQueueRef.current.then(safeTask);
    }, []);

    const handleSave = (erdDocument: ErdDocument, message: string) => {
        latestDocumentRef.current = erdDocument;

        if (sessionDocument == null) {
            return;
        }
        if (importedDocumentRef.current === erdDocument) {
            return;
        }

        const updateFunction = async (currentVersion: string) => doUpdateDocument(currentVersion, erdDocument, message);
        enqueueUpdateTask(updateFunction, "save document");
    };

    const doUpdateDocument = async (currentVersion: string, nextDocument: ErdDocument, loggingMessage: string) => {
        if (gdriveFileId == null) {
            return currentVersion;
        }

        const latestMetadata = await findGdriveMetadata({
            accessToken: implicitToken.accessToken, fileId: gdriveFileId
        });

        if (currentVersion !== latestMetadata.version) {
            console.warn("The document has been updated by another user."
                + ` currentVersion = ${currentVersion}, gdriveVersion = ${latestMetadata.version}`);

            setMessageToast(initConflictToast(nextDocument, setMessageToast, setSessionDocument));

            return currentVersion;
        }

        const withUpdateName = (`${nextDocument.documentName}.erd` !== latestMetadata.fileName);
        const result = await updateGdriveFile({
            accessToken: implicitToken.accessToken, fileId: gdriveFileId,
            erdDocument: nextDocument, withName: withUpdateName
        });

        console.info(`Succeed to update gdrive file (${JSON.stringify(result)}). ${loggingMessage}`);

        return result.version;
    };

    const closeToastButton = (
        <IconButton size="small" aria-label="close" color="inherit"
            onClick={() => setMessageToast(null)}>
            <CloseIcon fontSize="small" />
        </IconButton>
    );

    const exportSpecification = (erdDocument: ErdDocument) => {
        const specInfo = exportSpreadSheetFormatSpecification(erdDocument);

        createSpreadSheet(implicitToken.accessToken, specInfo).then(spreadSheetId => {
            const handleOpenSpec = (event: React.MouseEvent) => {
                event.stopPropagation();

                setMessageToast(null);
                window.open(`https://docs.google.com/spreadsheets/d/${spreadSheetId}`);
            };
            setMessageToast({
                severity: "success",
                message: "A new specification file has been created in your My Drive.",
                action: (
                    <>
                        <Button color="inherit" size="small" variant="outlined"
                            onClick={handleOpenSpec}>
                            Open
                        </Button>
                        {closeToastButton}
                    </>
                )
            });
        }).catch(error => {
            console.error(`Failed to create spread sheet. ${error}`);

            setMessageToast({
                severity: "error",
                message: `Failed to create a new spread sheet.\n${error}`,
                action: (closeToastButton)
            });
        });
    };

    // 再読み込みされた場合の制御
    React.useEffect(() => {
        if ((sessionDocument != null) || (gdriveFileId == null)) {
            return;
        }

        // 再読み込みされた直後は token がクリアされるので、再度認証を行ったうえで最新のファイルを取得する。
        if (implicitToken.expiresAt < new Date().getTime()) {
            return;
        }

        openGdriveFile({
            accessToken: implicitToken.accessToken, fileId: gdriveFileId
        }).then(gdriveFile => {
            setSessionDocument({ erdDocument: gdriveFile.erdDocument, version: gdriveFile.version });
        }).catch(error => {
            console.error(`Failed to open file. ${error}`);
        });
    }, [implicitToken, sessionDocument, gdriveFileId]);

    // アクセストークンの有効期限が切れる少し前に通知を表示する
    React.useEffect(() => {
        const currentDate = new Date().getTime();
        const remainedTime = implicitToken.expiresAt - currentDate;
        if (remainedTime <= 0) {
            setSessionDocument(null);
            return;
        }

        const notifyTimerId = setTimeout(() => {
            setMessageToast(initReauthorizeToast(setMessageToast, authorize));
        }, remainedTime - 3 * 60 * 1000);

        const timeoutTimerId = setTimeout(() => {
            setMessageToast(null);
            setSessionDocument(null);
        }, remainedTime);

        return () => {
            clearTimeout(timeoutTimerId);
            clearTimeout(notifyTimerId);
        };
    }, [implicitToken, authorize]);

    // ドキュメント読み込み直後に、現在のバージョンを保持する
    React.useEffect(() => {
        if ((sessionDocument == null) || (gdriveFileId == null)) {
            return;
        }

        latestDocumentRef.current = sessionDocument.erdDocument;

        updateQueueRef.current = updateQueueRef.current.then(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (_version: string) => sessionDocument.version
        );
    }, [sessionDocument, gdriveFileId]);

    // リモートの更新を一定間隔で取り込む。保存と直列化するため更新キューへ積む。
    React.useEffect(() => {
        if ((sessionDocument == null) || (gdriveFileId == null)) {
            return;
        }

        // 認可エラーは再認可まで解消しないため、トークン更新 (= 本 effect の張り直し) で停止を解除する
        pollingStateRef.current = { suspended: false, inFlight: false };

        const handleTick = initHandleRemotePollingTick({
            implicitToken, fileId: gdriveFileId,
            latestDocumentRef, importedDocumentRef, pollingStateRef,
            enqueueUpdateTask, setMessageToast, authorize
        });

        const timerId = setInterval(handleTick, REMOTE_POLLING_INTERVAL_MILLIS);
        return () => { clearInterval(timerId); };
    }, [sessionDocument, gdriveFileId, implicitToken, authorize, enqueueUpdateTask]);

    // 初回描画後に、リダイレクト時にドキュメント情報を保持していたセッションを破棄する
    React.useEffect(() => {
        sessionStorage.removeItem("temporaryDocument");
    }, []);

    const boxStyle = {
        marginTop: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    };

    if (gdriveFileId == null) {
        return (
            <Box sx={boxStyle}>
                <img src={Logo} alt="" width="200px" height="200px" />
                <Stack spacing={2} sx={{ justifyContent: "center", alignItems: "center", margin: "30px" }}>
                    <Typography variant="body1" gutterBottom>
                        Invalid access. Please open the file from the Google Drive.
                    </Typography>
                </Stack>
            </Box>
        );
    }

    if (sessionDocument == null) {
        const currentDate = new Date().getTime();

        return (
            <Box sx={boxStyle}>
                <img src={Logo} alt="" width="200px" height="200px" />
                <Typography variant="h2" align="center" style={{ marginBottom: "30px" }}>
                    Entity Relationship Diagram Designer
                </Typography>
                {(implicitToken.expiresAt < currentDate) ? (
                    <Stack spacing={2} sx={{ justifyContent: "center", alignItems: "center" }}>
                        <Typography variant="body1" gutterBottom>
                            Need to re-authorize to edit the ERD file on the Google Drive.
                        </Typography>
                        <Button variant="contained" size="large" sx={containedButtonStyle} onClick={authorize}>
                            Authorize with Google
                        </Button>
                    </Stack>
                ) : (
                    <CircularProgress />
                )}
            </Box>
        );
    }

    const messageDisplay = (messageToast == null) ? (<></>) : (
        <Snackbar open={true} anchorOrigin={{ vertical: "top", horizontal: "right" }}>
            <Alert severity={messageToast.severity} variant="filled"
                sx={{
                    whiteSpace: "pre-line",
                    ".MuiAlert-action": { alignItems: "center" }
                }} action={messageToast.action}>
                {messageToast.message}
            </Alert>
        </Snackbar>
    );

    return (
        <ErdApplicationShell erdDocument={sessionDocument.erdDocument}
            onSave={handleSave} erdExportable={false} remoteSyncable={true}
            exportSpecification={exportSpecification}>
            {messageDisplay}
        </ErdApplicationShell>
    );
};

const initConflictToast = (
    nextDocument: ErdDocument,
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    setSessionDocument: React.Dispatch<React.SetStateAction<SessionDocument | null>>
): MessageToast => {
    if (nextDocument.erdSettingModel.syncRemoteChanges === true) {
        const handleCloseConflictToast = (event: React.MouseEvent) => {
            event.stopPropagation();

            setMessageToast(null);
        };

        return {
            severity: "warning",
            message: "Another user has made updates that conflict with your changes.\n"
                + "The latest content will be synced automatically in a few seconds.",
            action: (
                <IconButton size="small" aria-label="close" color="inherit" onClick={handleCloseConflictToast}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            )
        };
    }

    const handleReload = (event: React.MouseEvent) => {
        event.stopPropagation();

        setMessageToast(null);
        setSessionDocument(null);
    };

    return {
        severity: "error",
        message: "Another user has made updates that conflict with your changes.\n"
            + "Please reload the latest version of the content.",
        action: (
            <Button color="inherit" size="small" onClick={handleReload}>
                Reload
            </Button>
        )
    };
};

// チェーンが reject すると以降のタスクが一切実行されなくなるため、
// タスクは失敗しても必ず現行 version を返して解決させる。
const initSafeUpdateTask = (task: UpdateTask, taskName: string): UpdateTask => {
    return async (currentVersion: string) => {
        try {
            return await task(currentVersion);
        } catch (error) {
            console.warn(`Failed to ${taskName}. ${error}`);
            return currentVersion;
        }
    };
};

const initReauthorizeToast = (
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    authorize: () => void
): MessageToast => {
    const handleRenewToken = (event: React.MouseEvent) => {
        event.stopPropagation();

        setMessageToast(null);
        authorize();
    };

    return {
        severity: "warning",
        message: "Your session is about to expire in less than a few minutes.\n"
            + "Please reauthorize your Google account\n"
            + "to continue using the service without interruption.",
        action: (
            <Button color="inherit" size="small" onClick={handleRenewToken}>
                Reauthorize
            </Button>
        )
    };
};

const initHandleRemotePollingTick = (args: HandleRemotePollingTickArgs) => {
    return () => {
        if (args.latestDocumentRef.current?.erdSettingModel.syncRemoteChanges !== true) {
            return;
        }
        if ((args.pollingStateRef.current.suspended === true) || (args.pollingStateRef.current.inFlight === true)) {
            return;
        }
        if (args.implicitToken.expiresAt < Date.now()) {
            return;
        }

        args.pollingStateRef.current.inFlight = true;

        const pollingTask = initPollingTask(args);
        args.enqueueUpdateTask(pollingTask, "poll remote update");
    };
};

const initPollingTask = (args: HandleRemotePollingTickArgs): UpdateTask => {
    return async (currentVersion: string) => {
        try {
            return await doImportRemoteUpdate({
                accessToken: args.implicitToken.accessToken,
                fileId: args.fileId,
                currentVersion,
                importedDocumentRef: args.importedDocumentRef,
                onImported: () => args.setMessageToast(null)
            });
        } catch (error) {
            if ((error instanceof GdriveRequestError) && ((error.status === 401) || (error.status === 403))) {
                args.pollingStateRef.current.suspended = true;
                args.setMessageToast(initReauthorizeToast(args.setMessageToast, args.authorize));
            } else {
                console.warn(`Failed to poll remote update. ${error}`);
            }
            return currentVersion;
        } finally {
            args.pollingStateRef.current.inFlight = false;
        }
    };
};

const doImportRemoteUpdate = async (args: ImportRemoteUpdateArgs): Promise<string> => {
    const remoteUpdate = await findRemoteUpdate({
        accessToken: args.accessToken, fileId: args.fileId, currentVersion: args.currentVersion
    });
    if (remoteUpdate.updated === false) {
        return args.currentVersion;
    }

    dispatchExternalDocumentChanged(args.importedDocumentRef, remoteUpdate.erdDocument);
    args.onImported();
    return remoteUpdate.version;
};

/**
 * 履歴管理は MainView の documentsHolder が担うため CustomEvent へ委譲する。
 * dispatch は同期実行されるため、その区間だけ取り込み対象を保持して
 * 直後に誘発される同一内容の保存を打ち消す。
 */
const dispatchExternalDocumentChanged = (
    importedDocumentRef: React.RefObject<ErdDocument | null>, erdDocument: ErdDocument) => {
    importedDocumentRef.current = erdDocument;
    try {
        const customEvent = new CustomEvent(EXTERNAL_DOCUMENT_CHANGED_EVENT, { detail: { erdDocument } });
        window.dispatchEvent(customEvent);
    } finally {
        importedDocumentRef.current = null;
    }
};

type SessionDocument = {
    erdDocument: ErdDocument,
    version: string
};

type MessageToast = {
    severity: "info" | "success" | "warning" | "error",
    message: string,
    action: React.ReactNode
};

type UpdateTask = (currentVersion: string) => Promise<string>;

type PollingState = { suspended: boolean, inFlight: boolean };

type ImportRemoteUpdateArgs = {
    accessToken: string,
    fileId: string,
    currentVersion: string,
    importedDocumentRef: React.RefObject<ErdDocument | null>,
    onImported: () => void
};

type HandleRemotePollingTickArgs = {
    implicitToken: { accessToken: string, expiresAt: number },
    fileId: string,
    latestDocumentRef: React.RefObject<ErdDocument | null>,
    importedDocumentRef: React.RefObject<ErdDocument | null>,
    pollingStateRef: React.RefObject<PollingState>,
    enqueueUpdateTask: (task: UpdateTask, taskName: string) => void,
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    authorize: () => void
};

const initSessionDocument = (): (SessionDocument | null) => {
    const temporaryDocument = sessionStorage.getItem("temporaryDocument");

    if (temporaryDocument == null) {
        return null;
    }

    const jsonDocument = JSON.parse(temporaryDocument);
    if ((("erdDocument" in jsonDocument) === false) || (("version" in jsonDocument) === false)) {
        return null;
    }

    return {
        erdDocument: ErdDocument.toObject(jsonDocument.erdDocument),
        version: jsonDocument.version
    };
};

const REMOTE_POLLING_INTERVAL_MILLIS = 10 * 1000;

export default GoogleDriveFile;