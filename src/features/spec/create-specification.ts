import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";

const createSpecification = (erdDocument: ErdDocument) => {

    const sheetNameMapping = initSheetNameMapping(erdDocument);
    const findSheetName = (tableName: string) => sheetNameMapping.get(tableName) ?? tableName;

    // テーブル一覧
    const exportTables = initExportAllTablesGenerator(erdDocument);
    // カラム一覧
    const exportColumns = initExportAllColumnsGenerator(erdDocument);
    // テーブル詳細
    const exportTableSpecs = initExportTableSpecsGenerator(erdDocument);

    return { findSheetName, exportTables, exportColumns, exportTableSpecs };
};

const initSheetNameMapping = (erdDocument: ErdDocument) => {
    const existedSheetNames = new Set<string>();

    return new Map(erdDocument.getTableViewModels()
        .map(tableView => {
            const tableModel = tableView.tableModel;
            const defaultSheetName = (tableModel.physicalName.length > 30)
                ? tableModel.physicalName.substring(0, 30) : tableModel.physicalName;

            let sheetName = defaultSheetName;
            if (existedSheetNames.has(sheetName)) {
                const currentTime = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 17);
                const tempValue = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
                sheetName = `${currentTime}${tempValue}`;
            }

            existedSheetNames.add(sheetName);

            return [tableModel.physicalName, sheetName];
        })
    );
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
    for (const columnModel of erdDocument.toAllColumnModels(tableModel)) {
        const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            continue;
        }

        const parentRelation = erdDocument.findParentRelation(tableModel.tableModelId, columnModel.columnModelId);

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
            defaultValue: columnModel.defaultValue,
            foreignRelation: initForeignRelation(erdDocument, parentRelation),
            description: columnShareModel.description,
        };
    }
};

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
            const columnModel = erdDocument.findColumnModel(model.columnModelId);
            if (columnModel == null) {
                return null;
            }

            const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
            if (columnShareModel == null) {
                return null;
            }

            return {
                physicalName: columnShareModel.physicalName,
                sortOrder: model.sortOrderType,
                nullsOrder: model.nullsOrderType ? `NULLS ${model.nullsOrderType}` : ""
            }
        }).filter(indexedColumn => (indexedColumn != null));

        yield {
            indexName: tableIndex.physicalName,
            indexType: tableIndex.indexType,
            indexOption: tableIndex.indexOption,
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