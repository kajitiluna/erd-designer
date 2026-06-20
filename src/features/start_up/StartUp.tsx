import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Alert, AlertTitle, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    Grid, Stack, Typography
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import ErdDocument from "~/models/ErdDocument";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import HeroLayout from "~/features/start_up/HeroLayout";
import DashboardLayout from "~/features/start_up/DashboardLayout";
import startUpTheme from "~/features/start_up/StartUpTheme";

type StartUpProp = {
    documentStorage: ErdDocumentStorage,
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument, message: string) => void) => void
};

type DialogName = "new_file" | "load_file" | "";

const StartUp = ({ documentStorage, onOpenDocument }: StartUpProp) => {
    const [initialized, setInitialized] = React.useState(false);
    const [openDialogName, setOpenDialogName] = React.useState<DialogName>("");
    const [erdSummaries, setErdSummaries] = React.useState<ErdDocumentSummary[]>([]);

    if (initialized === false) {
        documentStorage.findAll()
            .then(summaries => setErdSummaries(summaries))
            .finally(() => setInitialized(true));

        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
                <CircularProgress />
            </Box>
        );
    }

    const handleCloseDialog = () => setOpenDialogName("");

    const handleCreateDocument = (erdDocument: ErdDocument) => {
        const documentKey = uuidV4();
        documentStorage.save(documentKey, erdDocument, "Create new erd document.");

        const handleOnSave = (updating: ErdDocument, loggingMessage: string) =>
            documentStorage.save(documentKey, updating, loggingMessage);

        onOpenDocument(erdDocument, handleOnSave);
    };

    const handleLoadDocument = (erdDocument: ErdDocument) => {
        const documentKey = uuidV4();
        documentStorage.save(documentKey, erdDocument, "Load erd document from file.");

        const handleOnSave = (updating: ErdDocument, loggingMessage: string) =>
            documentStorage.save(documentKey, updating, loggingMessage);

        onOpenDocument(erdDocument, handleOnSave);
    };

    const mainPanel = initStartView({
        documentStorage, erdSummaries, onOpenDocument,
        onSummariesUpdated: (summaries: ErdDocumentSummary[]) => setErdSummaries(summaries),
        onOpenDialog: (dialogName) => setOpenDialogName(dialogName)
    });

    return (
        <ThemeProvider theme={startUpTheme}>
            {mainPanel}

            {(openDialogName === "new_file") && (
                <InitializeDatabaseDialog
                    isOpen={openDialogName === "new_file"}
                    onCreate={handleCreateDocument}
                    onClose={handleCloseDialog}
                />
            )}
            {(openDialogName === "load_file") && (
                <LoadFileDialog
                    isOpen={openDialogName === "load_file"}
                    onLoadDocument={handleLoadDocument}
                    onClose={handleCloseDialog}
                />
            )}
        </ThemeProvider>
    );
};

type InitViewArgs = {
    documentStorage: ErdDocumentStorage,
    erdSummaries: ErdDocumentSummary[],
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument, message: string) => void) => void,
    onSummariesUpdated: (summaries: ErdDocumentSummary[]) => void,
    onOpenDialog: (dialogName: "new_file" | "load_file") => void

};

const initStartView = ({
    documentStorage, erdSummaries, onOpenDocument, onSummariesUpdated, onOpenDialog
}: InitViewArgs) => {

    const onOpenCreateDialog = () => onOpenDialog("new_file");
    const onOpenImportDialog = () => onOpenDialog("load_file");

    if (erdSummaries.length === 0) {
        return (
            <HeroLayout onOpenCreateDialog={onOpenCreateDialog} onOpenImportDialog={onOpenImportDialog} />
        );
    }

    return (
        <DashboardLayout
            documentStorage={documentStorage}
            erdSummaries={erdSummaries}
            onOpenDocument={onOpenDocument}
            onSummariesUpdated={onSummariesUpdated}
            onOpenCreateDialog={onOpenCreateDialog}
            onOpenImportDialog={onOpenImportDialog}
        />
    );
};

type LoadFileDialogProp = {
    isOpen: boolean;
    onLoadDocument: (openDocument: ErdDocument) => void;
    onClose: () => void;
};

const ELEMENT_FILE_ID = "input_erd_file";

const LoadFileDialog = ({ isOpen, onLoadDocument, onClose }: LoadFileDialogProp) => {
    const [fileName, setFileName] = React.useState("");
    const [erdDocument, setErdDocument] = React.useState<ErdDocument | null>(null);
    const [failureMessage, setFailureMessage] = React.useState("");

    const handleSelectFileDialog = () => {
        const element = document.getElementById(ELEMENT_FILE_ID);
        if (element == null) {
            return;
        }

        element.click();
    };

    const fileReader: FileReader = initFileReader(setErdDocument, setFailureMessage);

    const handleLoadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const targetFiles = event.currentTarget.files;
        if ((targetFiles == null) || (targetFiles.length === 0)) {
            return;
        }

        const targetFile = targetFiles[0];
        setFileName(targetFile.name);
        fileReader.readAsText(targetFile, "UTF-8");
    };

    const handleSubmit = () => {
        if (erdDocument == null) {
            return;
        }

        onLoadDocument(erdDocument);
        onClose();

        setFileName("");
        setErdDocument(null);
    };

    return (
        <>
            <Dialog fullWidth maxWidth="md" open={isOpen} onClose={onClose}>
                <DialogTitle>Load ER Diagram from ERD file.</DialogTitle>
                <DialogContent>
                    <Divider />
                    <Stack spacing={3} style={{ margin: "20px" }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                            <Typography variant="body1">{(fileName !== "" ? fileName : "Select JSON file.")}</Typography>
                            <Button variant="contained" onClick={handleSelectFileDialog} >Select file</Button>
                        </Stack>
                    </Stack>
                    {initDocumentSummary(erdDocument)}
                    {(failureMessage !== "") && (
                        <Alert severity="error">
                            <AlertTitle>Failed to load file.</AlertTitle>
                            {failureMessage}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions sx={{ margin: "15px", marginTop: "10px" }}>
                    <Button variant="contained" fullWidth size="large"
                        disabled={erdDocument == null} onClick={handleSubmit} >
                        Start design ER Diagram.
                    </Button>
                </DialogActions>
            </Dialog>
            <div style={{ display: "none" }}>
                <input id={ELEMENT_FILE_ID} type="file" accept=".erd" onChange={handleLoadFile} />
            </div>
        </>
    );
};

const initFileReader = (
    setErdDocument: (erdDocument: ErdDocument | null) => void,
    setFailureMessage: (message: string) => void
) => {
    const fileReader = new FileReader();
    fileReader.addEventListener("load", () => {
        if (typeof fileReader.result !== "string") {
            setErdDocument(null);
            setFailureMessage("Not erd file.");
            return;
        }

        try {
            const jsonContext = JSON.parse(fileReader.result);
            const erdDocument = ErdDocument.toObject(jsonContext);

            setFailureMessage("");
            setErdDocument(erdDocument);
        } catch (error) {
            console.warn(`Failed to load json file. detail : ${error}`);

            const message = (error instanceof Error) ? error.message : "Unexpected error occurred.";
            setFailureMessage(message);
            setErdDocument(null);
        }
    });

    return fileReader;
};

const initDocumentSummary = (document: ErdDocument | null) => {
    if (document == null) {
        return (<></>);
    }

    return (
        <Stack spacing={2}>
            <Alert severity="success">
                <AlertTitle>Succeed to load file.</AlertTitle>
            </Alert>
            <Grid container style={{ margin: "20px" }} sx={{ alignItems: "center" }}>
                <Grid sx={{ justifyContent: "flex-start" }} size={6}>
                    <Typography variant="body1">Document name :</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "center" }} size={6}>
                    <Typography variant="button">{document.documentName}</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "flex-start" }} size={6}>
                    <Typography variant="body1">Database type :</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "center" }} size={6}>
                    <Typography variant="button">{document.getDatabase().name}</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "flex-start" }} size={6}>
                    <Typography variant="body1">The count of tables :</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "center" }} size={6}>
                    <Typography variant="button">{document.getTableViewModels().length}</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "flex-start" }} size={6}>
                    <Typography variant="body1">The count of relations :</Typography>
                </Grid>
                <Grid sx={{ justifyContent: "center" }} size={6}>
                    <Typography variant="button">{document.getRelationViewModels().length}</Typography>
                </Grid>
            </Grid>
        </Stack>
    );
};

export default StartUp;
