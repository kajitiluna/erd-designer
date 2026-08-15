# @kajitiluna/erd-cli

Verify that a designed [ERD Designer](https://github.com/kajitiluna/erd-designer) `.erd` schema
matches a live database or another `.erd` revision — from the command line or CI.

This package ships the schema-verification commands only (`erd-diff`, `db-diff`, `migrate-ddl`).
To edit `.erd` files or drive them through an AI agent, use the
[`erd-designer` agent plugin](https://github.com/kajitiluna/erd-designer) instead.

## Usage

```sh
npx @kajitiluna/erd-cli erd-diff --file docs/schema.erd --from /tmp/base.erd
```

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

## License

Apache-2.0
