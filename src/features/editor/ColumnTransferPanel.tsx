import React from "react";
import {
    Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import ColumnModel from "~/models/database/ColumnModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { overrideColumnName } from '~/models/database/support';
import EdgedIconButton from "~/components/EdgedIconButton";

type ColumnTransferPanelProps<INDEXED_ENTITY> = {
    columnModels: ColumnModel[],
    indexedColumns: INDEXED_ENTITY[],
    isChildRelation: (columnModelId: string) => boolean,
    onNewIndexedColumn: (columnModelId: string) => INDEXED_ENTITY,
    onRenderIndexedColumn: (arg: RenderingArgs<INDEXED_ENTITY>, index: number) => React.ReactNode,
    onUpdateIndexedColumns: (updateFunction: ((previous: INDEXED_ENTITY[]) => INDEXED_ENTITY[])) => void
};

type RenderingArgs<INDEXED_ENTITY> = {
    indexedColumn: INDEXED_ENTITY,
    columnModel: ColumnModel,
    columnShareModel: ColumnShareModel
}

type ColumnModelDetail = {
    columnModel: ColumnModel,
    columnShareModel: ColumnShareModel
};

const ColumnTransferPanel = <INDEXED_ENTITY extends { columnModelId: string },>({
    columnModels, indexedColumns, isChildRelation,
    onNewIndexedColumn, onRenderIndexedColumn, onUpdateIndexedColumns
}: ColumnTransferPanelProps<INDEXED_ENTITY>) => {
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

    const indexedColumnModelIds = new Set(indexedColumns.map(model => model.columnModelId));

    const fromColumnsPanel = columnModels
        .filter(model => (indexedColumnModelIds.has(model.columnModelId) === false))
        .map(model => columnModelMap.get(model.columnModelId))
        .filter((pair): pair is ColumnModelDetail => (pair != null))
        .map(pair => {
            const { columnModel, columnShareModel } = pair;

            const columnModelId = columnModel.columnModelId;
            const columnName = overrideColumnName(columnModel, columnShareModel);
            const inChildRelation = isChildRelation(columnModelId);

            const handleSelect = () => {
                setSelectedFromId((selectedFromId !== columnModelId) ? columnModelId : null);
            };

            const handleMove = () => {
                addColumnToIndex(columnModelId);
            };

            return (
                <TableRow key={`from-column-panel_index-${columnModelId}`} style={{ cursor: "pointer" }}
                    selected={columnModelId === selectedFromId}
                    onClick={handleSelect} onDoubleClick={handleMove}>
                    <TableCell>{columnName.physicalName}</TableCell>
                    <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                </TableRow>
            )
        });

    const handleAddColumnToIndex = () => {
        if (selectedFromId == null) {
            return;
        }

        addColumnToIndex(selectedFromId);
    };

    const addColumnToIndex = (columnModelId: string) => {
        onUpdateIndexedColumns(previousColumns => {
            const newIndexed = onNewIndexedColumn(columnModelId);
            return [...previousColumns, newIndexed];
        });

        setSelectedFromId(null);
        setSelectedIndexedId(null);
    };

    const handleRemoveIndexedColumn = () => {
        if (selectedIndexedId == null) {
            return;
        }

        removeIndexedColumn(selectedIndexedId);
    };

    const removeIndexedColumn = (columnModelId: string) => {
        onUpdateIndexedColumns(previousColumns =>
            previousColumns.filter(column =>
                (column.columnModelId !== columnModelId)
            )
        );

        setSelectedIndexedId(null);
        setSelectedFromId(null);
    };

    const transferButtonPanel = (
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
            indexedColumn: INDEXED_ENTITY, columnModelDetail: ColumnModelDetail
        } => (pair.columnModelDetail != null))
        .map(pair => {
            return {
                indexedColumn: pair.indexedColumn,
                columnModel: pair.columnModelDetail.columnModel,
                columnShareModel: pair.columnModelDetail.columnShareModel
            }
        })
        .map((pair, arrayIndex) => {
            const columnModelId = pair.indexedColumn.columnModelId;

            const handleSelect = () => {
                setSelectedIndexedId((selectedIndexedId !== columnModelId) ? columnModelId : null);
            };
            const handleMove = () => {
                removeIndexedColumn(columnModelId);
            };

            return (
                <TableRow key={`indexed-column-panel_index-${columnModelId}`} style={{ cursor: 'pointer' }}
                    selected={columnModelId === selectedIndexedId}
                    onClick={handleSelect} onDoubleClick={handleMove}>
                    {onRenderIndexedColumn(pair, arrayIndex)}
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
                <Grid size={{ xs: 1 }}>{transferButtonPanel}</Grid>
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

export default ColumnTransferPanel;