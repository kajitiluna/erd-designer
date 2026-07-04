# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.20260705] - 2026-07-05

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
