import { useState } from "react";
import {
    Alert, AlertTitle,
    Box, Button, Container, CssBaseline,
    Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import { v4 as uuidV4 } from 'uuid';

import ErdDocument from "~/models/ErdDocument";
import { databases, DatabaseType } from "~/models/database";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdSettingModel from "~/models/ErdSettingModel";
import ErdDocumentListPanel from "~/features/start_up/ErdDocumentListPanel";
import Logo from "~/logo.svg";
import ErdDocumentStrage from "~/features/strage/ErdDocumentStrage";


type StartUpProp = {
    documentStrage: ErdDocumentStrage,
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument) => void) => void
};

type DiagramName = "new_file" | "load_file" | ""

const StartUp = ({ documentStrage, onOpenDocument }: StartUpProp) => {
    const [openDialogName, setOpenDialogName] = useState<DiagramName>("");

    const handleCloseDialog = () => setOpenDialogName("");

    const handleCreateDocument = (documentName: string, databaseType: DatabaseType) => {
        const databaseSetting = DatabaseSettingModel.create(databaseType)
        const setting = ErdSettingModel.create(documentName);

        const document = ErdDocument.create({
            documentName: documentName,
            erdSettingModel: setting,
            databaseSettingModel: databaseSetting
        });

        const documentKey = uuidV4();
        documentStrage.save(documentKey, document);

        const handleOnSave = (updating: ErdDocument) => documentStrage.save(documentKey, updating);

        onOpenDocument(document, handleOnSave);
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
        <Container component="main" maxWidth="lg">
            <CssBaseline />
            <Box sx={boxStyle}>
                <img src={Logo} alt="" width="200px" height="200px" />
                <Typography variant="h2" align="center" style={{ marginBottom: "30px" }}>Entity Relationship Diagram Designer</Typography>
                <Stack direction={{ sm: 'column', md: 'row' }} spacing={2}>
                    <Button variant="contained" size="large" onClick={() => setOpenDialogName("new_file")}>
                        Create New ER Diagram
                    </Button>
                    <Button variant="contained" size="large" color="secondary" onClick={() => setOpenDialogName("load_file")}>
                        Import from json file
                    </Button>
                </Stack>
            </Box>
            <ErdDocumentListPanel documentStrage={documentStrage} onOpenDocument={onOpenDocument} />

            {(openDialogName === "new_file") && (
                <InitializeDialog
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
    );
};

type InitializeDialogProp = {
    isOpen: boolean,
    onCreate: (documentName: string, databaseType: DatabaseType) => void,
    onClose: () => void
};

const InitializeDialog = ({ isOpen, onCreate, onClose }: InitializeDialogProp) => {
    const [documentName, setDocumentName] = useState<string>("");
    const [databaseType, setDatabaseType] = useState<DatabaseType | "">("");

    const handleSubmit = () => {
        if ((documentName === "") || (databaseType === "")) {
            return;
        }

        onCreate(documentName, databaseType);
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="lg" open={isOpen} onClose={onClose}>
            <DialogTitle>Input ER Diagram settings.</DialogTitle>
            <DialogContent>
                <Stack spacing={4}>
                    <Divider />

                    <Stack spacing={1}>
                        <Typography variant="body1">Input ER Diagram name.</Typography>
                        <TextField variant="standard" required sx={{ marginBottom: "30px" }}
                            label="Diagram name" value={documentName}
                            onChange={event => setDocumentName(event.target.value)} />
                    </Stack>

                    <Stack spacing={1}>
                        <Typography variant="body1">Select database type.</Typography>
                        <FormControl fullWidth>
                            <InputLabel id="label-select-database">Database</InputLabel>
                            <Select
                                labelId="label-select-database" label="Database" value={databaseType}
                                onChange={event => setDatabaseType(event.target.value as DatabaseType)} >
                                {Object.keys(databases).map((key) =>
                                    <MenuItem key={key} value={key}>{databases[key as DatabaseType].name}</MenuItem>
                                )}
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ margin: "15px", marginTop: "10px" }}>
                <Button
                    variant="contained" fullWidth size="large"
                    disabled={(documentName === "") || (databaseType === "")} onClick={handleSubmit} >
                    Start design ER Diagram.
                </Button>
            </DialogActions>
        </Dialog>
    );
};

type LoadFileDialogProp = {
    isOpen: boolean,
    onLoadDocument: (openDocument: ErdDocument) => void,
    onClose: () => void
};

const LoadFileDialog = ({ isOpen, onLoadDocument, onClose }: LoadFileDialogProp) => {

    const [fileName, setFileName] = useState("");
    const [erdDocument, setErdDocument] = useState<ErdDocument | null>(null);
    const [failureMessage, setFailureMessage] = useState("");

    // ファイル選択画面を表示するための input タグの id
    const elementForInputJsonFile = "input_json_file";

    // ファイル選択画面を表示する
    const handleSelectFileDialog = () => {
        const element = document.getElementById(elementForInputJsonFile);
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
                <input id={elementForInputJsonFile} type="file" accept=".json" onChange={handleLoadFile} />
            </div>
        </>
    );
};

const initFileReader = (
    setErdDocument: React.Dispatch<React.SetStateAction<ErdDocument | null>>,
    setFailureMessage: React.Dispatch<React.SetStateAction<string>>
) => {
    const fileReader = new FileReader();
    fileReader.addEventListener("load", () => {
        if (typeof fileReader.result !== "string") {
            setErdDocument(null);
            setFailureMessage("Not json file.");
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
