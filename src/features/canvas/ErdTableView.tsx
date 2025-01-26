import React, { MouseEvent, useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton,
    Stack, Table, TableBody, TableCell, TableContainer, TableRow, Tooltip
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import TableViewModel from "~/models/TableViewModel";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { DRAWABLE_AREA, handlePreventMouseEvent, withMultiSelectKey } from "~/features/canvas/support";
import ColorSelector from "~/components/ColorSelector";
import ColorValue from "~/models/ColorValue";
import ErdDocument from "~/models/ErdDocument";
import ColumnModel from "~/models/database/ColumnModel";
import KeyColor from "~/components/icons/KeyColor";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import EditModeContext from "~/context/EditModeContext";
import { EditModeType } from "~/models/EditMode";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import EditAction from "~/features/canvas/EditAction";
import RelationModel from "~/models/database/RelationModel";
import RelationViewModel from "~/models/RelationViewModel";
import LineViewModel from "~/models/LineViewModel";
import { DragActionContext } from "~/context/DragActionContext";

import styleClasses from "./ErdCanvas.module.css";

export const ERD_TABLE_VIEW_CLASS_NAME = "erdTableView";

type ErdTableViewProps = {
    tableViewModel: TableViewModel,
    onEditAction: (editAction: EditAction) => void
};

const ErdTableView = ({ tableViewModel, onEditAction }: ErdTableViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const [openDeletingDialog, setOpenDeleteDialog] = useState(false);

    const erdDocument = documentsHolder.current();

    const tableModel = tableViewModel.tableModel;

    const handleClick = (event: MouseEvent) => {
        if (editMode === EditModeType.SELECT) {
            event.stopPropagation();

            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "table", tableId: tableViewModel.tableId, withMultiSelection
            });

            return;
        }

        // テーブル作成モードで該当テーブルがクリックされた場合は、何もしない
        if (editMode === EditModeType.CREATE_TABLE) {
            event.stopPropagation();
            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            event.stopPropagation();

            if (selectState.tableIds.size !== 1) {
                dispatchSelectAction({ type: "table", tableId: tableViewModel.tableId });
                return;
            }

            const parentTableId = selectState.tableIds.values().next().value as string;
            // 親と子が同じテーブルの場合は無視する
            if (parentTableId === tableViewModel.tableId) {
                return;
            }

            const parentTableView = erdDocument.findTableViewModel(parentTableId);
            if (parentTableView == null) {
                console.error(`Not found tableViewModel. tableId = ${parentTableId}`);
                dispatchSelectAction(RELEASE_ACTION);
                return;
            }

            const relationModel = new RelationModel({
                parentTableModelId: parentTableId,
                childTableModelId: tableViewModel.tableId
            });
            const lineViewModel = new LineViewModel({});

            onEditAction({
                editType: "relation",
                relationViewModel: new RelationViewModel({ relationModel, lineViewModel }),
                parentTable: parentTableView.tableModel,
                childTable: tableModel
            });
            dispatchSelectAction(RELEASE_ACTION);
        }
    };

    const handleOpenEditDialog = (event: MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onEditAction({ editType: "table", tableViewModel });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const handleSetColor = (background: ColorValue, foreground: ColorValue) => {
        documentsHolder.updateTableViewColor([tableViewModel.tableId], background, foreground);
    };

    const handleDeleteTable = (event: MouseEvent) => {
        documentsHolder.deleteTable(tableViewModel.tableId);
        handleCloseDeletingDialog(event);
    };

    const handleCloseDeletingDialog = (event: MouseEvent) => {
        event.stopPropagation();
        setOpenDeleteDialog(false)
    };

    const selected = selectState.tableIds.has(tableViewModel.tableId);
    const moving = (selected && (dragState.status === "on_dragging")) ? dragState.delta() : { x: 0, y: 0 }

    const tableStyle = {
        position: "absolute",
        left: tableViewModel.corner.left + moving.x + DRAWABLE_AREA.width / 2,
        top: tableViewModel.corner.top + moving.y + DRAWABLE_AREA.height / 2,
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        userSelect: "none"
    };

    const boundStyle = {
        paddingBottom: "4px",
        border: "2px solid black",
        borderRadius: "10px",
        backgroundColor: tableViewModel.headerColor.background.toHex(),
        color: tableViewModel.headerColor.foreground.toHex()
    };

    const headerStyle = {
        padding: "6px",
        paddingLeft: "8px",
        paddingRight: "8px",
        borderBottom: "1px solid black",
        display: "flex",
        fontSize: "0.95em"
    };

    const bodyStyle = {
        flex: "1 1 auto",
        display: "flex", ßflexDirection: "column", alignItems: "stretch",
        backgroundColor: "#FDFDFD"
    };

    return (
        <Box sx={tableStyle}>
            <Box id={tableViewModel.tableId} tabIndex={0} sx={boundStyle} style={{ cursor: 'pointer' }}
                onClick={handleClick} onDoubleClick={handleOpenEditDialog}
                className={selected ? `${ERD_TABLE_VIEW_CLASS_NAME} ${styleClasses.selectedBox}` : ERD_TABLE_VIEW_CLASS_NAME}>
                <DescriptionTooltip title={tableModel.description} placement="top-end">
                    <Box sx={headerStyle}>{tableModel.displayName(erdDocument.getDisplayStyle())}</Box>
                </DescriptionTooltip>
                <Box sx={bodyStyle}>
                    <TableContainer>
                        <Table size="small">
                            <TableBody sx={{ fontSize: "0.875em" }}>
                                {tableModel.columnModelIds.map((columnModelId: string) =>
                                    initTableColumn(columnModelId, erdDocument))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            </Box>
            {selected && (editMode === EditModeType.SELECT) && (dragState.status !== "on_dragging") && (
                <Stack direction="row" justifyContent="flex-end" onClick={handlePreventMouseEvent}
                    onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
                    <ColorSelector key={`table-color-selector_${tableViewModel.tableId}`}
                        color={tableViewModel.headerColor.background}
                        callback={handleSetColor} />
                    <Tooltip title="Edit" placement="top-end">
                        <IconButton onClick={handleOpenEditDialog}>
                            <EditIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete" placement="top-end">
                        <IconButton onClick={() => setOpenDeleteDialog(true)}>
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )}
            <Dialog open={openDeletingDialog} onClose={handleCloseDeletingDialog}>
                <DialogTitle>Delete table?</DialogTitle>
                <DialogContent>
                    <DialogContentText>Are you sure to delete the table {`'${tableModel.physicalName}'`} ?</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeletingDialog}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={handleDeleteTable}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const initTableColumn = (columnId: string, erdDocument: ErdDocument) => {
    const columnModel: ColumnModel | null = erdDocument.findColumnModel(columnId);
    if (columnModel == null) {
        console.warn(`columnModel is not existed. columnModelId = ${columnId}`)
        return (<></>);
    }

    const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShareModel == null) {
        console.warn(`columnShareModel is not existed. columnShareModelId = ${columnModel.columnShareModelId}`)
        return (<></>);
    }

    const inChildRelation: boolean = erdDocument.inChildRelation(columnModel.columnModelId);
    const fontColor = initTableColumnFontColor(columnModel, inChildRelation);

    const displayColumnName = columnShareModel.displayName(erdDocument.getDisplayStyle());
    const displayColumnType = columnShareModel.specifiedColumnType().replace("TIME ZONE", "TZ");
    const displayOption = initDisplayOption(columnModel);

    const stylePrimaryCell = {
        whiteSpace: "nowrap",
        paddingTop: "4px", paddingBottom: "4px",
        paddingLeft: "12px", paddingRight: "2px"
    };
    const styleForeignCell = {
        whiteSpace: "nowrap",
        paddingTop: "4px", paddingBottom: "4px",
        paddingLeft: "2px", paddingRight: "12px"
    };
    const styleTextCell = {
        whiteSpace: "nowrap", color: fontColor
    };
    const styleAttributeCell = {
        whiteSpace: "nowrap", color: fontColor, fontSize: "0.914em"
    };

    return (
        <DescriptionTooltip key={`erd-table-column_${columnId}`} title={columnShareModel.description} placement="top-end">
            <TableRow>
                <TableCell align="center" sx={stylePrimaryCell} >
                    {columnModel.primaryKey && <PrimaryKeyIcon />}
                </TableCell>
                <TableCell align="center" sx={styleForeignCell} >
                    {inChildRelation && <ForeignKeyIcon />}
                </TableCell>
                <TableCell sx={styleTextCell}>{displayColumnName}</TableCell>
                <TableCell sx={styleAttributeCell}>{displayColumnType}</TableCell>
                <TableCell align="center" sx={styleAttributeCell} >{displayOption}</TableCell>
            </TableRow>
        </DescriptionTooltip>
    );
};

const initTableColumnFontColor = (columnModel: ColumnModel, inChildRelation: boolean) => {
    if (columnModel.primaryKey && inChildRelation) {
        return KeyColor.primaryAndForeign;
    }

    if (columnModel.primaryKey) {
        return KeyColor.primary;
    }

    return inChildRelation ? KeyColor.foreign : "#000000";
};

const initDisplayOption = (columnModel: ColumnModel): string => {
    const columnOptions = [];
    if (columnModel.unique) {
        columnOptions.push("U");
    }
    if (columnModel.notNull) {
        columnOptions.push("NN");
    }

    return (columnOptions.length > 0) ? `(${columnOptions.join("")})` : "";
};

export default ErdTableView;
