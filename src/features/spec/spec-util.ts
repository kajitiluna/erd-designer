import { TableIndexType } from "~/models/database/TableIndexSupport";
import { SortOrderType } from "~/models/database/ValueType";

export type TableListSpecGenerator = Generator<TableListSpec, void, unknown>
type TableListSpec = {
    physicalName: string;
    logicalName: string;
    description: string;
};

export type ColumnListSpecGenerator = Generator<ColumnListSpec, void, unknown>;
type ColumnListSpec = {
    physicalTableName: string;
    logicalTableName: string;
    physicalColumnName: string;
    logicalColumnName: string;
    columnType: string;
    precision: number | null;
    scale: number | null;
    unsigned: string;
    primaryKey: string;
    notNull: string;
    unique: string;
    autoIncrement: string;
    defaultValue: string;
    foreignRelation: string | null;
    description: string;
};

export type TableDetailSpecGenerator = Generator<TableDetailSpec, void, unknown>;
export type TableDetailSpec = {
    physicalName: string;
    logicalName: string;
    description: string;
    exportColumns: () => ColumnListSpecGenerator;
    exportTableIndexes: () => TableIndexSpecGenerator;
};

export type TableIndexSpecGenerator = Generator<TableIndexSpec, void, unknown>;
export type TableIndexSpec = {
    indexName: string;
    indexType: TableIndexType;
    indexOption: string;
    description: string;
    indexedColumns: {
        physicalName: string;
        sortOrder: SortOrderType;
        nullsOrder: string;
    }[];
};