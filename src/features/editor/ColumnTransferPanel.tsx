import React from "react";
import {
    Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography
} from "@mui/material";
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { overrideColumnName } from '~/models/database/support';
import EdgedIconButton from "~/components/EdgedIconButton";
import { rowKeyNavigation } from "~/components/keyboard/row-key-navigation";
import useRowFocusRequest from "~/components/keyboard/useRowFocusRequest";

type ColumnTransferPanelProps<INDEXED_ENTITY> = {
    columnModels: SimpleColumnModel[],
    indexedColumns: INDEXED_ENTITY[],
    isChildRelation: (columnModelId: string) => boolean,
    onNewIndexedColumn: (columnModelId: string) => INDEXED_ENTITY,
    onRenderIndexedColumn: (arg: RenderingArgs<INDEXED_ENTITY>, index: number) => React.ReactNode,
    onUpdateIndexedColumns: (updateFunction: ((previous: INDEXED_ENTITY[]) => INDEXED_ENTITY[])) => void
};

type RenderingArgs<INDEXED_ENTITY> = {
    indexedColumn: INDEXED_ENTITY,
    columnModel: SimpleColumnModel,
    columnShareModel: ColumnShareModel
}

type ColumnModelDetail = {
    columnModel: SimpleColumnModel,
    columnShareModel: ColumnShareModel
};

const ColumnTransferPanel = <INDEXED_ENTITY extends { columnModelId: string },>({
    columnModels, indexedColumns, isChildRelation,
    onNewIndexedColumn, onRenderIndexedColumn, onUpdateIndexedColumns
}: ColumnTransferPanelProps<INDEXED_ENTITY>) => {
    const { columnShareStorage } = React.useContext(ColumnShareModelStorageContext);

    const [selectedFromId, setSelectedFromId] = React.useState<string | null>(null);
    const [selectedIndexedId, setSelectedIndexedId] = React.useState<string | null>(null);

    // 追加・削除・並べ替えで行が入れ替わるとフォーカスを失うため、操作した行の近傍へ描画後に戻す。
    const { containerRef: fromBodyRef, requestFocus: requestFromFocus } =
        useRowFocusRequest<HTMLTableSectionElement>();
    const { containerRef: indexedBodyRef, requestFocus: requestIndexedFocus } =
        useRowFocusRequest<HTMLTableSectionElement>();

    const columnModelMap: Map<string, ColumnModelDetail> = new Map(
        columnModels
            .map(model => {
                return {
                    columnModel: model,
                    columnShareModel: columnShareStorage.findColumnShare(model.columnShareModelId)
                }
            })
            .filter((pair): pair is ColumnModelDetail => (pair.columnShareModel != null))
            .map(pair => [pair.columnModel.columnModelId, pair])
    );

    const indexedColumnIds = new Set(indexedColumns.map(model => model.columnModelId));

    const fromEntries = columnModels
        .filter(model => (indexedColumnIds.has(model.columnModelId) === false))
        .map(model => columnModelMap.get(model.columnModelId))
        .filter((pair): pair is ColumnModelDetail => (pair != null));

    const indexedEntries: RenderingArgs<INDEXED_ENTITY>[] = indexedColumns
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
        });

    // Tab 移動で止まる行はリストごとに1つ(未選択なら先頭行)。行数ぶん Tab 停止が増えるのを避けるための roving tabindex。
    const fromFocusableIndex = Math.max(
        fromEntries.findIndex(entry => (entry.columnModel.columnModelId === selectedFromId)), 0);
    const indexedFocusableIndex = Math.max(
        indexedEntries.findIndex(entry => (entry.indexedColumn.columnModelId === selectedIndexedId)), 0);

    const initFromRow = (detail: ColumnModelDetail, rowIndex: number) => {
        const { columnModel, columnShareModel } = detail;

        const columnModelId = columnModel.columnModelId;
        const columnName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModelId);

        const handleSelect = () => {
            setSelectedFromId((selectedFromId !== columnModelId) ? columnModelId : null);
        };

        const handleMove = () => {
            addColumnToIndex(columnModelId);
        };

        const handleMoveByKeyboard = () => {
            addColumnToIndexByKeyboard(columnModelId, rowIndex);
        };

        // 後ろで定義するカーソル移動関数は、描画中ではなく押下時に参照する。
        const handleMoveCursor = () => {
            moveCursorToIndexedList();
        };

        const selectRowAt = (targetIndex: number) => {
            const targetEntry = fromEntries[targetIndex];
            if (targetEntry != null) {
                setSelectedFromId(targetEntry.columnModel.columnModelId);
            }
        };

        const handleKeyDown = rowKeyNavigation.initHandleKeyDown({
            orientation: "vertical", index: rowIndex, lastIndex: fromEntries.length - 1,
            selectAt: selectRowAt, onSelect: handleSelect,
            onCrossNext: handleMoveCursor, onTransferNext: handleMoveByKeyboard
        });

        return (
            <TableRow key={`from-column-panel_index-${columnModelId}`} style={{ cursor: "pointer" }}
                selected={columnModelId === selectedFromId}
                tabIndex={(rowIndex === fromFocusableIndex) ? 0 : -1}
                onClick={handleSelect} onDoubleClick={handleMove} onKeyDown={handleKeyDown}>
                <TableCell>{columnName.physicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
            </TableRow>
        )
    };

    const initIndexedRow = (entry: RenderingArgs<INDEXED_ENTITY>, rowIndex: number) => {
        const columnModelId = entry.indexedColumn.columnModelId;

        const handleSelect = () => {
            setSelectedIndexedId((selectedIndexedId !== columnModelId) ? columnModelId : null);
        };
        const handleMove = () => {
            removeIndexedColumn(columnModelId);
        };

        const handleMoveByKeyboard = () => {
            removeIndexedColumnByKeyboard(columnModelId, rowIndex);
        };

        // 後ろで定義するカーソル移動関数は、描画中ではなく押下時に参照する。
        const handleMoveCursor = () => {
            moveCursorToFromList();
        };

        const selectRowAt = (targetIndex: number) => {
            const targetEntry = indexedEntries[targetIndex];
            if (targetEntry != null) {
                setSelectedIndexedId(targetEntry.indexedColumn.columnModelId);
            }
        };

        const handleReorder = (shift: (1 | -1)) => {
            reorderIndexedColumnByKeyboard(columnModelId, shift, rowIndex);
        };

        const handleKeyDown = rowKeyNavigation.initHandleKeyDown({
            orientation: "vertical", index: rowIndex, lastIndex: indexedEntries.length - 1,
            selectAt: selectRowAt, onSelect: handleSelect, onReorder: handleReorder,
            onCrossPrevious: handleMoveCursor, onTransferPrevious: handleMoveByKeyboard
        });

        return (
            <TableRow key={`indexed-column-panel_index-${columnModelId}`} style={{ cursor: 'pointer' }}
                selected={columnModelId === selectedIndexedId}
                tabIndex={(rowIndex === indexedFocusableIndex) ? 0 : -1}
                onClick={handleSelect} onDoubleClick={handleMove} onKeyDown={handleKeyDown}>
                {onRenderIndexedColumn(entry, rowIndex)}
            </TableRow>
        )
    };

    const fromColumnsPanel = fromEntries.map(initFromRow);
    const indexedColumnsPanel = indexedEntries.map(initIndexedRow);

    // 反対側のリストへ移るだけで、データは変えない。Tab 停止の行 (選択行、未選択なら先頭行) を移動先にする。
    const moveCursorToIndexedList = () => {
        const targetEntry = indexedEntries[indexedFocusableIndex];
        if (targetEntry == null) {
            return;
        }

        setSelectedIndexedId(targetEntry.indexedColumn.columnModelId);
        requestIndexedFocus(indexedFocusableIndex);
    };

    const moveCursorToFromList = () => {
        const targetEntry = fromEntries[fromFocusableIndex];
        if (targetEntry == null) {
            return;
        }

        setSelectedFromId(targetEntry.columnModel.columnModelId);
        requestFromFocus(fromFocusableIndex);
    };

    const handleAddColumnToIndex = () => {
        if (selectedFromId == null) {
            return;
        }

        addColumnToIndex(selectedFromId);
    };

    const addColumnToIndex = (columnModelId: string, nextSelection: TransferSelection = CLEARED_SELECTION) => {
        onUpdateIndexedColumns(previousColumns => {
            const newIndexed = onNewIndexedColumn(columnModelId);
            return [...previousColumns, newIndexed];
        });

        setSelectedFromId(nextSelection.fromId);
        setSelectedIndexedId(nextSelection.indexedId);
    };

    // 追加した行を Indexed 側の末尾で選択・フォーカスする。Base 側では隣の行を選択しておき、← で戻ればそのまま続けて追加できるようにする。
    const addColumnToIndexByKeyboard = (columnModelId: string, rowIndex: number) => {
        const neighbourIndex = rowKeyNavigation.neighbourIndexAfterRemoval(fromEntries.length, rowIndex);
        const remainingEntries = fromEntries.filter(entry => (entry.columnModel.columnModelId !== columnModelId));
        const neighbourId = (neighbourIndex < 0) ? null : remainingEntries[neighbourIndex].columnModel.columnModelId;

        requestIndexedFocus(indexedEntries.length);
        addColumnToIndex(columnModelId, { fromId: neighbourId, indexedId: columnModelId });
    };

    const handleRemoveIndexedColumn = () => {
        if (selectedIndexedId == null) {
            return;
        }

        removeIndexedColumn(selectedIndexedId);
    };

    const removeIndexedColumn = (columnModelId: string, nextSelection: TransferSelection = CLEARED_SELECTION) => {
        onUpdateIndexedColumns(previousColumns =>
            previousColumns.filter(column =>
                (column.columnModelId !== columnModelId)
            )
        );

        setSelectedFromId(nextSelection.fromId);
        setSelectedIndexedId(nextSelection.indexedId);
    };

    // 外した行を Base 側の元の位置で選択・フォーカスする。Indexed 側では隣の行を選択しておき、→ で戻ればそのまま続けて外せるようにする。
    const removeIndexedColumnByKeyboard = (columnModelId: string, rowIndex: number) => {
        const neighbourIndex = rowKeyNavigation.neighbourIndexAfterRemoval(indexedEntries.length, rowIndex);
        const remainingEntries = indexedEntries.filter(entry => (entry.indexedColumn.columnModelId !== columnModelId));
        const neighbourId = (neighbourIndex < 0) ? null : remainingEntries[neighbourIndex].indexedColumn.columnModelId;

        // 外した後の Base 側の行並びは、カラム定義順で「未インデックスの行 + 戻す行」になる。
        const returnedIndex = columnModels
            .filter(model => (model.columnModelId === columnModelId)
                || (indexedColumnIds.has(model.columnModelId) === false))
            .filter(model => columnModelMap.has(model.columnModelId))
            .findIndex(model => (model.columnModelId === columnModelId));

        requestFromFocus(returnedIndex);
        removeIndexedColumn(columnModelId, { fromId: columnModelId, indexedId: neighbourId });
    };

    // 移動と並べ替えはキー操作 (Ctrl/Cmd + 矢印) でも行えるので、Tab ではリストの行だけに止める。
    const transferButtonPanel = (
        <Stack direction="column" spacing={3} sx={{ alignItems: "center", justifyContent: "center" }}>
            <EdgedIconButton tooltip="Add to index" disabled={selectedFromId == null} tabIndex={-1}
                onClick={handleAddColumnToIndex}>
                <ArrowForwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Remove from index" disabled={selectedIndexedId == null} tabIndex={-1}
                onClick={handleRemoveIndexedColumn}>
                <ArrowBackIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

    const shiftIndexedColumn = (columnModelId: string | null, shift: (1 | -1)): boolean => {
        const targetIndex = indexedColumns.findIndex(column => (column.columnModelId === columnModelId));
        if ((targetIndex < 0) || (targetIndex + shift < 0) || (targetIndex + shift >= indexedColumns.length)) {
            return false;
        }

        onUpdateIndexedColumns(previousColumns => {
            const nextIndexedColumns = [...previousColumns];
            const target = nextIndexedColumns[targetIndex];
            nextIndexedColumns[targetIndex] = nextIndexedColumns[targetIndex + shift];
            nextIndexedColumns[targetIndex + shift] = target;

            return nextIndexedColumns;
        });

        return true;
    };

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        return () => {
            shiftIndexedColumn(selectedIndexedId, shift);
        };
    };

    // 並べ替えた行は同じ要素が移動するとは限らないため、移動先の位置を描画後にフォーカスし直す。
    const reorderIndexedColumnByKeyboard = (columnModelId: string, shift: (1 | -1), rowIndex: number) => {
        setSelectedIndexedId(columnModelId);

        const shifted = shiftIndexedColumn(columnModelId, shift);
        if (shifted) {
            requestIndexedFocus(rowIndex + shift);
        }
    };

    const disabledMoveUp = (selectedIndexedId == null) || (indexedColumns.length < 2)
        || (indexedColumns[0].columnModelId === selectedIndexedId);
    const disabledMoveDown = (selectedIndexedId == null) || (indexedColumns.length < 2)
        || (indexedColumns[indexedColumns.length - 1].columnModelId === selectedIndexedId);

    const orderPanel = (
        <Stack direction="column" spacing={3} sx={{ alignItems: "center", justifyContent: "center" }}>
            <EdgedIconButton tooltip="Move up" tabIndex={-1} disabled={disabledMoveUp}
                onClick={initHandleShiftColumn(-1)}>
                <ArrowUpwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move down" tabIndex={-1} disabled={disabledMoveDown}
                onClick={initHandleShiftColumn(1)}>
                <ArrowDownwardIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

    return (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Grid container spacing={1} sx={{ justifyContent: "flex-start", alignItems: "center" }}>
                <Grid size={{ xs: 4 }}>
                    <Typography variant="subtitle1" gutterBottom>Base columns</Typography>
                </Grid>
                <Grid size={{ xs: 1 }}></Grid>
                <Grid size={{ xs: 6 }}>
                    <Typography variant="subtitle1" gutterBottom>Indexed columns</Typography>
                </Grid>
            </Grid>
            <Grid container spacing={1} sx={{ justifyContent: "center", alignItems: "center" }}>
                <Grid size={{ xs: 4 }} >
                    <Paper>
                        <TableContainer>
                            <Table size="small" style={{ tableLayout: "fixed" }}>
                                <TableBody ref={fromBodyRef}>{fromColumnsPanel}</TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 1 }}>{transferButtonPanel}</Grid>
                <Grid size={{ xs: 6 }}>
                    <Paper>
                        <TableContainer>
                            <Table size="small" style={{ tableLayout: "fixed" }}>
                                <TableBody ref={indexedBodyRef}>{indexedColumnsPanel}</TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 1 }}>{orderPanel}</Grid>
            </Grid>
        </Paper>
    );
};

// 追加・除外の直後に両リストで選択しておく行。二つの選択は常に一組で更新する。
type TransferSelection = { fromId: string | null, indexedId: string | null };

const CLEARED_SELECTION: TransferSelection = { fromId: null, indexedId: null } as const;

export default ColumnTransferPanel;