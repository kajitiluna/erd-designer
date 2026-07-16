import React from "react";
import {
    Backdrop, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    Stack, Table, TableBody, TableContainer, TableRow, TextField
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

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
// eslint-disable-next-line react-refresh/only-export-components
const SearchContentDialog = <ENTITY,>({
    dialogTitle, tableHeader, identity, onFiltering, initRecord, isOpen, onCompleted, onClose
}: InitializeSearchDialogProps<ENTITY> & SearchDialogProps<ENTITY>) => {
    const focusRef = React.useRef<HTMLInputElement | null>(null);
    const [timeoutId, setTimeoutId] = React.useState<NodeJS.Timeout | null>(null);
    const [filtering, setFiltering] = React.useState<string>("");
    const [inSearching, setSearching] = React.useState<boolean>(false);
    const [filteredModels, setFilteredModels] = React.useState<ENTITY[]>(onFiltering([]));
    const [selectedModel, setSelectedModel] = React.useState<ENTITY | null>(null);

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

    const filteringPanel = (
        <Stack direction="row" sx={{ justifyContent: "flex-end", alignItems: "center", padding: 1 }}>
            <div style={{ flex: 8 }}></div>
            <Box sx={{ display: "flex", alignItems: "center", flex: 4 }}>
                <SearchIcon sx={{ color: "action.active", mr: 1, my: 0.5 }} />
                <TextField inputRef={focusRef} label="keywords" size="small" fullWidth
                    value={filtering} onChange={handleChangeValue} />
            </Box>
        </Stack>
    );

    const initRow = (target: ENTITY) => {
        const rowSelected = (selectedModel != null) && (identity(target) === identity(selectedModel));

        const handleClick = (event: React.MouseEvent) => {
            event.stopPropagation();

            if ((selectedModel != null) && (identity(target) === identity(selectedModel))) {
                setSelectedModel(null);
                return;
            }

            setSelectedModel(target);
        };

        const handleDoubleClick = (event: React.MouseEvent) => {
            event.stopPropagation();

            onCompleted(target);
            onClose();
        };

        const attributes: React.ComponentProps<typeof TableRow> = {
            sx: rowSelected ? { backgroundColor: SELECTED_CELL_COLOR } : BASE_ROW_STYLE,
            style: { cursor: 'pointer' },
            onClick: handleClick, onDoubleClick: handleDoubleClick
        };

        return initRecord(target, rowSelected, attributes);
    };

    const contentPanel = (
        <Box sx={{ position: "relative" }}>
            <TableContainer>
                <Table stickyHeader size="small" aria-label="column model table">
                    {tableHeader}
                    {(filteredModels.length > 0) && (
                        <TableBody>
                            {filteredModels.map(model => initRow(model))}
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

    // Dialog が開いた時に physicalName フィールドにフォーカスを当てる
    React.useEffect(() => {
        if (isOpen === false) {
            return;
        }

        const timeoutId = setTimeout(() => {
            if (focusRef.current) {
                focusRef.current.focus();
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [isOpen]);

    return (
        <Dialog fullWidth maxWidth="xl" sx={{ userSelect: "none" }}
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

const BASE_ROW_STYLE = { '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } };

const BACKDROP_STYLE = {
    position: "absolute",
    backdropFilter: "blur(2px)",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
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
