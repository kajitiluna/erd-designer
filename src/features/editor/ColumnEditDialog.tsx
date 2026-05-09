import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Checkbox,
    Collapse, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider,
    FormControlLabel, IconButton, Paper, Stack, TextField, Tooltip, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import ColumnType from "~/models/database/ColumnType";
import { Database } from '~/models/database';
import DatabaseSettingModel from '~/models/DatabaseSettingModel';
import ErdDocument from '~/models/ErdDocument';
import EdgedIconButton from '~/components/EdgedIconButton';
import { ColumnShareModelStorageContext } from '~/context/ColumnShareModelStorageContext';
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from '~/context/ErdDocumentsHolderContext';
import {
    ColumnWrapModel, initHandleChangePhysicalName, initHandleChangeWithSyncPhysicalName,
    initHandleCloseDialog, initHandleEnterKeyDown
} from "~/features/editor/support";
import { initOptionCollatePanel } from '~/features/editor/view-support';
import SearchColumnShareModelDialog from '~/features/editor/SearchColumnShareModelDialog';

type ColumnEditDialogProps = {
    isOpen: boolean,
    columnModel: ColumnModel,
    isEditableColumnType: (columnModel: ColumnModel) => boolean,
    onUpdateWrapColumnModels: (updateFunction: ((previous: ColumnWrapModel[]) => ColumnWrapModel[])) => void,
    onClose: () => void
};

type ColumnTypeAttribute = {
    columnType: ColumnType | null,
    precision: string,
    scale: string,
    unsigned: boolean,
    isArray: boolean,
    characterSet: string,
    collate: string,
    optionExpression: string
}

const ColumnEditDialog = ({
    isOpen, columnModel, isEditableColumnType, onUpdateWrapColumnModels, onClose
}: ColumnEditDialogProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { columnShareModelStorage, updateStorage } = React.useContext(ColumnShareModelStorageContext);

    const columnShareModel: ColumnShareModel | null = columnShareModelStorage.find(columnModel.columnShareModelId);

    const [checkedPrimaryKey, setPrimaryKey] = React.useState<boolean>(columnModel.primaryKey);
    const [checkedNotNull, setNotNull] = React.useState<boolean>(columnModel.notNull);
    const [checkedUnique, setUnique] = React.useState<boolean>(columnModel.unique);
    const [checkAutoIncrement, setAutoIncrement] = React.useState<boolean>(columnModel.autoIncrement);
    const [overriddenPhysicalName, setOverriddenPhysicalName] = React.useState<string>(columnModel.physicalName);
    const [overriddenLogicalName, setOverriddenLogicalName] = React.useState<string>(columnModel.logicalName);
    const [defaultValue, setDefaultValue] = React.useState<string>(columnModel.defaultValue);

    const [columnShareModelId, setColumnShareModelId] =
        React.useState<string>(columnShareModel ? columnShareModel.columnShareModelId : "");
    const [physicalName, setPhysicalName] =
        React.useState<string>(columnShareModel ? columnShareModel.physicalName : "");
    const [logicalName, setLogicalName] = React.useState<string>(columnShareModel ? columnShareModel.logicalName : "");
    const [columnTypeAttribute, setColumnTypeAttribute] =
        React.useState<ColumnTypeAttribute>(toColumnTypeAttribute(columnShareModel));
    const [description, setDescription] = React.useState<string>(columnShareModel ? columnShareModel.description : "");

    const erdDocument: ErdDocument = documentsHolder.current();
    const databaseSetting: DatabaseSettingModel = erdDocument.databaseSettingModel
    const database = databaseSetting.getDatabase();

    const associateColumnModel = (columnShareModel: ColumnShareModel) => {
        const columnTypeAttribute = toColumnTypeAttribute(columnShareModel);

        setColumnShareModelId(columnShareModel.columnShareModelId);
        setPhysicalName(columnShareModel.physicalName);
        setLogicalName(columnShareModel.logicalName);
        setColumnTypeAttribute(columnTypeAttribute);
        setDescription(columnShareModel.description);
    };

    // 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する
    const handleChangePhysicalName: ((event: React.ChangeEvent<HTMLInputElement>) => void)
        = initHandleChangeWithSyncPhysicalName({
            physicalName: physicalName, setPhysicalName: setPhysicalName,
            logicalName: logicalName, setLogicalName: setLogicalName
        });

    // PK の場合は、 NotNull = true, Unique = false とし、変更できないようにする
    const handleChangePrimary = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked
        setPrimaryKey(checked);
        if (checked === true) {
            setNotNull(true);
            setUnique(false);
        }
    };

    // 外部キー制約が定義され shareModelId が異なる場合は型を変更できない
    const editableColumnType = isEditableColumnType(columnModel);

    const validatedValue = (physicalName.length > 0) && (logicalName.length > 0)
        && validateColumnTypeAttribute(columnTypeAttribute);

    const handleCompleted = () => {
        const columnType = columnTypeAttribute.columnType;
        if ((columnType == null) || (validatedValue === false)) {
            return;
        }

        const availableCollate = (columnType.category === "text");

        const updatedShareModel = new ColumnShareModel({
            columnShareModelId: columnShareModelId ? columnShareModelId : uuidV4(),
            physicalName: physicalName,
            logicalName: logicalName,
            description: description,
            ...columnTypeAttribute,
            columnType: columnType,
            characterSet: (availableCollate && database.editableCharacterSet) ? columnTypeAttribute.characterSet : "",
            collate: availableCollate ? columnTypeAttribute.collate : "",
        });
        const nextShareModelStorage = columnShareModelStorage.addModel(updatedShareModel);

        const updatedModel = new ColumnModel({
            columnModelId: columnModel.columnModelId,
            columnShareModelId: updatedShareModel.columnShareModelId,
            physicalName: overriddenPhysicalName,
            logicalName: overriddenLogicalName,
            primaryKey: checkedPrimaryKey,
            notNull: checkedNotNull,
            unique: checkedUnique,
            autoIncrement: columnType.withAutoIncrement ? checkAutoIncrement : false,
            defaultValue: defaultValue
        });

        onUpdateWrapColumnModels(previousColumnModels => {
            const previousColumnModelIds = new Set(previousColumnModels
                .map(model => (model.modelType === "single") ? model.columnModel.columnModelId : null)
                .filter(columnModelId => columnModelId != null) as string[]
            );

            // 新規の場合は追加
            if (previousColumnModelIds.has(updatedModel.columnModelId) === false) {
                return [...previousColumnModels, { modelType: "single", columnModel: updatedModel }];
            }

            return previousColumnModels.map(model =>
                ((model.modelType === "single") && (model.columnModel.columnModelId === updatedModel.columnModelId))
                    ? { modelType: "single", columnModel: updatedModel } : model
            );
        });

        updateStorage(nextShareModelStorage);
        onClose();
    };

    const handleCloseDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        onClose();
    };

    const constraintPanel = (
        <Stack direction="row" spacing={2}>
            <FormControlLabel label="Primary Key" control={
                <Checkbox checked={checkedPrimaryKey} onChange={handleChangePrimary} />} />
            <FormControlLabel label="Not Null" control={
                <Checkbox checked={checkedNotNull} disabled={checkedPrimaryKey}
                    onChange={event => setNotNull(event.target.checked)} />} />
            <FormControlLabel label="Unique" control={
                <Checkbox checked={checkedUnique} disabled={checkedPrimaryKey}
                    onChange={event => setUnique(event.target.checked)} />} />
            {(columnTypeAttribute.columnType != null) && (columnTypeAttribute.columnType.withAutoIncrement) &&
                <FormControlLabel label={database.autoIncrementLabel()} control={
                    <Checkbox checked={checkAutoIncrement}
                        onChange={event => setAutoIncrement(event.target.checked)} />} />
            }
        </Stack>
    );

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    const initClearButton = (value: string, setValue: (value: string) => void) => {
        return value == "" ? {} : {
            input: {
                endAdornment: <IconButton size="small" onClick={() => setValue("")}>
                    <ClearIcon />
                </IconButton>
            }
        }
    }

    const overriddenPanel = (
        <Accordion defaultExpanded={(overriddenPhysicalName != "") || (overriddenLogicalName != "")}>
            <AccordionSummary id="override-names-header"
                aria-controls="override-names-content" expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={2} alignItems="center" width="100%">
                    <Typography variant="body2">Override Names (optional)</Typography>
                    <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                        <Tooltip placement="right" arrow title={messageForOverrideNames}>
                            <HelpOutlineIcon fontSize="small" />
                        </Tooltip>
                    </Box>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction="row" spacing={1}>
                    <TextField id="overriddenPhysicalName" label="Physical Name"
                        fullWidth variant="outlined" size="small" value={overriddenPhysicalName}
                        slotProps={initClearButton(overriddenPhysicalName, setOverriddenPhysicalName)}
                        onChange={initHandleChangePhysicalName(setOverriddenPhysicalName)}
                        onKeyDown={handleEnterDown} />
                    <TextField id="overriddenLogicalName" label="Logical Name"
                        fullWidth variant="outlined" size="small" value={overriddenLogicalName}
                        slotProps={initClearButton(overriddenLogicalName, setOverriddenLogicalName)}
                        onChange={event => setOverriddenLogicalName(event.target.value)}
                        onKeyDown={handleEnterDown} />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );

    const attributePanel = (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Stack spacing={3}>
                <ColumnModelPanel
                    columnShareModelId={columnShareModelId}
                    associateColumnModel={associateColumnModel}
                    unlinkColumnModel={() => setColumnShareModelId("")} />
                <Stack direction="row" spacing={1}>
                    <TextField id="physicalName" label="Physical Name"
                        required fullWidth variant="outlined" value={physicalName}
                        onChange={handleChangePhysicalName} onKeyDown={handleEnterDown} />
                    <TextField id="logicalName" label="Logical Name"
                        required fullWidth variant="outlined" value={logicalName}
                        onChange={event => setLogicalName(event.target.value)}
                        onKeyDown={handleEnterDown} />
                </Stack>
                <ColumnTypeEditPanel
                    columnTypeAttribute={columnTypeAttribute} disabled={!editableColumnType}
                    updateColumnType={setColumnTypeAttribute} onEnterAction={handleEnterDown} />
                <TextField variant="outlined" id="description" label="Description"
                    multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                    value={description} onChange={event => setDescription(event.target.value)} />
            </Stack>
        </Paper>
    );

    const defaultValueCandidates = initDefaultValueCandidates(columnTypeAttribute)

    return (
        <Dialog fullWidth maxWidth="md" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit table column</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    {constraintPanel}
                    {overriddenPanel}
                    {attributePanel}
                    <Autocomplete freeSolo options={defaultValueCandidates} value={defaultValue}
                        onInputChange={(_, newValue) => setDefaultValue(newValue ?? "")}
                        onChange={(_, newValue) => setDefaultValue(newValue ?? "")}
                        renderInput={params =>
                            <TextField {...params} id="defaultValue" label="Default Value"
                                variant="outlined" fullWidth />} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button variant="contained" disabled={!validatedValue} onClick={handleCompleted}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

const messageForOverrideNames =
    "Allows you to override physical or logical names defined in the column model for this specific column." +
    " This is useful when you want to customize names individually while maintaining shared column definitions.";

const toColumnTypeAttribute = (columnShareModel: ColumnShareModel | null) => {
    if (columnShareModel == null) {
        return {
            columnType: null,
            precision: "",
            scale: "",
            unsigned: false,
            isArray: false,
            characterSet: "",
            collate: "",
            optionExpression: ""
        };
    }

    return {
        columnType: columnShareModel.columnType,
        precision: columnShareModel.precision,
        scale: columnShareModel.scale,
        unsigned: columnShareModel.unsigned,
        isArray: columnShareModel.isArray,
        characterSet: columnShareModel.characterSet,
        collate: columnShareModel.collate,
        optionExpression: columnShareModel.optionExpression
    };
}

const validateColumnTypeAttribute = (value: ColumnTypeAttribute): boolean => {
    const columnType = value.columnType;
    if (columnType == null) {
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

const initDefaultValueCandidates = (attribute: ColumnTypeAttribute) => {
    if (attribute.columnType == null) {
        return [];
    }

    return attribute.columnType.candidateDefaultValues(attribute.precision, attribute.scale);
};

type ColumnModelPanelProps = {
    columnShareModelId: string,
    associateColumnModel: (columnShareModel: ColumnShareModel) => void,
    unlinkColumnModel: () => void
};

const ColumnModelPanel = ({ columnShareModelId, associateColumnModel, unlinkColumnModel }: ColumnModelPanelProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);
    const columnShareModel = columnShareModelId ? columnShareModelStorage.find(columnShareModelId) : null;

    const [isOpenSearchDialog, setOpenSearchDialog] = React.useState<boolean>(false);
    const [isOpenUnlinkDialog, setOpenUnlinkDialog] = React.useState<boolean>(false);

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

    const handleOpenUnlinkDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpenUnlinkDialog(true);
    };
    const handleCloseUnlinkDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpenUnlinkDialog(false)
    };

    return (
        <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="body2">
                Associated with column model
            </Typography>
            <Typography variant="body1">{`'${columnShareModel.logicalName}'`}</Typography>
            <EdgedIconButton
                tooltip="Unrelated with column model"
                onClick={handleOpenUnlinkDialog}>
                <CloseIcon />
            </EdgedIconButton>
            {searchButton}
            <Dialog open={isOpenUnlinkDialog} onClose={handleCloseUnlinkDialog}>
                <DialogTitle>Unlink column model?</DialogTitle>
                <DialogContent>
                    <DialogContentText>Are you sure to unlink the column model ?</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseUnlinkDialog}>Cancel</Button>
                    <Button variant="contained" color="warning" onClick={() => {
                        unlinkColumnModel();
                        setOpenUnlinkDialog(false);
                    }}>
                        Unlink
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

type ColumnTypeEditPanelProps = {
    columnTypeAttribute: ColumnTypeAttribute,
    disabled?: boolean,
    updateColumnType: (updateFunction: (previous: ColumnTypeAttribute) => ColumnTypeAttribute) => void,
    onEnterAction?: (event: React.KeyboardEvent) => void
};

const ColumnTypeEditPanel = ({
    columnTypeAttribute: attribute, disabled = false, updateColumnType, onEnterAction = () => { }
}: ColumnTypeEditPanelProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const [optionExpanded, setOptionExpanded] = React.useState<boolean>(
        (attribute.characterSet != "") || (attribute.collate != "") || (attribute.optionExpression != "")
    );

    const erdDocument: ErdDocument = documentsHolder.current();
    const databaseSetting: DatabaseSettingModel = erdDocument.databaseSettingModel
    const database = databaseSetting.getDatabase();

    const editableArray = database.supportsArrayType;

    const columnType = attribute.columnType;
    const editablePrecision = columnType ? columnType.withPrecision : false;
    const editableScale = columnType ? columnType.withScale : false
    const editableUnsigned = columnType ? columnType.withUnsigned : false;

    const handleChangeColumnType = (nextColumnTypeId: number) => {
        const nextColumnType = databaseSetting.findColumnType(nextColumnTypeId) as ColumnType;
        updateColumnType(previous => {
            if ((previous.columnType != null) && (nextColumnType.id === previous.columnType.id)) {
                return previous;
            }

            return { ...previous, columnType: nextColumnType };
        });
    };

    // precision に正の値のみ受け付ける制御
    const handleChangePrecision = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = event.target.value;
        const updatedValue = Number(inputValue) > 0 ? inputValue : "";

        updateColumnType(previous => {
            if (previous.precision === updatedValue) {
                return previous;
            }

            return { ...previous, precision: updatedValue };
        });
    };

    // scale に正の値のみ受け付ける制御
    const handleChangeScale = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = event.target.value;
        const updatedValue = Number(inputValue) > 0 ? inputValue : "";

        updateColumnType(previous => {
            if (previous.scale === updatedValue) {
                return previous;
            }

            return { ...previous, scale: updatedValue };
        });
    };

    const handleChangeUnsigned = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;

        updateColumnType(previous => {
            if (previous.unsigned === checked) {
                return previous;
            }

            return { ...previous, unsigned: checked };
        });
    };

    const handleChangeArray = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;

        updateColumnType(previous => {
            if (previous.isArray === checked) {
                return previous;
            }

            return { ...previous, isArray: checked };
        });
    };

    return (
        <Grid container spacing={1}>
            <Grid size={{ xs: 12, md: 5 }}>
                <Autocomplete id="columnType" disableClearable disabled={disabled}
                    renderInput={params => <TextField  {...params} label="Column Type" />}
                    options={databaseSetting.columnTypes.map(columnType => {
                        return { label: columnType.name, id: columnType.id }
                    })}
                    value={columnType ? { label: columnType.name, id: columnType.id } : { label: "", id: 0 }}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_event, newValue) => handleChangeColumnType(newValue.id)}
                />
            </Grid>
            <Grid size={{ xs: 3, md: 2 }}>
                <TextField variant="outlined" id="precision" label="Precision" type="number"
                    disabled={!editablePrecision || disabled} required={editablePrecision}
                    error={editablePrecision && (attribute.precision === "")}
                    value={attribute.precision} onChange={handleChangePrecision} onKeyDown={onEnterAction} />
            </Grid>
            <Grid size={{ xs: 3, md: 2 }}>
                <TextField variant="outlined" id="scale" label="Scale" type="number"
                    disabled={!editableScale || disabled} required={editableScale}
                    error={editableScale && (attribute.scale === "")}
                    value={attribute.scale} onChange={handleChangeScale} onKeyDown={onEnterAction} />
            </Grid>
            {editableUnsigned && (
                <Grid size={{ xs: 4, md: 2 }}>
                    <Box display="flex" alignItems="center" height="100%" sx={{ pl: 1 }}>
                        <FormControlLabel label="unsigned" control={
                            <Checkbox disabled={disabled} checked={attribute.unsigned}
                                onChange={handleChangeUnsigned} />
                        } />
                    </Box>
                </Grid>
            )}
            {editableArray && (
                <Grid size={{ xs: 4, md: 2 }}>
                    <Box display="flex" alignItems="center" height="100%" sx={{ pl: 1 }}>
                        <FormControlLabel label="isArray" control={
                            <Checkbox disabled={disabled} checked={attribute.isArray && editableArray}
                                onChange={handleChangeArray} />
                        } />
                    </Box>
                </Grid>
            )}
            {disabled && (
                <Grid size={{ xs: 2, md: 1 }}>
                    <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                        <Tooltip placement="left" arrow title={messageForForeignColumn}>
                            <HelpOutlineIcon fontSize="small" />
                        </Tooltip>
                    </Box>
                </Grid>
            )}
            {!disabled && (
                <Grid size={{ xs: 2, md: 1 }} offset="auto">
                    <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                        <Tooltip placement="left" arrow title="Other option">
                            <IconButton disabled={columnType == null}
                                onClick={() => setOptionExpanded(previous => !previous)}>
                                <ExpandMoreIcon sx={{ transform: optionExpanded ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Grid>
            )}
            <Grid size={{ xs: 12, md: 12 }}>
                <Collapse in={(columnType != null) && optionExpanded}>
                    {(columnType != null) && initExtraOptionPanel({
                        extraOption: attribute, database, columnType,
                        onUpdateExtraOption: updateColumnType
                    })}
                </Collapse>
            </Grid>
        </Grid>
    );
};

const messageForForeignColumn =
    "Unable to change column type: the column is set as a foreign key." +
    " Please remove the relation to proceed."

type ColumnExtraOptionPanelProps = {
    extraOption: ColumnTypeAttribute,
    database: Database,
    columnType: ColumnType,
    onUpdateExtraOption: (updateFunction: (previous: ColumnTypeAttribute) => ColumnTypeAttribute) => void
};

const initExtraOptionPanel = ({
    extraOption, database, columnType, onUpdateExtraOption
}: ColumnExtraOptionPanelProps) => {

    const handleChangeOptionExpression = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        onUpdateExtraOption(previous => {
            if (previous.optionExpression === value) {
                return previous;
            }

            return { ...previous, optionExpression: value };
        });
    };

    return (
        <Stack direction="column" spacing={2} sx={{ paddingTop: 2, paddingLeft: 2, paddingRight: 2 }}>
            <Typography variant="subtitle2">Other Column Option</Typography>
            {initOptionCollatePanel({ optionType: "column", extraOption, database, columnType, onUpdateExtraOption })}

            <Alert variant="outlined" severity="warning">
                <Typography variant="body2" sx={{ paddingBottom: 2 }}>
                    This expression is embedded directly into the exported DDL without any validation or evaluation.
                    This is an advanced feature — please verify that the expression is syntactically correct
                    for your database before use.
                </Typography>
                <Stack direction="column">
                    <Typography variant="subtitle2" color="text.primary">Other Option Expression</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Appended after the column definition in exported DDL:
                    </Typography>
                    <TextField id="extraOptionExpression" size="small" fullWidth variant="outlined" multiline minRows={2}
                        value={extraOption.optionExpression} onChange={handleChangeOptionExpression} />
                </Stack>
            </Alert>
        </Stack>
    );
};

export default ColumnEditDialog;
