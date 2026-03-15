import React from "react";
import {
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from "@mui/material";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { initHandleCloseDialog } from "~/features/editor/support";
import ErdDocument from "~/models/ErdDocument";
import PerspectiveModel from "~/models/PerspectiveModel";

type PerspectiveSettingViewProps = {
    isOpen: boolean;
    targetId: string;
    onClose: () => void;
};

const PerspectiveSettingView = ({ isOpen, targetId, onClose }: PerspectiveSettingViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();
    const erdSettingModel = erdDocument.erdSettingModel;
    const perspectives = erdSettingModel.getPerspectiveModels();

    const [selectedPerspectiveIds, setSelectedPerspectiveIds] = React.useState(
        new Set(perspectives
            .filter(perspective => perspective.containsModel(targetId))
            .map(perspective => perspective.perspectiveId)
        )
    );

    const initRecord = (perspective: PerspectiveModel) => {
        const isChecked = selectedPerspectiveIds.has(perspective.perspectiveId);
        const handleChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
            event.stopPropagation();

            const checked = event.target.checked;
            setSelectedPerspectiveIds(perviousIds => {
                const nextIds = new Set(perviousIds);
                if (checked) {
                    nextIds.add(perspective.perspectiveId);
                } else {
                    nextIds.delete(perspective.perspectiveId);
                }

                return nextIds;
            });
        };

        return (
            <TableRow key={`perspective-setting-table_${perspective.perspectiveId}`}
                sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
                <TableCell>{perspective.perspectiveName}</TableCell>
                <TableCell>{perspective.description}</TableCell>
                <TableCell align="center">
                    <Checkbox checked={isChecked} onChange={handleChanged} />
                </TableCell>
            </TableRow>
        );
    };

    const handleChangedAll = (event: React.ChangeEvent<HTMLInputElement>) => {
        event.stopPropagation();

        const checked = event.target.checked;
        const nextSelectedIds = checked
            ? perspectives.map(perspective => perspective.perspectiveId) : [];
        setSelectedPerspectiveIds(new Set(nextSelectedIds));
    };

    const perspectiveTable = (
        <TableContainer>
            <Table stickyHeader size="small" style={{ tableLayout: "fixed" }}>
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="center">
                            <Checkbox onChange={handleChangedAll} /> Visible
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {perspectives.map(perspective => initRecord(perspective))}
                </TableBody>
            </Table>
        </TableContainer>
    );

    const handleCompleted = () => {
        const changedPerspectives: { before: PerspectiveModel, after: PerspectiveModel }[] = [];
        const nextPerspectives = perspectives.map(perspective => {
            const beforeContained = perspective.containsModel(targetId);
            const afterContained = selectedPerspectiveIds.has(perspective.perspectiveId);
            if (beforeContained === afterContained) {
                return perspective;
            }

            const action = afterContained ? "add" : "remove";
            const nextPerspective = perspective.updateContainId(targetId, action);
            changedPerspectives.push({ before: perspective, after: nextPerspective });

            return nextPerspective;
        });

        if (changedPerspectives.length > 0) {
            const nextErdSettingModel = erdSettingModel.update({ perspectiveModels: nextPerspectives });

            const loggingMessage = "Update perspective setting: " +
                JSON.stringify({ perspectives: changedPerspectives });
            documentsHolder.updateErdSetting(nextErdSettingModel, loggingMessage);
        }

        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="md" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Setting Perspective</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    {perspectiveTable}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleCompleted}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

export default PerspectiveSettingView;