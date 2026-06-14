---
name: update-changelog
description: >
  Generate and insert a new CHANGELOG.md version entry from git changes between main and the current branch.
  Use this skill whenever the user wants to update CHANGELOG.md, write release notes,
  document what changed since branching from main, or add a new version entry.
  Trigger on phrases like "update changelog", "add changelog entry", "document changes".
---

# Update CHANGELOG

Generate a user-facing CHANGELOG.md entry from the git changes between `main` and the current branch.

## Step 1: Gather information

```bash
date +%Y%m%d                          # today's date → version number
git log main..HEAD --oneline          # commits on this branch
git diff main..HEAD                   # full diff for analysis
```

## Step 2: Identify user-facing changes

Analyze the diff from the **user's perspective** — what they can do differently, not how the code changed.

**Include:**
- New features, UI options, menu items, commands, or keyboard shortcuts
- Behavior changes visible to the user (defaults, layout, export output, etc.)
- Bug fixes that affected users (what broke, in what scenario)
- New file format support or protocol options

**Exclude:**
- Internal refactoring, code cleanup, or abstraction changes
- Test additions or fixes
- Dependency version bumps (unless they fix a user-visible bug)
- Build/CI configuration changes
- Developer tooling (guidelines, linter config, etc.)

If there are **no user-facing changes**, state that clearly instead of inventing entries.

## Step 3: Generate the entry

Version format: `0.{yyyyMMdd}` using today's date from Step 1.

Follow the existing CHANGELOG.md format exactly:

```markdown
## [0.yyyyMMdd] - yyyy-MM-dd

### Added

- **Feature Title**:

  One to three sentences describing what was added, from the user's perspective.
  What can users do now that they couldn't before?

### Changed

- **Change Title**:

  What changed and how it affects users.

### Fixed

- **Fix Title**:

  What was broken, in what scenario, and what is now correct.
```

Formatting rules:
- Only include sections (`### Added`, `### Changed`, `### Fixed`) that have content
- Bold title on the bullet line, followed by a colon
- Body indented with two spaces, separated from the title line by a blank line
- English only, concise, present tense ("Users can now...", "The dialog now shows...")
- Group multiple related sub-points under one bullet using indented sub-bullets if needed

## Step 4: Present and confirm

Show the generated entry as a markdown preview. Then ask the user whether to:

1. Insert it into CHANGELOG.md (place just below the `## [Unreleased]` line)
2. Revise the content first

Do **not** write to the file until the user confirms.
