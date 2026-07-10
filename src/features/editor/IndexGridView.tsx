import { v4 as uuidV4 } from 'uuid';
import React from "react";
import {
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, FormControlLabel, InputLabel, MenuItem, Select, SelectChangeEvent, Stack,
    TableCell, TextField
} from "@mui/material";

import ColumnModel from "~/models/database/ColumnModel";
import TableIndexModel, { IndexColumnModel } from "~/models/database/TableIndexModel";
import { ColumnShareModelStorageContext } from "~/context/ColumnShareModelStorageContext";
import TableIndexSupport, { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import {
    ColumnWrapModel, initHandleChangePhysicalName,
    initHandleCloseDialog, initHandleEnterKeyDown
} from "~/features/editor/support";
import ColumnShareModel from '~/models/database/ColumnShareModel';
import { overrideColumnName } from '~/models/database/support';
import { Database } from '~/models/database';
import { NullsOrderType, SortOrderType } from '~/models/database/ValueType';
import BaseGridView from '~/components/BaseGridView';
import ColumnTransferPanel from '~/features/editor/ColumnTransferPanel';
import { initGridColumnHeaders } from '~/features/editor/view-support';

type IndexGridViewProps = {
    database: Database,
    columnWrapModels: ColumnWrapModel[],
    tableIndexModels: TableIndexModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void
};

const IndexGridView = ({
    database, columnWrapModels, tableIndexModels, isChildRelation, onUpdateTableIndexModels
}: IndexGridViewProps) => {

    const { columnShareModelStorage } = React.useContext(ColumnShareModelStorageContext);
    const [onEditingModel, setEditingModel] = React.useState<TableIndexModel | null>(null);

    const columnModels: ColumnModel[] = columnWrapModels.flatMap(model => {
        if (model.modelType === "single") {
            return [model.columnModel];
        }
        if (model.modelType === "struct") {
            return []; // struct はインデックス候補から除外する
        }

        return model.columnModels;
    });

    // 各インデックスに対する列順序のマッピングを計算
    const indexModelWithOrders = React.useMemo(() => {
        const existedColumnModelIds = new Set(columnModels.map(columnModel => columnModel.columnModelId));

        return tableIndexModels.map(tableIndexModel => {
            const columnIdToOrder = new Map<string, string>(tableIndexModel.indexColumnModels
                .filter(indexColumnModel => existedColumnModelIds.has(indexColumnModel.columnModelId))
                .map((indexColumnModel, index) => [indexColumnModel.columnModelId, `${index + 1}`])
            );

            return { indexModelId: tableIndexModel.tableIndexModelId, columnIdToOrder };
        });
    }, [columnModels, tableIndexModels]);

    // ヘッダ情報
    const { headerTitle, attributeHeaders }
        = initGridColumnHeaders(columnModels, columnShareModelStorage, isChildRelation);

    const records = indexModelWithOrders.map(indexModelWithOrder => {
        const { indexModelId, columnIdToOrder } = indexModelWithOrder;

        return {
            key: indexModelId,
            findAttribute: (columnModelId: string) => {
                return {
                    value: columnIdToOrder.get(columnModelId) || ""
                };
            }
        };
    });

    const doFindIndexModel = (indexModelId: string) =>
        tableIndexModels.find(model => (model.tableIndexModelId === indexModelId));

    const operations = {
        onAdd: () => {
            const newModel = new TableIndexModel({
                tableIndexModelId: uuidV4(),
                physicalName: "",
                indexColumnModels: [],
            });

            setEditingModel(newModel);
        },
        onEdit: (indexModelId: string) => {
            const indexModel = doFindIndexModel(indexModelId);
            if (indexModel == null) {
                console.warn(`TableIndexModel not found for tableIndexModelId: ${indexModelId}`);
                return;
            }

            setEditingModel(indexModel);
        },
        onRemove: (indexModelId: string) => {
            onUpdateTableIndexModels(previousModels =>
                previousModels.filter(model => (model.tableIndexModelId !== indexModelId))
            );
        }
    };

    return (
        <>
            <BaseGridView
                modelName="index"
                headerTitle={headerTitle}
                attributeHeaders={attributeHeaders}
                records={records}
                operations={operations}
                onUpdateRecords={onUpdateTableIndexModels}
            />
            {(onEditingModel != null) && (
                <IndexEditDialog
                    isOpen={onEditingModel != null}
                    database={database}
                    tableIndexModel={onEditingModel}
                    columnModels={columnModels}
                    isChildRelation={isChildRelation}
                    onUpdateTableIndexModels={onUpdateTableIndexModels}
                    onClose={() => setEditingModel(null)}
                />)}
        </>
    );
};

type IndexEditDialogProps = {
    isOpen: boolean,
    database: Database,
    tableIndexModel: TableIndexModel,
    columnModels: ColumnModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableIndexModels: (updateFunction: ((previous: TableIndexModel[]) => TableIndexModel[])) => void,
    onClose: () => void
};

type IndexModelAttribute = {
    columnModelId: string,
    sortOrderType: SortOrderType,
    nullsOrderType: NullsOrderType
}

const IndexEditDialog = ({
    isOpen, database, tableIndexModel, columnModels,
    isChildRelation, onUpdateTableIndexModels, onClose
}: IndexEditDialogProps) => {

    const [indexOption, setIndexOption] = React.useState<TableIndexOption>(tableIndexModel.indexOption);
    const [indexType, setIndexType] = React.useState<TableIndexType>(tableIndexModel.indexType);
    const [clustered, setClustered] = React.useState<boolean>(tableIndexModel.clustered);
    const [physicalName, setPhysicalName] = React.useState<string>(tableIndexModel.physicalName);
    const [indexedColumns, setIndexedColumns] = React.useState<IndexModelAttribute[]>(
        tableIndexModel.indexColumnModels.filter(model =>
            columnModels.some(columnModel =>
                (columnModel.columnModelId === model.columnModelId)
            )
        )
    );
    const [description, setDescription] = React.useState<string>(tableIndexModel.description);

    const tableIndexSupport: TableIndexSupport = database.tableIndexSupport;

    const indexOptionPanel = (
        <Stack direction="row" spacing={2}>
            {tableIndexSupport.indexOptions.map(targetOption => (
                <FormControlLabel key={`index_option_${targetOption}`} label={targetOption} control={
                    <Checkbox checked={targetOption === indexOption}
                        onChange={event => setIndexOption((event.target.checked ? targetOption : ""))} />
                } />
            ))}
            {tableIndexSupport.supportsClustered && (
                <FormControlLabel label="CLUSTERED" control={
                    <Checkbox checked={clustered}
                        onChange={event => setClustered(event.target.checked)} />
                } />
            )}
        </Stack>
    );

    const handleChangeIndexType = (event: SelectChangeEvent) => {
        const nextIndexType = event.target.value as TableIndexType;
        setIndexType(nextIndexType);
    }
    const tableIndexForm = (tableIndexSupport.indexTypes.length > 0) ? (
        <FormControl fullWidth sx={{ flex: 1 }}>
            <InputLabel id="index-type">Index Type</InputLabel>
            <Select label="Index Type" labelId="index-type"
                value={indexType} onChange={handleChangeIndexType}>
                <MenuItem value="">(Default)</MenuItem>
                {tableIndexSupport.indexTypes.map(targetIndexType => (
                    <MenuItem key={`index_type/${targetIndexType}`}
                        value={targetIndexType}>{targetIndexType}</MenuItem>
                ))}
            </Select>
        </FormControl>
    ) : (<></>);

    const handleNewIndexedColumn = (columnModelId: string): IndexModelAttribute => {
        return {
            columnModelId: columnModelId,
            sortOrderType: "",
            nullsOrderType: ""
        };
    };

    const handleRenderIndexedColumn = (
        arg: {
            indexedColumn: IndexModelAttribute,
            columnModel: ColumnModel,
            columnShareModel: ColumnShareModel
        },
        arrayIndex: number
    ) => {
        const { indexedColumn, columnModel, columnShareModel } = arg;

        const columnModelId = columnModel.columnModelId;
        const columnName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModelId);

        const handleChangeSortOrder = (event: SelectChangeEvent) => {
            const nextSortOrderType = event.target.value as SortOrderType;
            setIndexedColumns(previousColumns =>
                previousColumns.map(previous =>
                    (previous.columnModelId !== columnModelId) ? previous : {
                        columnModelId: previous.columnModelId,
                        sortOrderType: nextSortOrderType,
                        nullsOrderType: previous.nullsOrderType
                    }
                )
            );
        };
        const handleChangeNullsOrder = (event: SelectChangeEvent) => {
            const nextNullsOrderType = event.target.value as NullsOrderType;
            setIndexedColumns(previousColumns =>
                previousColumns.map(previous =>
                    (previous.columnModelId !== columnModelId) ? previous : {
                        columnModelId: previous.columnModelId,
                        sortOrderType: previous.sortOrderType,
                        nullsOrderType: nextNullsOrderType
                    }
                )
            );
        };

        return (
            <>
                <TableCell align="right" sx={{ width: 10 }}>{arrayIndex + 1}</TableCell>
                <TableCell>{columnName.physicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                <TableCell>
                    <FormControl fullWidth size="small">
                        <InputLabel id={`sort-order-${columnModelId}`}>Sort Order</InputLabel>
                        <Select label="Sort order" labelId={`sort-order-${columnModelId}`}
                            value={indexedColumn.sortOrderType} onChange={handleChangeSortOrder}>
                            <MenuItem value="">(Default)</MenuItem>
                            <MenuItem value="ASC">ASC</MenuItem>
                            <MenuItem value="DESC">DESC</MenuItem>
                        </Select>
                    </FormControl>
                </TableCell>
                {database.tableIndexSupport.nullsOrder && <TableCell>
                    <FormControl fullWidth size="small">
                        <InputLabel id={`nulls-order-${columnModelId}`}>Nulls Order</InputLabel>
                        <Select label="Null order" labelId={`nulls-order-${columnModelId}`}
                            value={indexedColumn.nullsOrderType} onChange={handleChangeNullsOrder}>
                            <MenuItem value="">(Default)</MenuItem>
                            <MenuItem value="FIRST">FIRST</MenuItem>
                            <MenuItem value="LAST">LAST</MenuItem>
                        </Select>
                    </FormControl>
                </TableCell>}
            </>
        );
    };

    const transferPanel = (
        <ColumnTransferPanel
            columnModels={columnModels}
            indexedColumns={indexedColumns}
            isChildRelation={isChildRelation}
            onNewIndexedColumn={handleNewIndexedColumn}
            onRenderIndexedColumn={handleRenderIndexedColumn}
            onUpdateIndexedColumns={setIndexedColumns} />
    );

    const editValueValidated = (physicalName.length > 0) && (indexedColumns.length > 0)
    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const nextTableIndexModel = new TableIndexModel({
            tableIndexModelId: tableIndexModel.tableIndexModelId,
            physicalName: physicalName,
            indexColumnModels: indexedColumns.map(model => new IndexColumnModel({ ...model })),
            indexOption: indexOption,
            indexType: indexType,
            clustered: clustered,
            description: description
        });

        onUpdateTableIndexModels(previousModels => {
            let hasChanged = false;
            const nextModels = previousModels.map(previous => {
                if (previous.tableIndexModelId !== tableIndexModel.tableIndexModelId) {
                    return previous;
                }

                hasChanged = true;
                return nextTableIndexModel;
            });

            return hasChanged ? nextModels : [...previousModels, nextTableIndexModel];
        });

        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
            open={isOpen} onClose={initHandleCloseDialog(onClose)}>
            <DialogTitle>Edit table index</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    {indexOptionPanel}
                    <Stack direction="row" spacing={2} sx={{ justifyContent: "center", alignItems: "center" }}>
                        <TextField id="physicalName" label="Physical Name" required fullWidth
                            variant="outlined" sx={{ flex: 1 }} value={physicalName}
                            onChange={initHandleChangePhysicalName(setPhysicalName)}
                            onKeyDown={initHandleEnterKeyDown(handleCompleted)} />
                        {tableIndexForm}
                    </Stack>
                    {transferPanel}
                    <TextField id="description" variant="outlined" label="Description"
                        multiline rows={3} slotProps={{ input: { style: { resize: 'vertical' } } }}
                        value={description} onChange={event => setDescription(event.target.value)} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => onClose()}>Cancel</Button>
                <Button variant="contained" disabled={!editValueValidated} onClick={handleCompleted}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

export default IndexGridView;