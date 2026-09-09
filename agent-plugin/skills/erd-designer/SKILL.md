---
name: erd-designer
description: >
  Create and edit ERD Designer .erd files (database entity-relationship diagrams).
  Use when the user asks to design database tables, add or modify tables, columns,
  relations, indexes or memos in a .erd file, to export DDL from a .erd file, or to check
  whether a .erd design matches another revision or a live database.
---

# ERD Designer CLI

Edit `.erd` files directly with the bundled CLI. No MCP server, VSCode or running app is required.
Requires Node.js 22+.

The CLI ships with this skill at `scripts/erd-agent.cjs`, **relative to the directory containing
this SKILL.md**. This skill is self-contained (Agent Skills format), so it works from any agent
that supports skills — e.g. Claude Code and GitHub Copilot CLI. In the examples below, `$CLI`
stands for the resolved path:

```
CLI=<directory of this SKILL.md>/scripts/erd-agent.cjs
```

## Workflow

1. **Discover tools** (names and one-line summaries):
   ```
   node $CLI list-tools
   ```
2. **Inspect a tool** before first use (full description + JSON schema of its arguments):
   ```
   node $CLI describe <tool-name>
   ```
3. **Run a tool** against a `.erd` file:
   ```
   node $CLI run <tool-name> --file <path/to/file.erd> --args '<json>'
   ```
   The result is printed as JSON on stdout. Mutating tools save the file in place.
4. **Validate** a `.erd` file (e.g. after external changes):
   ```
   node $CLI validate --file <path/to/file.erd>
   ```
5. **Check the design against reality** (optional, no MCP tools involved — see below):
   ```
   node $CLI erd-diff --file <path/to/file.erd> --from <path/to/other-revision.erd>
   node $CLI db-diff --file <path/to/file.erd>   # needs ERD_DB_URL or --dsn, and pg/mysql2 installed
   ```

## Rules

- Do NOT edit `.erd` JSON by hand; always go through the CLI so referential integrity
  (column/share/relation IDs) and the canvas layout stay consistent.
- Omit `documentId` and `filePath` in `--args`; the CLI injects them from `--file` automatically.
- Only load the schemas you need via `describe`; do not dump all schemas at once.
- Files are saved as 4-space-indented JSON, the same format the ERD Designer app writes.
- The VSCode extension reflects CLI edits automatically while the file is open; no reload is
  needed. The browser app (IndexedDB) does not — re-import the file after CLI edits. The Google
  Drive app reflects CLI edits automatically too, but only when the user has enabled its
  "Sync Google Drive" toggle (see below).
- Create a brand-new `.erd` file with `run create-document`, pointing `--file` at a path that does
  not exist yet. `databaseType` is required and cannot be changed afterwards, so confirm the target
  database with the user first. The tool never overwrites an existing file.

## Typical recipes

- **Start a new diagram**: `run create-document --file <path/to/new.erd> --args
  '{"databaseType":"postgres"}'` (`postgres`, `mysql`, `mariadb`, `ms_sqlserver`, `sqlite`,
  `bigquery` or `snowflake`). `documentName` defaults to the file name without `.erd`.
  The response carries the `documentId` for the tools that follow.
- **Add a table with columns**: `run add-table`, then `run add-columns-to-table` with the
  returned `tableId`.
- **Relate two tables**: look up ids via `run list-tables`, then `run create-relation`.
- **Review a design**: `run list-tables` (summaries) or `run find-table` (full detail).
- **Generate SQL**: `run export-ddl`.
- **Review what changed since a base revision**: `erd-diff --file <current.erd> --from <base.erd>
  --format markdown` (see below; not an `run <tool-name>` call, and not a source of truth for
  `documentId` — use `list-documents` / `find-document-by-filepath` for that).
- **Check drift against a live database**: `db-diff --file <file.erd>` (`ERD_DB_URL` or `--dsn`
  required; `pg`/`mysql2` must be installed in the working directory — not bundled).

## Schema verification (erd-diff / db-diff / migrate-ddl)

These are separate top-level commands, not agent tools — they don't go through `run`, don't take
`--args`, and don't touch `documentId`. They compare `.erd` schemas against another revision or a
live database rather than editing a diagram.

- `node $CLI erd-diff --file <path.erd> --from <path.erd> [--format text|json|markdown]` —
  schema-level diff between two `.erd` revisions. No database connection needed.
- `node $CLI db-diff --file <path.erd>` — checks the design against a live PostgreSQL/MySQL/MariaDB
  database. Read-only. Requires `ERD_DB_URL` (preferred) or `--dsn <url>`, and the `pg` or `mysql2`
  driver installed in the current working directory (not bundled with this skill).
- `node $CLI migrate-ddl --file <path.erd> [--from <path.erd> | --dsn <url>] [--out <path.sql>]` —
  drafts `ALTER` statements to close the gap. Never applies them; review the output before running it.

Use `erd-diff`/`db-diff` when the user asks "what changed" or "is this in sync with the database" —
don't try to answer that by reading the raw JSON.

## .erd format (background only)

A `.erd` file is a single JSON document containing `tableViewModels` (tables + canvas
positions), `columnModels` / `columnShareModels` (columns; shares hold the type definition
and can be reused by multiple columns), `relationViewModels`, memos and database settings.
IDs cross-reference between these arrays, which is why manual edits are unsafe.

## Google Drive / browser users

- Files stored in Google Drive can be edited locally through Google Drive for Desktop:
  point `--file` at the synced local path.
  Tell the user to enable "Sync Google Drive" in the gear menu: with it on,
  they can keep the ERD Designer tab open while you edit, and your changes appear on the
  canvas within about 10 seconds. If the toggle is left off, fall back to the old workflow —
  tell the user to close the tab before you edit, and to reopen the file afterwards.
- The browser app (IndexedDB) is not reachable from the CLI; export the `.erd` file first,
  edit it, then import it back.
