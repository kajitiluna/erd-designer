import { useState } from "react";
import { Container, Paper, Typography } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import initializeErdDocumentDB from "~/features/strage/IndexedErdDocumentStrage";
import StartUp from "~/features/start_up/StartUp";
import ErdDocumentStrage from "~/features/strage/ErdDocumentStrage";
import MainView from "~/features/MainView";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import exportExcelFormatSpecification from "~/features/spec/ExcelFormatSpecification";
import download from "~/components/file-downloader";

const LocalApplicataion = () => {
    const [documentStrage, setDocumentStrage] = useState<ErdDocumentStrage | null>(null);
    const [erdDocument, setErdDocument] = useState<ErdDocument | null>(null);
    const [strageHandler, setStrageHandler] = useState<StrageHandler>({ handle: () => { } });

    if (documentStrage == null) {
        initializeErdDocumentDB().then(strage => setDocumentStrage(strage));

        return (
            <Container>
                <Paper elevation={3}>
                    <Typography variant="h5" gutterBottom>
                        ERD Designer uses IndexedDB to store the documents.
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                        Please allow the use of IndexedDB.
                        If you do not allow it, you can use ERD Designer,
                        but the documents you are working on will not be saved automatically.
                    </Typography>
                </Paper>
            </Container>
        );
    }

    const handleOpenDocument = (openDocument: ErdDocument, onSave: (document: ErdDocument) => void) => {
        setStrageHandler({ handle: onSave });
        setErdDocument(openDocument);
    };

    if (erdDocument == null) {
        return (
            <StartUp documentStrage={documentStrage} onOpenDocument={handleOpenDocument} />
        );
    }

    const exportSpecification = (erdDocument: ErdDocument, contents: ImageContent) => {
        exportExcelFormatSpecification(erdDocument, contents).then((specs: Blob) => {
            const fileName = `${erdDocument.documentName}.xlsx`;
            download(fileName, specs);
        });
    };

    return (
        <ExportSpecificationContext.Provider value={{ exportSpecification }}>
            <MainView erdDocument={erdDocument} onSave={strageHandler.handle} />
        </ExportSpecificationContext.Provider>
    );
};

type StrageHandler = {
    handle: (updating: ErdDocument) => void
};

export default LocalApplicataion;
