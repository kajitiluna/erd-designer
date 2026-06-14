# Coding Style

Mandatory rules. Violations must be fully revised on request.
The committed code on `main` is the authoritative example.

## 1. No inline lambdas in literals or arguments

Extract any `async (...) => { ... }` or lambda into a named function
(`initCallbackForXxx`, `buildXxx`, etc.) and reference it.

```ts
// NG
return ["name", config, async (args) => { /* ... */ }];

// OK
return ["name", config, initCallbackForXxx(deps)] as const;

const initCallbackForXxx = (deps: Deps): ToolCallback<typeof schema> => {
    return async (args) => { /* ... */ };
};
```

## 2. No single-letter or abbreviated variable names

No `t`, `v`, `p`, `g`, `m`, `ct`, `el`, `tmp`. Use meaningful names
(`tool`, `tableView`, `perspective`, `columnType`). Applies to
`map` / `filter` / `find` / `reduce` callbacks and tests too.

```ts
// NG
tools.find(t => t[0] === name);

// OK
tools.find(tool => tool[0] === name);
```

## 3. No nested function calls as arguments

Bind the intermediate value to a named variable, then pass it.

```ts
// NG
return initToolJsonResponse(items.map(item => toSummary(ctx, item)));
throw initResourceNotFound(new URL(uriTemplates.documentFor(id)));

// OK
const responses = items.map(item => toSummary(ctx, item));
return initToolJsonResponse(responses);

const url = new URL(uriTemplates.documentFor(id));
throw initResourceNotFound(url);
```
