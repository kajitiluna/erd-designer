import React from "react";
import { Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";

import ErdDocument from "~/models/ErdDocument";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import { createGdriveFile, openGdriveFile } from "~/features/gdrive/gdrive-file-support";
import GoogleDriveNoticeLayout from "~/features/gdrive/GoogleDriveNoticeLayout";
import { containedButtonStyle, descriptionStyle } from "~/features/start_up/start-up-styles";
import { GdriveAuthorization } from "~/features/gdrive/gdrive-authorization";

type GoogleDriveInitializerProp = {
    authorization: GdriveAuthorization,
    onInitialize: (gdriveFile: GdriveFile) => void
};

const GoogleDriveInitializer = ({ authorization: gdriveAuthorization, onInitialize }: GoogleDriveInitializerProp) => {
    const { authorization, authorize } = gdriveAuthorization;
    const [gdriveFolderId, setGdriveFolderId] = React.useState<string | null>(null);
    const [erdDocument, setErdDocument] = React.useState<ErdDocument | null>(null);

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
            openGdriveFile({
                accessToken: authorization.accessToken, fileId: gdriveState.fileId
            }).then(gdriveFile => {
                onInitialize(gdriveFile);
            }).catch(error => {
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

    const onProcessing = (erdDocument != null)
        || ((authorization.state === "authorized") && (gdriveState.action === "open"));

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
            {onProcessing && (<CircularProgress />)}
        </GoogleDriveNoticeLayout>
    );
};

type GdriveFile = {
    fileId: string,
    erdDocument: ErdDocument,
    version: string
};

type GdriveState = {
    action: "open",
    fileId: string
} | {
    action: "create",
    folderId: string
} | { action: "none" };

const useGdriveStateParam = (): GdriveState => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [urlParams, _setUrlParams] = useSearchParams();
    const stateValue = urlParams.get("state") || "{}";

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
};

export default GoogleDriveInitializer;