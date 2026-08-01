# Security Policy

## Supported versions

ERD Designer is released continuously from `main`. Only the most recent release receives
security fixes — the browser app at
[kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer), the current
VS Code Marketplace build, the current Google Workspace Marketplace build, and the CLI
attached to the latest [GitHub Release](https://github.com/kajitiluna/erd-designer/releases).

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, pull requests, or
discussions.**

Report privately through GitHub's
[Report a vulnerability](https://github.com/kajitiluna/erd-designer/security/advisories/new)
form, which opens a draft security advisory visible only to the maintainers.

Please include:

- Which surface is affected — browser app, VSCode extension, Google Drive app, MCP server, or CLI
- Version or commit, and your OS / browser / VSCode version
- Steps to reproduce, and what an attacker gains
- Any proof-of-concept you have

You can expect an acknowledgement within a week. We will keep you updated as we work on a fix
and will credit you in the release notes unless you would rather stay anonymous.

## Scope notes

A few properties of the project are worth knowing before you report:

- **Diagrams are stored client-side.** The browser app keeps documents in IndexedDB and the
  VSCode extension writes local `.erd` files. There is no ERD Designer backend holding user data.
- **The MCP server is off by default** and binds to localhost. It is enabled per-user via the
  `erdDesigner.mcpServer.enabled` setting and listens on `erdDesigner.mcpServer.port`
  (default 53753). Reports about its exposure to other local processes are in scope.
- **`.erd` files and imported DDL are untrusted input.** Parsing that leads to code execution,
  or an exported artifact (DDL, Excel, HTML) that carries an injection payload, is in scope.
- **The Google Drive app** uses Google OAuth and Drive scopes. Issues in how tokens or file
  access are handled are in scope.

Out of scope: findings that require a user to install a modified build, vulnerabilities in
dependencies that we do not reach (report those upstream), and missing hardening headers on
GitHub Pages, which we do not control.
