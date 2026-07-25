import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider,
    FormControlLabel, Paper, Stack, TableCell, TableHead, TableRow, TextField, Typography
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

import EdgedIconButton from '~/components/EdgedIconButton';
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import {
    toColumnWrapModels, initHandleChangeWithSyncPhysicalName,
    initHandleCloseDialog, initHandleEnterKeyDown, ColumnWrapModel,
    validateNameColumnWraps,
    initializeValidateNonRecursive
} from "~/features/editor/support";
import ColumnViewTable from "~/features/editor/ColumnViewTable";
import { useOverrideNamePanel } from "~/features/editor/view-support";
import ColumnEntry from "~/models/database/ColumnEntry";
import ColumnModel from '~/models/database/ColumnModel';
import StructColumnModel from "~/models/database/StructColumnModel";
import StructColumnShareModel from "~/models/database/StructColumnShareModel";
import ColumnModelStorage from '~/models/ColumnModelStorage';
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ErdDocument from "~/models/ErdDocument";
import { overrideColumnName } from '~/models/database/support';
import { useInitializeSearchDialog } from '~/features/editor/SearchContentDialog';

type StructColumnEditDialogProps = {
    isOpen: boolean;
    structColumn: StructColumnModel;
    structNestCount: number;
    ancestorStructShareIds: readonly string[];
    onUpdateWrapColumnModels: (updateFunction: (previous: ColumnWrapModel[]) => ColumnWrapModel[]) => void;
    onClose: () => void;
};

const StructColumnEditDialog = ({
    isOpen, structColumn, structNestCount, ancestorStructShareIds, onUpdateWrapColumnModels, onClose
}: StructColumnEditDialogProps) => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);

    const { columnShareStorage, updateShareStorage, columnStorage, updateColumnStorage } =
        React.useContext(ColumnShareModelStorageContext);

    const erdDocument = documentsHolder.current();
    const structShare = columnShareStorage.findStructShare(structColumn.structShareModelId);

    const [checkedNotNull, setNotNull] = React.useState<boolean>(structColumn.notNull);
    const [structShareId, setStructShareId] = React.useState<string>(structColumn.structShareModelId);
    const [physicalName, setPhysicalName] = React.useState<string>(structShare ? structShare.physicalName : "");
    const [logicalName, setLogicalName] = React.useState<string>(structShare ? structShare.logicalName : "");
    const [isArray, setArray] = React.useState<boolean>(structShare ? structShare.isArray : false);
    const [columnWrapModels, setColumnWrapModels] = React.useState<ColumnWrapModel[]>(
        initColumnWrapModels(erdDocument, columnShareStorage, columnStorage, structColumn)
    );
    const [description, setDescription] = React.useState<string>(structShare ? structShare.description : "");

    const validateNonRecursive = initializeValidateNonRecursive(erdDocument, columnShareStorage, columnStorage);

    // 自身を祖先に含める。配下の struct が同じ share を再び参照すれば、それが再帰の定義そのもの。
    // share 未確定 (新規作成中) は参照されようがないため除外する。
    const ancestorStructShareIdsWithSelf = (structShareId.length === 0)
        ? ancestorStructShareIds : [...ancestorStructShareIds, structShareId];

    const validStruct = (columnWraps: ColumnWrapModel[]) => {
        const isValidName = validateNameColumnWraps(columnWraps, erdDocument, columnShareStorage);
        if (isValidName === false) {
            return false;
        }

        return validateNonRecursive(columnWraps, ancestorStructShareIdsWithSelf)
    };

    const validatedValue = (physicalName.length > 0) && (logicalName.length > 0)
        && (columnWrapModels.length > 0) && validStruct(columnWrapModels);

    const handleCompleted = (overriddenName: { physical: string, logical: string }) => {
        if (validatedValue === false) {
            return;
        }

        const columnEntries: ColumnEntry[] = columnWrapModels.map(wrapModel => {
            if ((wrapModel.modelType === "single") || (wrapModel.modelType === "struct")) {
                return { modelType: "single", columnModelId: wrapModel.columnModel.columnModelId };
            }

            return { modelType: "group", columnGroupId: wrapModel.columnGroupModel.columnGroupId };
        });

        const updatedShare = new StructColumnShareModel({
            structShareModelId: structShareId ? structShareId : uuidV4(),
            physicalName: physicalName,
            logicalName: logicalName.trim(),
            columnEntries: columnEntries,
            isArray: isArray,
            description: description.trim()
        });

        const updatedColumn = new StructColumnModel({
            columnModelId: structColumn.columnModelId,
            structShareModelId: updatedShare.structShareModelId,
            physicalName: overriddenName.physical,
            logicalName: overriddenName.logical.trim(),
            notNull: checkedNotNull
        });

        onUpdateWrapColumnModels(previousColumns => {
            const previousColumnIds = new Set(previousColumns
                .flatMap(column => (column.modelType === "struct") ? [column.columnModel.columnModelId] : [])
            );

            // 新規の場合は追加
            if (previousColumnIds.has(updatedColumn.columnModelId) === false) {
                return [...previousColumns, { modelType: "struct", columnModel: updatedColumn }];
            }

            return previousColumns.map(previous =>
                (
                    (previous.modelType === "struct") &&
                    (previous.columnModel.columnModelId === updatedColumn.columnModelId)
                ) ? { modelType: "struct", columnModel: updatedColumn } : previous
            );
        });

        // このセッションで確定したメンバー ColumnModel を、テーブル編集完了時まで持ち越すため蓄積する。
        // (struct のメンバーは columnShareModelStorage には載らず、document の columnModelMap へ
        // 直接反映される必要があるため、テーブル側のアキュムレータに合流させる)
        updateColumnStorage(previous => {
            const nextColumns = columnWrapModels.flatMap(wrapModel => {
                return (wrapModel.modelType === "group") ? [] : [wrapModel.columnModel];
            });


            return previous.addColumn(nextColumns);
        });

        updateShareStorage(columnShareStorage.addStructShare(updatedShare));
        onClose();
    };

    const { overriddenPanel, overriddenName } = useOverrideNamePanel({
        physicalName: structColumn.physicalName,
        logicalName: structColumn.logicalName,
        onCompleted: handleCompleted
    });

    const columnNamePanel = (
        <Stack direction="row" spacing={2}>
            <FormControlLabel label="Not Null" sx={{ flex: 2 }} control={
                <Checkbox checked={checkedNotNull} onChange={event => setNotNull(event.target.checked)} />} />
            <Box sx={{ flex: 10 }} >{overriddenPanel}</Box>
        </Stack>
    );

    const handleEnterDown = initHandleEnterKeyDown(() => handleCompleted(overriddenName));

    // 論理名が物理名と合致もしくは論理名が空の場合は、論理名に物理名の値を設定する
    const handleChangePhysicalName: ((event: React.ChangeEvent<HTMLInputElement>) => void)
        = initHandleChangeWithSyncPhysicalName({
            physicalName: physicalName, setPhysicalName: setPhysicalName,
            logicalName: logicalName, setLogicalName: setLogicalName
        });

    const structShareNamePanel = (
        <Stack direction="row" spacing={1}>
            <TextField label="Physical Name" required fullWidth variant="outlined" sx={{ flex: 5 }}
                value={physicalName} onChange={handleChangePhysicalName} onKeyDown={handleEnterDown} />
            <TextField label="Logical Name" required fullWidth variant="outlined" sx={{ flex: 5 }}
                value={logicalName} onChange={event => setLogicalName(event.target.value)}
                onKeyDown={handleEnterDown} />
            <FormControlLabel label="isArray" sx={{ flex: 2 }} control={
                <Checkbox checked={isArray} onChange={event => setArray(event.target.checked)} />} />
        </Stack>
    );

    const associateStructColumn = (nextStruct: StructColumnShareModel) => {
        const nextColumnWraps = toColumnWrapModels(erdDocument, nextStruct, columnStorage)

        setStructShareId(nextStruct.structShareModelId);
        setPhysicalName(nextStruct.physicalName);
        setLogicalName(nextStruct.logicalName);
        setArray(nextStruct.isArray);
        setColumnWrapModels(nextColumnWraps);
        setDescription(nextStruct.description);
    };

    const attributePanel = (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Stack direction="column" spacing={1}>
                <StructColumnModelPanel
                    structShareId={structShareId}
                    associateStructColumn={associateStructColumn}
                    unlinkColumnModel={() => setStructShareId("")} />
                {structShareNamePanel}
                <Box sx={{ width: "100%", display: "flex", flexDirection: "column", paddingTop: 2, paddingBottom: 2 }}>
                    <ColumnViewTable columnWrapModels={columnWrapModels} structNestCount={structNestCount + 1}
                        ancestorStructShareIds={ancestorStructShareIdsWithSelf}
                        availableColumnGroup={true} availableKeyConstraints={false}
                        isChildRelation={() => false} isEditableColumnType={() => true}
                        onUpdateColumnWrapModels={setColumnWrapModels} onUpdateCheckExpression={() => { }} />
                </Box>
                <TextField variant="outlined" label="Description"
                    multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                    value={description} onChange={event => setDescription(event.target.value)} />
            </Stack>
        </Paper>
    );

    const handleCloseDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="xl" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit struct column{structNestCount > 0 ? ` (${structNestCount + 1})` : ""}</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    {columnNamePanel}
                    {attributePanel}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button variant="contained" disabled={!validatedValue}
                    onClick={() => handleCompleted(overriddenName)}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

const initColumnWrapModels = (
    erdDocument: ErdDocument, columnShareStorage: ColumnShareModelStorage, columnStorage: ColumnModelStorage,
    columnStruct: StructColumnModel
): ColumnWrapModel[] => {
    const structShare = columnShareStorage.findStructShare(columnStruct.structShareModelId);
    if (structShare == null) {
        return [];
    }

    return toColumnWrapModels(erdDocument, structShare, columnStorage);
};

type StructColumnModelPanelProps = {
    structShareId: string;
    associateStructColumn: (nextStruct: StructColumnShareModel) => void;
    unlinkColumnModel: () => void;
};

const StructColumnModelPanel = ({
    structShareId, associateStructColumn, unlinkColumnModel
}: StructColumnModelPanelProps) => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { columnShareStorage, columnStorage } = React.useContext(ColumnShareModelStorageContext);

    const [isOpenDialog, setOpenDialog] = React.useState<"search" | "unlink" | "">("");

    const erdDocument = documentsHolder.current();
    const handleFiltering = useInitFilteringHandler(erdDocument, columnShareStorage, columnStorage);
    const initRecord = useInitRecordInitializer(erdDocument, columnShareStorage, columnStorage);

    const searchDialog = useInitializeSearchDialog({
        dialogTitle: "Search struct column model",
        tableHeader: searchTableHeader,
        identity: toStructShareId,
        onFiltering: handleFiltering,
        initRecord: initRecord
    });

    const searchButton = (<>
        <EdgedIconButton
            tooltip="Search for column model to be associated"
            onClick={() => { setOpenDialog("search") }}>
            <SearchIcon />
        </EdgedIconButton>
        {searchDialog({
            isOpen: (isOpenDialog === "search"),
            onCompleted: associateStructColumn,
            onClose: () => setOpenDialog("")
        })}
    </>);

    const structShare = columnShareStorage.findStructShare(structShareId);
    if (structShare == null) {
        return (
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Typography variant="body2">Create new struct column :</Typography>
                {searchButton}
            </Stack>
        );
    }

    const handleOpenUnlinkDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpenDialog("unlink");
    };
    const handleCloseUnlinkDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpenDialog("")
    };
    const handleCompletedUnlink = (event: React.MouseEvent) => {
        event.stopPropagation();

        unlinkColumnModel();
        setOpenDialog("");
    };

    const unlinkDialog = (
        <Dialog open={isOpenDialog === "unlink"} onClose={handleCloseUnlinkDialog}>
            <DialogTitle>Unlink column model?</DialogTitle>
            <DialogContent>
                <DialogContentText>Are you sure to unlink the struct column model ?</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseUnlinkDialog}>Cancel</Button>
                <Button variant="contained" color="warning" onClick={handleCompletedUnlink}>Unlink</Button>
            </DialogActions>
        </Dialog>
    );

    return (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography variant="body2">Associated with :</Typography>
            <Chip variant="outlined" color="primary" label={structShare.logicalName}
                onDelete={handleOpenUnlinkDialog} />
            {searchButton}
            {unlinkDialog}
        </Stack>
    );
};

const searchTableHeader = (
    <TableHead>
        <TableRow>
            <TableCell sx={{ width: "12px" }} align="center"></TableCell>
            <TableCell>Physical Struct Name</TableCell>
            <TableCell>Logical Struct Name</TableCell>
            <TableCell>Physical Field Name</TableCell>
            <TableCell>Logical Field Name</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Description</TableCell>
        </TableRow>
    </TableHead>
);

const toStructShareId = (structShare: StructColumnShareModel) => structShare.structShareModelId;

const useInitFilteringHandler = (
    erdDocument: ErdDocument, columnShareStorage: ColumnShareModelStorage, columnStorage: ColumnModelStorage
) => {
    const structShareModels = columnShareStorage.getStructShareModels();

    const initSearchEntry = React.useCallback((columnId: string) => {
        const column = columnStorage.findColumn(columnId) || erdDocument.findColumnModel(columnId);
        if (column == null) {
            return [];
        }

        if (ColumnModel.isStructColumn(column)) {
            const structShare = columnShareStorage.findStructShare(column.structShareModelId);
            if (structShare == null) {
                return [];
            }

            const overrideName = overrideColumnName(column, structShare);
            return [{
                physicalName: overrideName.physicalName,
                logicalName: overrideName.logicalName,
                columnType: structShare.simpleColumnType(),
                description: structShare.description
            }];
        }

        const columnShare = columnShareStorage.findColumnShare(column.columnShareModelId);
        if (columnShare == null) {
            return [];
        }

        const overrideName = overrideColumnName(column, columnShare);
        return [{
            physicalName: overrideName.physicalName,
            logicalName: overrideName.logicalName,
            columnType: columnShare.specifiedColumnType(),
            description: columnShare.description
        }];
    }, [columnShareStorage, columnStorage, erdDocument]);

    const searchingEntryMap = React.useMemo(() => new Map(structShareModels.map(structShare => {
        const structEntry = {
            physicalName: structShare.physicalName,
            logicalName: structShare.logicalName,
            columnType: structShare.simpleColumnType(),
            description: structShare.description
        };
        const innerColumns = structShare.columnEntries.flatMap(entry => {
            if (entry.modelType === "single") {
                return initSearchEntry(entry.columnModelId);
            }

            const columnGroup = erdDocument.findColumnGroupModel(entry.columnGroupId);
            if (columnGroup == null) {
                return [];
            }

            return columnGroup.columnModelIds.flatMap(columnId => initSearchEntry(columnId));
        });

        return [structShare.structShareModelId, [structEntry, ...innerColumns]];
    })), [structShareModels, erdDocument, initSearchEntry]);

    return React.useCallback((keywords: string[]) => {
        if (keywords.length === 0) {
            return structShareModels;
        }

        return structShareModels.filter(structShare => {
            const searchEntries = searchingEntryMap.get(structShare.structShareModelId);
            if (searchEntries == null) {
                return false;
            }

            return searchEntries.some(entry => {
                return keywords.some(keyword => {
                    return entry.physicalName.includes(keyword) || entry.logicalName.includes(keyword)
                        || entry.columnType.includes(keyword) || entry.description.includes(keyword);
                });
            });
        });
    }, [structShareModels, searchingEntryMap]);
};

const useInitRecordInitializer = (
    erdDocument: ErdDocument, columnShareStorage: ColumnShareModelStorage, columnStorage: ColumnModelStorage
) => {

    const initInnerColumnRecord = React.useCallback((
        columnId: string, attributes: React.ComponentProps<typeof TableRow>
    ) => {
        const column = columnStorage.findColumn(columnId) || erdDocument.findColumnModel(columnId)
        if (column == null) {
            return [];
        }

        if (ColumnModel.isStructColumn(column)) {
            const structShare = columnShareStorage.findStructShare(column.structShareModelId);
            if (structShare == null) {
                return [];
            }

            const overrideName = overrideColumnName(column, structShare);
            return [(
                <TableRow key={`search-struct_struct-${column.columnModelId}`} {...attributes} >
                    <TableCell>{overrideName.physicalName}</TableCell>
                    <TableCell>{overrideName.logicalName}</TableCell>
                    <TableCell>{structShare.simpleColumnType()}</TableCell>
                    <TableCell>{structShare.description}</TableCell>
                </TableRow>
            )];
        }

        const columnShare = columnShareStorage.findColumnShare(column.columnShareModelId);
        if (columnShare == null) {
            return [];
        }

        const overrideName = overrideColumnName(column, columnShare);
        return [(
            <TableRow key={`search-struct_simple-${column.columnModelId}`} {...attributes} >
                <TableCell>{overrideName.physicalName}</TableCell>
                <TableCell>{overrideName.logicalName}</TableCell>
                <TableCell>{columnShare.specifiedColumnType()}</TableCell>
                <TableCell>{columnShare.description}</TableCell>
            </TableRow>
        )];
    }, [columnShareStorage, columnStorage, erdDocument]);

    return React.useCallback((
        structShare: StructColumnShareModel, selected: boolean, attributes: React.ComponentProps<typeof TableRow>
    ) => {
        const innerColumns = structShare.columnEntries.flatMap(entry => {
            if (entry.modelType === "single") {
                return initInnerColumnRecord(entry.columnModelId, attributes);
            }

            const columnGroup = erdDocument.findColumnGroupModel(entry.columnGroupId);
            if (columnGroup == null) {
                return [];
            }

            return columnGroup.columnModelIds.flatMap(columnId => initInnerColumnRecord(columnId, attributes));
        });

        const spanSize = innerColumns.length + 1;

        const structRow = (
            <TableRow key={`search-struct_${structShare.structShareModelId}`} {...attributes} >
                <TableCell align="center" rowSpan={spanSize}>{selected && "✔"}</TableCell>
                <TableCell rowSpan={spanSize}>{structShare.physicalName}</TableCell>
                <TableCell rowSpan={spanSize}>{structShare.logicalName}</TableCell>
                <TableCell></TableCell>
                <TableCell></TableCell>
                <TableCell>{structShare.simpleColumnType()}</TableCell>
                <TableCell>{structShare.description}</TableCell>
            </TableRow>
        );

        return [structRow, ...innerColumns];
    }, [erdDocument, initInnerColumnRecord]);
};

export default StructColumnEditDialog;
