import { DatabaseType } from "~/models/database/DatabaseType";
import { SchemaWarning } from "~/models/schema/schema-snapshot";

export type SchemaDiff = {
    differences: readonly SchemaDifference[];
    warnings: readonly SchemaWarning[];
};

/**
 * 差分1件の片側が示す状態。
 * 「値が無い」ことを文字列(旧 "-" / "exists")で表すとユーザが .erd に書いた値と衝突するため、
 * 状態は判別可能な union として持ち、文字列は「実際の値」だけを運ぶ。
 */
export type DifferenceValue =
    | { state: "value", text: string }
    | { state: "blank" }
    | { state: "absent" }
    | { state: "present" };

export type SchemaDifference = {
    category: DifferenceCategory;
    schemaName: string;
    tableName: string;
    targetName: string;
    expected: DifferenceValue;
    actual: DifferenceValue;
};

export type DifferenceCategory =
    "schema.missing" | "schema.unexpected"
    | "table.missing" | "table.unexpected" | "table.comment"
    | "column.missing" | "column.unexpected" | "column.type" | "column.nullability"
    | "column.default" | "column.autoIncrement" | "column.comment" | "column.logicalName"
    | "primaryKey"
    | "uniqueKey.missing" | "uniqueKey.unexpected" | "uniqueKey.columns"
    | "index.missing" | "index.unexpected" | "index.columns" | "index.type"
    | "foreignKey.missing" | "foreignKey.unexpected" | "foreignKey.reference";


export type SchemaDiffFormat = "text" | "json" | "markdown";

export type SchemaDiffReportContext = {
    direction: SchemaDiffDirection;
    databaseType: DatabaseType;
    expectedLabel: string;
    actualLabel: string;
    expectedTableCount: number;
    ignoredTableNames: readonly string[];
};

/**
 * 差分の向き。db-diff は設計→実DB、erd-diff は設計(現在)→設計(比較元リビジョン)。
 * missing/unexpected の表示語も、expected/actual の表示列の並びも、この1つの値で決まる
 * (SchemaComparison.compare() 自体は方向中立に保ち、翻訳を出力層に閉じ込める)。
 */
export type SchemaDiffDirection = "designToDatabase" | "designToRevision";
