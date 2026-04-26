# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.20260426] - 2026-04-26

### Added

- **Pinch-to-zoom / mouse wheel zoom support**: 

  Users can now zoom the canvas smoothly using `Ctrl+Wheel` (or `⌘+Wheel` on macOS). 
  The scale panel reflects the live zoom level in real time.
  (Contributed by @shlomi-dr — #162, #164)

- **"Show relation names" setting**:

  A toggle switch has been added to the settings menu in the title panel. The setting is persisted in the `.erd` file.
  (Contributed by @shlomi-dr — #159)

- **Relation label overlay**:

  Relation names are now rendered as draggable labels directly on the canvas when "Show relation names" is enabled.
  Label position, color, font size, bold, italic, and strikethrough can all be customized interactively.
  (Contributed by @shlomi-dr — #159, #160)

- **Batch export of all perspectives as images**:

  A new "Export as images > All perspectives" menu item exports each perspective sequentially as a PNG file.
  (Contributed by @shlomi-dr — #160, #166)

### Fixed

- Fixed an issue where table, memo, and relation toolbars were displayed at incorrect sizes
  when the canvas was zoomed in or out.
  Toolbars now always appear at a consistent size regardless of the current zoom level.
  (Contributed by @shlomi-dr — #162)
