import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack,
    Table, TableBody, TableCell, TableContainer, TableRow, TextField, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import EdgedIconButton from "~/components/EdgedIconButton";
import ColumnModel from "~/models/database/ColumnModel";
import TableIndexModel, { IndexColumnModel } from "~/models/database/TableIndexModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import TableIndexSupport, { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import {
    ColumnWrapModel, initHandleChangePhysicalName,
    initHandleCloseDialog, initHandleEnterKeyDown
} from "~/features/editor/support";
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { overrideColumnName } from '~/models/database/support';
import { Database } from '~/models/database';
import { NullsOrderType, SortOrderType } from '~/models/database/ValueType';
import { GRID_CELL_STYLE } from '~/components/constant';
import BaseGridView from '~/components/BaseGridView';

type IndexGridViewProps = {
    database: Database,
    columnWrapModels: ColumnWrapModel[],
    tableIndexModels: TableIndexModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void
};

const IndexGridView = ({
    database, columnWrapModels, tableIndexModels, isChildRelation, onUpdateTableIndexModels
}: IndexGridViewProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);
    const [onEditingModel, setEditingModel] = React.useState<TableIndexModel | null>(null);

    const columnModels: ColumnModel[] = columnWrapModels.flatMap(model =>
        (model.modelType === "single") ? [model.columnModel] : model.columnModels
    );

    // 各インデックスに対する列順序のマッピングを計算
    const columnIdToOrders = React.useMemo(() => {
        const existedColumnModelIds = new Set(columnModels.map(columnModel => columnModel.columnModelId));

        return tableIndexModels.map(indexModel =>
            new Map<string, string>(indexModel.indexColumnModels
                .filter(indexColumnModel => existedColumnModelIds.has(indexColumnModel.columnModelId))
                .map((indexColumnModel, index) => [indexColumnModel.columnModelId, `${index + 1}`])
            )
        );
    }, [columnModels, tableIndexModels]);

    const attributeHeaders = columnModels.map(columnModel => {
        const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
            return {
                key: columnModel.columnModelId,
                content: <span>Unknown Column</span>
            };
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        return {
            key: columnModel.columnModelId,
            content: (
                <Stack direction="row" alignItems="center">
                    <Box sx={initTitleStyle(10, true)}>
                        {columnModel.primaryKey && <PrimaryKeyIcon />}
                    </Box>
                    <Box sx={initTitleStyle(10)}>
                        {inChildRelation && <ForeignKeyIcon />}
                    </Box>
                    <Box sx={initTitleStyle(200, true)}>
                        {overrideName.physicalName}
                    </Box>
                </Stack>
            )
        };
    });

    // RecordDataの生成（各TableIndexModelに対応）
    const records = tableIndexModels.map((indexModel, indexIndex) => {
        const columnIdToOrder = columnIdToOrders[indexIndex];

        return {
            key: indexModel.tableIndexModelId,
            findAttribute: (columnModelId: string) => {
                const order = columnIdToOrder.get(columnModelId);
                return {
                    value: order || "",
                    sx: undefined
                };
            }
        };
    });

    const doFindIndexModel = (indexModelId: string) =>
        tableIndexModels.find(model => (model.tableIndexModelId === indexModelId));

    const operations = {
        onAdd: () => {
            const newModel = new TableIndexModel({
                tableIndexModelId: uuidV4(),
                physicalName: "",
                indexColumnModels: [],
            });

            setEditingModel(newModel);
        },
        onEdit: (indexModelId: string) => {
            const indexModel = doFindIndexModel(indexModelId);
            if (indexModel == null) {
                console.warn(`TableIndexModel not found for tableIndexModelId: ${indexModelId}`);
                return;
            }

            setEditingModel(indexModel);
        },
        onRemove: (indexModelId: string) => {
            onUpdateTableIndexModels(previousModels =>
                previousModels.filter(model => (model.tableIndexModelId !== indexModelId))
            );
        }
    };

    // ヘッダータイトル
    const keyIconHeaderStyle = initHeaderStyle(10);
    const headerTitle = (
        <Stack direction="row" alignItems="center">
            <Box sx={keyIconHeaderStyle}>PK</Box>
            <Box sx={keyIconHeaderStyle}>FK</Box>
            <Box sx={initHeaderStyle(200)}>Physical Name</Box>
        </Stack>
    );

    return (
        <>
            <BaseGridView<TableIndexModel>
                modelName="index"
                headerTitle={headerTitle}
                attributeHeaders={attributeHeaders}
                records={records}
                operations={operations}
                onUpdateRecords={onUpdateTableIndexModels}
            />
            {(onEditingModel != null) && (
                <IndexEditDialog
                    isOpen={onEditingModel != null}
                    database={database}
                    tableIndexModel={onEditingModel}
                    columnModels={columnModels}
                    isChildRelation={isChildRelation}
                    onUpdateTableIndexModels={onUpdateTableIndexModels}
                    onClose={() => setEditingModel(null)}
                />)}
        </>
    );
};

const initHeaderStyle = (width: number): React.CSSProperties => {
    return {
        ...GRID_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        minHeight: "24px"
    };
};

const initTitleStyle = (width: number, withBackgroundColor: boolean = false): React.CSSProperties => {
    return {
        ...GRID_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        backgroundColor: withBackgroundColor ? "action.hover" : ""
    };
};

type IndexEditDialogProps = {
    isOpen: boolean,
    database: Database,
    tableIndexModel: TableIndexModel,
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
    isOpen, database, tableIndexModel, columnModels, 
    isChildRelation, onUpdateTableIndexModels, onClose
}: IndexEditDialogProps) => {

    const [indexOption, setIndexOption] = React.useState<TableIndexOption>(tableIndexModel.indexOption);
    const [indexType, setIndexType] = React.useState<TableIndexType>(tableIndexModel.indexType);
    const [clustered, setClustered] = React.useState<boolean>(tableIndexModel.clustered);
    const [physicalName, setPhysicalName] = React.useState<string>(tableIndexModel.physicalName);
    const [indexedColumns, setIndexedColumns] = React.useState<IndexModelAttribute[]>(
        tableIndexModel.indexColumnModels.filter(model =>
            columnModels.some(columnModel =>
                (columnModel.columnModelId === model.columnModelId)
            )
        )
    );
    const [description, setDescription] = React.useState<string>(tableIndexModel.description);

    const tableIndexSupport: TableIndexSupport = database.tableIndexSupport;
    const availableIndexTypes = tableIndexSupport.indexTypes.length > 0;

    const handleChangeIndexType = (event: SelectChangeEvent) => {
        const nextIndexType = event.target.value as TableIndexType;
        setIndexType(nextIndexType);
    }

    const editValueValidated = (physicalName.length > 0) && (indexedColumns.length > 0)
    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const nextTableIndexModel = new TableIndexModel({
            tableIndexModelId: tableIndexModel.tableIndexModelId,
            physicalName: physicalName,
            indexColumnModels: indexedColumns.map(model => new IndexColumnModel({ ...model })),
            indexOption: indexOption,
            indexType: indexType,
            clustered: clustered,
            description: description
        });

        onUpdateTableIndexModels(previousModels => {
            let hasChanged = false;
            const nextModels = previousModels.map(previous => {
                if (previous.tableIndexModelId !== tableIndexModel.tableIndexModelId) {
                    return previous;
                }

                hasChanged = true;
                return nextTableIndexModel;
            });

            return hasChanged ? nextModels : [...previousModels, nextTableIndexModel];
        });

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit table index</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <Stack direction="row" spacing={2}>
                        {tableIndexSupport.indexOptions.map(targetOption => (
                            <FormControlLabel key={`index_option_${targetOption}`} label={targetOption} control={
                                <Checkbox checked={targetOption === indexOption}
                                    onChange={event => setIndexOption((event.target.checked ? targetOption : ""))} />
                            } />
                        ))}
                        {tableIndexSupport.supportsClustered && (
                            <FormControlLabel label="CLUSTERED" control={
                                <Checkbox checked={clustered}
                                    onChange={event => setClustered(event.target.checked)} />
                            } />
                        )}
                    </Stack>
                    <Grid container justifyContent="center" alignItems="center">
                        <Grid size={{ xs: availableIndexTypes ? 6 : 12 }}>
                            <TextField required fullWidth variant="outlined" id="physicalName" label="Physical Name"
                                value={physicalName} onChange={initHandleChangePhysicalName(setPhysicalName)}
                                onKeyDown={handleEnterDown} />
                        </Grid>
                        {availableIndexTypes && (
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
                        )}
                    </Grid>
                    <IndexColumnTransferPanel
                        database={database}
                        columnModels={columnModels}
                        indexedColumns={indexedColumns}
                        isChildRelation={isChildRelation}
                        onUpdateIndexedColumns={setIndexedColumns} />
                    <TextField id="description" variant="outlined" label="Description"
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

export default IndexGridView;
