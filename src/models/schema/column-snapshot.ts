import ColumnShareModel from "~/models/database/ColumnShareModel";
import ColumnType from "~/models/database/ColumnType";
import { DatabaseType } from "~/models/database/DatabaseType";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import { ColumnTypeQuery, DeclaredColumnType } from "~/models/schema/column-type-match";
import { DdlCommentOption, initDdlComment } from "~/models/schema/ddl-comment";
import { ColumnSnapshot, SchemaCompareScope } from "~/models/schema/schema-snapshot";

export type DesignedColumnFacts = {
    columnModel: SimpleColumnModel;
    columnShare: ColumnShareModel;
    physicalName: string;
    logicalName: string;
    commentOption: DdlCommentOption;
};

export type DatabaseColumnFacts = {
    databaseType: DatabaseType;
    columnName: string;
    typeQuery: ColumnTypeQuery;
    /** .erd の型に引き当てられなかったときに用いる、DB が返した型表記そのもの。 */
    declaredExpression: string;
    unsigned: boolean;
    notNull: boolean;
    /** DB が返した既定値。無指定は null。 */
    defaultValue: string | null;
    autoIncrement: boolean;
    comment: string;
};

/**
 * 設計側(.erd)/DB側(introspector)双方の ColumnSnapshot を作る唯一の入口。
 * 型表現・既定値表現・SERIAL 畳み込み・scope ゲートといった正規化規則をここに集約し、
 * 両側が同じ規則を通ることを構造的に保証する。
 *
 * コメント規則は非対称ではない: 設計側 comment は create-ddl.ts が出力する COMMENT 文字列そのもの、
 * DB 側はその適用結果であり、両者は既に対称な値として比較できる。DB 側に物理名畳み込み
 * (initDdlComment 相当の処理)を追加してはならない — DB は既に適用済みの結果を返すため、
 * 二重に畳み込むと物理名と一致するコメントを持つ列が常に一致してしまう。
 */
export class ColumnSnapshots {

    public static ofDesignedColumn(facts: DesignedColumnFacts, scope: SchemaCompareScope): ColumnSnapshot {
        const columnType = facts.columnShare.columnType;
        const materialized = toMaterialized(columnType, facts.columnModel.autoIncrement);

        const typeExpression = ofDesignedColumn(
            materialized.resolvedType, facts.columnShare.precision,
            facts.columnShare.scale, facts.columnShare.isArray
        );

        const comment = initDdlComment(
            facts.physicalName, facts.logicalName,
            facts.columnShare.description, facts.commentOption
        );

        return {
            columnName: facts.physicalName,
            logicalName: scope.withLogicalName ? facts.logicalName : "",
            typeExpression,
            unsigned: facts.columnShare.unsigned,
            notNull: facts.columnModel.notNull,
            defaultValue: toComparableDefaultValue(facts.columnModel.defaultValue),
            autoIncrement: materialized.autoIncrement,
            comment
        };
    }

    // scope を受け取らない: DB 側のコメントは常に実値を持つ(上記クラス JSDoc の「非対称ではない」規則)。
    // 出し分けが必要なのは migrate-ddl の生成側であり、比較(schema-diff.ts)側は既にゲート済み。
    public static ofDatabaseColumn(facts: DatabaseColumnFacts): ColumnSnapshot {
        const typeExpression = databaseColumn(facts.databaseType, facts.typeQuery, facts.declaredExpression);

        // nextval(...) 既定値は SERIAL 由来の内部実装詳細で、
        // design 側はそもそも defaultValue に持たない(create-ddl.ts は SERIAL 自体を defaultValue として出力しない)。
        // postgres.ts の is_identity は `attidentity IN ('a','d') OR default LIKE 'nextval(%'` と定義しており、
        // nextval 既定値を持つ列は必ず autoIncrement=true になるため、
        // nextval を個別判定せずautoIncrement を起点に一般化して除去できる。
        const defaultValue = (facts.autoIncrement === true) ? "" : toComparableDefaultValue(facts.defaultValue ?? "");

        return {
            columnName: facts.columnName,
            logicalName: "",
            typeExpression,
            unsigned: facts.unsigned,
            notNull: facts.notNull,
            defaultValue,
            autoIncrement: facts.autoIncrement,
            comment: facts.comment
        };
    }
}


// SERIAL 系のような "実DBでは別の型として実体化する" 型は foreignColumn に実体の型を持つ。
// create-ddl.ts の specifiedColumnType(inChildRelation) は FK 子側でだけこれを畳むが、
// Postgres は SERIAL を親・子・単独のいずれでも integer + nextval として materialize するため、
// ここでは inChildRelation を問わず常に畳む。
// 型表現の解決と autoIncrement 判定は同じ isSerialAlias 判定に依存するため、1メソッドで同時に決める。
const toMaterialized = (
    columnType: ColumnType, columnModelAutoIncrement: boolean
): { resolvedType: ColumnType, autoIncrement: boolean } => {
    const isSerialAlias = (columnType.foreignColumn != null);
    const resolvedType = isSerialAlias ? (columnType.foreignColumn as ColumnType) : columnType;
    const autoIncrement = (columnModelAutoIncrement && columnType.withAutoIncrement) || isSerialAlias;

    return { resolvedType, autoIncrement };
}

/**
 * DB側: 型表記から .erd の ColumnType を引き当て、引き当てられればその表現を、
 * 引き当てられなければ DB が返した表記そのもの(大文字化のみ)を返す。
 * この方言に存在しない型表記を DB が返した場合の素通しフォールバックであり、
 * "type.unresolved" warning を出すかどうかの判断は呼び出し側に委ねる。
 */
const databaseColumn = (databaseType: DatabaseType, query: ColumnTypeQuery, declaredExpression: string) => {
    const matchedColumnType = DeclaredColumnType.find(databaseType, query);
    if (matchedColumnType == null) {
        return declaredExpression.toUpperCase();
    }

    return ofDesignedColumn(
        matchedColumnType, String(query.precision ?? ""), String(query.scale ?? ""), query.isArray
    );
}

/**
 * 設計側: precision/scale/isArray が ColumnShareModel として確定している列の表現を作る。
 * `(p, s)` はカンマ直後に半角スペースが入るなど組み立て規則が ColumnType 側にあるため、
 * 文字列を自前で連結せず必ず specifiedType() を通す。
 */
const ofDesignedColumn = (columnType: ColumnType, precision: string, scale: string, isArray: boolean) => {
    const specifiedType = columnType.specifiedType({ precision, scale, isArray, inChildRelation: false });

    return specifiedType.toUpperCase();
}

/**
 * DB 由来の既定値表現(型キャスト・引用符・大小文字)を正規化する。
 * 設計側にも同じメソッドを通し、双方の既定値表現を同じ規則で比較できるようにする。
 */
const toComparableDefaultValue = (value: string): string => {
    const trimmed = value.trim();
    if ((trimmed === "") || (trimmed.toUpperCase() === "NULL")) {
        return "";
    }

    const withoutCast = trimmed.replace(TYPE_CAST_PATTERN, "");
    const unquoted = stripSurroundingQuotes(withoutCast);

    return unquoted.trim().toUpperCase();
}

const TYPE_CAST_PATTERN = /::[A-Za-z_][A-Za-z0-9_ ]*(\[\])?$/;

const stripSurroundingQuotes = (value: string): string => {
    const trimmed = value.trim();
    if ((trimmed.length >= 2) && trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1).replaceAll("''", "'");
    }

    return trimmed;
}
