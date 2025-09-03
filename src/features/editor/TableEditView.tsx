import React from "react";
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, Tab, Tabs, TextField
} from "@mui/material";

import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnViewTable from "~/features/editor/ColumnViewTable";
import IndexViewTable from "~/features/editor/IndexViewTable";
import {
    ColumnWrapModel, initHandleChangeWithSyncPhysicalName,
    initHandleCloseDialog, initHandleEnterKeyDown
} from "~/features/editor/support";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import { overrideColumnName } from "~/models/database/support";
import TableIndexModel from "~/models/database/TableIndexModel";
import TableModel, { ColumnModelType } from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";
import TableUniqueKeysModel from "~/models/database/TableUniqueKeysModel";

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

        const columnCount = columnWrapModels.flatMap(columnWrapModel =>
            (columnWrapModel.modelType === "single")
                ? [columnWrapModel.columnModel] : columnWrapModel.columnModels)
            .length;

        const columnNameSet = new Set<string>(columnWrapModels
            .flatMap(wrapModel => (wrapModel.modelType === "single")
                ? [wrapModel.columnModel] : wrapModel.columnModels
            ).map(columnModel => {
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

        const columns: ColumnModelType[] = columnWrapModels.map(wrapModel =>
            (wrapModel.modelType === "single")
                ? { modelType: "single", columnModelId: wrapModel.columnModel.columnModelId }
                : { modelType: "group", columnGroupId: wrapModel.columnGroupModel.columnGroupId }
        );
        const updatingColumnModels = columnWrapModels
            .flatMap(wrapModel => (wrapModel.modelType === "single") ? [wrapModel.columnModel] : []);
        const allColumnModelIds = new Set(columnWrapModels
            .flatMap(wrapModel => (wrapModel.modelType === "single")
                ? [wrapModel.columnModel.columnModelId]
                : wrapModel.columnGroupModel.columnModelIds));

        const updatedUniqueKeys = TableUniqueKeysModel.filterColumns(
            uniqueKeysModels, column => allColumnModelIds.has(column.columnModelId));
        const updatedTableIndex = TableIndexModel.filterColumns(
            tableIndexModels, column => allColumnModelIds.has(column.columnModelId));

        const nextTableModel = new TableModel({
            tableModelId: tableModel.tableModelId,
            physicalName: physicalTableName,
            logicalName: logicalTableName,
            schemaId: schemaId,
            columns: columns,
            uniqueKeysModels: updatedUniqueKeys.tableUniqueKeysModels,
            tableIndexModels: updatedTableIndex.tableIndexModels,
            description: description
        });
        const nextTableViewModel = new TableViewModel({
            tableModel: nextTableModel,
            corner: tableViewModel.corner,
            headerColor: tableViewModel.headerColor
        });

        documentsHolder.updateTableViewModel(
            nextTableViewModel, updatingColumnModels, columnShareModelStorage
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

    // TODO 複合一意キー指定
    const tabPanel = (<>
        <Tabs value={tabIndex} onChange={(_, newValue) => setTabIndex(newValue)}>
            <Tab label="Column" />
            <Tab label={`Index (${tableIndexModels.length})`} disabled={columnWrapModels.length === 0} />
        </Tabs>
        <div hidden={tabIndex !== 0}>
            <ColumnViewTable
                columnWrapModels={columnWrapModels}
                availableColumnGroup={true}
                isChildRelation={isChildRelation}
                isEditableColumnType={isEditableColumnType}
                onUpdateColumnWrapModels={setColumnWrapModels} />
        </div>
        <div hidden={tabIndex !== 1}>
            <IndexViewTable
                database={erdDocument.getDatabase()}
                columnWrapModels={columnWrapModels}
                tableIndexModels={tableIndexModels}
                isChildRelation={isChildRelation}
                onUpdateTableIndexModels={setTableIndexModels} />
        </div>
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
                        <TextField variant="outlined"
                            id="description" label="Description" multiline rows={3}
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

const initColumnWrapModels = (erdDocument: ErdDocument, tableModel: TableModel): ColumnWrapModel[] => {
    return tableModel.columns.map(column => {
        if (column.modelType === "single") {
            return {
                modelType: "single",
                columnModel: erdDocument.findColumnModel(column.columnModelId) as ColumnModel
            };
        }

        const columnGroupModel = erdDocument.findColumnGroupModel(column.columnGroupId) as ColumnGroupModel;
        const columnModels = columnGroupModel.columnModelIds
            .map(columnModelId => erdDocument.findColumnModel(columnModelId))
            .filter((columnModel): columnModel is ColumnModel => (columnModel != null));

        return {
            modelType: "group",
            columnGroupModel: columnGroupModel,
            columnModels: columnModels
        };
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

export default TableEditView;
