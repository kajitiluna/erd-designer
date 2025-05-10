import React, { MouseEvent, useState } from "react";
import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import EdgedIconButton from "~/components/EdgedIconButton";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnEditDialog from "~/features/editor/ColumnEditDialog";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";

type ColumnViewTableProps = {
    columnModels: ColumnModel[],
    onUpdateColumnModels: (updateFunction: ((previous: ColumnModel[]) => ColumnModel[])) => void,
    isChildRelation: (columnModelId: string) => boolean
};

const ColumnViewTable = ({ columnModels, onUpdateColumnModels, isChildRelation }: ColumnViewTableProps) => {
    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [editingColumnModel, setEditingColumnModel] = useState<ColumnModel | null>(null);

    const initColumnModelRow = (columnModel: ColumnModel, targetIndex: number) => {
        const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        const handleRowClicked = (event: MouseEvent) => {
            event.stopPropagation();

            setSelectedIndex((selectedIndex !== targetIndex) ? targetIndex : null);
        };

        const handleEditColumn = (event: MouseEvent) => {
            event.stopPropagation();
            setSelectedIndex(null);
            setEditingColumnModel(columnModel);
        };

        const initHandleShiftColumn = (shift: (1 | -1)) => {
            return (event: MouseEvent) => {
                if ((targetIndex + shift < 0) || (targetIndex + shift >= columnModels.length)) {
                    return;
                }

                event.stopPropagation();

                setSelectedIndex(null);
                onUpdateColumnModels(previous => {
                    const nextColumnModels = [...previous];
                    nextColumnModels[targetIndex] = previous[targetIndex + shift];
                    nextColumnModels[targetIndex + shift] = previous[targetIndex];

                    return nextColumnModels
                });
            }
        };

        const handleRemoveColumn = (event: MouseEvent) => {
            event.stopPropagation();

            setSelectedIndex(null);
            onUpdateColumnModels(previous => previous.filter((_, index) => targetIndex !== index))
        }

        const buttonPanel = (
            <Stack justifyContent="flex-end" direction="row" spacing={2}>
                <EdgedIconButton tooltip="Edit column" onClick={handleEditColumn}>
                    <EditIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move up" disabled={targetIndex === 0}
                    onClick={initHandleShiftColumn(-1)}>
                    <ArrowUpwardIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move down" disabled={targetIndex === columnModels.length - 1}
                    onClick={initHandleShiftColumn(1)}>
                    <ArrowDownwardIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Remove column" disabled={inChildRelation}
                    onClick={handleRemoveColumn}>
                    <DeleteIcon fontSize="small" />
                </EdgedIconButton>
            </Stack>
        );

        return (
            <TableRow key={`column-view-${targetIndex}`} selected={selectedIndex === targetIndex}
                onClick={handleRowClicked} onDoubleClick={handleEditColumn}
                sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }} style={{ cursor: 'pointer' }}>
                <TableCell align="center">{columnModel.primaryKey && <PrimaryKeyIcon />}</TableCell>
                <TableCell align="center">{inChildRelation && <ForeignKeyIcon />}</TableCell>
                <TableCell>{columnShareModel ? columnShareModel.physicalName : ""}</TableCell>
                <TableCell>{columnShareModel ? columnShareModel.logicalName : ""}</TableCell>
                <TableCell>{columnShareModel ? columnShareModel.specifiedColumnType(inChildRelation) : ""}</TableCell>
                <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
                <TableCell align="center">{columnModel.unique && <CheckIcon fontSize="small" />}</TableCell>
                <TableCell>{buttonPanel}</TableCell>
            </TableRow>
        );
    };

    const tableHeader = (
        <TableHead>
            <TableRow>
                <TableCell sx={{ width: "10px" }} align="center">PK</TableCell>
                <TableCell sx={{ width: "10px" }} align="center">FK</TableCell>
                <TableCell>Physical Name</TableCell>
                <TableCell>Logical Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">NotNull</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">Unique</TableCell>
                <TableCell></TableCell>
            </TableRow>
        </TableHead>
    );

    const handleAddColumn = (event: MouseEvent) => {
        event.stopPropagation();

        const columnModel = new ColumnModel({});
        setEditingColumnModel(columnModel);
    };

    return (
        <TableContainer>
            <Table stickyHeader size="small" aria-label="column view table" style={{ tableLayout: "fixed" }}>
                {tableHeader}
                <TableBody>
                    {columnModels.map((columnModel: ColumnModel, index: number) => initColumnModelRow(columnModel, index))}
                </TableBody>
            </Table>
            <Box sx={{ p: "5px" }}>
                <EdgedIconButton tooltip="Add column" withText onClick={handleAddColumn}>
                    <AddIcon />
                </EdgedIconButton>
            </Box>
            {(editingColumnModel != null) && (
                <ColumnEditDialog
                    isOpen={editingColumnModel != null}
                    columnModel={editingColumnModel}
                    onUpdateColumnModels={onUpdateColumnModels}
                    onClose={() => setEditingColumnModel(null)} />
            )}
        </TableContainer>
    );
};

export default ColumnViewTable;
