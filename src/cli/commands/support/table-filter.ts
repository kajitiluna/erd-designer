import { SchemaSnapshot, TableSnapshot } from "~/models/schema/schema-snapshot";

type TableFilterResult =
    { resultType: "parsed", filter: TableFilter }
    | { resultType: "invalid", message: string };

/** --ignore-table で指定されたパターンによる、テーブル名の除外判定。db-diff / erd-diff / migrate-ddl が共有する。 */
export class TableFilter {

    private readonly regexes: readonly RegExp[];

    private constructor(regexes: readonly RegExp[]) {
        this.regexes = regexes;
    }

    /** --ignore-table は正規表現として解釈する。無効なパターンは実行前に検出して終了コード2で止める。 */
    public static create(patterns: readonly string[]): TableFilterResult {
        try {
            const regexes = patterns.map(pattern => new RegExp(pattern));

            return { resultType: "parsed", filter: new TableFilter(regexes) };
        } catch (error: unknown) {
            const detail = (error instanceof Error) ? error.message : String(error);
            return { resultType: "invalid", message: `Invalid --ignore-table pattern: ${detail}` };
        }
    }

    public filterTables(snapshot: SchemaSnapshot): SchemaSnapshot {
        const tables = snapshot.tables.filter(table => this.keep(table));
        return { ...snapshot, tables };
    }

    public ignoredTableNames(snapshot: SchemaSnapshot): readonly string[] {
        return snapshot.tables.filter(table => (this.keep(table) === false))
            .map(table => toQualifiedName(table));
    }

    // schema.table の形でもマッチさせる。テーブル名単体のパターンは schemaName を持たない
    // 方言(mysql/mariadb は schemaName === "")でも従来どおり効く。
    private keep(table: TableSnapshot): boolean {
        const qualifiedName = toQualifiedName(table);

        return this.regexes.every(regex =>
            (regex.test(table.tableName) === false) && (regex.test(qualifiedName) === false)
        );
    }
}

const toQualifiedName = (table: TableSnapshot): string => {
    return (table.schemaName !== "") ? `${table.schemaName}.${table.tableName}` : table.tableName;
};
