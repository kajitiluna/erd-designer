import React from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import TableChartIcon from '@mui/icons-material/TableChart';

import ErdDocumentStorage from "~/features/storage/ErdDocumentStorage";
import ErdDocument from "~/models/ErdDocument";
import ErdDocumentSummary from "~/features/storage/ErdDocumentSummary";

type ErdDocumentListPanelProp = {
    documentStorage: ErdDocumentStorage;
    erdSummaries: ErdDocumentSummary[];
    onOpenDocument: (openDocument: ErdDocument, onSave: (document: ErdDocument, message: string) => void) => void;
    onSummariesUpdated: (summaries: ErdDocumentSummary[]) => void;
};

const ErdDocumentListPanel = ({ documentStorage, erdSummaries, onOpenDocument, onSummariesUpdated }: ErdDocumentListPanelProp) => {
    const [deletingDocument, setDeletingDocument] = React.useState<ErdDocumentSummary | null>(null);

    const handleOpenDocument = (key: string) => {
        documentStorage.find(key).then(document => {
            if (document === null) {
                console.warn(`Not found document. key : ${key}`);
                return;
            }

            const handleOnSave = (updating: ErdDocument, loggingMessage: string) =>
                documentStorage.save(key, updating, loggingMessage);

            onOpenDocument(document, handleOnSave);
        });
    };

    const handleCloseDeleteDialog = () => setDeletingDocument(null);

    const handleDeleteDocument = (summary: ErdDocumentSummary) => {
        documentStorage.delete(summary.key)
            .then(() => documentStorage.findAll())
            .then(onSummariesUpdated)
            .finally(() => handleCloseDeleteDialog());
    };

    const handleConfirmDelete = () => {
        if (deletingDocument === null) {
            return;
        }

        handleDeleteDocument(deletingDocument);
    };

    const buildDocumentItem = (summary: ErdDocumentSummary) => {
        const handleClickItem = () => handleOpenDocument(summary.key);
        const handleClickDelete = (event: React.MouseEvent) => {
            event.stopPropagation();
            setDeletingDocument(summary);
        };

        const deleteButton = (
            <IconButton size="small" edge="end" sx={deleteIconStyle} onClick={handleClickDelete} >
                <DeleteIcon sx={{ fontSize: 21 }} />
            </IconButton>
        );

        return (
            <ListItem key={summary.key} disablePadding secondaryAction={deleteButton}>
                <ListItemButton onClick={handleClickItem}>
                    <ListItemIcon sx={{ minWidth: "54px" }}>
                        <Box sx={iconBadgeStyle}>
                            <TableChartIcon sx={{ fontSize: 19, color: "primary.main" }} />
                        </Box>
                    </ListItemIcon>
                    <ListItemText slotProps={listItemStyle}
                        primary={summary.documentName}
                        secondary={"Updated at : " + summary.lastUpdatedAt.toLocaleString()} />
                </ListItemButton>
            </ListItem>
        );
    };

    return (
        <Box sx={{ padding: "36px 36px 44px" }}>
            <Box sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "20px",
            }}>
                <Typography sx={{ fontSize: 20, fontWeight: 600, color: "text.primary" }}>
                    Your documents
                </Typography>
                <Typography sx={{ fontSize: 13, color: "brand.textMuted" }}>
                    {erdSummaries.length} total
                </Typography>
            </Box>
            <List>
                {erdSummaries.map(buildDocumentItem)}
            </List>

            {(deletingDocument !== null) && (
                <Dialog open={deletingDocument !== null} onClose={handleCloseDeleteDialog}>
                    <DialogTitle>Delete ER diagram?</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            {"Are you sure to delete the diagram '"}{deletingDocument.documentName}{"'?"}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
                        <Button variant="contained" color="error" onClick={handleConfirmDelete}>
                            Delete
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Box>
    );
};

const iconBadgeStyle = {
    width: 38,
    height: 38,
    borderRadius: "9px",
    backgroundColor: "brand.surfaceIconBg",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const listItemStyle = {
    primary: { sx: { fontSize: 15, fontWeight: 500, color: "text.primary" } },
    secondary: { sx: { fontSize: "12.5px", color: "brand.textMuted", marginTop: "2px" } },
};

const deleteIconStyle = {
    color: "brand.textFaint",
    padding: "7px",
    borderRadius: "6px",
    "&:hover": { backgroundColor: "brand.heroGradientStart", color: "primary.main" },
};

export default ErdDocumentListPanel;
