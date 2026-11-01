import React from "react";
import {
    Backdrop, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    Stack, Table, TableBody, TableContainer, TableRow, TextField
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

import useAutoFocus from "~/components/keyboard/useAutoFocus";
import { rowKeyNavigation } from "~/components/keyboard/row-key-navigation";
import useStateRef from "~/components/useStateRef";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { initHandleCloseDialog, SELECTED_CELL_COLOR } from "~/features/editor/support";

type InitializeSearchDialogProps<ENTITY> = {
    dialogTitle: string;
    tableHeader: React.JSX.Element;
    identity: (entity: ENTITY) => string;
    onFiltering: (keywords: string[]) => ENTITY[];
    initRecord: (
        row: ENTITY, selected: boolean, attributes: React.ComponentProps<typeof TableRow>
    ) => React.JSX.Element | React.JSX.Element[];
};

type SearchDialogProps<ENTITY> = {
    isOpen: boolean;
    onCompleted: (entity: ENTITY) => void;
    onClose: () => void;
};

// SearchContentDialog は useInitializeSearchDialog と対になるこのモジュール private な実装。
// Fast Refresh を満たすためだけに export すると隠蔽が壊れるため、dev 時 HMR 劣化を許容してこの規則のみ無効化する。
// oxlint-disable-next-line react/only-export-components
const SearchContentDialog = <ENTITY,>({
    dialogTitle, tableHeader, identity, onFiltering, initRecord, isOpen, onCompleted, onClose
}: InitializeSearchDialogProps<ENTITY> & SearchDialogProps<ENTITY>) => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const [timeoutId, setTimeoutId] = React.useState<NodeJS.Timeout | null>(null);
    const [filtering, setFiltering] = React.useState<string>("");
    const [inSearching, setSearching] = React.useState<boolean>(false);
    const [filteredModels, setFilteredModels] = React.useState<ENTITY[]>(onFiltering([]));
    const [selectedModel, setSelectedModel] = React.useState<ENTITY | null>(null);
    const autoFocusRef = useAutoFocus<HTMLInputElement>(isOpen);
    const [tableBodyElement, tableBodyRef] = useStateRef<HTMLTableSectionElement>();

    const erdDocument = documentsHolder.current();

    const handleFiltering = (nextFiltering: string) => {
        if (nextFiltering.trim() === "") {
            setFilteredModels(onFiltering([]));
            setSelectedModel(null);
            return;
        }

        const keywords = nextFiltering.trim().split(" ");
        const filteredContents = onFiltering(keywords);

        setFilteredModels(filteredContents);
        setSelectedModel(null);
    };

    const handleChangeValue = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        const nextTimeoutId = setTimeout(() => {
            handleFiltering(newValue);
            setSearching(false);
        }, 500);

        setTimeoutId(nextTimeoutId);
        setSearching(true);
        setFiltering(newValue);
    };

    const selectedIndex = (selectedModel == null) ? -1
        : filteredModels.findIndex(model => (identity(model) === identity(selectedModel)));

    // 検索語の入力欄から ↓ で結果一覧へ移る。移動先は選択済みの行、なければ先頭行。
    const handleKeywordsKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        const isPlainArrowDown = (event.key === "ArrowDown")
            && (event.altKey === false) && (event.ctrlKey === false) && (event.metaKey === false);
        const isComposing = (event.nativeEvent.isComposing) || (event.keyCode === IME_KEY_CODE);
        if ((isPlainArrowDown === false) || isComposing || inSearching || (filteredModels.length === 0)) {
            return;
        }

        event.preventDefault();

        const targetIndex = Math.max(selectedIndex, 0);
        setSelectedModel(filteredModels[targetIndex]);
        focusEntityRow(targetIndex);
    };

    // 1つの検索結果が複数の行になる場合があるため、行の位置は aria-rowindex で引き、その先頭行へフォーカスする。
    const focusEntityRow = (targetIndex: number) => {
        const targetRow = tableBodyElement?.querySelector(`[aria-rowindex="${targetIndex + 1}"]`);
        (targetRow as HTMLElement | null | undefined)?.focus();
    };

    const filteringPanel = (
        <Stack direction="row" sx={{ justifyContent: "flex-end", alignItems: "center", padding: 1 }}>
            <div style={{ flex: 8 }}></div>
            <Box sx={{ display: "flex", alignItems: "center", flex: 4 }}>
                <SearchIcon sx={{ color: "action.active", mr: 1, my: 0.5 }} />
                <TextField inputRef={autoFocusRef} size="small" fullWidth label="keywords" value={filtering}
                    onChange={handleChangeValue} onKeyDown={handleKeywordsKeyDown} />
            </Box>
        </Stack>
    );

    const initRow = (target: ENTITY, rowIndex: number) => {
        const rowSelected = (selectedModel != null) && (identity(target) === identity(selectedModel));

        const toggleSelection = () => {
            setSelectedModel(rowSelected ? null : target);
        };

        const confirmTarget = () => {
            onCompleted(target);
            onClose();
        };

        const handleClick = (event: React.MouseEvent) => {
            event.stopPropagation();
            toggleSelection();
        };

        const handleDoubleClick = (event: React.MouseEvent) => {
            event.stopPropagation();
            confirmTarget();
        };

        const selectRowAt = (targetIndex: number) => {
            setSelectedModel(filteredModels[targetIndex]);
        };

        // OK ボタンは選択行がないと押せないが、Enter は押された行そのものを確定対象にするので選択状態を問わない。
        const handleKeyDown = rowKeyNavigation.initHandleKeyDown({
            orientation: "vertical", index: rowIndex, lastIndex: filteredModels.length - 1,
            selectAt: selectRowAt, onSelect: toggleSelection, onActivate: confirmTarget,
            focusRowAt: focusEntityRow
        });

        // Tab 移動で止まる行は常に1つ(未選択なら先頭行)。
        const attributes: React.ComponentProps<typeof TableRow> = {
            sx: rowSelected ? { backgroundColor: SELECTED_CELL_COLOR } : BASE_ROW_STYLE,
            style: { cursor: 'pointer' },
            tabIndex: (rowIndex === Math.max(selectedIndex, 0)) ? 0 : -1,
            "aria-rowindex": rowIndex + 1,
            onClick: handleClick, onDoubleClick: handleDoubleClick, onKeyDown: handleKeyDown
        };

        return initRecord(target, rowSelected, attributes);
    };

    const contentPanel = (
        <Box sx={{ position: "relative" }}>
            <TableContainer>
                <Table stickyHeader size="small" aria-label="column model table">
                    {tableHeader}
                    {(filteredModels.length > 0) && (
                        <TableBody ref={tableBodyRef}>
                            {filteredModels.map((model, rowIndex) => initRow(model, rowIndex))}
                        </TableBody>
                    )}
                </Table>
            </TableContainer>
            {(filteredModels.length == 0) && (
                <Box sx={{ margin: "25px", textAlign: "center" }}>No Contents.</Box>
            )}
            <Backdrop open={inSearching} sx={BACKDROP_STYLE}><CircularProgress /></Backdrop>
        </Box>
    );

    const handleSubmit = (event: React.MouseEvent) => {
        if (selectedModel == null) {
            return;
        }

        event.stopPropagation();

        onCompleted(selectedModel);
        onClose();
    };

    const withLogicalName = erdDocument.getDisplayNameStyle().withLogicalName();

    return (
        <Dialog fullWidth maxWidth={withLogicalName ? "xl" : "lg"} sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogContent>
                <Divider />
                {filteringPanel}
                {contentPanel}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={selectedModel == null} onClick={handleSubmit}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

const IME_KEY_CODE = 229;

const BASE_ROW_STYLE = { '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } };

const BACKDROP_STYLE = {
    position: "absolute",
    backdropFilter: "blur(2px)",
    backgroundColor: "var(--mui-palette-erd-dialogBackdrop)",
    zIndex: 1
};

export const useInitializeSearchDialog = <ENTITY,>({
    dialogTitle, tableHeader, identity, onFiltering, initRecord
}: InitializeSearchDialogProps<ENTITY>) => {
    return React.useCallback(({ isOpen, onCompleted, onClose }: SearchDialogProps<ENTITY>) => {
        return (
            <SearchContentDialog
                dialogTitle={dialogTitle} tableHeader={tableHeader} identity={identity}
                onFiltering={onFiltering} initRecord={initRecord} onCompleted={onCompleted}
                isOpen={isOpen} onClose={onClose}
            />
        );
    }, [dialogTitle, tableHeader, identity, onFiltering, initRecord]
    );
};
