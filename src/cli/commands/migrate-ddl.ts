import * as fs from 'node:fs';

import { ConnectionTimeoutOptions, ConnectionTimeouts } from "~/cli/commands/support/connection-timeout-options";
import { TableFilter } from "~/cli/commands/support/table-filter";
import { SchemaCompareOptions } from "~/cli/commands/support/schema-compare-options";
import DbDriver, { DatabaseSnapshotFetcher } from "~/cli/introspect/db-driver";
import { CommandOptions } from "~/cli/options";
import SchemaCommand, { SchemaCommandResult } from "~/cli/commands/schema-command";
import { ErdDocumentFile } from "~/cli/support";
import { DatabaseType } from "~/models/database/DatabaseType";
import { DestructivePolicy, MigrationDdl, MigrationDdlBuilder } from "~/models/schema/schema-migration-ddl";
import DesignSnapshot from "~/models/schema/design-snapshot";
import { SchemaCompareScope, SchemaSnapshot } from "~/models/schema/schema-snapshot";

const usage = `\
erd-cli migrate-ddl --file <path.erd> [options]

  --dsn <url>              Target database. ERD_DB_URL takes precedence over --dsn, but --from
                           takes precedence over both (no connection is attempted when --from is given).
                           Mutually exclusive with --from.
  --from <path.erd>        Compare against another .erd revision instead of a live database.
  --schema <name>          Target schema (PostgreSQL only; database connections only).
  --out <path.sql>         Write output to a file. Defaults to stdout.
  --allow-destructive      Emit destructive operations (DROP ...) without commenting them out.
  --ignore-table <regex>   Exclude tables by name pattern. Repeatable.
  --no-index               Do not generate CREATE/DROP INDEX or UNIQUE statements.
  --no-foreign-key         Do not generate ADD/DROP FOREIGN KEY statements.
  --no-comment             Do not change column/table comments (existing comments are preserved as-is).
  --no-schema              Accepted for consistency with db-diff/erd-diff; has no effect here.
                           migrate-ddl always keeps each table's own schema qualification.
  --connect-timeout <seconds>   Connection timeout (database connections only). Defaults to 10 seconds.
  --query-timeout <seconds>     Query timeout (database connections only). Defaults to 30 seconds.
`;

const optionSpecs = [
    { name: "--file", arity: "single" },
    { name: "--dsn", arity: "single" },
    { name: "--from", arity: "single" },
    { name: "--schema", arity: "single" },
    { name: "--out", arity: "single" },
    { name: "--allow-destructive", arity: "flag" },
    ...SchemaCompareOptions.OPTION_SPECS.filter(spec => (spec.name !== "--format")),
    ...ConnectionTimeoutOptions.OPTION_SPECS
] as const;

const initializeExecute = (fetchSnapshot: DatabaseSnapshotFetcher) => {
    return async (options: CommandOptions): Promise<SchemaCommandResult> => {
        const inputResult = toInput(options);
        if (inputResult.resultType === "error") {
            return "error";
        }

        const input = inputResult.input;
        const actualResult = (input.fromOption != null)
            ? loadFromRevisionSnapshot(input.fromOption, input.scope, input.filter)
            : await loadDatabaseSnapshot(input.databaseType, input.connectionUrl as string,
                options, input.scope, input.filter, input.expectedSnapshot, input.timeouts, fetchSnapshot);

        if (actualResult.resultType === "failed") {
            console.error(actualResult.message);
            return "error";
        }

        const destructivePolicy: DestructivePolicy = options.hasFlag("--allow-destructive") ? "emit" : "commentOut";
        const migration = MigrationDdlBuilder.build({
            expected: input.expectedSnapshot, actual: actualResult.snapshot,
            databaseType: input.databaseType, destructivePolicy, withComment: input.scope.withComment
        });

        const script = formatMigrationScript(migration, {
            fileLabel: input.fileOption, targetLabel: actualResult.targetLabel, databaseType: input.databaseType
        });
        writeMigrationScript(script, migration, options.findValue("--out"));

        return "ok";
    };
};

type MigrateDdlInputResult = { resultType: "ready", input: MigrateDdlInput } | { resultType: "error" };

type MigrateDdlInput = {
    fileOption: string;
    fromOption: string | null;
    connectionUrl: string | null;
    filter: TableFilter;
    databaseType: DatabaseType;
    scope: SchemaCompareScope;
    expectedSnapshot: SchemaSnapshot;
    timeouts: ConnectionTimeouts;
};

// --file 必須 / --from・接続先の相互排他 / filter / ドキュメント読み込みのガード連を1箇所に畳む。
const toInput = (options: CommandOptions): MigrateDdlInputResult => {
    const fileOption = options.findValue("--file");
    if (fileOption == null) {
        console.error("Missing required option: --file <path.erd>");
        return { resultType: "error" };
    }

    const fromOption = options.findValue("--from");
    const dsnOption = options.findValue("--dsn");

    // 相互排他は --dsn の明示指定に対してのみ判定する。
    // ERD_DB_URL は CI 等でシェル全体に export されがちな環境変数であり、
    // --from を指定したコマンドまでブロックしてしまうと、その環境で migrate-ddl --from を実行する手段が無くなる。
    if ((fromOption != null) && (dsnOption != null)) {
        console.error("Pass either --from or a database connection (ERD_DB_URL/--dsn), not both.");
        return { resultType: "error" };
    }

    // --from はコマンドとして完結する情報を持つため、接続先(ERD_DB_URL のフォールバックを含む)をそもそも探しに行かない。
    const connectionUrl = (fromOption != null) ? null : SchemaCompareOptions.findConnectionUrl(options);
    if ((fromOption == null) && (connectionUrl == null)) {
        console.error("Missing target: pass --from <path.erd>, or set ERD_DB_URL / --dsn <url>.");
        return { resultType: "error" };
    }

    const filterResult = TableFilter.create(options.listValues("--ignore-table"));
    if (filterResult.resultType === "invalid") {
        console.error(filterResult.message);
        return { resultType: "error" };
    }

    const timeoutsResult = ConnectionTimeoutOptions.toConnectionTimeouts(options);
    if (timeoutsResult.resultType === "invalid") {
        console.error(timeoutsResult.message);
        return { resultType: "error" };
    }

    const loadResult = ErdDocumentFile.load(fileOption);
    if (loadResult.resultType === "failed") {
        console.error(loadResult.message);
        return { resultType: "error" };
    }

    const erdDocument = loadResult.erdDocument;
    const databaseType = erdDocument.getDatabase().databaseType;

    if (DbDriver.supports(databaseType) === false) {
        console.error(`Error: Unsupported database type for migrate-ddl: ${databaseType}`);
        return { resultType: "error" };
    }

    const scope = SchemaCompareOptions.toCompareScope(
        options, "designToDatabase", erdDocument.erdSettingModel.exportDdlSetting.commentStyle
    );
    const schemaSnapshot = DesignSnapshot.toSchemaSnapshot(erdDocument, scope);
    const expectedSnapshot = filterResult.filter.filterTables(schemaSnapshot);

    return {
        resultType: "ready",
        input: {
            fileOption, fromOption, connectionUrl,
            filter: filterResult.filter, databaseType, scope, expectedSnapshot, timeouts: timeoutsResult.timeouts
        }
    };
};

type ActualSnapshotResult =
    { resultType: "loaded", snapshot: SchemaSnapshot, targetLabel: string }
    | { resultType: "failed", message: string };

const loadFromRevisionSnapshot = (
    fromPath: string, scope: SchemaCompareScope, filter: TableFilter
): ActualSnapshotResult => {
    const loadResult = ErdDocumentFile.load(fromPath);
    if (loadResult.resultType === "failed") {
        return { resultType: "failed", message: loadResult.message };
    }

    const schemaSnapshot = DesignSnapshot.toSchemaSnapshot(loadResult.erdDocument, scope);
    const snapshot = filter.filterTables(schemaSnapshot);

    return {
        resultType: "loaded",
        snapshot: snapshot,
        targetLabel: fromPath
    };
};

const loadDatabaseSnapshot = async (
    databaseType: DatabaseType, connectionUrl: string, options: CommandOptions,
    scope: SchemaCompareScope, filter: TableFilter, expectedSnapshot: SchemaSnapshot,
    timeouts: ConnectionTimeouts, fetchSnapshot: DatabaseSnapshotFetcher
): Promise<ActualSnapshotResult> => {
    if (DbDriver.supports(databaseType) === false) {
        const message = `Error: Unsupported database type for migrate-ddl: ${databaseType}`;
        return { resultType: "failed", message };
    }

    const target = SchemaCompareOptions.toSnapshotTarget(
        options, databaseType, DesignSnapshot.toDeclaredTableSchemaNames(expectedSnapshot)
    );
    const fetchResult = await fetchSnapshot(databaseType, connectionUrl, target, scope, timeouts);
    if (fetchResult.resultType === "failed") {
        return { resultType: "failed", message: `Error: ${fetchResult.message}` };
    }

    return {
        resultType: "loaded",
        snapshot: filter.filterTables(fetchResult.snapshot),
        targetLabel: DbDriver.maskConnectionUrl(connectionUrl)
    };
};

type MigrationScriptContext = { fileLabel: string, targetLabel: string, databaseType: DatabaseType };

const formatMigrationScript = (migration: MigrationDdl, context: MigrationScriptContext): string => {
    const header = [
        "-- Generated by erd-designer (erd-cli migrate-ddl)",
        `-- design : ${context.fileLabel} (${context.databaseType})`,
        `-- target : ${context.targetLabel}`,
        `-- diff   : ${migration.statements.length} statement(s)`,
        "--",
        "-- This script is not applied automatically. Review it before executing."
    ].join("\n");

    const body = migration.statements.map(statement => statement.sql).join("\n\n");

    return (body !== "") ? `${header}\n\n${body}\n` : `${header}\n\n-- No differences found.\n`;
};

const writeMigrationScript = (script: string, migration: MigrationDdl, outOption: string | null): void => {
    if (outOption == null) {
        console.log(script);
        return;
    }

    fs.writeFileSync(outOption, script);

    console.log(`Wrote ${migration.statements.length} statement(s) `
        + `to ${outOption} (${migration.destructiveCount} destructive).`);

    if (migration.unsupportedCount > 0) {
        console.log(`${migration.unsupportedCount} unsupported difference(s) remain. `
            + "Check 'unsupported' entries in the file.");
    }
};

export const ddlMigration: SchemaCommand = {
    name: "migrate-ddl", usage, optionSpecs, create: initializeExecute
} as const;
