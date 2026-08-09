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
import { AuthorizationToken, GdriveAuthorization } from "~/features/gdrive/gdrive-authorization";

type SessionDocument = {
    erdDocument: ErdDocument,
    version: string
};

// 同期は「待機 → 実行中 → 待機」を繰り返し、認可エラーのときだけ unauthorized へ落ちる。
// unauthorized は再認可 (effect の張り直し) でしか解除されないため、idle と区別する。
type RemoteSyncState = "idle" | "syncing" | "unauthorized";

type GoogleDriveFileProp = {
    authorization: GdriveAuthorization
};

const GoogleDriveFile = ({ authorization: gdriveAuthorization }: GoogleDriveFileProp) => {
    const { authorization, authorize } = gdriveAuthorization;
    const [sessionDocument, setSessionDocument] = React.useState<SessionDocument | null>(initSessionDocument);
    const [messageToast, setMessageToast] = React.useState<MessageToast | null>(null);
    const updateQueueRef = React.useRef<Promise<string>>(Promise.resolve(""));
    const latestDocumentRef = React.useRef<ErdDocument | null>(null);
    const importedDocumentRef = React.useRef<ErdDocument | null>(null);
    const pendingDocumentRef = React.useRef<ErdDocument | null>(null);
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

        // 期限切れ中は Drive へ書き込めないため保留する。再認可後にまとめて 1 件だけ保存する。
        if (authorization.state !== "authorized") {
            pendingDocumentRef.current = erdDocument;
            return;
        }

        const updateFunction = async (currentVersion: string) => {
            const updateArgs = {
                accessToken: authorization.accessToken, fileId: gdriveFileId,
                currentVersion, nextDocument: erdDocument, loggingMessage: message,
                setMessageToast, setSessionDocument
            };
            return doUpdateDocument(updateArgs);
        };

        enqueueUpdateTask(updateFunction, "save document");
    }, [sessionDocument, gdriveFileId, authorization, enqueueUpdateTask]);

    const exportSpecification = React.useCallback((erdDocument: ErdDocument) => {
        const specInfo = exportSpreadSheetFormatSpecification(erdDocument);

        createSpreadSheet(authorization.accessToken, specInfo).then(spreadSheetId => {
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
    }, [authorization.accessToken]);

    // 再読み込みされた場合の制御
    React.useEffect(() => {
        if ((sessionDocument != null) || (gdriveFileId == null)) {
            return;
        }

        // 再読み込みされた直後は token がクリアされるので、再度認証を行ったうえで最新のファイルを取得する。
        if (authorization.state !== "authorized") {
            return;
        }

        openGdriveFile({
            accessToken: authorization.accessToken, fileId: gdriveFileId
        }).then(gdriveFile => {
            setSessionDocument({ erdDocument: gdriveFile.erdDocument, version: gdriveFile.version });
        }).catch(error => {
            console.error(`Failed to open file. ${error}`);
        });
    }, [authorization, sessionDocument, gdriveFileId]);

    // 期限が近づいたら再認可を促す。無音更新に成功すると expiresAt が延びて effect が張り直されるため、
    // 通知は自分で消える。失効しても編集は続けられるので、その間は通知を出したままにする。
    React.useEffect(() => {
        if (authorization.state === "unauthorized") {
            return;
        }

        if (authorization.state === "expired") {
            const expiredToast = initReauthorizeToast(setMessageToast, authorize, EXPIRED_MESSAGE);
            setMessageToast(expiredToast);
            return;
        }

        setMessageToast(current => {
            // 対応を促している通知 (競合・再読み込み) を消さないよう、
            // 差し替えるのは再認可を促す通知が出ている場合と、何も出ていない場合だけに限る。
            if ((current != null) && (current.kind !== "reauthorize")) {
                return current;
            }

            // 無音更新は利用者の操作なしに完了するため、再認可済みで編集を続けられることを知らせる。
            if (authorization.grantedBy !== "silentRenewal") {
                return null;
            }

            return {
                severity: "info",
                message: "Your Google authorization has been renewed automatically.\n"
                    + "You can continue editing and saving to Google Drive.",
                action: initCloseToastButton(setMessageToast),
                autoHideMills: 5 * 1000
            };
        });

        const remainedTime = authorization.expiresAt - new Date().getTime();
        const notifyTimerId = setTimeout(() => {
            const expiringToast = initReauthorizeToast(setMessageToast, authorize, EXPIRING_MESSAGE);
            setMessageToast(expiringToast);
        }, remainedTime - NOTIFY_LEAD_MILLS);

        return () => {
            clearTimeout(notifyTimerId);
        };
    }, [authorization, authorize]);

    // 期限切れ中に保留した編集を、再認可できた時点で保存する。
    // Drive 側が更新されていれば doUpdateDocument の version 比較が競合を検知するため、上書きにはならない。
    React.useEffect(() => {
        if (authorization.state !== "authorized") {
            return;
        }

        const pendingDocument = pendingDocumentRef.current;
        if ((pendingDocument == null) || (gdriveFileId == null)) {
            return;
        }

        pendingDocumentRef.current = null;

        const savePendingTask = initSavePendingTask({
            accessToken: authorization.accessToken, fileId: gdriveFileId,
            nextDocument: pendingDocument, setMessageToast, setSessionDocument
        });
        enqueueUpdateTask(savePendingTask, "save pending document");
    }, [authorization, gdriveFileId, enqueueUpdateTask]);

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
            authorization, authorize, fileId: gdriveFileId,
            latestDocumentRef, importedDocumentRef, syncStateRef,
            enqueueUpdateTask, setMessageToast
        });

        window.addEventListener(REMOTE_SYNC_REQUESTED_EVENT, handleSyncRequest);

        return () => {
            window.removeEventListener(REMOTE_SYNC_REQUESTED_EVENT, handleSyncRequest);
        };
    }, [sessionDocument, gdriveFileId, authorization, authorize, enqueueUpdateTask]);

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
        return (
            <GoogleDriveNoticeLayout>
                {(authorization.state === "authorized") ? (<CircularProgress />) : (
                    <Stack spacing={3} sx={{ justifyContent: "center", alignItems: "center", margin: 3 }}>
                        <Typography variant="body1" sx={descriptionStyle}>
                            Need to re-authorize to edit the ERD file on the Google Drive.
                        </Typography>
                        <Button variant="contained" size="large" sx={containedButtonStyle} onClick={authorize}>
                            Authorize with Google
                        </Button>
                    </Stack>
                )}
            </GoogleDriveNoticeLayout>
        );
    }

    const handleCloseToast = (_event: React.SyntheticEvent | Event, reason: SnackbarCloseReason) => {
        // cSpell:ignore clickaway
        if (reason === "clickaway") {
            return;
        }
        // 自動非表示指定のないトースト (Reload/Reauthorize 等の明示操作が前提) は Escape でも閉じない。
        if ((reason === "escapeKeyDown") && (messageToast?.autoHideMills == null)) {
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
    autoHideMills?: number,
    // 再認可を促す通知だけは無音更新の成功時に取り下げる必要があるため、他の通知と区別できるようにする。
    kind?: "reauthorize"
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

// 無音更新はユーザ操作に便乗するため、放置されている間は走らない。
// 手動の Reauthorize へ切り替えられる猶予として、失効前に通知を出す。
const NOTIFY_LEAD_MILLS = 3 * 60 * 1000;

const EXPIRING_MESSAGE = "Your session is about to expire in less than a few minutes.\n"
    + "Please reauthorize your Google account\n"
    + "to continue using the service without interruption.";

const EXPIRED_MESSAGE = "Your session has expired.\n"
    + "Your edits are kept in this tab but are no longer saved to Google Drive.\n"
    + "Please reauthorize your Google account to resume saving.";

const initReauthorizeToast = (
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>,
    authorize: () => void,
    message: string
): MessageToast => {
    const handleRenewToken = (event: React.MouseEvent) => {
        event.stopPropagation();

        setMessageToast(null);
        authorize();
    };

    return {
        severity: "warning",
        message,
        action: (<Button color="inherit" size="small" onClick={handleRenewToken}>Reauthorize</Button>),
        kind: "reauthorize"
    };
};

const initSavePendingTask = (
    args: Omit<DoUpdateDocumentArgs, "currentVersion" | "loggingMessage">
): UpdateTask => {
    return async (currentVersion: string) => {
        return doUpdateDocument({ ...args, currentVersion, loggingMessage: "save pending document" });
    };
};

type HandleSyncRemoteRequestArgs = {
    authorization: AuthorizationToken,
    authorize: () => void,
    fileId: string,
    latestDocumentRef: React.RefObject<ErdDocument | null>,
    importedDocumentRef: React.RefObject<ErdDocument | null>,
    syncStateRef: React.RefObject<RemoteSyncState>,
    enqueueUpdateTask: (task: UpdateTask, taskName: string) => void,
    setMessageToast: React.Dispatch<React.SetStateAction<MessageToast | null>>
};

const initHandleSyncRemoteRequest = (args: HandleSyncRemoteRequestArgs) => {
    return () => {
        if (args.latestDocumentRef.current?.erdSettingModel.syncRemoteChanges !== true) {
            return;
        }

        if (args.syncStateRef.current !== "idle") {
            return;
        }

        if (args.authorization.state !== "authorized") {
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
                accessToken: args.authorization.accessToken,
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
                const expiredToast = initReauthorizeToast(
                    args.setMessageToast, args.authorize, EXPIRED_MESSAGE);
                args.setMessageToast(expiredToast);
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

    // 取り込みは JSON から全モデルを再構築するため、ローカル編集と違い未変更モデルのインスタンス共有が起きない。
    // undo 履歴 (最大100件) に完全コピーが積み上がるのを防ぐため、現在のドキュメントと内容が一致するモデルはここでインスタンスを寄せておく。
    // 全フィールドが再利用された場合 (= 内容が完全に同一) は currentDocument 自身が返るため、
    // modifiedTime だけが進んだ無変更保存 (他ユーザーの無変更保存等) を === で安価に検知できる。
    const currentDocument = args.latestDocumentRef.current;
    const importedDocument = (currentDocument != null)
        ? remoteUpdate.erdDocument.reuseInstancesFrom(currentDocument)
        : remoteUpdate.erdDocument;

    if (importedDocument === currentDocument) {
        return remoteUpdate.version;
    }

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