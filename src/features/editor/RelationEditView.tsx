import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack,
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
import { initHandleChangePhysicalName, initHandleCloseDialog, initHandleEnterKeyDown } from '~/features/editor/support';
import { overrideColumnName } from '~/models/database/support';
import LabelViewModel from '~/models/LabelViewModel';

type RelationEditViewProps = {
    isOpen: boolean,
    relationViewModel: RelationViewModel,
    parentTableModel: TableModel,
    childTableModel: TableModel,
    onClose: () => void
};

const RelationEditView = ({
    isOpen, relationViewModel, parentTableModel, childTableModel, onClose
}: RelationEditViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const relationModel: RelationModel = relationViewModel.relationModel;
    const parentPrimaryColumns: ColumnModel[] = erdDocument.toAllColumnModels(parentTableModel)
        .filter(columnModel => columnModel.primaryKey);

    const [relationName, setRelationName] = React.useState<string>(relationModel.relationName);
    const [relationPairs, setRelationPairs] = React.useState<RelationPair[]>(() => {
        const previousRelationMap = new Map(relationModel.relationPairs
            .map(pair => [pair.parentColumnModelId, pair.childColumnModelId])
        );

        return parentPrimaryColumns.map(primaryColumn => new RelationPair({
            parentColumnModelId: primaryColumn.columnModelId,
            childColumnModelId: previousRelationMap.get(primaryColumn.columnModelId) || ""
        }));
    });
    const [parentCardinality, setParentCardinality] = React.useState<CardinalityType>(relationModel.parentCardinality);
    const [childCardinality, setChildCardinality] = React.useState<CardinalityType>(relationModel.childCardinality);
    const [updateActionType, setUpdateActionType] = React.useState<TableReferenceActionType>(relationModel.onUpdateAction);
    const [deleteActionType, setDeleteActionType] = React.useState<TableReferenceActionType>(relationModel.onDeleteAction);

    const existedPairs = React.useMemo(() => {
        return new Set(
            erdDocument.getRelationViewModels()
                .filter(relation => (relation.relationId !== relationViewModel.relationId))
                .map(relation => initComparableValue(relation.relationModel.relationPairs))
        );
    }, []);

    if (parentPrimaryColumns.length === 0) {
        // 親テーブルに primary key が存在しないので中断
        console.warn(`No primary key columns in parent table: ${parentTableModel.physicalName}`);

        onClose();
        return (<></>);
    }

    const editValueValidated = (relationPairs.length > 0)
        && relationPairs.every(pair => pair.childColumnModelId !== "")
        && (existedPairs.has(initComparableValue(relationPairs)) === false);

    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const nextRelationPairs = relationPairs.map(pair => {
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

        const labelModel = relationViewModel.labelViewModel;
        const nextLabelModel = (relationName === labelModel.label)
            ? labelModel : new LabelViewModel({ ...labelModel, label: relationName });

        const nextRelationView = new RelationViewModel({
            ...relationViewModel,
            relationModel: nextRelationModel,
            labelViewModel: nextLabelModel
        });

        const loggingMessage = "Update Relation. " +
            JSON.stringify({ before: relationModel, after: nextRelationModel });
        documentsHolder.updateRelation(nextRelationView, loggingMessage);
        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <Dialog fullWidth maxWidth="md" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit Relation</DialogTitle>
            <DialogContent>
                <Stack direction="column" spacing={3}>
                    <Divider />
                    <TextField variant="outlined" id="relationName" label="Relation Name"
                        value={relationName} onChange={initHandleChangePhysicalName(setRelationName)}
                        onKeyDown={handleEnterDown} />
                    <RelationReferencesPanel
                        erdDocument={erdDocument}
                        parentTableModel={parentTableModel}
                        childTableModel={childTableModel}
                        parentPrimaryColumns={parentPrimaryColumns}
                        relationPairs={relationPairs}
                        updateRelationPairs={setRelationPairs} />
                    {(parentTableModel.tableModelId === childTableModel.tableModelId) && (
                        <Alert>
                            To create a self-referencing relation,
                            add the child column to this table first, then link it here.
                        </Alert>
                    )}
                    <RelationCardinalityPanel
                        parentCardinality={parentCardinality} onUpdateParentCardinality={setParentCardinality}
                        childCardinality={childCardinality} onUpdateChildCardinality={setChildCardinality} />
                    <RelationActionPanel
                        updateActionType={updateActionType} onUpdateActionType={setUpdateActionType}
                        deleteActionType={deleteActionType} onDeleteActionType={setDeleteActionType} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!editValueValidated} onClick={handleCompleted}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

const initComparableValue = (relationPairs: readonly RelationPair[]) =>
    [...relationPairs].sort((first, second) => first.parentColumnModelId.localeCompare(second.parentColumnModelId))
        .map(pair => `${pair.parentColumnModelId}:${pair.childColumnModelId}`)
        .join(",");

type RelationReferencesPanelProps = {
    erdDocument: ErdDocument,
    parentTableModel: TableModel,
    childTableModel: TableModel,
    parentPrimaryColumns: ColumnModel[],
    relationPairs: RelationPair[],
    updateRelationPairs: (updateFunction: (previous: RelationPair[]) => RelationPair[]) => void
};

const RelationReferencesPanel = ({
    erdDocument, parentTableModel, childTableModel, parentPrimaryColumns, relationPairs, updateRelationPairs
}: RelationReferencesPanelProps) => {

    const displayStyle = erdDocument.getDisplayStyle();
    const childColumnDetails = erdDocument.toAllColumnModels(childTableModel)
        .map(columnModel => {
            const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
            if (columnShareModel == null) {
                return null;
            }

            const columnName = overrideColumnName(columnModel, columnShareModel);

            return { columnModel, columnShareModel, columnName };
        })
        .filter(pair => (pair != null));

    const initRelationRow = (primaryColumn: ColumnModel, targetIndex: number) => {
        const parentColumnShareModel = erdDocument.findColumnShareModel(primaryColumn.columnShareModelId)
        if (parentColumnShareModel == null) {
            return (<></>);
        }

        const parentColumnName = overrideColumnName(primaryColumn, parentColumnShareModel);

        // 子カラムを新規作成する際、親カラムと同じ物理名で作成するため、
        // 既に親カラムと同じカラムが存在する場合は、新規作成できないよう制限する
        const creatableNewColumn = (
            childColumnDetails.some(childColumn =>
                (childColumn.columnName.physicalName === parentColumnName.physicalName)
            ) === false
        )

        // 外部キー制約を指定できるのは、型定義が同一のカラムのみ。ただし、自己参照の場合、同じカラムは指定できない。
        const foreignDetails = childColumnDetails.filter(childPair =>
            childPair.columnShareModel.matchForReferenceType(parentColumnShareModel) &&
            (primaryColumn.columnModelId !== childPair.columnModel.columnModelId)
        );

        const labelId = `label-${primaryColumn.columnShareModelId}`
        const handleChangeForeign = (event: SelectChangeEvent<string>) => {
            updateRelationPairs(previousPairs => {
                const nextPairs = previousPairs.map(pair => {
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

        const selector = (creatableNewColumn || (foreignDetails.length > 0)) ? (
            <FormControl fullWidth>
                <InputLabel id={labelId} required>Foreign column</InputLabel>
                <Select size="small" labelId={labelId} id={`selector-${primaryColumn.columnShareModelId}`}
                    label="Foreign column" value={relationPairs[targetIndex].childColumnModelId}
                    sx={{ fontSize: "0.95em" }} onChange={handleChangeForeign}>
                    {creatableNewColumn &&
                        <MenuItem value={INDICATING_FOR_NEW_COLUMN}>(Create new column)</MenuItem>
                    }
                    {foreignDetails.map(childColumn => (
                        <MenuItem key={childColumn.columnModel.columnModelId}
                            value={childColumn.columnModel.columnModelId}>
                            {displayStyle.displayName(
                                childColumn.columnName.physicalName, childColumn.columnName.logicalName)}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        ) : (<Alert severity="warning">No columns can be associated.</Alert>);

        return (
            <TableRow key={primaryColumn.columnShareModelId}>
                <TableCell>
                    {displayStyle.displayName(parentColumnName.physicalName, parentColumnName.logicalName)}
                </TableCell>
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
                            {displayStyle.displayName(parentTableModel.physicalName, parentTableModel.logicalName)}
                        </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <Typography variant="body2" gutterBottom>
                            {displayStyle.displayName(childTableModel.physicalName, childTableModel.logicalName)}
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

type RelationCardinalityPanelProps = {
    parentCardinality: CardinalityType,
    onUpdateParentCardinality: (updating: CardinalityType) => void,
    childCardinality: CardinalityType,
    onUpdateChildCardinality: (updating: CardinalityType) => void,
};

const RelationCardinalityPanel = ({
    parentCardinality, onUpdateParentCardinality, childCardinality, onUpdateChildCardinality
}: RelationCardinalityPanelProps) => {
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
