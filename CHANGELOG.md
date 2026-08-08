# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Google Drive app: no more hourly re-authorization by hand**:

  The access token is now renewed silently. Once the token is within ten minutes of expiring, the next
  click or key press you make in the editor renews it in the background, so a long design session no
  longer needs you to press "Reauthorize" every hour. Renewal is skipped while you are typing in a text
  field, so no keystrokes are lost. If the browser blocks the renewal popup, or you have been idle long
  enough for the token to lapse, the "Reauthorize" notice still appears as before.

### Fixed

- **Google Drive app: edits are no longer discarded when the session expires**:

  An expired access token used to unmount the editor, losing unsaved changes and the undo history.
  The diagram now stays open and editable; saving and remote sync pause, and the edits made while the
  session was expired are saved once you re-authorize. If the file changed on Drive in the meantime,
  the existing conflict notice appears instead of overwriting it.


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
