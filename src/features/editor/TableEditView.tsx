import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Tab, Tabs, TextField } from "@mui/material";
import React, { useState } from "react";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnViewTable from "~/features/editor/ColumnViewTable";
import IndexViewTable from "~/features/editor/IndexViewTable";
import { initHandleChangeWithSyncPhysicalName } from "~/features/editor/support";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import TableIndexModel from "~/models/database/TableIndexModel";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

type TableEditViewProps = {
    isOpen: boolean,
    tableViewModel: TableViewModel,
    onClose: () => void
};

const TableEditView = ({ isOpen, tableViewModel, onClose }: TableEditViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [columnShareModelStorage, setColumnShareModelStorage] = useState(erdDocument.getColumnShareModelStorage());

    const tableModel: TableModel = tableViewModel.tableModel;
    const [physicalTableName, setPhysicalTableName] = useState<string>(tableModel.physicalName);
    const [logicalTableName, setLogicalTableName] = useState<string>(tableModel.logicalName);
    const [columnModels, setColumnModels] = useState<ColumnModel[]>(
        tableModel.columnModelIds.map(
            columnModelId => erdDocument.findColumnModel(columnModelId) as ColumnModel
        )
    );
    const [tableIndexModels, setTableIndexModels] = useState<TableIndexModel[]>([...tableModel.tableIndexModels]);
    const [description, setDescription] = useState<string>(tableModel.description);

    const [tabIndex, setTabIndex] = useState<number>(0);

    // 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する
    const handleChangePhysicalName = initHandleChangeWithSyncPhysicalName({
        physicalName: physicalTableName, setPhysicalName: setPhysicalTableName,
        logicalName: logicalTableName, setLogicalName: setLogicalTableName
    });

    // 物理名に重複がないことをチェックする
    const validateColumnModels = (columnModels: ColumnModel[]) => {
        if (columnModels.length === 0) {
            return false;
        }

        const columnNameSet = new Set<string>(columnModels
            .map(columnModel => columnShareModelStorage.find(columnModel.columnShareModelId))
            .filter(shareModel => shareModel != null)
            .map(shareModel => (shareModel as ColumnShareModel).physicalName)
        );

        return columnNameSet.size === columnModels.length;
    };
    const editValueValidated = (physicalTableName.length > 0) && (logicalTableName.length > 0)
        && validateColumnModels(columnModels);

    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const columnModelIds = new Set(columnModels.map((model) => model.columnModelId));

        const nextTableModel = new TableModel({
            tableModelId: tableModel.tableModelId,
            physicalName: physicalTableName,
            logicalName: logicalTableName,
            columnModelIds: columnModels.map((model) => model.columnModelId),
            tableIndexModels: tableIndexModels
                .map((tableIndexModel) => new TableIndexModel({
                    tableIndexModelId: tableIndexModel.tableIndexModelId,
                    physicalName: tableIndexModel.physicalName,
                    indexColumnModels: tableIndexModel.indexColumnModels
                        .filter((model) => columnModelIds.has(model.columnModelId)),
                    indexOption: tableIndexModel.indexOption,
                    indexType: tableIndexModel.indexType,
                    description: tableIndexModel.description
                }))
                .filter((tableIndexModel) => tableIndexModel.indexColumnModels.length > 0),
            description: description
        });
        const nextTableViewModel = new TableViewModel({
            tableModel: nextTableModel,
            corner: tableViewModel.corner,
            headerColor: tableViewModel.headerColor
        });

        documentsHolder.updateTableViewModel(nextTableViewModel, columnModels, columnShareModelStorage);

        onClose();
    };

    const tabPanel = (<>
        <Tabs value={tabIndex} onChange={(_, newValue) => setTabIndex(newValue)}>
            <Tab label="Column" />
            <Tab label={`Index (${tableIndexModels.length})`} disabled={columnModels.length === 0} />
        </Tabs>
        <div hidden={tabIndex !== 0}>
            <ColumnViewTable
                columnModels={columnModels}
                onUpdateColumnModels={setColumnModels}
                isChildRelation={(columnModelId: string) => erdDocument.inChildRelation(columnModelId)} />
        </div>
        <div hidden={tabIndex !== 1}>
            <IndexViewTable
                columnModels={columnModels}
                tableIndexModels={tableIndexModels}
                onUpdateTableIndexModels={setTableIndexModels} />
        </div>
    </>);

    return (
        <ColumnShareModelStorageContext.Provider value={{
            columnShareModelStorage: columnShareModelStorage,
            updateStorage: (updating: ColumnShareModelStorage) => setColumnShareModelStorage(updating)
        }}>
            <Dialog fullWidth maxWidth="lg" open={isOpen} sx={{ userSelect: "none" }} onClose={onClose}>
                <DialogTitle>Edit Table</DialogTitle>
                <DialogContent>
                    <Stack spacing={3}>
                        <Divider />
                        <Stack direction="row" spacing={2}>
                            <TableNamePanel label="PhysicalName" value={physicalTableName}
                                setValue={handleChangePhysicalName} />
                            <TableNamePanel label="LogicalName" value={logicalTableName}
                                setValue={(event) => setLogicalTableName(event.target.value)} />
                        </Stack>
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

type TableNamePanelProps = {
    label: string
    value: string,
    setValue: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const TableNamePanel = ({ label, value, setValue }: TableNamePanelProps) => {
    return (
        <TextField fullWidth required variant="outlined"
            label={label} value={value} onChange={setValue} />
    );
};

export default TableEditView;
