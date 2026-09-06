import type { SqlConnection, SqlQueryRow } from "~/cli/introspect/sql-connection";
import { Database } from "~/models/database/DatabaseType";
import { TableReferenceActionType } from "~/models/database/RelationModel";
import { ColumnSnapshots, DatabaseColumnFacts } from "~/models/schema/column-snapshot";
import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, SchemaCompareScope, SchemaSnapshot, SchemaWarning,
    TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";

/** SELECT で取得した生行の束。方言固有の型付けは行わず、そのまま toSnapshot に渡す。 */
export type PostgresRawRows = {
    tables: readonly SqlQueryRow[];
    schemaNames: readonly SqlQueryRow[];
};

export class PostgresIntrospector {

    private readonly connection: SqlConnection;

    constructor(connection: SqlConnection) {
        this.connection = connection;
    }

    /** SELECT のみを発行し、正規化は行わない。接続の生存期間は関知しない(open/close は DbDriver の責務)。 */
    public async fetchSnapshot(targetSchemas: readonly string[], scope: SchemaCompareScope): Promise<SchemaSnapshot> {
        const rawRows = await this.fetchRawRows(targetSchemas);

        return PostgresIntrospector.toSnapshot(rawRows, scope);
    }

    private async fetchRawRows(targetSchemas: readonly string[]): Promise<PostgresRawRows> {
        const schemaNames = await this.connection.selectRows(QUERY_SCHEMA_NAMES, [targetSchemas]);
        const tables = await this.connection.selectRows(QUERY_TABLE_ROWS, [targetSchemas]);

        return { tables, schemaNames };
    }

    /** 生行(I/O 層の戻り値)を中立表現へ変換する。DB 接続なしで検証できる公開 API はこれ 1 つ。 */
    public static toSnapshot(rawRows: PostgresRawRows, scope: SchemaCompareScope): SchemaSnapshot {
        const tableRows = rawRows.tables.map(raw => {
            // json_agg で組み立てた列・PK・UNIQUE・インデックス・外部キーは JSON オブジェクトとして返る
            // (pg ドライバが json 列を JS 値へ自動変換済み)
            return {
                schemaName: String(raw.schema_name),
                tableName: String(raw.table_name),
                tableComment: String(raw.table_comment ?? ""),
                columns: (raw.columns as SqlQueryRow[]).map(toPostgresColumnRow),
                primaryKeyColumns: raw.primary_key_columns as string[],
                uniqueKeys: (raw.unique_keys as SqlQueryRow[]).map(toPostgresUniqueKeyRow),
                indexes: (raw.indexes as SqlQueryRow[]).map(toPostgresIndexRow),
                foreignKeys: raw.foreign_keys as PostgresForeignKeyRow[]
            };
        });

        const schemaNames = scope.withSchema ? rawRows.schemaNames.map(row => String(row.schema_name)) : [];
        const tableResults = tableRows.map(row => toTableSnapshot(row, scope));

        return {
            databaseType: "postgres",
            schemaNames,
            tables: tableResults.map(result => result.table),
            warnings: tableResults.flatMap(result => result.warnings)
        };
    }
}

const toPostgresColumnRow = (raw: SqlQueryRow): PostgresColumnRow => {
    return {
        columnName: String(raw.column_name),
        formattedType: String(raw.formatted_type),
        isNotNull: (raw.not_null === true),
        isIdentity: (raw.is_identity === true),
        // null は「既定値なし」を表す状態そのものなので、"null" という文字列に変換してしまう
        // String() を通さず null のまま保持する。
        defaultExpr: (raw.default_expr == null) ? null : String(raw.default_expr),
        comment: String(raw.comment ?? "")
    };
}

const toPostgresUniqueKeyRow = (raw: SqlQueryRow): PostgresUniqueKeyRow => {
    return {
        constraintName: String(raw.constraint_name),
        columns: raw.columns as string[]
    };
}

const toPostgresIndexRow = (raw: SqlQueryRow): PostgresIndexRow => {
    return {
        indexName: String(raw.index_name),
        columns: raw.columns as string[],
        accessMethod: String(raw.access_method),
        isPartial: (raw.is_partial === true),
        isExpression: (raw.is_expression === true)
    };
}

// 対象スキーマの絞り込みは呼び出し側(db-driver.ts の toPostgresTargetSchemas)が担う。
// ここでは渡された集合をそのまま問い合わせるだけで、システムスキーマの除外規則は持たない。
const QUERY_SCHEMA_NAMES = `\
SELECT nspname AS schema_name
FROM pg_namespace
WHERE nspname = ANY($1::text[])
ORDER BY nspname;\
`;

// cSpell:ignore adbin adnum adrelid amname attidentity attisdropped attname attnotnull attnum attrdef attrelid
// cSpell:ignore atttypid atttypmod confdeltype confkey confrelid confupdtype conindid conkey conname conrelid contype
// cSpell:ignore indexrelid indexprs indisprimary indkey indpred indrelid ordinality relam relkind relname relnamespace

// テーブルごとに列・PK・UNIQUE・インデックス・外部キーを json_agg で1行にまとめて取得する。
// 複数行の JOIN で組み立てるより、行の形が PostgresTableRow とそのまま対応し実装・検証しやすいため。
const QUERY_TABLE_ROWS = `\
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    COALESCE(obj_description(c.oid, 'pg_class'), '') AS table_comment,
    (
        SELECT
            COALESCE(
                json_agg(
                    json_build_object(
                        'column_name', a.attname,
                        'formatted_type', format_type(a.atttypid, a.atttypmod),
                        'not_null', a.attnotnull,
                        'is_identity', (a.attidentity IN ('a', 'd'))
                            OR (COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '') LIKE 'nextval(%'),
                        'default_expr', pg_get_expr(ad.adbin, ad.adrelid),
                        'comment', COALESCE(col_description(c.oid, a.attnum), '')
                    ) ORDER BY a.attnum
                ),
                '[]'::json
            )
        FROM pg_attribute a
            LEFT JOIN pg_attrdef ad
                ON (ad.adrelid = a.attrelid AND ad.adnum = a.attnum)
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND a.attisdropped = false
    ) AS columns,
    (
        SELECT
            COALESCE(json_agg(col.attname ORDER BY k.ord), '[]'::json)
        FROM pg_constraint pk
            CROSS JOIN LATERAL unnest(pk.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute col
                ON (col.attrelid = pk.conrelid AND col.attnum = k.attnum)
        WHERE pk.conrelid = c.oid AND pk.contype = 'p'
    ) AS primary_key_columns,
    (
        SELECT
            COALESCE(
                json_agg(
                    json_build_object(
                        'constraint_name', uk.conname,
                        'columns', (
                            SELECT
                                json_agg(col.attname ORDER BY k.ord)
                            FROM unnest(uk.conkey) WITH ORDINALITY AS k(attnum, ord)
                                JOIN pg_attribute col
                                    ON (col.attrelid = uk.conrelid AND col.attnum = k.attnum)
                        )
                    )
                ),
                '[]'::json
            )
        FROM pg_constraint uk
        WHERE uk.conrelid = c.oid AND uk.contype = 'u'
    ) AS unique_keys,
    (
        SELECT
            COALESCE(
                json_agg(
                    json_build_object(
                        'index_name', ic.relname,
                        'columns', (
                            SELECT json_agg(col.attname ORDER BY k.ord)
                            FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                                JOIN pg_attribute col
                                    ON (col.attrelid = i.indrelid AND col.attnum = k.attnum)
                        ),
                        'access_method', am.amname,
                        'is_partial', (i.indpred IS NOT NULL),
                        'is_expression', (i.indexprs IS NOT NULL)
                    )
                ),
                '[]'::json
            )
        FROM pg_index i
            JOIN pg_class ic
                ON (ic.oid = i.indexrelid)
            JOIN pg_am am
                ON (am.oid = ic.relam)
        WHERE i.indrelid = c.oid
            AND i.indisprimary = false
            AND NOT EXISTS (
                SELECT 1 FROM pg_constraint con
                WHERE con.conindid = i.indexrelid AND con.contype = 'u'
            )
    ) AS indexes,
    (
        SELECT
            COALESCE(
                json_agg(
                    json_build_object(
                        'constraint_name', fk.conname,
                        'columns', (
                            SELECT json_agg(col.attname ORDER BY k.ord)
                            FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ord)
                            JOIN pg_attribute col
                                ON (col.attrelid = fk.conrelid AND col.attnum = k.attnum)
                        ),
                        'parent_schema_name', pn.nspname,
                        'parent_table_name', pc.relname,
                        'parent_columns', (
                            SELECT json_agg(col.attname ORDER BY k.ord)
                            FROM unnest(fk.confkey) WITH ORDINALITY AS k(attnum, ord)
                                JOIN pg_attribute col
                                    ON (col.attrelid = fk.confrelid AND col.attnum = k.attnum)
                        ),
                        'on_update', fk.confupdtype,
                        'on_delete', fk.confdeltype
                    )
                ),
                '[]'::json
            )
        FROM pg_constraint fk
            JOIN pg_class pc
                ON (pc.oid = fk.confrelid)
            JOIN pg_namespace pn
                ON (pn.oid = pc.relnamespace)
        WHERE fk.conrelid = c.oid AND fk.contype = 'f'
    ) AS foreign_keys
FROM pg_class c
    JOIN pg_namespace n
        ON (n.oid = c.relnamespace)
WHERE c.relkind = 'r' AND n.nspname = ANY($1::text[])
ORDER BY n.nspname, c.relname;\
`;

type PostgresTableRow = {
    schemaName: string;
    tableName: string;
    tableComment: string;
    columns: PostgresColumnRow[];
    primaryKeyColumns: string[];
    uniqueKeys: PostgresUniqueKeyRow[];
    indexes: PostgresIndexRow[];
    foreignKeys: PostgresForeignKeyRow[];
};

type PostgresColumnRow = {
    columnName: string;
    formattedType: string;
    isNotNull: boolean;
    isIdentity: boolean;
    defaultExpr: string | null;
    comment: string;
};

type PostgresUniqueKeyRow = {
    constraintName: string;
    columns: string[];
};

type PostgresIndexRow = {
    indexName: string;
    columns: string[];
    accessMethod: string;
    isPartial: boolean;
    isExpression: boolean;
};

type PostgresForeignKeyRow = {
    constraint_name: string;
    columns: string[];
    parent_schema_name: string;
    parent_table_name: string;
    parent_columns: string[];
    // pg_constraint.confupdtype/confdeltype の1文字コード
    on_update: "a" | "r" | "c" | "n" | "d";
    on_delete: "a" | "r" | "c" | "n" | "d";
};

const toTableSnapshot = (row: PostgresTableRow, scope: SchemaCompareScope): TableSnapshotResult => {
    const indexResult = toIndexSnapshots(row, scope);

    // テーブルコメントは常に実値を持つ。設計側と比較する際の出し分けは schema-diff.ts が
    // scope.withComment でゲートするため、ここで潰すと migrate-ddl の comment 保持に必要な値を失う。
    const table: TableSnapshot = {
        schemaName: row.schemaName,
        tableName: row.tableName,
        logicalName: "",
        comment: row.tableComment,
        columns: row.columns.map(column => toColumnSnapshot(column)),
        primaryKeyColumnNames: row.primaryKeyColumns,
        uniqueKeys: row.uniqueKeys.map(toUniqueKeySnapshot),
        indexes: indexResult.indexes,
        foreignKeys: scope.withForeignKey ? row.foreignKeys.map(toForeignKeySnapshot) : []
    };

    const warnings = indexResult.warnings.map(warning => {
        return { ...warning, schemaName: row.schemaName, tableName: row.tableName };
    });

    return { table, warnings };
}

type TableSnapshotResult = { table: TableSnapshot, warnings: SchemaWarning[] };
type IndexSnapshotsResult = { indexes: IndexSnapshot[], warnings: SchemaWarning[] };

const toIndexSnapshots = (row: PostgresTableRow, scope: SchemaCompareScope): IndexSnapshotsResult => {
    if (scope.withIndex === false) {
        return { indexes: [], warnings: [] };
    }

    // 部分/式インデックスは .erd 側で表現できないため比較から除外し、黙って落とさず warning を出す
    // (10.3 節)。
    const supportedIndexRows = row.indexes
        .filter(indexRow => (indexRow.isPartial === false) && (indexRow.isExpression === false));
    const unsupportedIndexRows = row.indexes.filter(indexRow => (indexRow.isPartial) || (indexRow.isExpression));

    const indexes = supportedIndexRows.map(indexRow => {
        return {
            indexName: indexRow.indexName,
            columnNames: indexRow.columns,
            indexOption: "" as const,
            indexType: toIndexType(indexRow.accessMethod)
        };
    });

    const warnings = unsupportedIndexRows.map(indexRow => {
        const message = `Index "${indexRow.indexName}" is a partial or expression index, `
            + "which .erd cannot represent; excluded from comparison.";

        return { category: "index.unsupported" as const, schemaName: "", tableName: "", message };
    });

    return { indexes, warnings };
}

const INDEX_TYPE_NAMES = new Set<string>(Database.get("postgres").tableIndexSupport.indexTypes);

const toIndexType = (accessMethod: string): IndexSnapshot["indexType"] => {
    const upperName = accessMethod.toUpperCase();
    return INDEX_TYPE_NAMES.has(upperName) ? (upperName as IndexSnapshot["indexType"]) : "";
}

const toColumnSnapshot = (column: PostgresColumnRow): ColumnSnapshot => {
    const parsedType = parsePostgresFormattedType(column.formattedType);

    // DeclaredColumnType.find が null を返すのは、この方言に存在しない型表記を DB が返した場合のみ
    // (postgres の候補表は EMPTY を含め全カテゴリを網羅している)。呼び出し元(fetchSnapshot の
    // 利用者)が "type.unresolved" warning を出す設計にするため、ここでは素通しの表現に留める
    // (ComparableColumnType.ofDatabaseColumn がそのフォールバックを内包する)。
    const facts: DatabaseColumnFacts = {
        databaseType: "postgres",
        columnName: column.columnName,
        typeQuery: parsedType,
        declaredExpression: column.formattedType,
        // PostgreSQL に UNSIGNED は無く、design 側も ColumnType.withUnsigned=false で常に false になる
        unsigned: false,
        notNull: column.isNotNull,
        defaultValue: column.defaultExpr,
        autoIncrement: column.isIdentity,
        comment: column.comment
    };

    return ColumnSnapshots.ofDatabaseColumn(facts);
}

/**
 * format_type() の出力を (基底型名, timezone, precision, scale, isArray) に分解する。
 * 精度は timezone 句より前に置かれる(例: "timestamp(3) with time zone")ため、
 * 配列 → timezone → 精度 の順で末尾から剥がす。
 */
const parsePostgresFormattedType = (formattedType: string): {
    columnType: string,
    timezone: "with time zone" | "without time zone" | "",
    precision: number | null,
    scale: number | null,
    isArray: boolean
} => {
    const isArray = formattedType.endsWith("[]");
    const withoutArray = isArray ? formattedType.slice(0, -2) : formattedType;

    const timezoneMatch = withoutArray.match(/ (with(?:out)? time zone)$/i);
    const timezone = (timezoneMatch != null)
        ? (timezoneMatch[1].toLowerCase() as "with time zone" | "without time zone") : "";
    const withoutTimezone = (timezoneMatch != null) ? withoutArray.slice(0, -timezoneMatch[0].length) : withoutArray;

    const precisionMatch = withoutTimezone.match(/\((\d+)(?:,\s*(\d+))?\)$/);
    const precision = (precisionMatch != null) ? Number(precisionMatch[1]) : null;
    const scale = ((precisionMatch != null) && (precisionMatch[2] != null)) ? Number(precisionMatch[2]) : null;
    const withoutPrecision = (precisionMatch != null)
        ? withoutTimezone.slice(0, -precisionMatch[0].length) : withoutTimezone;

    const columnType = toNormalizedBaseType(withoutPrecision.trim());

    return { columnType, timezone, precision, scale, isArray };
}

// format_type() は大半の型でそのまま .erd の baseQuery と綴りが一致するが、
// character 系だけ SQL 標準名(character varying 等)と baseQuery(VARCHAR)の綴りが食い違う。
const toNormalizedBaseType = (baseType: string): string => {
    const lowerBaseType = baseType.toLowerCase();
    return POSTGRES_TYPE_ALIASES[lowerBaseType] ?? baseType.toUpperCase();
}

// cSpell:ignore bpchar

const POSTGRES_TYPE_ALIASES: { [key: string]: string } = {
    "character varying": "VARCHAR",
    "character": "CHAR",
    "bpchar": "CHAR"
};

const toUniqueKeySnapshot = (row: PostgresUniqueKeyRow): UniqueKeySnapshot => {
    return { constraintName: row.constraintName, columnNames: row.columns };
}

const FOREIGN_KEY_ACTION_BY_CODE: { [key: string]: TableReferenceActionType } = {
    a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT"
};

const toForeignKeySnapshot = (row: PostgresForeignKeyRow): ForeignKeySnapshot => {
    return {
        constraintName: row.constraint_name,
        columnNames: row.columns,
        parentSchemaName: row.parent_schema_name,
        parentTableName: row.parent_table_name,
        parentColumnNames: row.parent_columns,
        onUpdate: FOREIGN_KEY_ACTION_BY_CODE[row.on_update] ?? "NO ACTION",
        onDelete: FOREIGN_KEY_ACTION_BY_CODE[row.on_delete] ?? "NO ACTION"
    };
}
