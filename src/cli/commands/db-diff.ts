import { ConnectionTimeoutOptions, ConnectionTimeouts } from "~/cli/commands/support/connection-timeout-options";
import { TableFilter } from "~/cli/commands/support/table-filter";
import { SchemaCompareOptions } from "~/cli/commands/support/schema-compare-options";
import DbDriver, { DatabaseSnapshotFetcher } from "~/cli/introspect/db-driver";
import { CommandOptions } from "~/cli/options";
import SchemaCommand, { SchemaCommandResult } from "~/cli/commands/schema-command";
import { ErdDocumentFile } from "~/cli/support";
import ErdDocument from "~/models/ErdDocument";
import { DatabaseType } from "~/models/database/DatabaseType";
import DesignSnapshot from "~/models/schema/design-snapshot";
import { SchemaComparison } from "~/models/schema/schema-diff";
import { SchemaDiffFormat, SchemaDiffReportContext } from "~/models/schema/schema-difference";
import { SchemaDiffReport } from "~/models/schema/schema-diff-report";
import { SchemaCompareScope } from "~/models/schema/schema-snapshot";

const usage = `\
erd-cli db-diff --file <path.erd> [options]

  --dsn <url>                    Connection string. ERD_DB_URL takes precedence.
  --schema <name>                Target schema (PostgreSQL only). Defaults to the schemas the .erd design uses.
  --ignore-table <regex>         Exclude tables by name pattern. Repeatable.
  --no-index                     Skip index comparison.
  --no-foreign-key               Skip foreign key comparison.
  --no-comment                   Skip table/column comment comparison.
  --no-schema                    Compare by table name only, ignoring schema qualification.
  --format text|json|markdown    Output format. Defaults to text.
  --connect-timeout <seconds>    Connection timeout. Defaults to 10 seconds.
  --query-timeout <seconds>      Query timeout. Defaults to 30 seconds.
`;

const optionSpecs = [
    { name: "--file", arity: "single" },
    { name: "--dsn", arity: "single" },
    { name: "--schema", arity: "single" },
    ...SchemaCompareOptions.OPTION_SPECS,
    ...ConnectionTimeoutOptions.OPTION_SPECS
] as const;

const initializeExecute = (fetchSnapshot: DatabaseSnapshotFetcher) => {
    return async (options: CommandOptions): Promise<SchemaCommandResult> => {
        const inputResult = toInput(options);
        if (inputResult.resultType === "error") {
            return "error";
        }

        const input = inputResult.input;
        const designSnapshot = DesignSnapshot.toSchemaSnapshot(input.erdDocument, input.scope);
        const target = SchemaCompareOptions.toSnapshotTarget(
            options, input.databaseType, DesignSnapshot.toDeclaredTableSchemaNames(designSnapshot)
        );

        const fetchResult = await fetchSnapshot(
            input.databaseType, input.connectionUrl, target, input.scope, input.timeouts
        );
        if (fetchResult.resultType === "failed") {
            console.error(`Error: ${fetchResult.message}`);
            return "error";
        }

        const ignoredTableNames = input.filter.ignoredTableNames(designSnapshot);
        const filteredDesignSnapshot = input.filter.filterTables(designSnapshot);
        const filteredDatabaseSnapshot = input.filter.filterTables(fetchResult.snapshot);

        const diff = SchemaComparison.compare(filteredDesignSnapshot, filteredDatabaseSnapshot, input.scope);
        const context: SchemaDiffReportContext = {
            direction: "designToDatabase",
            databaseType: input.databaseType,
            expectedLabel: input.fileOption,
            actualLabel: DbDriver.maskConnectionUrl(input.connectionUrl),
            expectedTableCount: filteredDesignSnapshot.tables.length,
            ignoredTableNames
        };

        const report = SchemaDiffReport.format(diff, context, input.format);

        console.log(report.stdout);
        if (report.stderr !== "") {
            console.error(report.stderr);
        }

        return (diff.differences.length > 0) ? "detected" : "ok";
    };
};

type DbDiffInput = {
    fileOption: string;
    connectionUrl: string;
    format: SchemaDiffFormat;
    filter: TableFilter;
    erdDocument: ErdDocument;
    databaseType: DatabaseType;
    scope: SchemaCompareScope;
    timeouts: ConnectionTimeouts;
};

type DbDiffInputResult = { resultType: "ready", input: DbDiffInput } | { resultType: "error" };

// --file 必須 / 接続先 / format / filter / ドキュメント読み込み / 方言対応のガード連を1箇所に畳む。
// execute はこの結果を受け取り「取得 → 比較 → 出力」の骨格だけを持つ。
const toInput = (options: CommandOptions): DbDiffInputResult => {
    const fileOption = options.findValue("--file");
    if (fileOption == null) {
        console.error("Missing required option: --file <path.erd>");
        return { resultType: "error" };
    }

    const connectionUrl = SchemaCompareOptions.findConnectionUrl(options);
    if (connectionUrl == null) {
        console.error("Missing database connection. Set ERD_DB_URL or pass --dsn <url>.");
        return { resultType: "error" };
    }

    const formatResult = SchemaCompareOptions.toDiffFormat(options);
    if (formatResult.resultType === "invalid") {
        console.error(formatResult.message);
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
        console.error(`Error: Unsupported database type for db-diff: ${databaseType}`);
        return { resultType: "error" };
    }

    const scope = SchemaCompareOptions.toCompareScope(
        options, "designToDatabase", erdDocument.erdSettingModel.exportDdlSetting.commentStyle
    );

    return {
        resultType: "ready",
        input: {
            fileOption, connectionUrl, format: formatResult.format, filter: filterResult.filter,
            erdDocument, databaseType, scope, timeouts: timeoutsResult.timeouts
        }
    };
};

export const dbDifference: SchemaCommand = { name: "db-diff", usage, optionSpecs, create: initializeExecute } as const;
