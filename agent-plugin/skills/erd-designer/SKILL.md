---
name: erd-designer
description: >
  Create and edit ERD Designer .erd files (database entity-relationship diagrams).
  Use when the user asks to design database tables, add or modify tables, columns,
  relations, indexes or memos in a .erd file, or to export DDL from a .erd file.
---

# ERD Designer CLI

Edit `.erd` files directly with the bundled CLI. No MCP server, VSCode or running app is required.
Requires Node.js 20+.

The CLI ships with this skill at `scripts/erd-cli.cjs`, **relative to the directory containing
this SKILL.md**. This skill is self-contained (Agent Skills format), so it works from any agent
that supports skills — e.g. Claude Code and GitHub Copilot CLI. In the examples below, `$CLI`
stands for the resolved path:

```
CLI=<directory of this SKILL.md>/scripts/erd-cli.cjs
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

## Rules

- Do NOT edit `.erd` JSON by hand; always go through the CLI so referential integrity
  (column/share/relation IDs) and the canvas layout stay consistent.
- Omit `documentId` in `--args`; the CLI injects it from `--file` automatically.
- Only load the schemas you need via `describe`; do not dump all schemas at once.
- Files are saved as 4-space-indented JSON, the same format the ERD Designer app writes.
- The VSCode extension reflects CLI edits automatically while the file is open; no reload is
  needed. The browser app (IndexedDB) does not — re-import the file after CLI edits. The Google
  Drive app reflects CLI edits automatically too, but only when the user has enabled its
  "Sync changes from Google Drive" toggle (see below).
- Creating a brand-new `.erd` file is done in the ERD Designer app (it configures the target
  database type). The CLI edits existing files.

## Typical recipes

- **Add a table with columns**: `run add-table`, then `run add-columns-to-table` with the
  returned `tableId`.
- **Relate two tables**: look up ids via `run list-tables`, then `run create-relation`.
- **Review a design**: `run list-tables` (summaries) or `run find-table` (full detail).
- **Generate SQL**: `run export-ddl`.

## .erd format (background only)

A `.erd` file is a single JSON document containing `tableViewModels` (tables + canvas
positions), `columnModels` / `columnShareModels` (columns; shares hold the type definition
and can be reused by multiple columns), `relationViewModels`, memos and database settings.
IDs cross-reference between these arrays, which is why manual edits are unsafe.

## Google Drive / browser users

- Files stored in Google Drive can be edited locally through Google Drive for Desktop:
  point `--file` at the synced local path.
  Tell the user to enable "Sync changes from Google Drive" in the gear menu: with it on,
  they can keep the ERD Designer tab open while you edit, and your changes appear on the
  canvas within about 10 seconds. If the toggle is left off, fall back to the old workflow —
  tell the user to close the tab before you edit, and to reopen the file afterwards.
- The browser app (IndexedDB) is not reachable from the CLI; export the `.erd` file first,
  edit it, then import it back.
