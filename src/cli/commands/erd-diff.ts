import { TableFilter } from "~/cli/commands/support/table-filter";
import { SchemaCompareOptions } from "~/cli/commands/support/schema-compare-options";
import { CommandOptions } from "~/cli/options";
import SchemaCommand, { SchemaCommandResult } from "~/cli/commands/schema-command";
import { ErdDocumentFile } from "~/cli/support";
import DesignSnapshot from "~/models/schema/design-snapshot";
import { SchemaComparison } from "~/models/schema/schema-diff";
import { SchemaDiffReport } from "~/models/schema/schema-diff-report";
import { SchemaDiffReportContext } from "~/models/schema/schema-difference";

const usage = `\
erd-cli erd-diff --file <path.erd> --from <path.erd> [options]

  --file <path.erd>             The revision to check (usually the working tree).
  --from <path.erd>              The revision to compare against.
  --ignore-table <regex>        Exclude tables by name pattern. Repeatable.
  --no-index                    Skip index comparison.
  --no-foreign-key              Skip foreign key comparison.
  --no-comment                  Skip table/column comment comparison.
  --no-schema                   Compare by table name only, ignoring schema qualification.
  --format text|json|markdown   Output format. Defaults to text.
`;

const optionSpecs = [
    { name: "--file", arity: "single" },
    { name: "--from", arity: "single" },
    ...SchemaCompareOptions.OPTION_SPECS
] as const;

const execute = async (options: CommandOptions): Promise<SchemaCommandResult> => {
    const fileOption = options.findValue("--file");
    if (fileOption == null) {
        console.error("Missing required option: --file <path.erd>");
        return "error";
    }

    const fromOption = options.findValue("--from");
    if (fromOption == null) {
        console.error("Missing required option: --from <path.erd>");
        return "error";
    }

    const formatResult = SchemaCompareOptions.toDiffFormat(options);
    if (formatResult.resultType === "invalid") {
        console.error(formatResult.message);
        return "error";
    }

    const filterResult = TableFilter.create(options.listValues("--ignore-table"));
    if (filterResult.resultType === "invalid") {
        console.error(filterResult.message);
        return "error";
    }

    const currentResult = ErdDocumentFile.load(fileOption);
    if (currentResult.resultType === "failed") {
        console.error(currentResult.message);
        return "error";
    }

    const fromResult = ErdDocumentFile.load(fromOption);
    if (fromResult.resultType === "failed") {
        console.error(fromResult.message);
        return "error";
    }

    // commentStyle は expected 側(--file, current)の設計を正として使う。
    // SchemaComparison.compare のexpected/actual と対応させ、比較元(--from)の設定に引きずられないようにする。
    const scope = SchemaCompareOptions.toCompareScope(
        options, "designToRevision", currentResult.erdDocument.erdSettingModel.exportDdlSetting.commentStyle
    );

    const filter = filterResult.filter;

    const fromSchemaSnapshot = DesignSnapshot.toSchemaSnapshot(fromResult.erdDocument, scope);
    const fromSnapshot = filter.filterTables(fromSchemaSnapshot);

    const currentSnapshot = DesignSnapshot.toSchemaSnapshot(currentResult.erdDocument, scope);
    const ignoredTableNames = filter.ignoredTableNames(currentSnapshot);
    const filteredCurrentSnapshot = filter.filterTables(currentSnapshot);

    const diff = SchemaComparison.compare(filteredCurrentSnapshot, fromSnapshot, scope);
    const context: SchemaDiffReportContext = {
        direction: "designToRevision",
        databaseType: filteredCurrentSnapshot.databaseType,
        expectedLabel: fileOption,
        actualLabel: fromOption,
        expectedTableCount: filteredCurrentSnapshot.tables.length,
        ignoredTableNames
    };

    const report = SchemaDiffReport.format(diff, context, formatResult.format);
    console.log(report.stdout);
    if (report.stderr !== "") {
        console.error(report.stderr);
    }

    return "ok";
};

export const erdDifference: SchemaCommand = { name: "erd-diff", usage, optionSpecs, create: () => execute } as const;
