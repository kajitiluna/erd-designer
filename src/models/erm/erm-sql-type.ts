import ColumnType from "~/models/database/ColumnType";
import { findDatabaseColumns } from "~/models/database/columns";
import { DatabaseType } from "~/models/database/DatabaseType";

// ERMaster (org.insightech.er) が <type> / <word>/<type> に格納する SqlType ID から、
// erd-designer が対応する4DB (MySQL / PostgreSQL / SQLite / MS SQL Server) それぞれの DDL エイリアス文字列への変換表。
//
// ERMaster は SQLServer と "SQLServer 2008" を別の <database> 値として扱う (blob 型のエイリアスが異なる等) ため、
// この変換表もその2つを独立した列として保持する。erd-designer 側では両方とも "ms_sqlserver" 1種類に集約されるが、
// 変換表からエイリアス文字列を引く時点では読み込み元の erm ファイルが指定した方の列を使う必要がある。
export type ErmSourceDatabase = "MySQL" | "PostgreSQL" | "SQLite" | "SQLServer" | "SQLServer 2008";

type ErmTypeAliases = {
    mysql: string,
    postgres: string,
    sqlite: string,
    sqlServer: string,
    sqlServer2008: string
};

// ERMaster の SqlType 定義 (134件) から生成した変換表。
// aliasForConvert (ERMaster 側で通常の alias と区別される変換用エイリアス) も alias と同等に扱う。
// 値が "" の DB はその型を表現できない。
const ermSqlTypeAliases: Record<string, ErmTypeAliases> = {
    "character(n)": { mysql: "char(n)", postgres: "char(n)", sqlite: "text", sqlServer: "char(n)", sqlServer2008: "char(n)" },
    "varchar(n)": { mysql: "varchar(n)", postgres: "varchar(n)", sqlite: "text", sqlServer: "varchar(n)", sqlServer2008: "varchar(n)" },
    "nchar(n)": { mysql: "char(n)", postgres: "char(n)", sqlite: "text", sqlServer: "nchar(n)", sqlServer2008: "nchar(n)" },
    "nvarchar(n)": { mysql: "varchar(n)", postgres: "varchar(n)", sqlite: "text", sqlServer: "nvarchar(n)", sqlServer2008: "nvarchar(n)" },
    "decimal": { mysql: "decimal", postgres: "decimal", sqlite: "numeric", sqlServer: "decimal", sqlServer2008: "decimal" },
    "decimal(p)": { mysql: "decimal(p)", postgres: "decimal(p)", sqlite: "numeric", sqlServer: "decimal(p)", sqlServer2008: "decimal(p)" },
    "decimal(p,s)": { mysql: "decimal(p,s)", postgres: "decimal(p,s)", sqlite: "numeric", sqlServer: "decimal(p,s)", sqlServer2008: "decimal(p,s)" },
    "numeric": { mysql: "numeric", postgres: "numeric", sqlite: "numeric", sqlServer: "numeric", sqlServer2008: "numeric" },
    "numeric(p)": { mysql: "numeric(p)", postgres: "numeric(p)", sqlite: "numeric", sqlServer: "numeric(p)", sqlServer2008: "numeric(p)" },
    "numeric(p,s)": { mysql: "numeric(p,s)", postgres: "numeric(p,s)", sqlite: "numeric", sqlServer: "numeric(p,s)", sqlServer2008: "numeric(p,s)" },
    "integer": { mysql: "int", postgres: "int", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "smallint": { mysql: "smallint", postgres: "smallint", sqlite: "integer", sqlServer: "smallint", sqlServer2008: "smallint" },
    "float": { mysql: "float", postgres: "float", sqlite: "real", sqlServer: "float", sqlServer2008: "float" },
    "double precision": { mysql: "double", postgres: "double precision", sqlite: "real", sqlServer: "float", sqlServer2008: "float" },
    "real": { mysql: "real", postgres: "real", sqlite: "real", sqlServer: "real", sqlServer2008: "real" },
    "text": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "clob": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "clob(n)": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "nclob": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "ntext", sqlServer2008: "ntext" },
    "ntext": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "ntext", sqlServer2008: "ntext" },
    "varchar": { mysql: "varchar(n)", postgres: "varchar", sqlite: "text", sqlServer: "varchar(max)", sqlServer2008: "varchar(max)" },
    "varchar_ignorecase": { mysql: "varchar(n)", postgres: "varchar", sqlite: "text", sqlServer: "varchar(max)", sqlServer2008: "varchar(max)" },
    "varchar_ignorecase(n)": { mysql: "varchar(n)", postgres: "varchar(n)", sqlite: "text", sqlServer: "varchar(n)", sqlServer2008: "varchar(n)" },
    "nvarchar": { mysql: "varchar(n)", postgres: "varchar", sqlite: "text", sqlServer: "nvarchar(max)", sqlServer2008: "nvarchar(max)" },
    "blob": { mysql: "blob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max) filestream" },
    "blob(n)": { mysql: "blob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(n)", sqlServer2008: "varbinary(n)" },
    "bfile": { mysql: "blob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "varbinary": { mysql: "varbinary(n)", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "varbinary(n)": { mysql: "varbinary(n)", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(n)", sqlServer2008: "varbinary(n)" },
    "array": { mysql: "", postgres: "", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "bigint": { mysql: "bigint", postgres: "bigint", sqlite: "integer", sqlServer: "bigint", sqlServer2008: "bigint" },
    "bigint(n)": { mysql: "bigint(n)", postgres: "bigint", sqlite: "integer", sqlServer: "bigint", sqlServer2008: "bigint" },
    "bigserial": { mysql: "bigint", postgres: "bigserial", sqlite: "integer", sqlServer: "bigint", sqlServer2008: "bigint" },
    "binary_double": { mysql: "double", postgres: "double precision", sqlite: "real", sqlServer: "float", sqlServer2008: "float" },
    "binary_float": { mysql: "float", postgres: "float", sqlite: "real", sqlServer: "float", sqlServer2008: "float" },
    "binary(n)": { mysql: "binary(n)", postgres: "bytea", sqlite: "none", sqlServer: "binary(n)", sqlServer2008: "binary(n)" },
    "binary1": { mysql: "binary", postgres: "bytea", sqlite: "none", sqlServer: "binary", sqlServer2008: "binary" },
    "bit": { mysql: "bit(1)", postgres: "bit", sqlite: "text", sqlServer: "bit", sqlServer2008: "bit" },
    "bit(n)": { mysql: "bit(n)", postgres: "bit(n)", sqlite: "text", sqlServer: "char(n)", sqlServer2008: "char(n)" },
    "bit varying": { mysql: "text", postgres: "bit varying", sqlite: "text", sqlServer: "varchar(max)", sqlServer2008: "varchar(max)" },
    "bit varying(n)": { mysql: "varchar(n)", postgres: "bit varying(n)", sqlite: "text", sqlServer: "varchar(n)", sqlServer2008: "varchar(n)" },
    "boolean": { mysql: "boolean", postgres: "boolean", sqlite: "text", sqlServer: "bit", sqlServer2008: "bit" },
    "box": { mysql: "", postgres: "box", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "char": { mysql: "char", postgres: "char", sqlite: "text", sqlServer: "char", sqlServer2008: "char" },
    "nchar": { mysql: "char", postgres: "char", sqlite: "text", sqlServer: "nchar", sqlServer2008: "nchar" },
    "cidr": { mysql: "", postgres: "cidr", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "circle": { mysql: "", postgres: "circle", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "date": { mysql: "date", postgres: "date", sqlite: "none", sqlServer: "date", sqlServer2008: "date" },
    "dbclob": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "dbclob(n)": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "double precision(m,d)": { mysql: "double(m,d)", postgres: "decimal(p,s)", sqlite: "real", sqlServer: "decimal(p,s)", sqlServer2008: "decimal(p,s)" },
    "enum": { mysql: "enum", postgres: "", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "decfloat16": { mysql: "float", postgres: "float", sqlite: "real", sqlServer: "float", sqlServer2008: "float" },
    "float(p)": { mysql: "float(p)", postgres: "float(p)", sqlite: "real", sqlServer: "float(p)", sqlServer2008: "float(p)" },
    "float(m,d)": { mysql: "float(m,d)", postgres: "decimal(p,s)", sqlite: "real", sqlServer: "decimal(p,s)", sqlServer2008: "decimal(p,s)" },
    "geometry": { mysql: "", postgres: "", sqlite: "", sqlServer: "geometry", sqlServer2008: "geometry" },
    "hierarchyid ": { mysql: "", postgres: "", sqlite: "none", sqlServer: "hierarchyid", sqlServer2008: "hierarchyid" },
    "image": { mysql: "blob", postgres: "bytea", sqlite: "none", sqlServer: "image", sqlServer2008: "image" },
    "inet": { mysql: "", postgres: "inet", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "int(n)": { mysql: "int(n)", postgres: "int", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "interval": { mysql: "", postgres: "interval", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval(p)": { mysql: "", postgres: "interval(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval year": { mysql: "", postgres: "interval year", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval month": { mysql: "", postgres: "interval month", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day": { mysql: "", postgres: "interval day", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval hour": { mysql: "", postgres: "interval hour", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval minute": { mysql: "", postgres: "interval minute", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval second": { mysql: "", postgres: "interval second", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval second(p)": { mysql: "", postgres: "interval second(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval year to month": { mysql: "", postgres: "interval year to month", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval year(p) to month": { mysql: "", postgres: "interval year to month", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day to hour": { mysql: "", postgres: "interval day to hour", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day to minute": { mysql: "", postgres: "interval day to minute", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day to second": { mysql: "", postgres: "interval day to second", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day to second(p)": { mysql: "", postgres: "interval day to second(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day(p) to second": { mysql: "", postgres: "interval day to second(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval day(p) to second(p)": { mysql: "", postgres: "interval day to second(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval hour to minute": { mysql: "", postgres: "interval hour to minute", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval hour to second": { mysql: "", postgres: "interval hour to second", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval hour to second(p)": { mysql: "", postgres: "interval hour to second(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval minute to second": { mysql: "", postgres: "interval minute to second", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "interval minute to second(p)": { mysql: "", postgres: "interval minute to second(p)", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "line": { mysql: "", postgres: "line", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "long": { mysql: "blob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "longblob": { mysql: "longblob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "long raw": { mysql: "longblob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "longtext": { mysql: "longtext", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "longvarchar": { mysql: "text", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "longvarbinary": { mysql: "blob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "lseg": { mysql: "", postgres: "lseg", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "macaddr": { mysql: "", postgres: "macaddr", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "mediumblob": { mysql: "mediumblob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "mediumint": { mysql: "mediumint", postgres: "int", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "mediumint(n)": { mysql: "mediumint(n)", postgres: "int", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "mediumtext": { mysql: "mediumtext", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "money": { mysql: "decimal(19,4)", postgres: "money", sqlite: "numeric", sqlServer: "money", sqlServer2008: "money" },
    "smallmoney": { mysql: "decimal(10,4)", postgres: "money", sqlite: "numeric", sqlServer: "smallmoney", sqlServer2008: "smallmoney" },
    "oid": { mysql: "", postgres: "oid", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "other": { mysql: "", postgres: "", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "path": { mysql: "", postgres: "path", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "point": { mysql: "", postgres: "point", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "polygon": { mysql: "", postgres: "polygon", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "raw(n)": { mysql: "varbinary(n)", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(n)", sqlServer2008: "varbinary(n)" },
    "real(m,d)": { mysql: "real(m,d)", postgres: "decimal(p,s)", sqlite: "real", sqlServer: "decimal(p,s)", sqlServer2008: "decimal(p,s)" },
    "rowguidcol": { mysql: "", postgres: "", sqlite: "none", sqlServer: "uniqueidentifier rowguidcol", sqlServer2008: "uniqueidentifier rowguidcol" },
    "rowversion ": { mysql: "", postgres: "", sqlite: "none", sqlServer: "rowversion", sqlServer2008: "rowversion" },
    "serial": { mysql: "int", postgres: "serial", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "set": { mysql: "", postgres: "", sqlite: "", sqlServer: "", sqlServer2008: "" },
    "smallint(n)": { mysql: "smallint(n)", postgres: "smallint", sqlite: "integer", sqlServer: "smallint", sqlServer2008: "smallint" },
    "time": { mysql: "time", postgres: "time", sqlite: "none", sqlServer: "time", sqlServer2008: "time" },
    "time(p)": { mysql: "time", postgres: "time(p)", sqlite: "none", sqlServer: "time(p)", sqlServer2008: "time(p)" },
    "time with time zone": { mysql: "time", postgres: "time with time zone", sqlite: "none", sqlServer: "time", sqlServer2008: "time" },
    "time(p) with time zone": { mysql: "time", postgres: "time(p) with time zone", sqlite: "none", sqlServer: "time(p)", sqlServer2008: "time(p)" },
    "timestamp": { mysql: "timestamp", postgres: "timestamp", sqlite: "none", sqlServer: "datetime", sqlServer2008: "datetime" },
    "datetime2": { mysql: "timestamp", postgres: "timestamp", sqlite: "none", sqlServer: "datetime2", sqlServer2008: "datetime2" },
    "timestamp(p)": { mysql: "timestamp", postgres: "timestamp(p)", sqlite: "none", sqlServer: "datetime2(p)", sqlServer2008: "datetime2(p)" },
    "timestamp with time zone": { mysql: "timestamp", postgres: "timestamp with time zone", sqlite: "none", sqlServer: "datetimeoffset", sqlServer2008: "datetimeoffset" },
    "timestamp(p) with time zone": { mysql: "timestamp", postgres: "timestamp(p) with time zone", sqlite: "none", sqlServer: "datetimeoffset", sqlServer2008: "datetimeoffset" },
    "timestamp with local time zone": { mysql: "timestamp", postgres: "timestamp with time zone", sqlite: "none", sqlServer: "datetimeoffset", sqlServer2008: "datetimeoffset" },
    "timestamp(p) with local time zone": { mysql: "timestamp", postgres: "timestamp(p) with time zone", sqlite: "none", sqlServer: "datetimeoffset", sqlServer2008: "datetimeoffset" },
    "datetime": { mysql: "datetime", postgres: "timestamp", sqlite: "none", sqlServer: "datetime", sqlServer2008: "datetime" },
    "smalldatetime": { mysql: "timestamp", postgres: "timestamp", sqlite: "none", sqlServer: "smalldatetime", sqlServer2008: "smalldatetime" },
    "tinyblob": { mysql: "tinyblob", postgres: "bytea", sqlite: "none", sqlServer: "varbinary(max)", sqlServer2008: "varbinary(max)" },
    "tinyint": { mysql: "tinyint", postgres: "smallint", sqlite: "integer", sqlServer: "tinyint", sqlServer2008: "tinyint" },
    "tinyint(n)": { mysql: "tinyint(n)", postgres: "smallint", sqlite: "integer", sqlServer: "tinyint", sqlServer2008: "tinyint" },
    "tinytext": { mysql: "tinytext", postgres: "text", sqlite: "text", sqlServer: "text", sqlServer2008: "text" },
    "urowid": { mysql: "", postgres: "", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "urowid(n)": { mysql: "", postgres: "", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "uuid": { mysql: "", postgres: "uuid", sqlite: "none", sqlServer: "uniqueidentifier", sqlServer2008: "uniqueidentifier" },
    "xml": { mysql: "", postgres: "xml", sqlite: "", sqlServer: "xml", sqlServer2008: "xml" },
    "year(2)": { mysql: "year(2)", postgres: "int", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "year(4)": { mysql: "year(4)", postgres: "int", sqlite: "integer", sqlServer: "int", sqlServer2008: "int" },
    "alert_type": { mysql: "", postgres: "", sqlite: "none", sqlServer: "", sqlServer2008: "" },
    "anydata": { mysql: "", postgres: "", sqlite: "none", sqlServer: "", sqlServer2008: "" },
};

const aliasFor = (aliases: ErmTypeAliases, sourceDatabase: ErmSourceDatabase): string => {
    switch (sourceDatabase) {
        case "MySQL": return aliases.mysql;
        case "PostgreSQL": return aliases.postgres;
        case "SQLite": return aliases.sqlite;
        case "SQLServer": return aliases.sqlServer;
        case "SQLServer 2008": return aliases.sqlServer2008;
    }
};

/**
 * ERMaster の SqlType ID を、対象データベースの erd-designer ColumnType に解決する。
 * 解決できない場合 (ERMaster 側にエイリアスが無い、または erd-designer 側に対応する型が無い) は
 * ColumnType.EMPTY を返す。呼び出し側でこれを検知して変換レポートに warning として記録すること。
 *
 * @param databaseType 変換先の erd-designer DatabaseType
 * @param sourceDatabase erm ファイルの <settings>/<database> に対応する ERMaster 側の DB 種別
 * @param sqlTypeId ERMaster の <type> / <word>/<type> の値 (例 "varchar(n)")
 */
export const resolveErmColumnType = (
    databaseType: DatabaseType, sourceDatabase: ErmSourceDatabase, sqlTypeId: string
): ColumnType => {
    const aliases = ermSqlTypeAliases[sqlTypeId];
    const alias = (aliases != null) ? aliasFor(aliases, sourceDatabase) : "";
    if (alias === "") {
        return ColumnType.EMPTY;
    }

    const typeName = canonicalTypeName(databaseType, stripParamFromAlias(alias));
    const paramCount = countParamsInAlias(alias);
    const needsPrecision = (paramCount >= 1);
    const needsScale = (paramCount >= 2);

    const candidates = findDatabaseColumns(databaseType)
        .filter(columnType => (canonicalTypeName(databaseType, bareTypeName(columnType.baseQuery)) === typeName));
    if (candidates.length === 0) {
        return ColumnType.EMPTY;
    }

    const exactMatch = candidates.find(columnType =>
        (columnType.withPrecision === needsPrecision) && (columnType.withScale === needsScale));

    return exactMatch ?? candidates[0];
};

const bareTypeName = (baseQuery: string): string => {
    return baseQuery.replace("[[PARAM]]", "").trim().toUpperCase();
};

// ERMaster のエイリアス表記と erd-designer 自身のカタログ表記とで、同じ型に異なる正準スペルを
// 採用しているケースを吸収する。DB 非依存で安全な同義語は "*" に、特定 DB のみ成立するものは
// その databaseType キー配下に置く。
// - "INT" → "INTEGER": id=15 の「標準的な整数型」。PostgreSQL/SQLite のカタログは "INTEGER" 表記だが
//   ERMaster の PostgreSQL エイリアスは "int" (MySQL 等と同じ表記)。他DBのカタログには元々 "INTEGER"
//   という baseQuery が存在しないため、全DB一律で適用しても副作用が無い。
// - postgres の "TIME"/"TIMESTAMP" (時間帯指定なし): erd-designer の postgres カタログには時間帯
//   修飾語なしの裸の TIME/TIMESTAMP が存在せず、必ず WITH/WITHOUT TIME ZONE の指定を要求する。
//   ERMaster 側のエイリアスは時間帯指定なしの型 ID (例 "timestamp") に対して裸の "timestamp" を
//   返すため、素朴な突き合わせでは解決できない。ANSI SQL の既定 (時間帯指定なし = WITHOUT TIME ZONE)
//   に合わせて解決する。
const TYPE_NAME_SYNONYMS: Record<string, Record<string, string>> = {
    "*": {
        "INT": "INTEGER"
    },
    "postgres": {
        "TIME": "TIME WITHOUT TIME ZONE",
        "TIMESTAMP": "TIMESTAMP WITHOUT TIME ZONE"
    }
};

const canonicalTypeName = (databaseType: DatabaseType, name: string): string => {
    const databaseSpecific = TYPE_NAME_SYNONYMS[databaseType]?.[name];
    if (databaseSpecific != null) {
        return databaseSpecific;
    }

    return TYPE_NAME_SYNONYMS["*"][name] ?? name;
};

const PARAM_GROUP = /\(([^)]*)\)/;

const stripParamFromAlias = (alias: string): string => {
    return alias.replace(PARAM_GROUP, "").trim().toUpperCase();
};

const countParamsInAlias = (alias: string): number => {
    const match = alias.match(PARAM_GROUP);
    if (match == null) {
        return 0;
    }
    if (match[1].trim() === "") {
        return 0;
    }

    return match[1].split(",").length;
};
