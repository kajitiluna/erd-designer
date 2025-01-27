import { v4 as uuidV4 } from 'uuid';

import React, { MouseEvent, useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import RelationModel, { CardinalityType, TableReferenceActionType } from "~/models/database/RelationModel";
import RelationPair from "~/models/database/RelationPair";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import RelationViewModel from "~/models/RelationViewModel";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import { initHandleChangePhysicalName } from '~/features/editor/support';

type RelationEditViewProps = {
    isOpen: boolean,
    relationViewModel: RelationViewModel,
    parentTableModel: TableModel,
    childTableModel: TableModel,
    onClose: () => void
};

const RelationEditView = ({ isOpen, relationViewModel, parentTableModel, childTableModel, onClose }: RelationEditViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const relationModel: RelationModel = relationViewModel.relationModel;

    const parentPrimaryColumns: ColumnModel[] = parentTableModel.columnModelIds
        .map((columnModelId) => erdDocument.findColumnModel(columnModelId))
        .filter((columnModel): columnModel is ColumnModel =>
            (columnModel != null) && (columnModel.primaryKey));

    const previousRelationMap = new Map(relationModel.relationPairs.map(
        (pair) => [pair.parentColumnModelId, pair.childColumnModelId])
    );

    const [relationName, setRelationName] = useState<string>(relationModel.relationName);
    const [relationPairs, setRelationPairs] = useState<RelationPair[]>(
        parentPrimaryColumns.map((primaryColumn) => new RelationPair({
            parentColumnModelId: primaryColumn.columnModelId,
            childColumnModelId: previousRelationMap.get(primaryColumn.columnModelId) || ""
        }))
    );
    const [parentCardinality, setParentCardinality] = useState<CardinalityType>(relationModel.parentCardinality);
    const [childCardinality, setChildCardinality] = useState<CardinalityType>(relationModel.childCardinality);
    const [updateActionType, setUpdateActionType] = useState<TableReferenceActionType>(relationModel.onUpdateAction);
    const [deleteActionType, setDeleteActionType] = useState<TableReferenceActionType>(relationModel.onDeleteAction);

    if (parentPrimaryColumns.length === 0) {
        // 親テーブルに primary key が存在しないので中断
        onClose();
        return (<></>);
    }

    const editValueValidated = (relationPairs.length > 0)
        && relationPairs.every((pair) => pair.childColumnModelId !== "");

    const handleComplated = (event: MouseEvent) => {
        if (editValueValidated === false) {
            return;
        }

        event.stopPropagation();

        const nextRelationPairs = relationPairs.map((pair) => {
            if (pair.childColumnModelId !== INDICATING_FOR_NEW_COLUMN) {
                return pair;
            }

            return new RelationPair({
                parentColumnModelId: pair.parentColumnModelId,
                childColumnModelId: uuidV4()
            });
        });

        const nextRelationModel = new RelationModel({
            relationModelId: relationViewModel.relationId,
            relationName: relationName,
            parentTableModelId: parentTableModel.tableModelId,
            parentCardinality: parentCardinality,
            childTableModelId: childTableModel.tableModelId,
            childCardinality: childCardinality,
            relationPairs: nextRelationPairs,
            onUpdateAction: updateActionType,
            onDeleteAction: deleteActionType
        });

        documentsHolder.updateRelationModel(nextRelationModel);
        onClose();
    };

    const handleCloseDialog = (event: MouseEvent) => {
        event.stopPropagation();
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="md" open={isOpen} onClose={handleCloseDialog}>
            <DialogTitle>Edit Relation</DialogTitle>
            <DialogContent>
                <Stack direction="column" spacing={3}>
                    <Divider />
                    <TextField variant="outlined" id="relationName" label="Relation Name"
                        value={relationName} onChange={initHandleChangePhysicalName(setRelationName)} />
                    <RelationReferencesPanel
                        erdDocument={erdDocument}
                        parentTableModel={parentTableModel}
                        childTableModel={childTableModel}
                        parentPrimaryColumns={parentPrimaryColumns}
                        relationPairs={relationPairs}
                        updateRelatinPairs={setRelationPairs} />
                    <RelationCandidatePanel
                        parentCardinality={parentCardinality} onUpdateParentCardinality={setParentCardinality}
                        childCardinality={childCardinality} onUpdateChildCardinality={setChildCardinality} />
                    <RelationActionPanel
                        updateActionType={updateActionType} onUpdateActionType={setUpdateActionType}
                        deleteActionType={deleteActionType} onDeleteActionType={setDeleteActionType} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button variant="contained" disabled={!editValueValidated} onClick={handleComplated}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

type RelationReferencesPanelProps = {
    erdDocument: ErdDocument,
    parentTableModel: TableModel,
    childTableModel: TableModel,
    parentPrimaryColumns: ColumnModel[],
    relationPairs: RelationPair[],
    updateRelatinPairs: (updateFunction: (previous: RelationPair[]) => RelationPair[]) => void
};

const RelationReferencesPanel = ({
    erdDocument, parentTableModel, childTableModel, parentPrimaryColumns,
    relationPairs, updateRelatinPairs
}: RelationReferencesPanelProps) => {

    const childColumnPairs = childTableModel.columnModelIds
        .map((columnModelId) => erdDocument.findColumnModel(columnModelId))
        .filter((columnModel): columnModel is ColumnModel => columnModel != null)
        .map((columnModel) => {
            return {
                columnModel: columnModel,
                columnShareModel: erdDocument.findColumnShareModel(columnModel.columnShareModelId)
            }
        }).filter(
            (pair): pair is { columnModel: ColumnModel, columnShareModel: ColumnShareModel } =>
                (pair.columnShareModel != null)
        );

    const initRelationRow = (primaryColumn: ColumnModel, index: number) => {
        const parentColumnShareModel = erdDocument.findColumnShareModel(primaryColumn.columnShareModelId)
        if (parentColumnShareModel == null) {
            return (<></>);
        }

        const creatableNewColumn = (
            childColumnPairs.some(
                (pair) => pair.columnShareModel.physicalName === parentColumnShareModel.physicalName
            ) === false
        )
        const foreignPairs = childColumnPairs.filter((pair) =>
            pair.columnShareModel.matchForReferenceType(parentColumnShareModel)
        );

        const labelId = `label-${primaryColumn.columnShareModelId}`
        const handleChangeForeign = (event: SelectChangeEvent<string>) => {
            updateRelatinPairs((previousPairs) => {
                const nextPairs = previousPairs.map((pair) => {
                    if (pair.parentColumnModelId !== primaryColumn.columnModelId) {
                        return pair
                    }

                    return new RelationPair({
                        parentColumnModelId: pair.parentColumnModelId,
                        childColumnModelId: event.target.value
                    });
                });

                return nextPairs;
            });
        };

        const selector = (creatableNewColumn || (foreignPairs.length > 0)) ? (
            <FormControl fullWidth>
                <InputLabel id={labelId} required>Foreign column</InputLabel>
                <Select size="small" labelId={labelId} id={`selector-${primaryColumn.columnShareModelId}`}
                    label="Foreign column" value={relationPairs[index].childColumnModelId}
                    sx={{ fontSize: "0.95em" }} onChange={handleChangeForeign}>
                    {creatableNewColumn &&
                        <MenuItem value={INDICATING_FOR_NEW_COLUMN}>(Create new column)</MenuItem>
                    }
                    {foreignPairs.map((pair) => (
                        <MenuItem key={pair.columnModel.columnModelId} value={pair.columnModel.columnModelId}>
                            {pair.columnShareModel.logicalName} / {pair.columnShareModel.physicalName}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        ) : (<></>);

        return (
            <TableRow key={primaryColumn.columnShareModelId}>
                <TableCell>{parentColumnShareModel.logicalName} / {parentColumnShareModel.physicalName}</TableCell>
                <TableCell>{selector}</TableCell>
            </TableRow>
        );
    };

    return (
        <Box>
            <Stack direction="column">
                <Typography variant="subtitle1" gutterBottom>References</Typography>
                <Grid container>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>
                            {parentTableModel.logicalName} / {parentTableModel.physicalName}
                        </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>
                            {childTableModel.logicalName} / {childTableModel.physicalName}
                        </Typography>
                    </Grid>
                </Grid>
                <TableContainer>
                    <Table stickyHeader size="small" style={{ tableLayout: "fixed" }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Reference column (Parent)</TableCell>
                                <TableCell>Foreign column (Child)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {parentPrimaryColumns.map(
                                (primaryColumn, index) => initRelationRow(primaryColumn, index)
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>
        </Box>
    );
};

const INDICATING_FOR_NEW_COLUMN = "[[NEW_COLUMN]]";

type RelationCandidatePanelProps = {
    parentCardinality: CardinalityType,
    onUpdateParentCardinality: (updating: CardinalityType) => void,
    childCardinality: CardinalityType,
    onUpdateChildCardinality: (updating: CardinalityType) => void,
};

const RelationCandidatePanel = ({
    parentCardinality, onUpdateParentCardinality, childCardinality, onUpdateChildCardinality
}: RelationCandidatePanelProps) => {
    return (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Stack direction="column">
                <Typography variant="subtitle1" gutterBottom>Cardinality</Typography>
                <Grid container alignItems="center" spacing={2}>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>Parent cardinality</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <CardinalitySelector sourceName="parent"
                            cardinalityType={parentCardinality}
                            setCardinalityType={onUpdateParentCardinality} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>Child cardinality</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <CardinalitySelector sourceName="child"
                            cardinalityType={childCardinality}
                            setCardinalityType={onUpdateChildCardinality} />
                    </Grid>
                </Grid>
            </Stack>
        </Paper>
    );
};

type CardinalitySelectorProps = {
    sourceName: "parent" | "child",
    cardinalityType: CardinalityType,
    setCardinalityType: (value: CardinalityType) => void
}

const CARDINALITY_TYPES: CardinalityType[] = ["1", "0..1", "0..N", "1..N"];

const CardinalitySelector = ({ sourceName, cardinalityType, setCardinalityType }: CardinalitySelectorProps) => {
    const labelId = `cardinality-label-${sourceName}`;
    const labelValue = `${sourceName} cardinality`;

    return (
        <FormControl fullWidth>
            <InputLabel id={labelId}>{labelValue}</InputLabel>
            <Select size="small" labelId={labelId} id={`cardinality-selector-${sourceName}`}
                label={labelValue} value={cardinalityType}
                onChange={(event) => setCardinalityType(event.target.value as CardinalityType)}>
                {CARDINALITY_TYPES.map((cardinality) => (
                    <MenuItem key={cardinality} value={cardinality}>{cardinality}</MenuItem>
                ))}
            </Select>
        </FormControl>
    );
};

type TableReferenceActionTypeProps = {
    updateActionType: TableReferenceActionType,
    onUpdateActionType: (value: TableReferenceActionType) => void,
    deleteActionType: TableReferenceActionType,
    onDeleteActionType: (value: TableReferenceActionType) => void
};

const RelationActionPanel = ({
    updateActionType, onUpdateActionType, deleteActionType, onDeleteActionType
}: TableReferenceActionTypeProps) => {
    return (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Stack direction="column">
                <Typography variant="subtitle1" gutterBottom>Actions</Typography>
                <Grid container alignItems="center" spacing={2}>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>ON UPDATE</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <ReferenceActionSelector actionName="update"
                            actionType={updateActionType}
                            setActionType={onUpdateActionType} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>ON DELETE</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <ReferenceActionSelector actionName="delete"
                            actionType={deleteActionType}
                            setActionType={onDeleteActionType} />
                    </Grid>
                </Grid>
            </Stack>
        </Paper>
    );
};

type ReferenceActionSelectorProps = {
    actionName: "update" | "delete",
    actionType: TableReferenceActionType,
    setActionType: (value: TableReferenceActionType) => void
};

const REFERENCE_TYPES: TableReferenceActionType[] = [
    "RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT"
]

const ReferenceActionSelector = ({ actionName, actionType, setActionType }: ReferenceActionSelectorProps) => {
    const labelId = `reference-label-on-${actionName}`;
    const labelValue = `ON ${actionName.toUpperCase()}`;

    return (
        <FormControl fullWidth>
            <InputLabel id={labelId}>{labelValue}</InputLabel>
            <Select size="small" labelId={labelId} id={`reference-selector-on-${actionName}`}
                label={labelValue} value={actionType}
                onChange={(event) => setActionType(event.target.value as TableReferenceActionType)}>
                {REFERENCE_TYPES.map((referenceType) => (
                    <MenuItem key={referenceType} value={referenceType}>{referenceType}</MenuItem>
                ))}
            </Select>
        </FormControl>
    );
};

export default RelationEditView;
