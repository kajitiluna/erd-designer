import React from "react";
import { Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import DataObjectIcon from '@mui/icons-material/DataObject';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import ForeignKeyIcon from "~/components/icons/ForeignKeyIcon";
import PrimaryKeyIcon from "~/components/icons/PrimaryKeyIcon";
import EdgedIconButton from "~/components/EdgedIconButton";
import ColumnGroupModel from "~/models/database/ColumnGroupModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import { overrideColumnName } from "~/models/database/support";
import ColumnEditDialog from "~/features/editor/ColumnEditDialog";
import { ColumnWrapModel, SELECTED_CELL_COLOR } from "~/features/editor/support";
import ColumnGroupView from "~/features/editor/ColumnGroupView";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import StructColumnEditDialog from "~/features/editor/StructColumnEditDialog";

type ColumnViewTableProps = {
    columnWrapModels: ColumnWrapModel[],
    availableColumnGroup: boolean,
    availableKeyConstraints?: boolean,
    structNestCount?: number,
    ancestorStructShareIds?: readonly string[],
    isChildRelation: (columnModelId: string) => boolean,
    isEditableColumnType: (columnModel: SimpleColumnModel) => boolean,
    onUpdateColumnWrapModels: (updateFunction: ((previous: ColumnWrapModel[]) => ColumnWrapModel[])) => void,
    onUpdateCheckExpression: (updateFunction: ((previous: string) => string)) => void
};

type ColumnEditModeType = "column" | "add_struct" | "edit_struct" | "add_group" | "edit_group" | "";

const ColumnViewTable = ({
    columnWrapModels, availableColumnGroup, availableKeyConstraints = true, structNestCount = 0,
    ancestorStructShareIds = [],
    isChildRelation, isEditableColumnType, onUpdateColumnWrapModels, onUpdateCheckExpression
}: ColumnViewTableProps) => {

    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { columnShareStorage } = React.useContext(ColumnShareModelStorageContext);

    const [selectedWrappedModel, setSelectedWrappedModel] = React.useState<ColumnWrapModel | null>(null);
    const [editMode, setEditMode] = React.useState<ColumnEditModeType>("");

    const [draggingStartIndex, setDraggingStartIndex] = React.useState<number | null>(null);
    const [draggingOverIndex, setDraggingOverIndex] = React.useState<number | null>(null);

    const erdDocument = documentsHolder.current();
    const database = erdDocument.getDatabase();

    const selectedIndex: number = (selectedWrappedModel == null) ? -1
        : columnWrapModels.findIndex(wrappedModel => {
            if (wrappedModel.modelType !== selectedWrappedModel.modelType) {
                return false;
            }

            if ((wrappedModel.modelType === "single") && (selectedWrappedModel.modelType === "single")
                && (wrappedModel.columnModel.columnModelId === selectedWrappedModel.columnModel.columnModelId)) {
                return true;
            }

            if ((wrappedModel.modelType === "group") && (selectedWrappedModel.modelType === "group")
                && (wrappedModel.columnGroupModel.columnGroupId === selectedWrappedModel.columnGroupModel.columnGroupId)) {
                return true;
            }

            if ((wrappedModel.modelType === "struct") && (selectedWrappedModel.modelType === "struct")
                && (wrappedModel.columnModel.columnModelId === selectedWrappedModel.columnModel.columnModelId)) {
                return true;
            }

            return false;
        });

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

    const initColumnModelRow = (columnWrapModel: ColumnWrapModel, targetIndex: number) => {
        let cells;
        if (columnWrapModel.modelType === "single") {
            cells = doInitSingleColumnRow(columnWrapModel.columnModel);
        } else if (columnWrapModel.modelType === "struct") {
            cells = doInitStructColumnRow(columnWrapModel.columnModel);
        } else {
            cells = doInitGroupColumnRow(columnWrapModel.columnGroupModel);
        }

        const handleRowClicked = () => {
            setSelectedWrappedModel((selectedWrappedModel !== columnWrapModel) ? columnWrapModel : null);
        };

        const handleEditColumn = () => {
            setSelectedWrappedModel(columnWrapModel);
            setEditMode(TO_EDIT_MODE[columnWrapModel.modelType]);
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

        return (
            <TableRow key={`column-view-${targetIndex}`}
                sx={initRowStyle(targetIndex)} style={{ cursor: 'pointer' }}
                draggable={columnWrapModels.length > 1}
                onDragStart={handleDragStart} onDragOver={handleDragOver}
                onDragLeave={() => setDraggingOverIndex(null)}
                onDrop={handleDrop} onDragEnd={handleDragEnd}
                onClick={handleRowClicked} onDoubleClick={handleEditColumn}>
                <TableCell align="center">{(selectedIndex === targetIndex) && "✔"}</TableCell>
                {cells}
            </TableRow>
        );
    };

    const columnViewHeader = (
        <TableHead>
            <TableRow>
                <TableCell sx={{ width: "5px", paddingRight: "8px" }} align="center"></TableCell>
                {availableKeyConstraints && (<>
                    <TableCell sx={{ width: "10px" }} align="center">PK</TableCell>
                    <TableCell sx={{ width: "10px" }} align="center">FK</TableCell>
                </>)}
                <TableCell>Physical Name</TableCell>
                <TableCell>Logical Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">NotNull</TableCell>
                <TableCell sx={{ width: "50px" }} align="center">Unique</TableCell>
            </TableRow>
        </TableHead>
    );

    const doInitSingleColumnRow = (columnModel: SimpleColumnModel) => {
        const columnShareModel = columnShareStorage.findColumnShare(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            console.warn(`ColumnShareModel not found for columnModelId: ${columnModel.columnModelId}`);
            return (<></>);
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        return (<>
            {availableKeyConstraints && (<>
                <TableCell align="center">{columnModel.primaryKey && <PrimaryKeyIcon />}</TableCell>
                <TableCell align="center">{inChildRelation && <ForeignKeyIcon />}</TableCell>
            </>)}
            <TableCell>{overrideName.physicalName}</TableCell>
            <TableCell>{overrideName.logicalName}</TableCell>
            <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
            <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
            <TableCell align="center">{columnModel.unique && <CheckIcon fontSize="small" />}</TableCell>
        </>);
    };

    const doInitGroupColumnRow = (columnGroupModel: ColumnGroupModel) => {
        return (<>
            {availableKeyConstraints && (<>
                <TableCell align="center"></TableCell>
                <TableCell align="center"></TableCell>
            </>)}
            <TableCell colSpan={5}>{columnGroupModel.groupName}</TableCell>
        </>);
    }

    const doInitStructColumnRow = (columnModel: StructColumnModel) => {
        const structShare = columnShareStorage.findStructShare(columnModel.structShareModelId);
        if (structShare == null) {
            console.warn(`StructColumnShareModel not found for structColumnModelId: ${columnModel.columnModelId}`);
            return (<></>);
        }

        const overrideName = overrideColumnName(columnModel, structShare);

        return (<>
            {availableKeyConstraints && (<>
                <TableCell align="center"></TableCell>
                <TableCell align="center"></TableCell>
            </>)}
            <TableCell>{overrideName.physicalName}</TableCell>
            <TableCell>{overrideName.logicalName}</TableCell>
            <TableCell>{structShare.simpleColumnType()}</TableCell>
            <TableCell align="center">{columnModel.notNull && <CheckIcon fontSize="small" />}</TableCell>
            <TableCell align="center"></TableCell>
        </>);
    }

    const handleAddColumn = () => {
        const columnModel = new SimpleColumnModel({ columnShareModelId: "" });
        setSelectedWrappedModel({ modelType: "single", columnModel });
        setEditMode("column");
    };

    const handleAddStructColumn = () => {
        const columnModel = new StructColumnModel({ structShareModelId: "" });
        setSelectedWrappedModel({ modelType: "struct", columnModel });
        setEditMode("add_struct");
    };

    const handleAddColumnGroup = () => {
        setEditMode("add_group");
    };

    const addButtonPanel = (
        <Stack direction="row" spacing={5} sx={{ justifyContent: "flex-start", alignItems: "center" }}>
            <EdgedIconButton tooltip="Add column" withText onClick={handleAddColumn}>
                <AddIcon />
            </EdgedIconButton>
            {database.supportsStructType && (
                <EdgedIconButton tooltip="Add struct column" withText disabled={structNestCount >= 10}
                    onClick={handleAddStructColumn}>
                    <DataObjectIcon />
                </EdgedIconButton>
            )}
            {availableColumnGroup && (
                <EdgedIconButton tooltip="Add group column" withText onClick={handleAddColumnGroup}>
                    <PlaylistAddIcon />
                </EdgedIconButton>
            )}
        </Stack>
    );

    const handleEditColumn = () => {
        if (selectedWrappedModel == null) {
            return;
        }

        setEditMode(TO_EDIT_MODE[selectedWrappedModel.modelType]);
    };

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        return () => {
            if ((selectedIndex < 0) || (selectedIndex + shift < 0)
                || (selectedIndex + shift >= columnWrapModels.length)) {
                return;
            }

            onUpdateColumnWrapModels(previous => {
                const nextColumnWrapModels = [...previous];
                nextColumnWrapModels[selectedIndex] = previous[selectedIndex + shift];
                nextColumnWrapModels[selectedIndex + shift] = previous[selectedIndex];

                return nextColumnWrapModels
            });
        }
    };

    const checkRemovable = (targetIndex: number) => {
        const columnWrapModel = columnWrapModels[targetIndex];
        if (columnWrapModel.modelType === "single") {
            return isChildRelation(columnWrapModel.columnModel.columnModelId);
        }
        if (columnWrapModel.modelType === "struct") {
            return false; // struct はリレーションに関与しないため、常に削除可能
        }

        return columnWrapModel.columnModels
            .some(columnModel => isChildRelation(columnModel.columnModelId));
    };

    const handleRemoveColumn = () => {
        if (selectedIndex == null) {
            return;
        }

        setSelectedWrappedModel(null);
        onUpdateColumnWrapModels(previous => previous.filter((_, index) => (selectedIndex !== index)))
    }

    const editButtonPanel = (
        <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
            <EdgedIconButton tooltip="Edit column" disabled={selectedIndex < 0}
                onClick={handleEditColumn}>
                <EditIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move up" disabled={(selectedIndex < 0) || (selectedIndex === 0)}
                onClick={initHandleShiftColumn(-1)}>
                <ArrowUpwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Move down" disabled={(selectedIndex < 0) || (selectedIndex === columnWrapModels.length - 1)}
                onClick={initHandleShiftColumn(1)}>
                <ArrowDownwardIcon fontSize="small" />
            </EdgedIconButton>
            <EdgedIconButton tooltip="Remove column" disabled={(selectedIndex < 0) || checkRemovable(selectedIndex)}
                onClick={handleRemoveColumn}>
                <DeleteIcon fontSize="small" />
            </EdgedIconButton>
        </Stack>
    );

    const handleUpdateColumnGroup = (columnWrapModel: ColumnWrapModel) => {
        setSelectedWrappedModel(null);

        if (editMode == "") {
            return;
        }

        if (editMode === "add_group") {
            onUpdateColumnWrapModels(previous => [...previous, columnWrapModel]);
            return;
        }

        onUpdateColumnWrapModels(previous => {
            if ((selectedIndex < 0) || (selectedIndex >= previous.length)) {
                return previous;
            }

            const nextColumnWrapModels = [...previous];
            nextColumnWrapModels[selectedIndex] = columnWrapModel;

            return nextColumnWrapModels;
        });
    };

    return (
        <>
            <TableContainer sx={{ maxHeight: window.innerHeight - 550 }}>
                <Table stickyHeader size="small" aria-label="column view table" style={{ tableLayout: "fixed" }}>
                    {columnViewHeader}
                    <TableBody>
                        {(columnWrapModels.length > 0)
                            ? columnWrapModels.map((columnWrapModel: ColumnWrapModel, index: number) =>
                                initColumnModelRow(columnWrapModel, index))
                            : (
                                <TableRow>
                                    <TableCell colSpan={availableKeyConstraints ? 8 : 6} align="center" sx={{ p: 2 }}>
                                        (No columns)
                                    </TableCell>
                                </TableRow>
                            )}
                    </TableBody>
                </Table>
            </TableContainer>
            <Stack direction="row" sx={{ justifyContent: "space-between", margin: 1, marginBottom: 0.5 }}>
                {addButtonPanel}
                {editButtonPanel}
            </Stack>
            {(editMode === "column") && (selectedWrappedModel?.modelType === "single") && (
                <ColumnEditDialog
                    isOpen={(editMode === "column") && (selectedWrappedModel?.modelType === "single")}
                    columnModel={selectedWrappedModel.columnModel}
                    availableKeyConstraints={availableKeyConstraints}
                    isEditableColumnType={isEditableColumnType}
                    onUpdateWrapColumnModels={onUpdateColumnWrapModels}
                    onUpdateCheckExpression={onUpdateCheckExpression}
                    onClose={() => setEditMode("")} />
            )}
            {((editMode === "add_struct") || (editMode === "edit_struct"))
                && (selectedWrappedModel?.modelType === "struct") && (
                    <StructColumnEditDialog
                        isOpen={((editMode === "add_struct") || (editMode === "edit_struct"))}
                        structColumn={selectedWrappedModel.columnModel}
                        structNestCount={structNestCount}
                        ancestorStructShareIds={ancestorStructShareIds}
                        onUpdateWrapColumnModels={onUpdateColumnWrapModels}
                        onClose={() => setEditMode("")} />
                )}
            {((editMode === "add_group") || (editMode === "edit_group")) && (
                <ColumnGroupView
                    isOpen={((editMode === "add_group") || (editMode === "edit_group"))}
                    viewMode="select"
                    onSelect={handleUpdateColumnGroup}
                    onClose={() => setEditMode("")} />
            )}
        </>
    );
};

const TO_EDIT_MODE: { [key in ColumnWrapModel["modelType"]]: ColumnEditModeType } = {
    "single": "column",
    "group": "edit_group",
    "struct": "edit_struct",
} as const;

const BASE_ROW_STYLE = {
    height: "43px",
    '&:nth-of-type(odd)': { backgroundColor: 'action.hover' }
};

export default ColumnViewTable;
