import React from "react";
import { Alert, Button, Container, Paper, Snackbar, Typography } from "@mui/material";

import ErdDocument from "~/models/ErdDocument";
import initializeErdDocumentDB from "~/features/storage/IndexedErdDocumentStorage";
import StartUp from "~/features/start_up/StartUp";
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdApplicationShell from "~/features/ErdApplicationShell";
import { localDocumentSyncChannelFactory } from "~/features/storage/LocalDocumentSyncChannel";

type OpenLocalDocument = {
    documentKey: string,
    erdDocument: ErdDocument,
    initialRevision: number,
    // 競合後の再読み込みで同じ documentKey のまま LocalDocumentEditor を作り直すための世代番号
    generation: number
};

const LocalApplication = () => {
    const [documentStorage, setDocumentStorage] = React.useState<ErdDocumentStorage | null>(null);
    const [openDocument, setOpenDocument] = React.useState<OpenLocalDocument | null>(null);

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

    const handleOpenDocument = (documentKey: string, document: ErdDocument, initialRevision: number) => {
        setOpenDocument({ documentKey, erdDocument: document, initialRevision, generation: 0 });
    };

    // 競合で「後者はエラー」扱いになった編集を破棄し、保存済みの最新内容から開き直す。
    // documentKey は変わらないため、generation を進めて LocalDocumentEditor を強制的に作り直す。
    const handleReloadAfterConflict = (documentKey: string) => {
        documentStorage.find(documentKey).then(found => {
            if (found == null) {
                console.warn(`Document was removed elsewhere. key: ${documentKey}`);
                setOpenDocument(null);
                return;
            }

            setOpenDocument(current => {
                return {
                    documentKey,
                    erdDocument: found.erdDocument,
                    initialRevision: found.revision,
                    generation: (current?.generation ?? 0) + 1
                };
            });
        });
    };

    if (openDocument == null) {
        return (
            <StartUp documentStorage={documentStorage} onOpenDocument={handleOpenDocument} />
        );
    }

    return (
        <LocalDocumentEditor
            key={`${openDocument.documentKey}:${openDocument.generation}`}
            documentStorage={documentStorage}
            documentKey={openDocument.documentKey}
            erdDocument={openDocument.erdDocument}
            initialRevision={openDocument.initialRevision}
            onReloadRequested={() => handleReloadAfterConflict(openDocument.documentKey)}
        />
    );
};

type LocalDocumentEditorProps = {
    documentStorage: ErdDocumentStorage,
    documentKey: string,
    erdDocument: ErdDocument,
    initialRevision: number,
    onReloadRequested: () => void
};

/**
 * 1 ドキュメントぶんの編集セッション。documentKey + generation で LocalApplication から
 * key 付けされ、競合による再読み込み時は丸ごと作り直されることで channel の張り直しを保証する。
 */
const LocalDocumentEditor = ({
    documentStorage, documentKey, erdDocument, initialRevision, onReloadRequested
}: LocalDocumentEditorProps) => {
    const [channel] = React.useState(() => {
        return localDocumentSyncChannelFactory.create(documentStorage, documentKey, erdDocument, initialRevision);
    });
    const [conflictDetected, setConflictDetected] = React.useState(false);

    React.useEffect(() => {
        return () => channel.close();
    }, [channel]);

    const handleSave = React.useCallback((updating: ErdDocument, loggingMessage: string) => {
        channel.publish(updating, loggingMessage).then(result => {
            if (result.result === "conflict") {
                setConflictDetected(true);
            }
        }).catch(error => {
            console.warn(`Failed to save document. key: ${documentKey}, detail: ${error}`);
        });
    }, [channel, documentKey]);

    const handleReload = () => {
        setConflictDetected(false);
        onReloadRequested();
    };

    return (<>
        <ErdApplicationShell erdDocument={erdDocument} onSave={handleSave} />
        {conflictDetected && (
            <Snackbar open anchorOrigin={{ vertical: "top", horizontal: "right" }}>
                <Alert severity="error" variant="filled" sx={{ whiteSpace: "pre-line" }}
                    action={<Button color="inherit" size="small" onClick={handleReload}>Reload</Button>}>
                    {"Another window has saved changes that conflict with yours.\n"
                        + "Please reload the latest version of the content."}
                </Alert>
            </Snackbar>
        )}
    </>);
};

export default LocalApplication;
