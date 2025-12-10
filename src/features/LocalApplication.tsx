import React from "react";
import { Container, Paper, Typography } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import initializeErdDocumentDB from "~/features/storage/IndexedErdDocumentStorage";
import StartUp from "~/features/start_up/StartUp";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import MainView from "~/features/MainView";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import exportExcelFormatSpecification from "~/features/spec/ExcelFormatSpecification";
import download from "~/components/file-downloader";

const LocalApplication = () => {
    const [documentStorage, setDocumentStorage] = React.useState<ErdDocumentStorage | null>(null);
    const [erdDocument, setErdDocument] = React.useState<ErdDocument | null>(null);
    const [storageHandler, setStorageHandler] = React.useState<StorageHandler>({ handle: () => { } });

    if (documentStorage == null) {
        initializeErdDocumentDB().then(storage => setDocumentStorage(storage));

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
        setStorageHandler({ handle: onSave });
        setErdDocument(openDocument);
    };

    if (erdDocument == null) {
        return (
            <StartUp documentStorage={documentStorage} onOpenDocument={handleOpenDocument} />
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
            <MainView erdDocument={erdDocument} onSave={storageHandler.handle} />
        </ExportSpecificationContext.Provider>
    );
};

type StorageHandler = {
    handle: (updating: ErdDocument) => void
};

export default LocalApplication;
