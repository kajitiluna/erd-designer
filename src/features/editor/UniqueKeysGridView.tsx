import { v4 as uuidV4 } from 'uuid';
import React from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl,
    InputLabel, MenuItem, Select, SelectChangeEvent, Stack, TableCell, TextField
} from '@mui/material';

import BaseGridView from '~/components/BaseGridView';
import { ColumnShareModelStorageContext } from '~/context/ColumnShareModelStorageContext';
import ColumnShareModel from '~/models/database/ColumnShareModel';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import { Database } from '~/models/database/DatabaseType';
import { SortOrderType } from '~/models/database/ValueType';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';
import ColumnTransferPanel from '~/features/editor/ColumnTransferPanel';
import { initGridColumnHeaders } from '~/features/editor/view-support';
import { ColumnWrapModel, initHandleChangePhysicalName, initHandleEnterKeyDown } from '~/features/editor/support';
import { overrideColumnName } from '~/models/database/support';

type UniqueKeysGridViewProps = {
    database: Database,
    columnWrapModels: ColumnWrapModel[],
    tableUniqueKeysModels: TableUniqueKeysModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableUniqueKeysModels: (updateFunction: ((previous: TableUniqueKeysModel[]) => TableUniqueKeysModel[])) => void
};

const UniqueKeysGridView = ({
    database, columnWrapModels, tableUniqueKeysModels,
    isChildRelation, onUpdateTableUniqueKeysModels
}: UniqueKeysGridViewProps) => {

    const { columnShareStorage } = React.useContext(ColumnShareModelStorageContext);
    const [onEditingModel, setEditingModel] = React.useState<TableUniqueKeysModel | null>(null);

    const columnModels: SimpleColumnModel[] = columnWrapModels.flatMap(model => {
        if (model.modelType === "single") {
            return [model.columnModel];
        }
        if (model.modelType === "struct") {
            return []; // struct はユニーク制約の候補から除外する
        }

        return model.columnModels;
    });

    // 各ユニークキーに対する列順序のマッピングを計算
    const uniqueKeysModelWithOrders = React.useMemo(() => {
        const existedColumnModelIds = new Set(columnModels.map(columnModel => columnModel.columnModelId));

        return tableUniqueKeysModels.map(uniqueModel => {
            const columnIdToOrder = new Map<string, string>(uniqueModel.uniqueKeysColumnModels
                .filter(columnModel => existedColumnModelIds.has(columnModel.columnModelId))
                .map((columnModel, index) => [columnModel.columnModelId, `${index + 1}`])
            );

            return { uniqueKeysModelId: uniqueModel.tableUniqueKeysModelId, columnIdToOrder };
        });
    }, [columnModels, tableUniqueKeysModels]);

    // ヘッダ情報
    const { headerTitle, attributeHeaders }
        = initGridColumnHeaders(columnModels, columnShareStorage, isChildRelation);

    const records = uniqueKeysModelWithOrders.map(uniqueKeysModelWithOrder => {
        const { uniqueKeysModelId, columnIdToOrder } = uniqueKeysModelWithOrder;

        return {
            key: uniqueKeysModelId,
            findAttribute: (columnModelId: string) => {
                return {
                    value: columnIdToOrder.get(columnModelId) || ""
                };
            }
        };
    });

    const doFindUniqueKeysModel = (uniqueKeysModelId: string) =>
        tableUniqueKeysModels.find(model => (model.tableUniqueKeysModelId === uniqueKeysModelId));

    const operations = {
        onAdd: () => {
            const newModel = new TableUniqueKeysModel({
                tableUniqueKeysModelId: uuidV4(),
                uniqueKeysColumnModels: []
            });

            setEditingModel(newModel);
        },
        onEdit: (uniqueKeysModelId: string) => {
            const uniqueKeysModel = doFindUniqueKeysModel(uniqueKeysModelId);
            if (uniqueKeysModel == null) {
                console.warn(`TableUniqueKeysModel not found for tableUniqueKeysModelId: ${uniqueKeysModelId}`);
                return;
            }

            setEditingModel(uniqueKeysModel);
        },
        onRemove: (uniqueKeysModelId: string) => {
            onUpdateTableUniqueKeysModels(previousModels =>
                previousModels.filter(model => (model.tableUniqueKeysModelId !== uniqueKeysModelId))
            );
        }
    };

    return (
        <>
            <BaseGridView
                modelName="unique constraint"
                headerTitle={headerTitle}
                attributeHeaders={attributeHeaders}
                records={records}
                operations={operations}
                onUpdateRecords={onUpdateTableUniqueKeysModels}
            />
            {(onEditingModel != null) && (
                <UniqueKeysEditDialog
                    isOpen={onEditingModel != null}
                    database={database}
                    tableUniqueKeysModel={onEditingModel}
                    columnModels={columnModels}
                    isChildRelation={isChildRelation}
                    onUpdateTableUniqueKeysModels={onUpdateTableUniqueKeysModels}
                    onClose={() => setEditingModel(null)}
                />)}
        </>
    );
};

type UniqueKeysEditDialogProps = {
    isOpen: boolean,
    database: Database,
    tableUniqueKeysModel: TableUniqueKeysModel,
    columnModels: SimpleColumnModel[],
    isChildRelation: (columnModelId: string) => boolean,
    onUpdateTableUniqueKeysModels: (updateFunction: ((previous: TableUniqueKeysModel[]) => TableUniqueKeysModel[])) => void,
    onClose: () => void
};

type UniqueKeysModelAttribute = {
    columnModelId: string,
    sortOrderType: SortOrderType
}

const UniqueKeysEditDialog = ({
    isOpen, database, tableUniqueKeysModel, columnModels,
    isChildRelation, onUpdateTableUniqueKeysModels, onClose
}: UniqueKeysEditDialogProps) => {

    const [physicalName, setPhysicalName] = React.useState<string>(tableUniqueKeysModel.physicalName);
    const [uniqueKeysColumns, setUniqueKeysColumns] = React.useState<UniqueKeysModelAttribute[]>(
        tableUniqueKeysModel.uniqueKeysColumnModels.filter(model =>
            columnModels.some(columnModel =>
                (columnModel.columnModelId === model.columnModelId)
            )
        ).map(model => {
            return {
                columnModelId: model.columnModelId,
                sortOrderType: model.sortOrderType
            };
        })
    );
    const [description, setDescription] = React.useState<string>(tableUniqueKeysModel.description);

    const handleNewUniqueKeysColumn = (columnModelId: string): UniqueKeysModelAttribute => {
        return {
            columnModelId: columnModelId,
            sortOrderType: ""
        };
    };

    const handleRenderUniqueKeysColumn = (
        arg: {
            indexedColumn: UniqueKeysModelAttribute,
            columnModel: SimpleColumnModel,
            columnShareModel: ColumnShareModel
        },
        arrayIndex: number
    ) => {
        const { indexedColumn, columnModel, columnShareModel } = arg;

        const columnModelId = columnModel.columnModelId;
        const columnName = overrideColumnName(columnModel, columnShareModel);
        const inChildRelation = isChildRelation(columnModel.columnModelId);

        const handleChangeSortOrder = (event: SelectChangeEvent) => {
            const nextSortOrderType = event.target.value as SortOrderType;
            setUniqueKeysColumns(previousColumns =>
                previousColumns.map(previous =>
                    (previous.columnModelId !== columnModelId) ? previous : {
                        columnModelId: previous.columnModelId,
                        sortOrderType: nextSortOrderType
                    }
                )
            );
        };

        return (
            <>
                <TableCell align="right" sx={{ width: 10 }}>{arrayIndex + 1}</TableCell>
                <TableCell>{columnName.physicalName}</TableCell>
                <TableCell>{columnShareModel.specifiedColumnType(inChildRelation)}</TableCell>
                {database.uniqueKeySupport.orderable && (
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
                )}
            </>
        );
    };

    const transferPanel = (
        <ColumnTransferPanel
            columnModels={columnModels}
            indexedColumns={uniqueKeysColumns}
            isChildRelation={isChildRelation}
            onNewIndexedColumn={handleNewUniqueKeysColumn}
            onRenderIndexedColumn={handleRenderUniqueKeysColumn}
            onUpdateIndexedColumns={setUniqueKeysColumns}
        />
    );

    // 複合一意キーの設定なので、少なくとも2つのカラムが必要
    const editValueValidated = (uniqueKeysColumns.length > 1);

    const handleCompleted = () => {
        if (editValueValidated === false) {
            return;
        }

        const nextTableUniqueKeysModel = new TableUniqueKeysModel({
            tableUniqueKeysModelId: tableUniqueKeysModel.tableUniqueKeysModelId,
            physicalName: physicalName,
            description: description,
            uniqueKeysColumnModels: uniqueKeysColumns.map(model => new UniqueKeysColumnModel({
                columnModelId: model.columnModelId,
                sortOrderType: model.sortOrderType
            }))
        });

        onUpdateTableUniqueKeysModels(previousModels => {
            let hasChanged = false;
            const nextModels = previousModels.map(previous => {
                if (previous.tableUniqueKeysModelId !== tableUniqueKeysModel.tableUniqueKeysModelId) {
                    return previous;
                }

                hasChanged = true;
                return nextTableUniqueKeysModel;
            });

            return hasChanged ? nextModels : [...previousModels, nextTableUniqueKeysModel];
        });

        onClose();
    };

    return (
        <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
            open={isOpen} onClose={onClose}>
            <DialogTitle>Edit unique key constraint</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <TextField id="physicalName" label="Physical Name" fullWidth
                        variant="outlined" sx={{ flex: 1 }} value={physicalName}
                        onChange={initHandleChangePhysicalName(setPhysicalName)}
                        onKeyDown={initHandleEnterKeyDown(handleCompleted)} />
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

export default UniqueKeysGridView;