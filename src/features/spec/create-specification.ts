import ErdDocument from "~/models/ErdDocument";
import DbSchemaModel from "~/models/database/DbSchemaModel";
import TableModel from "~/models/database/TableModel";
import { overrideColumnName } from "~/models/database/support";

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
    const defaultSchema = erdDocument.findDefaultSchema();
    const existedSheetNames = new Set<string>();

    return new Map(erdDocument.getTableViewModels()
        .map(tableView => {
            const tableModel = tableView.tableModel;
            const schemaModel = erdDocument.findSchema(tableModel.schemaId);
            const tableNameWithSchema = initTablePhysicalName(tableModel, schemaModel);

            // デフォルトスキーマの場合は、シート名にスキーマ名を付与しない
            const baseSheetName = (
                ((defaultSchema == null) && (schemaModel == null))
                || ((defaultSchema != null) && (defaultSchema.schemaId === schemaModel?.schemaId))
            ) ? tableModel.physicalName : tableNameWithSchema;

            const defaultSheetName = (baseSheetName.length > 30)
                ? baseSheetName.substring(0, 30) : baseSheetName;

            let sheetName = defaultSheetName;
            if (existedSheetNames.has(sheetName)) {
                const currentTime = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 17);
                const tempValue = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
                sheetName = `${currentTime}${tempValue}`;
            }

            existedSheetNames.add(sheetName);

            return [tableNameWithSchema, sheetName];
        })
    );
};

const sortTableViews = (erdDocument: ErdDocument) => {
    const tableViews = erdDocument.getTableViewModels();
    const defaultSchema = erdDocument.findDefaultSchema();

    return tableViews.sort((first, second) => {
        const firstSchema = erdDocument.findSchema(first.tableModel.schemaId);
        const secondSchema = erdDocument.findSchema(second.tableModel.schemaId);

        const firstSchemaIsDefault = (first.tableModel.schemaId === "")
            || (firstSchema == null)
            || (firstSchema.schemaId === defaultSchema?.schemaId);
        const secondSchemaIsDefault = (second.tableModel.schemaId === "")
            || (secondSchema == null)
            || (secondSchema.schemaId === defaultSchema?.schemaId);

        if ((first.tableModel.schemaId === second.tableModel.schemaId)
            || (firstSchemaIsDefault && secondSchemaIsDefault)) {
            return first.tableModel.physicalName.localeCompare(second.tableModel.physicalName);
        }

        if (firstSchemaIsDefault) {
            return -1;
        }
        if (secondSchemaIsDefault) {
            return 1;
        }

        const nameCompared = firstSchema.schemaName.localeCompare(secondSchema.schemaName);
        if (nameCompared !== 0) {
            return nameCompared;
        }

        return firstSchema.schemaId.localeCompare(secondSchema.schemaId);
    });
}

const initTablePhysicalName = (tableModel: TableModel, schemaModel: DbSchemaModel | null) => {
    if (schemaModel == null) {
        return tableModel.physicalName;
    }

    return `${schemaModel.schemaName}.${tableModel.physicalName}`;
};

/**
 * テーブル一覧を出力するジェネレータを作成する。
 * 
 * @param erdDocument 
 * @returns 
 */
const initExportAllTablesGenerator = (erdDocument: ErdDocument) => function* () {
    const tableViews = sortTableViews(erdDocument);
    for (const tableView of tableViews) {
        const tableModel = tableView.tableModel;
        const schemaModel = erdDocument.findSchema(tableModel.schemaId);

        yield {
            physicalName: initTablePhysicalName(tableModel, schemaModel),
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
    const tableViews = sortTableViews(erdDocument);
    for (const tableView of tableViews) {
        const exportColumns = initExportColumnGenerator(erdDocument, tableView.tableModel)

        yield* exportColumns();
    }
};

const initExportColumnGenerator = (erdDocument: ErdDocument, tableModel: TableModel) => function* () {
    const schemaModel = erdDocument.findSchema(tableModel.schemaId);

    for (const columnModel of erdDocument.toAllColumnModels(tableModel)) {
        const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
        if (columnShareModel == null) {
            continue;
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);
        const parentRelation = erdDocument.findParentRelation(tableModel.tableModelId, columnModel.columnModelId);

        yield {
            physicalTableName: initTablePhysicalName(tableModel, schemaModel),
            logicalTableName: tableModel.logicalName,
            physicalColumnName: overrideName.physicalName,
            logicalColumnName: overrideName.logicalName,
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
    const tableViews = sortTableViews(erdDocument);
    for (const tableView of tableViews) {
        const tableModel = tableView.tableModel;
        const schemaModel = erdDocument.findSchema(tableModel.schemaId);

        const exportColumns = initExportColumnGenerator(erdDocument, tableModel)
        const exportUniqueKeys = initExportUniqueKeysConstraintsGenerator(erdDocument, tableModel);
        const exportTableIndexes = initExportTableIndexesGenerator(erdDocument, tableModel);

        yield {
            physicalName: initTablePhysicalName(tableModel, schemaModel),
            logicalName: tableModel.logicalName,
            description: tableModel.description,
            exportColumns: exportColumns,
            exportUniqueKeys: exportUniqueKeys,
            exportTableIndexes: exportTableIndexes
        };
    }
};

const initExportUniqueKeysConstraintsGenerator = (
    erdDocument: ErdDocument, tableModel: TableModel
) => function* () {
    for (const uniqueKeysModel of tableModel.uniqueKeysModels) {
        const uniqueKeyColumns = uniqueKeysModel.uniqueKeysColumnModels.map(model => {
            const columnModel = erdDocument.findColumnModel(model.columnModelId);
            if (columnModel == null) {
                return null;
            }

            const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
            if (columnShareModel == null) {
                return null;
            }

            const overrideName = overrideColumnName(columnModel, columnShareModel);

            return {
                physicalName: overrideName.physicalName,
                sortOrder: model.sortOrderType
            };
        }).filter(uniqueKeyColumn => (uniqueKeyColumn != null));

        yield {
            constraintName: uniqueKeysModel.physicalName,
            description: uniqueKeysModel.description,
            uniqueKeyColumns: uniqueKeyColumns
        };
    }
}

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

            const overrideName = overrideColumnName(columnModel, columnShareModel);

            return {
                physicalName: overrideName.physicalName,
                sortOrder: model.sortOrderType,
                nullsOrder: model.nullsOrderType ? `NULLS ${model.nullsOrderType}` : ""
            };
        }).filter(indexedColumn => (indexedColumn != null));

        const indexOption = [tableIndex.indexOption, (tableIndex.clustered ? "CLUSTERED" : "")]
            .filter(value => (value !== ""))
            .join(" | ");

        yield {
            indexName: tableIndex.physicalName,
            indexType: tableIndex.indexType,
            indexOption: indexOption,
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