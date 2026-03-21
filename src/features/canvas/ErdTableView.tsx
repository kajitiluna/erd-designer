/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid2, IconButton,
    Stack, Table, TableBody, TableCell, TableContainer, TableRow, Tooltip
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from '@mui/icons-material/Visibility';

import ColorSelector from "~/components/ColorSelector";
import TopLeftTooltip from "~/components/TopLeftTooltip";
import KeyColor from "~/components/icons/KeyColor";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { RELEASE_ACTION, SelectEntityContext, SelectState } from "~/context/SelectEntityContext";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import EditAction from "~/features/canvas/EditAction";
import CanvasPositionContext from "~/context/CanvasPositionContext";
import { DRAWABLE_AREA, handlePreventMouseEvent, withMultiSelectKey } from "~/features/canvas/support";
import TableViewModel from "~/models/TableViewModel";
import ColorValue from "~/models/ColorValue";
import { EditModeType } from "~/models/EditMode";
import ErdDocument from "~/models/ErdDocument";
import LineViewModel from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import DisplayStyle from "~/models/database/DisplayStyle";
import RelationModel from "~/models/database/RelationModel";
import TableModel from "~/models/database/TableModel";
import TableIndexModel from "~/models/database/TableIndexModel";
import TableUniqueKeysModel from "~/models/database/TableUniqueKeysModel";
import { overrideColumnName } from "~/models/database/support";

import styleClasses from "./ErdCanvas.module.css";

export const ERD_TABLE_VIEW_CLASS_NAME = "erdTableView";

type ErdTableViewProps = {
    tableViewModel: TableViewModel,
    visible?: boolean,
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void
};

const ErdTableView = ({ tableViewModel, visible = true, onEditAction, onDragAction }: ErdTableViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const [openDeletingDialog, setOpenDeleteDialog] = React.useState(false);

    const erdDocument = documentsHolder.current();

    const tableContentCache = React.useMemo(() => {
        const tableModel = tableViewModel.tableModel;
        const allColumns = erdDocument.toAllColumnModels(tableModel);
        const tableRows = (allColumns.length > 0)
            ? allColumns.map(columnModel => initTableColumn(columnModel, tableModel, erdDocument, selectState))
            : (<TableRow><TableCell></TableCell></TableRow>);

        return (
            <>
                <DescriptionTooltip title={tableModel.description} placement="top-end">
                    <Box sx={HEADER_STYLE}>{initDisplayTableName(erdDocument, tableModel)}</Box>
                </DescriptionTooltip>
                <Box sx={BODY_STYLE}>
                    <TableContainer>
                        <Table size="small">
                            <TableBody sx={{ fontSize: "0.875em" }}>{tableRows}</TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            </>
        );
    }, [
        erdDocument.lastUpdatedAt,
        // リレーション選択時に外部制約があるカラムの背景色を変更するので、それに対する検証
        (selectState.relationId || "")
    ]);

    const selected = selectState.tableIds.has(tableViewModel.tableId);

    const viewCache = React.useMemo(() => {
        return (
            <InnerErdTableView
                tableViewModel={tableViewModel}
                onEditAction={onEditAction}
                onDragAction={onDragAction}
                tableContentCache={tableContentCache}
                selected={selected}
                visible={visible}
                isOpenDeletingDialog={openDeletingDialog}
                onOpenDeleteDialog={setOpenDeleteDialog} />
        );
    }, [
        erdDocument.lastUpdatedAt,
        // 選択状態、およびドラッグ状態に対する検証
        selected, (selected ? dragState : ""),
        // 表示状態に対する検証
        visible,
        // リレーション作成時の制御に対する検証
        editMode, (editMode === EditModeType.CREATE_RELATION ? [...selectState.tableIds].join(",") : ""),
        // テーブルキャッシュに対する検証
        tableContentCache,
        // 削除確認ダイアログ表示に対する検証
        openDeletingDialog,
    ]);

    return viewCache;
};

const initDisplayTableName = (erdDocument: ErdDocument, tableModel: TableModel) => {
    const dbSchema = erdDocument.findSchema(tableModel.schemaId);
    const displayStyle = erdDocument.getDisplayStyle();

    const physicalName = (dbSchema != null)
        ? `${dbSchema.schemaName}.${tableModel.physicalName}`
        : tableModel.physicalName;

    return displayStyle.displayName(physicalName, tableModel.logicalName);
};

const HEADER_STYLE = {
    padding: "6px",
    paddingLeft: "8px",
    paddingRight: "8px",
    borderBottom: "1px solid black",
    display: "flex",
    fontSize: "0.95em"
};

const BODY_STYLE = {
    flex: "1 1 auto",
    display: "flex", flexDirection: "column", alignItems: "stretch",
    backgroundColor: "#FDFDFD"
};

const initTableColumn = (columnModel: ColumnModel, tableModel: TableModel, erdDocument: ErdDocument, selectState: SelectState) => {
    const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShareModel == null) {
        console.warn(`columnShareModel is not existed. columnShareModelId = ${columnModel.columnShareModelId}`)
        return (<></>);
    }

    const uniqueKeysModels = tableModel.uniqueKeysModels;
    const tableIndexModels = tableModel.tableIndexModels;

    const inChildRelation = erdDocument.inChildRelation(tableModel.tableModelId, columnModel.columnModelId);
    const fontColor = initTableColumnFontColor(columnModel, inChildRelation);

    const selectedRelationColumn = isSelectedRelationColumn(columnModel.columnModelId, erdDocument, selectState);

    const displayColumnName = initDisplayColumnName(columnModel, columnShareModel, erdDocument.getDisplayStyle());
    const displayColumnType = columnShareModel.specifiedColumnType(inChildRelation).replace("TIME ZONE", "TZ");
    const displayOption = initDisplayOption(columnModel);

    const styleRow = selectedRelationColumn ? {
        backgroundColor: "rgba(73, 76, 218, 0.12)",
    } : {};
    const styleTextCell = {
        whiteSpace: "nowrap", color: fontColor
    };
    const styleAttributeCell = {
        whiteSpace: "nowrap", color: fontColor, fontSize: "0.914em"
    };

    return (
        <TableRow key={`erd-table-column_${columnModel.columnModelId}`} sx={styleRow}>
            <TableCell align="center" sx={STYLE_PRIMARY_CELL} >
                {columnModel.primaryKey && <PrimaryKeyIcon />}
            </TableCell>
            <TableCell align="center" sx={STYLE_FOREIGN_CELL} >
                {inChildRelation && <ForeignKeyIcon />}
            </TableCell>

            <DescriptionTooltip title={columnShareModel.description} placement="top">
                <TableCell sx={styleTextCell}>{displayColumnName}</TableCell>
            </DescriptionTooltip>

            <TableCell sx={styleAttributeCell}>{displayColumnType}</TableCell>
            <TableCell align="center" sx={styleAttributeCell}>{displayOption}</TableCell>
            {initUniqueKeysMarkers(columnModel, uniqueKeysModels)}
            {initTableIndexMarkers(columnModel, tableIndexModels)}
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


const initUniqueKeysMarkers = (
    columnModel: ColumnModel, uniqueKeysModels: readonly TableUniqueKeysModel[]
) => {
    if (uniqueKeysModels.length === 0) {
        return (<></>);
    }

    const doInitIndexMarker = (uniqueKeysModel: TableUniqueKeysModel) => {
        const hasIndexed = uniqueKeysModel.uniqueKeysColumnModels.some(indexColumn =>
            indexColumn.columnModelId === columnModel.columnModelId);

        const marker = hasIndexed
            ? (
                <TopLeftTooltip title={uniqueKeysModel.physicalName}>
                    <span>+</span>
                </TopLeftTooltip>
            ) : (<span style={STYLE_MARKER_MARGIN}></span>);

        return (
            <Grid2 key={`table-unique_${uniqueKeysModel.tableUniqueKeysModelId}`}
                sx={STYLE_MARKER_GRID}>
                {marker}
            </Grid2>
        );
    };

    return (
        <TableCell sx={STYLE_MARKER_CELL}>
            <Grid2 container columns={uniqueKeysModels.length} spacing="1" sx={{ flexWrap: 'nowrap' }}>
                {uniqueKeysModels.map(uniqueKeysModel => doInitIndexMarker(uniqueKeysModel))}
            </Grid2>
        </TableCell>
    );
};

const initTableIndexMarkers = (
    columnModel: ColumnModel, tableIndexModels: readonly TableIndexModel[]
) => {
    if (tableIndexModels.length === 0) {
        return (<></>);
    }

    const doInitIndexMarker = (tableIndex: TableIndexModel) => {
        const hasIndexed = tableIndex.indexColumnModels.some(indexColumn =>
            indexColumn.columnModelId === columnModel.columnModelId);

        const marker = hasIndexed
            ? (
                <TopLeftTooltip title={tableIndex.physicalName}>
                    <span>*</span>
                </TopLeftTooltip>
            ) : (<span style={STYLE_MARKER_MARGIN}></span>);

        return (
            <Grid2 key={`table-index_${tableIndex.tableIndexModelId}`}
                sx={STYLE_MARKER_GRID}>
                {marker}
            </Grid2>
        );
    };

    return (
        <TableCell sx={STYLE_MARKER_CELL}>
            <Grid2 container columns={tableIndexModels.length} spacing="1" sx={{ flexWrap: 'nowrap' }}>
                {tableIndexModels.map(tableIndex => doInitIndexMarker(tableIndex))}
            </Grid2>
        </TableCell>
    );
};

const STYLE_PRIMARY_CELL = {
    whiteSpace: "nowrap",
    paddingTop: "4px", paddingBottom: "4px",
    paddingLeft: "12px", paddingRight: "2px"
};
const STYLE_FOREIGN_CELL = {
    whiteSpace: "nowrap",
    paddingTop: "4px", paddingBottom: "4px",
    paddingLeft: "2px", paddingRight: "12px"
};
const STYLE_MARKER_CELL = {
    paddingLeft: "0px", paddingRight: "10px"
};
const STYLE_MARKER_GRID = {
    whiteSpace: "nowrap", paddingLeft: "6px", paddingRight: "6px"
};
const STYLE_MARKER_MARGIN = { margin: "2.8px" };

// 自己関連を作成する制御にあたり、１つ目のテーブル選択時に自己関連を作成しないように制御するための状態
type SelfSelectableMode = "none" | "start_selecting" | "self_selectable";

type InnerErdTableViewProps = {
    tableViewModel: TableViewModel,
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void,
    tableContentCache: React.JSX.Element,
    selected: boolean,
    isOpenDeletingDialog: boolean,
    visible: boolean,
    onOpenDeleteDialog: (open: boolean) => void
};

const InnerErdTableView = ({
    tableViewModel, onEditAction, onDragAction,
    tableContentCache, selected, isOpenDeletingDialog, visible, onOpenDeleteDialog
}: InnerErdTableViewProps) => {

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);
    const displayScale = React.useContext(DisplayScaleContext);
    const positionResolver = React.useContext(CanvasPositionContext);

    const [selfSelectableMode, setSelfSelectableMode] = React.useState<SelfSelectableMode>("none");

    const erdDocument = documentsHolder.current();
    const erdSetting = erdDocument.erdSettingModel;
    const perspectives = erdSetting.getPerspectiveModels();

    const tableModel = tableViewModel.tableModel;

    const handleMouseDown = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        const mousePosition = positionResolver.getLogicalPosition(event, displayScale);
        if (editMode === EditModeType.SELECT) {
            event.stopPropagation();

            setSelfSelectableMode("none");
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
                setSelfSelectableMode(current => (current === "none") ? "start_selecting" : current);
            }

            return;
        }

        setSelfSelectableMode("none");
    };

    const handleMouseUp = (event: React.MouseEvent) => {
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
            // 選択を開始した直後に限り、親と子が同じテーブルの場合は無視する
            if ((parentTableId === tableViewModel.tableId) && (selfSelectableMode === "start_selecting")) {
                setSelfSelectableMode("self_selectable");
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
            setSelfSelectableMode("none");
        }
    };

    const handleClick = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        event.stopPropagation();
    };

    const handleDoubleClick = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        handleOpenEditDialog(event);
    };

    const handleSettingPerspectiveDialog = (event: React.MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onEditAction({ editType: "perspective", targetId: tableViewModel.tableId });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const handleOpenEditDialog = (event: React.MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onEditAction({ editType: "table", tableViewModel });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const handleSetColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({ type: "defaultColor", color: { background, foreground } });

        const beforeColor = tableViewModel.headerColor;
        const loggingMessage = `Update table color. ${JSON.stringify({
            tableId: tableViewModel.tableId,
            before: { background: beforeColor.background.toHex(), foreground: beforeColor.foreground.toHex() },
            after: { background: background.toHex(), foreground: foreground.toHex() }
        })}`;
        documentsHolder.updateTableViewColor([tableViewModel.tableId], background, foreground, loggingMessage);
    };

    const handleDeleteTable = (event: React.MouseEvent) => {
        const loggingMessage = `Delete table: ${JSON.stringify(tableViewModel)}`;
        documentsHolder.deleteTable(tableViewModel.tableId, loggingMessage);
        handleCloseDeletingDialog(event);
    };

    const handleCloseDeletingDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        onOpenDeleteDialog(false)
    };

    const moving = (selected && (dragState.status === "on_dragging"))
        ? dragState.delta() : { x: 0, y: 0 }

    const tableStyle = {
        position: "absolute", zIndex: selected ? 100 : "auto",
        left: tableViewModel.corner.left + moving.x + DRAWABLE_AREA.width / 2,
        top: tableViewModel.corner.top + moving.y + DRAWABLE_AREA.height / 2,
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        userSelect: "none",
        ...(!visible && { opacity: 0, pointerEvents: 'none' })
    };

    const boundStyle = {
        paddingBottom: "4px",
        border: "2px solid black",
        borderRadius: "10px",
        backgroundColor: tableViewModel.headerColor.background.toRgba(),
        color: tableViewModel.headerColor.foreground.toRgba()
    };

    const tableClassName = selected ?
        `${ERD_TABLE_VIEW_CLASS_NAME} ${styleClasses.selectedBox}`
        : ERD_TABLE_VIEW_CLASS_NAME;

    const controlPanel = (!selected || (editMode !== EditModeType.SELECT)
        || (dragState.status === "on_dragging")
        || (selectState.tableIds.size + selectState.memoIds.size !== 1))
        ? (<></>) : (
            <Stack direction="row" justifyContent="flex-end" onClick={handlePreventMouseEvent}
                onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
                <div style={CONTROL_PANEL_STYLE}>
                    <ColorSelector key={`table-color-selector_${tableViewModel.tableId}`}
                        color={tableViewModel.headerColor.background}
                        callback={handleSetColor} />
                    {(perspectives.length > 0) && (
                        <Tooltip title="Perspective" placement="top-end">
                            <IconButton onClick={handleSettingPerspectiveDialog}>
                                <VisibilityIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title="Edit" placement="top-end">
                        <IconButton onClick={handleOpenEditDialog}>
                            <EditIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete" placement="top-end">
                        <IconButton onClick={() => onOpenDeleteDialog(true)}>
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </div>
            </Stack>
        );

    return (
        <Box sx={tableStyle}>
            <Box id={tableViewModel.tableId} tabIndex={0} sx={boundStyle}
                style={{ cursor: 'pointer' }} className={tableClassName}
                onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
                onClick={handleClick} onDoubleClick={handleDoubleClick}>
                {tableContentCache}
            </Box>
            {controlPanel}
            <Dialog open={isOpenDeletingDialog} onClose={handleCloseDeletingDialog}>
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

const CONTROL_PANEL_STYLE = {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: "10px"
};

export default ErdTableView;
