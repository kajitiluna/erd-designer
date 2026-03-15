import React from "react";
import {
    Alert, Box, Button, CircularProgress, IconButton, Snackbar, Stack, Typography
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';

import {
    createSpreadSheet, findGdriveMetadata, openGdriveFile, updateGdriveFile
} from "~/features/gdrive/gdrive-file-support";
import MainView from "~/features/MainView";
import ErdDocument from "~/models/ErdDocument";
import Logo from "~/logo.svg";
import ExportSpecificationContext from "~/context/ExportSpecificationContext";
import exportSpreadSheetFormatSpecification from "~/features/spec/GoogleSpreadSheetFormatSpecification";

type GoogleDriveFileProp = {
    implicitToken: { accessToken: string, expiresAt: number },
    authorize: () => void
};

const GoogleDriveFile = ({ implicitToken, authorize }: GoogleDriveFileProp) => {
    const [sessionDocument, setSessionDocument] = React.useState<SessionDocument | null>(initSessionDocument);
    const [messageToast, setMessageToast] = React.useState<MessageToast | null>(null);
    const updateQueueRef = React.useRef<Promise<string>>(Promise.resolve(""));

    const gdriveFileId = sessionStorage.getItem("gdriveFileId");

    const handleSave = (erdDocument: ErdDocument, message: string) => {
        if (sessionDocument == null) {
            return;
        }

        const updateFunction = async (currentVersion: string) => doUpdateDocument(currentVersion, erdDocument, message);
        updateQueueRef.current = updateQueueRef.current.then(updateFunction);
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

            const handleReload = (event: React.MouseEvent) => {
                event.stopPropagation();

                setMessageToast(null);
                setSessionDocument(null);
            };

            setMessageToast({
                severity: "error",
                message: "Another user has made updates that conflict with your changes.\n"
                    + "Please reload the latest version of the content.",
                action: (
                    <Button color="inherit" size="small" onClick={handleReload}>
                        Reload
                    </Button>
                )
            });

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

        const handleRenewToken = (event: React.MouseEvent) => {
            event.stopPropagation();

            setMessageToast(null);
            authorize();
        };

        const notifyTimerId = setTimeout(() => {
            setMessageToast({
                severity: "warning",
                message: "Your session is about to expire in less than a few minutes.\n"
                    + "Please reauthorize your Google account\n"
                    + "to continue using the service without interruption.",
                action: (
                    <Button color="inherit" size="small" onClick={handleRenewToken}>
                        Reauthorize
                    </Button>
                )
            });
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

        updateQueueRef.current = updateQueueRef.current.then(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (_version: string) => sessionDocument.version
        );
    }, [sessionDocument, gdriveFileId]);

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
                        <Button variant="contained" size="large" onClick={authorize}>
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
        <ExportSpecificationContext.Provider value={{ exportSpecification }}>
            <MainView erdDocument={sessionDocument.erdDocument}
                onSave={handleSave} erdExportable={false} />
            {messageDisplay}
        </ExportSpecificationContext.Provider>
    );
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

const initSessionDocument = (): (SessionDocument | null) => {
    const temporaryDocument = sessionStorage.getItem("temporaryDocument");

    if (temporaryDocument == null) {
        return null;
    }

    const jsonDocument = JSON.parse(temporaryDocument);
    if (!("erdDocument" in jsonDocument) || !("version" in jsonDocument)) {
        return null;
    }

    return {
        erdDocument: ErdDocument.toObject(jsonDocument.erdDocument),
        version: jsonDocument.version
    };
};

export default GoogleDriveFile;