import React from "react";
import { Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
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
import { ColumnWrapModel, SELECTED_CELL_COLOR } from "~/features/editor/support";
import ColumnGroupView from "~/features/editor/ColumnGroupView";

type ColumnViewTableProps = {
    columnWrapModels: ColumnWrapModel[],
    availableColumnGroup: boolean,
    isChildRelation: (columnModelId: string) => boolean,
    isEditableColumnType: (columnModel: ColumnModel) => boolean,
    onUpdateColumnWrapModels: (updateFunction: ((previous: ColumnWrapModel[]) => ColumnWrapModel[])) => void
};

const ColumnViewTable = ({
    columnWrapModels, availableColumnGroup, isChildRelation, isEditableColumnType, onUpdateColumnWrapModels
}: ColumnViewTableProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);

    const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
    const [editingColumnModel, setEditingColumnModel] = React.useState<ColumnModel | null>(null);
    const [editingColumnGroupIndex, setEditingColumnGroupIndex] = React.useState<number | "ADD" | null>(null);

    const [draggingStartIndex, setDraggingStartIndex] = React.useState<number | null>(null);
    const [draggingOverIndex, setDraggingOverIndex] = React.useState<number | null>(null);

    const initColumnModelRow = (columnWrapModel: ColumnWrapModel, targetIndex: number) => {
        const cells = (columnWrapModel.modelType === "single")
            ? doInitSingleColumnRow(columnWrapModel.columnModel)
            : doInitGroupColumnRow(columnWrapModel.columnGroupModel);

        const handleRowClicked = () => {
            setSelectedIndex((selectedIndex !== targetIndex) ? targetIndex : null);
        };

        const handleEditColumn = () => {
            setSelectedIndex(null);

            if (columnWrapModel.modelType === "single") {
                setEditingColumnModel(columnWrapModel.columnModel);
            } else {
                setEditingColumnGroupIndex(targetIndex);
            }
        };

        // ドラッグ開始の制御
        const handleDragStart = (event: React.DragEvent) => {
            setDraggingStartIndex(targetIndex);
            event.dataTransfer.effectAllowed = "move";
        };

        // 他の要素をドラッグしているものが、該当コンポーネントの上にドラッグオーバーしている時の制御
        const handleDragOver = (event: React.DragEvent) => {
            event.preventDefault();

            setDraggingOverIndex(previous => {
                if (previous === targetIndex) {
                    return previous; // 同じ行でのドラッグオーバーは無視
                }

                event.dataTransfer.dropEffect = "move";
                return targetIndex;
            });
        };

        const handleDrop = (event: React.DragEvent) => {
            event.preventDefault();

            if ((draggingStartIndex == null) || (draggingStartIndex === targetIndex)) {
                return; // ドラッグ開始位置が未設定、または同じ行でのドロップは無視
            }

            onUpdateColumnWrapModels(previous => {
                const nextColumnWrapModels = [...previous];

                nextColumnWrapModels.splice(draggingStartIndex, 1); // 元の位置から削除
                nextColumnWrapModels.splice(targetIndex, 0, previous[draggingStartIndex]);

                return nextColumnWrapModels
            });
        };

        const handleDragEnd = () => {
            setDraggingStartIndex(null);
            setDraggingOverIndex(null);
        };

        const initRowStyle = () => {
            const rowStyle = (selectedIndex === targetIndex)
                ? { backgroundColor: SELECTED_CELL_COLOR, height: "43px" } : baseRowStyle;

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

        return (
            <TableRow key={`column-view-${targetIndex}`}
                draggable sx={initRowStyle()} style={{ cursor: 'pointer' }}
                onDragStart={handleDragStart} onDragOver={handleDragOver}
                onDragLeave={() => setDraggingOverIndex(null)}
                onDrop={handleDrop} onDragEnd={handleDragEnd}
                onClick={handleRowClicked} onDoubleClick={handleEditColumn}>
                <TableCell align="center">{(selectedIndex === targetIndex) && "✔"}</TableCell>
                {cells}
            </TableRow>
        );
    };

    const doInitSingleColumnRow = (columnModel: ColumnModel) => {
        const columnShareModel = columnShareModelStorage.find(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
            return (<></>);
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        return (<>
            <TableCell align="center">{columnModel.primaryKey && <PrimaryKeyIcon />}</TableCell>
            <TableCell align="center">{inChildRelation && <ForeignKeyIcon />}</TableCell>
            <TableCell>{overrideName.physicalName}</TableCell>
            <TableCell>{overrideName.logicalName}</TableCell>
            <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
            <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
            <TableCell align="center">{columnModel.unique && <CheckIcon fontSize="small" />}</TableCell>
        </>);
    };

    const doInitGroupColumnRow = (columnGroupModel: ColumnGroupModel) => {
        return (<>
            <TableCell align="center"></TableCell>
            <TableCell align="center"></TableCell>
            <TableCell colSpan={5}>{columnGroupModel.groupName}</TableCell>
        </>);
    }

    const tableHeader = (
        <TableHead>
            <TableRow>
                <TableCell sx={{ width: "5px", paddingRight: "8px" }} align="center"></TableCell>
                <TableCell sx={{ width: "10px" }} align="center">PK</TableCell>
                <TableCell sx={{ width: "10px" }} align="center">FK</TableCell>
                <TableCell>Physical Name</TableCell>
                <TableCell>Logical Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">NotNull</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">Unique</TableCell>
            </TableRow>
        </TableHead>
    );

    const handleAddColumn = () => {
        const columnModel = new ColumnModel({});
        setEditingColumnModel(columnModel);
    };

    const handleAddColumnGroup = () => {
        setEditingColumnGroupIndex("ADD");
    };

    const addButtonPanel = (
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
    );

    const handleEditColumn = () => {
        if (selectedIndex == null) {
            return;
        }

        setSelectedIndex(null);

        const columnWrapModel = columnWrapModels[selectedIndex];
        if (columnWrapModel.modelType === "single") {
            setEditingColumnModel(columnWrapModel.columnModel);
        } else {
            setEditingColumnGroupIndex(selectedIndex);
        }
    };

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        return () => {
            if ((selectedIndex == null) || (selectedIndex + shift < 0)
                || (selectedIndex + shift >= columnWrapModels.length)) {
                return;
            }

            setSelectedIndex(selectedIndex + shift);

            onUpdateColumnWrapModels(previous => {
                const nextColumnWrapModels = [...previous];
                nextColumnWrapModels[selectedIndex] = previous[selectedIndex + shift];
                nextColumnWrapModels[selectedIndex + shift] = previous[selectedIndex];

                return nextColumnWrapModels
            });
        }
    };

    const checkInChildRelation = (targetIndex: number) => {
        const columnWrapModel = columnWrapModels[targetIndex];
        if (columnWrapModel.modelType === "group") {
            return false; // TODO
        }

        return isChildRelation(columnWrapModel.columnModel.columnModelId);
    };

    const handleRemoveColumn = () => {
        if (selectedIndex == null) {
            return;
        }

        setSelectedIndex(null);
        onUpdateColumnWrapModels(previous => previous.filter((_, index) => (selectedIndex !== index)))
    }

    const editButtonPanel = (
        <Stack justifyContent="flex-end" direction="row" spacing={2}>
            <EdgedIconButton tooltip="Edit column" disabled={selectedIndex == null}
                onClick={handleEditColumn}>
                <EditIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move up" disabled={(selectedIndex == null) || (selectedIndex === 0)}
                onClick={initHandleShiftColumn(-1)}>
                <ArrowUpwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move down" disabled={(selectedIndex == null) || (selectedIndex === columnWrapModels.length - 1)}
                onClick={initHandleShiftColumn(1)}>
                <ArrowDownwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Remove column" disabled={(selectedIndex == null) || checkInChildRelation(selectedIndex)}
                onClick={handleRemoveColumn}>
                <DeleteIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

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
        <>
            <TableContainer sx={{ maxHeight: window.innerHeight - 550 }}>
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
            </TableContainer>
            <Stack direction="row" justifyContent="space-between" sx={{ margin: 1, marginBottom: 0.5 }}>
                {addButtonPanel}
                {editButtonPanel}
            </Stack>
            {(editingColumnModel != null) && (
                <ColumnEditDialog
                    isOpen={editingColumnModel != null}
                    columnModel={editingColumnModel}
                    isEditableColumnType={isEditableColumnType}
                    onUpdateWrapColumnModels={onUpdateColumnWrapModels}
                    onClose={() => setEditingColumnModel(null)} />
            )}
            {(editingColumnGroupIndex != null) && (
                <ColumnGroupView
                    isOpen={editingColumnGroupIndex !== null}
                    viewMode="select"
                    onSelect={handleUpdateColumnGroup}
                    onClose={() => setEditingColumnGroupIndex(null)} />
            )}
        </>
    );
};

const baseRowStyle = { height: "43px", '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } };

export default ColumnViewTable;
