import {
    DifferenceCategory, DifferenceValue, SchemaDiff, SchemaDifference, SchemaDiffDirection, SchemaDiffFormat,
    SchemaDiffReportContext
} from "~/models/schema/schema-difference";
import { SchemaWarning } from "~/models/schema/schema-snapshot";

type SchemaDiffReportResult = { stdout: string, stderr: string };

export class SchemaDiffReport {

    private constructor() {
        // do nothing
    }

    /** models 層はコンソールを持たないため、出力先ごとの文字列を返して CLI に書かせる。 */
    public static format(
        diff: SchemaDiff, context: SchemaDiffReportContext, format: SchemaDiffFormat
    ): SchemaDiffReportResult {
        const stderr = formatWarningsAsText(diff.warnings);

        if (format === "json") {
            return { stdout: formatSchemaDiffAsJson(diff, context), stderr };
        }

        if (format === "markdown") {
            return { stdout: formatSchemaDiffAsMarkdown(diff, context), stderr };
        }

        return { stdout: formatSchemaDiffAsText(diff, context), stderr };
    }
}

const formatWarningsAsText = (warnings: readonly SchemaWarning[]): string => {
    if (warnings.length === 0) {
        return "";
    }

    const lines = warnings.map(warning => `warn: ${warning.message}`);
    return `${lines.join("\n")}\n`;
};

const formatSchemaDiffAsJson = (diff: SchemaDiff, context: SchemaDiffReportContext): string => {
    return JSON.stringify({
        direction: context.direction,
        databaseType: context.databaseType,
        expected: context.expectedLabel,
        actual: context.actualLabel,
        ignoredTableNames: context.ignoredTableNames,
        differences: diff.differences,
        warnings: diff.warnings
    });
};

/** designToRevision では expected(現在)/actual(比較元) を Before=actual / After=expected の順に入れ替えて見せる。 */
const toDisplayValues = (difference: SchemaDifference, direction: SchemaDiffDirection) => {
    return (direction === "designToDatabase")
        ? { left: difference.expected, right: difference.actual }
        : { left: difference.actual, right: difference.expected };
};

const formatSchemaDiffAsText = (diff: SchemaDiff, context: SchemaDiffReportContext): string => {
    const header = formatTextHeader(context);

    if (diff.differences.length === 0) {
        return `${header}\n\nNo differences found.\n`;
    }

    const labels = toCategoryLabels(context.direction);
    const body = formatTextBody(diff.differences, context.direction, labels);
    const summary = formatTextSummary(diff.differences, context.direction);

    return `${header}\n\n${body}\n${summary}\n`;
};

const formatTextHeader = (context: SchemaDiffReportContext): string => {
    const [expectedLabel, actualLabel] = (context.direction === "designToDatabase")
        ? ["design  ", "database"] : ["current ", "from    "];

    const lines = [
        "ERD Designer schema check",
        `  ${expectedLabel} : ${context.expectedLabel}  (${context.databaseType} / ${context.expectedTableCount} tables)`,
        `  ${actualLabel} : ${context.actualLabel}`
    ];

    if (context.ignoredTableNames.length > 0) {
        lines.push(`  ignored   : ${context.ignoredTableNames.length} tables (${context.ignoredTableNames.join(", ")})`);
    }

    return lines.join("\n");
};

type CategoryLabels = { [key in DifferenceCategory]: string };

const toCategoryLabels = (direction: SchemaDiffDirection): CategoryLabels => {
    return (direction === "designToDatabase") ? DESIGN_TO_DATABASE_LABELS : DESIGN_TO_REVISION_LABELS;
};

// missing/unexpected の意味は SchemaComparison.compare() 側で固定(actual 側から見た意味)だが、
// 呼び出し側にとっての自然な言葉は方向で変わる。db-diff なら「設計に無い」、erd-diff なら「削除された」。
const DESIGN_TO_DATABASE_LABELS: CategoryLabels = {
    "schema.missing": "Missing schema", "schema.unexpected": "Schema not in the design",
    "table.missing": "Missing table", "table.unexpected": "Table not in the design",
    "table.comment": "Table comment mismatch",
    "column.missing": "Missing column", "column.unexpected": "Column not in the design",
    "column.type": "Type mismatch", "column.nullability": "Nullability mismatch",
    "column.default": "Default value mismatch", "column.autoIncrement": "Auto-increment mismatch",
    "column.comment": "Column comment mismatch", "column.logicalName": "Logical name mismatch",
    "primaryKey": "Primary key mismatch",
    "uniqueKey.missing": "Missing unique key", "uniqueKey.unexpected": "Unique key not in the design",
    "uniqueKey.columns": "Unique key columns mismatch",
    "index.missing": "Missing index", "index.unexpected": "Index not in the design",
    "index.columns": "Index columns mismatch", "index.type": "Index type mismatch",
    "foreignKey.missing": "Missing foreign key", "foreignKey.unexpected": "Foreign key not in the design",
    "foreignKey.reference": "Foreign key reference mismatch"
} as const;

const DESIGN_TO_REVISION_LABELS: CategoryLabels = {
    "schema.missing": "Added schema", "schema.unexpected": "Removed schema",
    "table.missing": "Added table", "table.unexpected": "Removed table",
    "table.comment": "Table comment changed",
    "column.missing": "Added column", "column.unexpected": "Removed column",
    "column.type": "Type changed", "column.nullability": "Nullability changed",
    "column.default": "Default value changed", "column.autoIncrement": "Auto-increment changed",
    "column.comment": "Comment changed", "column.logicalName": "Logical name changed",
    "primaryKey": "Primary key changed",
    "uniqueKey.missing": "Added unique key", "uniqueKey.unexpected": "Removed unique key",
    "uniqueKey.columns": "Unique key columns changed",
    "index.missing": "Added index", "index.unexpected": "Removed index",
    "index.columns": "Index columns changed", "index.type": "Index type changed",
    "foreignKey.missing": "Added foreign key", "foreignKey.unexpected": "Removed foreign key",
    "foreignKey.reference": "Foreign key reference changed"
} as const;

const formatTextBody = (
    differences: readonly SchemaDifference[], direction: SchemaDiffDirection, labels: CategoryLabels
): string => {
    const schemaDifferences = differences.filter(difference => isSchemaLevelCategory(difference.category));
    const missingTables = differences.filter(difference => (difference.category === "table.missing"));
    const unexpectedTables = differences.filter(difference => (difference.category === "table.unexpected"));
    const changedTableGroups = groupChangedTableDifferences(differences);

    const sections = [
        ...schemaDifferences.map(difference => formatDifferenceLine(difference, direction, labels)),
        ...changedTableGroups.map(group => formatTableSection(group.tableName, group.differences, direction, labels)),
        ...formatNamedTableSection("Missing tables", missingTables, direction, labels),
        ...formatNamedTableSection("Tables not in the design", unexpectedTables, direction, labels)
    ];

    return sections.join("\n\n");
};

type DifferenceGroup = { tableName: string, differences: readonly SchemaDifference[] };

const groupChangedTableDifferences = (differences: readonly SchemaDifference[]): readonly DifferenceGroup[] => {
    const changedTableDifferences = differences.filter(difference =>
        (isTableLevelCategory(difference.category) === false)
        && (isSchemaLevelCategory(difference.category) === false)
    );

    const tableNames = Array.from(new Set(changedTableDifferences.map(difference => difference.tableName)));
    return tableNames.map(tableName => {
        const differences = changedTableDifferences.filter(difference => (difference.tableName === tableName));
        return { tableName, differences };
    });
};

const isTableLevelCategory = (category: DifferenceCategory): boolean => {
    return (category === "table.missing") || (category === "table.unexpected");
};

const isSchemaLevelCategory = (category: DifferenceCategory): boolean => {
    return (category === "schema.missing") || (category === "schema.unexpected");
};

const formatTableSection = (
    tableName: string, differences: readonly SchemaDifference[], direction: SchemaDiffDirection, labels: CategoryLabels
): string => {
    const lines = differences.map(difference => `  ${formatDifferenceLine(difference, direction, labels)}`);
    return `${quoteTextValue(tableName)}\n${lines.join("\n")}`;
};

const formatNamedTableSection = (
    title: string, differences: readonly SchemaDifference[], direction: SchemaDiffDirection, labels: CategoryLabels
): readonly string[] => {
    if (differences.length === 0) {
        return [];
    }

    const lines = differences.map(difference => `  ${formatDifferenceLine(difference, direction, labels)}`);
    return [`${title}\n${lines.join("\n")}`];
};

const formatDifferenceLine = (
    difference: SchemaDifference, direction: SchemaDiffDirection, labels: CategoryLabels
): string => {
    const label = labels[difference.category];
    const { left, right } = toDisplayValues(difference, direction);
    const [leftKey, rightKey] = (direction === "designToDatabase") ? ["design", "database"] : ["before", "after"];

    const parts = [
        (difference.targetName !== "") ? quoteTextValue(difference.targetName) : null,
        formatTextValueEntry(leftKey, left),
        formatTextValueEntry(rightKey, right)
    ].filter(part => (part != null));

    return (parts.length > 0) ? `${label}: ${parts.join(", ")}` : label;
};

// absent / present はラベル自体が事実を語っているため項目ごと落とす。
// blank は「値が空になった」ことが差分の中身なので (empty) と明示する。
const formatTextValueEntry = (key: string, value: DifferenceValue): string | null => {
    if ((value.state === "absent") || (value.state === "present")) {
        return null;
    }
    if (value.state === "blank") {
        return `${key}=(empty)`;
    }

    return `${key}=${quoteTextValue(value.text)}`;
};

// 値の内部に空白やカンマが含まれるため、区切りと値の境界をバッククォートで確定させる。
const quoteTextValue = (value: string): string => {
    return `\`${value}\``;
};

const formatTextSummary = (differences: readonly SchemaDifference[], direction: SchemaDiffDirection): string => {
    const changedTableCount = new Set(
        differences.filter(difference =>
            (isTableLevelCategory(difference.category) === false)
            && (isSchemaLevelCategory(difference.category) === false)
        ).map(difference => difference.tableName)
    ).size;

    const unexpectedTableCount = differences.filter(difference => (difference.category === "table.unexpected")).length;
    const missingTableCount = differences.filter(difference => (difference.category === "table.missing")).length;

    const unexpectedLabel = (direction === "designToDatabase") ? "unexpected table" : "removed table";
    const missingLabel = (direction === "designToDatabase") ? "missing table" : "added table";

    const parts = [
        (changedTableCount > 0) ? `${changedTableCount} table(s) changed` : null,
        (missingTableCount > 0) ? `${missingTableCount} ${missingLabel}(s)` : null,
        (unexpectedTableCount > 0) ? `${unexpectedTableCount} ${unexpectedLabel}(s)` : null
    ].filter(part => (part != null));

    const suffix = (parts.length > 0) ? ` (${parts.join(", ")})` : "";

    return `${differences.length} differences${suffix}`;
};

const formatSchemaDiffAsMarkdown = (diff: SchemaDiff, context: SchemaDiffReportContext): string => {
    const heading = (context.direction === "designToDatabase")
        ? "### ⚠️ Schema differences detected" : "### 📐 Schema changes";
    const subtitle = `\`${context.expectedLabel}\` ↔ \`${context.actualLabel}\` (${context.databaseType})`;

    if (diff.differences.length === 0) {
        return `${heading}\n\n${subtitle}\n\nNo differences found.\n`;
    }

    const labels = toCategoryLabels(context.direction);
    const [leftHeader, rightHeader] = (context.direction === "designToDatabase")
        ? ["Design", "Database"] : ["Before", "After"];

    const header = ["| Table | Kind | Target | " + leftHeader + " | " + rightHeader + " |", "|---|---|---|---|---|"];
    const rows = diff.differences.map(difference => formatMarkdownRow(difference, context.direction, labels));
    const summary = formatTextSummary(diff.differences, context.direction);

    return [heading, "", subtitle, "", ...header, ...rows, "", summary, ""].join("\n");
};

const formatMarkdownRow = (
    difference: SchemaDifference, direction: SchemaDiffDirection, labels: CategoryLabels
): string => {
    const label = labels[difference.category];
    const { left, right } = toDisplayValues(difference, direction);
    const tableCell = (difference.tableName !== "") ? `\`${difference.tableName}\`` : "—";
    const targetCell = (difference.targetName !== "") ? `\`${difference.targetName}\`` : "—";

    return `| ${tableCell} | ${label} | ${targetCell} | ${toMarkdownCell(left)} | ${toMarkdownCell(right)} |`;
};

const toMarkdownCell = (value: DifferenceValue): string => {
    if ((value.state === "absent") || (value.state === "present")) {
        return "—";
    }
    if (value.state === "blank") {
        return "*(empty)*";
    }

    return formatMarkdownValue(value.text);
};

// Markdown 表のセル区切りを壊さないため | は実体参照へ置き換える。
// 値自体がバッククォートを含む場合はコードスパンの区切りを二重化し、両端に空白を入れて閉じ位置を確定させる。
const formatMarkdownValue = (value: string): string => {
    const escaped = value.replaceAll("|", "&#124;");
    if (escaped.includes("`") === false) {
        return `\`${escaped}\``;
    }

    return `\`\` ${escaped} \`\``;
};
