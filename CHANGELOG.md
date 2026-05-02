# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

- **Relation rendering fix during drag**:

  Fixed an issue where dragging a table or relation line would cause incorrect rendering of relation lines
  when a relation label was displayed.


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
