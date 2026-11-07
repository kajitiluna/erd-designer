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
import { rowKeyNavigation } from "~/components/keyboard/row-key-navigation";
import useAutoFocus from "~/components/keyboard/useAutoFocus";


type ItemListPanelProps<ITEM> = {
    viewMode: "select" | "edit",
    isOpen: boolean,
    items: ITEM[];
    /** Key of the item selected when the panel is first mounted. */
    initialSelectedKey?: string;
    create: () => ITEM;
    toKey: (target: ITEM) => string;
    toTitle: (target: ITEM) => string;
    /** Called with the activated item (double-click or Enter) in "select" mode. */
    onConfirm?: (target: ITEM) => void;
};

const useItemListPanel = <ITEM,>({
    viewMode, isOpen, items, initialSelectedKey, create, toKey, toTitle, onConfirm = () => { }
}: ItemListPanelProps<ITEM>) => {
    const [selectedItem, setSelectedItem] = React.useState<ITEM | null>(
        () => { return findItemByKey(items, toKey, initialSelectedKey); });
    const [focusedIndex, setFocusedIndex] = React.useState<number>(
        () => { return Math.max(findIndexByKey(items, toKey, initialSelectedKey), 0); });
    const [editMode, setEditMode] = React.useState<"edit" | "delete" | "">("");
    const autoFocusRef = useAutoFocus<HTMLDivElement>(isOpen);

    // 項目の削除で件数が減っても、タブストップが残る位置へ補正する。
    const focusableIndex = Math.min(focusedIndex, items.length - 1);

    const handleSelect = (target: ITEM, index: number) => {
        setSelectedItem(target);
        setFocusedIndex(index);
    };

    // ダブルクリックと Enter の共通動作。select モードは確定、edit モードは編集ダイアログを開く。
    const handleActivate = (target: ITEM) => {
        setSelectedItem(target);
        if (viewMode === "select") {
            onConfirm(target);
            return;
        }

        setEditMode("edit");
    };

    const initHandleSelectRow = (target: ITEM, index: number) => {
        return (event: React.MouseEvent) => {
            event.stopPropagation();

            handleSelect(target, index);
        };
    };

    const initHandleDoubleClickRow = (target: ITEM) => {
        return (event: React.MouseEvent) => {
            event.stopPropagation();

            handleActivate(target);
        };
    };

    const initHandleKeyDownRow = (target: ITEM, index: number) => {
        return rowKeyNavigation.initHandleKeyDown({
            orientation: "vertical", index: index, lastIndex: items.length - 1,
            selectAt: setFocusedIndex,
            onSelect: () => handleSelect(target, index),
            onActivate: () => handleActivate(target)
        });
    };

    const initGroupRow = (target: ITEM, index: number) => {
        const selected = (selectedItem != null) && (toKey(selectedItem) === toKey(target));
        const listStyle = selected ? {
            backgroundColor: SELECTED_CELL_COLOR,
            '&:hover': { backgroundColor: SELECTED_CELL_COLOR }
        } : {};
        const focusable = (index === focusableIndex);

        return (
            <ListItemButton key={`column-group-${toKey(target)}`}
                ref={focusable ? autoFocusRef : undefined} tabIndex={focusable ? 0 : -1} sx={listStyle}
                onClick={initHandleSelectRow(target, index)} onDoubleClick={initHandleDoubleClickRow(target)}
                onKeyDown={initHandleKeyDownRow(target, index)}>
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
                        {items.map((item, index) => initGroupRow(item, index))}
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

const findItemByKey = <ITEM,>(
    items: ITEM[], toKey: (target: ITEM) => string, key: string | undefined
): ITEM | null => {
    if (key == null) {
        return null;
    }

    return items.find(item => (toKey(item) === key)) ?? null;
};

const findIndexByKey = <ITEM,>(items: ITEM[], toKey: (target: ITEM) => string, key: string | undefined): number => {
    if (key == null) {
        return -1;
    }

    return items.findIndex(item => (toKey(item) === key));
};

export const initColumnTableHelper = (erdDocument: ErdDocument, withPrimaryKey: boolean) => {
    const withLogicalName = erdDocument.getDisplayNameStyle().withLogicalName();
    // 名前列 + Type + NotNull + Unique
    const groupRowSpan = withLogicalName ? 5 : 4;

    const tableHeader = (
        <TableHead>
            <TableRow>
                {withPrimaryKey && (<TableCell sx={{ width: "10px" }} align="center">PK</TableCell>)}
                <TableCell>Physical Name</TableCell>
                {withLogicalName && (<TableCell>Logical Name</TableCell>)}
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
                {withLogicalName && (<TableCell>{overrideName.logicalName}</TableCell>)}
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
                {withLogicalName && (<TableCell>{overrideName.logicalName}</TableCell>)}
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
                <TableCell colSpan={groupRowSpan}>{columnGroup.groupName}</TableCell>
            </TableRow>
        );
    };

    return { tableHeader, initColumnRow, initColumnGroupRow };
};

export default useItemListPanel;