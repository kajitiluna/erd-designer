import React, { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";

import { findGdriveMetadata, openGdriveFile, updateGdriveFile } from "~/features/gdrive/gdrive-file-support";
import MainView from "~/features/MainView";
import ErdDocument from "~/models/ErdDocument";
import Logo from "~/logo.svg";

type GoogleDriveFileProp = {
    implictToken: { accessToken: string, expiresAt: number },
    authorize: () => void
};

const GoogleDriveFile = ({ implictToken, authorize }: GoogleDriveFileProp) => {
    const [sessionDocument, setSessionDocument] = useState<SessionDocument | null>(initSessionDocument);
    const updateQueueRef = React.useRef<Promise<string>>(Promise.resolve(""));

    const gdriveFileId = sessionStorage.getItem("gdriveFileId");

    const handleSave = (erdDocument: ErdDocument) => {
        if (sessionDocument == null) {
            return;
        }

        const updateFunction = async (currentVersion: string) => doUpdateDocument(currentVersion, erdDocument);
        updateQueueRef.current = updateQueueRef.current.then(updateFunction);
    };

    const doUpdateDocument = async (currentVersion: string, nextDocument: ErdDocument) => {
        if (gdriveFileId == null) {
            return currentVersion;
        }

        const latestMetadata = await findGdriveMetadata({
            accessToken: implictToken.accessToken, fileId: gdriveFileId
        });
        if (currentVersion !== latestMetadata.version) {
            console.warn("The document has been updated by another user."
                + ` currentVersion = ${currentVersion}, gdriveVersion = ${latestMetadata.version}`);
            return currentVersion;
        }

        const withUpdateName = (`${nextDocument.documentName}.erd` !== latestMetadata.fileName);
        const result = await updateGdriveFile({
            accessToken: implictToken.accessToken, fileId: gdriveFileId,
            erdDocument: nextDocument, withName: withUpdateName
        });

        console.info(`Succeed to update gdrive file. ${JSON.stringify(result)}`);

        return result.version;
    };

    // 再読み込みされた場合の制御
    useEffect(() => {
        if ((sessionDocument != null) || (gdriveFileId == null)) {
            return;
        }

        // 再読み込みされた直後は token がクリアされるので、再度認証を行ったうえで最新のファイルを取得する。
        if (implictToken.expiresAt < new Date().getTime()) {
            return;
        }

        openGdriveFile({
            accessToken: implictToken.accessToken, fileId: gdriveFileId
        }).then(gdriveFile => {
            setSessionDocument({ erdDocument: gdriveFile.erdDocument, version: gdriveFile.version });
        }).catch(error => {
            console.error(`Failed to open file. ${error}`);
        });
    }, [implictToken, sessionDocument, gdriveFileId]);

    // ドキュメント読み込み直後に、現在のバージョンを保持する
    useEffect(() => {
        if ((sessionDocument == null) || (gdriveFileId == null)) {
            return;
        }

        updateQueueRef.current = updateQueueRef.current.then(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (_version: string) => sessionDocument.version
        );
    }, [sessionDocument, gdriveFileId]);

    // 初回描画後に、リダイレクト時にドキュメント情報を保持していたセッションを破棄する
    useEffect(() => {
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
                {(implictToken.expiresAt < currentDate) ? (
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

    return (
        <MainView erdDocument={sessionDocument.erdDocument}
            onSave={handleSave} erdExortable={false} />
    );
};

type SessionDocument = {
    erdDocument: ErdDocument,
    version: string
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