import ColumnType from "~/models/database/ColumnType";
import { findDatabaseColumns } from "~/models/database/columns";
import { DatabaseType } from "~/models/database/DatabaseType";

/**
 * ColumnType 候補探索が参照する最小の型情報。
 * DDL パース結果(ddl-loader.ts の ColumnBaseDefinition)と information_schema 由来の行の
 * どちらも構造的にこの形へ落とし込めるため、DDL インポートとスキーマ検証が同一の
 * 候補探索規則を共有できる。isArray は候補探索(matches)には使わず、DB 側の型表現組み立て
 * (ComparableColumnType.ofDatabaseColumn)でのみ参照する。
 */
export type ColumnTypeQuery = {
    columnType: string;
    timezone: "with time zone" | "without time zone" | "";
    precision: number | "max" | null;
    scale: number | null;
    isArray: boolean;
};

/** DDL の型宣言に対応する .erd の ColumnType を引く(ColumnShareModel を組み立てる ddl-loader 用)。 */
export class DeclaredColumnType {

    /**
     * columns.ts の定義順を優先順位として、指定の型表記に一致する ColumnType を1つ選ぶ。
     * 一致しない場合は null を返し、呼び出し側が「この方言では表現できない型」として扱う。
     */
    public static find(databaseType: DatabaseType, query: ColumnTypeQuery): ColumnType | null {
        // findDatabaseColumns は方言ごとの共有配列をそのまま返すため、並べ替えず読み取りのみ行う
        const columnTypes = findDatabaseColumns(databaseType);
        const matchedColumnType = columnTypes.find(columnType => matchColumnType(columnType, query));

        return matchedColumnType || null;
    }
}

const matchColumnType = (columnType: ColumnType, query: ColumnTypeQuery): boolean => {
    const columnTypeName = columnType.baseQuery.replace("[[PARAM]]", "").toUpperCase();

    const timezoneSuffix = (query.timezone !== "") ? ` ${query.timezone}` : "";
    // MS SQL Server の場合、`NVARCHAR(MAX)` 型などは precision に `max` が指定される
    const maxSuffix = (query.precision === "max") ? "(MAX)" : "";
    const queriedTypeName = `${query.columnType}${timezoneSuffix}${maxSuffix}`.toUpperCase();

    if (columnTypeName !== queriedTypeName) {
        return false;
    }

    // MS SQL Server の `NVARCHAR(MAX)` 型などは、以降のチェックは不要
    if (query.precision === "max") {
        return true;
    }

    if ((query.precision != null) && (columnType.withPrecision === false)) {
        return false;
    }
    if ((query.scale != null) && (columnType.withScale === false)) {
        return false;
    }

    return true;
}