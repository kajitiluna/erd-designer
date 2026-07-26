import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField } from "@mui/material";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import ColumnModel from "~/models/database/ColumnModel";
import ErdDocument from "~/models/ErdDocument";
import { ColumnWrapModel, initHandleCloseDialog, initHandleEnterKeyDown } from "~/features/editor/support";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import ColumnViewTable from "~/features/editor/ColumnViewTable";
import ColumnModelStorage from "~/models/ColumnModelStorage";

type ColumnGroupEditDialogProps = {
    isOpen: boolean,
    columnGroup: ColumnGroupModel,
    onClose: () => void
};

const ColumnGroupEditDialog = ({ isOpen, columnGroup, onClose }: ColumnGroupEditDialogProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [columnShareStorage, setColumnShareStorage] = React.useState(erdDocument.getColumnShareModelStorage());
    const [columnStorage, setColumnStorage] = React.useState<ColumnModelStorage>(ColumnModelStorage.create());

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

        const updatingColumnModels = columnWrapModels.flatMap(wrapModel => {
            if (wrapModel.modelType === "group") {
                return [];
            }

            return [wrapModel.columnModel];
        });
        const updatingColumnGroup = new ColumnGroupModel({
            columnGroupId: columnGroup.columnGroupId,
            groupName: groupName,
            columnModelIds: updatingColumnModels.map(columnModel => columnModel.columnModelId),
            description: description
        });

        // struct 編集セッション中に蓄積されたメンバー ColumnModel を合流させる。
        // 同一 id が両方にある場合はグループ直下の最新編集 (updatingColumnModels) を優先する。
        const mergedUpdatingColumns = [...columnStorage.getColumnModels(), ...updatingColumnModels];

        const loggingMessage = "Update Column Group. " +
            JSON.stringify({ before: columnGroup, after: updatingColumnGroup });
        documentsHolder.updateColumnGroup(
            updatingColumnGroup, mergedUpdatingColumns, columnShareStorage, loggingMessage
        );

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <ColumnShareModelStorageContext.Provider value={{
            columnShareStorage: columnShareStorage, updateShareStorage: setColumnShareStorage,
            columnStorage: columnStorage, updateColumnStorage: setColumnStorage
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
                            onUpdateColumnWrapModels={setColumnWrapModels}
                            onUpdateCheckExpression={() => {}} />
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
        .map(columnModel => {
            return ColumnModel.isStructColumn(columnModel)
                ? { modelType: "struct", columnModel: columnModel }
                : { modelType: "single", columnModel: columnModel };
        });
};

export default ColumnGroupEditDialog;