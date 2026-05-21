import React from "react";
import {
    Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, Stack, TextField, Typography
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import ColorValue from "~/models/ColorValue";
import PerspectiveModel from "~/models/PerspectiveModel";
import { SELECTED_CELL_COLOR, initHandleCloseDialog, initHandleEnterKeyDown } from "~/features/editor/support";
import EdgedIconButton from "~/components/EdgedIconButton";
import { handlePreventMouseEvent } from "~/features/canvas/support";

type PerspectiveViewProps = {
    isOpen: boolean;
    onClose: () => void;
};

const PerspectiveView = ({ isOpen, onClose }: PerspectiveViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();
    const erdSettingModel = erdDocument.erdSettingModel;

    const [perspectiveModels, setPerspectiveModels] = React.useState(erdSettingModel.getPerspectiveModels());

    const [isOpenEditDialog, setOpenEditDialog] = React.useState<boolean>(false);
    const [targetPerspective, setTargetPerspective] = React.useState<PerspectiveModel | null>(null);

    const [draggingStartIndex, setDraggingStartIndex] = React.useState<number | null>(null);
    const [draggingOverIndex, setDraggingOverIndex] = React.useState<number | null>(null);

    // スクロール連動のためのref
    const headerScrollRef = React.useRef<HTMLDivElement>(null);
    const columnScrollRef = React.useRef<HTMLDivElement>(null);

    const tableViewModels = erdDocument.getTableViewModels()
        .sort((first, second) =>
            first.tableModel.physicalName.localeCompare(second.tableModel.physicalName)
        );
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();

    const selectedIndex = (targetPerspective == null) ? -1
        : perspectiveModels.findIndex(target =>
            (target.perspectiveId === targetPerspective.perspectiveId));

    const initDragEventHandler = (perspectiveIndex: number) => {
        const handleDragStart = (event: React.DragEvent) => {
            setDraggingStartIndex(perspectiveIndex);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData('text/html', '');
        };

        const handleDragOver = (event: React.DragEvent) => {
            event.preventDefault();

            setDraggingOverIndex(previous => {
                if (previous === perspectiveIndex) {
                    return previous;
                }

                event.dataTransfer.dropEffect = "move";
                return perspectiveIndex;
            });
        };

        const handleDrop = (event: React.DragEvent) => {
            event.preventDefault();

            if ((draggingStartIndex == null) || (draggingStartIndex === perspectiveIndex)) {
                return;
            }

            setPerspectiveModels(previous => {
                const nextPerspectiveModels = [...previous];
                nextPerspectiveModels.splice(draggingStartIndex, 1);
                nextPerspectiveModels.splice(perspectiveIndex, 0, previous[draggingStartIndex]);

                return nextPerspectiveModels;
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

    const isSelectedPerspective = (perspectiveIndex: number) => {
        if (targetPerspective == null) {
            return false;
        }

        return (perspectiveModels[perspectiveIndex].perspectiveId === targetPerspective.perspectiveId);
    };

    const initHeaderCellStyle = (perspectiveIndex: number) => {
        const style: React.CSSProperties = {
            textAlign: "center",
            paddingLeft: "8px",
            paddingRight: "8px",
            minWidth: "96px",
            maxWidth: "96px",
            minHeight: "48px",
            maxHeight: "48px",
            cursor: "pointer"
        };

        if (draggingStartIndex === perspectiveIndex) {
            return { ...style, opacity: 0.5 };
        }
        if ((draggingOverIndex === perspectiveIndex) && (draggingStartIndex !== null)) {
            return { ...style, backgroundColor: 'lightblue' };
        }

        const isSelected = isSelectedPerspective(perspectiveIndex);
        return isSelected ? { ...style, backgroundColor: SELECTED_CELL_COLOR } : style;
    };

    const initRecordClickHandler = (perspective: PerspectiveModel) => {
        const handleSelected = () => {
            const nextPerspective = (perspective !== targetPerspective)
                ? perspective : null;
            setTargetPerspective(nextPerspective);
        }
        const handleEditPerspective = () => {
            setTargetPerspective(perspective);
            setOpenEditDialog(true);
        };

        return {
            onClick: handleSelected,
            onDoubleClick: handleEditPerspective
        };
    };

    const initRecordHeaderCell = (perspective: PerspectiveModel, perspectiveIndex: number) => {
        const handleChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
            event.stopPropagation();

            const checked = event.target.checked;
            const nextContainIds = checked ? [...viewIds] : [];
            const nextPerspective = perspective.updateAllContainIds(nextContainIds);
            if (nextPerspective === perspective) {
                return;
            }

            setPerspectiveModels(previousModels => {
                return previousModels.map(previous =>
                    (previous.perspectiveId === nextPerspective.perspectiveId)
                        ? nextPerspective : previous
                );
            });
        };

        return (
            <Stack key={`perspective-table_header-${perspectiveIndex}`}
                direction="column" sx={{
                    alignItems: "center",
                    justifyContent: "center",
                    ...BASE_CELL_STYLE,
                    ...initHeaderCellStyle(perspectiveIndex)
                }} {...initRecordClickHandler(perspective)}>
                <Box sx={RECORD_TITLE_STYLE}>{perspective.perspectiveName}</Box>
                <Checkbox size="small" sx={{ padding: "4px" }}
                    onClick={handlePreventMouseEvent}
                    onDoubleClick={handlePreventMouseEvent}
                    onChange={handleChanged} />
            </Stack>
        );
    };

    const tableHeader = (
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-start" }}>
            <Box sx={initHeaderStyle(25)}>Type</Box>
            <Box sx={initHeaderStyle(170)}>Name</Box>
            <Box ref={headerScrollRef} sx={{ overflow: "hidden" }}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-start" }}>
                    {perspectiveModels.map((perspective, index) =>
                        initRecordHeaderCell(perspective, index))}
                </Stack>
            </Box>
        </Stack>
    );

    const attributeHeaders = (
        <Stack direction="column" sx={{ alignItems: "center", justifyContent: "flex-start" }}>
            {tableViewModels.map((tableViewModel, index) => (
                initAttributeHeadCell(`table-${index}`, "table", tableViewModel.tableModel.physicalName,
                    tableViewModel.headerColor.background, tableViewModel.headerColor.foreground)
            ))}
            {backMemos.map((memoViewModel, index) => (
                initAttributeHeadCell(`back-memo-${index}`, "memo", memoViewModel.memo,
                    memoViewModel.backgroundColor, memoViewModel.foregroundColor)
            ))}
            {frontMemos.map((memoViewModel, index) => (
                initAttributeHeadCell(`front-memo-${index}`, "memo", memoViewModel.memo,
                    memoViewModel.backgroundColor, memoViewModel.foregroundColor)
            ))}
        </Stack>
    );

    const viewIds = [
        ...tableViewModels.map(model => model.tableId),
        ...backMemos.map(model => model.memoId),
        ...frontMemos.map(model => model.memoId)
    ];

    const initHandleChange = (perspective: PerspectiveModel, viewId: string) => {
        return (event: React.ChangeEvent<HTMLInputElement>) => {
            event.stopPropagation();

            const checked = event.target.checked;

            setPerspectiveModels(previous => {
                const nextPerspectives = [...previous];

                for (const [index, target] of nextPerspectives.entries()) {
                    if (target.perspectiveId !== perspective.perspectiveId) {
                        continue;
                    }

                    nextPerspectives[index] =
                        target.updateContainId(viewId, checked ? "add" : "remove");
                    break;
                }

                return nextPerspectives;
            });
        };
    };

    const initCurrentCellStyle = (perspectiveIndex: number) => {
        if (draggingOverIndex === perspectiveIndex) {
            return { backgroundColor: 'lightblue' };
        }

        const isSelected = isSelectedPerspective(perspectiveIndex);
        const baseStyle = isSelected ? { backgroundColor: SELECTED_CELL_COLOR }
            : ((perspectiveIndex % 2 === 1) ? { backgroundColor: "action.hover" } : {});

        if (draggingStartIndex === perspectiveIndex) {
            return { ...baseStyle, opacity: 0.5 };
        }

        return baseStyle;
    };

    const initRecordBox = (perspective: PerspectiveModel, perspectiveIndex: number) => {
        const cellStyle: React.CSSProperties = {
            ...BASE_CELL_STYLE,
            paddingLeft: "8px",
            paddingRight: "8px",
            minWidth: "96px",
            maxWidth: "96px",
            justifyContent: "center",
            ...initCurrentCellStyle(perspectiveIndex),
            textAlign: "center",
            cursor: "pointer"
        };

        const cells = viewIds.map(viewId => (
            <Box key={`perspective-record_${perspective.perspectiveId}-${viewId}`}
                sx={cellStyle} {...initRecordClickHandler(perspective)}>
                <Checkbox checked={perspective.containsModel(viewId)}
                    onClick={handlePreventMouseEvent}
                    onDoubleClick={handlePreventMouseEvent}
                    onChange={initHandleChange(perspective, viewId)} />
            </Box>
        ));

        return (
            <Stack key={`perspective-record_${perspective.perspectiveId}`}
                direction="column" sx={{ alignItems: "center", justifyContent: "center" }}
                draggable={perspectiveModels.length > 1}
                {...initDragEventHandler(perspectiveIndex)}>
                {cells}
            </Stack>
        );
    };

    const handleScroll = () => {
        if (!headerScrollRef.current || !columnScrollRef.current) {
            return;
        }

        headerScrollRef.current.scrollLeft = columnScrollRef.current.scrollLeft;
    };

    const settingTable = (perspectiveModels.length > 0) ? (
        <Stack direction="column" sx={{ overflow: 'hidden' }}>
            {tableHeader}
            <Box sx={SCROLL_STYLE}>
                <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "flex-start" }}>
                    <Box sx={{ position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #e0e0e0' }}>
                        {attributeHeaders}
                    </Box>
                    <Box ref={columnScrollRef} onScroll={handleScroll} sx={{ overflow: 'auto' }}>
                        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "flex-start" }}>
                            {perspectiveModels.map((perspectiveModel, index) =>
                                initRecordBox(perspectiveModel, index))}
                        </Stack>
                    </Box>
                </Stack>
            </Box>
        </Stack>
    ) : (
        <>
            <Typography>No perspectives.</Typography>
            <Alert severity="info">
                Perspectives help you:<br />
                - Group tables and memos by functionality<br />
                - Display only relevant information<br />
                - Manage multiple views of your design
            </Alert>
        </>
    );

    const handleAddPerspective = () => {
        setTargetPerspective(null);
        setOpenEditDialog(true);
    };

    const initHandleShiftColumn = (shift: (1 | -1)) => {
        return () => {
            if ((selectedIndex + shift < 0) || (selectedIndex + shift >= perspectiveModels.length)) {
                return;
            }

            setPerspectiveModels(previous => {
                const nextModels = [...previous]
                nextModels[selectedIndex] = perspectiveModels[selectedIndex + shift];
                nextModels[selectedIndex + shift] = perspectiveModels[selectedIndex];

                return nextModels;
            });
        };
    };

    const handleRemoveIndex = () => setPerspectiveModels(
        previousModels => previousModels.filter((_, indexIndex) => (selectedIndex !== indexIndex))
    );

    const operationPanel = (
        <Stack direction="row" sx={{ justifyContent: "space-between", margin: 1, marginBottom: 0.5 }}>
            <EdgedIconButton tooltip="Add perspective" withText onClick={handleAddPerspective}>
                <AddIcon />
            </EdgedIconButton>

            <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
                <EdgedIconButton tooltip="Edit perspective" disabled={selectedIndex < 0}
                    onClick={() => setOpenEditDialog(true)}>
                    <EditIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move forward" disabled={selectedIndex <= 0}
                    onClick={initHandleShiftColumn(-1)}>
                    <ArrowBackIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Move backward"
                    disabled={(selectedIndex < 0) || (selectedIndex >= perspectiveModels.length - 1)}
                    onClick={initHandleShiftColumn(1)}>
                    <ArrowForwardIcon fontSize="small" />
                </EdgedIconButton>
                <EdgedIconButton tooltip="Remove perspective" disabled={selectedIndex < 0}
                    onClick={handleRemoveIndex}>
                    <DeleteIcon fontSize="small" />
                </EdgedIconButton>
            </Stack>
        </Stack>
    );

    const handleCompleted = () => {
        const nextErdSettingModel = erdSettingModel.update({ perspectiveModels });

        const loggingMessage = "Update perspective setting: " +
            JSON.stringify({ before: erdSettingModel.getPerspectiveModels(), after: perspectiveModels });
        documentsHolder.updateErdSetting(nextErdSettingModel, loggingMessage);

        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Perspective</DialogTitle>
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
            {isOpenEditDialog && <PerspectiveEditDialog
                isOpen={isOpenEditDialog}
                perspectiveModel={targetPerspective}
                onUpdatePerspective={setPerspectiveModels}
                onClose={() => setOpenEditDialog(false)}
            />}
        </Dialog>
    );
};

const BASE_CELL_STYLE: React.CSSProperties = {
    display: "flex",
    borderBottomColor: "#e0e0e0",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    borderCollapse: "separate",
    colorScheme: "lightDark",
    padding: "6px 16px",
    alignItems: "center",
    textAlign: "left",
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.43,
    letterSpacing: "0.01071em",
    minHeight: "30px",
    maxHeight: "30px"
};

const initHeaderStyle = (width: number): React.CSSProperties => {
    return {
        ...BASE_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        minHeight: "48px",
        maxHeight: "48px"
    };
};

const initAttributeHeadCell = (
    keyPrefix: string, recordType: string, recordName: string,
    background: ColorValue, foreground: ColorValue
) => {
    return (
        <Stack key={`perspective-table_attribute_${keyPrefix}`} direction="row" >
            <Box sx={initTitleStyle(25, background, foreground)}>{recordType}</Box>
            <Box sx={{
                ...initTitleStyle(170, background, foreground),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
            }}>{recordName}</Box>
        </Stack>
    );
};

const RECORD_TITLE_STYLE = {
    maxHeight: "24px", overflow: "hidden",
    textOverflow: "ellipsis", whiteSpace: "nowrap"
};

const initTitleStyle = (
    width: number, backgroundColor: ColorValue, foregroundColor: ColorValue
): React.CSSProperties => {
    return {
        ...BASE_CELL_STYLE,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        backgroundColor: backgroundColor.toRgba(),
        color: foregroundColor.toRgba()
    };
};

const SCROLL_STYLE = {
    overflow: 'auto',
    '&::-webkit-scrollbar': { width: '8px', },
    '&::-webkit-scrollbar-track': { background: '#f1f1f1', },
    '&::-webkit-scrollbar-thumb': { background: '#c1c1c1', borderRadius: '4px', },
    '&::-webkit-scrollbar-thumb:hover': { background: '#a8a8a8', }
};

type PerspectiveEditDialogProps = {
    isOpen: boolean,
    perspectiveModel?: PerspectiveModel | null,
    onUpdatePerspective: (updateFunction: ((previous: PerspectiveModel[]) => PerspectiveModel[])) => void,
    onClose: () => void
};

const PerspectiveEditDialog = ({
    isOpen, perspectiveModel: perspective, onUpdatePerspective, onClose
}: PerspectiveEditDialogProps) => {

    const [perspectiveName, setPerspectiveName] = React.useState<string>(perspective ? perspective.perspectiveName : "");
    const [description, setDescription] = React.useState<string>(perspective ? perspective.description : "");

    const editValueValidated = (perspectiveName.length > 0);

    const handleCompleted = () => {
        if (!editValueValidated) {
            return;
        }

        onUpdatePerspective(previousModels => {
            if (perspective == null) {
                return [...previousModels, PerspectiveModel.create(perspectiveName, description)];
            }

            const nextPerspectiveModel = perspective.update(perspectiveName, description);

            return previousModels.map(previous =>
                (previous.perspectiveId === perspective.perspectiveId)
                    ? nextPerspectiveModel : previous
            );
        });

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleCompleted);

    return (
        <Dialog fullWidth maxWidth="sm" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit Perspective</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <TextField required fullWidth variant="outlined"
                        label="Perspective Name" value={perspectiveName}
                        onChange={event => setPerspectiveName(event.target.value)}
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

export default PerspectiveView;
