# Contributing to ERD Designer

Thanks for taking the time to contribute. This document covers what you need to get the
project running locally and what a pull request is expected to look like.

## Ways to contribute

- **Report a bug** — open an [Issue](https://github.com/kajitiluna/erd-designer/issues/new/choose).
  ERD Designer ships as four surfaces (browser app, VSCode extension, Google Drive app, agent
  CLI) that share one codebase, so please tell us which one you hit the problem on.
- **Request a feature** — open an Issue describing the problem you are trying to solve rather
  than only the solution you have in mind.
- **Ask a question or float an idea** — start a
  [Discussion](https://github.com/kajitiluna/erd-designer/discussions).
- **Send a pull request** — for anything beyond a small fix, please open an issue first so we
  can agree on the approach before you spend time on it.

## Development setup

Node.js 22.12 or higher is required (the repo pins 22.12.0 via [Volta](https://volta.sh/)).

```sh
git clone https://github.com/kajitiluna/erd-designer.git
cd erd-designer
npm ci
npm run dev          # browser app on http://localhost:5173/erd-designer
```

To work on the VSCode extension instead, open the repo in VSCode and press <kbd>F5</kbd>
— `.vscode/launch.json` builds the extension and opens an Extension Development Host.

### Checks

Run all three before pushing. CI (`.github/workflows/check-pr.yml`) runs the same commands and
a pull request cannot be merged while any of them fails.

```sh
npx tsc -b           # type check
npm run lint         # ESLint
npm run testrun      # vitest, single run
```

`npm run test` runs vitest in watch mode while you work.

## Coding style

**[`docs/guidelines/coding-style.md`](docs/guidelines/coding-style.md) is mandatory reading
before you write code.** It is a 15-rule guide, and roughly two thirds of the rules are not
enforced by ESLint — they are checked during review, so skimming it will save you a round trip.

The rules that most often come up in review:

- Extract lambdas of 10+ lines into named top-level functions
- No single-letter or abbreviated variable names, including in `map` / `filter` callbacks
- Bind intermediate values to named variables instead of nesting function calls as arguments
- Never mutate function arguments — return the new value
- Prefer `map` / `filter` / `flatMap` over imperative `for` loops
- Always use braces for `if` / `else` / `for` bodies
- Avoid `!` negation: write `isActive === false`, `obj == null`, `method() === false`
- Parenthesise comparison operands when mixing them with `&&` / `||`
- Define callers above callees, so a file reads top-down in execution order
- Comments explain *why* the code is shaped this way, never what changed in this edit
- Adding a field to a model must not break loading `.erd` files saved before it existed

When the guide and the committed code on `main` disagree, `main` wins — and please update the
guide in the same pull request.

## Tests

Test files live in a `__tests__/` directory next to the source file
(`src/models/ErdDocument.ts` → `src/models/__tests__/ErdDocument.test.ts`).

- Changing a source file means adding or updating the tests that cover the change
- Creating a source file means creating its test file
- The domain layer (`src/models/`, `src/agent-tools/`) is expected to stay well covered;
  this is where schema correctness and DDL round-tripping are guaranteed

## Adding a new agent tool

Agent tools are the API that AI agents use to edit diagrams. The MCP server
(`src/extension/McpServerManager.ts`) and the standalone CLI (`src/cli/main.ts`) both read
from one catalog, so a tool added correctly is immediately available to both — never register
a tool with a single host.

1. Add the tool to the module in `src/agent-tools/tools/` that owns its resource
   (`tables.ts`, `columns.ts`, `relations.ts`, `perspectives.ts`, …). Create a new module only
   for a genuinely new resource
2. If you created a module, register it in `initToolRegistrations` in
   `src/agent-tools/tools/index.ts` — this catalog is the single source of truth for both hosts
3. Define arguments with a `zod` schema, and describe every field. The description is what the
   agent reads to decide how to call the tool
4. Go through `ErdDocument` for every mutation. It enforces referential integrity through a
   single update path; bypassing it leaves dangling references
5. Add tests under `src/agent-tools/tools/__tests__/`
6. Keep responses small — agents pay for every token they read back. See
   `src/agent-tools/DocumentBudget.ts`

Verify the CLI end to end:

```sh
npm run bundle:cli
node out/cli/erd-cli.cjs list-tools
node out/cli/erd-cli.cjs describe <tool-name>
node out/cli/erd-cli.cjs run <tool-name> --file samples/sample-ec_mysql.erd --args '{...}'
```

## Pull requests

- Branch off `main` and keep the pull request focused on one change
- Write the description so a reviewer understands the problem before the diff
- Include a screenshot or a short clip for anything that changes the UI
- Update [`CHANGELOG.md`](CHANGELOG.md) under `[Unreleased]` for user-visible changes. The
  release workflow turns that section into the GitHub Release notes, so write it for users
  rather than as a commit log
- Green CI is required: type check, lint, and tests
- Maintainers may make further edits to your branch before merging, and may merge into a branch
  other than `main` or hold the merge to coordinate release timing

## Reporting security issues

Please do not open a public issue for a security vulnerability. See
[SECURITY.md](SECURITY.md).

## Code of Conduct

This project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating you
are expected to uphold it.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
