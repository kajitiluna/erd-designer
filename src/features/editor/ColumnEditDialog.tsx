import { v4 as uuidV4 } from 'uuid';
import React, { ChangeEvent, MouseEvent, useState } from "react";
import {
    Autocomplete, Box, Button, Checkbox,
    Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    FormControlLabel, Paper, Stack, TextField, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";

import { initHandleChangeWithSyncPhysicalName } from "~/features/editor/support";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import ColumnType from "~/models/database/ColumnType";
import { ColumnShareModelStrageContext } from '~/context/ColumnShareModelStrageContext';
import EdgedIconButton from '~/components/EdgedIconButton';
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from '~/context/ErdDocumentsHolderContext';
import ErdDocument from '~/models/ErdDocument';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import SearchColumnShareModelDialog from '~/features/editor/SearchColumnShareModelDialog';

type ColumnEditDialogProps = {
    isOpen: boolean,
    columnModel: ColumnModel,
    onUpdateColumnModels: (updateFunction: ((previous: ColumnModel[]) => ColumnModel[])) => void,
    onClose: () => void
};

type ColumnTypeAttribute = {
    columnType: ColumnType,
    precision: string,
    scale: string,
    unsigned: boolean
}

const ColumnEditDialog = ({ isOpen, columnModel, onUpdateColumnModels, onClose }: ColumnEditDialogProps) => {
    const { columnShareModelStrage, updateStrage } = React.useContext(ColumnShareModelStrageContext);

    const columnShareModel: ColumnShareModel | null = columnShareModelStrage.find(columnModel.columnShareModelId);

    const [checkedPrimaryKey, setPrimaryKey] = useState<boolean>(columnModel.primaryKey);
    const [checkedNotNull, setNotNull] = useState<boolean>(columnModel.notNull);
    const [checkedUnique, setUnique] = useState<boolean>(columnModel.unique);
    const [checkAutoIncrement, setAutoIncrement] = useState<boolean>(columnModel.autoIncrement);
    const [editableAutoIncrement, setEditableAutoIncrement]
        = useState<boolean>(columnShareModel ? columnShareModel.columnType.withAuthIncrement : false);

    const [columnShareModelId, setColumnShareModelId]
        = useState<string>(columnShareModel ? columnShareModel.columnShareModelId : "");
    const [physicalName, setPhysicalName] = useState<string>(columnShareModel ? columnShareModel.physicalName : "");
    const [logicalName, setLogicalName] = useState<string>(columnShareModel ? columnShareModel.logicalName : "");
    const [columnTypeAttribute, setColumnTypeAttribute]
        = useState<ColumnTypeAttribute | null>(columnShareModel ? toColumnTypeAttribute(columnShareModel) : null);
    const [description, setDescription] = useState<string>(columnShareModel ? columnShareModel.description : "");

    const updateColumnType = (attribute: ColumnTypeAttribute) => {
        setEditableAutoIncrement(attribute.columnType.withAuthIncrement);
        setColumnTypeAttribute(attribute);
    };

    const associateColumnModel = (columnShareModel: ColumnShareModel) => {
        const columnTypeAttribute = toColumnTypeAttribute(columnShareModel);

        setColumnShareModelId(columnShareModel.columnShareModelId);
        setPhysicalName(columnShareModel.physicalName);
        setLogicalName(columnShareModel.logicalName);
        updateColumnType(columnTypeAttribute);
        setDescription(columnShareModel.description);
    };

    // 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する
    const handleChangePhysicalName: ((event: ChangeEvent<HTMLInputElement>) => void)
        = initHandleChangeWithSyncPhysicalName({
            physicalName: physicalName, setPhysicalName: setPhysicalName,
            logicalName: logicalName, setLogicalName: setLogicalName
        });

    // PK の場合は、 NotNull も true となり、変更できない
    const handleChangePrimary = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked
        setPrimaryKey(checked);
        if (checked === true) {
            setNotNull(true);
        }
    };

    const validatedValue = (physicalName.length > 0) && (logicalName.length > 0)
        && validateColumnTypeAttribute(columnTypeAttribute);

    const handleComplated = (event: MouseEvent) => {
        if ((columnTypeAttribute == null) || (validatedValue === false)) {
            return;
        }

        event.stopPropagation();

        // ShareModel の更新
        const updatedShareModel = new ColumnShareModel({
            columnShareModelId: columnShareModelId ? columnShareModelId : uuidV4(),
            physicalName: physicalName,
            logicalName: logicalName,
            description: description,
            ...columnTypeAttribute
        });
        columnShareModelStrage.addModel(updatedShareModel);

        const updatedModel = new ColumnModel({
            columnModelId: columnModel.columnModelId,
            columnShareModelId: updatedShareModel.columnShareModelId,
            primaryKey: checkedPrimaryKey,
            notNull: checkedNotNull,
            unique: checkedUnique,
            autoIncrement: columnTypeAttribute.columnType.withAuthIncrement ? checkAutoIncrement : false
        });

        onUpdateColumnModels((previousColumnModels) => {
            const previousColumnModelIds = new Set(previousColumnModels.map((model) => model.columnModelId));

            // 新規の場合は追加
            if (previousColumnModelIds.has(updatedModel.columnModelId) === false) {
                return [...previousColumnModels, updatedModel];
            }

            return previousColumnModels.map((model) =>
                (model.columnModelId === updatedModel.columnModelId) ? updatedModel : model
            );
        });

        updateStrage(columnShareModelStrage);
        onClose();
    };

    const handleCloseDialog = (event: MouseEvent) => {
        event.stopPropagation();
        onClose();
    };

    const constraintPanel = (
        <Stack direction="row" spacing={2}>
            <FormControlLabel label="Primary Key" control={
                <Checkbox checked={checkedPrimaryKey} onChange={handleChangePrimary} />} />
            <FormControlLabel label="Not Null" control={
                <Checkbox checked={checkedNotNull} disabled={checkedPrimaryKey}
                    onChange={(event) => setNotNull(event.target.checked)} />} />
            <FormControlLabel label="Unique" control={
                <Checkbox checked={checkedUnique} onChange={(event) => setUnique(event.target.checked)} />} />
            {editableAutoIncrement &&
                <FormControlLabel label="Auto Increment" control={
                    <Checkbox checked={checkAutoIncrement}
                        onChange={(event) => setAutoIncrement(event.target.checked)} />} />
            }
        </Stack>
    );

    const attributePanel = (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Stack spacing={3}>
                <ColumnModelPanel
                    columnShareModelId={columnShareModelId}
                    associateColumnModel={associateColumnModel}
                    unrelateColumnModel={() => setColumnShareModelId("")} />
                <TextField required variant="outlined" id="physicalName" label="Physical Name"
                    value={physicalName} onChange={handleChangePhysicalName} />
                <TextField required variant="outlined" id="logicalName" label="Logical Name"
                    value={logicalName} onChange={(event) => setLogicalName(event.target.value)} />
                <ColumnTypeEditPanel
                    columnTypeAttribute={columnTypeAttribute}
                    updateColumnType={updateColumnType} />
                <TextField variant="outlined" id="description" label="Description"
                    multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                    value={description} onChange={(event) => setDescription(event.target.value)} />
            </Stack>
        </Paper>
    );

    return (
        <Dialog fullWidth maxWidth="md" sx={{ userSelect: "none" }} open={isOpen} onClose={onClose}>
            <DialogTitle>Edit table column</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    {constraintPanel}
                    {attributePanel}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button variant="contained" disabled={!validatedValue} onClick={handleComplated}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

const toColumnTypeAttribute = (columnShareModel: ColumnShareModel) => {
    return {
        columnType: columnShareModel.columnType,
        precision: columnShareModel.precision,
        scale: columnShareModel.scale,
        unsigned: columnShareModel.unsigned
    };
}

const validateColumnTypeAttribute = (value: ColumnTypeAttribute | null): boolean => {
    if (value == null) {
        return false;
    }

    const columnType = value.columnType;
    if (!columnType) {
        return false;
    }

    if ((columnType.withPrecision === false) && (columnType.withScale === false)) {
        return true;
    }

    if (columnType.withScale && (!value.scale)) {
        return false;
    }

    return !!value.precision;
};

type ColumnModelPanelProps = {
    columnShareModelId: string,
    associateColumnModel: (columnShareModel: ColumnShareModel) => void,
    unrelateColumnModel: () => void
};

const ColumnModelPanel = ({ columnShareModelId, associateColumnModel, unrelateColumnModel }: ColumnModelPanelProps) => {

    const { columnShareModelStrage } = React.useContext(ColumnShareModelStrageContext);
    const columnShareModel = columnShareModelId ? columnShareModelStrage.find(columnShareModelId) : null;

    const [isOpenSearchDialog, setOpenSearchDialog] = useState<boolean>(false);
    const [isOpenUnrelateDialog, setOpenUnrelateDialog] = useState<boolean>(false);

    const searchButton = (
        <>
            <EdgedIconButton
                tooltip="Search for column model to be associated"
                onClick={() => { setOpenSearchDialog(true) }}>
                <SearchIcon />
            </EdgedIconButton>
            <SearchColumnShareModelDialog
                isOpen={isOpenSearchDialog}
                associateColumnModel={associateColumnModel}
                onClose={() => setOpenSearchDialog(false)} />
        </>
    );

    if (columnShareModel == null) {
        return (
            <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="body2">
                    Create new column model.
                </Typography>
                {searchButton}
            </Stack>
        );
    }

    const handleOpenUnrelateDialog = (event: MouseEvent) => {
        event.stopPropagation();
        setOpenUnrelateDialog(true);
    };
    const handleCloseUnreateDialog = (event: MouseEvent) => {
        event.stopPropagation();
        setOpenUnrelateDialog(false)
    };

    return (
        <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="body2">
                Associated with column model
            </Typography>
            <Typography variant="body1">{`'${columnShareModel.logicalName}'`}</Typography>
            <EdgedIconButton
                tooltip="Unrelated with column model"
                onClick={handleOpenUnrelateDialog}>
                <CloseIcon />
            </EdgedIconButton>
            {searchButton}
            <Dialog open={isOpenUnrelateDialog} onClose={handleCloseUnreateDialog}>
                <DialogTitle>Unrelate column model?</DialogTitle>
                <DialogContent>
                    <DialogContentText>Are you sure to unrelate the column model ?</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseUnreateDialog}>Cancel</Button>
                    <Button variant="contained" color="warning" onClick={() => {
                        unrelateColumnModel();
                        setOpenUnrelateDialog(false);
                    }}>
                        Unrelate
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

type ColumnTypeEditPanelProps = {
    columnTypeAttribute: ColumnTypeAttribute | null,
    updateColumnType: (value: ColumnTypeAttribute) => void
};

const ColumnTypeEditPanel = ({ columnTypeAttribute, updateColumnType }: ColumnTypeEditPanelProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();
    const databaseSetting: DatabaseSettingModel = erdDocument.databaseSettingModel

    const columnType = columnTypeAttribute ? columnTypeAttribute.columnType : null;
    const precision = columnTypeAttribute ? columnTypeAttribute.precision : "";
    const scale = columnTypeAttribute ? columnTypeAttribute.scale : "";
    const unsigned = columnTypeAttribute ? columnTypeAttribute.unsigned : false;

    const editablePrecision = columnType ? columnType.withPrecision : false;
    const editableScale = columnType ? columnType.withScale : false
    const editableUnsigned = columnType ? columnType.withUnsigned : false;

    const handleChangeColumnType = (nextColumnTypeId: number) => {
        const nextColumnType = databaseSetting.findColumnType(nextColumnTypeId) as ColumnType;
        updateColumnType({
            columnType: nextColumnType,
            precision: precision,
            scale: scale,
            unsigned: unsigned
        });
    };

    // precision に正の値のみ受け付ける制御
    const handleChangePresicion = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = event.target.value;
        const updatedValue = Number(inputValue) > 0 ? inputValue : "";
        updateColumnType({
            columnType: columnType as ColumnType,
            precision: updatedValue,
            scale: scale,
            unsigned: unsigned
        });
    };

    // scale に正の値のみ受け付ける制御
    const handleChangeScale = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = event.target.value;
        const updatedValue = Number(inputValue) > 0 ? inputValue : "";
        updateColumnType({
            columnType: columnType as ColumnType,
            precision: precision,
            scale: updatedValue,
            unsigned: unsigned
        });
    };

    const handleChangeUnsign = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        updateColumnType({
            columnType: columnType as ColumnType,
            precision: precision,
            scale: scale,
            unsigned: checked
        });
    };

    return (
        <Grid container>
            <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ pr: 1 }}>
                    <Autocomplete id="columnType" disableClearable
                        renderInput={(params) => <TextField  {...params} label="Column Type" />}
                        options={databaseSetting.columnTypes.map((columnType) => {
                            return { label: columnType.name, id: columnType.id }
                        })}
                        value={columnType ? { label: columnType.name, id: columnType.id } : { label: "", id: 0 }}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        onChange={(_event, newValue) => handleChangeColumnType(newValue.id)}
                    />
                </Box>
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
                <Box sx={{ pr: 1 }}>
                    <TextField variant="outlined" id="precision" label="Precision" type="number"
                        disabled={!editablePrecision} required={editablePrecision}
                        error={editablePrecision && (precision === "")}
                        value={precision} onChange={handleChangePresicion} />
                </Box>
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
                <TextField variant="outlined" id="scale" label="Scale" type="number"
                    disabled={!editableScale} required={editableScale}
                    error={editableScale && (scale === "")}
                    value={scale} onChange={handleChangeScale} />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
                <Box sx={{ pl: 1 }}>
                    {editableUnsigned &&
                        <FormControlLabel label="unsigned" control={
                            <Checkbox checked={unsigned} onChange={handleChangeUnsign} />
                        } />
                    }
                </Box>
            </Grid>
        </Grid>
    );
};

export default ColumnEditDialog;
