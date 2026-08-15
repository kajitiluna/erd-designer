import { DatabaseType } from "~/models/database/DatabaseType";
import { TableReferenceActionType } from "~/models/database/RelationModel";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { DdlCommentStyle } from "~/models/ExportDdlSettingModel";

/**
 * 比較対象の範囲。ExportDdlSettingModel の既定(すべて true)に一致させる。
 * withTable 相当のフラグは持たない。すべての比較を止めるのは実行しないのと同義のため。
 * withIndex/withForeignKey/withComment/withSchema/withLogicalName の5つは互いに独立な属性であり、
 * 状態遷移の1つの側面ではないため単一 union には畳まない
 * (coding-style ルール16の対象外 — TableModel の primaryKey/notNull/unique と同じ性質)。
 * commentStyle だけは性質が異なる: 比較する/しないを切り替える範囲フラグではなく、
 * 「コメント文言をどう解釈するか」という比較の意味づけそのものを運ぶ。
 */
export type SchemaCompareScope = {
    withIndex: boolean;
    withForeignKey: boolean;
    withComment: boolean;
    withSchema: boolean;
    /** 論理名比較。実DBは論理名を持たないため db-diff では false に固定する。 */
    withLogicalName: boolean;
    /**
     * ExportDdlSetting.commentStyle と同じ値。commentStyle="logical_name" のとき comment は論理名そのものであり、
     * logicalName 差分との二重報告抑止の判定に使う(schema-diff.ts の compareColumnPair 参照)。
     */
    commentStyle: DdlCommentStyle;
};

export type SchemaSnapshot = {
    databaseType: DatabaseType;
    schemaNames: string[];
    tables: TableSnapshot[];
    /** スナップショット構築時に表現しきれなかった事実。差分ではないため終了コードに影響しない。 */
    warnings: SchemaWarning[];
};

export type TableSnapshot = {
    schemaName: string;
    tableName: string;
    logicalName: string;
    comment: string;
    columns: ColumnSnapshot[];
    primaryKeyColumnNames: string[];
    uniqueKeys: UniqueKeySnapshot[];
    indexes: IndexSnapshot[];
    foreignKeys: ForeignKeySnapshot[];
};

export type ColumnSnapshot = {
    columnName: string;
    logicalName: string;
    /** ColumnType.specifiedType() を通した正規化済みの大文字表現。自前で組み立てない。 */
    typeExpression: string;
    unsigned: boolean;
    notNull: boolean;
    defaultValue: string;
    autoIncrement: boolean;
    comment: string;
};

export type UniqueKeySnapshot = {
    /** 両側とも非空のときだけ比較する。設計側は TableUniqueKeysModel.physicalName の既定が "" のため。 */
    constraintName: string;
    columnNames: string[];
};

export type IndexSnapshot = {
    indexName: string;
    columnNames: string[];
    indexOption: TableIndexOption;
    indexType: TableIndexType;
};

export type ForeignKeySnapshot = {
    /**
     * 設計側は常に "" になる。create-ddl.ts の foreignKeyQueryForAlter は
     * `ADD FOREIGN KEY (...)` を出力するだけで制約名を持たないため、照合キーには使わない。
     */
    constraintName: string;
    columnNames: string[];
    parentSchemaName: string;
    parentTableName: string;
    parentColumnNames: string[];
    onUpdate: TableReferenceActionType;
    onDelete: TableReferenceActionType;
};

type SchemaWarningCategory =
    "column.order" | "name.caseFolded" | "type.unresolved"
    | "index.unsupported" | "struct.skipped" | "enumValues.ignored" | "zeroFill.ignored"
    | "databaseType.mismatch";

export type SchemaWarning = {
    category: SchemaWarningCategory;
    schemaName: string;
    tableName: string;
    message: string;
};
