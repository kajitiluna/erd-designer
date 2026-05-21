import React from "react";
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField
} from "@mui/material";

import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import { initHandleCloseDialog, SELECTED_CELL_COLOR } from "~/features/editor/support";

type SearchColumnShareModelDialogProps = {
    isOpen: boolean,
    associateColumnModel: (columnShareModel: ColumnShareModel) => void,
    onClose: () => void
};

type FilterType = "physicalName" | "logicalName" | "type" | "description"
type FilterCondition = { [key in FilterType]: string };

const SearchColumnShareModelDialog = ({
    isOpen, associateColumnModel, onClose
}: SearchColumnShareModelDialogProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);
    const columnShareModels = columnShareModelStorage.getModels();

    const focusRef = React.useRef<HTMLInputElement | null>(null);
    const [timeoutId, setTimeoutId] = React.useState<NodeJS.Timeout | null>(null);
    const [filterCondition, setFilterCondition] = React.useState<FilterCondition>({
        physicalName: "", logicalName: "", type: "", description: ""
    });
    const [inSearching, setSearching] = React.useState<boolean>(false);
    const [filteredShareModels, setFilteredShareModels]
        = React.useState<ColumnShareModel[]>(columnShareModels);
    const [selectedModel, setSelectedModel] = React.useState<ColumnShareModel | null>(null);

    const handleFilterAction = ({
        physicalName, logicalName, type, description
    }: FilterCondition) => {
        const filtered = ((physicalName === "") && (logicalName === "")
            && (type === "") && (description === ""))
            ? columnShareModels
            : columnShareModels
                .filter(model => physicalName ? model.physicalName.includes(physicalName) : true)
                .filter(model => logicalName ? model.logicalName.includes(logicalName) : true)
                .filter(model => type ? model.specifiedColumnType().includes(type) : true)
                .filter(model => description ? model.description.includes(description) : true);

        setFilteredShareModels(filtered);
        setSelectedModel(null);
    };

    const initFilterField = (
        filterType: FilterType, inputRef?: React.RefObject<HTMLInputElement | null> | null
    ) => (
        <DelayActionTextField inputRef={inputRef} filterType={filterType}
            filterCondition={filterCondition} setFilterCondition={setFilterCondition}
            timeoutId={timeoutId} setTimeoutId={setTimeoutId}
            onUpdateSearching={setSearching} onDelayAction={handleFilterAction} />
    );

    const tableHeader = (
        <TableHead>
            <TableRow>
                <TableCell sx={{ width: "12px" }} align="center"></TableCell>
                <TableCell>Physical Name</TableCell>
                <TableCell>Logical Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
            </TableRow>
            <TableRow>
                <TableCell></TableCell>
                <TableCell>{initFilterField("physicalName", focusRef)}</TableCell>
                <TableCell>{initFilterField("logicalName")}</TableCell>
                <TableCell>{initFilterField("type")}</TableCell>
                <TableCell>{initFilterField("description")}</TableCell>
            </TableRow>
        </TableHead>
    );

    const initRow = (columnShareModel: ColumnShareModel) => {
        const rowSelected = (selectedModel != null)
            && (columnShareModel.columnShareModelId === selectedModel.columnShareModelId);

        const handleClickRow = () => {
            if ((selectedModel != null)
                && (columnShareModel.columnShareModelId === selectedModel.columnShareModelId)) {
                setSelectedModel(null);
                return;
            }

            setSelectedModel(columnShareModel);
        };

        const handleDoubleClickRow = () => {
            associateColumnModel(columnShareModel);
            onClose();
        };

        const rowStyle = rowSelected
            ? { backgroundColor: SELECTED_CELL_COLOR } : BASE_ROW_STYLE;

        return (
            <TableRow key={columnShareModel.columnShareModelId}
                sx={rowStyle} style={{ cursor: 'pointer' }}
                onClick={handleClickRow} onDoubleClick={handleDoubleClickRow} >
                <TableCell align="center">{rowSelected && "✔"}</TableCell>
                <TableCell>{columnShareModel.physicalName}</TableCell>
                <TableCell>{columnShareModel.logicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType()}</TableCell>
                <TableCell>{columnShareModel.description}</TableCell>
            </TableRow>
        );
    };

    const handleSubmit = (event: React.MouseEvent) => {
        if (selectedModel == null) {
            return;
        }

        event.stopPropagation();

        associateColumnModel(selectedModel);
        onClose();
    };

    // Dialog が開いた時に physicalName フィールドにフォーカスを当てる
    React.useEffect(() => {
        if (isOpen) {
            const timeoutId = setTimeout(() => {
                if (focusRef.current) {
                    focusRef.current.focus();
                }
            }, 500);

            return () => clearTimeout(timeoutId);
        }
    }, [isOpen]);

    return (
        <Dialog fullWidth maxWidth="xl" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Search column model</DialogTitle>
            <DialogContent>
                <TableContainer>
                    <Table stickyHeader size="small" aria-label="column model table">
                        {tableHeader}
                        {(inSearching === false) && (filteredShareModels.length > 0) &&
                            <TableBody>
                                {filteredShareModels.map((shareModel) => initRow(shareModel))}
                            </TableBody>
                        }
                    </Table>
                </TableContainer>
                {(inSearching === false) && (filteredShareModels.length == 0) && (
                    <Box sx={{ margin: "25px", textAlign: "center" }}>No Contents.</Box>
                )}
                {inSearching &&
                    <Stack sx={{ justifyContent: "center", alignItems: "center", p: 10 }}>
                        <CircularProgress />
                    </Stack>
                }
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={selectedModel == null} onClick={handleSubmit}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

const BASE_ROW_STYLE = { '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } };

type DelayActionTextFieldProp = {
    filterType: FilterType,
    filterCondition: FilterCondition,
    setFilterCondition: React.Dispatch<React.SetStateAction<FilterCondition>>,
    timeoutId: NodeJS.Timeout | null,
    setTimeoutId: (timeout: NodeJS.Timeout) => void,
    onUpdateSearching: (inSearching: boolean) => void,
    onDelayAction: (filter: FilterCondition) => void,
    delay?: number,
    inputRef?: React.RefObject<HTMLInputElement | null> | null
};

const DelayActionTextField = ({
    filterType, filterCondition, setFilterCondition, timeoutId, setTimeoutId,
    onUpdateSearching, onDelayAction, delay = 500, inputRef = null
}: DelayActionTextFieldProp) => {

    const handleChangeValue = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        const newFilterCondition = { ...filterCondition };
        newFilterCondition[filterType] = newValue;
        setFilterCondition(newFilterCondition);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        onUpdateSearching(true);

        setTimeoutId(setTimeout(() => {
            onDelayAction(newFilterCondition);
            onUpdateSearching(false);
        }, delay));
    };

    return (
        <TextField inputRef={inputRef}
            size="small" fullWidth label={`filtering in ${filterType}`}
            value={filterCondition[filterType]} onChange={handleChangeValue} />
    );
};

export default SearchColumnShareModelDialog;