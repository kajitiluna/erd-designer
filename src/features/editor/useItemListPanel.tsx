import React from "react";
import { Box, Button, List, ListItemButton, ListItemIcon, ListItemText, Stack, TableCell, TableHead, TableRow } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";

import { handlePreventMouseEvent } from "~/features/canvas/support";
import { SELECTED_CELL_COLOR } from "~/features/editor/support";
import ErdDocument from "~/models/ErdDocument";
import { overrideColumnName } from "~/models/database/support";
import StructColumnModel from "~/models/database/StructColumnModel";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";


type ItemListPanelProps<ITEM> = {
    viewMode: "select" | "edit",
    items: ITEM[];
    create: () => ITEM;
    toKey: (target: ITEM) => string;
    toTitle: (target: ITEM) => string;
};

const useItemListPanel = <ITEM,>({ viewMode, items, create, toKey, toTitle }: ItemListPanelProps<ITEM>) => {
    const [selectedItem, setSelectedItem] = React.useState<ITEM | null>(null);
    const [editMode, setEditMode] = React.useState<"edit" | "delete" | "">("");

    const initHandleSelectRow = (target: ITEM) => {
        return (event: React.MouseEvent) => {
            event.stopPropagation();

            setSelectedItem(target);
        };
    };

    const initHandleDoubleClickRow = (target: ITEM, mode: "select" | "edit") => {
        if (mode === "select") {
            return () => {
                // Do nothing.
            }
        }

        return (event: React.MouseEvent) => {
            event.stopPropagation();

            setSelectedItem(target);
            setEditMode("edit");
        };
    };

    const initGroupRow = (target: ITEM) => {
        const selected = (selectedItem != null) && (toKey(selectedItem) === toKey(target));
        const listStyle = selected ? {
            backgroundColor: SELECTED_CELL_COLOR,
            '&:hover': { backgroundColor: SELECTED_CELL_COLOR }
        } : {};

        return (
            <ListItemButton key={`column-group-${toKey(target)}`}
                sx={listStyle}
                onClick={initHandleSelectRow(target)}
                onDoubleClick={initHandleDoubleClickRow(target, viewMode)}>
                <ListItemIcon sx={{ width: "22px", minWidth: "22px" }}>{selected && "✔"}</ListItemIcon>
                <ListItemText primary={toTitle(target)} />
            </ListItemButton>
        );
    };

    const initActionPanel = () => {
        const handleAddGroup = () => {
            const newModel = create();
            setSelectedItem(newModel);
            setEditMode("edit");
        }

        const handleEditGroup = () => {
            if (selectedItem == null) {
                return;
            }

            setEditMode("edit");
        }

        const handleConfirmDeletingGroup = () => {
            if (selectedItem == null) {
                return;
            }

            setEditMode("delete");
        };

        return (
            <Box sx={{ mt: 'auto' }} onClick={handlePreventMouseEvent}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddGroup}>
                        Add
                    </Button>
                    <Button variant="outlined" startIcon={<EditIcon />}
                        disabled={selectedItem == null} onClick={handleEditGroup}>
                        Edit
                    </Button>
                    <Button variant="outlined" startIcon={<DeleteIcon />}
                        color="error" disabled={selectedItem == null}
                        onClick={handleConfirmDeletingGroup}>
                        Delete
                    </Button>
                </Stack>
            </Box>
        );
    };

    const listPanel = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
                {(items.length === 0)
                    ? (<Box sx={{ p: 1, textAlign: "center" }}>(No items)</Box>)
                    : (<List component="nav">
                        {items.map(item => initGroupRow(item))}
                    </List>)}
            </Box>
            {(viewMode === "edit") && initActionPanel()}
        </Box >
    );

    const reset = (withSelection: boolean = false) => {
        setEditMode("");
        if (withSelection) {
            setSelectedItem(null);
        }
    };

    return { listPanel, selectedItem, editMode, reset };
};

export const initColumnTableHelper = (erdDocument: ErdDocument, withPrimaryKey: boolean) => {
    const tableHeader = (
        <TableHead>
            <TableRow>
                {withPrimaryKey && (<TableCell sx={{ width: "10px" }} align="center">PK</TableCell>)}
                <TableCell>Physical Name</TableCell>
                <TableCell>Logical Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">NotNull</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">Unique</TableCell>
            </TableRow>
        </TableHead>
    );

    const initColumnRow = (columnModelId: string) => {
        const columnModel = erdDocument.findColumnModel(columnModelId);
        if (columnModel == null) {
            return (<></>);
        }

        if (columnModel.entityType === "struct") {
            return doInitStructColumnRow(columnModel);
        }

        const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            return (<></>);
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);

        return (
            <TableRow key={`column-view-${columnModelId}`}>
                {withPrimaryKey && (
                    <TableCell align="center" sx={{ height: "26px" }}>
                        {columnModel.primaryKey && <PrimaryKeyIcon />}
                    </TableCell>
                )}
                <TableCell>{overrideName.physicalName}</TableCell>
                <TableCell>{overrideName.logicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType()}</TableCell>
                <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
                <TableCell align="center">{columnModel.unique && <CheckIcon fontSize="small" />}</TableCell>
            </TableRow>
        );
    };

    const doInitStructColumnRow = (columnModel: StructColumnModel) => {
        const structColumnShareModel = erdDocument.findStructColumnShareModel(columnModel.structShareModelId);
        if (structColumnShareModel == null) {
            return (<></>);
        }

        const overrideName = overrideColumnName(columnModel, structColumnShareModel);

        return (
            <TableRow key={`column-view-${columnModel.columnModelId}`}>
                {withPrimaryKey && (<TableCell align="center" sx={{ height: "26px" }}></TableCell>)}
                <TableCell>{overrideName.physicalName}</TableCell>
                <TableCell>{overrideName.logicalName}</TableCell>
                <TableCell>{structColumnShareModel.simpleColumnType()}</TableCell>
                <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
                <TableCell align="center"></TableCell>
            </TableRow>
        );
    };

    const initColumnGroupRow = (columnGroupId: string) => {
        const columnGroup = erdDocument.findColumnGroupModel(columnGroupId);
        if (columnGroup == null) {
            return (<></>);
        }

        return (
            <TableRow key={`column-view-${columnGroupId}`}>
                {withPrimaryKey && (<TableCell align="center" sx={{ height: "26px" }}></TableCell>)}
                <TableCell colSpan={5}>{columnGroup.groupName}</TableCell>
            </TableRow>
        );
    };

    return { tableHeader, initColumnRow, initColumnGroupRow };
};

export default useItemListPanel;