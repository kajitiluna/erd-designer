import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack,
    Table, TableBody, TableCell, TableContainer, TableRow, TextField, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import EdgedIconButton from "~/components/EdgedIconButton";
import ColumnModel from "~/models/database/ColumnModel";
import TableIndexModel, { IndexColumnModel, NullsOrderType, SortOrderType } from "~/models/database/TableIndexModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import TableIndexSupport, { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { ColumnWrapModel, initHandleChangePhysicalName, initHandleEnterKeyDown, SELECTED_CELL_COLOR } from "~/features/editor/support";
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { overrideColumnName } from '~/models/database/support';
import { Database } from '~/models/database';

type IndexViewTableProps = {
    database: Database,
    columnWrapModels: ColumnWrapModel[],
    tableIndexModels: TableIndexModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void
};

const IndexViewTable = ({
    database, columnWrapModels, tableIndexModels, isChildRelation, onUpdateTableIndexModels
}: IndexViewTableProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);

    const [isOpenEditDialog, setOpenEditDialog] = React.useState<boolean>(false);
    const [targetIndexModel, setTargetIndexModel] = React.useState<TableIndexModel | null>(null);

    const [draggingStartIndex, setDraggingStartIndex] = React.useState<number | null>(null);
    const [draggingOverIndex, setDraggingOverIndex] = React.useState<number | null>(null);
    // スクロール連動のためのref
    const headerScrollRef = React.useRef<HTMLDivElement>(null);
    const columnScrollRef = React.useRef<HTMLDivElement>(null);

    const columnModels: ColumnModel[] = columnWrapModels.flatMap(model =>
        (model.modelType === "single") ? [model.columnModel] : model.columnModels
    );

    const columnIdToOrders = React.useMemo(() => {
        const existedColumnModelIds = new Set(columnModels.map(columnModel => columnModel.columnModelId));

        return tableIndexModels.map(indexModel =>
            new Map<string, string>(indexModel.indexColumnModels
                .filter(indexColumnModel => existedColumnModelIds.has(indexColumnModel.columnModelId))
                .map((indexColumnModel, index) => [indexColumnModel.columnModelId, `${index + 1}`])
            )
        );
    }, [columnModels, tableIndexModels]);


    const selectedIndex = (targetIndexModel == null) ? -1
        : tableIndexModels.findIndex(target => (target.tableIndexModelId === targetIndexModel.tableIndexModelId));

    const initDragEventHandler = (indexIndex: number) => {
        const handleDragStart = (event: React.DragEvent) => {
            setDraggingStartIndex(indexIndex);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData('text/html', '');
        };

        const handleDragOver = (event: React.DragEvent) => {
            event.preventDefault();

            setDraggingOverIndex(previous => {
                if (previous === indexIndex) {
                    return previous;
                }

                event.dataTransfer.dropEffect = "move";
                return indexIndex;
            });
        };

        const handleDrop = (event: React.DragEvent) => {
            event.preventDefault();

            if ((draggingStartIndex == null) || (draggingStartIndex === indexIndex)) {
                return;
            }

            onUpdateTableIndexModels(previous => {
                const nextTableIndexModels = [...previous];
                nextTableIndexModels.splice(draggingStartIndex, 1);
                nextTableIndexModels.splice(indexIndex, 0, previous[draggingStartIndex]);
                return nextTableIndexModels;
            });
        };

        const handleDragEnd = () => {
            setDraggingStartIndex(null);
            setDraggingOverIndex(null);
        };

        return {
            onDragStart: handleDragStart,
            onDragOver: handleDragOver,
            onDragLeave: () => setDraggingOverIndex(null),
            onDrop: handleDrop,
            onDragEnd: handleDragEnd
        };
    };

    const initHeaderCellStyle = (indexIndex: number) => {
        const style: React.CSSProperties = { width: "60px" };

        if (draggingStartIndex === indexIndex) {
            return { ...style, opacity: 0.5 };
        }
        if ((draggingOverIndex === indexIndex) && (draggingStartIndex !== null)) {
            return { ...style, backgroundColor: 'lightblue' };
        }

        return style;
    };

    const initCurrentCellStyle = (indexIndex: number) => {
        if (draggingOverIndex === indexIndex) {
            return { backgroundColor: 'lightblue' };
        }

        const isSelected = (targetIndexModel == null) ? false
            : (tableIndexModels[indexIndex].tableIndexModelId === targetIndexModel.tableIndexModelId);
        const baseStyle = isSelected ? { backgroundColor: SELECTED_CELL_COLOR }
            : ((indexIndex % 2 === 1) ? { backgroundColor: "action.hover" } : {});

        if (draggingStartIndex === indexIndex) {
            return { ...baseStyle, opacity: 0.5 };
        }

        return baseStyle;
    };

    const keyIconHeaderStyle = initHeaderStyle(10);
    const boxHeader = (
        <Stack direction="row" alignItems="center" justifyContent="flex-start">
            <Box sx={keyIconHeaderStyle}>PK</Box>
            <Box sx={keyIconHeaderStyle}>FK</Box>
            <Box sx={initHeaderStyle(200)}>Physical Name</Box>
            <Box ref={headerScrollRef} sx={{ overflow: "hidden", pointerEvents: "none" }}>
                <Stack direction="row" alignItems="center" justifyContent="flex-start">
                    {tableIndexModels.map((_, index) => (
                        <Box key={`index-table_header-${index}`} sx={{
                            ...BASE_CELL_STYLE,
                            ...initHeaderCellStyle(index),
                            textAlign: "center",
                            minWidth: "60px",
                            maxWidth: "60px",
                            minHeight: "24px"
                        }}>
                            {(selectedIndex === index) && "✔"}
                        </Box>
                    ))}
                </Stack>
            </Box>
        </Stack>
    );

    const titleHeaders = (
        <Stack direction="row" alignItems="center" justifyContent="flex-start" style={{ minWidth: "220px" }}>
            <Stack direction="column" alignItems="center" justifyContent="center">
                {columnModels.map(columnModel => (
                    <Box key={`index-table_title0-${columnModel.columnModelId}`}
                        sx={initTitleStyle(10, true)}>
                        {columnModel.primaryKey && <PrimaryKeyIcon />}
                    </Box>
                ))}
            </Stack>
            <Stack direction="column" alignItems="center" justifyContent="center">
                {columnModels.map(columnModel => {
                    const inChildRelation = isChildRelation(columnModel.columnModelId);
                    return (
                        <Box key={`index-table_title1-${columnModel.columnModelId}`}
                            sx={initTitleStyle(10)}>
                            {inChildRelation && <ForeignKeyIcon />}
                        </Box>
                    );
                })}
            </Stack>
            <Stack direction="column" alignItems="center" justifyContent="center">
                {columnModels.map(columnModel => {
                    const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
                    if (columnShareModel == null) {
                        console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
                        return (<></>)
                    }

                    const overrideName = overrideColumnName(columnModel, columnShareModel);

                    return (
                        <Box key={`index-table_title2-${columnModel.columnModelId}`}
                            sx={initTitleStyle(200, true)}>
                            {overrideName.physicalName}
                        </Box>
                    );
                })}
            </Stack>
        </Stack>
    );

    const initIndexColumn = (indexIndex: number) => {
        const cellStyle: React.CSSProperties = {
            ...BASE_CELL_STYLE,
            ...initCurrentCellStyle(indexIndex),
            textAlign: "center",
            minWidth: "60px",
            maxWidth: "60px",
            cursor: "pointer"
        };

        const indexModel = tableIndexModels[indexIndex];

        const handleSelect = () => {
            setTargetIndexModel(indexModel);
        };

        const handleEditIndex = () => {
            setTargetIndexModel(indexModel);
            setOpenEditDialog(true);
        };

        const cells = columnModels.map((columnModel, rowIndex) => {
            const columnIdToOrder = columnIdToOrders[indexIndex];
            const order = columnIdToOrder.get(columnModel.columnModelId);

            return (
                <Box key={`index-table_cell-${columnModel.columnModelId}-${rowIndex}`}
                    sx={cellStyle} onClick={handleSelect} onDoubleClick={handleEditIndex}>
                    {order ? order : ""}
                </Box>
            );
        });

        return (
            <Stack key={`index-column_${indexModel.tableIndexModelId}`}
                direction="column" alignItems="center" justifyContent="center"
                draggable={tableIndexModels.length > 1}
                {...initDragEventHandler(indexIndex)}>
                {cells}
            </Stack>
        );
    };

    const handleAddIndex = () => {
        setTargetIndexModel(null);
        setOpenEditDialog(true);
    };

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        return () => {
            if ((selectedIndex + shift < 0) || (selectedIndex + shift >= tableIndexModels.length)) {
                return;
            }

            onUpdateTableIndexModels(previous => {
                const nextTableIndexModels = [...previous]
                nextTableIndexModels[selectedIndex] = tableIndexModels[selectedIndex + shift];
                nextTableIndexModels[selectedIndex + shift] = tableIndexModels[selectedIndex];

                return nextTableIndexModels;
            });
        };
    };

    const handleRemoveIndex = () => onUpdateTableIndexModels(
        previousModels => previousModels.filter((_, indexIndex) => (selectedIndex !== indexIndex))
    );

    const editButtonPanel = (
        <Stack justifyContent="flex-end" direction="row" spacing={2}>
            <EdgedIconButton tooltip="Edit index" disabled={selectedIndex < 0}
                onClick={() => setOpenEditDialog(true)}>
                <EditIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move forward" disabled={selectedIndex <= 0}
                onClick={initHandleShiftColumn(-1)}>
                <ArrowBackIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move backward"
                disabled={(selectedIndex < 0) || (selectedIndex >= tableIndexModels.length - 1)}
                onClick={initHandleShiftColumn(1)}>
                <ArrowForwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Remove index" disabled={selectedIndex < 0}
                onClick={handleRemoveIndex}>
                <DeleteIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

    const handleScroll = () => {
        if (!headerScrollRef.current || !columnScrollRef.current) {
            return;
        }

        headerScrollRef.current.scrollLeft = columnScrollRef.current.scrollLeft;
    };

    return (
        <>
            <Stack direction="column" sx={{ overflow: 'hidden' }}>
                {boxHeader}
                <Box sx={{ maxHeight: window.innerHeight - 587, ...SCROLL_STYLE }}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="flex-start">
                        <Box sx={{ position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #e0e0e0' }}>
                            {titleHeaders}
                        </Box>
                        <Box ref={columnScrollRef} onScroll={handleScroll} sx={{ overflow: 'auto' }}>
                            <Stack direction="row" alignItems="flex-start" justifyContent="flex-start">
                                {tableIndexModels.map((_, index) => initIndexColumn(index))}
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ margin: 1, marginBottom: 0.5 }}>
                <EdgedIconButton tooltip="Add index" withText onClick={handleAddIndex}>
                    <AddIcon />
                </EdgedIconButton>
                {editButtonPanel}
            </Stack>
            {isOpenEditDialog && <IndexEditDialog
                isOpen={isOpenEditDialog}
                database={database}
                tableIndexModel={targetIndexModel}
                columnModels={columnModels}
                isChildRelation={isChildRelation}
                onUpdateTableIndexModels={onUpdateTableIndexModels}
                onClose={() => setOpenEditDialog(false)}
            />}
        </>
    );
};

const initHeaderStyle = (width: number): React.CSSProperties => {
    return {
        ...BASE_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        minHeight: "24px"
    };
};

const initTitleStyle = (width: number, withBackgroundColor: boolean = false): React.CSSProperties => {
    return {
        ...BASE_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        backgroundColor: withBackgroundColor ? "action.hover" : ""
    };
};

const BASE_CELL_STYLE: React.CSSProperties = {
    borderBottomColor: "#e0e0e0",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    borderCollapse: "separate",
    colorScheme: "lightDark",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "16px",
    paddingRight: "16px",
    textAlign: "left",
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.43,
    letterSpacing: "0.01071em",
    minHeight: "30px"
};

const SCROLL_STYLE = {
    overflow: 'auto',
    '&::-webkit-scrollbar': { width: '8px', },
    '&::-webkit-scrollbar-track': { background: '#f1f1f1', },
    '&::-webkit-scrollbar-thumb': { background: '#c1c1c1', borderRadius: '4px', },
    '&::-webkit-scrollbar-thumb:hover': { background: '#a8a8a8', }
};

type IndexEditDialogProps = {
    isOpen: boolean,
    database: Database,
    tableIndexModel?: TableIndexModel | null,
    columnModels: ColumnModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void,
    onClose: () => void
};

type IndexModelAttribute = {
    columnModelId: string,
    sortOrderType: SortOrderType,
    nullsOrderType: NullsOrderType
}

const IndexEditDialog = ({
    isOpen, database, tableIndexModel, columnModels, isChildRelation, onUpdateTableIndexModels, onClose
}: IndexEditDialogProps) => {

    const [indexOption, setIndexOption] = React.useState<TableIndexOption>(tableIndexModel ? tableIndexModel.indexOption : "");
    const [indexType, setIndexType] = React.useState<TableIndexType>(tableIndexModel ? tableIndexModel.indexType : "");
    const [physicalName, setPhysicalName] = React.useState<string>(tableIndexModel ? tableIndexModel.physicalName : "");
    const [indexedColumns, setIndexedColumns] = React.useState<IndexModelAttribute[]>(tableIndexModel
        ? tableIndexModel.indexColumnModels
            .filter(model =>
                columnModels.some(columnModel =>
                    (columnModel.columnModelId === model.columnModelId)
                )
            )
            .map(model => { return { ...model } })
        : []);
    const [description, setDescription] = React.useState<string>(tableIndexModel ? tableIndexModel.description : "");

    const tableIndexSupport: TableIndexSupport = database.tableIndexSupport;

    const handleChangeIndexType = (event: SelectChangeEvent) => {
        const nextIndexType = event.target.value as TableIndexType;
        setIndexType(nextIndexType);
    }

    const editValueValidated = (physicalName.length > 0) && (indexedColumns.length > 0)
    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const targetId = tableIndexModel ? tableIndexModel.tableIndexModelId : uuidV4()
        const nextTableIndexModel = new TableIndexModel({
            tableIndexModelId: targetId,
            physicalName: physicalName,
            indexColumnModels: indexedColumns.map(model => new IndexColumnModel({ ...model })),
            indexOption: indexOption,
            indexType: indexType,
            description: description
        });

        onUpdateTableIndexModels(previousModels => {
            if (tableIndexModel == null) {
                return [...previousModels, nextTableIndexModel];
            }

            return previousModels.map(previous =>
                (previous.tableIndexModelId === targetId)
                    ? nextTableIndexModel : previous
            );
        });

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }} open={isOpen} onClose={() => onClose()}>
            <DialogTitle>Edit table index</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <Stack direction="row" spacing={2}>
                        {tableIndexSupport.indexOptions.map((targetOption) => (
                            <FormControlLabel key={`index_option_${targetOption}`} label={targetOption} control={
                                <Checkbox checked={targetOption === indexOption}
                                    onChange={(event) => setIndexOption((event.target.checked ? targetOption : ""))} />
                            } />
                        ))}
                    </Stack>
                    <Grid container justifyContent="center" alignItems="center">
                        <Grid size={{ xs: 6 }}>
                            <TextField required fullWidth variant="outlined" id="physicalName" label="Physical Name"
                                value={physicalName} onChange={initHandleChangePhysicalName(setPhysicalName)}
                                onKeyDown={handleEnterDown} />
                        </Grid>
                        <Grid size={{ xs: 6 }} sx={{ paddingLeft: 2 }}>
                            <FormControl fullWidth>
                                <InputLabel id="index-type">Index Type</InputLabel>
                                <Select label="Index Type" labelId="index-type"
                                    value={indexType} onChange={handleChangeIndexType}>
                                    <MenuItem value="">(Default)</MenuItem>
                                    {tableIndexSupport.indexTypes.map((targetIndexType) => (
                                        <MenuItem key={`index_type/${targetIndexType}`}
                                            value={targetIndexType}>{targetIndexType}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    <IndexColumnTransferPanel
                        database={database}
                        columnModels={columnModels}
                        indexedColumns={indexedColumns}
                        isChildRelation={isChildRelation}
                        onUpdateIndexedColumns={setIndexedColumns} />
                    <TextField variant="outlined" id="description" label="Description"
                        multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                        value={description} onChange={(event) => setDescription(event.target.value)} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => onClose()}>Cancel</Button>
                <Button variant="contained" disabled={!editValueValidated} onClick={handleCompleted}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

type IndexColumnTransferPanelProps = {
    database: Database,
    columnModels: ColumnModel[],
    indexedColumns: IndexModelAttribute[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateIndexedColumns: (updateFunction: ((previous: IndexModelAttribute[]) => IndexModelAttribute[])) => void
};

type ColumnModelDetail = {
    columnModel: ColumnModel,
    columnShareModel: ColumnShareModel
};

const IndexColumnTransferPanel = ({
    database, columnModels, indexedColumns, isChildRelation, onUpdateIndexedColumns
}: IndexColumnTransferPanelProps) => {
    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);

    const [selectedFromId, setSelectedFromId] = React.useState<string | null>(null);
    const [selectedIndexedId, setSelectedIndexedId] = React.useState<string | null>(null);

    const columnModelMap: Map<string, ColumnModelDetail> = new Map(
        columnModels
            .map(model => {
                return {
                    columnModel: model,
                    columnShareModel: columnShareModelStorage.find(model.columnShareModelId)
                }
            })
            .filter((pair): pair is ColumnModelDetail => (pair.columnShareModel != null))
            .map(pair => [pair.columnModel.columnModelId, pair])
    );

    const indexedColumnModelIds = new Set(indexedColumns.map((model) => model.columnModelId));

    const fromColumnsPanel = columnModels
        .filter(model => (indexedColumnModelIds.has(model.columnModelId) === false))
        .map(model => columnModelMap.get(model.columnModelId))
        .filter((pair): pair is ColumnModelDetail => (pair != null))
        .map(pair => {
            const columnModelId = pair.columnModel.columnModelId;
            const columnName = overrideColumnName(pair.columnModel, pair.columnShareModel);
            const inChildRelation = isChildRelation(columnModelId);

            const handleSelect = () => {
                setSelectedFromId((selectedFromId !== columnModelId) ? columnModelId : null);
            };

            const handleMove = () => {
                doAddColumnToIndex(columnModelId);
            };

            return (
                <TableRow key={`from-column-panel_index-${columnModelId}`} style={{ cursor: "pointer" }}
                    selected={columnModelId === selectedFromId}
                    onClick={handleSelect} onDoubleClick={handleMove}>
                    <TableCell>{columnName.physicalName}</TableCell>
                    <TableCell>{pair.columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                </TableRow>
            )
        });

    const handleAddColumnToIndex = () => {
        if (selectedFromId == null) {
            return;
        }

        doAddColumnToIndex(selectedFromId);
    };

    const doAddColumnToIndex = (fromId: string) => {
        onUpdateIndexedColumns(previousColumns => {
            const newAttribute: IndexModelAttribute = {
                columnModelId: fromId,
                sortOrderType: "",
                nullsOrderType: ""
            };

            return [...previousColumns, newAttribute];
        });

        setSelectedFromId(null);
        setSelectedIndexedId(null);
    };

    const handleRemoveIndexedColumn = () => {
        if (selectedIndexedId == null) {
            return;
        }

        doRemoveIndexedColumn(selectedIndexedId);
    };

    const doRemoveIndexedColumn = (removeId: string) => {
        onUpdateIndexedColumns(previousColumns =>
            previousColumns.filter(column =>
                (column.columnModelId !== removeId)
            )
        );

        setSelectedIndexedId(null);
        setSelectedFromId(null);
    };

    const transferPanel = (
        <Stack direction="column" spacing={3} alignItems="center" justifyContent="center">
            <EdgedIconButton tooltip="Add to index" disabled={selectedFromId == null}
                onClick={handleAddColumnToIndex}>
                <ArrowForwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Remove from index" disabled={selectedIndexedId == null}
                onClick={handleRemoveIndexedColumn}>
                <ArrowBackIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

    const indexedColumnsPanel = indexedColumns
        .map(model => {
            const detail = columnModelMap.get(model.columnModelId)
            return { indexedColumn: model, columnModelDetail: detail }
        })
        // カラムが削除された場合、該当する columnModelDetail が null になる
        .filter((pair): pair is {
            indexedColumn: IndexColumnModel, columnModelDetail: ColumnModelDetail
        } => (pair.columnModelDetail != null))
        .map(pair => { return { ...pair.columnModelDetail, ...pair.indexedColumn } })
        .map((pair, arrayIndex) => {
            const columnModelId = pair.columnModel.columnModelId;
            const sortOrderType = pair.sortOrderType;
            const nullsOrderType = pair.nullsOrderType;

            const columnName = overrideColumnName(pair.columnModel, pair.columnShareModel);
            const inChildRelation = isChildRelation(columnModelId);

            const handleSelect = () => {
                setSelectedIndexedId((selectedIndexedId !== columnModelId) ? columnModelId : null);
            };
            const handleMove = () => {
                doRemoveIndexedColumn(columnModelId);
            };

            const handleChangeSortOrder = (event: SelectChangeEvent) => {
                const nextSortOrderType = event.target.value as SortOrderType;
                onUpdateIndexedColumns(previousColumns =>
                    previousColumns.map(previous =>
                        (previous.columnModelId !== columnModelId) ? previous : {
                            columnModelId: previous.columnModelId,
                            sortOrderType: nextSortOrderType,
                            nullsOrderType: previous.nullsOrderType
                        }
                    )
                );
            };
            const handleChangeNullsOrder = (event: SelectChangeEvent) => {
                const nextNullsOrderType = event.target.value as NullsOrderType;
                onUpdateIndexedColumns(previousColumns =>
                    previousColumns.map(previous =>
                        (previous.columnModelId !== columnModelId) ? previous : {
                            columnModelId: previous.columnModelId,
                            sortOrderType: previous.sortOrderType,
                            nullsOrderType: nextNullsOrderType
                        }
                    )
                );
            };

            return (
                <TableRow key={`indexed-column-panel_index-${columnModelId}`} style={{ cursor: 'pointer' }}
                    selected={columnModelId === selectedIndexedId}
                    onClick={handleSelect} onDoubleClick={handleMove}>
                    <TableCell align="right" sx={{ width: 10 }}>{arrayIndex + 1}</TableCell>
                    <TableCell>{columnName.physicalName}</TableCell>
                    <TableCell>{pair.columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                    <TableCell>
                        <FormControl fullWidth size="small">
                            <InputLabel id={`sort-order-${columnModelId}`}>Sort Order</InputLabel>
                            <Select label="Sort order" labelId={`sort-order-${columnModelId}`}
                                value={sortOrderType} onChange={handleChangeSortOrder}>
                                <MenuItem value="">(Default)</MenuItem>
                                <MenuItem value="ASC">ASC</MenuItem>
                                <MenuItem value="DESC">DESC</MenuItem>
                            </Select>
                        </FormControl>
                    </TableCell>
                    {database.tableIndexSupport.nullsOrder && <TableCell>
                        <FormControl fullWidth size="small">
                            <InputLabel id={`nulls-order-${columnModelId}`}>Nulls Order</InputLabel>
                            <Select label="Null order" labelId={`nulls-order-${columnModelId}`}
                                value={nullsOrderType} onChange={handleChangeNullsOrder}>
                                <MenuItem value="">(Default)</MenuItem>
                                <MenuItem value="FIRST">FIRST</MenuItem>
                                <MenuItem value="LAST">LAST</MenuItem>
                            </Select>
                        </FormControl>
                    </TableCell>}
                </TableRow>
            )
        });

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        if (indexedColumns.length < 2) {
            return () => { };
        }

        return () => {
            let selectedIndex = -2;
            for (let index = 0; index < indexedColumns.length; index++) {
                if (indexedColumns[index].columnModelId === selectedIndexedId) {
                    selectedIndex = index;
                    break;
                }
            }

            if ((selectedIndex + shift < 0) || (selectedIndex + shift >= indexedColumns.length)) {
                return;
            }

            onUpdateIndexedColumns(previousColumns => {
                const nextIndexedColumns = [...previousColumns];
                const target = nextIndexedColumns[selectedIndex];
                nextIndexedColumns[selectedIndex] = nextIndexedColumns[selectedIndex + shift];
                nextIndexedColumns[selectedIndex + shift] = target;

                return nextIndexedColumns;
            });
        };
    };

    const orderPanel = (
        <Stack direction="column" spacing={3} alignItems="center" justifyContent="center">
            <EdgedIconButton tooltip="Move up"
                disabled={(selectedIndexedId == null) || (indexedColumns.length < 2)
                    || (indexedColumns[0].columnModelId === selectedIndexedId)}
                onClick={initHandleShiftColumn(-1)}>
                <ArrowUpwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move down"
                disabled={(selectedIndexedId == null) || (indexedColumns.length < 2)
                    || (indexedColumns[indexedColumns.length - 1].columnModelId === selectedIndexedId)}
                onClick={initHandleShiftColumn(1)}>
                <ArrowDownwardIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

    return (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Grid container spacing={1} justifyContent="flex-start" alignItems="center">
                <Grid size={{ xs: 4 }}>
                    <Typography variant="subtitle1" gutterBottom>Base columns</Typography>
                </Grid>
                <Grid size={{ xs: 1 }}></Grid>
                <Grid size={{ xs: 6 }}>
                    <Typography variant="subtitle1" gutterBottom>Indexed columns</Typography>
                </Grid>
            </Grid>
            <Grid container spacing={1} justifyContent="center" alignItems="center">
                <Grid size={{ xs: 4 }} >
                    <Paper>
                        <TableContainer>
                            <Table size="small" style={{ tableLayout: "fixed" }}>
                                <TableBody>{fromColumnsPanel}</TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 1 }}>{transferPanel}</Grid>
                <Grid size={{ xs: 6 }}>
                    <Paper>
                        <TableContainer>
                            <Table size="small" style={{ tableLayout: "fixed" }}>
                                <TableBody>{indexedColumnsPanel}</TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 1 }}>{orderPanel}</Grid>
            </Grid>
        </Paper>
    );
};

export default IndexViewTable;
