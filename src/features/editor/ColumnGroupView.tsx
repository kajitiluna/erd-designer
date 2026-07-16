import React from "react";
import {
    Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider,
    Grid, Paper, Stack, Table, TableBody, TableContainer, TextField, Typography
} from "@mui/material";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnGroupEditDialog from "~/features/editor/ColumnGroupEditDialog";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { ColumnWrapModel, initHandleCloseDialog } from "~/features/editor/support";
import useItemListPanel, { initColumnTableHelper as initColumnTableHelper } from "~/features/editor/useItemListPanel";

type ColumnGroupViewProps = {
    isOpen: boolean,
    viewMode: "select" | "edit",
    onSelect?: (columnWrapModel: ColumnWrapModel) => void,
    onClose: () => void
};

const ColumnGroupView = ({ isOpen, viewMode, onSelect = () => { }, onClose }: ColumnGroupViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const { listPanel, selectedItem, editMode, reset } = useItemListPanel({
        viewMode,
        items: erdDocument.getColumnGroupModels(),
        create: () => new ColumnGroupModel({}),
        toKey: (target: ColumnGroupModel) => target.columnGroupId,
        toTitle: (target: ColumnGroupModel) => target.groupName
    });

    const mainPanel = (
        <Grid container spacing={3}>
            <Grid size={3}>
                <Paper elevation={4} sx={{ p: 1, display: 'flex', flexDirection: 'column', height: "300px" }}>
                    {listPanel}
                </Paper>
            </Grid>
            <Grid size={9} sx={{ height: "100%" }}>
                <Paper elevation={4} sx={{ p: 1, overflowY: "auto", height: "300px" }}>
                    {initColumnDetailPanel(erdDocument, selectedItem)}
                </Paper>
            </Grid>
        </Grid>
    );

    const initActionPanel = (mode: "select" | "edit", onSelect: (columnWrapModel: ColumnWrapModel) => void) => {
        if (mode === "edit") {
            return (
                <Button onClick={onClose} >Close</Button>
            );
        }

        const handleCompleted = () => {
            if (selectedItem == null) {
                return;
            }

            const columnModels = selectedItem.columnModelIds
                .map(columnModelId => erdDocument.findColumnModel(columnModelId))
                .filter((columnModel): columnModel is SimpleColumnModel =>
                    (columnModel != null) && ColumnModel.isSimpleColumn(columnModel));

            const columnWrapModel: ColumnWrapModel = {
                modelType: "group",
                columnGroupModel: selectedItem,
                columnModels: columnModels
            };

            onSelect(columnWrapModel);
            onClose();
        };

        return (<>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={selectedItem == null} onClick={handleCompleted}>OK</Button>
        </>);
    };

    const handleCloseDialog = () => reset();
    const handleDeleteGroup = () => {
        if (selectedItem == null) {
            return;
        }

        const loggingMessage = `Delete Column Group: ${JSON.stringify(selectedItem)}`;
        documentsHolder.deleteColumnGroup(selectedItem.columnGroupId, loggingMessage);

        reset(true);
    };

    const deleteDialog = ((selectedItem == null) || (editMode !== "delete")) ? null : (
        <Dialog open={(selectedItem != null) && (editMode === "delete")} onClose={handleCloseDialog}>
            <DialogTitle>Delete column group?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Are you sure to delete the column group {`'${selectedItem.groupName}'`} ?
                </DialogContentText>
                <Alert severity="warning" sx={{ marginTop: 2 }}>
                    This action will also remove its definitions from related tables.
                </Alert>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleDeleteGroup}>Delete</Button>
            </DialogActions>
        </Dialog>
    );

    return (<>
        <Dialog fullWidth maxWidth="xl" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>{(viewMode === "select" ? "Select Column Group" : "Column Groups")}</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    {mainPanel}
                </Stack>
            </DialogContent>
            <DialogActions>{initActionPanel(viewMode, onSelect)}</DialogActions>
        </Dialog>
        {(selectedItem != null) && (editMode === "edit") && (
            <ColumnGroupEditDialog
                isOpen={editMode != null}
                columnGroup={selectedItem}
                onClose={handleCloseDialog} />
        )}
        {deleteDialog}
    </>);
};

const initColumnDetailPanel = (erdDocument: ErdDocument, columnGroup: ColumnGroupModel | null) => {
    if (columnGroup == null) {
        return (
            <Box sx={{
                textAlign: "center", display: "flex",
                flexDirection: "column", justifyContent: "center", height: "100%"
            }}>
                <Typography variant="body2" gutterBottom>Select column group.</Typography>
            </Box>
        );
    }

    const { tableHeader, initColumnRow } = initColumnTableHelper(erdDocument, true)

    return (
        <Stack direction="column" spacing={1}
            sx={{ alignItems: "stretch", justifyContent: "space-between", height: "100%" }}>
            <TableContainer>
                <Table stickyHeader size="small" aria-label="column view table" style={{ tableLayout: "fixed" }}>
                    {tableHeader}
                    <TableBody>
                        {columnGroup.columnModelIds.map(columnModelId => initColumnRow(columnModelId))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TextField variant="outlined" aria-readonly label="Description" multiline rows={3}
                sx={{ '& .MuiInputBase-root': { resize: 'none', overflow: 'auto', pointerEvents: 'none' } }}
                value={columnGroup.description} />
        </Stack>
    );
};

export default ColumnGroupView;