# Agent Plugin Manifest

Rules for `agent-plugin/`. The plugin ships to two ecosystems with incompatible manifest locations.

## 1. `agent-plugin/plugin.json` is generated — never edit it

`agent-plugin/.claude-plugin/plugin.json` is the single source of truth. The root copy is written by
the `Commit back agent CLI` step in `.github/workflows/deploy.yml` and committed back by CI.
Both files are tracked because consumers clone the repository and read them from the tree;
neither can be a build-only artifact.

| Path | Read by | Edited by |
|---|---|---|
| `agent-plugin/.claude-plugin/plugin.json` | Claude Code (`claude plugin install`) | humans |
| `agent-plugin/plugin.json` | Agent Plugins 1.0 clients — GitHub Copilot CLI, `github/awesome-copilot` | CI only |

```
# NG — the next release overwrites it
edit agent-plugin/plugin.json

# OK — edit the source, let CI propagate
edit agent-plugin/.claude-plugin/plugin.json
```

The two files are byte-identical by construction. If they ever diverge, the root copy is wrong.

## 2. `version` is normalised when the manifest is written, not when it is generated

`APP_VERSION` is `0.YYMMDD.HHMMSS`, so an hour below 10 leaves a leading zero (`0.260910.053435`)
that is not valid semver. `awesome-copilot` rejects it. Strip the zeros while writing `plugin.json`.
Do not change `generate_version` — npm, the git tag and the vsix keep the raw form.

```js
// NG — raw APP_VERSION reaches plugin.json
pluginJson.version = process.env.APP_VERSION;

// OK
const toSemver = (version) => {
    const parts = version.split(".").map((part) => { return String(Number(part)); });
    return parts.join(".");
};
pluginJson.version = toSemver(process.env.APP_VERSION);
```

## 3. `$schema` is pinned to Agent Plugins 1.0.0

It must be exactly `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. The value is a
`const` in the schema, so Claude Code's suggested SchemaStore URL makes the manifest invalid for
Copilot. Claude Code ignores the field at load time, so one value serves both.

## 4. Only ten top-level fields exist

`$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`,
`keywords`, `extensions`. The schema is closed (`additionalProperties: false`), and `author` accepts
only `name` / `email` / `url`. Claude Code-specific fields (`displayName`, `commands`, `skills`,
`mcpServers`, `strict`, …) must not be added — client-specific data goes under a reverse-domain
key in `extensions`.

Components are discovered from fixed locations and cannot be declared in the manifest:
skills from `agent-plugin/skills/`, MCP servers from `agent-plugin/mcp.json`.

## 5. `keywords`: ten or fewer, `^[a-z0-9-]+$`

`awesome-copilot` caps the list at 10 and rejects anything but lowercase letters, digits and hyphens.
This is stricter than the spec, which sets no limit. Adding an eleventh keyword breaks the
submission, so drop one first.

Note this is the opposite of `package.json`, whose VS Code Marketplace `keywords` allow up to 30
entries and may contain spaces.

## 6. Validate both manifests after editing

```
claude plugin validate agent-plugin   # Claude Code side
claude plugin validate .              # marketplace entry
```

`claude plugin validate` only checks Claude Code's own schema — it passes on a manifest that Agent
Plugins 1.0 rejects. For the Copilot side, check the rules above by hand against
`agent-plugin/plugin.json`, or run `npm run plugin:validate` inside a checkout of
`github/awesome-copilot`.
