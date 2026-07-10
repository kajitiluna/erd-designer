import React from "react";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material";

import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import { Database } from "~/models/database";
import { overrideColumnName } from "~/models/database/support";
import TableIndexModel from "~/models/database/TableIndexModel";
import TableModel, { ColumnEntry } from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";
import TableUniqueKeysModel from "~/models/database/TableUniqueKeysModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnViewTable from "~/features/editor/ColumnViewTable";
import IndexGridView from "~/features/editor/IndexGridView";
import {
    ColumnWrapModel, initHandleChangeWithSyncPhysicalName,
    initHandleCloseDialog, initHandleEnterKeyDown
} from "~/features/editor/support";
import UniqueKeysGridView from "~/features/editor/UniqueKeysGridView";
import { ExtraOption, initOptionCollatePanel } from "~/features/editor/view-support";

type TableEditViewProps = {
    isOpen: boolean,
    tableViewModel: TableViewModel,
    onClose: () => void
};

const TableEditView = ({ isOpen, tableViewModel, onClose }: TableEditViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [columnShareModelStorage, setColumnShareModelStorage]
        = React.useState(erdDocument.getColumnShareModelStorage());

    const tableModel: TableModel = tableViewModel.tableModel;
    const [schemaId, setSchemaId] = React.useState<string>(tableModel.schemaId);
    const [physicalTableName, setPhysicalTableName] = React.useState<string>(tableModel.physicalName);
    const [logicalTableName, setLogicalTableName] = React.useState<string>(tableModel.logicalName);
    const [columnWrapModels, setColumnWrapModels]
        = React.useState<ColumnWrapModel[]>(initColumnWrapModels(erdDocument, tableModel));
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
    const [description, setDescription] = React.useState<string>(tableModel.description);

    const [tabIndex, setTabIndex] = React.useState<number>(0);

    // 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する
    const handleChangePhysicalName = initHandleChangeWithSyncPhysicalName({
        physicalName: physicalTableName, setPhysicalName: setPhysicalTableName,
        logicalName: logicalTableName, setLogicalName: setLogicalTableName
    });

    // 物理名に重複がないことをチェックする
    const validateColumnModels = (columnWrapModels: ColumnWrapModel[]) => {
        if (columnWrapModels.length === 0) {
            return true;
        }

        const memberColumnModels = toMemberColumnModels(columnWrapModels);
        const columnCount = memberColumnModels.length;

        const columnNameSet = new Set<string>(memberColumnModels
            .map(columnModel => {
                const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
                if (columnShareModel == null) {
                    return null;
                }

                const columnName = overrideColumnName(columnModel, columnShareModel);
                return columnName.physicalName;
            }).filter(physicalName => physicalName != null)
        );

        return columnNameSet.size === columnCount;
    };
    const editValueValidated = (physicalTableName.length > 0) && (logicalTableName.length > 0)
        && validateColumnModels(columnWrapModels);

    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const columnEntries: ColumnEntry[] = columnWrapModels.map(wrapModel => {
            if (wrapModel.modelType === "single") {
                return { modelType: "single", columnModelId: wrapModel.columnModel.columnModelId };
            }
            if (wrapModel.modelType === "struct") {
                return { modelType: "struct", columnStructId: wrapModel.columnStructModel.columnStructId };
            }

            return { modelType: "group", columnGroupId: wrapModel.columnGroupModel.columnGroupId };
        });

        const updatingColumnModels = columnWrapModels
            .flatMap(wrapModel => (wrapModel.modelType === "single") ? [wrapModel.columnModel] : []);
        const allColumnModelIds = new Set(columnWrapModels
            .flatMap(wrapModel => {
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

        const nextTableModel = new TableModel({
            tableModelId: tableModel.tableModelId,
            physicalName: physicalTableName,
            logicalName: logicalTableName,
            schemaId: schemaId,
            columnEntries: columnEntries,
            uniqueKeysModels: updatedUniqueKeys.tableUniqueKeysModels,
            tableIndexModels: updatedTableIndex.tableIndexModels,
            description: description,
            checkExpression: checkExpression.trim(),
            characterSet: (database.supportsTableCollate && database.editableCharacterSet)
                ? tableOption.characterSet : "",
            collate: database.supportsTableCollate ? tableOption.collate : "",
            definitionExpression: tableOption.definitionExpression,
            optionExpression: tableOption.optionExpression
        });
        const nextTableViewModel = new TableViewModel({
            tableModel: nextTableModel,
            corner: tableViewModel.corner,
            headerColor: tableViewModel.headerColor
        });

        const message = "Update table model. " +
            JSON.stringify({ before: tableViewModel.tableModel, after: nextTableModel });
        documentsHolder.updateTableViewModel(
            nextTableViewModel, updatingColumnModels, columnShareModelStorage, message
        );

        onClose();
    };

    const database = erdDocument.getDatabase();
    const schemaConfig = erdDocument.schemaConfig;
    const handleChangeSchema = (event: SelectChangeEvent) => {
        const nextValue = event.target.value;
        setSchemaId(nextValue);
    };

    const definitionPanel = (
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

    const isChildRelation = (columnModelId: string) =>
        erdDocument.inChildRelation(tableModel.tableModelId, columnModelId);
    const isEditableColumnType = (columnModel: ColumnModel) => {
        const parentRelation = erdDocument.findParentRelation(tableModel.tableModelId, columnModel.columnModelId)
        if (parentRelation == null) {
            return true;
        }

        const parentColumnModel = erdDocument.findColumnModel(parentRelation.columnModelId);
        if (parentColumnModel == null) {
            return true;
        }

        return (parentColumnModel.columnShareModelId === columnModel.columnShareModelId);
    };

    const hasOtherOption = tableOption.characterSet || tableOption.collate ||
        tableOption.definitionExpression || tableOption.optionExpression;

    const showUniqueKeyTab = database.uniqueKeySupport.supportsUniqueKey === true;
    const showIndexTab = database.tableIndexSupport.supportsIndex === true;

    const columnPanel = (
        <ColumnViewTable
            columnWrapModels={columnWrapModels}
            availableColumnGroup={true}
            isChildRelation={isChildRelation}
            isEditableColumnType={isEditableColumnType}
            onUpdateColumnWrapModels={setColumnWrapModels}
            onUpdateCheckExpression={setCheckExpression} />
    );
    const uniqueKeyPanel = (
        <UniqueKeysGridView
            database={database}
            columnWrapModels={columnWrapModels}
            tableUniqueKeysModels={uniqueKeysModels}
            isChildRelation={isChildRelation}
            onUpdateTableUniqueKeysModels={setUniqueKeysModels} />
    );
    const indexPanel = (
        <IndexGridView
            database={database}
            columnWrapModels={columnWrapModels}
            tableIndexModels={tableIndexModels}
            isChildRelation={isChildRelation}
            onUpdateTableIndexModels={setTableIndexModels} />
    );
    const checkPanel = (
        <Stack direction="column" spacing={2}>
            <TextField label="Check Expression" size="small" fullWidth variant="outlined" multiline minRows={4}
                value={checkExpression} onChange={event => setCheckExpression(event.target.value)} />
            <Alert severity="info" variant="outlined">
                <Typography variant="body2" gutterBottom>{explanationForExpression}</Typography>
            </Alert>
        </Stack>
    );
    const otherOptionPanel =
        initExtraOptionPanel({ extraOption: tableOption, database, onUpdateExtraOption: setTableOption });

    type TabEntry = { key: string, tab: React.ReactNode, panel: React.ReactNode };
    const tabEntries: TabEntry[] = [
        { key: "column", tab: <Tab key="column" label="Column" />, panel: columnPanel },
        ...(showUniqueKeyTab ? [{
            key: "uniqueKey",
            tab: <Tab key="uniqueKey" label={`Unique constraint (${uniqueKeysModels.length})`}
                disabled={columnWrapModels.length < 2} />,
            panel: uniqueKeyPanel
        }] : []),
        ...(showIndexTab ? [{
            key: "index",
            tab: <Tab key="index" label={`Index (${tableIndexModels.length})`}
                disabled={columnWrapModels.length === 0} />,
            panel: indexPanel
        }] : []),
        {
            key: "check",
            tab: <Tab key="check" label={`Check${checkExpression ? " (+)" : ""}`} />,
            panel: checkPanel
        },
        {
            key: "otherOption",
            tab: <Tab key="otherOption" label={`Other Option${hasOtherOption ? " (+)" : ""}`} />,
            panel: otherOptionPanel
        }
    ];

    const tabPanel = (<>
        <Tabs value={tabIndex} onChange={(_, newValue) => setTabIndex(newValue)}>
            {tabEntries.map(entry => entry.tab)}
        </Tabs>
        {tabEntries.map((entry, index) => (
            <div key={entry.key} hidden={tabIndex !== index}>{entry.panel}</div>
        ))}
    </>);

    return (
        <ColumnShareModelStorageContext.Provider value={{
            columnShareModelStorage: columnShareModelStorage,
            updateStorage: (updating: ColumnShareModelStorage) => setColumnShareModelStorage(updating)
        }}>
            <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
                open={isOpen} onClose={initHandleCloseDialog(onClose)}>
                <DialogTitle>Edit Table</DialogTitle>
                <DialogContent>
                    <Stack spacing={3}>
                        <Divider />
                        {definitionPanel}
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

const explanationForExpression = (<>
Use {"${column_name}"} to reference a column&apos;s physical name (e.g., {"${price} > ${cost}"}).<br />
Placeholders are resolved at export time, so this expression always reflects the column&apos;s current physical name.
Renaming a column — or updating a shared column definition used across multiple tables —
is automatically reflected without any manual edits.<br />
If a column has an override physical name configured, specify that override name in the placeholder.
</>);

const initColumnWrapModels = (erdDocument: ErdDocument, tableModel: TableModel): ColumnWrapModel[] => {
    return tableModel.columnEntries.flatMap((column): ColumnWrapModel[] => {
        if (column.modelType === "single") {
            return [{
                modelType: "single",
                columnModel: erdDocument.findColumnModel(column.columnModelId) as ColumnModel
            }];
        }

        if (column.modelType === "struct") {
            const columnStructModel = erdDocument.findColumnStructModel(column.columnStructId);
            if (columnStructModel == null) {
                return [];
            }

            return [{
                modelType: "struct",
                columnStructModel: columnStructModel
            }];
        }

        const columnGroupModel = erdDocument.findColumnGroupModel(column.columnGroupId) as ColumnGroupModel;
        const columnModels = columnGroupModel.columnModelIds
            .map(columnModelId => erdDocument.findColumnModel(columnModelId))
            .filter((columnModel): columnModel is ColumnModel => (columnModel != null));

        return [{
            modelType: "group",
            columnGroupModel: columnGroupModel,
            columnModels: columnModels
        }];
    });
};

/**
 * ColumnWrapModel 一覧から、実体を持つ ColumnModel をフラット化して抽出する。
 * single はそのカラム、group はメンバー全て、struct はメンバーなし(0件)として扱う。
 * 物理名重複チェックなど、テーブルに実在するカラムのみを対象とする処理で使用する。
 */
const toMemberColumnModels = (columnWrapModels: ColumnWrapModel[]): ColumnModel[] => {
    return columnWrapModels.flatMap(columnWrapModel => {
        if (columnWrapModel.modelType === "single") {
            return [columnWrapModel.columnModel];
        }
        if (columnWrapModel.modelType === "struct") {
            return [];
        }

        return columnWrapModel.columnModels;
    });
};

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
