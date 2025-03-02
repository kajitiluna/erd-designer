import { v4 as uuidV4 } from 'uuid';
import React, { MouseEvent, useState } from "react";
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
    Typography
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
import ErdDocument from "~/models/ErdDocument";
import ColumnModel from "~/models/database/ColumnModel";
import TableIndexModel, { IndexColumnModel, NullsOrderType, SortOrderType } from "~/models/database/TableIndexModel";
import { ColumnShareModelStrageContext } from "~/context/ColumnShareModelStrageContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import TableIndexSupport, { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { initHandleChangePhysicalName } from "~/features/editor/support";
import ColumnShareModel from '~/models/database/ColumnShareModel';


type IndexViewTableProps = {
    columnModels: ColumnModel[],
    tableIndexModels: TableIndexModel[],
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void
};

const IndexViewTable = ({ columnModels, tableIndexModels, onUpdateTableIndexModels }: IndexViewTableProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { columnShareModelStrage } = React.useContext(ColumnShareModelStrageContext);

    const erdDocument: ErdDocument = documentsHolder.current();

    const [isOpenEditDialog, setOpenEditDialog] = useState<boolean>(false);
    const [targetIndexModel, setTargetIndexModel] = useState<TableIndexModel | null>(null);

    const columnIdToOrders = tableIndexModels.map(
        (indexModel: TableIndexModel) => new Map<string, string>(
            indexModel.indexColumnModels.map(
                (indexColumnModel, index) => [indexColumnModel.columnModelId, `${index + 1}`]
            )
        )
    );

    const cellStyle = { '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } };

    const initColumnTitleRow = (columnModel: ColumnModel, rowIndex: number) => {
        const columnShareModel = columnShareModelStrage.find(columnModel.columnShareModelId);
        const inChildRelation = erdDocument.inChildRelation(columnModel.columnModelId);

        return (
            <TableRow key={`index-view-column-title-${rowIndex}`} sx={{ height: "43px" }}>
                <TableCell align="center" sx={cellStyle}>{columnModel.primaryKey && <PrimaryKeyIcon />}</TableCell>
                <TableCell align="center">{inChildRelation && <ForeignKeyIcon />}</TableCell>
                <TableCell sx={cellStyle}>{columnShareModel ? columnShareModel.physicalName : ""}</TableCell>
            </TableRow>
        );
    };

    const indexModeRow = (rowIndex: number) => {
        return (
            <TableRow key={rowIndex} sx={{ height: "43px" }} style={{ cursor: 'pointer' }}>
                {tableIndexModels.map((_, indexIndex) => initOrderCell(rowIndex, indexIndex))}
            </TableRow>
        );
    };

    const arrayOfHandleSelect = tableIndexModels.map((indexModel) => {
        return () => {
            setTargetIndexModel(indexModel);
        }
    });
    const arrayOfHandleEditIndex = tableIndexModels.map((indexModel) => {
        return () => {
            setTargetIndexModel(indexModel);
            setOpenEditDialog(true);
        };
    });

    const getCurrentCellStyle = (indexIndex: number) => {
        const isSelected = (targetIndexModel == null) ? false
            : (tableIndexModels[indexIndex].tableIndexModelId === targetIndexModel.tableIndexModelId);
        return isSelected ? { backgroundColor: "rgba(25, 118, 210, 0.12)" } : cellStyle;
    };

    const initOrderCell = (rowIndex: number, indexIndex: number) => {
        const columnModelId = columnModels[rowIndex].columnModelId;
        const columnIdToOrder = columnIdToOrders[indexIndex];
        const order = columnIdToOrder.get(columnModelId);
        const handleSelect = arrayOfHandleSelect[indexIndex];
        const handleEditIndex = arrayOfHandleEditIndex[indexIndex];

        return (
            <TableCell key={`column_${rowIndex}-${indexIndex}`} align="center"
                sx={getCurrentCellStyle(indexIndex)}
                onClick={handleSelect} onDoubleClick={handleEditIndex}>
                {order ? order : ""}
            </TableCell>
        );
    };

    const initEditRows = () => {
        if (tableIndexModels.length === 0) {
            return (<></>);
        }

        return (
            <TableRow key={columnModels.length}>
                {tableIndexModels.map((_, indexIndex) => (
                    <TableCell key={`edit_${indexIndex}`} align="center"
                        sx={getCurrentCellStyle(indexIndex)}>
                        <EdgedIconButton tooltip="Edit index"
                            onClick={arrayOfHandleEditIndex[indexIndex]}>
                            <EditIcon fontSize="small" />
                        </EdgedIconButton>
                    </TableCell>
                ))}
            </TableRow>
        );
    };

    const initShiftRows = () => {
        if (tableIndexModels.length === 0) {
            return (<></>);
        }

        return (
            <TableRow key={columnModels.length + 1}>
                {tableIndexModels.map((_, indexIndex) => (
                    <TableCell key={`move_${indexIndex}`} align="center" sx={getCurrentCellStyle(indexIndex)}>
                        <Stack direction="row" alignItems="center" justifyContent="space-evenly" spacing={1}>
                            <EdgedIconButton tooltip="Move forward"
                                disabled={indexIndex === 0}
                                onClick={initHandleShiftColumn(indexIndex, -1)}>
                                <ArrowBackIcon fontSize="small" />
                            </EdgedIconButton>
                            <EdgedIconButton tooltip="Move backward"
                                disabled={indexIndex === tableIndexModels.length - 1}
                                onClick={initHandleShiftColumn(indexIndex, 1)}>
                                <ArrowForwardIcon fontSize="small" />
                            </EdgedIconButton>
                        </Stack>
                    </TableCell>
                ))}
            </TableRow>
        );
    };

    const initHandleShiftColumn = (indexIndex: number, shift: (1 | -1)) => {
        return () => {
            if ((indexIndex + shift < 0) || (indexIndex + shift >= tableIndexModels.length)) {
                return;
            }

            onUpdateTableIndexModels((previous) => {
                const nextTableIndexModels = [...previous]
                nextTableIndexModels[indexIndex] = tableIndexModels[indexIndex + shift];
                nextTableIndexModels[indexIndex + shift] = tableIndexModels[indexIndex];

                return nextTableIndexModels;
            });
        }
    };

    const initRemoveRows = () => {
        if (tableIndexModels.length === 0) {
            return (<></>);
        }

        return (
            <TableRow key={columnModels.length + 2}>
                {tableIndexModels.map((_, indexIndex) => (
                    <TableCell key={`remove_${indexIndex}`} align="center" sx={getCurrentCellStyle(indexIndex)}>
                        <EdgedIconButton tooltip="Remove index" onClick={initHandleRemoveIndex(indexIndex)}>
                            <DeleteIcon fontSize="small" />
                        </EdgedIconButton>
                    </TableCell>
                ))}
            </TableRow>
        );
    };

    const initHandleRemoveIndex = (targetIndex: number) => {
        return () => onUpdateTableIndexModels(
            (previousModels: TableIndexModel[]) =>
                previousModels.filter((_, indexIndex) => targetIndex !== indexIndex)
        )
    };

    const handleAddIndex = () => {
        setTargetIndexModel(null);
        setOpenEditDialog(true);
    };

    return (
        <Grid container direction="row" alignItems="flex-start">
            <Grid size={{ xs: 3 }}>
                <TableContainer>
                    <Table stickyHeader size="small" aria-label="index view table" style={{ tableLayout: "fixed" }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: "10px" }} align="center">PK</TableCell>
                                <TableCell sx={{ width: "10px" }} align="center">FK</TableCell>
                                <TableCell>Physical Name</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {columnModels.map((columnModel, index) => initColumnTitleRow(columnModel, index))}
                        </TableBody>

                    </Table>
                </TableContainer>
                <Box sx={{ p: "5px" }}>
                    <EdgedIconButton tooltip="Add index" withText onClick={handleAddIndex}>
                        <AddIcon />
                    </EdgedIconButton>
                </Box>
            </Grid>
            <Grid size={{ xs: 9 }}>
                <TableContainer>
                    <Table stickyHeader size="small" aria-label="index view table"
                        style={{
                            width: `${60 * tableIndexModels.length}px`,
                            tableLayout: "fixed",
                            userSelect: "none"
                        }}>
                        <TableHead>
                            <TableRow sx={{ height: "37px" }}>
                                {tableIndexModels.map((_, index) => (
                                    <TableCell key={index} sx={{ width: "60px" }}></TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {columnModels.map((_, index) => indexModeRow(index))}
                            {initEditRows()}
                            {initShiftRows()}
                            {initRemoveRows()}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Grid>
            {isOpenEditDialog && <IndexEditDialog
                isOpen={isOpenEditDialog}
                tableIndexModel={targetIndexModel}
                columnModels={columnModels}
                onUpdateTableIndexModels={onUpdateTableIndexModels}
                onClose={() => setOpenEditDialog(false)}
            />}
        </Grid>
    );
};

type IndexEditDialogProps = {
    isOpen: boolean,
    tableIndexModel?: TableIndexModel | null,
    columnModels: ColumnModel[],
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void,
    onClose: () => void
};

type IndexModelAttribute = {
    columnModelId: string,
    sortOrderType: SortOrderType,
    nullsOrderType: NullsOrderType
}

const IndexEditDialog = ({ isOpen, tableIndexModel, columnModels, onUpdateTableIndexModels, onClose }: IndexEditDialogProps) => {

    const [indexOption, setIndexOption] = useState<TableIndexOption>(tableIndexModel ? tableIndexModel.indexOptioin : "");
    const [indexType, setIndexType] = useState<TableIndexType>(tableIndexModel ? tableIndexModel.indexType : "");
    const [physicalName, setPhysicalName] = useState<string>(tableIndexModel ? tableIndexModel.physicalName : "");
    const [indexedColumns, setIndexedColumns] = useState<IndexModelAttribute[]>(tableIndexModel ?
        tableIndexModel.indexColumnModels.map((model) => { return { ...model } }) : []);
    const [description, setDescription] = useState<string>(tableIndexModel ? tableIndexModel.description : "");

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const erdDocument: ErdDocument = documentsHolder.current();
    const database = erdDocument.getDatabase();
    const tableIndexSupport: TableIndexSupport = database.tableIndexSupport;

    const handleChangeIndexType = (event: SelectChangeEvent) => {
        const nextIndexType = event.target.value as TableIndexType;
        setIndexType(nextIndexType);
    }

    const editValueValidated = (physicalName.length > 0) && (indexedColumns.length > 0)
    const handleComplated = () => {
        if (editValueValidated === false) {
            return;
        }

        const targetId = tableIndexModel ? tableIndexModel.tableIndexModelId : uuidV4()
        const nextTableIndexModel = new TableIndexModel({
            tableIndexModelId: targetId,
            physicalName: physicalName,
            indexColumnModels: indexedColumns.map((model) => new IndexColumnModel({ ...model })),
            indexOptioin: indexOption,
            indexType: indexType,
            description: description
        });

        onUpdateTableIndexModels((previousModels) => {
            if (tableIndexModel == null) {
                return [...previousModels, nextTableIndexModel];
            }

            return previousModels.map(
                (previous) => (previous.tableIndexModelId === targetId)
                    ? nextTableIndexModel : previous);
        });

        onClose();
    };

    const handleClose = (event: MouseEvent) => {
        event.stopPropagation();
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }} open={isOpen} onClose={handleClose}>
            <DialogTitle>Edit table index</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <Stack direction="row" spacing={2}>
                        {tableIndexSupport.indexOptions.map((targetOption) => (
                            <FormControlLabel key={`indexoption_${targetOption}`} label={targetOption} control={
                                <Checkbox checked={targetOption === indexOption}
                                    onChange={(event) => setIndexOption((event.target.checked ? targetOption : ""))} />
                            } />
                        ))}
                    </Stack>
                    <Grid container justifyContent="center" alignItems="center">
                        <Grid size={{ xs: 6 }}>
                            <TextField required fullWidth variant="outlined" id="physicalName" label="Physical Name"
                                value={physicalName} onChange={initHandleChangePhysicalName(setPhysicalName)} />
                        </Grid>
                        <Grid size={{ xs: 6 }} sx={{ paddingLeft: 2 }}>
                            <FormControl fullWidth>
                                <InputLabel id="index-type">Index Type</InputLabel>
                                <Select label="Index Type" labelId="index-type"
                                    value={indexType} onChange={handleChangeIndexType}>
                                    <MenuItem value="">(Default)</MenuItem>
                                    {tableIndexSupport.indexTypes.map((targetIndexType) => (
                                        <MenuItem key={`indextype/${targetIndexType}`}
                                            value={targetIndexType}>{targetIndexType}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    <IndexColumnTransferPanel
                        columnModels={columnModels}
                        indexedColumns={indexedColumns}
                        onUpdateIndexedColumns={setIndexedColumns} />
                    <TextField variant="outlined" id="description" label="Description"
                        multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                        value={description} onChange={(event) => setDescription(event.target.value)} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button variant="contained" disabled={!editValueValidated} onClick={handleComplated}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

type IndexColumnTransferPanelProps = {
    columnModels: ColumnModel[],
    indexedColumns: IndexModelAttribute[],
    onUpdateIndexedColumns: (updateFunction: ((previous: IndexModelAttribute[]) => IndexModelAttribute[])) => void
};

type ColumnModelDetaial = {
    columnModel: ColumnModel,
    columnShareModel: ColumnShareModel
};

const IndexColumnTransferPanel = ({ columnModels, indexedColumns, onUpdateIndexedColumns }: IndexColumnTransferPanelProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { columnShareModelStrage } = React.useContext(ColumnShareModelStrageContext);

    const [selectedFromId, setSelectedFromId] = useState<string | null>(null);
    const [selectedIndexedId, setSelectedIndexedId] = useState<string | null>(null);

    const erdDocument = documentsHolder.current();
    const databaseType = erdDocument.getDatabase();

    const columnModelMap: Map<string, ColumnModelDetaial> = new Map(
        columnModels
            .map((model) => {
                return {
                    columnModel: model,
                    columnShareModel: columnShareModelStrage.find(model.columnShareModelId)
                }
            })
            .filter((pair): pair is ColumnModelDetaial => (pair.columnShareModel != null))
            .map((pair) => [pair.columnModel.columnModelId, pair])
    );

    const indexedColumnModelIds = new Set(indexedColumns.map((model) => model.columnModelId));

    const fromColumnsPanel = columnModels
        .filter((model) => (indexedColumnModelIds.has(model.columnModelId) === false))
        .map((model) => columnModelMap.get(model.columnModelId))
        .filter((pair): pair is ColumnModelDetaial => (pair != null))
        .map((pair) => {
            const columnModelId = pair.columnModel.columnModelId;
            const columnShareModel = pair.columnShareModel;
            const inChildRelation = erdDocument.inChildRelation(columnModelId);

            const handleSelect = (event: MouseEvent) => {
                event.stopPropagation();
                setSelectedFromId((selectedFromId !== columnModelId) ? columnModelId : null);
            };

            return (
                <TableRow key={columnModelId} style={{ cursor: 'pointer' }}
                    selected={columnModelId === selectedFromId} onClick={handleSelect}>
                    <TableCell>{columnShareModel.physicalName}</TableCell>
                    <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                </TableRow>
            )
        });

    const handleAddColumnToIndex = () => {
        if (selectedFromId == null) {
            return;
        }

        onUpdateIndexedColumns((previousColumns) => {
            const newAttribute: IndexModelAttribute = {
                columnModelId: selectedFromId,
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

        onUpdateIndexedColumns((previousColumns) =>
            previousColumns.filter(
                (column) => (column.columnModelId !== selectedIndexedId)
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
        .map((model) => {
            const detail = columnModelMap.get(model.columnModelId)
            return { indexedColumn: model, columnModelDetail: detail }
        })
        // カラムが削除された場合、該当する columnModelDetail が null になる
        .filter((pair): pair is {
            indexedColumn: IndexColumnModel, columnModelDetail: ColumnModelDetaial
        } => (pair.columnModelDetail != null))
        .map((pair) => { return { ...pair.columnModelDetail, ...pair.indexedColumn } })
        .map((pair, arrayIndex) => {
            const columnModelId = pair.columnModel.columnModelId;
            const columnShareModel = pair.columnShareModel;
            const sortOrderType = pair.sortOrderType;
            const nullsOrderType = pair.nullsOrderType;
            const inChildRelation = erdDocument.inChildRelation(columnModelId);

            const handleSelect = (event: MouseEvent) => {
                event.stopPropagation();
                setSelectedIndexedId((selectedIndexedId !== columnModelId) ? columnModelId : null);
            };

            const handleChangeSortOrder = (event: SelectChangeEvent) => {
                const nextSortOrderType = event.target.value as SortOrderType;
                onUpdateIndexedColumns((previousColumns) => previousColumns.map(
                    (previous) => (previous.columnModelId !== columnModelId) ? previous : {
                        columnModelId: previous.columnModelId,
                        sortOrderType: nextSortOrderType,
                        nullsOrderType: previous.nullsOrderType
                    }
                ));
            };
            const handleChangeNullsOrder = (event: SelectChangeEvent) => {
                const nextNullsOrderType = event.target.value as NullsOrderType;
                onUpdateIndexedColumns((previousColumns) => previousColumns.map(
                    (previous) => (previous.columnModelId !== columnModelId) ? previous : {
                        columnModelId: previous.columnModelId,
                        sortOrderType: previous.sortOrderType,
                        nullsOrderType: nextNullsOrderType
                    }
                ));
            };

            return (
                <TableRow key={columnModelId} style={{ cursor: 'pointer' }}
                    selected={columnModelId === selectedIndexedId} onClick={handleSelect}>
                    <TableCell align="right" sx={{ width: 10 }}>{arrayIndex + 1}</TableCell>
                    <TableCell>{columnShareModel.physicalName}</TableCell>
                    <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
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
                    {databaseType.tableIndexSupport.nullsOrder && <TableCell>
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

        return (event: MouseEvent) => {
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

            event.stopPropagation();

            onUpdateIndexedColumns((previousColumns) => {
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
