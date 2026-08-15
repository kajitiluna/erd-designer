import process from 'node:process';

import { CommandOptions, OptionSpec } from "~/cli/options";
import { SnapshotTarget } from "~/cli/introspect/db-driver";
import { DatabaseType } from "~/models/database/DatabaseType";
import { DdlCommentStyle } from "~/models/ExportDdlSettingModel";
import { SchemaDiffDirection, SchemaDiffFormat } from "~/models/schema/schema-difference";
import { SchemaCompareScope } from "~/models/schema/schema-snapshot";

type DiffFormatResult =
    { resultType: "parsed", format: SchemaDiffFormat }
    | { resultType: "invalid", message: string };

/** db-diff / erd-diff / migrate-ddl が共有する、比較系オプション(--ignore-table 系を除く)の解釈。 */
export class SchemaCompareOptions {

    // erd-diff / db-diff / migrate-ddl に共通するオプション
    public static readonly OPTION_SPECS: readonly OptionSpec[] = [
        { name: "--ignore-table", arity: "repeatable" },
        { name: "--no-index", arity: "flag" },
        { name: "--no-foreign-key", arity: "flag" },
        { name: "--no-comment", arity: "flag" },
        { name: "--no-schema", arity: "flag" },
        { name: "--format", arity: "single" }
    ] as const;

    private constructor() {
        // do nothing
    }

    /**
     * DB 接続先を決める。コマンドライン引数は ps の出力・シェル履歴・CI ログに残るため、環境変数を優先する。
     */
    public static findConnectionUrl(options: CommandOptions): string | null {
        const fromEnv = process.env.ERD_DB_URL;
        if ((fromEnv != null) && (fromEnv !== "")) {
            return fromEnv;
        }

        return options.findValue("--dsn");
    }

    /**
     * CLI フラグから比較範囲を決める。
     * db-diff では実DBが論理名を持たないため、呼び出し側が direction="designToDatabase" を渡すことで
     * withLogicalName を強制的に false にする(withXxx の中で唯一 CLI フラグを持たない)。
     * commentStyle も CLI フラグを持たない — 呼び出し側が読み込み済み ErdDocument の
     * ExportDdlSetting.commentStyle(design-snapshot.ts の toCommentOption と同じ経路)を渡す。
     */
    public static toCompareScope(
        options: CommandOptions, direction: SchemaDiffDirection, commentStyle: DdlCommentStyle
    ): SchemaCompareScope {
        return {
            withIndex: options.hasFlag("--no-index") === false,
            withForeignKey: options.hasFlag("--no-foreign-key") === false,
            withComment: options.hasFlag("--no-comment") === false,
            withSchema: options.hasFlag("--no-schema") === false,
            withLogicalName: (direction === "designToRevision"),
            commentStyle
        };
    }

    /**
     * イントロスペクション対象を決める。
     * `--schema` を解釈するのは postgres のみで、 mysql/mariadb では名前空間が存在しないため無視する。
     */
    public static toSnapshotTarget(
        options: CommandOptions, databaseType: DatabaseType, designSchemaNames: readonly string[]
    ): SnapshotTarget {
        const schemaOption = options.findValue("--schema") ?? "";
        const supportsSchemaOption = (databaseType !== "mysql") && (databaseType !== "mariadb");

        if ((supportsSchemaOption === false) && (schemaOption !== "")) {
            console.warn(`warn: --schema is ignored for ${databaseType}.`
                + " The target database is the one selected by the connection URL.");
        }

        return {
            schemaOption: supportsSchemaOption ? schemaOption : "",
            designSchemaNames
        };
    }

    public static toDiffFormat(options: CommandOptions): DiffFormatResult {
        const value = options.findValue("--format") ?? "text";
        if ((value !== "text") && (value !== "json") && (value !== "markdown")) {
            const message = `Invalid --format value: ${value}. Expected one of: text, json, markdown.`;
            return { resultType: "invalid", message };
        }

        return { resultType: "parsed", format: value };
    }
}
