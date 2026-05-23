---
description: >
  Use when modifying or creating source files.
  Covers test file placement, test update requirements, and verifying tests pass.
applyTo: "src/**/*.ts"
---

# Testing Requirements

Test files live in `__tests__/` directories adjacent to the source file (e.g. `src/models/__tests__/`).

When modifying a source file:
1. Add or update tests in the corresponding `__tests__/` directory to cover the change.
2. If creating a new source file, create a matching test file in the adjacent `__tests__/` directory.
3. Run `npm run testrun` and confirm all tests pass before considering the task complete.

## Code Conventions

- TypeScript strict mode; React components use `.tsx`, plain logic uses `.ts`
- CSS Modules (`.module.css`) for component styles
- No ESLint errors (`eslint.config.js`)
