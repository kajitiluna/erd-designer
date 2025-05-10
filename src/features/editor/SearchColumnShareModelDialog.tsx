import React, { MouseEvent, useState } from "react";
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField
} from "@mui/material";

import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import ColumnShareModel from "~/models/database/ColumnShareModel";

type SearchColumnShareModelDialogProps = {
    isOpen: boolean,
    associateColumnModel: (columnShareModel: ColumnShareModel) => void,
    onClose: () => void
};

type FilterType = "physicalName" | "logicalName" | "type" | "description"
type FilterCondition = { [key in FilterType]: string };

const SearchColumnShareModelDialog = ({ isOpen, associateColumnModel, onClose }: SearchColumnShareModelDialogProps) => {
    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);
    const columnShareModels = columnShareModelStorage.getModels();

    const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);
    const [filterCondition, setFilterCondition] = useState<FilterCondition>({
        physicalName: "", logicalName: "", type: "", description: ""
    });
    const [inSearching, setSearching] = useState<boolean>(false);
    const [filteredShareModels, setFilteredShareModels] = useState<ColumnShareModel[]>(columnShareModels);
    const [selectedModel, setSelectedModel] = useState<ColumnShareModel | null>(null);

    const handleFilterAction = ({ physicalName, logicalName, type, description }: FilterCondition) => {
        const filtered = ((physicalName === "") && (logicalName === "") && (type === "") && (description === ""))
            ? columnShareModels
            : columnShareModels.filter(
                (model) => physicalName ? model.physicalName.includes(physicalName) : true
            ).filter(
                (model) => logicalName ? model.logicalName.includes(logicalName) : true
            ).filter(
                (model) => type ? model.specifiedColumnType().includes(type) : true
            ).filter(
                (model) => description ? model.description.includes(description) : true
            );

        setFilteredShareModels(filtered);
        setSelectedModel(null);
    };

    const initFilterField = (filterType: FilterType, filterCondition: FilterCondition,
        setFilterCondition: React.Dispatch<React.SetStateAction<FilterCondition>>) => (
        <DelayActionTextField filterType={filterType}
            filterCondition={filterCondition} setFilterCondition={setFilterCondition}
            timeoutId={timeoutId} setTimeoutId={setTimeoutId}
            onUpdateSearching={setSearching} onDelayAction={handleFilterAction} />
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

        const handleDoubleClickRow = (event: MouseEvent) => {
            setSelectedModel(columnShareModel);
            handleSubmit(event);
        };

        return (
            <TableRow key={columnShareModel.columnShareModelId} style={{ cursor: 'pointer' }}
                selected={rowSelected} onClick={handleClickRow} onDoubleClick={handleDoubleClickRow} >
                <TableCell>{columnShareModel.physicalName}</TableCell>
                <TableCell>{columnShareModel.logicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType()}</TableCell>
                <TableCell>{columnShareModel.description}</TableCell>
            </TableRow>
        );
    };

    const handleSubmit = (event: MouseEvent) => {
        if (selectedModel == null) {
            return;
        }

        event.stopPropagation();

        associateColumnModel(selectedModel);
        onClose();
    };

    const handleCloseDialog = (event: MouseEvent) => {
        event.stopPropagation();
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="lg" open={isOpen} sx={{ userSelect: "none" }} onClose={handleCloseDialog}>
            <DialogTitle>Search column model</DialogTitle>
            <DialogContent>
                <TableContainer>
                    <Table stickyHeader size="small" aria-label="column model table">
                        <TableHead>
                            <TableRow>
                                <TableCell>Physical Name</TableCell>
                                <TableCell>Logical Name</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Description</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>{initFilterField("physicalName", filterCondition, setFilterCondition)}</TableCell>
                                <TableCell>{initFilterField("logicalName", filterCondition, setFilterCondition)}</TableCell>
                                <TableCell>{initFilterField("type", filterCondition, setFilterCondition)}</TableCell>
                                <TableCell>{initFilterField("description", filterCondition, setFilterCondition)}</TableCell>
                            </TableRow>
                        </TableHead>
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
                    <Stack justifyContent="center" alignItems="center" sx={{ p: 10 }}>
                        <CircularProgress />
                    </Stack>
                }
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button variant="contained" disabled={selectedModel == null} onClick={handleSubmit}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

type DelayActionTextFieldProp = {
    filterType: FilterType,
    filterCondition: FilterCondition,
    setFilterCondition: React.Dispatch<React.SetStateAction<FilterCondition>>,
    timeoutId: NodeJS.Timeout | null,
    setTimeoutId: (timeout: NodeJS.Timeout) => void,
    onUpdateSearching: (inSearching: boolean) => void,
    onDelayAction: (filter: FilterCondition) => void,
    delay?: number
};

const DelayActionTextField = ({
    filterType, filterCondition, setFilterCondition, timeoutId, setTimeoutId,
    onUpdateSearching, onDelayAction, delay = 500
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

    return (<TextField size="small" label={`filtering in ${filterType}`}
        value={filterCondition[filterType]} onChange={handleChangeValue} />);
};

export default SearchColumnShareModelDialog;
