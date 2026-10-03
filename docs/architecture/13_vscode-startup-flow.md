# VSCode Extension Startup and Display Flow

## TL;DR

- **Two startup phases.** VSCode activates the extension once per window (`onStartupFinished`). Each `.erd` file
  opened afterwards starts one webview panel.
- **Activation prepares shared state only.** `activate()` registers two custom editors and a configuration
  watcher, and starts the MCP server when `erdDesigner.mcpServer.enabled` is on. No document is read at this stage.
- **The webview asks for content.** The host cannot know when React is ready, so the webview posts `ready`. The
  host then reads the `TextDocument` and replies with `init`. Changes made between opening and `ready` are
  therefore never lost.
- **`ready` is also the registration point.** On `ready` the host registers the panel with
  `VsCodeDocumentResource`. Only after that can MCP tools see the document.
- **After `init`, the React tree talks to the host only through two window CustomEvents.**
  - `CANVAS_RECTANGLES_DRAWN_EVENT` carries table rectangles measured from the DOM, in the direction
    canvas → `drawnRectangles` → host. MCP tools use them to place tables.
  - `EXTERNAL_DOCUMENT_CHANGED_EVENT` carries a document into the undo history, in the direction
    `changeDocument` → `MainView` → `holder.update()`.
- **The first `drawnRectangles` is dropped.** The canvas fires its event in a layout effect, while the listener
  that is still attached captured `documentUri = ""`. The host receives rectangles only from the next redraw on.
- **Closing a panel undoes only that panel.** Watchers are disposed and its handler is unregistered. The document
  leaves `VsCodeDocumentResource` only when its last panel closes.

| Phase | Trigger | Runs in | Main result |
|---|---|---|---|
| Activation | `onStartupFinished` | extension host | editors registered, MCP server started |
| Panel resolve | `.erd` opened | extension host | watchers set, webview HTML injected |
| Webview boot | HTML loaded | webview | `window.vscodeApi` set, `ready` posted |
| Document init | `ready` received | host → webview | panel registered, `init` sent, first screen shown |
| Canvas display | `init` applied / redraw | webview | `CANVAS_RECTANGLES_DRAWN_EVENT` fired |
| Rectangle sync | the event above | webview → host | `drawnRectangles` stored for MCP tools |
| External change | `changeDocument` received | host → webview | `EXTERNAL_DOCUMENT_CHANGED_EVENT` → history |
| Teardown | panel closed / `deactivate` | extension host | watchers disposed, MCP server stopped |

Legend for the diagrams: **blue = shared by all builds**, **orange = VSCode-specific**, stadium shape = CustomEvent.

---

## 1. Overview

```mermaid
flowchart TB
    subgraph VSC["VSCode"]
        START(["onStartupFinished"])
        OPEN(["open *.erd"])
        OPENERM(["open *.erm"])
        CFG(["onDidChangeConfiguration"])
    end

    subgraph HOST["Extension host"]
        ACT["activate()"]
        PROV["ExtensionProvider<br/>resolveCustomTextEditor"]
        ERM["ErmImportProvider"]
        MCPM["McpServerManager"]
        DOCRES["VsCodeDocumentResource<br/>(one per window)"]
    end

    subgraph WEBVIEW["Webview (React)"]
        APP["App.tsx<br/>window.vscodeApi → VSCode build"]
        APPV["VsCodeExtensionApplication"]
        DISP["ExternalDocumentChangeDispatcher"]
        SHELL["ErdApplicationShell"]
        MAIN["MainView<br/>(ErdDocumentsHolder)"]
        CANVAS["ErdCanvas"]
        EVT_EXT(["EXTERNAL_DOCUMENT_CHANGED_EVENT"])
        EVT_RECT(["CANVAS_RECTANGLES_DRAWN_EVENT"])
    end

    START --> ACT
    ACT -->|registerCustomEditorProvider| PROV
    ACT -->|registerCustomEditorProvider| ERM
    ACT -->|"start(enabled, port)"| MCPM
    CFG -->|"changeConfiguration()"| MCPM
    MCPM --> DOCRES

    OPEN --> PROV
    OPENERM --> ERM
    ERM -.->|"convert → vscode.openWith .erd"| PROV
    PROV -->|"webview.html"| APP
    APP --> APPV
    APPV -->|ready| PROV
    PROV -->|register| DOCRES
    PROV -->|init| APPV
    APPV --> SHELL --> MAIN --> CANVAS

    CANVAS -->|"useLayoutEffect"| EVT_RECT
    EVT_RECT -->|useSyncRectangles| APPV
    APPV -->|drawnRectangles| PROV
    PROV -->|updateDrawnRectangles| DOCRES

    PROV -.->|changeDocument| APPV
    APPV -.->|"alreadyPersisted = true"| DISP
    DISP -.-> EVT_EXT
    APPV -.->|"alreadyPersisted = false"| EVT_EXT
    EVT_EXT -.->|"holder.update()"| MAIN

    classDef common fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class APP,SHELL,MAIN,CANVAS,DISP,EVT_EXT common
    class ACT,PROV,ERM,MCPM,DOCRES,APPV,EVT_RECT specific
```

Files: `package.json` (`activationEvents`, `contributes`), `src/extension/extension.ts`, `src/App.tsx`

---

## 2. Activation

**Key points:**
- `VsCodeDocumentResource` and `McpServerManager` are module-level singletons, created when the bundle loads,
  before `activate()` runs. All panels and the MCP server share them.
- The `.erd` editor uses `retainContextWhenHidden: true`, so switching tabs does not restart the webview.
- MCP server start, stop and restart go through one Promise queue (`withLock`), so rapid setting changes apply in
  order.

```mermaid
sequenceDiagram
    autonumber
    participant V as VSCode
    participant E as extension.ts
    participant M as McpServerManager
    participant R as VsCodeDocumentResource

    Note over E,R: module load: new VsCodeDocumentResource(),<br/>new McpServerManager(resource)
    V->>E: activate(context) (onStartupFinished)
    E->>V: registerCustomEditorProvider("erdDesigner.erdEditor")
    E->>V: registerCustomEditorProvider("erdDesigner.ermImporter")
    E->>V: onDidChangeConfiguration(watch "erdDesigner.mcpServer")
    E->>M: start(enabled, port)
    alt enabled
        M->>M: express.listen(port) → info toast
    else disabled
        M->>M: do nothing
    end
    Note over V,E: later: setting changed
    V->>E: onDidChangeConfiguration
    E->>M: changeConfiguration(enabled, port)
    M->>M: stop → restart if still enabled
```

| Setting | Default | Effect |
|---|---|---|
| `erdDesigner.mcpServer.enabled` | `false` | start / stop the MCP server |
| `erdDesigner.mcpServer.port` | `53753` | port of `http://localhost:<port>/mcp` |

Files: `src/extension/extension.ts`, `src/extension/McpServerManager.ts`

---

## 3. Opening a `.erd` file

### 3.1 Panel resolve (extension host)

`resolveCustomTextEditor` only wires the panel. It does not read the document.

```mermaid
flowchart TB
    RESOLVE["resolveCustomTextEditor(textDocument, panel)"]
    OPT["webview.options<br/>enableScripts, localResourceRoots = dist/"]
    W1["onDidChangeTextDocument<br/>(same window)"]
    W2["FileSystemWatcher<br/>(other windows / processes)"]
    HTML["initWebViewHtml()<br/>dist/index.html + CSP nonce<br/>+ acquireVsCodeApi()"]
    MSG["webview.onDidReceiveMessage"]
    DISPOSE["panel.onDidDispose"]

    RESOLVE --> OPT --> W1 --> W2 --> HTML --> MSG --> DISPOSE

    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class RESOLVE,OPT,W1,W2,HTML,MSG,DISPOSE specific
```

- `initWebViewHtml()` removes the original `<script>`/`<link>` tags, re-adds them as `asWebviewUri` URLs, and
  injects `window.vscodeApi = acquireVsCodeApi()`. That global is what makes `App.tsx` pick the VSCode build.
- `onDidReceiveMessage` is registered after `html` is set. Messages cannot arrive before the script runs, so this
  order is safe.

### 3.2 Handshake (`ready` → `init`)

```mermaid
sequenceDiagram
    autonumber
    participant A as App.tsx
    participant W as VsCodeExtensionApplication
    participant P as ExtensionProvider
    participant TD as TextDocument
    participant R as VsCodeDocumentResource

    A->>W: window.vscodeApi exists → render
    W->>W: documentUri === "" → show spinner
    W->>P: postMessage ready
    W->>W: useEffect: addEventListener("message")
    P->>TD: getText() (latest content at this moment)
    P->>R: register(textDocument, content, handleChangeView)
    R-->>P: unregister function (kept for dispose)
    P->>W: postMessage init { documentUri, jsonContext }
    W->>W: onInitializeCompleted → setInitDocument / setDocumentUri
```

- The `init` reply is asynchronous, so the `message` listener is attached before it arrives.
- `ready` is posted from render while `documentUri === ""`. It can be sent more than once (for example the
  StrictMode double render), and each one repeats register and `init`.
- `register()` for a URI that another panel already holds only adds this panel's handler. The existing document
  state is kept.

### 3.3 First screen

```mermaid
stateDiagram-v2
    [*] --> Waiting: render (ready posted)
    Waiting --> LoadFailed: init, JSON invalid
    Waiting --> NewDocument: init, file empty
    Waiting --> Editing: init, valid ErdDocument
    NewDocument --> Editing: InitializeDatabaseDialog onCreate<br/>→ onSave writes the file
    Editing --> Editing: edit → save / changeDocument
```

| State | Condition | Screen |
|---|---|---|
| Waiting | `documentUri === ""` | `CircularProgress` |
| LoadFailed | `loadResult === "failure"` | "Failed to load erd file." |
| NewDocument | `initDocument === null` | `InitializeDatabaseDialog` |
| Editing | `initDocument` set | `ErdApplicationShell` (`erdExportable = false`) |

Files: `src/extension/ExtensionProvider.ts`, `src/extension/vscode-message-resolver.ts`,
`src/features/VsCodeExtensionApplication.tsx`, `src/extension/VsCodeDocumentResource.ts`

---

## 4. Displaying the `.erd`: CustomEvent flow

**Key points:**
- `postMessage` stops at `VsCodeExtensionApplication`. Components below it (`MainView`, `ErdCanvas`) never touch
  `vscodeApi`. They exchange data with it only through window CustomEvents, so the shared core stays free of the
  VSCode build.
- The rectangles come from the DOM, not from the model. Only the canvas knows them, and only after layout.
- Each listener captures its dependencies in a closure (`documentUri`, `documentsHolder`) and is swapped in a
  **passive** effect (`useEffect`). The canvas fires in a **layout** effect, which runs earlier in the same commit.

### 4.1 Events

| Event | Fired by | Fired in | Listened by | Listener registered in | `detail` |
|---|---|---|---|---|---|
| `CANVAS_RECTANGLES_DRAWN_EVENT` | `ErdCanvas` | `useLayoutEffect` after measuring the DOM | `useSyncRectangles` (`VsCodeExtensionApplication`) | `useEffect`, deps `documentUri`, `vscodeApi` | `tableRectangles: Map<tableId, RectangleViewModel>` |
| `EXTERNAL_DOCUMENT_CHANGED_EVENT` | `ExternalDocumentChangeDispatcher` / `onExternalChangedDocument` | message handler (synchronous) | `MainView` | `useEffect`, deps `documentsHolder` | `erdDocument: ErdDocument` |

Both constants live in `src/components/constant.ts`. `CANVAS_RECTANGLES_DRAWN_EVENT` has a listener only in the
VSCode build. In the other builds it fires and nothing receives it.

### 4.2 From `init` to the first paint

```mermaid
sequenceDiagram
    autonumber
    participant P as ExtensionProvider
    participant W as VsCodeExtensionApplication
    participant M as MainView
    participant C as ErdCanvas
    participant WIN as window

    P->>W: init { documentUri, jsonContext }
    W->>W: setInitDocument + setDocumentUri (one render)
    rect rgba(234, 88, 12, 0.08)
        Note over W,C: render + commit
        W->>M: ErdApplicationShell → MainView(erdDocument, onSave)
        M->>M: build ErdDocumentsHolder (history = [doc])
        M->>C: render tables / relations
        Note over C: useLayoutEffect (before paint)
        C->>C: initRectangleArea(DOM, viewport)
        C->>WIN: CANVAS_RECTANGLES_DRAWN_EVENT
        WIN->>W: listener from the Waiting render (documentUri = "")
        W->>P: drawnRectangles { documentUri: "" }
        P->>P: URI mismatch → dropped
    end
    rect rgba(37, 99, 235, 0.08)
        Note over W,M: passive effects (after paint)
        M->>WIN: add EXTERNAL_DOCUMENT_CHANGED_EVENT listener
        W->>WIN: swap CANVAS_RECTANGLES_DRAWN_EVENT listener (real documentUri)
        W->>WIN: swap "message" listener (real documentUri)
    end
    Note over P,WIN: host has no rectangles until the next redraw (§4.3)
```

- The table is on screen after step 1, but MCP tools see `rectangles` as empty until a redraw.
- With 0 tables the event is skipped, so a new document sends nothing either.

### 4.3 Redraw → rectangle sync

```mermaid
sequenceDiagram
    autonumber
    participant C as ErdCanvas
    participant W as VsCodeExtensionApplication
    participant P as ExtensionProvider
    participant R as VsCodeDocumentResource
    participant T as MCP tools

    Note over C: dependency changed (table below)
    C->>C: useLayoutEffect → initRectangleArea
    C->>W: CANVAS_RECTANGLES_DRAWN_EVENT (tableRectangles)
    W->>P: drawnRectangles { documentUri, rectangles[] }
    P->>P: documentUri matches this panel?
    P->>R: updateDrawnRectangles(textDocument, rectangles)
    R->>R: replace budget.drawnRectangles
    T->>R: findById → DocumentBudget
    R-->>T: getRectangles() / findRectangle(tableId)
```

| Re-fire trigger (effect dependency) | Typical cause |
|---|---|
| `erdDocument.lastUpdatedAt` | any edit, undo/redo, applied external change |
| `scaleState.scale` | zoom |
| `dragState.status` | drag start / end |
| `currentPerspective` | perspective switch |
| `viewport` | canvas remount |

`drawnRectangles` is not a save. It only updates the host's in-memory `DocumentBudget`.

### 4.4 `changeDocument` → `EXTERNAL_DOCUMENT_CHANGED_EVENT`

```mermaid
sequenceDiagram
    autonumber
    participant P as ExtensionProvider / VsCodeDocumentResource
    participant W as VsCodeExtensionApplication
    participant D as ExternalDocumentChangeDispatcher
    participant WIN as window
    participant M as MainView (holder)
    participant C as ErdCanvas

    P->>W: changeDocument { jsonContext, alreadyPersisted }
    W->>W: documentUri matches? → ErdDocument.toObject
    alt alreadyPersisted = true (file watch / other panel)
        W->>D: dispatch(doc)
        D->>WIN: EXTERNAL_DOCUMENT_CHANGED_EVENT
        WIN->>M: holder.update(doc)
        M->>W: onSave(doc)
        W->>D: isEcho(doc) → true → no save
    else alreadyPersisted = false (MCP tool)
        W->>WIN: EXTERNAL_DOCUMENT_CHANGED_EVENT (Dispatcher bypassed)
        WIN->>M: holder.update(doc)
        M->>W: onSave(doc)
        W->>P: save → file written (21_save-flow.md §5)
    end
    M->>C: rerender (lastUpdatedAt changed)
    C->>W: CANVAS_RECTANGLES_DRAWN_EVENT → §4.3
```

- `window.dispatchEvent` is synchronous, so `isEcho()` is evaluated while `D` still holds `doc`.
- An external change also updates the rectangles on the host, because it changes `lastUpdatedAt`.

### 4.5 Listener lifetimes

```mermaid
flowchart LR
    subgraph APPV["VsCodeExtensionApplication (mounted once)"]
        L_MSG["message listener<br/>re-attached when documentUri changes"]
        L_RECT["CANVAS_RECTANGLES_DRAWN_EVENT listener<br/>re-attached when documentUri changes"]
    end
    subgraph MAINV["MainView (mounted after init)"]
        L_EXT["EXTERNAL_DOCUMENT_CHANGED_EVENT listener<br/>re-attached when documentsHolder changes<br/>(every history change / onSave change)"]
    end
    INIT(["init"]) -->|"documentUri: '' → uri"| L_MSG
    INIT --> L_RECT
    INIT -->|mount| L_EXT

    classDef common fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class L_EXT common
    class L_MSG,L_RECT,INIT specific
```

- The `message` and rectangle listeners change exactly once, at `init`. §4.2 is the only window where a stale
  closure is observable.
- `MainView` re-attaches its listener on every history change. It does not fire `CANVAS_RECTANGLES_DRAWN_EVENT`
  itself, so the stale-closure case in §4.2 does not apply to it.

Files: `src/features/VsCodeExtensionApplication.tsx`, `src/features/MainView.tsx`,
`src/features/canvas/ErdCanvas/ErdCanvas.tsx`, `src/components/ExternalDocumentChangeDispatcher.ts`,
`src/components/constant.ts`, `src/extension/vscode-message-resolver.ts`, `src/agent-tools/DocumentBudget.ts`

---

## 5. Other entry points

### 5.1 Opening a `.erm` file

`ErmImportProvider` has no editor of its own. It converts the file, writes a `.erd` next to it, and reopens that
`.erd` with the normal editor. From there §3 and §4 apply.

```mermaid
sequenceDiagram
    autonumber
    participant V as VSCode
    participant I as ErmImportProvider
    participant FS as File system
    participant P as ExtensionProvider

    V->>I: resolveCustomTextEditor(.erm)
    I->>I: convertErm()
    alt conversion failed
        I-->>V: error toast + report HTML
    else converted
        I->>V: confirm overwrite (only if .erd exists)
        I->>FS: writeFile(<name>.erd)
        I->>V: vscode.openWith(.erd, erdDesigner.erdEditor)
        V->>P: resolveCustomTextEditor(.erd) → §3
        I->>I: dispose own panel
    end
```

### 5.2 MCP tool `create`

The MCP tool writes a new file and opens it with the editor. It then polls until the `ready` registration
completes (every 100 ms, up to 3 s), because the document is invisible to tools before that.

```mermaid
sequenceDiagram
    autonumber
    participant T as MCP tool
    participant R as VsCodeDocumentResource
    participant V as VSCode
    participant P as ExtensionProvider / Webview

    T->>R: create(filePath, doc)
    R->>V: fs.writeFile + vscode.openWith
    V->>P: resolve → ready → register (§3.2)
    loop every 100 ms, max 3 s
        R->>R: findById(documentId)?
    end
    R-->>T: { documentId, fileUri }
```

- On timeout the tool still returns. The `documentId` is derived from the URI, so later calls can find it.
- Rectangles for the new document follow §4.2: they are empty until the first redraw.

Files: `src/extension/ErmImportProvider.ts`, `src/extension/VsCodeDocumentResource.ts`

---

## 6. Teardown

```mermaid
sequenceDiagram
    autonumber
    participant V as VSCode
    participant P as ExtensionProvider
    participant R as VsCodeDocumentResource
    participant M as McpServerManager

    V->>P: panel.onDidDispose
    P->>P: dispose onDidChangeTextDocument / FileSystemWatcher
    P->>R: unregister() (this panel's handler)
    alt other panels still open
        R->>R: keep document
    else last panel
        R->>R: remove document
    end
    Note over V,M: window closes
    V->>M: deactivate() → stop()
```

Files: `src/extension/ExtensionProvider.ts`, `src/extension/extension.ts`
