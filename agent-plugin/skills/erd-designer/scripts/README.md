# Agent CLI (generated files — do not edit)

`erd-agent.cjs` in this directory is **generated and committed automatically** by the
deploy workflow (`.github/workflows/deploy.yml`). It is built from `src/cli/erd-agent.ts`
on every release and the plugin version in `agent-plugin/.claude-plugin/plugin.json`
is bumped in the same commit.

Rules:

- Do NOT add, edit, or commit files in this directory manually.
  A manually committed `erd-agent.cjs` would bypass the automatic plugin version bump.
- For local development and testing, run `npm run bundle:agent-cli`, which outputs to
  `out/cli/erd-agent.cjs` (git-ignored) and never touches this directory.
