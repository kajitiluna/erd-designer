import React from "react";
import {
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

import {
    initHandleChangePhysicalName, initHandleCloseDialog, initHandleEnterKeyDown,
    SELECTED_CELL_COLOR
} from "~/features/editor/support";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import DbSchemaModel from "~/models/database/DbSchemaModel";
import { handlePreventMouseEvent } from "~/features/canvas/support";
import DbSchemaConfig from "~/models/DbSchemaConfig";
import EdgedIconButton from "~/components/EdgedIconButton";

type DbSchemaViewProps = {
    isOpen: boolean;
    onClose: () => void;
};

const DbSchemaView = ({ isOpen, onClose }: DbSchemaViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();
    const schemaConfig = erdDocument.schemaConfig;

    const [defaultSchemaId, setDefaultSchemaId] = React.useState(schemaConfig.defaultSchemaId);
    const [schemaModels, setSchemaModels] = React.useState(schemaConfig.getSchemas());

    const [isOpenEditDialog, setOpenEditDialog] = React.useState<boolean>(false);
    const [targetSchema, setTargetSchema] = React.useState<DbSchemaModel | null>(null);

    const [draggingStartIndex, setDraggingStartIndex] = React.useState<number | null>(null);
    const [draggingOverIndex, setDraggingOverIndex] = React.useState<number | null>(null);

    const selectedIndex = (targetSchema == null) ? -1
        : schemaModels.findIndex(schema => (schema.schemaId === targetSchema.schemaId));

    const initRowStyle = (targetIndex: number) => {
        const rowStyle = (selectedIndex === targetIndex)
            ? { backgroundColor: SELECTED_CELL_COLOR, height: "43px" } : BASE_ROW_STYLE;

        // ドラッグ中の行は半透明にする
        if (draggingStartIndex === targetIndex) {
            return { ...rowStyle, opacity: 0.2 };
        }
        // ドラッグオーバー中の行は色を変える
        if (draggingOverIndex === targetIndex) {
            return { height: "43px", backgroundColor: 'lightblue' };
        }

        return rowStyle;
    };

    const initDragEventHandler = (schemaIndex: number) => {
        const handleDragStart = (event: React.DragEvent) => {
            setDraggingStartIndex(schemaIndex);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData('text/html', '');
        };

        const handleDragOver = (event: React.DragEvent) => {
            event.preventDefault();

            setDraggingOverIndex(previous => {
                if (previous === schemaIndex) {
                    return previous;
                }

                event.dataTransfer.dropEffect = "move";
                return schemaIndex;
            });
        };

        const handleDrop = (event: React.DragEvent) => {
            event.preventDefault();

            if ((draggingStartIndex == null) || (draggingStartIndex === schemaIndex)) {
                return;
            }

            setSchemaModels(previous => {
                const nextSchemaModels = [...previous];
                nextSchemaModels.splice(draggingStartIndex, 1);
                nextSchemaModels.splice(schemaIndex, 0, previous[draggingStartIndex]);

                return nextSchemaModels;
            });
        };

        const handleDragEnd = () => {
            setDraggingStartIndex(null);
            setDraggingOverIndex(null);
        };

        return {
            onDragStart: handleDragStart,
            onDragOver: handleDragOver,
            onDragLeave: () => setDraggingOverIndex(null),
            onDrop: handleDrop,
            onDragEnd: handleDragEnd
        };
    };

    const initRowClickHandler = (schema: DbSchemaModel) => {
        const handleSelected = () => {
            const nextSchema = (targetSchema !== schema) ? schema : null;
            setTargetSchema(nextSchema);
        };
        const handleEditSchema = () => {
            setTargetSchema(schema);
            setOpenEditDialog(true);
        };

        return {
            onClick: handleSelected,
            onDoubleClick: handleEditSchema
        };
    };

    const initHandleChanged = (schema: DbSchemaModel) => {
        return (event: React.ChangeEvent<HTMLInputElement>) => {
            event.stopPropagation();

            const checked = event.target.checked;
            const nextDefaultId = checked ? schema.schemaId : "";
            setDefaultSchemaId(nextDefaultId);
        };
    };

    const initRecordRow = (index: number, schema: DbSchemaModel) => {

        const clickHandler = initRowClickHandler(schema);

        return (
            <TableRow key={`schema-table_${schema.schemaId}`}
                sx={initRowStyle(index)} style={{ cursor: 'pointer' }}
                draggable={schemaModels.length > 1}
                {...initDragEventHandler(index)}>
                <TableCell {...clickHandler}>{schema.schemaName}</TableCell>
                <TableCell {...clickHandler}>{schema.description}</TableCell>
                <TableCell {...clickHandler}>
                    <Checkbox size="small"
                        checked={schema.schemaId === defaultSchemaId}
                        onClick={handlePreventMouseEvent}
                        onDoubleClick={handlePreventMouseEvent}
                        onChange={initHandleChanged(schema)} />
                </TableCell>
            </TableRow>
        );
    };

    const settingTable = (
        <TableContainer>
            <Table stickyHeader size="small" style={{ tableLayout: "fixed" }}>
                <TableHead>
                    <TableRow>
                        <TableCell>Schema</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Default</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {schemaModels.length > 0
                        ? schemaModels.map((schema, index) => initRecordRow(index, schema))
                        : (
                            <TableRow>
                                <TableCell colSpan={3} align="center" sx={{ p: 2 }}>
                                    (No schemas)
                                </TableCell>
                            </TableRow>
                        )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    const handleAddSchema = () => {
        setTargetSchema(null);
        setOpenEditDialog(true);
    };

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        return () => {
            if ((selectedIndex + shift < 0) || (selectedIndex + shift >= schemaModels.length)) {
                return;
            }

            setSchemaModels(previous => {
                const nextModels = [...previous]
                nextModels[selectedIndex] = schemaModels[selectedIndex + shift];
                nextModels[selectedIndex + shift] = schemaModels[selectedIndex];

                return nextModels;
            });
        };
    };

    const handleRemoveIndex = () => setSchemaModels(
        previousModels => previousModels.filter((_, indexIndex) => (selectedIndex !== indexIndex))
    );

    const operationPanel = (
        <Stack direction="row" justifyContent="space-between" sx={{ margin: 1, marginBottom: 0.5 }}>
            <EdgedIconButton tooltip="Add schema" withText onClick={handleAddSchema}>
                <AddIcon />
            </EdgedIconButton>

            <Stack justifyContent="flex-end" direction="row" spacing={2}>
                <EdgedIconButton tooltip="Edit schema" disabled={selectedIndex < 0}
                    onClick={() => setOpenEditDialog(true)}>
                    <EditIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move forward" disabled={selectedIndex <= 0}
                    onClick={initHandleShiftColumn(-1)}>
                    <ArrowUpwardIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move backward"
                    disabled={(selectedIndex < 0) || (selectedIndex >= schemaModels.length - 1)}
                    onClick={initHandleShiftColumn(1)}>
                    <ArrowDownwardIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Remove schema" disabled={selectedIndex < 0}
                    onClick={handleRemoveIndex}>
                    <DeleteIcon fontSize="small" />
                </EdgedIconButton>
            </Stack>
        </Stack>
    );

    const handleCompleted = () => {
        const nextSchemaConfig = DbSchemaConfig.create({
            defaultSchemaId: defaultSchemaId,
            schemas: schemaModels
        });

        documentsHolder.updateSchema(nextSchemaConfig);
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="md" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Schema</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    {settingTable}
                    {operationPanel}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleCompleted} >OK</Button>
            </DialogActions>
            {isOpenEditDialog && <DbSchemaEditDialog
                isOpen={isOpenEditDialog}
                schemaModel={targetSchema}
                onUpdateSchema={setSchemaModels}
                onClose={() => setOpenEditDialog(false)}
            />}
        </Dialog>
    );
};

const BASE_ROW_STYLE = {
    height: "43px",
    '&:nth-of-type(odd)': { backgroundColor: 'action.hover' }
};

type DbSchemaEditDialogProps = {
    isOpen: boolean;
    schemaModel?: DbSchemaModel | null;
    onUpdateSchema: (updateFunction: ((previous: DbSchemaModel[]) => DbSchemaModel[])) => void;
    onClose: () => void;
};

const DbSchemaEditDialog = ({
    isOpen, schemaModel, onUpdateSchema, onClose
}: DbSchemaEditDialogProps) => {

    const [schemaName, setSchemaName] = React.useState(schemaModel?.schemaName || "");
    const [description, setDescription] = React.useState(schemaModel?.description || "");

    const editValueValidated = (schemaName.length > 0);

    const handleCompleted = () => {
        if (!editValueValidated) {
            return;
        }

        onUpdateSchema(previousModels => {
            if (schemaModel == null) {
                const addSchema = DbSchemaModel.create(schemaName, description);
                return [...previousModels, addSchema];
            }

            const nextSchema = schemaModel.update({ schemaName, description });
            return previousModels.map(previous =>
                (previous.schemaId === nextSchema.schemaId) ? nextSchema : previous
            );
        });

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <Dialog fullWidth maxWidth="sm" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit Schema</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <TextField required fullWidth variant="outlined"
                        label="Schema Name" value={schemaName}
                        onChange={initHandleChangePhysicalName(setSchemaName)}
                        onKeyDown={handleEnterDown} />
                    <TextField variant="outlined" label="Description" multiline rows={3}
                        slotProps={{ input: { style: { resize: 'vertical' } } }}
                        value={description}
                        onChange={event => setDescription(event.target.value)} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!editValueValidated}
                    onClick={handleCompleted}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

export default DbSchemaView;