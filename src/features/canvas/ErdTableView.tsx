import React, { MouseEvent, useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid2, IconButton,
    Stack, Table, TableBody, TableCell, TableContainer, TableRow, Tooltip
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import { LocalSettingContext } from "~/context/LocalSettingContext";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { DRAWABLE_AREA, getLogicalMousePosition, handlePreventMouseEvent, withMultiSelectKey } from "~/features/canvas/support";
import ColorSelector from "~/components/ColorSelector";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import TableViewModel from "~/models/TableViewModel";
import ColorValue from "~/models/ColorValue";
import ErdDocument from "~/models/ErdDocument";
import ColumnModel from "~/models/database/ColumnModel";
import KeyColor from "~/components/icons/KeyColor";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import EditModeContext from "~/context/EditModeContext";
import { EditModeType } from "~/models/EditMode";
import { RELEASE_ACTION, SelectEntityContext, SelectState } from "~/context/SelectEntityContext";
import EditAction from "~/features/canvas/EditAction";
import RelationModel from "~/models/database/RelationModel";
import RelationViewModel from "~/models/RelationViewModel";
import LineViewModel from "~/models/LineViewModel";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import TableModel from "~/models/database/TableModel";
import TopLeftTooltip from "~/components/TopLeftTooltip";

import styleClasses from "./ErdCanvas.module.css";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import DisplayStyle from "~/models/database/DisplayStyle";
import { overrideColumnName } from "~/models/database/support";

export const ERD_TABLE_VIEW_CLASS_NAME = "erdTableView";

type ErdTableViewProps = {
    tableViewModel: TableViewModel,
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void
};

const ErdTableView = ({ tableViewModel, onEditAction, onDragAction }: ErdTableViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const displayScale = React.useContext(DisplayScaleContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const [openDeletingDialog, setOpenDeleteDialog] = useState(false);

    const erdDocument = documentsHolder.current();

    const tableModel = tableViewModel.tableModel;

    const handleMouseDown = (event: MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        const mousePosition = getLogicalMousePosition(event, displayScale);
        if (editMode === EditModeType.SELECT) {
            event.stopPropagation();

            onDragAction({ type: "start_dragging", start: mousePosition });

            if (selectState.tableIds.has(tableViewModel.tableId)) {
                return;
            }

            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "table", tableId: tableViewModel.tableId, withMultiSelection
            });

            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            event.stopPropagation();

            onDragAction({ type: "start_dragging", start: mousePosition });

            if (selectState.tableIds.size !== 1) {
                dispatchSelectAction({ type: "table", tableId: tableViewModel.tableId });
            }

            return;
        }
    };

    const handleMouseUp = (event: MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        if (editMode === EditModeType.SELECT) {
            if ((selectState.status === "on_selecting")
                && (selectState.tableIds.has(tableViewModel.tableId))) {
                dispatchSelectAction({ type: "completed" });
                return;
            }

            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "table", tableId: tableViewModel.tableId, withMultiSelection
            });

            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            if (selectState.tableIds.size !== 1) {
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

    const handleClick = (event: MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        event.stopPropagation();
    };

    const handleDoubleClick = (event: MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        handleOpenEditDialog(event);
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
        dispatchLocalSetting({ type: "defaultColor", color: { background, foreground } });

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
    const moving = (selected && (dragState.status === "on_dragging"))
        ? dragState.delta() : { x: 0, y: 0 }

    const tableStyle = {
        position: "absolute", zIndex: selected ? 100 : "auto",
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
        display: "flex", flexDirection: "column", alignItems: "stretch",
        backgroundColor: "#FDFDFD"
    };

    const tableClassName = selected ?
        `${ERD_TABLE_VIEW_CLASS_NAME} ${styleClasses.selectedBox}`
        : ERD_TABLE_VIEW_CLASS_NAME;

    return (
        <Box sx={tableStyle}>
            <Box id={tableViewModel.tableId} tabIndex={0} sx={boundStyle}
                style={{ cursor: 'pointer' }} className={tableClassName}
                onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
                onClick={handleClick} onDoubleClick={handleDoubleClick}>
                <DescriptionTooltip title={tableModel.description} placement="top-end">
                    <Box sx={headerStyle}>{tableModel.displayName(erdDocument.getDisplayStyle())}</Box>
                </DescriptionTooltip>
                <Box sx={bodyStyle}>
                    <TableContainer>
                        <Table size="small">
                            <TableBody sx={{ fontSize: "0.875em" }}>
                                {tableModel.columnModelIds.map(columnModelId =>
                                    initTableColumn(columnModelId, tableModel, erdDocument, selectState))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            </Box>
            {selected && (editMode === EditModeType.SELECT) && (dragState.status !== "on_dragging")
                && (selectState.tableIds.size + selectState.memoIds.size === 1) && (
                    <Stack direction="row" justifyContent="flex-end" onClick={handlePreventMouseEvent}
                        onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
                        <div style={{ backgroundColor: "rgba(255, 255, 255, 0.9)", borderRadius: "10px" }}>
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
                        </div>
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

const initTableColumn = (columnId: string, tableModel: TableModel, erdDocument: ErdDocument, selectState: SelectState) => {
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

    const tableIndexModels = tableModel.tableIndexModels;

    const inChildRelation = erdDocument.inChildRelation(columnModel.columnModelId);
    const fontColor = initTableColumnFontColor(columnModel, inChildRelation);

    const selectedRelationColumn = isSelectedRelationColumn(columnId, erdDocument, selectState);

    const displayColumnName = initDisplayColumnName(columnModel, columnShareModel, erdDocument.getDisplayStyle());
    const displayColumnType = columnShareModel.specifiedColumnType(inChildRelation).replace("TIME ZONE", "TZ");
    const displayOption = initDisplayOption(columnModel);

    const styleRow = selectedRelationColumn ? {
        backgroundColor: "rgba(73, 76, 218, 0.12)",
    } : {};

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
    const styleIndexCell = {
        paddingLeft: "0px", paddingRight: "10px"
    };
    const styleIndexGrid = {
        whiteSpace: "nowrap", paddingLeft: "6px", paddingRight: "6px"
    };

    return (
        <TableRow key={`erd-table-column_${columnId}`} sx={styleRow}>
            <TableCell align="center" sx={stylePrimaryCell} >
                {columnModel.primaryKey && <PrimaryKeyIcon />}
            </TableCell>
            <TableCell align="center" sx={styleForeignCell} >
                {inChildRelation && <ForeignKeyIcon />}
            </TableCell>

            <DescriptionTooltip title={columnShareModel.description} placement="top">
                <TableCell sx={styleTextCell}>{displayColumnName}</TableCell>
            </DescriptionTooltip>

            <TableCell sx={styleAttributeCell}>{displayColumnType}</TableCell>
            <TableCell align="center" sx={styleAttributeCell}>{displayOption}</TableCell>
            {(tableIndexModels.length > 0) &&
                <TableCell sx={styleIndexCell}>
                    <Grid2 container columns={tableIndexModels.length} spacing="1">
                        {tableIndexModels.map(tableIndex =>
                            <Grid2 key={`table-index_${tableIndex.tableIndexModelId}`} sx={styleIndexGrid}>
                                {tableIndex.indexColumnModels.some(indexColumn =>
                                    indexColumn.columnModelId === columnModel.columnModelId)
                                    ? (
                                        <TopLeftTooltip title={tableIndex.physicalName}>
                                            <span>*</span>
                                        </TopLeftTooltip>
                                    ) : (<span style={{ margin: "2.8px" }}></span>)
                                }
                            </Grid2>
                        )}
                    </Grid2>
                </TableCell>
            }
        </TableRow >
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

const isSelectedRelationColumn = (columnId: string, erdDocument: ErdDocument, selectState: SelectState) => {
    if (selectState.relationId == null) {
        return false;
    }

    const viewModel = erdDocument.findRelationViewModel(selectState.relationId)
    if (viewModel == null) {
        return false;
    }

    for (const pair of viewModel.relationModel.relationPairs) {
        if (pair.parentColumnModelId === columnId || pair.childColumnModelId === columnId) {
            return true;
        }
    }

    return false;
}

const initDisplayColumnName = (columnModel: ColumnModel, shareModel: ColumnShareModel, displayStyle: DisplayStyle): string => {
    const overrideName = overrideColumnName(columnModel, shareModel);

    return displayStyle.displayName(overrideName.physicalName, overrideName.logicalName);
}

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
