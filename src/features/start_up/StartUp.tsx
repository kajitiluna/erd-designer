import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Alert, AlertTitle, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    Grid, Stack, Typography
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import ErdDocument from "~/models/ErdDocument";
import { convertErm, ErmLoadSummary } from "~/models/erm";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import InitializeDatabaseDialog from "~/features/start_up/InitializeDatabaseDialog";
import HeroLayout from "~/features/start_up/HeroLayout";
import DashboardLayout from "~/features/start_up/DashboardLayout";
import startUpTheme from "~/features/start_up/StartUpTheme";
import { StartUpActions } from "~/features/start_up/support";
import ConversionReportAlert from "~/components/ConversionReportAlert";

type StartUpProp = {
    documentStorage: ErdDocumentStorage,
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument, message: string) => void) => void
};

type DialogName = "new_file" | "load_file" | "";

const StartUp = ({ documentStorage, onOpenDocument }: StartUpProp) => {
    const [initialized, setInitialized] = React.useState(false);
    const [openDialogName, setOpenDialogName] = React.useState<DialogName>("");
    const [erdSummaries, setErdSummaries] = React.useState<ErdDocumentSummary[]>([]);
    const [sampleLoadFailureMessage, setSampleLoadFailureMessage] = React.useState("");

    // 初回表示時に保存済みの ERD ドキュメント一覧を取得する
    React.useEffect(() => {
        documentStorage.findAll()
            .then(summaries => setErdSummaries(summaries))
            .finally(() => setInitialized(true));
    }, [documentStorage]);

    if (initialized === false) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
                <CircularProgress />
            </Box>
        );
    }

    const handleCloseDialog = () => setOpenDialogName("");

    const handleCreateDocument = (erdDocument: ErdDocument) =>
        handleSaveAndOpenDocument(erdDocument, "Create new erd document.");

    const handleLoadDocument = (erdDocument: ErdDocument) =>
        handleSaveAndOpenDocument(erdDocument, "Load erd document from file.");

    const handleOpenSample = () => {
        setSampleLoadFailureMessage("");

        loadSampleDocument()
            .then(erdDocument => handleSaveAndOpenDocument(erdDocument, "Load sample erd document."))
            .catch(error => {
                console.warn(`Failed to load sample erd document. detail : ${error}`);
                setSampleLoadFailureMessage("Failed to load the sample diagram.");
            });
    };

    const handleSaveAndOpenDocument = (erdDocument: ErdDocument, savingMessage: string) => {
        const documentKey = uuidV4();
        documentStorage.save(documentKey, erdDocument, savingMessage);

        const handleOnSave = (updating: ErdDocument, loggingMessage: string) =>
            documentStorage.save(documentKey, updating, loggingMessage);

        onOpenDocument(erdDocument, handleOnSave);
    };

    const mainPanel = initStartView({
        documentStorage, erdSummaries, onOpenDocument,
        onSummariesUpdated: (summaries: ErdDocumentSummary[]) => setErdSummaries(summaries),
        onOpenDialog: (dialogName) => setOpenDialogName(dialogName),
        onOpenSample: handleOpenSample
    });

    return (
        <ThemeProvider theme={startUpTheme}>
            {mainPanel}

            {(sampleLoadFailureMessage !== "") && (
                <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 1300, maxWidth: 360 }}>
                    <Alert severity="error" onClose={() => setSampleLoadFailureMessage("")}>
                        {sampleLoadFailureMessage}
                    </Alert>
                </Box>
            )}

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

const loadSampleDocument = async (): Promise<ErdDocument> => {
    const sampleModule = await import("../../../samples/sample-ec_mysql.erd?raw");
    return ErdDocument.toObject(JSON.parse(sampleModule.default));
};

type InitViewArgs = {
    documentStorage: ErdDocumentStorage,
    erdSummaries: ErdDocumentSummary[],
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument, message: string) => void) => void,
    onSummariesUpdated: (summaries: ErdDocumentSummary[]) => void,
    onOpenDialog: (dialogName: "new_file" | "load_file") => void,
    onOpenSample: () => void
};

const initStartView = ({
    documentStorage, erdSummaries, onOpenDocument, onSummariesUpdated, onOpenDialog, onOpenSample
}: InitViewArgs) => {

    const actions: StartUpActions = {
        onOpenCreateDialog: () => onOpenDialog("new_file"),
        onOpenImportDialog: () => onOpenDialog("load_file"),
        onOpenSample
    };

    if (erdSummaries.length === 0) {
        return (
            <HeroLayout actions={actions} />
        );
    }

    return (
        <DashboardLayout
            documentStorage={documentStorage}
            erdSummaries={erdSummaries}
            onOpenDocument={onOpenDocument}
            onSummariesUpdated={onSummariesUpdated}
            actions={actions}
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
    const [conversionSummaries, setConversionSummaries] = React.useState<ErmLoadSummary[]>([]);
    const [failureMessage, setFailureMessage] = React.useState("");

    const handleSelectFileDialog = () => {
        const element = document.getElementById(ELEMENT_FILE_ID);
        if (element == null) {
            return;
        }

        element.click();
    };

    const handleLoadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const targetFiles = event.currentTarget.files;
        if ((targetFiles == null) || (targetFiles.length === 0)) {
            return;
        }

        const targetFile = targetFiles[0];
        setFileName(targetFile.name);

        const onLoaded = initHandleFileLoaded(
            targetFile.name, setErdDocument, setConversionSummaries, setFailureMessage
        );

        const fileReader = new FileReader();
        fileReader.addEventListener("load", onLoaded);
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
        setConversionSummaries([]);
    };

    return (<>
        <Dialog fullWidth maxWidth="md" open={isOpen} onClose={onClose}>
            <DialogTitle>Load ER Diagram from .erd / .erm file.</DialogTitle>
            <DialogContent>
                <Divider />
                <Stack spacing={3} style={{ margin: "20px" }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Typography variant="body1">
                            {(fileName !== "" ? fileName : "Select .erd or .erm file.")}
                        </Typography>
                        <Button variant="contained" onClick={handleSelectFileDialog} >Select file</Button>
                    </Stack>
                </Stack>
                {initDocumentSummary(erdDocument)}
                {initConversionReport(conversionSummaries)}
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
            <input id={ELEMENT_FILE_ID} type="file" accept=".erd,.erm" onChange={handleLoadFile} />
        </div>
    </>);
};

const initHandleFileLoaded = (
    fileName: string,
    setErdDocument: (erdDocument: ErdDocument | null) => void,
    setConversionSummaries: (summaries: ErmLoadSummary[]) => void,
    setFailureMessage: (message: string) => void
) => {
    return (event: ProgressEvent<FileReader>) => {
        const fileContent = event.target?.result;
        if (typeof fileContent !== "string") {
            setErdDocument(null);
            setConversionSummaries([]);
            setFailureMessage("Not a supported file.");

            return;
        }

        if (fileName.toLowerCase().endsWith(".erm")) {
            handleLoadedErmFile(fileContent, fileName, setErdDocument, setConversionSummaries, setFailureMessage);
            return;
        }

        handleLoadedErdFile(fileContent, setErdDocument, setConversionSummaries, setFailureMessage);
    };
};

const handleLoadedErdFile = (
    fileContent: string,
    setErdDocument: (erdDocument: ErdDocument | null) => void,
    setConversionSummaries: (summaries: ErmLoadSummary[]) => void,
    setFailureMessage: (message: string) => void
) => {
    try {
        const jsonContext = JSON.parse(fileContent);
        const erdDocument = ErdDocument.toObject(jsonContext);

        setFailureMessage("");
        setConversionSummaries([]);
        setErdDocument(erdDocument);
    } catch (error) {
        console.warn(`Failed to load json file. detail : ${error}`);

        const message = (error instanceof Error) ? error.message : "Unexpected error occurred.";
        setFailureMessage(message);
        setConversionSummaries([]);
        setErdDocument(null);
    }
};

const handleLoadedErmFile = (
    fileContent: string,
    fileName: string,
    setErdDocument: (erdDocument: ErdDocument | null) => void,
    setConversionSummaries: (summaries: ErmLoadSummary[]) => void,
    setFailureMessage: (message: string) => void
) => {
    const documentName = fileName.replace(/\.erm$/i, "");
    const result = convertErm(documentName, fileContent);

    setConversionSummaries(result.summaries);

    if (result.result === "failure") {
        setFailureMessage(result.failureMessage);
        setErdDocument(null);
        return;
    }

    setFailureMessage("");
    setErdDocument(result.erdDocument);
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

// .erm 変換時のみ意味を持つ (通常の .erd 読み込みでは常に空)。
// 非対応要素のスキップや型解決失敗など、ユーザーが確定前に確認すべき差分をここで提示する。
const initConversionReport = (summaries: ErmLoadSummary[]) => {
    const reportedSummaries = summaries.filter(summary => (summary.result !== "success"));

    return (
        <ConversionReportAlert items={reportedSummaries} sx={{ marginTop: "16px" }} />
    );
};

export default StartUp;
