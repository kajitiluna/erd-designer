import React, { MouseEvent, useState } from "react";
import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import EdgedIconButton from "~/components/EdgedIconButton";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import { overrideColumnName } from "~/models/database/support";
import ColumnEditDialog from "~/features/editor/ColumnEditDialog";
import { ColumnWrapModel } from "~/features/editor/support";
import ColumnGroupView from "~/features/editor/ColumnGroupView";

type ColumnViewTableProps = {
    columnWrapModels: ColumnWrapModel[],
    availableColumnGroup: boolean,
    isChildRelation: (columnModelId: string) => boolean,
    isEditableColumnType: (columnModelId: string) => boolean,
    onUpdateColumnWrapModels: (updateFunction: ((previous: ColumnWrapModel[]) => ColumnWrapModel[])) => void
};

const ColumnViewTable = ({
    columnWrapModels, availableColumnGroup, isChildRelation, isEditableColumnType, onUpdateColumnWrapModels
}: ColumnViewTableProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [editingColumnModel, setEditingColumnModel] = useState<ColumnModel | null>(null);
    const [editingColumnGroupIndex, setEditingColumnGroupIndex] = useState<number | "ADD" | null>(null);

    const initColumnModelRow = (columnWrapModel: ColumnWrapModel, targetIndex: number) => {
        const { cells, inChildRelation } = (columnWrapModel.modelType === "single")
            ? doInitSingleColumnRow(columnWrapModel.columnModel)
            : doInitGroupColumnRow(columnWrapModel.columnGroupModel);

        const handleRowClicked = (event: MouseEvent) => {
            event.stopPropagation();

            setSelectedIndex((selectedIndex !== targetIndex) ? targetIndex : null);
        };

        const handleEditColumn = (event: MouseEvent) => {
            event.stopPropagation();
            setSelectedIndex(null);

            if (columnWrapModel.modelType === "single") {
                setEditingColumnModel(columnWrapModel.columnModel);
            } else {
                setEditingColumnGroupIndex(targetIndex);
            }
        };

        const initHandleShiftColumn = (shift: (1 | -1)) => {
            return (event: MouseEvent) => {
                if ((targetIndex + shift < 0) || (targetIndex + shift >= columnWrapModels.length)) {
                    return;
                }

                event.stopPropagation();

                setSelectedIndex(null);
                onUpdateColumnWrapModels(previous => {
                    const nextColumnWrapModels = [...previous];
                    nextColumnWrapModels[targetIndex] = previous[targetIndex + shift];
                    nextColumnWrapModels[targetIndex + shift] = previous[targetIndex];

                    return nextColumnWrapModels
                });
            }
        };

        const handleRemoveColumn = (event: MouseEvent) => {
            event.stopPropagation();

            setSelectedIndex(null);
            onUpdateColumnWrapModels(previous => previous.filter((_, index) => targetIndex !== index))
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
                <EdgedIconButton tooltip="Move down" disabled={targetIndex === columnWrapModels.length - 1}
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
                {cells}
                <TableCell>{buttonPanel}</TableCell>
            </TableRow>
        );
    };

    const doInitSingleColumnRow = (columnModel: ColumnModel) => {
        const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
            return { cells: (<></>), inChildRelation: true };
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        return {
            cells: (<>
                <TableCell align="center">{columnModel.primaryKey && <PrimaryKeyIcon />}</TableCell>
                <TableCell align="center">{inChildRelation && <ForeignKeyIcon />}</TableCell>
                <TableCell>{overrideName.physicalName}</TableCell>
                <TableCell>{overrideName.logicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
                <TableCell align="center">{columnModel.unique && <CheckIcon fontSize="small" />}</TableCell>
            </>),
            inChildRelation: inChildRelation
        };
    };

    const doInitGroupColumnRow = (columnGroupModel: ColumnGroupModel) => {
        return {
            cells: (<>
                <TableCell align="center"></TableCell>
                <TableCell align="center"></TableCell>
                <TableCell colSpan={5}>{columnGroupModel.groupName}</TableCell>
            </>),
            inChildRelation: false
        };
    }

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

    const handleAddColumnGroup = (event: MouseEvent) => {
        event.stopPropagation();

        setEditingColumnGroupIndex("ADD");
    };

    const handleUpdateColumnGroup = (columnWrapModel: ColumnWrapModel) => {
        if (editingColumnGroupIndex == null) {
            return;
        }

        if (editingColumnGroupIndex === "ADD") {
            onUpdateColumnWrapModels(previous => [...previous, columnWrapModel]);
            return;
        }

        onUpdateColumnWrapModels(previous => {
            if ((editingColumnGroupIndex < 0) || (editingColumnGroupIndex >= previous.length)) {
                return previous;
            }

            const nextColumnWrapModels = [...previous];
            nextColumnWrapModels[editingColumnGroupIndex] = columnWrapModel;

            return nextColumnWrapModels;
        });
    };

    return (
        <TableContainer>
            <Table stickyHeader size="small" aria-label="column view table" style={{ tableLayout: "fixed" }}>
                {tableHeader}
                <TableBody>
                    {(columnWrapModels.length > 0)
                        ? columnWrapModels.map((columnWrapModel: ColumnWrapModel, index: number) =>
                            initColumnModelRow(columnWrapModel, index))
                        : (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ p: 2 }}>
                                    (No columns)
                                </TableCell>
                            </TableRow>
                        )}
                </TableBody>
            </Table>
            <Box sx={{ margin: 1, marginLeft: 1, marginBottom: 0.5 }}>
                <Stack direction="row" spacing={5} justifyContent="flex-start" alignItems="center">
                    <EdgedIconButton tooltip="Add column" withText onClick={handleAddColumn}>
                        <AddIcon />
                    </EdgedIconButton>
                    {availableColumnGroup && (
                        <EdgedIconButton tooltip="Add group column" withText onClick={handleAddColumnGroup}>
                            <PlaylistAddIcon />
                        </EdgedIconButton>
                    )}
                </Stack>
            </Box>
            {(editingColumnModel != null) && (
                <ColumnEditDialog
                    isOpen={editingColumnModel != null}
                    columnModel={editingColumnModel}
                    isEditableColumnType={isEditableColumnType}
                    onUpdateWrapColumnModels={onUpdateColumnWrapModels}
                    onClose={() => setEditingColumnModel(null)} />
            )}
            {(editingColumnGroupIndex != null && (
                <ColumnGroupView
                    isOpen={editingColumnGroupIndex !== null}
                    viewMode="select"
                    onSelect={handleUpdateColumnGroup}
                    onClose={() => setEditingColumnGroupIndex(null)} />
            ))}
        </TableContainer>
    );
};

export default ColumnViewTable;
