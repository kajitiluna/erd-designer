import { DatabaseType } from "~/models/database";
import { TableIndexType } from "~/models/database/TableIndexSupport";
import { SortOrderType } from "~/models/database/ValueType";

// 仕様書の自動採番列ヘッダ。ColumnEditDialog が使う Database.autoIncrementLabel() は
// DB ごとの正式名称 (例: "Generated Always As Identity") で、Excel / スプレッドシートの
// 列幅に収まらず帳票の見た目を壊すため、仕様書では Identity / Increment の 2 語に固定する。
// Identity と呼ぶのは MS SQL Server のみ。空文字は自動採番機能を持たない DB を表し、列自体を出力しない。
export const autoIncrementLabel = (databaseType: DatabaseType): string => {
    if (databaseType === "ms_sqlserver") {
        return "Identity";
    }

    if ((databaseType === "sqlite") || (databaseType === "bigquery")) {
        return "";
    }

    return "Increment";
};

export type TableListSpecGenerator = Generator<TableListSpec, void, unknown>
type TableListSpec = {
    physicalName: string;
    logicalName: string;
    description: string;
};

export type ColumnListSpecGenerator = Generator<ColumnListSpec, void, unknown>;

/** Column attributes that are exported only when at least one column in the scope actually uses them. */
export type OptionalColumnAttribute = "characterSet" | "collate" | "checkExpression" | "optionExpression";

export type ColumnListSpec = {
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
    characterSet: string;
    collate: string;
    checkExpression: string;
    optionExpression: string;
};

export type TableDetailSpecGenerator = Generator<TableDetailSpec, void, unknown>;

/** Table-level options. An empty string means "not set" and is not exported. */
export type TableOptionSpec = {
    characterSet: string;
    collate: string;
    checkExpression: string;
    definitionExpression: string;
    optionExpression: string;
};

export type TableDetailSpec = {
    physicalName: string;
    logicalName: string;
    description: string;
    usedColumnAttributes: readonly OptionalColumnAttribute[];
    tableOptions: TableOptionSpec;
    exportColumns: () => ColumnListSpecGenerator;
    exportUniqueKeys: () => UniqueKeyConstraintSpecGenerator;
    exportTableIndexes: () => TableIndexSpecGenerator;
};

export type UniqueKeyConstraintSpecGenerator = Generator<UniqueKeyConstraintSpec, void, unknown>;
export type UniqueKeyConstraintSpec = {
    constraintName: string;
    description: string;
    uniqueKeyColumns: {
        physicalName: string;
        sortOrder: SortOrderType;
    }[];
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