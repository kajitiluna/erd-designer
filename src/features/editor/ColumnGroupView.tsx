import React from "react";
import {
    Alert,
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider,
    List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import { overrideColumnName } from "~/models/database/support";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import { handlePreventMouseEvent } from "~/features/canvas/support";
import ColumnGroupEditDialog from "~/features/editor/ColumnGroupEditDialog";
import { ColumnWrapModel, initHandleCloseDialog, SELECTED_CELL_COLOR } from "~/features/editor/support";

type ColumnGroupViewProps = {
    isOpen: boolean,
    viewMode: "select" | "edit",
    onSelect?: (columnWrapModel: ColumnWrapModel) => void,
    onClose: () => void
};

const ColumnGroupView = ({ isOpen, viewMode, onSelect = () => { }, onClose }: ColumnGroupViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [selectedColumnGroup, setSelectedColumnGroup] = React.useState<ColumnGroupModel | null>(null);
    const [editMode, setEditMode] = React.useState<"edit" | "delete" | "">("");

    const initHandleSelectGroup = (columnGroup: ColumnGroupModel) => {
        return (event: React.MouseEvent) => {
            event.stopPropagation();

            setSelectedColumnGroup(columnGroup);
        };
    };

    const initHandleDoubleClickGroup = (columnGroup: ColumnGroupModel, mode: "select" | "edit") => {
        if (mode === "select") {
            return () => {
                // Do nothing.
            }
        }

        return (event: React.MouseEvent) => {
            event.stopPropagation();

            setSelectedColumnGroup(columnGroup);
            setEditMode("edit");
        };
    };

    const initGroupActionPanel = (mode: "select" | "edit") => {
        if (mode === "select") {
            return (<></>);
        }

        const handleAddGroup = () => {
            const columnGroupModel = new ColumnGroupModel({});
            setSelectedColumnGroup(columnGroupModel);
            setEditMode("edit");
        }

        const handleEditGroup = () => {
            if (selectedColumnGroup == null) {
                return;
            }

            setEditMode("edit");
        }

        const handleConfirmDeletingGroup = () => {
            if (selectedColumnGroup == null) {
                return;
            }

            setEditMode("delete");
        };

        return (
            <Box sx={{ mt: 'auto' }} onClick={handlePreventMouseEvent}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddGroup}>
                        Add
                    </Button>
                    <Button variant="outlined" startIcon={<EditIcon />}
                        disabled={selectedColumnGroup == null} onClick={handleEditGroup}>
                        Edit
                    </Button>
                    <Button variant="outlined" startIcon={<DeleteIcon />}
                        color="error" disabled={selectedColumnGroup == null}
                        onClick={handleConfirmDeletingGroup}>
                        Delete
                    </Button>
                </Stack>
            </Box>
        );
    };

    const initGroupRow = (columnGroup: ColumnGroupModel) => {
        const selected = (columnGroup.columnGroupId === selectedColumnGroup?.columnGroupId);
        const listStyle = selected ? {
            backgroundColor: SELECTED_CELL_COLOR,
            '&:hover': { backgroundColor: SELECTED_CELL_COLOR }
        } : {};

        return (
            <ListItemButton key={`column-group-${columnGroup.columnGroupId}`}
                sx={listStyle}
                onClick={initHandleSelectGroup(columnGroup)}
                onDoubleClick={initHandleDoubleClickGroup(columnGroup, viewMode)}>
                <ListItemIcon sx={{ width: "22px", minWidth: "22px" }}>{selected && "✔"}</ListItemIcon>
                <ListItemText primary={columnGroup.groupName} />
            </ListItemButton>
        );
    };

    const columnGroupModels = erdDocument.getColumnGroupModels();
    const columnGroupPanel = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
                {(columnGroupModels.length === 0)
                    ? (<Box sx={{ p: 1, textAlign: "center" }}>(No items)</Box>)
                    : (<List component="nav">
                        {columnGroupModels.map(columnGroup => initGroupRow(columnGroup))}
                    </List>)}
            </Box>
            {initGroupActionPanel(viewMode)}
        </Box >
    );

    const initColumnDetailPanel = (columnGroup: ColumnGroupModel | null) => {
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

        const tableHeader = (
            <TableHead>
                <TableRow>
                    <TableCell sx={{ width: "10px" }} align="center">PK</TableCell>
                    <TableCell>Physical Name</TableCell>
                    <TableCell>Logical Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell sx={{ width: "50px" }} align="center">NotNull</TableCell>
                    <TableCell sx={{ width: "50px" }} align="center">Unique</TableCell>
                </TableRow>
            </TableHead>
        );

        const initColumnModelRow = (columnModelId: string, targetIndex: number) => {
            const columnModel = erdDocument.findColumnModel(columnModelId);
            if (columnModel == null) {
                return (<></>);
            }

            const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
            if (columnShareModel == null) {
                return (<></>);
            }

            const overrideName = overrideColumnName(columnModel, columnShareModel);

            return (
                <TableRow key={`column-view-${targetIndex}`}>
                    <TableCell align="center" sx={{ height: "26px" }}>
                        {columnModel.primaryKey && <PrimaryKeyIcon />}
                    </TableCell>
                    <TableCell>{overrideName.physicalName}</TableCell>
                    <TableCell>{overrideName.logicalName}</TableCell>
                    <TableCell>{columnShareModel.specifiedColumnType()}</TableCell>
                    <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
                    <TableCell align="center">{columnModel.unique && <CheckIcon fontSize="small" />}</TableCell>
                </TableRow>
            );
        };

        return (
            <Stack direction="column" spacing={1} alignItems="stretch" justifyContent="space-between" sx={{ height: "100%" }}>
                <TableContainer>
                    <Table stickyHeader size="small" aria-label="column view table" style={{ tableLayout: "fixed" }}>
                        {tableHeader}
                        <TableBody>
                            {columnGroup.columnModelIds.map(
                                (columnModelId, index) => initColumnModelRow(columnModelId, index)
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TextField variant="outlined" aria-readonly
                    id="description" label="Description" multiline rows={3}
                    sx={{ '& .MuiInputBase-root': { resize: 'none', overflow: 'auto', pointerEvents: 'none' } }}
                    value={columnGroup.description} />
            </Stack>
        );
    };

    const initActionPanel = (mode: "select" | "edit", onSelect: (columnWrapModel: ColumnWrapModel) => void) => {
        if (mode === "edit") {
            return (
                <Button onClick={onClose} >Close</Button>
            );
        }

        const handleCompleted = () => {
            if (selectedColumnGroup == null) {
                return;
            }

            const columnModels = selectedColumnGroup.columnModelIds
                .map(columnModelId => erdDocument.findColumnModel(columnModelId))
                .filter(columnModel => (columnModel != null));

            const columnWrapModel: ColumnWrapModel = {
                modelType: "group",
                columnGroupModel: selectedColumnGroup,
                columnModels: columnModels
            };

            onSelect(columnWrapModel);
            onClose();
        };

        return (<>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={selectedColumnGroup == null} onClick={handleCompleted}>OK</Button>
        </>);
    };

    const handleCloseEditDialog = () => {
        setSelectedColumnGroup(null);
        setEditMode("");
    };

    const handleCloseDeletingDialog = () => setEditMode("");
    const handleDeleteGroup = () => {
        if (selectedColumnGroup == null) {
            return;
        }

        const loggingMessage = `Delete Column Group: ${JSON.stringify(selectedColumnGroup)}`;
        documentsHolder.deleteColumnGroup(selectedColumnGroup.columnGroupId, loggingMessage);

        handleCloseEditDialog();
    };

    const deleteDialog = ((selectedColumnGroup == null) || (editMode !== "delete")) ? null : (
        <Dialog open={(selectedColumnGroup != null) && (editMode === "delete")} onClose={handleCloseDeletingDialog}>
            <DialogTitle>Delete column group?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Are you sure to delete the column group {`'${selectedColumnGroup.groupName}'`} ?
                </DialogContentText>
                <Alert severity="warning" sx={{ marginTop: 2 }}>
                    This action will also remove its definitions from related tables.
                </Alert>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDeletingDialog}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleDeleteGroup}>Delete</Button>
            </DialogActions>
        </Dialog>
    );

    return (
        <>
            <Dialog fullWidth maxWidth="xl" sx={{ userSelect: "none" }}
                open={isOpen} onClose={initHandleCloseDialog(onClose)}>
                <DialogTitle>{(viewMode === "select" ? "Select Column Group" : "Column Groups")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={3}>
                        <Divider />
                        <Grid container spacing={3}>
                            <Grid size={3}>
                                <Paper elevation={4} sx={{ p: 1, display: 'flex', flexDirection: 'column', height: "300px" }}>
                                    {columnGroupPanel}
                                </Paper>
                            </Grid>
                            <Grid size={9} sx={{ height: "100%" }}>
                                <Paper elevation={4} sx={{ p: 1, overflowY: "auto", height: "300px" }}>
                                    {initColumnDetailPanel(selectedColumnGroup)}
                                </Paper>
                            </Grid>
                        </Grid>
                    </Stack>
                </DialogContent>
                <DialogActions>{initActionPanel(viewMode, onSelect)}</DialogActions>
            </Dialog>
            {(selectedColumnGroup != null) && (editMode === "edit") && (
                <ColumnGroupEditDialog
                    isOpen={editMode != null}
                    columnGroup={selectedColumnGroup}
                    onClose={handleCloseEditDialog} />
            )}
            {deleteDialog}
        </>
    );
};

export default ColumnGroupView;