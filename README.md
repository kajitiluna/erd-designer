<img src="src/logo.svg" alt="logo" width="200" style="display: block; margin: 20 auto;">

# Entity Relationship Diagram Designer

**ERD Designer** is a free, open-source tool for visually designing database schemas.
Design your tables and relationships in the browser, VSCode, or Google Drive
 — with AI integration via an agent plugin (CLI + skill) or MCP (Model Context Protocol).

Inspired by [ERMaster](https://ermaster.sourceforge.net/index.html), built for the modern development workflow.

### ▶ [Try it now — kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)

No installation, no account. Your diagrams stay in your browser.

## Why ERD Designer?

- **Design on a canvas, not in a config file** — drag-and-drop tables, click-to-connect relationships,
  and instant DDL — no YAML or hand-written SQL to start.
- **Your coding agent can edit it too** — the diagram is not a dead-end artifact. 
  Claude Code and other agents create tables, add columns, wire up relations, and generate DDL through
  the same tool catalog the app itself uses.
- **Output your team actually needs** — DDL for 7 databases, plus Excel / Google Spreadsheet
  specification documents and PNG / SVG / interactive HTML diagrams.
- **Reviewable in Git** — `.erd` is plain JSON, so schema changes show up as a readable diff
  in pull requests instead of an opaque binary blob.
- **Define a column once, reuse it everywhere** — Column Share Models and Column Groups keep
  `created_at`, tenant keys, and audit columns consistent across every table that uses them.

## Features

### Visual Database Design
- **Drag-and-drop table design** — Create and arrange tables, define columns, and set constraints on an interactive canvas
- **Relationship management** — Define 1:1 and 1:N relationships visually with automatic foreign key synchronization
- **Perspectives** — Organize large schemas into multiple views (e.g., by module or feature) for better manageability
- **Memo notes** — Add foreground/background memo notes to annotate your design

### AI Agent Integration
- **Agent plugin (CLI + skill)** — A plugin with a bundled CLI lets coding agents edit `.erd` files directly,
  without a running app or MCP server. Works with [Claude Code](https://claude.com/claude-code)
  and [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-plugins).
  Token-efficient: nothing is loaded into the agent context until the skill is used
- **MCP Server** — The VSCode extension includes a built-in
  [Model Context Protocol](https://modelcontextprotocol.io/) server, enabling AI assistants like Claude
  to read and modify your ER diagrams programmatically
- **One tool catalog, both surfaces** — the MCP server and the CLI expose the same set of agent tools
  (add tables and columns, create relations, manage indexes and constraints, arrange the canvas, export DDL),
  so behavior never diverges between them

> The agent plugin and the MCP server are still marked experimental — their tool surface may
> change between releases. The visual editing features are stable.

### Column Reuse & Sharing
- **Column Share Model** — Define a column once, reuse it across multiple tables. Type changes propagate automatically
- **Column Groups** — Bundle commonly used columns (e.g., `created_at`, `updated_at`) and apply them to tables in bulk

### Import & Export
- **DDL export** — Generate CREATE TABLE scripts for PostgreSQL, MySQL, MariaDB, MS SQL Server, SQLite, BigQuery, and Snowflake
- **DDL import** — Import existing DDL scripts to auto-generate ER diagrams
- **Specification documents** — Export table definitions as Excel files or Google Spreadsheets
- **Image export** — Export as PNG, SVG, or interactive HTML with pan/zoom and perspective switching

### Schema Verification (CLI)
- **`erd-diff`** — Compare two `.erd` revisions and get a reviewable, schema-level summary of what
  changed (added/removed tables and columns, type changes, index and foreign-key changes). No
  database connection needed; works with every dialect ERD Designer supports
- **`db-diff`** — Check that the design still matches a live PostgreSQL, MySQL, or MariaDB
  database. Read-only (`SELECT` only), CI-friendly exit codes (`0`/`1`/`2`)
- **`migrate-ddl`** — Generate `ALTER` statements that bring a database, or another `.erd` revision,
  in line with the design. Nothing is applied automatically — the output is a draft to review before running it

See [Schema Verification](#schema-verification) below for setup and CI examples

### Multi-Platform
| | Browser | VSCode | Google Drive |
|---|:---:|:---:|:---:|
| **Access** | [Open online tool](https://kajitiluna.github.io/erd-designer) | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kajitiluna.erd-designer) | [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491) |
| **Storage** | Local (IndexedDB) | Local file system (.erd) | Google Drive |
| **Spec export** | Excel | Excel | Google Spreadsheet |
| **Team sharing** | — | Git version control | Via Drive |
| **Agent plugin (CLI)** | — | Supported | Supported (with auto-sync) [see note](#ai-agent-integration-agent-plugin) |
| **MCP / AI** | — | Supported | — |

## Screenshots

| ![Canvas](images/01_canvas.png) |
|:--:|
| Main canvas view with tables and relationships |

| ![Edit Column](images/02_edit-column.png) | ![Add relation](images/03_add-relation.gif) |
|:--:|:--:|
| Editing table columns using shared models | Creating relationships between tables |

| ![Select color](images/04_color.png) | ![Perspective](images/05_canvas-perspective.gif) |
|:--:|:--:|
| Customizing table and memo colors | Organizing tables by perspectives |


## Supported Databases

- **PostgreSQL** — Schema support, array types, GIN/GiST/BRIN indexes
- **MySQL** — CHARACTER SET / COLLATE, FULLTEXT / SPATIAL indexes, Auto Increment
- **MariaDB** — MySQL-compatible DDL, UUID / INET4 / INET6 types, Auto Increment
- **MS SQL Server** — Schema support, clustered indexes, Identity columns
- **SQLite** — Type affinity based column types, rowid-based auto numbering (table-level PRIMARY KEY), comments as `--` lines, foreign keys emitted as guidance comments
- **BigQuery** — Dataset (schema) support, `ARRAY<T>` / `STRUCT` types, `NOT ENFORCED` primary / foreign keys, `OPTIONS(description=...)` comments
- **Snowflake** — Schema support, inline `COMMENT` syntax, AUTOINCREMENT, semi-structured types (VARIANT / OBJECT / ARRAY)

PostgreSQL/MySQL-compatible databases such as Amazon Aurora, CockroachDB, and TiDB can generally be modeled using the corresponding dialect.

## Getting Started

### Online Tool

Try ERD Designer instantly at **[kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)**
— no installation or account required. Your data is stored locally in your browser (IndexedDB).

### Google Drive App

Install from the [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491)
to save and edit ERD files on Google Drive.
Shared files can be viewed simultaneously, though simultaneous editing is not supported (optimistic concurrency control).

### VSCode Extension

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kajitiluna.erd-designer)
to design ER diagrams within VSCode. Save as `.erd` files and manage them with Git.

> [!NOTE]
> The MCP Server feature is currently experimental and under active development.
> Functionality and behavior may change in future releases.

### AI Agent Integration (agent plugin)

Let a coding agent design tables incrementally by editing `.erd` files directly — no MCP server or running app required.

With [Claude Code](https://claude.com/claude-code):

```sh
claude plugin marketplace add kajitiluna/erd-designer
claude plugin install erd-designer@erd-designer
```

Auto-update is off by default for third-party marketplaces. To be notified when a new version ships,
run `/plugin` in Claude Code, open the `erd-designer` marketplace, and select **Enable auto-update**.
Claude Code then updates the plugin on startup and shows `Plugins updated: erd-designer`.

With [GitHub Copilot CLI](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference):

```sh
copilot plugin marketplace add kajitiluna/erd-designer
copilot plugin install erd-designer@erd-designer
```

The plugin ships a skill and a self-contained CLI (`agent-plugin/skills/erd-designer/scripts/erd-agent.cjs`, requires Node.js 22+),
so the agent consumes almost no context until the skill is actually used.
The skill folder follows the open Agent Skills format, so other skill-compatible agents may also use it.
Files stored on Google Drive can be edited through the local path synced by
[Google Drive for Desktop](https://www.google.com/drive/download/),
with the limitation described below.

> [!TIP]
> **(Google Drive app):**
> Enable "Sync Google Drive" in the gear menu to auto-detect external changes (e.g. CLI edits)
> and pull them into the canvas within about 10 seconds, as an undoable edit.
> This is off by default — while off, close the tab before editing via CLI, then reopen it afterward to see the result.

> [!NOTE]
> The agent plugin is experimental, like the MCP Server.

## Manual

Please refer to the [Wiki](https://github.com/kajitiluna/erd-designer/wiki) for detailed documentation.

## Sample file

You can use the sample ERD file as a reference for your designs:
- [sample-ec_mysql.erd](https://github.com/kajitiluna/erd-designer/raw/main/samples/sample-ec_mysql.erd)
(Right-click and select "Save link as...")

**How to use:**
- **Online Tool**: Download the file and import it into ERD Designer
- **Google Drive App / VSCode Extension**: Open the downloaded file directly

## Schema Verification

Beyond the visual editor, ERD Designer ships a standalone CLI that answers a question the editor
can't: **does the design still match reality?** `erd-diff` reviews schema changes in a PR without
reading raw JSON diffs; `db-diff` catches drift between the `.erd` file and a live database that
crept in through manual `ALTER`s or a separate migration tool; `migrate-ddl` drafts the SQL to fix
that drift. None of the three ever writes to a database — `db-diff` only issues `SELECT`, and
`migrate-ddl` only prints or writes a `.sql` file for you to review.

### Getting the CLI

| Distribution | Command | Notes |
|---|---|---|
| npm (recommended for CI) | `npx @kajitiluna/erd-cli erd-diff --file docs/schema.erd --from /tmp/base.erd` | `pg` / `mysql2` install automatically as needed for `db-diff` |
| GitHub Release | `curl -sSL -o erd-cli.cjs https://github.com/kajitiluna/erd-designer/releases/latest/download/erd-cli.cjs && node erd-cli.cjs erd-diff ...` | Single file, no `npm install` |
| Agent plugin (already installed above) | `node <SKILL.md dir>/scripts/erd-agent.cjs erd-diff ...` | Same commands, bundled alongside the agent tools |

`db-diff` needs a database driver that isn't bundled — the npm package declares `pg` and `mysql2`
as optional dependencies and installs them automatically, but the other two distributions require
installing the driver yourself in the working directory (`npm install pg` or `npm install mysql2`).

### `erd-diff` — review schema changes in a PR

```sh
git show origin/main:docs/schema.erd > /tmp/base.erd
npx @kajitiluna/erd-cli erd-diff --file docs/schema.erd --from /tmp/base.erd --format markdown
```

No database connection is required, so this works in any CI environment.

### `db-diff` — catch drift from the live database

```sh
export ERD_DB_URL='postgres://readonly@db.internal:5432/shop'   # prefer this over --dsn
npx @kajitiluna/erd-cli db-diff --file docs/schema.erd --ignore-table '^flyway_schema_history$'
```

Pass the connection string via `ERD_DB_URL` rather than `--dsn` — command-line arguments end up in
shell history, `ps` output, and CI logs. A read-only database user is recommended.

If the database predates this workflow, its tables likely have no comments set yet — the first run
will otherwise be all noise. Add `--no-comment` until comments are backfilled (or permanently, if
comments simply aren't part of your team's convention).

### `migrate-ddl` — draft the fix

```sh
npx @kajitiluna/erd-cli migrate-ddl --file docs/schema.erd --out /tmp/migrate.sql
# review /tmp/migrate.sql, then apply it yourself
```

### CI example

```yaml
name: ERD schema check

on:
  pull_request:
    paths:
      - 'docs/schema.erd'
  schedule:
    # Drift from production happens independently of PRs, so also run on a schedule.
    - cron: '0 0 * * *'

permissions:
  contents: read

jobs:
  erd-diff:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Diff against base branch
        run: |
          git show origin/${{ github.base_ref }}:docs/schema.erd > /tmp/base.erd
          npx @kajitiluna/erd-cli erd-diff \
            --file docs/schema.erd --from /tmp/base.erd --format markdown > /tmp/erd-diff.md
      - name: Comment on PR
        uses: actions/github-script@v8
        with:
          script: |
            const fs = require('node:fs');
            const body = fs.readFileSync('/tmp/erd-diff.md', 'utf-8');
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number, body: body
            });

  db-diff:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Check schema drift
        env:
          ERD_DB_URL: ${{ secrets.ERD_DB_URL }}
        run: |
          npx @kajitiluna/erd-cli db-diff \
            --file docs/schema.erd --ignore-table '^flyway_schema_history$'
```

The `db-diff` job is scheduled independently of PRs because drift from a manual `ALTER` has nothing
to do with pull requests — only a recurring check catches it.

Supported dialects: `db-diff` and `migrate-ddl` work with PostgreSQL, MySQL, and MariaDB; `erd-diff`
works with every dialect ERD Designer supports, since it never connects to a database.

## Installation and Usage

### Local Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/kajitiluna/erd-designer.git
   ```

1. Install dependencies:

   ```sh
   npm ci
   ```

1. Start the development server:

   ```sh
   npm run dev
   ```

### Usage

After starting the development server, open your browser and navigate to http://localhost:5173/erd-designer to use the application.

## Development

- Node.js Requirement: Ensure you have Node.js (version 26 or higher) installed.
- Build the Project:
  ```sh
  npm run build
  ```
- Run Tests:
  ```sh
  npm run testrun
  ```

## Contributing

Contributions are welcome! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to set up the
project, what the review expects, and how to add a new agent tool.

- **Bug reports and feature requests** — open an [Issue](https://github.com/kajitiluna/erd-designer/issues)
- **Questions and ideas** — start a [Discussion](https://github.com/kajitiluna/erd-designer/discussions)
- **Pull requests** — please open an issue first to discuss significant changes

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
To report a security issue, see [SECURITY.md](SECURITY.md).

## License

ERD Designer is distributed under the Apache License 2.0.
