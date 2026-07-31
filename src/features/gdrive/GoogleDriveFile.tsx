import React from "react";
import {
    Alert, Button, CircularProgress, IconButton, Snackbar, SnackbarCloseReason, Stack, Typography
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';

import {
    createSpreadSheet, findGdriveMetadata, findRemoteUpdated, GdriveRequestError, openGdriveFile, updateGdriveFile
} from "~/features/gdrive/gdrive-file-support";
import ErdApplicationShell from "~/features/ErdApplicationShell";
import ErdDocument from "~/models/ErdDocument";
import GoogleDriveNoticeLayout from "~/features/gdrive/GoogleDriveNoticeLayout";
import exportSpreadSheetFormatSpecification from "~/features/spec/GoogleSpreadSheetFormatSpecification";
import { containedButtonStyle, descriptionStyle } from "~/features/start_up/start-up-styles";
import { EXTERNAL_DOCUMENT_CHANGED_EVENT, REMOTE_SYNC_REQUESTED_EVENT } from "~/components/constant";

type SessionDocument = {
    erdDocument: ErdDocument,
    version: string
};

// 同期は「待機 → 実行中 → 待機」を繰り返し、認可エラーのときだけ unauthorized へ落ちる。
// unauthorized は再認可 (effect の張り直し) でしか解除されないため、idle と区別する。
type RemoteSyncState = "idle" | "syncing" | "unauthorized";

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
    const syncStateRef = React.useRef<RemoteSyncState>("idle");

    const gdriveFileId = sessionStorage.getItem("gdriveFileId");

    const enqueueUpdateTask = React.useCallback((task: UpdateTask, taskName: string) => {
        const safeTask = initSafeUpdateTask(task, taskName);
        updateQueueRef.current = updateQueueRef.current.then(safeTask);
    }, []);

    // ErdApplicationShell は React.memo でラップされているため、
    // handleSave/exportSpecification の参照が render のたびに変わると memo が素通りし MainView 以下が再構築される。
    // useCallback で安定化し、依存は実際に値の変わるものだけに絞る。
    const handleSave = React.useCallback((erdDocument: ErdDocument, message: string) => {
        latestDocumentRef.current = erdDocument;

        if ((sessionDocument == null) || (gdriveFileId == null)) {
            return;
        }
        if (importedDocumentRef.current === erdDocument) {
            return;
        }

        const updateFunction = async (currentVersion: string) => {
            const updateArgs = {
                accessToken: implicitToken.accessToken, fileId: gdriveFileId,
                currentVersion, nextDocument: erdDocument, loggingMessage: message,
                setMessageToast, setSessionDocument
            };
            return doUpdateDocument(updateArgs);
        };

        enqueueUpdateTask(updateFunction, "save document");
    }, [sessionDocument, gdriveFileId, implicitToken, enqueueUpdateTask]);

    const exportSpecification = React.useCallback((erdDocument: ErdDocument) => {
        const specInfo = exportSpreadSheetFormatSpecification(erdDocument);

        createSpreadSheet(implicitToken.accessToken, specInfo).then(spreadSheetId => {
            const handleOpenSpec = (event: React.MouseEvent) => {
                event.stopPropagation();

                setMessageToast(null);
                window.open(`https://docs.google.com/spreadsheets/d/${spreadSheetId}`);
            };

            const nextToast: MessageToast = {
                severity: "success",
                message: "A new specification file has been created in your My Drive.",
                action: (<>
                    <Button color="inherit" size="small" variant="outlined" onClick={handleOpenSpec}>
                        Open
                    </Button>
                    {initCloseToastButton(setMessageToast)}
                </>)
            };
            setMessageToast(nextToast);
        }).catch(error => {
            console.error(`Failed to create spread sheet. ${error}`);

            const failedToast: MessageToast = {
                severity: "error",
                message: `Failed to create a new spread sheet.\n${error}`,
                action: initCloseToastButton(setMessageToast)
            };
            setMessageToast(failedToast);
        });
    }, [implicitToken.accessToken]);

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

    // リモートの更新を取り込む。契機は REMOTE_SYNC_REQUESTED_EVENT のみで、
    // 定期実行と手動更新のどちらもタイトルパネル (RemoteSyncIndicator) 側から同じイベントとして届く。
    // 保存と直列化するため更新キューへ積む。
    React.useEffect(() => {
        if ((sessionDocument == null) || (gdriveFileId == null)) {
            return;
        }

        // 認可エラーは再認可まで解消しないため、トークン更新 (= 本 effect の張り直し) で停止を解除する。
        // ただし実行中の同期 task はこのリセットを知らず、直後に旧トークンの 401 が届くと解除したはずの unauthorized が再び立つ。
        // 解消には task 側に世代を持たせる必要がある。
        syncStateRef.current = "idle";

        const handleSyncRequest = initHandleSyncRemoteRequest({
            implicitToken, fileId: gdriveFileId,
            latestDocumentRef, importedDocumentRef, syncStateRef,
            enqueueUpdateTask, setMessageToast, authorize
        });

        window.addEventListener(REMOTE_SYNC_REQUESTED_EVENT, handleSyncRequest);

        return () => {
            window.removeEventListener(REMOTE_SYNC_REQUESTED_EVENT, handleSyncRequest);
        };
    }, [sessionDocument, gdriveFileId, implicitToken, authorize, enqueueUpdateTask]);

    // 初回描画後に、リダイレクト時にドキュメント情報を保持していたセッションを破棄する
    React.useEffect(() => {
        sessionStorage.removeItem("temporaryDocument");
    }, []);

    if (gdriveFileId == null) {
        return (
            <GoogleDriveNoticeLayout>
                <Stack spacing={3} sx={{ justifyContent: "center", alignItems: "center", margin: 3 }}>
                    <Typography variant="body1" sx={descriptionStyle}>
                        Invalid access. Please open the file from the Google Drive.
                    </Typography>
                </Stack>
            </GoogleDriveNoticeLayout>
        );
    }

    if (sessionDocument == null) {
        const currentDate = new Date().getTime();

        return (
            <GoogleDriveNoticeLayout>
                {(implicitToken.expiresAt < currentDate) ? (
                    <Stack spacing={3} sx={{ justifyContent: "center", alignItems: "center", margin: 3 }}>
                        <Typography variant="body1" sx={descriptionStyle}>
                            Need to re-authorize to edit the ERD file on the Google Drive.
                        </Typography>
                        <Button variant="contained" size="large" sx={containedButtonStyle} onClick={authorize}>
                            Authorize with Google
                        </Button>
                    </Stack>
                ) : (
                    <CircularProgress />
                )}
            </GoogleDriveNoticeLayout>
        );
    }

    const handleCloseToast = (_event: React.SyntheticEvent | Event, reason: SnackbarCloseReason) => {
        // cSpell:ignore clickaway
        if (reason === "clickaway") {
            return;
        }

        setMessageToast(null);
    };

    const messageDisplay = (messageToast == null) ? (<></>) : (
        <Snackbar open={true} anchorOrigin={{ vertical: "top", horizontal: "right" }}
            autoHideDuration={messageToast.autoHideMills ?? null} onClose={handleCloseToast}>
            <Alert severity={messageToast.severity} variant="filled" sx={{
                whiteSpace: "pre-line",
                ".MuiAlert-action": { alignItems: "center" }
            }} action={messageToast.action}>
                {messageToast.message}
            </Alert>
        </Snackbar>
    );

    return (<>
        <ErdApplicationShell erdDocument={sessionDocument.erdDocument}
            onSave={handleSave} erdExportable={false} remoteSync={true}
            exportSpecification={exportSpecification} />
        {messageDisplay}
    </>);
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

type MessageToast = {
    severity: "info" | "success" | "warning" | "error",
    message: string,
    action: React.ReactNode,
    autoHideMills?: number
};

type DoUpdateDocumentArgs = {
    accessToken: string,
    fileId: string,
    currentVersion: string,
    nextDocument: ErdDocument,
    loggingMessage: string,
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    setSessionDocument: React.Dispatch<React.SetStateAction<SessionDocument | null>>
};

const doUpdateDocument = async (args: DoUpdateDocumentArgs): Promise<string> => {
    const latestMetadata = await findGdriveMetadata({ accessToken: args.accessToken, fileId: args.fileId });

    if (args.currentVersion !== latestMetadata.version) {
        console.warn("The document has been updated by another user."
            + ` currentVersion = ${args.currentVersion}, gdriveVersion = ${latestMetadata.version}`);

        args.setMessageToast(initConflictToast(args.nextDocument, args.setMessageToast, args.setSessionDocument));

        return args.currentVersion;
    }

    const withUpdateName = (`${args.nextDocument.documentName}.erd` !== latestMetadata.fileName);
    const result = await updateGdriveFile({
        accessToken: args.accessToken, fileId: args.fileId,
        erdDocument: args.nextDocument, withName: withUpdateName
    });

    console.info(`Succeed to update gdrive file (${JSON.stringify(result)}). ${args.loggingMessage}`);

    return result.version;
};

const initConflictToast = (
    nextDocument: ErdDocument,
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    setSessionDocument: React.Dispatch<React.SetStateAction<SessionDocument | null>>
): MessageToast => {
    if (nextDocument.erdSettingModel.syncRemoteChanges === true) {
        return {
            severity: "warning",
            message: "Another user has made updates that conflict with your changes.\n"
                + "The latest content will be synced automatically in a few seconds.",
            action: initCloseToastButton(setMessageToast)
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
        action: (<Button color="inherit" size="small" onClick={handleReload}>Reload</Button>)
    };
};

type UpdateTask = (currentVersion: string) => Promise<string>;

// チェーンが reject すると以降のタスクが一切実行されなくなるため、タスクは失敗しても必ず現行 version を返して解決させる。
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
        action: (<Button color="inherit" size="small" onClick={handleRenewToken}>Reauthorize</Button>)
    };
};

type HandleSyncRemoteRequestArgs = {
    implicitToken: { accessToken: string, expiresAt: number },
    fileId: string,
    latestDocumentRef: React.RefObject<ErdDocument | null>,
    importedDocumentRef: React.RefObject<ErdDocument | null>,
    syncStateRef: React.RefObject<RemoteSyncState>,
    enqueueUpdateTask: (task: UpdateTask, taskName: string) => void,
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    authorize: () => void
};

const initHandleSyncRemoteRequest = (args: HandleSyncRemoteRequestArgs) => {
    return () => {
        if (args.latestDocumentRef.current?.erdSettingModel.syncRemoteChanges !== true) {
            return;
        }

        if (args.syncStateRef.current !== "idle") {
            return;
        }

        if (args.implicitToken.expiresAt < Date.now()) {
            return;
        }

        args.syncStateRef.current = "syncing";

        const remoteSyncTask = initRemoteSyncTask(args);
        args.enqueueUpdateTask(remoteSyncTask, "sync remote update");
    };
};

const initRemoteSyncTask = (args: HandleSyncRemoteRequestArgs): UpdateTask => {
    return async (currentVersion: string) => {
        try {
            const nextVersion = await doImportRemoteUpdate({
                accessToken: args.implicitToken.accessToken,
                fileId: args.fileId,
                currentVersion,
                latestDocumentRef: args.latestDocumentRef,
                importedDocumentRef: args.importedDocumentRef,
                onImported: initHandleImported(args.setMessageToast)
            });

            args.syncStateRef.current = "idle";

            return nextVersion;
        } catch (error) {
            const nextState = toStateAfterSyncFailure(error);
            args.syncStateRef.current = nextState;

            if (nextState === "unauthorized") {
                args.setMessageToast(initReauthorizeToast(args.setMessageToast, args.authorize));
            } else {
                console.warn(`Failed to sync remote updated. ${error}`);
            }

            return currentVersion;
        }
    };
};

// 認可エラーは再認可するまで再試行しても必ず失敗するため、以降の要求を受け付けない状態へ落とす。
const toStateAfterSyncFailure = (error: unknown): RemoteSyncState => {
    if ((error instanceof GdriveRequestError) && ((error.status === 401) || (error.status === 403))) {
        return "unauthorized";
    }

    return "idle";
};

const initHandleImported = (setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>) => {
    return () => {
        const importedToast = initImportedToast(setMessageToast);
        setMessageToast(importedToast);
    };
};

const initImportedToast = (
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>
): MessageToast => {
    return {
        severity: "info",
        message: "The latest changes on Google Drive have been imported.",
        action: initCloseToastButton(setMessageToast),
        autoHideMills: 5 * 1000
    };
};

const initCloseToastButton = (
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>
): React.ReactNode => {
    const handleCloseToast = (event: React.MouseEvent) => {
        event.stopPropagation();

        setMessageToast(null);
    };

    return (
        <IconButton size="small" aria-label="close" color="inherit" onClick={handleCloseToast}>
            <CloseIcon fontSize="small" />
        </IconButton>
    );
};

type ImportRemoteUpdateArgs = {
    accessToken: string,
    fileId: string,
    currentVersion: string,
    latestDocumentRef: React.RefObject<ErdDocument | null>,
    importedDocumentRef: React.RefObject<ErdDocument | null>,
    onImported: () => void
};

const doImportRemoteUpdate = async (args: ImportRemoteUpdateArgs): Promise<string> => {
    const remoteUpdate = await findRemoteUpdated({
        accessToken: args.accessToken, fileId: args.fileId, currentVersion: args.currentVersion
    });

    if (remoteUpdate.updated === false) {
        return args.currentVersion;
    }

    // modifiedTime だけが進み内容が同一の場合 (他ユーザーの無変更保存等)、取り込んでも履歴・画面は変化しないため、
    // 通知と全体再描画だけが空振りするのを避ける。
    const currentDocument = args.latestDocumentRef.current;
    if ((currentDocument != null) && currentDocument.equals(remoteUpdate.erdDocument)) {
        return remoteUpdate.version;
    }

    // 取り込みは JSON から全モデルを再構築するため、ローカル編集と違い未変更モデルのインスタンス共有が起きない。
    // undo 履歴 (最大100件) に完全コピーが積み上がるのを防ぐため、現在のドキュメントと内容が一致するモデルはここでインスタンスを寄せておく。
    const importedDocument = (currentDocument != null)
        ? remoteUpdate.erdDocument.reuseInstancesFrom(currentDocument)
        : remoteUpdate.erdDocument;

    dispatchExternalDocumentChanged(args.importedDocumentRef, importedDocument);
    args.onImported();

    return remoteUpdate.version;
};

/**
 * 履歴管理は MainView の documentsHolder が担うため CustomEvent へ委譲する。
 * dispatch は同期実行されるため、その区間だけ取り込み対象を保持して
 * 直後に誘発される同一内容の保存を打ち消す。
 */
const dispatchExternalDocumentChanged = (
    importedDocumentRef: React.RefObject<ErdDocument | null>, erdDocument: ErdDocument
) => {
    importedDocumentRef.current = erdDocument;

    try {
        const customEvent = new CustomEvent(EXTERNAL_DOCUMENT_CHANGED_EVENT, { detail: { erdDocument } });
        window.dispatchEvent(customEvent);
    } finally {
        importedDocumentRef.current = null;
    }
};

export default GoogleDriveFile;