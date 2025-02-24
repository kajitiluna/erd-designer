import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";

const createSpecification = (erdDocument: ErdDocument) => {

    // テーブル一覧
    const exportTables = initExportAllTablesGenerator(erdDocument);
    // カラム一覧
    const exportColumns = initExportAllColumnsGenerator(erdDocument);
    // テーブル詳細
    const exportTableSpecs = initExportTableSpecsGenerator(erdDocument);

    return { exportTables, exportColumns, exportTableSpecs };
};

/**
 * テーブル一覧を出力するジェネレータを作成する。
 * 
 * @param erdDocument 
 * @returns 
 */
const initExportAllTablesGenerator = (erdDocument: ErdDocument) => function* () {
    for (const tableView of erdDocument.getTableViewModels()) {
        const tableModel = tableView.tableModel;
        yield {
            physicalName: tableModel.physicalName,
            logicalName: tableModel.logicalName,
            description: tableModel.description
        };
    }
};

/**
 * カラム一覧を出力するジェネレータを作成する。
 * 
 * @param erdDocument 
 * @returns 
 */
const initExportAllColumnsGenerator = (erdDocument: ErdDocument) => function* () {
    for (const tableView of erdDocument.getTableViewModels()) {
        const exportColumns = initExportColumnGenerator(erdDocument, tableView.tableModel)

        yield* exportColumns();
    }
};

const initExportColumnGenerator = (erdDocument: ErdDocument, tableModel: TableModel) => function* () {
    for (const columnModelId of tableModel.columnModelIds) {
        const columnInfo = doFindColumnInfo(erdDocument, columnModelId);
        if (columnInfo == null) {
            continue;
        }

        const { columnModel, columnShareModel } = columnInfo;
        const parentRelation = erdDocument.findParentRelation(columnModel.columnModelId);

        yield {
            physicalTableName: tableModel.physicalName,
            logicalTableName: tableModel.logicalName,
            physicalColumnName: columnShareModel.physicalName,
            logicalColumnName: columnShareModel.logicalName,
            columnType: columnShareModel.columnType.name,
            precision: columnShareModel.precision ? Number(columnShareModel.precision) : null,
            scale: columnShareModel.scale ? Number(columnShareModel.scale) : null,
            unsigned: columnShareModel.unsigned ? "✓" : "",
            primaryKey: columnModel.primaryKey ? "✓" : "",
            notNull: columnModel.notNull ? "✓" : "",
            unique: columnModel.unique ? "✓" : "",
            autoIncrement: columnModel.autoIncrement ? "✓" : "",
            defaultValue: columnShareModel.defaultValue,
            foreignRelation: initForeignRelation(erdDocument, parentRelation),
            description: columnShareModel.description,
        };
    }
};

const doFindColumnInfo = (erdDocument: ErdDocument, columnModelId: string) => {
    const columnModel = erdDocument.findColumnModel(columnModelId);
    if (columnModel == null) {
        return null;
    }

    const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShareModel == null) {
        return null;
    }

    return { columnModel, columnShareModel };
}

const initForeignRelation = (erdDocument: ErdDocument, parentRelation: ParentRelation | null) => {
    if (parentRelation == null) {
        return null;
    }

    const parentTable = erdDocument.findTableViewModel(parentRelation.tableModelId);
    if (parentTable == null) {
        return null;
    }

    const parentColumn = erdDocument.findColumnModel(parentRelation.columnModelId);
    if (parentColumn == null) {
        return null;
    }
    const parentColumnShare = erdDocument.findColumnShareModel(parentColumn.columnShareModelId);
    if (parentColumnShare == null) {
        return null;

    }

    return `-> ${parentTable.tableModel.physicalName}.${parentColumnShare.physicalName}`;
};

/**
 * テーブル詳細仕様を出力するジェネレータを作成する。
 * 
 * @param erdDocument 
 * @returns 
 */
const initExportTableSpecsGenerator = (erdDocument: ErdDocument) => function* () {
    for (const tableView of erdDocument.getTableViewModels()) {
        const tableModel = tableView.tableModel;
        const exportColumns = initExportColumnGenerator(erdDocument, tableModel)
        const exportTableIndexes = initExportTableIndexesGenerator(erdDocument, tableModel);

        yield {
            physicalName: tableModel.physicalName,
            logicalName: tableModel.logicalName,
            description: tableModel.description,
            exportColumns: exportColumns,
            exportTableIndexes: exportTableIndexes
        };
    }
};

const initExportTableIndexesGenerator = (erdDocument: ErdDocument, tableModel: TableModel) => function* () {
    for (const tableIndex of tableModel.tableIndexModels) {
        const indexedColumns = tableIndex.indexColumnModels.map(model => {
            const columnInfo = doFindColumnInfo(erdDocument, model.columnModelId);
            if (columnInfo == null) {
                return null;
            }

            const { columnShareModel } = columnInfo;

            return {
                physicalName: columnShareModel.physicalName,
                sortOrder: model.sortOrderType,
                nullsOrder: model.nullsOrderType ? `NULLS ${model.nullsOrderType}` : ""
            }
        }).filter(indexedColumn => (indexedColumn != null));

        yield {
            indexName: tableIndex.physicalName,
            indexType: tableIndex.indexType,
            indexOption: tableIndex.indexOptioin,
            description: tableIndex.description,
            indexedColumns: indexedColumns
        };
    }
};

type ParentRelation = {
    tableModelId: string,
    columnModelId: string
};

export default createSpecification;