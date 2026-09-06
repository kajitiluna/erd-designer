import { describe, expect, test } from 'vitest';

import { SchemaDiffReport } from '~/models/schema/schema-diff-report';
import { SchemaDiff, SchemaDifference, SchemaDiffReportContext } from '~/models/schema/schema-difference';

const DB_DIFF_CONTEXT: SchemaDiffReportContext = {
    direction: 'designToDatabase', databaseType: 'mysql',
    expectedLabel: 'docs/schema.erd', actualLabel: 'shop @ db.internal:3306',
    expectedTableCount: 6, ignoredTableNames: []
};

const ERD_DIFF_CONTEXT: SchemaDiffReportContext = {
    direction: 'designToRevision', databaseType: 'mysql',
    expectedLabel: 'docs/schema.erd', actualLabel: '/tmp/base.erd',
    expectedTableCount: 6, ignoredTableNames: []
};

const diffOf = (differences: SchemaDifference[]): SchemaDiff => {
    return { differences, warnings: [] };
};

describe('formatSchemaDiff (no differences)', () => {
    test('text format reports "No differences found."', () => {
        const { stdout } = SchemaDiffReport.format(diffOf([]), DB_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('No differences found.');
    });

    test('markdown format reports "No differences found." too', () => {
        const { stdout } = SchemaDiffReport.format(diffOf([]), DB_DIFF_CONTEXT, 'markdown');

        expect(stdout).toContain('No differences found.');
    });
});

describe('formatSchemaDiff (text, db-diff direction)', () => {
    const differences: SchemaDifference[] = [
        {
            category: 'column.type', schemaName: '', tableName: 'user', targetName: 'age',
            expected: { state: 'value', text: 'INT' }, actual: { state: 'value', text: 'SMALLINT' }
        },
        {
            category: 'column.nullability', schemaName: '', tableName: 'user', targetName: 'gender',
            expected: { state: 'value', text: 'NULL' }, actual: { state: 'value', text: 'NOT NULL' }
        },
        {
            category: 'column.missing', schemaName: '', tableName: 'shop_item', targetName: 'stock_quantity',
            expected: { state: 'value', text: 'INT NOT NULL' }, actual: { state: 'absent' }
        },
        {
            category: 'table.unexpected', schemaName: '', tableName: 'order_item_backup_20260701',
            targetName: 'order_item_backup_20260701', expected: { state: 'absent' }, actual: { state: 'present' }
        }
    ];

    test('header carries design/database labels and table count', () => {
        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('design   : docs/schema.erd  (mysql / 6 tables)');
        expect(stdout).toContain('database : shop @ db.internal:3306');
    });

    test('changed-table differences are grouped under their table name', () => {
        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('`user`\n  Type mismatch: `age`, design=`INT`, database=`SMALLINT`');
        expect(stdout).toContain('Nullability mismatch: `gender`, design=`NULL`, database=`NOT NULL`');
    });

    test('an unexpected table is grouped under its own dedicated section, not by table name', () => {
        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('Tables not in the design\n  Table not in the design: `order_item_backup_20260701`');
    });

    test('a table-level difference (missing/unexpected) has no value entries, since presence itself is the fact', () => {
        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('Table not in the design: `order_item_backup_20260701`');
        expect(stdout).not.toContain('Table not in the design: `order_item_backup_20260701`, ');
    });

    test('the summary line counts differences, changed tables, and unexpected tables', () => {
        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('4 differences (2 table(s) changed, 1 unexpected table(s))');
    });

    test('an ignored-table list appears in the header when present', () => {
        const context: SchemaDiffReportContext = {
            ...DB_DIFF_CONTEXT, ignoredTableNames: ['flyway_schema_history', 'order_item_backup_20260701']
        };

        const { stdout } = SchemaDiffReport.format(diffOf(differences), context, 'text');

        expect(stdout).toContain('ignored   : 2 tables (flyway_schema_history, order_item_backup_20260701)');
    });
});

describe('formatSchemaDiff (text, erd-diff direction)', () => {
    test('category labels use PR-review language, and missing/unexpected read as added/removed', () => {
        const differences: SchemaDifference[] = [
            {
                category: 'column.missing', schemaName: '', tableName: 'user', targetName: 'last_login_at',
                expected: { state: 'value', text: 'DATETIME' }, actual: { state: 'absent' }
            },
            {
                category: 'column.unexpected', schemaName: '', tableName: 'order', targetName: 'memo',
                expected: { state: 'absent' }, actual: { state: 'value', text: 'VARCHAR(255)' }
            }
        ];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('Added column: `last_login_at`, after=`DATETIME`');
        expect(stdout).toContain('Removed column: `memo`, before=`VARCHAR(255)`');
    });

    test('before/after values are swapped relative to expected/actual, since expected is the current revision', () => {
        const differences: SchemaDifference[] = [{
            category: 'column.type', schemaName: '', tableName: 'user', targetName: 'gender',
            expected: { state: 'value', text: 'VARCHAR(32)' }, actual: { state: 'value', text: 'VARCHAR(16)' }
        }];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('Type changed: `gender`, before=`VARCHAR(16)`, after=`VARCHAR(32)`');
    });

    test('a blank value (comment became empty) is shown as (empty), not the value literal "-"', () => {
        const differences: SchemaDifference[] = [{
            category: 'column.comment', schemaName: '', tableName: 'user', targetName: 'note',
            expected: { state: 'value', text: 'memo field' }, actual: { state: 'blank' }
        }];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'text');

        expect(stdout).toContain('Comment changed: `note`, before=(empty), after=`memo field`');
    });
});

describe('formatSchemaDiff (markdown)', () => {
    test('renders a table row per difference with Design/Database headers for db-diff', () => {
        const differences: SchemaDifference[] = [{
            category: 'column.type', schemaName: '', tableName: 'user', targetName: 'age',
            expected: { state: 'value', text: 'INT' }, actual: { state: 'value', text: 'SMALLINT' }
        }];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'markdown');

        expect(stdout).toContain('| Table | Kind | Target | Design | Database |');
        expect(stdout).toContain('| `user` | Type mismatch | `age` | `INT` | `SMALLINT` |');
    });

    test('renders Before/After headers for erd-diff, with an em dash for "-"', () => {
        const differences: SchemaDifference[] = [{
            category: 'column.missing', schemaName: '', tableName: 'user', targetName: 'last_login_at',
            expected: { state: 'value', text: 'DATETIME' }, actual: { state: 'absent' }
        }];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'markdown');

        expect(stdout).toContain('| Table | Kind | Target | Before | After |');
        expect(stdout).toContain('| `user` | Added column | `last_login_at` | — | `DATETIME` |');
    });

    test('a table-less difference renders an em dash in the Table column', () => {
        const differences: SchemaDifference[] = [{
            category: 'table.unexpected', schemaName: '', tableName: 'order_item_backup_20260701',
            targetName: 'order_item_backup_20260701', expected: { state: 'absent' }, actual: { state: 'present' }
        }];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), DB_DIFF_CONTEXT, 'markdown');

        expect(stdout).toContain('| `order_item_backup_20260701` | Table not in the design | `order_item_backup_20260701` | — | — |');
    });
});

describe('formatSchemaDiff (regression: value state is not confused with a literal "-")', () => {
    test('a user-authored comment value of "-" renders as the value itself, not as blank', () => {
        const differences: SchemaDifference[] = [{
            category: 'column.comment', schemaName: '', tableName: 'user', targetName: 'note',
            expected: { state: 'value', text: 'memo field' }, actual: { state: 'value', text: '-' }
        }];

        const { stdout: textStdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'text');
        expect(textStdout).toContain('Comment changed: `note`, before=`-`, after=`memo field`');
        expect(textStdout).not.toContain('before=(empty)');

        const { stdout: markdownStdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'markdown');
        expect(markdownStdout).toContain('`-`');
        expect(markdownStdout).not.toContain('*(empty)*');
        expect(markdownStdout).not.toContain('| — |');
    });

    test('markdown never leaks the internal presence sentinel "exists"', () => {
        const differences: SchemaDifference[] = [
            {
                category: 'table.missing', schemaName: '', tableName: 'shop_item', targetName: 'shop_item',
                expected: { state: 'present' }, actual: { state: 'absent' }
            },
            {
                category: 'table.unexpected', schemaName: '', tableName: 'order_item_backup_20260701',
                targetName: 'order_item_backup_20260701', expected: { state: 'absent' }, actual: { state: 'present' }
            }
        ];

        const { stdout } = SchemaDiffReport.format(diffOf(differences), ERD_DIFF_CONTEXT, 'markdown');

        expect(stdout).not.toContain('exists');
    });
});

describe('formatSchemaDiff (json)', () => {
    test('serializes direction, labels, differences, and warnings', () => {
        const differences: SchemaDifference[] = [{
            category: 'column.type', schemaName: '', tableName: 'user', targetName: 'age',
            expected: { state: 'value', text: 'INT' }, actual: { state: 'value', text: 'SMALLINT' }
        }];
        const diff: SchemaDiff = {
            differences,
            warnings: [{ category: 'column.order', schemaName: '', tableName: 'user', message: 'order differs' }]
        };

        const { stdout } = SchemaDiffReport.format(diff, DB_DIFF_CONTEXT, 'json');
        const parsed = JSON.parse(stdout);

        expect(parsed.direction).toBe('designToDatabase');
        expect(parsed.differences).toEqual(differences);
        expect(parsed.warnings).toEqual(diff.warnings);
    });
});

describe('formatSchemaDiff (warnings go to stderr, not stdout)', () => {
    test('a warning is rendered on stderr and does not appear in text stdout', () => {
        const diff: SchemaDiff = {
            differences: [],
            warnings: [{
                category: 'column.order', schemaName: '', tableName: 'user',
                message: 'column order differs in table "user"'
            }]
        };

        const { stdout, stderr } = SchemaDiffReport.format(diff, DB_DIFF_CONTEXT, 'text');

        expect(stderr).toContain('warn: column order differs in table "user"');
        expect(stdout).not.toContain('warn:');
    });
});
