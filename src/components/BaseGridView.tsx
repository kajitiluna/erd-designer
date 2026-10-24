import React from 'react';
import { Box, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import EdgedIconButton from "./EdgedIconButton";
import { GRID_CELL_STYLE } from '~/components/constant';
import { rowKeyNavigation } from '~/components/keyboard/row-key-navigation';
import useRowFocusRequest from '~/components/keyboard/useRowFocusRequest';

type BaseGridViewProps<RECORD_ENTITY> = {
    modelName: string;
    headerTitle: React.ReactNode;
    attributeHeaders: AttributeHeader[];
    records: GridRecord[];
    operations: GridRecordOperations;
    onUpdateRecords: (updateFunction: (previous: RECORD_ENTITY[]) => RECORD_ENTITY[]) => void;
}

const BaseGridView = <RECORD_ENTITY,>({
    modelName, headerTitle, attributeHeaders, records,
    operations, onUpdateRecords
}: BaseGridViewProps<RECORD_ENTITY>) => {

    const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
    // スクロール連動のためのref
    const headerScrollRef = React.useRef<HTMLDivElement>(null);
    const columnScrollRef = React.useRef<HTMLDivElement>(null);
    // キー操作で削除したレコードは消えるため、残ったレコードへフォーカスを戻す。
    const { containerRef: recordsRef, requestFocus } = useRowFocusRequest<HTMLDivElement>();
    // ドラッグ&ドロップ機能
    const { draggingStartIndex, draggingOverIndex, initDragEventHandler } =
        useDragAndDrop<RECORD_ENTITY>(onUpdateRecords);

    const selectedIndex = (selectedKey == null) ? -1
        : records.findIndex(recordData => recordData.key === selectedKey);

    // Tab 移動で止まるレコードは常に1つ(未選択なら先頭)。レコード数ぶん Tab 停止が増えるのを避けるための roving tabindex。
    const focusableIndex = (selectedIndex < 0) ? 0 : selectedIndex;

    // ヘッダー行スタイル関数
    const initRecordHeaderStyle = (recordIndex: number) => {
        const style: React.CSSProperties = { width: "60px" };

        if (draggingStartIndex === recordIndex) {
            return { ...style, opacity: 0.5 };
        }
        if ((draggingOverIndex === recordIndex) && (draggingStartIndex !== null)) {
            return { ...style, backgroundColor: 'lightblue' };
        }

        return (recordIndex === selectedIndex)
            ? { ...style, backgroundColor: SELECTED_CELL_COLOR } : style;
    };

    // セルスタイル関数
    const initCurrentCellStyle = (recordIndex: number) => {
        if (draggingOverIndex === recordIndex) {
            return { backgroundColor: 'lightblue' };
        }

        const baseStyle = (recordIndex === selectedIndex)
            ? { backgroundColor: SELECTED_CELL_COLOR }
            : ((recordIndex % 2 === 1) ? { backgroundColor: "action.hover" } : {});

        return (recordIndex === draggingStartIndex)
            ? { ...baseStyle, opacity: 0.5 } : baseStyle;
    };

    // ヘッダー行の描画
    const boxHeader = (
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-start" }}>
            {headerTitle}
            <Box ref={headerScrollRef} sx={{ overflow: "hidden", pointerEvents: "none" }}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-start" }}>
                    {records.map((record, recordIndex) => (
                        <Box key={`record-header-${record.key}`} sx={{
                            ...GRID_CELL_STYLE,
                            ...initRecordHeaderStyle(recordIndex),
                            textAlign: "center", minWidth: "60px", maxWidth: "60px", minHeight: "24px"
                        }}>
                            {(selectedIndex === recordIndex) && "✔"}
                        </Box>
                    ))}
                </Stack>
            </Box>
        </Stack>
    );

    const isDraggable = (records.length > 1);

    const initRecord = (record: GridRecord, recordIndex: number) => {
        const additionalStyle = initCurrentCellStyle(recordIndex);

        const handleSelect = () => {
            setSelectedKey(record.key);
        };

        const handleEditRecord = () => {
            operations.onEdit(record.key);
        };

        const selectRecordAt = (targetIndex: number) => {
            const targetRecord = records[targetIndex];
            if (targetRecord != null) {
                setSelectedKey(targetRecord.key);
            }
        };

        const handleRemoveRecord = () => {
            const neighbourIndex = rowKeyNavigation.neighbourIndexAfterRemoval(records.length, recordIndex);
            const remainingRecords = records.filter((_, remainingIndex) => (remainingIndex !== recordIndex));
            const neighbourRecord = remainingRecords[neighbourIndex];

            if (neighbourIndex >= 0) {
                requestFocus(neighbourIndex);
            }
            setSelectedKey((neighbourRecord != null) ? neighbourRecord.key : null);
            operations.onRemove(record.key);
        };

        const handleReorder = (shift: (1 | -1)) => {
            reorderRecordByKeyboard(recordIndex, shift);
        };

        const handleKeyDown = rowKeyNavigation.initHandleKeyDown({
            orientation: "horizontal", index: recordIndex, lastIndex: records.length - 1,
            selectAt: selectRecordAt, onSelect: handleSelect, onActivate: handleEditRecord,
            onRemove: handleRemoveRecord, onReorder: handleReorder
        });

        const cells = attributeHeaders.map(attributeHeader => {
            // attributeHeader.keyに対応するattributeを探す
            const attributeData = record.findAttribute(attributeHeader.key);
            const attributeValue = attributeData?.value || "";

            const cellStyle: React.CSSProperties = {
                ...GRID_CELL_STYLE, ...(attributeData?.sx || {}), ...additionalStyle,
                textAlign: "center", minWidth: "60px", maxWidth: "60px", cursor: "pointer"
            };

            return (
                <Box key={`record-cell-${record.key}-${attributeHeader.key}`} sx={cellStyle}
                    onClick={handleSelect} onDoubleClick={handleEditRecord}>
                    {attributeValue}
                </Box>
            );
        });

        return (
            <Stack key={`record-column-${record.key}`} direction="column" draggable={isDraggable}
                {...(isDraggable ? initDragEventHandler(recordIndex) : {})}
                tabIndex={(recordIndex === focusableIndex) ? 0 : -1} onKeyDown={handleKeyDown}
                sx={{ alignItems: "center", justifyContent: "center" }}>
                {cells}
            </Stack>
        );
    };

    const handleShiftColumn = (shift: 1 | -1) => {
        return () => {
            doShiftRecordAt(selectedIndex, shift);
        };
    };

    // 行は描画し直されるとフォーカスを失うため、移動先の位置を描画後にフォーカスし直す。
    const reorderRecordByKeyboard = (index: number, shift: (1 | -1)) => {
        setSelectedKey(records[index].key);

        const shifted = doShiftRecordAt(index, shift);
        if (shifted) {
            requestFocus(index + shift);
        }
    };

    const doShiftRecordAt = (index: number, shift: (1 | -1)): boolean => {
        if ((index < 0) || (index + shift < 0) || (index + shift >= records.length)) {
            return false;
        }

        onUpdateRecords(previous => {
            const nextRecords = [...previous];
            nextRecords[index] = previous[index + shift];
            nextRecords[index + shift] = previous[index];

            return nextRecords;
        });

        return true;
    };

    const handleEdit = () => {
        if (selectedKey) {
            operations.onEdit(selectedKey);
        }
    };

    const handleRemove = () => {
        if (selectedKey) {
            operations.onRemove(selectedKey);
        }
    };

    const operationPanel = (
        <Stack direction="row" sx={{ justifyContent: "space-between", margin: 1, marginBottom: 0.5 }}>
            <EdgedIconButton tooltip={`Add ${modelName}`} withText onClick={operations.onAdd}>
                <AddIcon />
            </EdgedIconButton>

            <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
                <EdgedIconButton tooltip={`Edit ${modelName}`} disabled={selectedIndex < 0}
                    onClick={handleEdit}>
                    <EditIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move forward" disabled={selectedIndex <= 0} onClick={handleShiftColumn(-1)}>
                    <ArrowBackIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move backward"
                    disabled={(selectedIndex < 0) || (selectedIndex >= records.length - 1)}
                    onClick={handleShiftColumn(1)}>
                    <ArrowForwardIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip={`Remove ${modelName}`} disabled={selectedIndex < 0} onClick={handleRemove}>
                    <DeleteIcon fontSize="small" />
                </EdgedIconButton>
            </Stack>
        </Stack>
    );

    // スクロール同期
    const handleScroll = () => {
        if ((headerScrollRef.current == null) || (columnScrollRef.current == null)) {
            return;
        }

        headerScrollRef.current.scrollLeft = columnScrollRef.current.scrollLeft;
    };

    return (<>
        <Stack direction="column" sx={{ overflow: 'hidden' }}>
            {boxHeader}
            <Box sx={{ maxHeight: window.innerHeight - 587, ...SCROLL_STYLE }}>
                <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "flex-start" }}>
                    <Box sx={{
                        position: 'sticky', left: 0, zIndex: 1,
                        borderRight: '1px solid var(--mui-palette-erd-cellBorder)'
                    }}>
                        <Stack direction="column" sx={{ alignItems: "flex-start", justifyContent: "flex-start" }}>
                            {attributeHeaders.map(header => header.content)}
                        </Stack>
                    </Box>
                    <Box ref={columnScrollRef} onScroll={handleScroll} sx={{ overflow: 'auto' }}>
                        <Stack ref={recordsRef} direction="row"
                            sx={{ alignItems: "flex-start", justifyContent: "flex-start" }}>
                            {records.map((record, recordIndex) => initRecord(record, recordIndex))}
                        </Stack>
                    </Box>
                </Stack>
            </Box>
        </Stack>
        {operationPanel}
    </>);
};

const SELECTED_CELL_COLOR = 'var(--mui-palette-erd-gridRowSelected)';

type AttributeHeader = {
    key: string;
    content: React.ReactNode;
}

type GridRecord = {
    key: string;
    findAttribute: (key: string) => GridRecordAttribute | undefined;
}

type GridRecordAttribute = {
    value: string;
    sx?: React.CSSProperties;
}

type GridRecordOperations = {
    onAdd: () => void;
    onEdit: (key: string) => void;
    onRemove: (key: string) => void;
}

const SCROLL_STYLE = {
    overflow: 'auto',
    '&::-webkit-scrollbar': { width: '8px', },
    '&::-webkit-scrollbar-track': { background: 'var(--mui-palette-erd-scrollbarTrack)', },
    '&::-webkit-scrollbar-thumb': { background: 'var(--mui-palette-erd-scrollbarThumb)', borderRadius: '4px', },
    '&::-webkit-scrollbar-thumb:hover': { background: 'var(--mui-palette-erd-scrollbarThumbHover)', }
} as const;

// ドラッグ&ドロップの状態管理フック
const useDragAndDrop = <RECORD_ENTITY,>(
    onUpdateRecords: (updateFunction: ((previous: RECORD_ENTITY[]) => RECORD_ENTITY[])) => void
) => {
    const [draggingStartIndex, setDraggingStartIndex] = React.useState<number | null>(null);
    const [draggingOverIndex, setDraggingOverIndex] = React.useState<number | null>(null);

    const initDragEventHandler = (recordIndex: number) => {
        const handleDragStart = (event: React.DragEvent) => {
            setDraggingStartIndex(recordIndex);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData('text/html', '');
        };

        const handleDragOver = (event: React.DragEvent) => {
            event.preventDefault();

            setDraggingOverIndex(previous => {
                if (previous === recordIndex) {
                    return previous;
                }

                event.dataTransfer.dropEffect = "move";
                return recordIndex;
            });
        };

        const handleDrop = (event: React.DragEvent) => {
            event.preventDefault();

            if ((draggingStartIndex == null) || (draggingStartIndex === recordIndex)) {
                return;
            }

            onUpdateRecords(previous => {
                const nextRecords = [...previous];
                nextRecords.splice(draggingStartIndex, 1);
                nextRecords.splice(recordIndex, 0, previous[draggingStartIndex]);

                return nextRecords;
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

    return {
        draggingStartIndex,
        draggingOverIndex,
        initDragEventHandler
    };
};

export default BaseGridView;