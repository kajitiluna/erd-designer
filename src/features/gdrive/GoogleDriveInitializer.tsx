import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";

import ErdDocument from "~/models/ErdDocument";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import { createGdriveFile, openGdriveFile } from "~/features/gdrive/gdrive-file-support";
import Logo from "~/logo.svg";
import RegalFooter from "~/features/regal/RegalFooter";

type GoogleDriveInitializerProp = {
    implicitToken: { accessToken: string, expiresAt: number },
    authorize: () => void,
    onInitialize: (gdriveFile: GdriveFile) => void
};

const GoogleDriveInitializer = ({ implicitToken, authorize, onInitialize }: GoogleDriveInitializerProp) => {
    const [gdriveFolderId, setGdriveFolderId] = useState<string | null>(null);
    const [erdDocument, setErdDocument] = useState<ErdDocument | null>(null);

    const gdriveState = useGdriveStateParam();

    const handleCreateDocument = (erdDocument: ErdDocument) => {
        if ((gdriveFolderId == null) || (implicitToken.accessToken === "")) {
            return;
        }

        setErdDocument(erdDocument);
    };

    useEffect(() => {
        const currentDate = new Date().getTime();
        if (implicitToken.expiresAt < currentDate) {
            return;
        }

        if (gdriveState.action === "open") {
            openGdriveFile({
                accessToken: implicitToken.accessToken, fileId: gdriveState.fileId
            }).then(gdriveFile => {
                onInitialize(gdriveFile);
            }).catch(error => {
                console.error(`Failed to open file. ${error}`);
            });
        }

        if (gdriveState.action === "create") {
            setGdriveFolderId(gdriveState.folderId);
        }
    }, [implicitToken, gdriveState, authorize, onInitialize]);

    // GoogleDrive にファイルを新規作成する
    useEffect(() => {
        if ((erdDocument == null) || (gdriveFolderId == null)) {
            return;
        }

        createGdriveFile({
            accessToken: implicitToken.accessToken, folderId: gdriveFolderId, erdDocument
        }).then(gdriveFile => {
            onInitialize(gdriveFile);
        }).catch(error => {
            console.error(`Failed to create file. ${error}`);
        });
    }, [erdDocument, gdriveFolderId, implicitToken.accessToken, onInitialize]);

    const boxStyle = {
        marginTop: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    };

    const currentDate = new Date().getTime();
    const onProcessing = (erdDocument != null)
        || ((implicitToken.expiresAt >= currentDate) && (gdriveState.action === "open"));

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Box sx={boxStyle} style={{ flex: 1 }}>
                <img src={Logo} alt="" width="200px" height="200px" />
                <Typography variant="h2" align="center" style={{ marginTop: "30px", marginBottom: "30px" }}>
                    Entity Relationship Diagram Designer
                </Typography>

                {(implicitToken.expiresAt < currentDate) && (
                    <Stack spacing={2} sx={{ justifyContent: "center", alignItems: "center" }}>
                        <Typography variant="body1" gutterBottom>
                            Need to authorize to edit the ERD file on the Google Drive.
                        </Typography>
                        <Button variant="contained" size="large" onClick={authorize}>
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
                {onProcessing && (
                    <CircularProgress />
                )}
            </Box>

            <RegalFooter />
        </div>
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
    if (!("action" in gdriveState)) {
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