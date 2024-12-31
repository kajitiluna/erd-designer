import { useState } from "react";
import { Container, Paper, Typography } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import initializeIndexedDB from "~/features/strage/IndexedDBStrage";
import StartUp from "~/features/start_up/StartUp";
import ErdDocumentStrage from "~/features/strage/ErdDocumentStrage";
import MainView from "~/features/MainView";

const LocalApplicataion = () => {
    const [documentStrage, setDocumentStrage] = useState<ErdDocumentStrage | null>(null);
    const [erdDocument, setErdDocument] = useState<ErdDocument | null>(null);
    const [strageHandler, setStrageHandler] = useState<{ handle: (updating: ErdDocument) => void }>({ handle: () => { } });

    if (documentStrage == null) {
        initializeIndexedDB().then(strage => setDocumentStrage(strage));

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

    return (erdDocument == null)
        ? <StartUp documentStrage={documentStrage} onOpenDocument={handleOpenDocument} />
        : <MainView erdDocument={erdDocument} onSave={strageHandler.handle} />
};

export default LocalApplicataion;
