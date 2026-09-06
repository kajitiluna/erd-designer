import type { SqlConnection, SqlQueryRow } from "~/cli/introspect/sql-connection";
import { DatabaseType } from "~/models/database/DatabaseType";
import { TableReferenceActionType } from "~/models/database/RelationModel";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import { ColumnSnapshots, DatabaseColumnFacts } from "~/models/schema/column-snapshot";
import {
    ForeignKeySnapshot, IndexSnapshot, SchemaCompareScope, SchemaSnapshot, SchemaWarning,
    TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";

/** SELECT で取得した生行の束。方言固有の型付けは行わず、そのまま toSnapshot に渡す。 */
export type MySqlRawRows = {
    tables: SqlQueryRow[];
    columns: SqlQueryRow[];
    indexColumns: SqlQueryRow[];
    foreignKeys: SqlQueryRow[];
    versionRows: SqlQueryRow[];
};

export class MySqlIntrospector {

    private readonly connection: SqlConnection;

    constructor(connection: SqlConnection) {
        this.connection = connection;
    }

    /** SELECT のみを発行し、正規化は行わない。接続の生存期間は関知しない(open/close は DbDriver の責務)。 */
    public async fetchSnapshot(databaseType: "mysql" | "mariadb", scope: SchemaCompareScope): Promise<SchemaSnapshot> {
        const databaseName = await this.fetchCurrentDatabaseName();
        const rawRows = await this.fetchRawRows(databaseName);

        return MySqlIntrospector.toSnapshot(rawRows, databaseType, scope);
    }

    private async fetchCurrentDatabaseName(): Promise<string> {
        const rows = await this.connection.selectRows(CURRENT_DATABASE_QUERY, []);
        const databaseName = rows[0]?.database_name;

        if (databaseName == null) {
            throw new Error("No database selected. Include the database name in the connection URL"
                + " (e.g. mysql://user@host:3306/<database>).");
        }

        return String(databaseName);
    }

    private async fetchRawRows(databaseName: string): Promise<MySqlRawRows> {
        const tables = await this.connection.selectRows(TABLES_QUERY, [databaseName]);
        const columns = await this.connection.selectRows(COLUMNS_QUERY, [databaseName]);
        const indexColumns = await this.connection.selectRows(INDEX_COLUMNS_QUERY, [databaseName]);
        const foreignKeys = await this.connection.selectRows(FOREIGN_KEYS_QUERY, [databaseName]);
        const versionRows = await this.connection.selectRows(VERSION_QUERY, []);

        return { tables, columns, indexColumns, foreignKeys, versionRows };
    }

    /**
     * 生行(I/O 層の戻り値)を中立表現へ変換する。DB 接続なしで検証できる公開 API はこれ 1 つ。
     * mysql/mariadb は supportsSchema===false のため、schemaNames とテーブルの schemaName は常に空にする
     * (設計側と対称。対象DBは常に接続が選んだDBで決まり、--schema は解釈されない)。
     */
    public static toSnapshot(
        rawRows: MySqlRawRows, databaseType: "mysql" | "mariadb", scope: SchemaCompareScope
    ): SchemaSnapshot {
        const tableRows = toTableRows(rawRows);
        const isActualMariaDb = toIsActualMariaDb(rawRows.versionRows);
        const tableResults = tableRows.map(row => toTableSnapshot(row, databaseType, scope));
        const databaseTypeMismatchWarning = toDatabaseTypeMismatchWarning(databaseType, isActualMariaDb);

        return {
            databaseType: databaseType,
            schemaNames: [],
            tables: tableResults.map(result => result.table),
            warnings: [
                ...((databaseTypeMismatchWarning != null) ? [databaseTypeMismatchWarning] : []),
                ...tableResults.flatMap(result => result.warnings)
            ]
        };
    }
}
const CURRENT_DATABASE_QUERY = "SELECT DATABASE() AS database_name";

const TABLES_QUERY = `\
SELECT
    TABLE_NAME AS table_name,
    TABLE_COMMENT AS table_comment
FROM information_schema.tables
WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;\
`;

const COLUMNS_QUERY = `\
SELECT
    TABLE_NAME AS table_name,
    COLUMN_NAME AS column_name,
    COLUMN_TYPE AS column_type,
    (IS_NULLABLE = 'NO') AS not_null,
    COLUMN_DEFAULT AS column_default,
    LOWER(EXTRA) AS extra,
    COLUMN_COMMENT AS comment
FROM information_schema.columns
WHERE TABLE_SCHEMA = ?
ORDER BY TABLE_NAME, ORDINAL_POSITION;\
`;

const INDEX_COLUMNS_QUERY = `\
SELECT
    TABLE_NAME AS table_name,
    INDEX_NAME AS index_name,
    COLUMN_NAME AS column_name,
    SEQ_IN_INDEX AS seq_in_index,
    (NON_UNIQUE = 1) AS non_unique,
    INDEX_TYPE AS index_type
FROM information_schema.statistics
WHERE TABLE_SCHEMA = ?
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;\
`;

const FOREIGN_KEYS_QUERY = `\
SELECT
    kcu.TABLE_NAME AS table_name,
    kcu.CONSTRAINT_NAME AS constraint_name,
    kcu.COLUMN_NAME AS column_name,
    kcu.ORDINAL_POSITION AS ordinal_position,
    kcu.REFERENCED_TABLE_NAME AS parent_table_name,
    kcu.REFERENCED_COLUMN_NAME AS parent_column_name,
    rc.UPDATE_RULE AS on_update,
    rc.DELETE_RULE AS on_delete
FROM information_schema.key_column_usage kcu
    JOIN information_schema.referential_constraints rc
        ON (
            rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
                AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        )
WHERE kcu.TABLE_SCHEMA = ?
    AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;\
`;

const VERSION_QUERY = "SELECT VERSION() AS version";

// information_schema.columns/statistics/key_column_usage は1行1(テーブル, 列)等の組で返るため、
// TABLE_NAME 単位でグループ化してから型付けする(coding-style ルール5の例外: Map への蓄積)。
const toTableRows = (rawRows: MySqlRawRows): MySqlTableRow[] => {
    const tableRows = rawRows.tables.map(raw => {
        return { tableName: String(raw.table_name), tableComment: String(raw.table_comment ?? "") };
    });

    const columnRows = rawRows.columns.map(raw => toColumnRow(raw));

    const indexColumnRows = rawRows.indexColumns.map(raw => {
        return {
            tableName: String(raw.table_name),
            indexName: String(raw.index_name),
            columnName: String(raw.column_name),
            seqInIndex: Number(raw.seq_in_index),
            unique: (toBoolean(raw.non_unique) === false),
            indexType: String(raw.index_type ?? "")
        };
    });

    const foreignKeyRows = rawRows.foreignKeys.map(row => {
        return {
            tableName: String(row.table_name),
            constraintName: String(row.constraint_name),
            columnName: String(row.column_name),
            ordinalPosition: Number(row.ordinal_position),
            parentTableName: String(row.parent_table_name),
            parentColumnName: String(row.parent_column_name),
            onUpdate: String(row.on_update),
            onDelete: String(row.on_delete)
        };
    });

    return tableRows.map(tableRow => {
        return {
            tableName: tableRow.tableName,
            tableComment: tableRow.tableComment,
            columns: columnRows.filter(row => (row.tableName === tableRow.tableName)),
            indexColumnRows: indexColumnRows.filter(row => (row.tableName === tableRow.tableName)),
            foreignKeyRows: foreignKeyRows.filter(row => (row.tableName === tableRow.tableName))
        };
    });
}

const toColumnRow = (raw: SqlQueryRow): MySqlColumnRow & { tableName: string } => {
    const extra = String(raw.extra ?? "");
    const rawDefault = (raw.column_default == null) ? null : String(raw.column_default);

    // EXTRA の "on update CURRENT_TIMESTAMP" は COLUMN_DEFAULT に含まれないため、
    // 設計側の defaultValue (ユーザが "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" と1つの文字列で入力する) と同じ形に組み立て直す。
    // "updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP" のように
    // DEFAULT 句を持たず ON UPDATE 句のみを持つ列も MySQL では正当なため、
    // DEFAULT と ON UPDATE の有無を独立に扱い、存在する句だけを連結する。
    const onUpdateMatch = ON_UPDATE_EXTRA_PATTERN.exec(extra);
    const onUpdateClause = (onUpdateMatch != null) ? `ON UPDATE ${onUpdateMatch[1]}` : "";
    const defaultParts = [rawDefault, onUpdateClause].filter(part => ((part != null) && (part !== "")));
    const mergedDefault = (defaultParts.length > 0) ? defaultParts.join(" ") : null;

    // MariaDB は CURRENT_TIMESTAMP 系の値を関数呼び出し形式 "current_timestamp()" で返すが、 MySQL は "CURRENT_TIMESTAMP" を返す。
    // デフォルト値・ON UPDATE 句のどちらに現れても同じ意味なので、比較のため両方とも MySQL の綴りに揃える。
    const columnDefault = (mergedDefault != null)
        ? mergedDefault.replace(CURRENT_TIMESTAMP_FUNCTION_PATTERN, "CURRENT_TIMESTAMP") : null;

    return {
        tableName: String(raw.table_name),
        columnName: String(raw.column_name),
        columnType: String(raw.column_type),
        isNotNull: toBoolean(raw.not_null),
        columnDefault: columnDefault,
        extra,
        comment: String(raw.comment ?? "")
    };
}

const ON_UPDATE_EXTRA_PATTERN = /on update (.+)$/i;
const CURRENT_TIMESTAMP_FUNCTION_PATTERN = /current_timestamp\(\)/gi;

// mysql2 は SQL の比較式(例: `IS_NULLABLE = 'NO'`)の結果を JS の boolean ではなく TINYINT 由来の number(0/1)で返す。
// MySQL には比較結果を表す独立した boolean 型が無いため。
// これを純粋層の型契約([~]: boolean)に漏らさないよう、生行 → 型付き行の変換で吸収する。
const toBoolean = (value: unknown): boolean => {
    return (value === true) || (value === 1) || (value === "1");
}

const toIsActualMariaDb = (versionRows: SqlQueryRow[]): boolean => {
    const version = String(versionRows[0]?.version ?? "");
    return version.toUpperCase().includes("MARIADB");
}

type MySqlTableRow = {
    tableName: string;
    tableComment: string;
    columns: MySqlColumnRow[];
    indexColumnRows: MySqlIndexColumnRow[];
    foreignKeyRows: MySqlForeignKeyRow[];
};

type MySqlColumnRow = {
    columnName: string;
    columnType: string;
    /** IS_NULLABLE = 'NO' の結果、つまり「NOT NULL であるか」。フィールド名は意味と一致させておく。 */
    isNotNull: boolean;
    columnDefault: string | null;
    // EXTRA (information_schema.columns.EXTRA)。小文字を想定(MySQL/MariaDB とも小文字で返す)。
    extra: string;
    comment: string;
};

// information_schema.statistics は1行=1(インデックス, 列)の組で返る。PRIMARY も同じ形で含む。
type MySqlIndexColumnRow = {
    indexName: string;
    columnName: string;
    seqInIndex: number;
    unique: boolean;
    // INDEX_TYPE。BTREE/HASH は索引方式(indexType)、FULLTEXT/SPATIAL は索引の種類(indexOption)に振り分ける (toMySqlIndexKind)
    indexType: string;
};

// key_column_usage + referential_constraints の JOIN。1行=1(制約, 列)の組
type MySqlForeignKeyRow = {
    constraintName: string;
    columnName: string;
    ordinalPosition: number;
    parentTableName: string;
    parentColumnName: string;
    onUpdate: string;
    onDelete: string;
};

const toTableSnapshot = (row: MySqlTableRow, erdDatabaseType: "mysql" | "mariadb", scope: SchemaCompareScope) => {
    const columnResult = toColumnSnapshots(row.columns, erdDatabaseType);
    const foreignKeys = scope.withForeignKey ? toForeignKeySnapshots(row.foreignKeyRows) : [];
    const groupedIndexes = groupIndexColumnRows(row.indexColumnRows, scope);

    // テーブルコメントは常に実値を持つ。
    // 設計側と比較する際の出し分けは schema-diff.ts が scope.withComment でゲートするため、
    // ここで潰すと migrate-ddl の comment 保持に必要な値を失う。
    const table: TableSnapshot = {
        schemaName: "",
        tableName: row.tableName,
        logicalName: "",
        comment: row.tableComment,
        columns: columnResult.columns,
        primaryKeyColumnNames: groupedIndexes.primaryKeyColumnNames,
        uniqueKeys: groupedIndexes.uniqueKeys,
        indexes: groupedIndexes.indexes,
        foreignKeys
    };

    const warnings = [...columnResult.warnings, ...groupedIndexes.warnings].map(warning => {
        return { ...warning, tableName: row.tableName };
    });

    return { table, warnings };
}

const toColumnSnapshots = (
    columnRows: readonly MySqlColumnRow[], erdDatabaseType: "mysql" | "mariadb"
) => {
    const results = columnRows.map(column => toColumnSnapshot(column, erdDatabaseType));

    return {
        columns: results.map(result => result.column),
        warnings: results.flatMap(result => result.warnings)
    };
}

const toColumnSnapshot = (
    columnRow: MySqlColumnRow, erdDatabaseType: "mysql" | "mariadb"
) => {
    const parsedType = parseMySqlColumnType(columnRow.columnType);

    const zeroFillWarnings = parsedType.zeroFill ? [
        toWarning("zeroFill.ignored", columnRow.columnName, "ZEROFILL is not represented in .erd and was ignored.")
    ] : []

    const enumValuesWarning = parsedType.hasIgnoredEnumValues
        ? [toWarning("enumValues.ignored", columnRow.columnName, "ENUM/SET value lists are not compared.")] : [];

    const warnings: SchemaWarning[] = [...zeroFillWarnings, ...enumValuesWarning];

    // "on update CURRENT_TIMESTAMP" が含まれる場合の組み立ては生行 → 型付き行の変換(toColumnRow)側で済ませてある。
    // ここでは受け取った文字列をそのまま渡すだけでよい。
    const facts: DatabaseColumnFacts = {
        databaseType: erdDatabaseType,
        columnName: columnRow.columnName,
        typeQuery: {
            columnType: parsedType.columnType, timezone: parsedType.timezone,
            precision: parsedType.precision, scale: parsedType.scale, isArray: false
        },
        declaredExpression: columnRow.columnType,
        unsigned: parsedType.unsigned,
        notNull: columnRow.isNotNull,
        defaultValue: columnRow.columnDefault,
        autoIncrement: columnRow.extra.includes("auto_increment"),
        comment: columnRow.comment
    };

    return { column: ColumnSnapshots.ofDatabaseColumn(facts), warnings };
}

const toWarning = (category: SchemaWarning["category"], columnName: string, detail: string): SchemaWarning => {
    return { category, schemaName: "", tableName: "", message: `Column "${columnName}": ${detail}` };
}

type ParsedMySqlColumnType = {
    columnType: string;
    timezone: "";
    precision: number | null;
    scale: number | null;
    unsigned: boolean;
    zeroFill: boolean;
    hasIgnoredEnumValues: boolean;
};

/**
 * COLUMN_TYPE(例: "int(11)", "varchar(255)", "decimal(10,2) unsigned", "tinyint(1)")を分解する。
 * DATA_TYPE ではなく COLUMN_TYPE を使うのは、長さ・unsigned・enum 値が DATA_TYPE には出ないため
 */
const parseMySqlColumnType = (rawColumnType: string): ParsedMySqlColumnType => {
    const zeroFillMatch = rawColumnType.match(/ zerofill$/i);
    const withoutZeroFill = (zeroFillMatch != null) ? rawColumnType.slice(0, -zeroFillMatch[0].length) : rawColumnType;

    const unsignedMatch = withoutZeroFill.match(/ unsigned$/i);
    const withoutUnsigned = (unsignedMatch != null)
        ? withoutZeroFill.slice(0, -unsignedMatch[0].length) : withoutZeroFill;

    const unsigned = (unsignedMatch != null);
    const zeroFill = (zeroFillMatch != null);

    const enumOrSetMatch = withoutUnsigned.match(/^(enum|set)\(/i);
    if (enumOrSetMatch != null) {
        return {
            columnType: enumOrSetMatch[1].toUpperCase(), timezone: "", precision: null, scale: null,
            unsigned, zeroFill, hasIgnoredEnumValues: true
        };
    }

    const precisionMatch = withoutUnsigned.match(/\((\d+)(?:,\s*(\d+))?\)$/);
    const precision = (precisionMatch != null) ? Number(precisionMatch[1]) : null;
    const scale = ((precisionMatch != null) && (precisionMatch[2] != null)) ? Number(precisionMatch[2]) : null;
    const withoutPrecision = (precisionMatch != null)
        ? withoutUnsigned.slice(0, -precisionMatch[0].length) : withoutUnsigned;

    const baseType = withoutPrecision.trim().toUpperCase();

    // tinyint(1) は BOOLEAN のシノニムとして materialize され、DB からは区別できない。
    // .erd 側で boolean 型を選んだ列が恒常的な差分にならないよう、ここで同一視する。
    // BOOLEAN は符号の概念を持たない型のため、tinyint(1) unsigned の unsigned 接尾辞は畳んだ時点で意味を失う。
    // 設計側(boolean は withUnsigned:false で常に unsigned=false)と同じ値に揃える。
    if ((baseType === "TINYINT") && (precision === 1) && (scale == null)) {
        return {
            columnType: "BOOLEAN", timezone: "", precision: null, scale: null, unsigned: false, zeroFill,
            hasIgnoredEnumValues: false
        };
    }

    // 整数型の表示幅(m)はストレージ上の意味を持たない歴史的な表示指定で、MySQL 8.0.19+ はそもそも返さない。
    // MariaDB は既定の表示幅を常に含めて返す(例: BIGINT は常に "BIGINT(20)")ため、明示指定かどうかを区別できない。比較対象から外して破棄する。
    // .erd 側で "int (m)" 型のように表示幅を明示選択している設計は、この結果 DB 側と恒常的に不一致になる(既知の制約)。
    if (INTEGER_DISPLAY_WIDTH_TYPES.has(baseType)) {
        return {
            columnType: baseType, timezone: "", precision: null, scale: null, unsigned, zeroFill,
            hasIgnoredEnumValues: false
        };
    }

    return { columnType: baseType, timezone: "", precision, scale, unsigned, zeroFill, hasIgnoredEnumValues: false };
}

// cSpell:ignore tinyint mediumint
const INTEGER_DISPLAY_WIDTH_TYPES = new Set(["TINYINT", "SMALLINT", "MEDIUMINT", "INT", "INTEGER", "BIGINT"]);

// key_column_usage + referential_constraints の JOIN は1行1列で返るため、制約名単位でグループ化する。
const toForeignKeySnapshots = (foreignKeyRows: MySqlForeignKeyRow[]): ForeignKeySnapshot[] => {
    const rowsByConstraintName = new Map<string, MySqlForeignKeyRow[]>();
    foreignKeyRows.forEach(row => {
        const existing = rowsByConstraintName.get(row.constraintName) ?? [];
        existing.push(row);
        rowsByConstraintName.set(row.constraintName, existing);
    });

    return Array.from(rowsByConstraintName.entries()).map(([constraintName, rows]) => {
        const orderedRows = [...rows].sort((first, second) => (first.ordinalPosition - second.ordinalPosition));
        const firstRow = orderedRows[0];

        return {
            constraintName,
            columnNames: orderedRows.map(row => row.columnName),
            parentSchemaName: "",
            parentTableName: firstRow.parentTableName,
            parentColumnNames: orderedRows.map(row => row.parentColumnName),
            onUpdate: toReferenceAction(firstRow.onUpdate),
            onDelete: toReferenceAction(firstRow.onDelete)
        };
    });
}

/**
 * MySQL は NO ACTION と RESTRICT を区別しない実装だが、information_schema はそのまま値を返す。
 * 同値化は行わず、information_schema の値をそのまま変換するだけに留める。両者の異同は常に差分として報告する不変条件のため。
 */
const toReferenceAction = (value: string): TableReferenceActionType => {
    const upperValue = value.toUpperCase();
    const knownActions: TableReferenceActionType[] = ["RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT"];
    const matched = knownActions.find(action => (action === upperValue));

    return matched ?? "NO ACTION";
}

const toDatabaseTypeMismatchWarning = (databaseType: DatabaseType, isActualMariaDb: boolean): SchemaWarning | null => {
    const isDeclaredMariaDb = (databaseType === "mariadb");
    if (isDeclaredMariaDb === isActualMariaDb) {
        return null;
    }

    return {
        category: "databaseType.mismatch", schemaName: "", tableName: "",
        message: `The .erd file declares "${databaseType}", but the connected server reports `
            + `${isActualMariaDb ? "MariaDB" : "MySQL"}.`
    };
}

type MySqlIndexGroup = { indexName: string, columnNames: string[], isUnique: boolean, indexType: string };

type IndexGroupResult = {
    primaryKeyColumnNames: string[];
    uniqueKeys: UniqueKeySnapshot[];
    indexes: IndexSnapshot[];
    warnings: SchemaWarning[];
};

// information_schema.statistics は1行1列で返るため、
// INDEX_NAME 単位でグループ化してから PRIMARY / UNIQUE / 通常インデックスへ振り分ける
const groupIndexColumnRows = (indexColumnRows: MySqlIndexColumnRow[], scope: SchemaCompareScope): IndexGroupResult => {
    const rowsByIndexName = new Map<string, MySqlIndexColumnRow[]>();
    indexColumnRows.forEach(row => {
        const existing = rowsByIndexName.get(row.indexName) ?? [];
        existing.push(row);
        rowsByIndexName.set(row.indexName, existing);
    });

    const primaryKeyRows = rowsByIndexName.get("PRIMARY") ?? [];
    const primaryKeyColumnNames = [...primaryKeyRows]
        .sort((first, second) => (first.seqInIndex - second.seqInIndex))
        .map(row => row.columnName);

    const otherIndexNames = Array.from(rowsByIndexName.keys()).filter(indexName => (indexName !== "PRIMARY"));
    const otherGroups: MySqlIndexGroup[] = otherIndexNames.map(indexName => {
        const rows = rowsByIndexName.get(indexName) as MySqlIndexColumnRow[];
        const columnNames = [...rows].sort((first, second) => (first.seqInIndex - second.seqInIndex))
            .map(row => row.columnName);

        return { indexName, columnNames, isUnique: rows[0].unique, indexType: rows[0].indexType };
    });

    // UNIQUE インデックスは MySQL では UNIQUE 制約と同一実体。
    // design 側も UNIQUE オプションのインデックスを uniqueKeys へ合流させる(design-snapshot.ts)ため、
    // ここでも uniqueKeys にのみ計上し indexes には重複して出さない。
    // UniqueKeySnapshot は索引方式を持たないため、索引種別が解決できるかどうかに関わらず合流できる。
    const uniqueKeys = otherGroups
        .filter(group => group.isUnique)
        .map(group => { return { constraintName: group.indexName, columnNames: group.columnNames }; });

    // --no-index のときは postgres 側(toIndexSnapshots)と同様、
    // 通常インデックスの出力と種別警告の両方を止める(uniqueKeys はどちらの方言でも --no-index の対象外)。
    if (scope.withIndex === false) {
        return { primaryKeyColumnNames, uniqueKeys, indexes: [], warnings: [] };
    }

    const kindResults = otherGroups.filter(group => (group.isUnique === false)).map(group => {
        return { group, kind: toMySqlIndexKind(group.indexName, group.indexType) };
    });

    const indexes: IndexSnapshot[] = kindResults.flatMap(({ group, kind }) => {
        if (kind.resultType !== "resolved") {
            return [];
        }

        return [{
            indexName: group.indexName, columnNames: group.columnNames,
            indexOption: kind.indexOption, indexType: kind.indexType
        }];
    });

    const warnings: SchemaWarning[] = kindResults.flatMap(({ kind }) => {
        return (kind.resultType === "unsupported") ? [kind.warning] : [];
    });

    return { primaryKeyColumnNames, uniqueKeys, indexes, warnings };
}

type MySqlIndexKindResult =
    { resultType: "resolved", indexOption: TableIndexOption, indexType: TableIndexType }
    | { resultType: "unsupported", warning: SchemaWarning };

// MySQL の INDEX_TYPE は FULLTEXT/SPATIAL のような索引の種類そのものを返す一方、.erd はそれを indexOption として扱う。
// BTREE/HASH は逆に索引の実装方式(indexType)として扱う。
// この振り分けは design-snapshot.ts の TableIndexOption/TableIndexType の使い分けと対称でなければならない。
const toMySqlIndexKind = (indexName: string, rawIndexType: string): MySqlIndexKindResult => {
    const upperType = rawIndexType.toUpperCase();

    if ((upperType === "FULLTEXT") || (upperType === "SPATIAL")) {
        return { resultType: "resolved", indexOption: upperType, indexType: "" };
    }
    if ((upperType === "BTREE") || (upperType === "HASH")) {
        return { resultType: "resolved", indexOption: "", indexType: upperType };
    }

    const warning: SchemaWarning = {
        category: "index.unsupported", schemaName: "", tableName: "",
        message: `Index "${indexName}" has an unsupported index type (${rawIndexType}), `
            + "which .erd cannot represent; excluded from comparison."
    };

    return { resultType: "unsupported", warning };
}