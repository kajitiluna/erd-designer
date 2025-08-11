import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField } from "@mui/material";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ErdDocument from "~/models/ErdDocument";
import { ColumnWrapModel, initHandleCloseDialog, initHandleEnterKeyDown } from "~/features/editor/support";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnViewTable from "~/features/editor/ColumnViewTable";

type ColumnGroupEditDialogProps = {
    isOpen: boolean,
    columnGroup: ColumnGroupModel,
    onClose: () => void
};

const ColumnGroupEditDialog = ({ isOpen, columnGroup, onClose }: ColumnGroupEditDialogProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [columnShareModelStorage, setColumnShareModelStorage] = React.useState(erdDocument.getColumnShareModelStorage());

    const [groupName, setGroupName] = React.useState<string>(columnGroup.groupName);
    const [columnWrapModels, setColumnWrapModels] = React.useState<ColumnWrapModel[]>(
        initColumnWrapModels(erdDocument, columnGroup)
    );
    const [description, setDescription] = React.useState<string>(columnGroup.description);

    const editValueValidated = (groupName.trim().length > 0) && (columnWrapModels.length > 0);

    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const updatingColumnModels = columnWrapModels
            .filter(wrapModel => (wrapModel.modelType === "single"))
            .map(wrapModel => wrapModel.columnModel);
        const updatingColumnGroup = new ColumnGroupModel({
            columnGroupId: columnGroup.columnGroupId,
            groupName: groupName,
            columnModelIds: updatingColumnModels.map(columnModel => columnModel.columnModelId),
            description: description
        });

        documentsHolder.updateColumnGroup(
            updatingColumnGroup, updatingColumnModels, columnShareModelStorage
        );

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <ColumnShareModelStorageContext.Provider value={{
            columnShareModelStorage: columnShareModelStorage,
            updateStorage: (updating: ColumnShareModelStorage) => setColumnShareModelStorage(updating)
        }}>
            <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
                open={isOpen} onClose={initHandleCloseDialog(onClose)}>
                <DialogTitle>Edit Column Group</DialogTitle>
                <DialogContent>
                    <Stack spacing={3}>
                        <Divider />
                        <TextField fullWidth required variant="outlined" label="GroupName"
                            value={groupName} onChange={event => setGroupName(event.target.value)}
                            onKeyDown={handleEnterDown} />
                        <ColumnViewTable
                            columnWrapModels={columnWrapModels}
                            availableColumnGroup={false}
                            isChildRelation={() => false}
                            isEditableColumnType={() => true}
                            onUpdateColumnWrapModels={setColumnWrapModels} />
                        <TextField variant="outlined" id="description" label="Description" multiline rows={3}
                            sx={{ '& .MuiInputBase-root': { resize: 'vertical', overflow: 'auto' } }}
                            value={description} onChange={(event) => setDescription(event.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="contained" disabled={!editValueValidated} onClick={handleCompleted}>OK</Button>
                </DialogActions>
            </Dialog>
        </ColumnShareModelStorageContext.Provider>
    );
};

const initColumnWrapModels = (erdDocument: ErdDocument, columnGroup: ColumnGroupModel): ColumnWrapModel[] => {
    return columnGroup.columnModelIds
        .map(columnModelId => erdDocument.findColumnModel(columnModelId))
        .filter(columnModel => (columnModel != null))
        .map(columnModel => ({ modelType: "single", columnModel: columnModel }));
};

export default ColumnGroupEditDialog;