/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";
import ReactDOM from "react-dom";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid, IconButton,
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
import ViewportContext from "~/context/ViewportContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import PortalCanvasContext from "~/context/PortalCanvasContext";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import EditAction from "~/features/canvas/EditAction";
import { handlePreventMouseEvent, withMultiSelectKey } from "~/features/canvas/support";
import TableViewModel from "~/models/TableViewModel";
import ColorValue from "~/models/ColorValue";
import { EditModeType } from "~/models/EditMode";
import { ColumnRowEntry, expandColumnRows, isColumnRowVisible } from "~/models/column-row-expansion";
import ErdDocument from "~/models/ErdDocument";
import LineViewModel from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import DisplayNameStyle from "~/models/DisplayNameStyle";
import RelationModel from "~/models/database/RelationModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import TableModel from "~/models/database/TableModel";
import TableIndexModel from "~/models/database/TableIndexModel";
import TableUniqueKeysModel from "~/models/database/TableUniqueKeysModel";
import { overrideColumnName } from "~/models/database/support";

import styleClasses from "./ErdCanvas.module.css";
import SelectState from "~/models/SelectState";
import DisplayColumnStyle from "~/models/DisplayColumnStyle";
import { DragState } from "~/models/DragState";

export const ERD_TABLE_VIEW_CLASS_NAME = "erd-table-view";

type ErdTableViewProps = {
    tableView: TableViewModel,
    visible?: boolean,
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void
};

const ErdTableView = ({ tableView, visible = true, onEditAction, onDragAction }: ErdTableViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const [openDeletingDialog, setOpenDeleteDialog] = React.useState(false);

    const erdDocument = documentsHolder.current();

    const tableContentCache = React.useMemo(() => {
        const tableModel = tableView.tableModel;
        const displayStyle = erdDocument.getDisplayColumnStyle();

        const allColumns = (displayStyle.equals(DisplayColumnStyle.NONE))
            ? [] : erdDocument.toAllColumnsWithStruct(tableModel);
        const columnRows = expandColumnRows(erdDocument, allColumns)
            .filter(row => isColumnRowVisible(erdDocument, tableModel, row));
        const tableRows = (columnRows.length > 0)
            ? columnRows.map(row => initTableColumnRow(row, tableModel, erdDocument, selectState))
            : (<TableRow><TableCell></TableCell></TableRow>);

        return (<>
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
        </>);
    }, [
        erdDocument.lastUpdatedAt,
        // リレーション選択時に外部制約があるカラムの背景色を変更するので、それに対する検証
        (selectState.relationId || "")
    ]);

    const selected = selectState.tableIds.has(tableView.tableId);

    const wrapTableTooltip = React.useMemo(() => {
        return initWrapContentTooltip(tableView.tableModel, selected, erdDocument, dragState);
    }, [erdDocument.lastUpdatedAt, selected, (selected ? dragState.status : "")]);

    const viewCache = React.useMemo(() => {
        return (
            <InnerErdTableView
                tableView={tableView}
                onEditAction={onEditAction}
                onDragAction={onDragAction}
                tableContentCache={tableContentCache}
                selected={selected}
                visible={visible}
                isOpenDeletingDialog={openDeletingDialog}
                wrapTableTooltip={wrapTableTooltip}
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
        tableContentCache, wrapTableTooltip,
        // 削除確認ダイアログ表示に対する検証
        openDeletingDialog
    ]);

    return viewCache;
};

const initDisplayTableName = (erdDocument: ErdDocument, tableModel: TableModel) => {
    const dbSchema = erdDocument.findSchema(tableModel.schemaId);
    const displayNameStyle = erdDocument.getDisplayNameStyle();

    const physicalName = (dbSchema != null)
        ? `${dbSchema.schemaName}.${tableModel.physicalName}`
        : tableModel.physicalName;

    return displayNameStyle.displayName(physicalName, tableModel.logicalName);
};

const HEADER_STYLE = {
    padding: "6px",
    paddingLeft: "8px",
    paddingRight: "8px",
    borderBottom: "1px solid black",
    display: "flex",
    whiteSpace: "nowrap",
    fontSize: "0.95em"
};

const BODY_STYLE = {
    flex: "1 1 auto",
    display: "flex", flexDirection: "column", alignItems: "stretch",
    backgroundColor: "#FDFDFD"
};

const initTableColumnRow = (
    row: ColumnRowEntry, tableModel: TableModel, erdDocument: ErdDocument, selectState: SelectState = SelectState.NONE
): React.JSX.Element => {
    if (isSimpleColumnRow(row)) {
        return initTableSingleColumn(row, tableModel, erdDocument, selectState);
    }

    return initTableStructColumnRow(row, tableModel, erdDocument);
};

const isSimpleColumnRow = (row: ColumnRowEntry): row is ColumnRowEntry & { columnModel: SimpleColumnModel } => {
    return ColumnModel.isSimpleColumn(row.columnModel);
};

const initTableSingleColumn = (
    row: ColumnRowEntry & { columnModel: SimpleColumnModel }, tableModel: TableModel,
    erdDocument: ErdDocument, selectState: SelectState
) => {
    const columnModel = row.columnModel;
    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShare == null) {
        console.warn(`columnShareModel is not existed. columnShareModelId = ${columnModel.columnShareModelId}`)
        return (<></>);
    }

    const selectedRelationColumn = isSelectedRelationColumn(columnModel.columnModelId, erdDocument, selectState);

    const displayColumnName = initDisplayColumnName(columnModel, columnShare, erdDocument.getDisplayNameStyle());
    const inChildRelation = erdDocument.inChildRelation(tableModel.tableModelId, columnModel.columnModelId);
    const displayColumnType = columnShare.specifiedColumnType(inChildRelation).replace("TIME ZONE", "TZ");
    const displayOption = initDisplayOption(columnModel);

    const uniqueKeysModels = tableModel.uniqueKeysModels;
    const tableIndexModels = tableModel.tableIndexModels;

    const fontColor = initTableColumnFontColor(columnModel, inChildRelation);
    const styleRow = selectedRelationColumn ? { backgroundColor: "rgba(73, 76, 218, 0.12)" } : {};
    const styleTextCell = { whiteSpace: "nowrap", color: fontColor };
    const styleAttributeCell = { whiteSpace: "nowrap", color: fontColor, fontSize: "0.914em" };
    const indentStyle = { marginLeft: `${row.nestCount * STRUCT_INDENT_WIDTH}px` };

    return (
        <TableRow key={`erd-table-column_${row.rowId}`}
            data-column-id={row.rowId} sx={styleRow}>
            <TableCell align="center" sx={STYLE_PRIMARY_CELL} >
                {columnModel.primaryKey && <PrimaryKeyIcon />}
            </TableCell>
            <TableCell align="center" sx={STYLE_FOREIGN_CELL} >
                {inChildRelation && <ForeignKeyIcon />}
            </TableCell>

            <DescriptionTooltip title={columnShare.description} placement="top">
                <TableCell sx={styleTextCell}>
                    <span style={indentStyle}>{displayColumnName}</span>
                </TableCell>
            </DescriptionTooltip>

            <TableCell sx={styleAttributeCell}>
                <span style={indentStyle}>{displayColumnType}</span>
            </TableCell>
            <TableCell align="center" sx={styleAttributeCell}>{displayOption}</TableCell>
            {initUniqueKeysMarkers(columnModel, uniqueKeysModels)}
            {initTableIndexMarkers(columnModel, tableIndexModels)}
        </TableRow >
    );
};

const initTableStructColumnRow = (
    row: ColumnRowEntry & { columnModel: StructColumnModel }, tableModel: TableModel, erdDocument: ErdDocument
): React.JSX.Element => {
    const structColumn = row.columnModel;
    const structShare = erdDocument.findStructColumnShareModel(structColumn.structShareModelId);
    if (structShare == null) {
        console.warn(`structColumnShareModel is not existed. structColumnShareId = ${structColumn.structShareModelId}`)
        return (<></>);
    }

    const overrideName = overrideColumnName(structColumn, structShare);
    const columnName = erdDocument.getDisplayNameStyle().displayName(overrideName.physicalName, overrideName.logicalName);
    const displayColumnType = structShare.simpleColumnType();
    const displayOption = structColumn.notNull ? "(NN)" : "";

    const indentStyle = { marginLeft: `${row.nestCount * STRUCT_INDENT_WIDTH}px` };

    return (
        <TableRow key={`erd-table-column_${row.rowId}`}
            data-column-id={row.rowId}>
            <TableCell align="center" sx={STYLE_PRIMARY_CELL} />
            <TableCell align="center" sx={STYLE_FOREIGN_CELL} />

            <DescriptionTooltip title={structShare.description} placement="top">
                <TableCell sx={TEXT_CELL_STYLE}>
                    <span style={indentStyle}>{columnName}</span>
                </TableCell>
            </DescriptionTooltip>

            <TableCell sx={ATTRIBUTE_CELL_STYLE}>
                <span style={indentStyle}>{displayColumnType}</span>
            </TableCell>
            <TableCell align="center" sx={ATTRIBUTE_CELL_STYLE}>{displayOption}</TableCell>
            {initEmptyMarkerCell(tableModel.uniqueKeysModels)}
            {initEmptyMarkerCell(tableModel.tableIndexModels)}
        </TableRow>
    );
};

const TEXT_CELL_STYLE = { whiteSpace: "nowrap", color: "#000000" } as const;
const ATTRIBUTE_CELL_STYLE = { whiteSpace: "nowrap", color: "#000000", fontSize: "0.914em" } as const;

const initEmptyMarkerCell = (markerModels: readonly (TableUniqueKeysModel | TableIndexModel)[]) => {
    if (markerModels.length === 0) {
        return (<></>);
    }

    return (<TableCell sx={STYLE_MARKER_CELL} />);
};

const initTableColumnFontColor = (columnModel: SimpleColumnModel, inChildRelation: boolean) => {
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
        if ((pair.parentColumnModelId === columnId) || (pair.childColumnModelId === columnId)) {
            return true;
        }
    }

    return false;
}

const initDisplayColumnName = (
    columnModel: ColumnModel, shareModel: ColumnShareModel, displayStyle: DisplayNameStyle
): string => {
    const overrideName = overrideColumnName(columnModel, shareModel);

    return displayStyle.displayName(overrideName.physicalName, overrideName.logicalName);
}

const initDisplayOption = (columnModel: SimpleColumnModel): string => {
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
            <Grid key={`table-unique_${uniqueKeysModel.tableUniqueKeysModelId}`}
                sx={STYLE_MARKER_GRID}>
                {marker}
            </Grid>
        );
    };

    return (
        <TableCell sx={STYLE_MARKER_CELL}>
            <Grid container columns={uniqueKeysModels.length} spacing="1" sx={{ flexWrap: 'nowrap' }}>
                {uniqueKeysModels.map(uniqueKeysModel => doInitIndexMarker(uniqueKeysModel))}
            </Grid>
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
            <Grid key={`table-index_${tableIndex.tableIndexModelId}`}
                sx={STYLE_MARKER_GRID}>
                {marker}
            </Grid>
        );
    };

    return (
        <TableCell sx={STYLE_MARKER_CELL}>
            <Grid container columns={tableIndexModels.length} spacing="1" sx={{ flexWrap: 'nowrap' }}>
                {tableIndexModels.map(tableIndex => doInitIndexMarker(tableIndex))}
            </Grid>
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

// STRUCT のネスト階層を視覚化する 1 レベルあたりのインデント幅(px)。nestCount=0 で 0=インデント無し。
const STRUCT_INDENT_WIDTH = 10;

// 自己関連を作成する制御にあたり、１つ目のテーブル選択時に自己関連を作成しないように制御するための状態
type SelfSelectableMode = "none" | "start_selecting" | "self_selectable";

type InnerErdTableViewProps = {
    tableView: TableViewModel,
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void,
    tableContentCache: React.JSX.Element,
    selected: boolean,
    isOpenDeletingDialog: boolean,
    visible: boolean,
    wrapTableTooltip: (content: React.JSX.Element) => React.JSX.Element,
    onOpenDeleteDialog: (open: boolean) => void
};

const InnerErdTableView = ({
    tableView, onEditAction, onDragAction,
    tableContentCache, selected, isOpenDeletingDialog, visible, wrapTableTooltip, onOpenDeleteDialog
}: InnerErdTableViewProps) => {

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { viewport } = React.useContext(ViewportContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const containerRef = React.useRef<HTMLDivElement>(null);
    const [selfSelectableMode, setSelfSelectableMode] = React.useState<SelfSelectableMode>("none");

    const erdDocument = documentsHolder.current();
    const tableModel = tableView.tableModel;

    const handleMouseDown = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        const mousePosition = viewport.getLogicalPosition(event);
        if (editMode === EditModeType.SELECT) {
            event.stopPropagation();

            setSelfSelectableMode("none");
            onDragAction({ type: "start_dragging", start: mousePosition });

            if (selectState.tableIds.has(tableView.tableId)) {
                return;
            }

            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "table", tableId: tableView.tableId, withMultiSelection
            });

            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            event.stopPropagation();

            onDragAction({ type: "start_dragging", start: mousePosition });

            if (selectState.tableIds.size !== 1) {
                dispatchSelectAction({ type: "table", tableId: tableView.tableId });
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
            const didDrag = (dragState.status === "on_dragging")
                && ((dragState.delta().x !== 0) || (dragState.delta().y !== 0));
            if (didDrag) {
                return;
            }

            if ((selectState.status === "on_selecting")
                && (selectState.tableIds.has(tableView.tableId))) {
                dispatchSelectAction({ type: "completed" });
                return;
            }

            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "table", tableId: tableView.tableId, withMultiSelection
            });

            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            if (selectState.tableIds.size !== 1) {
                return;
            }

            const parentTableId = selectState.tableIds.values().next().value as string;
            // 選択を開始した直後に限り、親と子が同じテーブルの場合は無視する
            if ((parentTableId === tableView.tableId) && (selfSelectableMode === "start_selecting")) {
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
                childTableModelId: tableView.tableId
            });
            const lineViewModel = new LineViewModel({});

            onEditAction({
                editType: "relation",
                relationView: new RelationViewModel({ relationModel, lineViewModel }),
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

    const handleOpenEditDialog = (event: React.MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onEditAction({ editType: "table", tableView });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const handleDeleteTable = (event: React.MouseEvent) => {
        const loggingMessage = `Delete table: ${JSON.stringify(tableView)}`;
        documentsHolder.deleteTable(tableView.tableId, loggingMessage);
        handleCloseDeletingDialog(event);
    };

    const handleCloseDeletingDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        onOpenDeleteDialog(false)
    };

    const moving = (selected && (dragState.status === "on_dragging")) ? dragState.delta() : { x: 0, y: 0 };
    const physicalPosition = viewport.toPhysicalPosition(
        { x: tableView.corner.left + moving.x, y: tableView.corner.top + moving.y }
    );

    const tableStyle = {
        position: "absolute", zIndex: selected ? 100 : "auto",
        left: physicalPosition.x, top: physicalPosition.y,
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        userSelect: "none",
        ...((visible === false) && { opacity: 0, pointerEvents: 'none' })
    };
    const boundStyle = {
        paddingBottom: "4px",
        border: "2px solid black",
        borderRadius: "10px",
        backgroundColor: tableView.headerColor.background.toRgba(),
        color: tableView.headerColor.foreground.toRgba()
    };

    const tableClassName = selected
        ? `${ERD_TABLE_VIEW_CLASS_NAME} ${styleClasses.selectedBox}`
        : ERD_TABLE_VIEW_CLASS_NAME;

    return (
        <Box sx={tableStyle} ref={containerRef}>
            {wrapTableTooltip(
                <Box id={tableView.tableId} tabIndex={0} sx={boundStyle}
                    style={{ cursor: 'pointer' }} className={tableClassName}
                    data-entity-id={tableView.tableId}
                    onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
                    onClick={handleClick} onDoubleClick={handleDoubleClick}>
                    {tableContentCache}
                </Box>
            )}
            <TableControlPanel
                tableView={tableView} containerRef={containerRef} selected={selected}
                onEditAction={onEditAction} onOpenDeleteDialog={onOpenDeleteDialog} />

            <Dialog open={isOpenDeletingDialog} onClose={handleCloseDeletingDialog}>
                <DialogTitle>Delete table?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure to delete the table {`'${tableModel.physicalName}'`} ?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeletingDialog}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={handleDeleteTable}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const initWrapContentTooltip = (
    tableModel: TableModel, selected: boolean, erdDocument: ErdDocument, dragState: DragState
) => {
    const columnTooltip = initColumnTooltip(tableModel, selected, erdDocument, dragState);
    const wrapContentTooltip = (content: React.JSX.Element) => {
        return (
            <Tooltip title={columnTooltip} placement="right" arrow slotProps={TABLE_TOOLTIP_STYLE}>
                {content}
            </Tooltip>
        );
    };

    // eslint-plugin-react の react/display-name ルール対応のため、一度変数に代入したものを返却する
    return wrapContentTooltip;
};

const initColumnTooltip = (
    tableModel: TableModel, selected: boolean, erdDocument: ErdDocument, dragState: DragState
) => {
    if ((selected === false) || (dragState.status === "on_dragging")) {
        return "";
    }

    const displayStyle = erdDocument.getDisplayColumnStyle();
    if (displayStyle.equals(DisplayColumnStyle.ALL)) {
        return "";
    }

    const allColumns = erdDocument.toAllColumnsWithStruct(tableModel);
    const columnRows = expandColumnRows(erdDocument, allColumns);
    if (columnRows.length === 0) {
        return "";
    }

    const tableRows = columnRows.map(row => initTableColumnRow(row, tableModel, erdDocument));

    return (
        <TableContainer sx={{ overflow: "hidden", borderRadius: "10px" }}>
            <Table size="small" sx={{ backgroundColor: "#FDFDFD", "& .MuiTableCell-root": { fontSize: "0.7rem" } }}>
                <TableBody>{tableRows}</TableBody>
            </Table>
        </TableContainer>
    );
};

const TABLE_TOOLTIP_STYLE = {
    tooltip: {
        sx: {
            maxWidth: "none",
            padding: 0,
            backgroundColor: "#FDFDFD",
            border: "1px solid rgba(0, 0, 0, 0.12)",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)"
        }
    },
    arrow: { sx: { color: "#FDFDFD" } }
} as const;

type TableControlPanelProps = {
    tableView: TableViewModel;
    containerRef: React.RefObject<HTMLDivElement | null>;
    selected: boolean;
    onEditAction: (editAction: EditAction) => void;
    onOpenDeleteDialog: (open: boolean) => void;
};

const TableControlPanel = ({
    tableView, containerRef, selected, onEditAction, onOpenDeleteDialog
}: TableControlPanelProps) => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { scaleState } = React.useContext(ViewportContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);
    const { toolbarCanvasElement } = React.useContext(PortalCanvasContext);

    if ((containerRef.current == null) || (toolbarCanvasElement == null)) {
        return (<></>);
    }

    if ((selected === false) || (editMode !== EditModeType.SELECT)
        || (dragState.status === "on_dragging")
        || (selectState.tableIds.size + selectState.memoIds.size !== 1)) {
        return (<></>);
    }

    const erdDocument = documentsHolder.current();
    const erdSetting = erdDocument.erdSettingModel;
    const perspectives = erdSetting.getPerspectiveModels();

    const portalRect = toolbarCanvasElement.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const controlPanelStyle: React.CSSProperties = {
        justifyContent: "flex-end",
        position: "absolute",
        left: (containerRect.right - portalRect.left) / scaleState.scale,
        top: (containerRect.bottom - portalRect.top + 10) / scaleState.scale,
        transformOrigin: "top right",
        transform: `translateX(-100%) scale(${1 / scaleState.scale})`,
        pointerEvents: "auto",
    };

    const handleSetColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({ type: "defaultColor", color: { background, foreground } });

        const beforeColor = tableView.headerColor;
        const loggingMessage = `Update table color. ${JSON.stringify({
            tableId: tableView.tableId,
            before: { background: beforeColor.background.toHex(), foreground: beforeColor.foreground.toHex() },
            after: { background: background.toHex(), foreground: foreground.toHex() }
        })}`;
        documentsHolder.updateTableViewColor([tableView.tableId], background, foreground, loggingMessage);
    };

    const handleSettingPerspectiveDialog = (event: React.MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onEditAction({ editType: "perspective", targetId: tableView.tableId });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const handleOpenEditDialog = (event: React.MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onEditAction({ editType: "table", tableView });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const controlMenu = (
        <Stack direction="row" sx={controlPanelStyle}
            onClick={handlePreventMouseEvent}
            onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
            <div style={CONTROL_PANEL_STYLE}>
                <ColorSelector key={`table-color-selector_${tableView.tableId}`}
                    color={tableView.headerColor.background}
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

    return ReactDOM.createPortal(controlMenu, toolbarCanvasElement);
};


const CONTROL_PANEL_STYLE = {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: "10px"
} as const;

export default ErdTableView;
