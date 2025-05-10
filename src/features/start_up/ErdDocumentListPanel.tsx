import { useState } from "react";
import {
    Box, Button, CircularProgress, Container,
    Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    IconButton, List, ListItem, ListItemButton, ListItemText, Paper, Stack, Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdDocument from "~/models/ErdDocument";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";


type ErdDocumentListPanelProp = {
    documentStorage: ErdDocumentStorage,
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument) => void) => void
};

const ErdDocumentListPanel = ({ documentStorage, onOpenDocument }: ErdDocumentListPanelProp) => {

    const [erdSummaries, setErdSummaries] = useState<ErdDocumentSummary[] | null>(null);
    // 削除対象として選択された ErdDocument のキー
    const [deletingDocument, setDeletingDocument] = useState<ErdDocumentSummary | null>(null);

    if (erdSummaries == null) {
        documentStorage.findAll().then(documents => setErdSummaries(documents));
    }

    if (erdSummaries == null) {
        return (
            <Container><CircularProgress /></Container >
        );
    }

    const handleOpenDocument = (key: string) => {
        documentStorage.find(key).then(document => {
            if (document == null) {
                console.warn(`Not found document. key : ${key}`);
                return;
            }

            const handleOnSave = (updating: ErdDocument) => documentStorage.save(key, updating);

            onOpenDocument(document, handleOnSave);
        });
    };

    const initListItem = (summary: ErdDocumentSummary) => (
        <ListItemButton key={summary.key}>
            <ListItem secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => setDeletingDocument(summary)}>
                    <DeleteIcon />
                </IconButton>
            }>
                <ListItemText
                    primary={summary.documentName}
                    secondary={"Last updated at : " + summary.lastUpdatedAt.toLocaleString()}
                    onClick={() => handleOpenDocument(summary.key)}
                />
            </ListItem>
        </ListItemButton>
    );

    const handleCloseDialog = () => setDeletingDocument(null);
    // ErdDocument を削除した後は、ErdDocument の一覧を再取得して、一覧表示を更新する
    const handleDeleteDocument = (summary: ErdDocumentSummary) => {
        documentStorage.delete(summary.key)
            .then(() => documentStorage.findAll())
            .then(summaries => setErdSummaries(summaries));

        handleCloseDialog();
    };

    return (
        <Container>
            <Paper sx={{ margin: 5 }}>
                <Box sx={{ p: 5 }}>
                    <Stack spacing={2}>
                        <Typography variant="h5" gutterBottom>Recently updated documents.</Typography>
                        <nav>
                            <List>{erdSummaries.map(summary => initListItem(summary))}</List>
                            {(erdSummaries.length === 0) && <Typography variant="body1">No documents.</Typography>}
                        </nav>
                    </Stack>
                </Box>
            </Paper>
            {(deletingDocument !== null) && (
                <Dialog open={deletingDocument !== null} onClose={handleCloseDialog}>
                    <DialogTitle>Delete ER diagram?</DialogTitle>
                    <DialogContent>
                        <DialogContentText>Are you sure to delete the diagram {"'"}{deletingDocument.documentName}{"'"} ?</DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Cancel</Button>
                        <Button variant="contained" color="error"
                            onClick={() => handleDeleteDocument(deletingDocument)} >
                            Delete
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Container>
    );
};

export default ErdDocumentListPanel;
