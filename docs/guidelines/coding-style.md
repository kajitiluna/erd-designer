# Coding Style

Mandatory rules. Violations must be fully revised on request.
The committed code on `main` is the authoritative example.

## 1. No inline lambdas in literals or arguments

Extract long lambdas (10+ lines) into named functions (`initCallbackForXxx`, `buildXxx`, etc.). Short lambdas (1–5 lines) are acceptable inline.

```ts
// NG
return ["name", config, async (args) => { /* 10+ lines */ }];

// OK
return ["name", config, initCallbackForXxx(deps)] as const;
const initCallbackForXxx = (deps: Deps): ToolCallback<typeof schema> => {
    return async (args) => { /* ... */ };
};
```

Exception: skip extraction if the only possible target is a nested function within the same parent (the lambda captures mutable local state). That doesn't improve readability. Extract only when the result can be a file-top-level function.

## 2. No single-letter or abbreviated variable names

No `t`, `v`, `p`, `g`, `m`, `ct`, `el`, `tmp`. Use meaningful names. Applies to `map`/`filter`/`find`/`reduce` callbacks too.

```ts
// NG
tools.find(t => t[0] === name);
// OK
tools.find(tool => tool[0] === name);
```

## 3. No nested function calls as arguments

Bind intermediate values to named variables before passing.

```ts
// NG
return initToolJsonResponse(items.map(item => toSummary(ctx, item)));
// OK
const responses = items.map(item => toSummary(ctx, item));
return initToolJsonResponse(responses);
```

Exceptions:
- Continuous conversion pipelines with no meaningful intermediate name (e.g. `ErdDocument.toObject(JSON.parse(content))`).
- `Array.from(iterable)` wrappers required by TypeScript syntax (e.g. `Array.from(map.values()).map(...)`). Split only if the argument itself is long.

## 4. No mutation of function arguments

Return the result instead of mutating arrays or objects passed in.

```ts
// NG
const collectItems = (source: Source[], results: Item[]) => { results.push(toItem(source[0])); };
// OK
const collectItems = (source: Source[]): Item[] => { return source.map(src => toItem(src)); };
```

## 5. Prefer functional array operations over imperative loops

Use `map`/`filter`/`flatMap` instead of `for` loops. Exception: complex stateful accumulation where the functional form hurts readability.

```ts
// NG
const results: Item[] = [];
for (const src of source) { if (isValid(src)) { results.push(toItem(src)); } }
// OK
const results = source.filter(src => isValid(src)).map(src => toItem(src));
```

## 6. Always use braces for control statements

Never omit braces for `if`/`else`/`for` bodies.

```ts
// NG
if (value == null) return [];
// OK
if (value == null) { return []; }
```

## 7. Explicit return for object literals in arrow functions

Use a block body with explicit `return` instead of `=> ({ ... })`. Non-object implicit returns are fine.

```ts
// NG
items.map(item => ({ id: item.id, name: item.name }));
// OK
items.map(item => { return { id: item.id, name: item.name }; });
// OK (non-object)
items.map(item => item.name);
```

## 8. Parenthesise comparison operands when mixing operators

When `&&`/`||` and comparison operators (`===`, `!==`, `>`, `>=`, `<`, `<=`, `==`, `!=`) appear together, wrap each **comparison** operand in parentheses. Operands that contain no infix operator (method calls, identifiers, property accesses) are already unambiguous and do **not** need parentheses.

```ts
// NG — comparison without parens
if (match.matchType === "relationLabel" && toolbarCanvasElement != null) {

// OK — each comparison-containing operand is wrapped
if ((match.matchType === "relationLabel") && (toolbarCanvasElement != null)) {

// OK — method call needs no extra parens (self-contained, no infix operator inside)
(currentPerspective == null) || currentPerspective.containsModel(id)

// OK — plain identifiers with only &&/|| need no parens
if (isActive && isValid) {
```

ESLint: `no-mixed-operators` with comparison and logical operators in one group.

## 9. Avoid negation with `!` — use explicit comparison

| Situation | NG | OK |
|---|---|---|
| Boolean flag | `!isActive` | `isActive === false` |
| Method return | `!method()` | `method() === false` |
| Null check | `!obj` | `obj == null` |

```ts
// NG
if (!isOpen || !resizingDirection.isResizing()) {
// OK
if ((isOpen === false) || (resizingDirection.isResizing() === false)) {
```

Exceptions:
- When `!` is the only practical option.
- JSX attributes such as `disabled={!isValid}` — expanded comparisons widen the JSX and hurt readability.

Not enforced by ESLint — manual review rule.

## 10. A directory's `index` re-exports only — no implementation

When a module's public surface is a directory rather than a single file, `index.ts`/`index.tsx` contains
nothing but re-export statements. All implementation — including private helpers tightly coupled to the
module (`initXxx`, `doXxx`) — lives in sibling files inside the directory, which are forbidden to be
imported from outside except through the index.

```
src/models/schema/schema-migration-ddl/
├── index.ts             // the entire file is re-exports; no implementation
├── migration-ddl.ts      // implementation
└── *.ts                 // other internal modules — import only within this directory
```

```ts
// index.ts — this is the whole file, nothing else
export type { DestructivePolicy } from "~/models/schema/schema-migration-ddl/migration-statement";
export type { MigrationDdl } from "~/models/schema/schema-migration-ddl/migration-ddl";
export { migrationDdlBuilder } from "~/models/schema/schema-migration-ddl/migration-ddl";
```

ESLint: `no-restricted-imports` with a `patterns` entry for the directory (e.g. `["**/schema-migration-ddl/*"]`), ignoring the directory itself.

## 11. No reverse-direction imports between parent and nested models

A nested/child model must never import its parent model. If both need a shared type or helper function, extract it into a dedicated neutral module with zero model imports (e.g. `ColumnEntry.ts`), not into the parent model's file.

```ts
// NG — ColumnStructModel (nested) imports its parent TableModel
import { ColumnEntry } from "~/models/database/TableModel";

// OK — both import the shared type from a neutral module
import { ColumnEntry } from "~/models/database/ColumnEntry";
```

Not enforced by ESLint — manual review rule.

## 12. Comments record design intent, not work notes

A comment must explain *why* the code is shaped this way — rationale that stays true whenever the code is next read. Never leave the notes you made while editing.

- **No point-in-time references**: `main`, "previously", "the existing file", "so far" name the state at writing time and become noise once that state moves. Describe the invariant, not its diff against a past version.
- **No change log**: "added X", "changed to Y", "now supports Z" belong in commit messages, not comments.
- **No how-only**: a comment that only restates what the line does is noise; delete it or replace it with the reason.

```ts
// NG — leans on a moving baseline / pure edit memo
// simple keeps the previous format (entityType key omitted = compatible with existing file)

// OK — states the invariant and why, readable at any future point
// entityType is the struct discriminator; a simple column omits it by definition.
```

Not enforced by ESLint — manual review rule.

## 13. Consistency maintenance must not leak into callers

A method that repairs or re-synchronises internal data (cleanup / prune of dangling references, deletion of unreferenced models) must be `private`, invoked from inside the domain operation or from the single common update path (e.g. `ErdDocument.doUpdate`) — never left for each caller to remember. When a class cannot judge consistency alone, pass it the facts it lacks (e.g. "ids still referenced"), not decisions computed by the caller (e.g. "ids to delete").

```ts
// NG — caller computes the deletion and must remember the follow-up repair
storage.deleteColumnShare(orphanedIds).cleanupDanglingStructReferences(columnIds);

// OK — common update path passes facts; the storage decides internally
storage.retain(referencedShareIds, existingColumnIds, existingGroupIds);
```

Not enforced by ESLint — manual review rule.

## 14. Define in call order — callers above callees

A definition must come after the first definition that references it. Entry points (exported / public API) go at the top, internal helpers below, so the file reads top-down in execution order.

Class methods obey the same rule. Never group all public methods first and all private ones after: put a private method directly below the public method that calls it.

```ts
// NG — helper above its caller
const buildHeader = (table: TableModel): string => { /* ... */ };
export const createDdl = (document: ErdDocument): string => { return buildHeader(table); };

// OK
export const createDdl = (document: ErdDocument): string => { return buildHeader(table); };
const buildHeader = (table: TableModel): string => { /* ... */ };
```

```ts
// NG — public block, then private block
class DdlCreator {
    public create() { return this.tableQuery(); }
    public createIndex() { /* ... */ }
    private tableQuery() { /* ... */ }
}

// OK — the private method sits under the caller that needs it
class DdlCreator {
    public create() { return this.tableQuery(); }
    private tableQuery() { /* ... */ }
    public createIndex() { /* ... */ }
}
```

Exception: only when the order is impossible — a value evaluated at module load (`const CONFIG = buildConfig();`) or anything else that would break compilation (TDZ).

Not enforced by ESLint — manual review rule.

## 15. Public method names state what the caller wants, not how the class decides

A public name that encodes the internal strategy (`deleteUnreferencedXxx`, `cleanupDanglingXxx`, `pruneOrphanedXxx`) forces callers to work out which method matches their situation — that is internal detail leaking through the API. Name the caller's intent; keep strategy words for private members.

```ts
// NG — the name publishes the deletion strategy
storage.deleteUnreferencedModels(referencedShareIds, existingColumnIds, existingGroupIds);

// OK — explicit target, or "keep what still matches"
storage.deleteStructShare(structShareModelIds);
storage.retain(referencedColumnShareIds, existingColumnModelIds, existingColumnGroupIds);
```

Not enforced by ESLint — manual review rule.

## 16. One state is one string union — never two or more booleans

Never encode a single state as multiple booleans. N booleans make 2^N combinations representable while only a few are legal, and no reader can tell which. Name every state in a string union, and assign the whole value on each transition — partial field updates are what let meaningless intermediate combinations appear.

```ts
// NG — 4 combinations representable, 3 legal, and the only read collapses both flags anyway
type RemoteSyncState = { suspended: boolean, inFlight: boolean };
if ((state.suspended === true) || (state.inFlight === true)) { return; }

// OK — illegal combinations are unrepresentable
type RemoteSyncState = "idle" | "syncing" | "unauthorized";
if (state !== "idle") { return; }
```

Applies equally to sibling `useState`/`useRef` flags describing one subject (`isLoading` + `isError`, `availableGrabbing` + `isGrabbing`).

Exception: independent attributes that merely share an object (`primaryKey`, `notNull`, `unique` on a column). These are not phases of one subject — every combination is legal.

Not enforced by ESLint — manual review rule.

## 17. Model fields must stay backward compatible

`.erd` files are a JSON serialization of `src/models/` with no schema version. A model's `toObject` must treat a missing field as "not yet saved," not as an error — files saved before the field existed must keep loading.

```ts
// NG — requireProperty throws PropertyNotExistsError on files saved before this field existed
requireProperty(obj, "notNull");
const notNull = obj.notNull as boolean;

// OK — absent field falls back to a default
const notNull = obj.notNull != null ? obj.notNull as boolean : false;
```

Never remove or repurpose a field that has shipped — older files still contain it.

Not enforced by ESLint — manual review rule.

## 18. `src/extension/` is import-only for the VSCode extension

Code outside the VSCode extension package (React components, shared logic, etc.) must never import from `src/extension/`. A constant or utility shared by the whole app belongs in a common module (e.g. `src/components/constant.ts`), not inside the extension package.

```ts
// NG — a React component reaching into the extension package
import { SOME_CONSTANT } from "~/extension/vscode-message";

// OK — shared constant lives in a common module
import { SOME_CONSTANT } from "~/components/constant";
```

Not enforced by ESLint — manual review rule.

## 19. Publish capability through a named contract, not bare function exports

Do not `export` functions directly with no declared contract — a file that keeps exporting functions this way
accumulates an unreadable, unbounded export list. Declare the module's public surface as a named contract
instead. Two shapes are both correct; choose by design, not mechanically:

- **`type` + one exported `const` object** implementing it (a name-only `type` for multiple operations, a named
  function-type alias for a single one).
- **A class whose `public`/`public static` members are the contract** — including a stateless class with a
  `private constructor()`, when grouping related static operations under one name reads better than an object
  literal.

```ts
// NG — functions exported directly; no declared contract, and the export list grows unchecked
export const formatColumnAttributes = (column: ColumnSnapshot, unsignedSuffix: string): string => { ... };
export const formatDefaultLiteral = (defaultValue: string): string => { ... };

// OK — type + const object
type DialectSql = {
    columnAttributes: (column: ColumnSnapshot, unsignedSuffix: string) => string;
    defaultLiteral: (defaultValue: string) => string;
};
const formatColumnAttributes = (column: ColumnSnapshot, unsignedSuffix: string): string => { ... };
const formatDefaultLiteral = (defaultValue: string): string => { ... };
export const dialectSql: DialectSql = {
    columnAttributes: formatColumnAttributes, defaultLiteral: formatDefaultLiteral
} as const;

// OK — a single operation still gets a named type, not a bare export
export type MigrationDdlBuilder = { build: (args: BuildMigrationDdlArgs) => MigrationDdl };
const buildMigrationDdl = (args: BuildMigrationDdlArgs): MigrationDdl => { ... };
export const migrationDdlBuilder: MigrationDdlBuilder = { build: buildMigrationDdl } as const;

// OK — a stateless class as the contract; public static members are the public surface
export default class TableDifference {
    private constructor() { /* do nothing */ }
    public static toStatements(expected: TableSnapshot, actual: TableSnapshot): TableStatements { ... }
}

// OK — instance state (regexes) makes a class the right shape regardless of this rule
export class TableFilter {
    private readonly regexes: readonly RegExp[];
    private constructor(regexes: readonly RegExp[]) { this.regexes = regexes; }
    public static parse(patterns: readonly string[]): TableFilterResult { ... }
    public filterTables(snapshot: SchemaSnapshot): SchemaSnapshot { ... }
}
```

Do not `export` a type or constant that no other directory imports, either — arguments/return types used only
internally (e.g. `BuildMigrationDdlArgs`) stay unexported; callers pass an object literal and let the return
value be inferred. Helpers shared only inside one directory live in that directory's `support.ts` (or a
`support/` directory), not re-exported through the public contract.

Exception: a module that exports only types is exempt — types cannot be wrapped in a value export. Keep such
a module's imports to the minimum the type definitions themselves require, so it stays a neutral dependency
(e.g. `schema-snapshot.ts`, `schema-difference.ts`).

Not enforced by ESLint — manual review rule.
