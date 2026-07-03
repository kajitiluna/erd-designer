import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Checkbox,
    Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider,
    FormControlLabel, Grid, IconButton, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';

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
import { overrideColumnName } from '~/models/database/support';

type ColumnEditDialogProps = {
    isOpen: boolean,
    columnModel: ColumnModel,
    isEditableColumnType: (columnModel: ColumnModel) => boolean,
    onUpdateWrapColumnModels: (updateFunction: ((previous: ColumnWrapModel[]) => ColumnWrapModel[])) => void,
    onUpdateCheckExpression: (updateFunction: ((previous: string) => string)) => void,
    onClose: () => void
};

type ColumnTypeAttribute = {
    columnType: ColumnType | null,
    precision: string,
    scale: string,
    unsigned: boolean,
    isArray: boolean,
    description: string,
    checkExpression: string,
    characterSet: string,
    collate: string,
    optionExpression: string
}

const ColumnEditDialog = ({
    isOpen, columnModel, isEditableColumnType, onUpdateWrapColumnModels, onUpdateCheckExpression, onClose
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

    const erdDocument: ErdDocument = documentsHolder.current();
    const databaseSetting: DatabaseSettingModel = erdDocument.databaseSettingModel
    const database = databaseSetting.getDatabase();

    const [columnShareModelId, setColumnShareModelId] =
        React.useState<string>(columnShareModel ? columnShareModel.columnShareModelId : "");
    const [physicalName, setPhysicalName] =
        React.useState<string>(columnShareModel ? columnShareModel.physicalName : "");
    const [logicalName, setLogicalName] = React.useState<string>(columnShareModel ? columnShareModel.logicalName : "");
    const [columnTypeAttribute, setColumnTypeAttribute] =
        React.useState<ColumnTypeAttribute>(toColumnTypeAttribute(columnShareModel, database));

    const associateColumnModel = (columnShareModel: ColumnShareModel) => {
        const columnTypeAttribute = toColumnTypeAttribute(columnShareModel, database);

        setColumnShareModelId(columnShareModel.columnShareModelId);
        setPhysicalName(columnShareModel.physicalName);
        setLogicalName(columnShareModel.logicalName);
        setColumnTypeAttribute(columnTypeAttribute);
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

        onUpdateWrapColumnModels(previousColumns => {
            const previousColumnIds = new Set(previousColumns
                .map(model => (model.modelType === "single") ? model.columnModel.columnModelId : null)
                .filter(columnModelId => columnModelId != null) as string[]
            );

            // 新規の場合は追加
            if (previousColumnIds.has(updatedModel.columnModelId) === false) {
                return [...previousColumns, { modelType: "single", columnModel: updatedModel }];
            }

            return previousColumns.map(model =>
                ((model.modelType === "single") && (model.columnModel.columnModelId === updatedModel.columnModelId))
                    ? { modelType: "single", columnModel: updatedModel } : model
            );
        });

        if (columnShareModel != null) {
            const previousOverrideName = overrideColumnName(columnModel, columnShareModel);
            const nextOverrideName = overrideColumnName(updatedModel, updatedShareModel);
            if (previousOverrideName.physicalName !== nextOverrideName.physicalName) {
                onUpdateCheckExpression(previous => {
                    const previousPlaceholder = `\${${previousOverrideName.physicalName}}`;
                    const nextPlaceholder = `\${${nextOverrideName.physicalName}}`;

                    return previous.replaceAll(previousPlaceholder, nextPlaceholder);
                });
            }
        }

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
                <Stack direction="row" spacing={2} sx={{ alignItems: "center", width: "100%" }}>
                    <Typography variant="body2">Override Names (optional)</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        <Tooltip placement="right" arrow title={messageForOverrideNames}>
                            <HelpOutlineOutlinedIcon fontSize="small" />
                        </Tooltip>
                    </Box>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <Stack direction="row" spacing={1}>
                    <TextField label="Physical Name" fullWidth variant="outlined" size="small"
                        slotProps={initClearButton(overriddenPhysicalName, setOverriddenPhysicalName)}
                        value={overriddenPhysicalName} onKeyDown={handleEnterDown}
                        onChange={initHandleChangePhysicalName(setOverriddenPhysicalName)} />
                    <TextField label="Logical Name" fullWidth variant="outlined" size="small"
                        slotProps={initClearButton(overriddenLogicalName, setOverriddenLogicalName)}
                        value={overriddenLogicalName} onKeyDown={handleEnterDown}
                        onChange={event => setOverriddenLogicalName(event.target.value)} />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );

    const attributePanel = (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Stack useFlexGap spacing={3}>
                <ColumnModelPanel
                    columnShareModelId={columnShareModelId}
                    associateColumnModel={associateColumnModel}
                    unlinkColumnModel={() => setColumnShareModelId("")} />
                <Stack direction="row" spacing={1}>
                    <TextField label="Physical Name" required fullWidth variant="outlined" value={physicalName}
                        onChange={handleChangePhysicalName} onKeyDown={handleEnterDown} />
                    <TextField label="Logical Name" required fullWidth variant="outlined" value={logicalName}
                        onChange={event => setLogicalName(event.target.value)} onKeyDown={handleEnterDown} />
                </Stack>
                <ColumnTypeEditPanel
                    attribute={columnTypeAttribute} disabled={!editableColumnType}
                    updateColumnType={setColumnTypeAttribute} onEnterAction={handleEnterDown} />
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
                            <TextField {...params} label="Default Value" variant="outlined" fullWidth />
                        } />
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

const toColumnTypeAttribute = (columnShareModel: ColumnShareModel | null, database: Database) => {
    if (columnShareModel == null) {
        return {
            columnType: null,
            precision: "",
            scale: "",
            unsigned: false,
            isArray: false,
            description: "",
            checkExpression: "",
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
        description: columnShareModel.description,
        checkExpression: columnShareModel.checkExpression,
        characterSet: columnShareModel.characterSet(database),
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

    if (columnType.withScale && (value.scale === "")) {
        return false;
    }

    return value.precision !== "";
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

    const [isOpenSearchDialog, setOpenSearchDialog] = React.useState<boolean>(false);
    const [isOpenUnlinkDialog, setOpenUnlinkDialog] = React.useState<boolean>(false);

    const columnShareModel = columnShareModelId ? columnShareModelStorage.find(columnShareModelId) : null;

    const searchButton = (<>
        <EdgedIconButton
            tooltip="Search for column model to be associated"
            onClick={() => { setOpenSearchDialog(true) }}>
            <SearchIcon />
        </EdgedIconButton>
        <SearchColumnShareModelDialog
            isOpen={isOpenSearchDialog}
            associateColumnModel={associateColumnModel}
            onClose={() => setOpenSearchDialog(false)} />
    </>);

    if (columnShareModel == null) {
        return (
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Typography variant="body2">Create new column :</Typography>
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
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography variant="body2">Associated with :</Typography>
            <Chip variant="outlined" color="primary" label={columnShareModel.logicalName}
                onDelete={handleOpenUnlinkDialog} />
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
    attribute: ColumnTypeAttribute,
    disabled: boolean,
    updateColumnType: (updateFunction: (previous: ColumnTypeAttribute) => ColumnTypeAttribute) => void,
    onEnterAction: (event: React.KeyboardEvent) => void
};

const ColumnTypeEditPanel = ({ attribute, disabled, updateColumnType, onEnterAction }: ColumnTypeEditPanelProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const [tabIndex, setTabIndex] = React.useState<number>(0);
    const baseEditPanel = useBaseEditPanel({ attribute, disabled, updateColumnType, onEnterAction });

    const erdDocument: ErdDocument = documentsHolder.current();
    const database = erdDocument.getDatabase();
    const columnType = attribute.columnType;
    const hasCheckExpression = (columnType != null) && (attribute.checkExpression !== "");
    const hasOtherOption = attribute.characterSet || attribute.collate || attribute.optionExpression;

    return (<>
        <Tabs value={tabIndex} sx={{ mt: -1.5 }} onChange={(_, newValue) => setTabIndex(newValue)}>
            <Tab label="Base" />
            <Tab label={`Check${hasCheckExpression ? " (+)" : ""}`} disabled={columnType == null} />
            <Tab label={`Other Option${hasOtherOption ? " (+)" : ""}`} disabled={columnType == null} />
        </Tabs>
        <div hidden={tabIndex !== 0}>{baseEditPanel}</div>
        <div hidden={tabIndex !== 1}>{initCheckPanel({ attribute, disabled, updateColumnType })}</div>
        <div hidden={tabIndex !== 2}>
            {(columnType != null) && initExtraOptionPanel({
                extraOption: attribute, disabled, database, columnType, onUpdateExtraOption: updateColumnType
            })}
        </div>
    </>);
};

const useBaseEditPanel = ({ attribute, disabled, updateColumnType, onEnterAction }: ColumnTypeEditPanelProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

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

    const handleChangeDescription = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = event.target.value;

        updateColumnType(previous => {
            if (previous.description === inputValue) {
                return previous;
            }

            return { ...previous, description: inputValue };
        });
    };

    return (
        <Stack spacing={3}>
            <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Autocomplete disableClearable disabled={disabled}
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
                    <TextField variant="outlined" label="Precision" type="number"
                        disabled={(editablePrecision === false) || disabled} required={editablePrecision}
                        error={editablePrecision && (attribute.precision === "")}
                        value={attribute.precision} onChange={handleChangePrecision} onKeyDown={onEnterAction} />
                </Grid>
                <Grid size={{ xs: 3, md: 2 }}>
                    <TextField variant="outlined" label="Scale" type="number"
                        disabled={(editableScale === false) || disabled} required={editableScale}
                        error={editableScale && (attribute.scale === "")}
                        value={attribute.scale} onChange={handleChangeScale} onKeyDown={onEnterAction} />
                </Grid>
                {editableUnsigned && (
                    <Grid size={{ xs: 4, md: 2 }}>
                        <Box sx={{ display: "flex", alignItems: "center", height: "100%", pl: 1 }}>
                            <FormControlLabel label="unsigned" control={
                                <Checkbox disabled={disabled} checked={attribute.unsigned}
                                    onChange={handleChangeUnsigned} />
                            } />
                        </Box>
                    </Grid>
                )}
                {editableArray && (
                    <Grid size={{ xs: 4, md: 2 }}>
                        <Box sx={{ display: "flex", alignItems: "center", height: "100%", pl: 1 }}>
                            <FormControlLabel label="isArray" control={
                                <Checkbox disabled={disabled} checked={attribute.isArray && editableArray}
                                    onChange={handleChangeArray} />
                            } />
                        </Box>
                    </Grid>
                )}
                {disabled && (
                    <Grid size={{ xs: 2, md: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                            <Tooltip placement="left" arrow title={messageForForeignColumn}>
                                <HelpOutlineOutlinedIcon fontSize="small" />
                            </Tooltip>
                        </Box>
                    </Grid>
                )}
            </Grid>
            <TextField variant="outlined" label="Description"
                multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                value={attribute.description} onChange={handleChangeDescription} />
        </Stack>
    );
};

const messageForForeignColumn =
    "Unable to change column type: the column is set as a foreign key." +
    " Please remove the relation to proceed."

type ColumnCheckPanelProps = Omit<ColumnTypeEditPanelProps, "onEnterAction">;

const initCheckPanel = ({ attribute, disabled, updateColumnType }: ColumnCheckPanelProps) => {

    const handleChangeCheckExpression = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = event.target.value;

        updateColumnType(previous => {
            if (previous.checkExpression === inputValue) {
                return previous;
            }

            return { ...previous, checkExpression: inputValue };
        });
    }

    return (
        <Stack direction="column" spacing={2}>
            <TextField label="Check Expression" size="small" disabled={disabled} fullWidth variant="outlined"
                multiline minRows={3} value={attribute.checkExpression} onChange={handleChangeCheckExpression} />
            <Alert severity="info" variant="outlined">
                <Typography variant="body2" gutterBottom>
                    Use {"${this}"} as a placeholder for this column&apos;s physical name.
                    When exporting DDL, it is replaced with the actual column name —
                    so the expression stays correct even if the column is renamed.
                </Typography>
            </Alert>
        </Stack>
    );
};

type ColumnExtraOptionPanelProps = {
    extraOption: ColumnTypeAttribute,
    disabled: boolean,
    database: Database,
    columnType: ColumnType,
    onUpdateExtraOption: (updateFunction: (previous: ColumnTypeAttribute) => ColumnTypeAttribute) => void
};

const initExtraOptionPanel = ({
    extraOption, disabled, database, columnType, onUpdateExtraOption
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
        <Stack direction="column" spacing={2}>
            {initOptionCollatePanel({
                optionType: "column", extraOption, disabled, database, columnType, onUpdateExtraOption
            })}

            <Alert variant="outlined" severity="warning">
                <Typography variant="body2" sx={{ paddingBottom: 2 }}>
                    This expression is embedded directly into the exported DDL without any validation or evaluation.
                    This is an advanced feature — please verify that the expression is syntactically correct
                    for your database before use.
                </Typography>
                <Stack direction="column">
                    <Typography variant="subtitle2" sx={{ color: "text.primary" }}>Other Option Expression</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Appended after the column definition in exported DDL:
                    </Typography>
                    <TextField size="small" disabled={disabled} fullWidth variant="outlined" multiline minRows={2}
                        value={extraOption.optionExpression} onChange={handleChangeOptionExpression} />
                </Stack>
            </Alert>
        </Stack>
    );
};

export default ColumnEditDialog;
