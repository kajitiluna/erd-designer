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

## 10. Component-private modules stay inside the component directory

Functions tightly coupled to a component (`initXxx`, `doXxx`) are private. When splitting them into files, place them under the component's directory (`ComponentName/index.tsx` + internal modules) and forbid deep imports from outside.

```
src/features/canvas/ErdCanvas/
├── index.tsx        // public API: default export + ERD_CANVAS_ID only
└── *.ts(x)          // internal modules — import only within this directory
```

ESLint: `no-restricted-imports` with `patterns: ["**/ErdCanvas/*"]`, ignoring the component directory itself.

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
storage.deleteUnreferencedModels(referencedShareIds, existingColumnIds, existingGroupIds);
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
