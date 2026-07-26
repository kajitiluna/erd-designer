import React from "react";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material";

import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnEntry from "~/models/database/ColumnEntry";
import ColumnModel from "~/models/database/ColumnModel";
import { Database } from "~/models/database";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import TableIndexModel from "~/models/database/TableIndexModel";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";
import TableUniqueKeysModel from "~/models/database/TableUniqueKeysModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnViewTable from "~/features/editor/ColumnViewTable";
import IndexGridView from "~/features/editor/IndexGridView";
import {
    ColumnWrapModel, toColumnWrapModels, initHandleChangeWithSyncPhysicalName, initHandleCloseDialog,
    initHandleEnterKeyDown, validateNameColumnWraps, initializeValidateNonRecursive
} from "~/features/editor/support";
import UniqueKeysGridView from "~/features/editor/UniqueKeysGridView";
import { ExtraOption, initOptionCollatePanel } from "~/features/editor/view-support";
import ColumnModelStorage from "~/models/ColumnModelStorage";

type TableEditViewProps = {
    isOpen: boolean,
    tableViewModel: TableViewModel,
    onClose: () => void
};

const TableEditView = ({ isOpen, tableViewModel, onClose }: TableEditViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [columnShareStorage, setColumnShareStorage] = React.useState(erdDocument.getColumnShareModelStorage());
    const [columnStorage, setColumnStorage] = React.useState<ColumnModelStorage>(ColumnModelStorage.create());

    const tableModel: TableModel = tableViewModel.tableModel;
    const [schemaId, setSchemaId] = React.useState<string>(tableModel.schemaId);
    const [physicalTableName, setPhysicalTableName] = React.useState<string>(tableModel.physicalName);
    const [logicalTableName, setLogicalTableName] = React.useState<string>(tableModel.logicalName);
    const [description, setDescription] = React.useState<string>(tableModel.description);

    // 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する
    const handleChangePhysicalName = initHandleChangeWithSyncPhysicalName({
        physicalName: physicalTableName, setPhysicalName: setPhysicalTableName,
        logicalName: logicalTableName, setLogicalName: setLogicalTableName
    });

    const { tabPanel, isValidColumn, handleColumnCompleted } =
        useColumnTab(erdDocument, tableModel, columnShareStorage, columnStorage);

    const handleUpdateTable = () => {
        if (isValidColumn === false) {
            return;
        }

        const result = handleColumnCompleted();
        if (result == null) {
            return;
        }

        const { columnParams, updatingColumnModels } = result;
        const nextTableModel = new TableModel({
            tableModelId: tableModel.tableModelId,
            physicalName: physicalTableName,
            logicalName: logicalTableName,
            schemaId: schemaId,
            description: description,
            ...columnParams
        });
        const nextTableViewModel = new TableViewModel({
            tableModel: nextTableModel,
            corner: tableViewModel.corner,
            headerColor: tableViewModel.headerColor
        });

        // struct 編集セッション中に蓄積されたメンバー ColumnModel を合流させる。
        // 同一 id が両方にある場合はテーブル直下の最新編集 (updatingColumnModels) を優先する。
        const mergedUpdatingColumns = [...columnStorage.getColumnModels(), ...updatingColumnModels];

        const message = "Update table model. " +
            JSON.stringify({ before: tableViewModel.tableModel, after: nextTableModel });
        documentsHolder.updateTableViewModel(
            nextTableViewModel, mergedUpdatingColumns, columnShareStorage, message
        );

        onClose();
    };

    const editValueValidated = (physicalTableName.length > 0) && (logicalTableName.length > 0) && isValidColumn;

    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        handleUpdateTable();
    };

    const database = erdDocument.getDatabase();
    const schemaConfig = erdDocument.schemaConfig;
    const handleChangeSchema = (event: SelectChangeEvent) => {
        const nextValue = event.target.value;
        setSchemaId(nextValue);
    };

    const tableNamePanel = (
        <Stack direction="row" spacing={2}>
            {(database.supportsSchema && schemaConfig.hasSchemas()) && (
                <FormControl fullWidth sx={{ flex: 2 }}>
                    <InputLabel id="label-db-schema">Schema</InputLabel>
                    <Select labelId="label-db-schema" label="Schema"
                        value={schemaId} onChange={handleChangeSchema}>
                        <MenuItem value="">(Default)</MenuItem>
                        {schemaConfig.getSchemas().map(schema => (
                            <MenuItem key={`table-schema_${schema.schemaId}`} value={schema.schemaId}>
                                {schema.schemaName}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}
            <TableNamePanel label="PhysicalName" value={physicalTableName}
                setValue={handleChangePhysicalName} onEnterAction={handleCompleted} />
            <TableNamePanel label="LogicalName" value={logicalTableName}
                setValue={event => setLogicalTableName(event.target.value)}
                onEnterAction={handleCompleted} />
        </Stack>
    );

    return (
        <ColumnShareModelStorageContext.Provider value={{
            columnShareStorage: columnShareStorage, updateShareStorage: setColumnShareStorage,
            columnStorage: columnStorage, updateColumnStorage: setColumnStorage
        }}>
            <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
                open={isOpen} onClose={initHandleCloseDialog(onClose)}>
                <DialogTitle>Edit Table</DialogTitle>
                <DialogContent>
                    <Stack spacing={3}>
                        <Divider />
                        {tableNamePanel}
                        {tabPanel}
                        <TextField variant="outlined" label="Description" multiline rows={3}
                            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
                            value={description} onChange={(event) => setDescription(event.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="contained" disabled={!editValueValidated} onClick={handleCompleted}>OK</Button>
                </DialogActions>
            </Dialog >
        </ColumnShareModelStorageContext.Provider>
    );
};

type TabEntry = { key: string, tab: React.ReactNode, panel: React.ReactNode };

const useColumnTab = (
    erdDocument: ErdDocument, tableModel: TableModel,
    columnShareStorage: ColumnShareModelStorage, columnStorage: ColumnModelStorage
) => {
    const [columnWrapModels, setColumnWrapModels]
        = React.useState<ColumnWrapModel[]>(toColumnWrapModels(erdDocument, tableModel));
    const [uniqueKeysModels, setUniqueKeysModels]
        = React.useState<TableUniqueKeysModel[]>([...tableModel.uniqueKeysModels]);
    const [tableIndexModels, setTableIndexModels]
        = React.useState<TableIndexModel[]>([...tableModel.tableIndexModels]);
    const [checkExpression, setCheckExpression] = React.useState<string>(tableModel.checkExpression);
    const [tableOption, setTableOption] = React.useState<TableExtraOption>({
        characterSet: tableModel.characterSet,
        collate: tableModel.collate,
        definitionExpression: tableModel.definitionExpression,
        optionExpression: tableModel.optionExpression
    });
    const [tabIndex, setTabIndex] = React.useState<number>(0);

    const isChildRelation = React.useCallback((columnModelId: string) => {
        return erdDocument.inChildRelation(tableModel.tableModelId, columnModelId)
    }, [tableModel.tableModelId, erdDocument]);

    const isEditableColumnType = React.useCallback((columnModel: SimpleColumnModel) => {
        const parentRelation = erdDocument.findParentRelation(tableModel.tableModelId, columnModel.columnModelId)
        if (parentRelation == null) {
            return true;
        }

        const parentColumnModel = erdDocument.findColumnModel(parentRelation.columnModelId);
        if ((parentColumnModel == null) || (ColumnModel.isSimpleColumn(parentColumnModel) === false)) {
            return true;
        }

        return (parentColumnModel.columnShareModelId === columnModel.columnShareModelId);
    }, [tableModel.tableModelId, erdDocument]);

    const database = erdDocument.getDatabase();
    const hasOtherOption = tableOption.characterSet || tableOption.collate ||
        tableOption.definitionExpression || tableOption.optionExpression;

    const baseColumnEntry = {
        key: "table-column", tab: <Tab key="table-column" label="Column" />,
        panel: <ColumnViewTable columnWrapModels={columnWrapModels} availableColumnGroup={true}
            isChildRelation={isChildRelation} isEditableColumnType={isEditableColumnType}
            onUpdateColumnWrapModels={setColumnWrapModels} onUpdateCheckExpression={setCheckExpression} />
    };
    const uniqueKeyEntries = (database.uniqueKeySupport.supportsUniqueKey === false) ? [] : [{
        key: "table-unique-key",
        tab: <Tab key="table-unique-key" disabled={columnWrapModels.length < 2}
            label={`Unique constraint (${uniqueKeysModels.length})`} />,
        panel: <UniqueKeysGridView database={database} columnWrapModels={columnWrapModels}
            tableUniqueKeysModels={uniqueKeysModels} isChildRelation={isChildRelation}
            onUpdateTableUniqueKeysModels={setUniqueKeysModels} />
    }];
    const indexEntries: TabEntry[] = (database.tableIndexSupport.supportsIndex === false) ? [] : [{
        key: "table-index",
        tab: <Tab key="table-index" disabled={columnWrapModels.length === 0}
            label={`Index (${tableIndexModels.length})`} />,
        panel: <IndexGridView database={database} columnWrapModels={columnWrapModels}
            tableIndexModels={tableIndexModels} isChildRelation={isChildRelation}
            onUpdateTableIndexModels={setTableIndexModels} />
    }];
    const checkEntry: TabEntry = {
        key: "table-check",
        tab: <Tab key="table-check" label={`Check${checkExpression ? " (+)" : ""}`} />,
        panel: <Stack direction="column" spacing={2}>
            <TextField label="Check Expression" size="small" fullWidth variant="outlined" multiline minRows={4}
                value={checkExpression} onChange={event => setCheckExpression(event.target.value)} />
            <Alert severity="info" variant="outlined">
                <Typography variant="body2" gutterBottom>{explanationForExpression}</Typography>
            </Alert>
        </Stack>
    };
    const optionEntry: TabEntry = {
        key: "table-other-option",
        tab: <Tab key="table-other-option" label={`Other Option${hasOtherOption ? " (+)" : ""}`} />,
        panel: initExtraOptionPanel({
            extraOption: tableOption, database, onUpdateExtraOption: setTableOption
        })
    };

    const tabEntries: TabEntry[] = [baseColumnEntry, ...uniqueKeyEntries, ...indexEntries, checkEntry, optionEntry];
    const tabPanel = (<>
        <Tabs value={tabIndex} onChange={(_, newValue) => setTabIndex(newValue)}>
            {tabEntries.map(entry => entry.tab)}
        </Tabs>
        {tabEntries.map((entry, index) => (<div key={entry.key} hidden={tabIndex !== index}>{entry.panel}</div>))}
    </>);

    // 物理名に重複がないことをチェックする
    const isValidName = validateNameColumnWraps(columnWrapModels, erdDocument, columnShareStorage);
    // struct 再帰構造がないことのチェック
    const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);
    const isValidNonRecursive = validateNonRecursive(columnWrapModels);

    const isValidColumn = isValidName && isValidNonRecursive;

    const handleColumnCompleted = () => {
        if (isValidColumn === false) {
            return null;
        }

        const columnEntries: ColumnEntry[] = columnWrapModels.map(wrapModel => {
            // struct カラムは「struct バリアント ColumnModel への single 参照」で表現するため、
            // struct ラップも single エントリを生成する (struct エントリ型は廃止済み)。
            if ((wrapModel.modelType === "single") || (wrapModel.modelType === "struct")) {
                return { modelType: "single", columnModelId: wrapModel.columnModel.columnModelId };
            }

            return { modelType: "group", columnGroupId: wrapModel.columnGroupModel.columnGroupId };
        });

        const updatingColumnModels = columnWrapModels.flatMap(wrapModel => {
            return (wrapModel.modelType === "group") ? [] : [wrapModel.columnModel];
        });
        const allColumnModelIds = new Set(columnWrapModels.flatMap(wrapModel => {
            if (wrapModel.modelType === "single") {
                return [wrapModel.columnModel.columnModelId];
            }
            if (wrapModel.modelType === "struct") {
                return [];
            }

            return wrapModel.columnGroupModel.columnModelIds;
        }));

        const updatedUniqueKeys = TableUniqueKeysModel.filterColumns(
            uniqueKeysModels, column => allColumnModelIds.has(column.columnModelId));
        const updatedTableIndex = TableIndexModel.filterColumns(
            tableIndexModels, column => allColumnModelIds.has(column.columnModelId));

        // TableModel 生成に必要な情報
        const columnParams = {
            columnEntries: columnEntries,
            uniqueKeysModels: updatedUniqueKeys.tableUniqueKeysModels,
            tableIndexModels: updatedTableIndex.tableIndexModels,
            checkExpression: checkExpression.trim(),
            characterSet: (database.supportsTableCollate && database.editableCharacterSet)
                ? tableOption.characterSet : "",
            collate: database.supportsTableCollate ? tableOption.collate : "",
            definitionExpression: tableOption.definitionExpression,
            optionExpression: tableOption.optionExpression
        };

        return { columnParams, updatingColumnModels };
    };

    return { tabPanel, isValidColumn, handleColumnCompleted };
};

const explanationForExpression = (<>
    Use {"${column_name}"} to reference a column&apos;s physical name (e.g., {"${price} > ${cost}"}).<br />
    Placeholders are resolved at export time, so this expression always reflects the column&apos;s current physical name.
    Renaming a column — or updating a shared column definition used across multiple tables —
    is automatically reflected without any manual edits.<br />
    If a column has an override physical name configured, specify that override name in the placeholder.
</>);

type TableNamePanelProps = {
    label: string
    value: string,
    setValue: (event: React.ChangeEvent<HTMLInputElement>) => void
    onEnterAction?: () => void
}

const TableNamePanel = ({ label, value, setValue, onEnterAction = () => { } }: TableNamePanelProps) => {
    const handleKeyDown = initHandleEnterKeyDown(onEnterAction);

    return (
        <TextField fullWidth required variant="outlined" sx={{ flex: 5 }}
            label={label} value={value} onChange={setValue} onKeyDown={handleKeyDown} />
    );
};

type TableExtraOption = ExtraOption & { definitionExpression: string }

type TableExtraOptionPanelProps = {
    extraOption: TableExtraOption,
    database: Database,
    onUpdateExtraOption: (updateFunction: (prevOptions: TableExtraOption) => TableExtraOption) => void
};

const initExtraOptionPanel = ({ extraOption, database, onUpdateExtraOption }: TableExtraOptionPanelProps) => {
    const handleChangeDefinitionExpression = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        onUpdateExtraOption(previous => {
            if (previous.definitionExpression === value) {
                return previous;
            }

            return { ...previous, definitionExpression: value };
        });
    };

    const handleChangeOptionExpression = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        onUpdateExtraOption(previous => {
            if (previous.optionExpression === value) {
                return previous;
            }

            return { ...previous, optionExpression: value };
        });
    };

    const expressionPanel = (
        <Stack direction="column" spacing={2}>
            <Stack direction="column">
                <Typography variant="subtitle2" sx={{ color: "text.primary" }}>Other Definition Expression</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Appended inside the column list in exported DDL:
                    </Typography>
                    <Typography variant="overline" sx={{ color: "text.primary" }}>
                        {'`CREATE TABLE ( ... <expression>) ...`'}
                    </Typography>
                </Stack>
                <TextField size="small" fullWidth variant="outlined" multiline minRows={2}
                    value={extraOption.definitionExpression} onChange={handleChangeDefinitionExpression} />
            </Stack>

            <Stack direction="column">
                <Typography variant="subtitle2" sx={{ color: "text.primary" }}>Other Table Option Expression</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Appended after the column list in exported DDL:
                    </Typography>
                    <Typography variant="overline" sx={{ color: "text.primary" }}>
                        {'`CREATE TABLE ( ... ) ... <expression>`'}
                    </Typography>
                </Stack>
                <TextField size="small" fullWidth variant="outlined" multiline minRows={2}
                    value={extraOption.optionExpression} onChange={handleChangeOptionExpression} />
            </Stack>
        </Stack>
    );

    return (
        <Stack direction="column" spacing={2} sx={{ paddingLeft: 2, paddingRight: 2 }}>
            {initOptionCollatePanel({ optionType: "table", extraOption, database, onUpdateExtraOption })}

            <Alert variant="outlined" severity="warning">
                <Typography variant="body2" sx={{ paddingBottom: 2 }}>
                    These expressions are embedded directly into the exported DDL without any validation or evaluation.
                    This is an advanced feature — please verify that the expressions are syntactically correct
                    for your database before use.
                </Typography>
                {expressionPanel}
            </Alert>
        </Stack>
    );
};

export default TableEditView;
