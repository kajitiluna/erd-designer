# @kajitiluna/erd-cli

Schema verification for [ERD Designer](https://github.com/kajitiluna/erd-designer)
`.erd` files — compare a design against a live database or another revision, from the
command line or CI.

## What is ERD Designer?

**ERD Designer** is a free, open-source tool for visually designing database schemas.
You lay out tables and relationships on a canvas and generate DDL for PostgreSQL, MySQL,
MariaDB, MS SQL Server, SQLite, BigQuery, and Snowflake. It runs in three places, all
reading and writing the same file format:

- **Browser** — [kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)
  (no installation, no account)
- **VSCode extension** — [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kajitiluna.erd-designer)
- **Google Drive app** — [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491)

The design is saved as a `.erd` file — plain JSON, so it lives in Git alongside the code
it describes and shows up as a readable diff in a pull request.

## Why this CLI?

A diagram checked into Git is only useful while it still describes reality. Two things
break that, and neither is visible from inside the editor:

- **The design drifts from production.** A manual `ALTER`, or a migration tool running its
  own scripts, changes the database without touching the `.erd` file.
- **A schema change lands unreviewed.** `.erd` is JSON, so a pull request diff shows moved
  coordinates and internal ids next to the one column that actually matters.

This package closes both gaps by making the comparison mechanical, so it can run in CI:
`erd-diff` turns a `.erd` revision diff into a schema-level summary a reviewer can read;
`db-diff` connects to a live database and reports where it has drifted from the design,
with exit codes a CI job can act on; `migrate-ddl` drafts the `ALTER` statements that
close the gap. None of the three ever writes to a database — `db-diff` issues `SELECT`
only, and `migrate-ddl` prints SQL for you to review before you run it.

This package ships the schema-verification commands only (`erd-diff`, `db-diff`,
`migrate-ddl`). To edit `.erd` files or drive them through an AI agent, use the
[`erd-designer` agent plugin](https://github.com/kajitiluna/erd-designer#ai-agent-integration-agent-plugin)
instead.

## Installation

| Distribution | Command | Notes |
|---|---|---|
| npm (recommended for CI) | `npx @kajitiluna/erd-cli erd-diff --file docs/schema.erd --from /tmp/base.erd` | `pg` / `mysql2` install automatically as needed for `db-diff` |
| GitHub Release | `curl -sSL -o erd-cli.cjs https://github.com/kajitiluna/erd-designer/releases/latest/download/erd-cli.cjs && node erd-cli.cjs erd-diff ...` | Single file, no `npm install` |
| Agent plugin | `node <SKILL.md dir>/scripts/erd-agent.cjs erd-diff ...` | Same commands, bundled alongside the [agent plugin](https://github.com/kajitiluna/erd-designer#ai-agent-integration-agent-plugin) |

`db-diff` needs a database driver that isn't bundled. This npm package declares `pg` and `mysql2`
as optional dependencies and installs them automatically; the other two distributions require
installing the driver yourself in the working directory (`npm install pg` or `npm install mysql2`).

To pin the version rather than resolving it on every `npx` run:

```sh
npm install --save-dev @kajitiluna/erd-cli
npx erd-cli erd-diff --file docs/schema.erd --from /tmp/base.erd
```

## Commands

### `erd-diff`

Compares two `.erd` revisions and reports the schema-level differences (added/removed tables and
columns, type changes, index and foreign-key changes, and more) in a form a reviewer can read
without diffing the raw JSON. No database connection is required, and it works with every database
dialect ERD Designer supports.

```
erd-cli erd-diff --file <path.erd> --from <path.erd> [options]

  --ignore-table <regex>       Exclude tables by name pattern. Repeatable.
  --no-index                   Skip index comparison.
  --no-foreign-key             Skip foreign key comparison.
  --no-comment                 Skip table/column comment comparison.
  --no-schema                  Compare by table name only, ignoring schema qualification.
  --format text|json|markdown  Output format. Defaults to text.
```

```sh
git show origin/main:docs/schema.erd > /tmp/base.erd
npx @kajitiluna/erd-cli erd-diff --file docs/schema.erd --from /tmp/base.erd --format markdown
```

Exit code is always `0`, whether or not differences were found (differences are meant to be
reviewed, not to fail a build). A read failure (missing file, invalid `.erd`) exits `2`.

### `db-diff`

Compares the `.erd` design against a live database and reports where they've drifted apart. Only
`SELECT` statements are issued; nothing is written to the database.

```
erd-cli db-diff --file <path.erd> [options]

  --dsn <url>                   Connection string. ERD_DB_URL takes precedence.
  --schema <name>                Target schema (PostgreSQL). Defaults to the schemas the .erd design uses.
  --ignore-table <regex>        Exclude tables by name pattern. Repeatable. Matches either the bare
                                 table name or the schema-qualified `schema.table` form.
  --no-index                    Skip index comparison.
  --no-foreign-key              Skip foreign key comparison.
  --no-comment                  Skip table/column comment comparison.
  --no-schema                   Compare by table name only, ignoring schema qualification.
  --format text|json|markdown   Output format. Defaults to text.
```

```sh
export ERD_DB_URL='postgres://readonly@db.internal:5432/shop'
npx @kajitiluna/erd-cli db-diff --file docs/schema.erd
```

Pass the connection string via `ERD_DB_URL` rather than `--dsn` where possible — command-line
arguments can end up in shell history, `ps` output, and CI logs. A read-only database user is
recommended. `pg` and `mysql2` are declared as `optionalDependencies` and are installed
automatically by `npm install` / `npx`.

On PostgreSQL, without `--schema`, only the schemas the `.erd` design actually uses are scanned —
system namespaces (`pg_*`, `information_schema`) are never included unless you name one explicitly
with `--schema`. Tables created by migration tools (Flyway, Liquibase, etc.) are not excluded by
default; add them with `--ignore-table`:

```sh
npx @kajitiluna/erd-cli db-diff --file docs/schema.erd \
  --ignore-table '^flyway_schema_history$' --ignore-table '^databasechangelog'
```

Supported dialects for this command: PostgreSQL, MySQL, MariaDB. `erd-diff` above supports every
dialect ERD Designer supports, since it never connects to a database.

| Exit code | Meaning |
|---|---|
| `0` | No differences found |
| `1` | Differences found |
| `2` | Execution error (connection failure, missing driver, invalid `.erd`, unsupported dialect) |

If a table has never had its comment set, `--no-comment` avoids a wall of noise on the first run.

### `migrate-ddl`

Generates `ALTER` statements that bring a database — or another `.erd` revision — in line with the
design. Nothing is applied automatically; the output is a draft to review before running it.

```
erd-cli migrate-ddl --file <path.erd> [options]

  --dsn <url>              Target database. ERD_DB_URL takes precedence. Mutually exclusive with --from.
  --from <path.erd>        Compare against another .erd revision instead of a live database.
  --schema <name>          Target schema (database connections only).
  --out <path.sql>         Write output to a file. Defaults to stdout.
  --allow-destructive      Emit destructive operations (DROP ...) without commenting them out.
  --ignore-table <regex>   Exclude tables by name pattern. Repeatable.
```

```sh
# From a live database
ERD_DB_URL='postgres://readonly@db.internal:5432/shop' \
  npx @kajitiluna/erd-cli migrate-ddl --file docs/schema.erd --out /tmp/migrate.sql

# From another .erd revision (no database connection needed)
git show origin/main:docs/schema.erd > /tmp/base.erd
npx @kajitiluna/erd-cli migrate-ddl --file docs/schema.erd --from /tmp/base.erd
```

Destructive operations (`DROP COLUMN` / `DROP TABLE` / `DROP INDEX` / dropping a constraint) are
commented out by default; pass `--allow-destructive` to emit them as executable SQL. Differences
that cannot be safely turned into SQL (e.g. adding a `NOT NULL` column with no `DEFAULT`, since
existing rows' values are unknown) are marked `-- unsupported:` rather than silently dropped.
Whole missing tables are reported the same way — run `export-ddl` to generate their `CREATE TABLE`.

## CI integration

```yaml
name: ERD schema check

on:
  pull_request:
    paths:
      - 'docs/schema.erd'
  schedule:
    # Drift from production happens independently of PRs, so also run on a schedule.
    - cron: '0 0 * * *'

permissions:
  contents: read

jobs:
  erd-diff:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Diff against base branch
        run: |
          git show origin/${{ github.base_ref }}:docs/schema.erd > /tmp/base.erd
          npx @kajitiluna/erd-cli erd-diff \
            --file docs/schema.erd --from /tmp/base.erd --format markdown > /tmp/erd-diff.md
      - name: Comment on PR
        uses: actions/github-script@v8
        with:
          script: |
            const fs = require('node:fs');
            const body = fs.readFileSync('/tmp/erd-diff.md', 'utf-8');
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number, body: body
            });

  db-diff:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Check schema drift
        env:
          ERD_DB_URL: ${{ secrets.ERD_DB_URL }}
        run: |
          npx @kajitiluna/erd-cli db-diff \
            --file docs/schema.erd --ignore-table '^flyway_schema_history$'
```

The `db-diff` job is scheduled independently of PRs because drift from a manual `ALTER` has nothing
to do with pull requests — only a recurring check catches it.

## License

Apache-2.0
