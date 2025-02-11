import { Button, Stack } from "@mui/material";
import React, { useEffect, useState } from "react";
import { findGdriveMetadata, openGdriveFile, updateGdriveFile } from "~/features/gdrive/gdrive-file-support";
import MainView from "~/features/MainView";
import ErdDocument from "~/models/ErdDocument";

type GoogleDriveFileProp = {
    implictToken: { accessToken: string, expiresAt: number },
    authorize: () => void
};

const GoogleDriveFile = ({ implictToken, authorize }: GoogleDriveFileProp) => {
    const [sessionDocument, setSessionDocument] = useState<SessionDocument | null>(initSessionDocument);
    const authorizeRef = React.useRef<HTMLButtonElement>(null);
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
            console.warn("The document has been updated by another user.");
            return currentVersion;
        }

        const withUpdateName = (nextDocument.documentName !== latestMetadata.fileName);
        const result = await updateGdriveFile({
            accessToken: implictToken.accessToken, fileId: gdriveFileId,
            erdDocument: nextDocument, withName: withUpdateName
        });

        return result.version;
    };

    // 再読み込みされた場合の制御
    useEffect(() => {
        if ((sessionDocument != null) || (gdriveFileId == null)) {
            return;
        }

        // 再表示された直後は token がクリアされるので、再度認証を行ったうえで最新のファイルを取得する。
        if (implictToken.expiresAt < new Date().getTime()) {
            authorizeRef.current?.click();
            return;
        }

        openGdriveFile({
            accessToken: implictToken.accessToken, fileId: gdriveFileId
        }).then(gdriveFile => {
            setSessionDocument({ erdDocument: gdriveFile.erdDocument, version: gdriveFile.version });
        }).catch(error => {
            console.error(`Failed to open file. ${error}`);
        });
    }, [implictToken, sessionDocument, gdriveFileId, authorize]);

    useEffect(() => {
        if ((sessionDocument == null) || (gdriveFileId == null)) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        updateQueueRef.current = updateQueueRef.current.then((_version: string) => sessionDocument.version);
    }, [sessionDocument, gdriveFileId]);

    return (
        (sessionDocument == null)
            ? (
                <Stack spacing={2} sx={{ justifyContent: "center", alignItems: "center" }}>
                    <Button ref={authorizeRef} variant="contained" size="large"
                        onClick={authorize}>
                        Authorize with Google
                    </Button>
                </Stack>
            ) : <MainView erdDocument={sessionDocument.erdDocument} onSave={handleSave} />
    );
};

type SessionDocument = {
    erdDocument: ErdDocument,
    version: string
};

const initSessionDocument = (): (SessionDocument | null) => {
    const temporaryDocument = sessionStorage.getItem("temporaryDocument");
    sessionStorage.removeItem("temporaryDocument");

    if (temporaryDocument == null) {
        return null;
    }

    const jsonDocument = JSON.parse(temporaryDocument);
    if (!("erdDocument" in jsonDocument) || !("version" in jsonDocument)) {
        return null;
    }

    return jsonDocument;
};

export default GoogleDriveFile;