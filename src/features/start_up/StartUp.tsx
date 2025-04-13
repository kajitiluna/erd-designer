import { useState } from "react";
import {
    Alert, AlertTitle, Box, Button, Container, CssBaseline,
    Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import { v4 as uuidV4 } from 'uuid';

import ErdDocument from "~/models/ErdDocument";
import ErdDocumentListPanel from "~/features/start_up/ErdDocumentListPanel";
import ErdDocumentStrage from "~/features/strage/ErdDocumentStrage";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import Logo from "~/logo.svg";
import RegalFotter from "~/features/regal/RegalFooter";

type StartUpProp = {
    documentStrage: ErdDocumentStrage,
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument) => void) => void
};

type DiagramName = "new_file" | "load_file" | ""

const StartUp = ({ documentStrage, onOpenDocument }: StartUpProp) => {
    const [openDialogName, setOpenDialogName] = useState<DiagramName>("");

    const handleCloseDialog = () => setOpenDialogName("");

    const handleCreateDocument = (erdDocument: ErdDocument) => {
        const documentKey = uuidV4();
        documentStrage.save(documentKey, erdDocument);

        const handleOnSave = (updating: ErdDocument) => documentStrage.save(documentKey, updating);

        onOpenDocument(erdDocument, handleOnSave);
    };

    const handleLoadDocument = (document: ErdDocument) => {
        const documentKey = uuidV4();
        documentStrage.save(documentKey, document);

        const handleOnSave = (updating: ErdDocument) => documentStrage.save(documentKey, updating);

        onOpenDocument(document, handleOnSave);
    };

    const boxStyle = {
        marginTop: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Container component="main" maxWidth="lg" style={{ flex: 1 }}>
                <CssBaseline />
                <Box sx={boxStyle}>
                    <img src={Logo} alt="" width="200px" height="200px" />
                    <Typography variant="h2" align="center" style={{ marginTop: "30px", marginBottom: "30px" }}>
                        Entity Relationship Diagram Designer
                    </Typography>
                    <Stack direction={{ sm: 'column', md: 'row' }} spacing={2}>
                        <Button variant="contained" size="large" onClick={() => setOpenDialogName("new_file")}>
                            Create New ER Diagram
                        </Button>
                        <Button variant="contained" size="large" color="secondary"
                            onClick={() => setOpenDialogName("load_file")}>
                            Import from erd file
                        </Button>
                    </Stack>
                </Box>
                <ErdDocumentListPanel documentStrage={documentStrage} onOpenDocument={onOpenDocument} />

                {(openDialogName === "new_file") && (
                    <InitializeDatabaseDialog
                        isOpen={openDialogName === "new_file"}
                        onCreate={handleCreateDocument}
                        onClose={handleCloseDialog} />
                )}
                {(openDialogName === "load_file") && (
                    <LoadFileDialog
                        isOpen={openDialogName === "load_file"}
                        onLoadDocument={handleLoadDocument}
                        onClose={handleCloseDialog} />
                )}
            </Container>

            <RegalFotter />
        </div>
    );
};

type LoadFileDialogProp = {
    isOpen: boolean,
    onLoadDocument: (openDocument: ErdDocument) => void,
    onClose: () => void
};

// ファイル選択画面を表示するための input タグの id
const ELEMENT_FILE_ID = "input_erd_file";

const LoadFileDialog = ({ isOpen, onLoadDocument, onClose }: LoadFileDialogProp) => {

    const [fileName, setFileName] = useState("");
    const [erdDocument, setErdDocument] = useState<ErdDocument | null>(null);
    const [failureMessage, setFailureMessage] = useState("");

    // ファイル選択画面を表示する
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
                <DialogTitle>Load ER Diagram from JSON file.</DialogTitle>
                <DialogContent>
                    <Divider />
                    <Stack spacing={3} style={{ margin: "20px" }}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
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
            const document = ErdDocument.toObject(jsonContext);

            setFailureMessage("");
            setErdDocument(document);
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
            <Grid container alignItems="center" style={{ margin: "20px" }}>
                <Grid justifyContent="flex-start" size={6}>
                    <Typography variant="body1">Document name :</Typography>
                </Grid>
                <Grid justifyContent="center" size={6}>
                    <Typography variant="button">{document.documentName}</Typography>
                </Grid>
                <Grid justifyContent="flex-start" size={6}>
                    <Typography variant="body1">Database type :</Typography>
                </Grid>
                <Grid justifyContent="center" size={6}>
                    <Typography variant="button">{document.getDatabase().name}</Typography>
                </Grid>
                <Grid justifyContent="flex-start" size={6}>
                    <Typography variant="body1">The count of tables :</Typography>
                </Grid>
                <Grid justifyContent="center" size={6}>
                    <Typography variant="button">{document.getTableViewModels().length}</Typography>
                </Grid>
                <Grid justifyContent="flex-start" size={6}>
                    <Typography variant="body1">The count of relations :</Typography>
                </Grid>
                <Grid justifyContent="center" size={6}>
                    <Typography variant="button">{document.getRelationViewModels().length}</Typography>
                </Grid>
            </Grid>
        </Stack>
    );
};

export default StartUp;