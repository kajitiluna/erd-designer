import React from "react";
import { Container, Paper, Typography } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import initializeErdDocumentDB from "~/features/storage/IndexedErdDocumentStorage";
import StartUp from "~/features/start_up/StartUp";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdApplicationShell from "~/features/ErdApplicationShell";

const LocalApplication = () => {
    const [documentStorage, setDocumentStorage] = React.useState<ErdDocumentStorage | null>(null);
    const [erdDocument, setErdDocument] = React.useState<ErdDocument | null>(null);
    const [storageHandler, setStorageHandler] = React.useState<StorageHandler>({ handle: () => { } });

    React.useEffect(() => {
        initializeErdDocumentDB().then(storage => setDocumentStorage(storage));
    }, []);

    if (documentStorage == null) {
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

    const handleOpenDocument = (
        openDocument: ErdDocument, onSave: (document: ErdDocument, loggingMessage: string) => void
    ) => {
        setStorageHandler({ handle: onSave });
        setErdDocument(openDocument);
    };

    if (erdDocument == null) {
        return (
            <StartUp documentStorage={documentStorage} onOpenDocument={handleOpenDocument} />
        );
    }

    return (
        <ErdApplicationShell erdDocument={erdDocument} onSave={storageHandler.handle} />
    );
};

type StorageHandler = {
    handle: (updating: ErdDocument, loggingMessage: string) => void
};

export default LocalApplication;
