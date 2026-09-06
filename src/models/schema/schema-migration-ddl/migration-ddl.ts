import { DatabaseType } from "~/models/database/DatabaseType";
import { SchemaSnapshot, TableSnapshot } from "~/models/schema/schema-snapshot";
import TableMatcher, { TableMatchPair } from "~/models/schema/table-matcher";
import {
    DestructivePolicy, MigrationStatement, MigrationStatements
} from "~/models/schema/schema-migration-ddl/migration-statement";
import DialectRegistry from "~/models/schema/schema-migration-ddl/dialect-registry";
import TableDifference from "~/models/schema/schema-migration-ddl/table-difference";
import { DialectFormatter } from "~/models/schema/schema-migration-ddl/dialect";

export type MigrationDdl = {
    statements: readonly MigrationStatement[];
    unsupportedCount: number;
    destructiveCount: number;
};

export class MigrationDdlBuilder {

    private constructor() {
        // do nothing.
    }

    /**
     * expected と actual の差から ALTER 文を組み立てる。
     * SchemaDiff(表示用の整形済み値)ではなく生の SchemaSnapshot を直接受け取る
     * — SchemaDifference.expected/actual は "INT NOT NULL" のような表示用サマリであり、
     * DEFAULT 句や AUTO_INCREMENT 等の SQL 生成に必要な構造情報を持たないため。
     *
     * 生成対象は ALTER レベルの差分のみで、丸ごと不足しているテーブルの CREATE TABLE は生成しない (unsupported として明示する)。
     * これは create-ddl.ts のテーブル生成ロジックを SchemaSnapshot 向けに作り直す独立した仕事であり、
     * そのケースは既存の export-ddl で代替できるため、本段階のスコープからは意図的に外す。
     */
    public static build(args: BuildMigrationDdlArgs): MigrationDdl {
        const { databaseType, destructivePolicy, withComment } = args;
        const dialect = DialectRegistry.findDialect(databaseType, destructivePolicy, withComment);

        // CLI 側(migrate-ddl.ts)は DbDriver.supports() で未対応方言を先に弾くため、ここへの到達は構造的な保険。
        // 方言テーブルが網羅レコードである以上、対応漏れはコンパイルで検出される。
        if (dialect == null) {
            return {
                statements: [toUnsupportedDialectStatement(databaseType)],
                unsupportedCount: 1,
                destructiveCount: 0
            };
        }

        return buildMigrationDdl(dialect, args)
    }
};

// データベース全体が未対応方言のため、単一テーブルに紐づかない。MigrationStatements.unsupported とは別枠で組み立てる。
const toUnsupportedDialectStatement = (databaseType: DatabaseType): MigrationStatement => {
    return {
        kind: "unsupported", schemaName: "", tableName: "",
        sql: `-- unsupported: migrate-ddl has no dialect implemented for database type "${databaseType}".`
    };
};

type BuildMigrationDdlArgs = {

    /** 設計側(正)のスナップショット。DB に合わせるべき最終形。 */
    expected: SchemaSnapshot;

    /** 現状(DB または比較元リビジョン)のスナップショット。 */
    actual: SchemaSnapshot;

    databaseType: DatabaseType;
    destructivePolicy: DestructivePolicy;

    /**
     * false のとき、コメントを変更しない。MySQL の MODIFY COLUMN は列定義を全属性再指定する構文のため、
     * コメント句を出さないだけでは既存コメントが消える — actual(DB の現在値)を再掲する必要がある。
     * そのためスナップショット側ではなく、ここで出し分ける。
     */
    withComment: boolean;
};

const buildMigrationDdl = (dialect: DialectFormatter, args: BuildMigrationDdlArgs): MigrationDdl => {
    const { expected, actual, withComment } = args;

    // migrate-ddl は usage 文言のとおり常にスキーマ修飾するため withSchema は固定で true にする
    // (--no-schema はここでは受理されるだけで効果を持たない)。
    const tableMatch = TableMatcher.match(expected.tables, actual.tables, true);

    const tableResults = tableMatch.pairs.map(pair =>
        TableDifference.toStatements(pair.expected, pair.actual, dialect, withComment)
    );

    const additive = tableResults.flatMap(result => result.additive);
    const destructive = tableResults.flatMap(result => result.destructive);
    const missingTableStatements = tableMatch.missingExpected.map(table => toMissingTableUnsupported(table));
    const unexpectedTableStatements = tableMatch.unexpectedActual.map(table => dialect.formatDropTable(table));
    // 大小文字違いのみで一致した組は pairs に含まれ通常の ALTER 対象になるため missing/unexpected には出てこないが、
    // 気づかれずに素通りしないよう、表記差があった事実そのものを unsupported として明示する
    // (DROP TABLE / CREATE TABLE のような破壊的な取り違えを避けるのが目的で、ここでは何も生成しない)。
    const caseFoldedTableNotices = tableMatch.caseFoldedPairs.map(pair => toCaseFoldedTableNotice(pair));

    const statements = [
        ...additive, ...missingTableStatements, ...caseFoldedTableNotices,
        ...destructive, ...unexpectedTableStatements
    ];

    return {
        statements,
        unsupportedCount: statements.filter(statement => (statement.kind === "unsupported")).length,
        destructiveCount: statements.filter(statement => MigrationStatements.isDestructive(statement)).length
    };
};

const toMissingTableUnsupported = (table: TableSnapshot): MigrationStatement => {
    const reason = `Table "${table.tableName}" does not exist. `
        + "Run 'export-ddl' to generate its CREATE TABLE statement.";

    return MigrationStatements.unsupported(table, reason);
};

const toCaseFoldedTableNotice = (pair: TableMatchPair): MigrationStatement => {
    const reason = `Table name differs only in case: design="${pair.expected.tableName}" `
        + `database="${pair.actual.tableName}". Treated as the same table; review the naming difference manually.`;

    return MigrationStatements.unsupported(pair.actual, reason);
};
