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
