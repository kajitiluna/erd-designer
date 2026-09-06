# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **CLI: `erd-diff` command**:

  `node erd-cli.cjs erd-diff --file <path.erd> --from <path.erd>` compares two `.erd` revisions and
  reports schema-level differences (added/removed tables, columns, types, indexes, foreign keys, and more)
  in a form a reviewer can read without diffing the raw JSON. No database connection is required, and it
  works with all supported database dialects. Output can be `text` (default), `json`, or `markdown`
  (for posting as a PR comment). Tables can be excluded with repeatable `--ignore-table <regex>`, and
  individual comparison categories can be turned off with `--no-index` / `--no-foreign-key` / `--no-comment`
  / `--no-schema`. The command always exits `0` regardless of whether differences were found; only a
  read failure (missing file, invalid `.erd`) exits `2`.

- **CLI: `db-diff` command**:

  `node erd-cli.cjs db-diff --file <path.erd>` connects to a live PostgreSQL, MySQL, or MariaDB
  database (read-only — it only issues `SELECT`) and checks that the schema matches the `.erd` design.
  Connection is via `ERD_DB_URL` (preferred, so credentials never land in shell history or CI logs) or
  `--dsn <url>`. Exit code is `0` (no drift), `1` (drift found), or `2` (execution error — connection
  failure, missing `pg`/`mysql2` driver, or an unsupported dialect). Same `--ignore-table` / `--no-*` /
  `--format` options as `erd-diff`, plus `--schema <name>` to target a schema (PostgreSQL) or override
  the database name (MySQL/MariaDB). The `pg` and `mysql2` drivers are not bundled — the npm package
  (`@kajitiluna/erd-cli`) declares them as optional dependencies and installs them automatically;
  other distributions (GitHub Release, agent plugin) require installing them manually in the working
  directory.

- **CLI: `migrate-ddl` command**:

  `node erd-cli.cjs migrate-ddl --file <path.erd> [--from <path.erd> | --dsn <url>]` generates
  `ALTER` statements that bring a database or another `.erd` revision in line with the design.
  Nothing is applied automatically — output is a draft to review, printed to stdout or written to
  a file with `--out <path.sql>`. Destructive operations (`DROP COLUMN` / `DROP TABLE` / dropping
  an index or constraint) are commented out by default; `--allow-destructive` emits them as
  executable SQL. Differences that cannot be safely turned into SQL (adding a `NOT NULL` column
  with no `DEFAULT`, a whole missing table) are marked `-- unsupported:` instead of silently
  dropped or auto-generated.

### Changed

- **CLI: unknown options are now rejected instead of silently ignored**. `run` and `validate` no longer
  accept arbitrary trailing flags; an unrecognized `--xxx` option now exits with an error instead of being
  dropped without comment.

## [0.20260824] - 2026-08-24

### Added

- **Import ERMaster (.erm) diagrams**:

  Diagrams created with ERMaster can now be opened directly and are converted into an ERD Designer
  diagram. Tables, columns, column groups, relations, indexes, unique keys, notes, categories
  (as perspectives) and colors are carried over. MySQL, PostgreSQL, SQLite and SQL Server files are
  supported; a file for any other database is reported as an error.

  - Web app: the start screen button is now "Import from .erd / .erm file", and the import dialog
    accepts both extensions.
  - Google Drive: opening a `.erm` file from Drive asks for confirmation, stating whether a new
    `<name>.erd` will be created in the same folder or an existing one overwritten, then opens the
    result for editing.
  - VS Code: opening a `.erm` file writes `<name>.erd` next to the original and opens it in the ERD
    editor. You are asked before an existing `.erd` is overwritten. The `.erm` file itself is never
    modified.

## [0.20260811] - 2026-08-11

### Added

- **MCP Server / Agent plugin: create a new .erd file**:

  A new `create-document` tool creates a brand-new `.erd` file, so an AI assistant can start a diagram
  from scratch instead of asking you to make an empty file in the app first. It takes the file path and
  the target database, plus an optional diagram name that defaults to the file name. The database type
  cannot be changed later, so it must be given explicitly. An existing file is never overwritten, and the
  parent directory must already exist. In VS Code the new file opens in the ERD editor right away.

- **VS Code extension on Open VSX**:

  The extension is now published to the Open VSX Registry alongside the Visual Studio Marketplace, so it
  can be installed directly from editors such as VSCodium, Cursor, and Windsurf.

### Changed

- **CLI accepts file URIs and reports a missing file clearly**:

  `erd-cli` now takes either an absolute OS path or a `file://` URI for `--file`. When a tool that edits an
  existing document is pointed at a path that does not exist, the CLI now reports the missing file instead
  of failing while reading it.

## [0.20260809] - 2026-08-09

### Added

- **Hidden columns shown on hover**:

  When "Show Columns" hides some of a table's columns, select the table and hover over it to see the full column list
  in a popup. It does not appear while you drag the table, or when "Show Columns" is set to "All Columns".

- **Open sample diagram**:

  A new "Open sample diagram" button on the start screen opens a ready-made EC site schema, so you can try out
  the editor without drawing a diagram first. An error message appears if the sample cannot be loaded.

### Changed

- **Google Drive app: re-authorization no longer needed every hour**:

  The access token is now renewed in the background. Once it is within ten minutes of expiring,
  your next click or key press in the editor triggers the renewal, and a short notice confirms it.
  The "Reauthorize" prompt still appears if the browser blocks the renewal popup,
  or if you were idle long enough for the token to lapse.

### Fixed

- **Google Drive app: edits are no longer lost when the session expires**:

  An expired access token used to close the editor, discarding unsaved changes and the undo history.
  The diagram now stays open and editable. Saving and remote sync pause until you re-authorize,
  then the pending edits are saved. If the file changed on Drive in the meantime, the usual conflict notice appears
  instead of overwriting it.


## [0.20260803] - 2026-08-03

### Added

- **Column display options**:

  The canvas can now hide columns per document. From the gear menu, open "Display Style" and pick
  "Show Columns": All Columns, Only PK Columns, PK or FK Columns, or No Columns (table name only).
  The choice applies to the canvas, SVG export, and the canvas search panel, and is saved with the file.

- **MCP Server / Agent plugin: column display style**:

  `update-document` accepts a new `displayColumnStyle` field (`all`, `pk`, `pk_fk`, `none`) to switch
  which columns the canvas shows. The document detail response now also reports the current
  `displayNameStyle` and `displayColumnStyle`, so agents can tell when columns exist in the document
  but are hidden on the canvas.

### Changed

- **Display Style menu reworked**:

  The "Display Style" submenu now shows dropdowns for "Name Style" and "Show Columns" together with
  the "Show Relation Names" switch. The submenu stays open while adjusting several settings in a row,
  and closes the whole menu once you dismiss it.

- **MCP Server / Agent plugin: `displayStyle` renamed to `displayNameStyle`**:

  The `update-document` field that selects physical / logical / both names is now `displayNameStyle`.
  Existing `.erd` files are unaffected.


## [0.20260801] - 2026-08-01

### Added

- **Auto-sync for the Google Drive app**:

  The Google Drive app can now detect and pull in changes made to the file outside the app
  (e.g. by another user, or by the agent plugin CLI). Enable "Sync Google Drive" from the
  gear menu to poll for remote updates and apply them to the canvas as an undoable edit.
  Off by default.

### Changed

- **Link previews for the web app**:

  Sharing a link to the app on social platforms, chat, or a blog now renders a title,
  description, and preview image instead of a bare URL.

### Fixed

- **Google Drive app: saving no longer gets stuck after a failed request**:

  A network error during save previously left the internal save queue in a broken state,
  silently blocking every subsequent save until the tab was reloaded.
  Failed save attempts are now handled without blocking later saves.


## [0.20260726] - 2026-07-26

### Added

- **MariaDB, SQLite, BigQuery, and Snowflake database support**:

  DDL export and import now support four additional database types, alongside the existing PostgreSQL, MySQL,
  and MS SQL Server support. Select a database type from the icon menu in the title panel.

  - **MariaDB** — MySQL-compatible DDL, UUID / INET4 / INET6 types, Auto Increment
  - **SQLite** — Type affinity based column types, rowid-based auto numbering (table-level PRIMARY KEY),
    comments as `--` lines, foreign keys emitted as guidance comments
  - **BigQuery** — Dataset (schema) support, `ARRAY<T>` / `STRUCT` types, `NOT ENFORCED` primary /
    foreign keys, `OPTIONS(description=...)` comments
  - **Snowflake** — Schema support, inline `COMMENT` syntax, AUTOINCREMENT, semi-structured types
    (VARIANT / OBJECT / ARRAY)

- **STRUCT columns for BigQuery**:

  Columns can now be defined as BigQuery `STRUCT` types with nested fields, edited through a new Struct Column dialog.
  Struct columns and their nested members are rendered on the canvas, included in DDL export/import
  and specification exports, and are searchable individually via the canvas search panel (Ctrl+F / Cmd+F).

- **MCP Server / Agent plugin: STRUCT column share tools**:

  New MCP tools allow AI agents to create, update, and manage BigQuery STRUCT column share models
  and their nested fields, matching the STRUCT column support above.

### Changed

- **Simplified column model search dialog**:

  The "Search column model" dialog — opened from the search icon next to "Associated with :" in the column edit dialog
  — now filters with a single keyword box that searches physical name, logical name, type, and description at once,
  instead of a separate filter field for each of them.
  Multiple space-separated keywords match any entry containing one of them. The same dialog appears
  as "Search struct column model" when associating a struct column.

- **Agent plugin: Google Drive app limitation documented**:

  The Google Drive app only reads a file when it is opened, so it does not detect changes made
  by the agent CLI while the app's tab stays open.
  Editing with the CLI while the tab is open can also cause the app's next save to fail with a conflict.
  Close the ERD Designer tab before running the CLI, and reopen the file afterwards to see the result.


## [0.20260711] - 2026-07-11

### Fixed

- **Keyboard shortcuts interfering with search panel input**:

  Typing in the search panel could trigger canvas keyboard shortcuts (e.g. Delete, arrow keys),
  making it difficult to edit search text. Canvas shortcuts are now suppressed while a text input field has focus.


## [0.20260707] - 2026-07-07

### Fixed

- **PNG export rendering in the VS Code extension**:

  Exporting a diagram to PNG from the VS Code extension could produce a broken or
  incomplete image. PNG export now renders correctly.


## [0.20260706] - 2026-07-06

### Added

- **Agent plugin (CLI + skill) for coding agents**:

  A new agent plugin enables coding agents like Claude Code to read and edit `.erd` files
  without requiring a running VSCode extension.
  The plugin bundles a standalone CLI (`erd-cli.cjs`) and a skill definition,
  so agents can create tables, columns, relations, and perspectives directly from the terminal.

### Changed

- **Google Drive app top page redesign**:

  The Google Drive app landing page now uses a unified visual style with the main web app,
  including a gradient background, a refreshed logo layout, and consistent button styling.


## [0.20260704] - 2026-07-04

### Added

- **Search panel on canvas**:

  Users can now search for tables, columns, relations, and memos on the canvas.
  Press Ctrl+F (or Cmd+F on macOS) to open the search panel, or click the search icon.
  Matching items are highlighted on the canvas, and arrow buttons (or Enter/Shift+Enter) navigate between results.
  Search targets can be filtered by category using checkboxes.

### Changed

- **Boundless canvas**:

  The canvas is no longer constrained to a fixed area. Users can pan freely in any direction using
  right-click or middle-click drag, and zoom with the mouse wheel.


## [0.20260614] - 2026-06-14

### Changed

- **MCP Server: Read operations now available as tools**:

  Document, table, column, perspective, and other lookup operations that were previously
  accessible only as MCP resources are now also exposed as tools.
  This allows AI agents that work primarily with tools to access ERD data without using resource URIs.

  In addition, some tool names were updated for consistency:
  `fetch_database` → `fetch-database`, `find-perspective-by-id` → `find-perspective`,
  `find-document-by-uri` → `find-document-by-filepath`.


## [0.20260530] - 2026-05-30

### Added

- **DDL import: CHECK constraint expression for columns**:

  When importing DDL, column-level `CHECK (...)` constraints are now recognized.
  The expression is populated into the CHECK field in the column edit dialog,
  and is reflected in subsequent DDL exports as a `CHECK (...)` clause.
  Previously, CHECK expressions were silently ignored during import.

- **MCP Server: CHECK constraint, CHARACTER SET/COLLATE, and expression options for tables and columns**:

  The MCP server tools for adding and updating tables and column-shares now support the fields
  introduced in versions 0.20260509 and 0.20260521:
  `checkExpression`, `characterSet`, `collate`, `optionExpression` (columns), and `definitionExpression` (tables).

- **MCP Server: Comment style options for DDL export**:

  The `export-ddl` tool now accepts `commentStyle` and `commentSeparator` in `exportDdlSetting`,
  as introduced in version 0.20260523.


## [0.20260523] - 2026-05-23

### Added

- **Comment style options for DDL export**:

  When exporting DDL, you can now choose how comments are generated for tables and columns.

  - **Logical Name** *(default)*: Uses only the logical name as a comment. This matches the previous behavior.
  - **Logical Name + Description**: Combines the logical name and description into a single comment,
    joined by a configurable separator string.

  The separator can be freely customized in the export dialog.
  The Comment Style selector and separator input are enabled only when the "Comments" option is checked.


## [0.20260521] - 2026-05-21

### Added

- **CHECK constraint expression for tables and columns**:

  You can now define CHECK constraint expressions for both tables and individual columns.

  - **Table edit dialog**:

    A new "Check" tab provides a text field for entering a table-level CHECK expression.
    Use `${column_name}` placeholders to reference column physical names.
    Placeholders are automatically resolved at DDL export time, and are updated in sync
    when a column's physical name is renamed.

  - **Column edit dialog**:

    A CHECK expression field is now available for individual columns.
    Use `${this}` as a placeholder to refer to the column itself (e.g., `${this} > 0`).

  These expressions are reflected in the DDL export as `CHECK (...)` constraints.


### Changed

- **Relation context menu**:

  Added a "Reset label" option to the relation context menu.
  You can now quickly restore a relation label to display its relation name.


## [0.20260509] - 2026-05-09

### Added

- **CHARACTER SET, COLLATE, and option expression for tables and columns**:

  You can now specify CHARACTER SET, COLLATE, and custom option expressions
  for tables and columns directly in their edit dialogs. The fields available vary by database type.

  - **Table edit dialog**:

    A new "Other Option" tab provides fields for CHARACTER SET, COLLATE, a definition expression,
    and a table option expression.

  - **Column edit dialog**:

    An expandable "Other option" section appears for text-type columns, with fields for CHARACTER SET, COLLATE,
    and a column option expression.

  These settings are reflected in DDL export and parsed when importing DDL files.


### Changed

- **Relation edit dialog**:

  Improved the layout of the cardinality input section.

- **Optimized ERD file output format**:

  The serialization of column type definitions in `.erd` files has been optimized to omit default values,
  reducing file size while maintaining full compatibility during import.


## [0.20260503] - 2026-05-03

### Added

- **HTML / SVG export**:

  Added the ability to export the ERD as a standalone interactive HTML or SVG file
  (`Export image as > interactive HTML` or `interactive SVG`).
  The exported HTML supports pan/zoom, perspective switching, and can be opened in any browser without dependencies.
  (contributed by @shlomi-dr —
    [#177](https://github.com/kajitiluna/erd-designer/pull/177),
    [#178](https://github.com/kajitiluna/erd-designer/pull/178))


### Changed

- **Export menu improvements**:

  The image export submenu now uses a hoverable submenu style for selecting the export format (PNG, SVG, HTML).
  Export options are disabled when a non-default perspective is active.

- **Rounded corners for relation lines**:

  Relation lines (both straight and orthogonal) are now rendered with rounded corners,
  improving the visual clarity of the ERD diagram.
  (contributed by @shlomi-dr — [#171](https://github.com/kajitiluna/erd-designer/pull/171))

- **Relation name clearing**:

  Clearing the relation name in the relation editor now correctly resets the displayed label.


### Fixed

- **Relation rendering fix during drag**:

  Fixed an issue where dragging a table or relation line would cause incorrect rendering of relation lines
  when a relation label was displayed.

- **PNG export clipping fix**:

  Fixed an issue where relation lines extending outside the bounds of tables or memos
  were clipped and not fully rendered in the exported PNG image.

- **Firefox: Unexpected drag ghost image when moving selected tables**:

  Fixed an issue in Firefox where dragging tables after a rubber-band selection caused
  the browser to display an unexpected ghost image roughly the size of the canvas.


## [0.20260426] - 2026-04-26

### Added

- **Pinch-to-zoom / mouse wheel zoom support**: 

  Users can now zoom the canvas smoothly using `Ctrl+Wheel` (or `⌘+Wheel` on macOS). 
  The scale panel reflects the live zoom level in real time.
  (Contributed by @shlomi-dr —
    [#162](https://github.com/kajitiluna/erd-designer/pull/162),
    [#164](https://github.com/kajitiluna/erd-designer/pull/164))

- **"Show relation names" setting**:

  A toggle switch has been added to the settings menu in the title panel. The setting is persisted in the `.erd` file.
  (Contributed by @shlomi-dr — [#159](https://github.com/kajitiluna/erd-designer/pull/159))

- **Relation label overlay**:

  Relation names are now rendered as draggable labels directly on the canvas when "Show relation names" is enabled.
  Label position, color, font size, bold, italic, and strikethrough can all be customized interactively.
  (Contributed by @shlomi-dr —
    [#159](https://github.com/kajitiluna/erd-designer/pull/159),
    [#160](https://github.com/kajitiluna/erd-designer/pull/160))

- **Batch export of all perspectives as images**:

  A new "Export as images > All perspectives" menu item exports each perspective sequentially as a PNG file.
  (Contributed by @shlomi-dr —
    [#160](https://github.com/kajitiluna/erd-designer/pull/160),
    [#166](https://github.com/kajitiluna/erd-designer/pull/166))

### Fixed

- Fixed an issue where table, memo, and relation toolbars were displayed at incorrect sizes
  when the canvas was zoomed in or out.
  Toolbars now always appear at a consistent size regardless of the current zoom level.
  (Contributed by @shlomi-dr — [#162](https://github.com/kajitiluna/erd-designer/pull/162))
