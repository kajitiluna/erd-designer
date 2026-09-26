# Save Flow Architecture

## TL;DR

- **One editing core, three save backends.** The Browser (Local), Google Drive and VSCode builds share the editing
  core. Each build supplies only its own `onSave`, which decides where and how the document is written.
- **Saving is automatic.** Every edit, undo and redo goes through `ErdDocumentsHolder`, and `MainView` then calls
  `onSave`. There is no save button.
- **External changes take the same path.** A change made somewhere else is injected with
  `ExternalDocumentChangeDispatcher` and applied with `holder.update()`, so it also lands in the undo history.
- **Echoes are suppressed in one shared place.** Applying an external change calls `onSave` again with the same
  instance. `isEcho()` detects this by reference identity so the change is not written back.
- **Concurrency follows one pattern:** an optimistic version check, a notification to other windows, and a reload.
  Each build differs only in what the version is and where atomicity comes from.

| | Browser (Local) | Google Drive App | VSCode extension |
|---|---|---|---|
| Storage | IndexedDB | Drive API | `WorkspaceEdit` + `TextDocument.save()` |
| Version | `revision` (integer) | `modifiedTime` | none (delegated to VSCode) |
| Atomic check-and-write | one IndexedDB readwrite transaction | in-tab queue + Web Locks across tabs | VSCode |
| Detecting other windows | BroadcastChannel | BroadcastChannel + 10 s polling | `onDidChangeTextDocument` + FileSystemWatcher |
| On conflict | later save rejected → Reload | later save rejected → auto-sync or Reload | last write wins |

Legend for the diagrams: **blue = shared by all builds**, **orange = specific to one build**.

---

## 1. Overview

`src/App.tsx` selects the build: `window.vscodeApi` → VSCode, `/erd-designer/gdrive/*` → Google Drive, anything
else → Local.

```mermaid
flowchart TB
    subgraph COMMON["Shared core"]
        direction TB
        UI["Canvas / edit dialogs"]
        HOLDER["ErdDocumentsHolder<br/>(undo/redo history, max 100)"]
        MAIN["MainView<br/>calls onSave"]
        SHELL["ErdApplicationShell<br/>(receives onSave via props)"]
        DISP["ExternalDocumentChangeDispatcher<br/>(inject external change + echo check)"]
        EVT(["EXTERNAL_DOCUMENT_CHANGED_EVENT"])
        UI -->|"holder.updateXxx()"| HOLDER
        HOLDER -->|"updateDocument()"| MAIN
        SHELL --> MAIN
        DISP -->|dispatch| EVT
        EVT -->|"holder.update()"| HOLDER
    end

    subgraph LOCAL["Browser (Local)"]
        L_SAVE["useLocalDocumentSync<br/>→ LocalDocumentSyncChannel"]
        L_DB[("IndexedDB")]
        L_BC{{"BroadcastChannel"}}
    end

    subgraph GDRIVE["Google Drive App"]
        G_SAVE["GoogleDriveFile<br/>→ update queue"]
        G_API[("Google Drive API")]
        G_BC{{"BroadcastChannel"}}
        G_POLL["RemoteSyncIndicator<br/>(10 s polling)"]
    end

    subgraph VSCODE["VSCode extension"]
        V_SAVE["VsCodeExtensionApplication<br/>→ postMessage save"]
        V_EXT["ExtensionProvider<br/>(extension host)"]
        V_FILE[(".erd file")]
    end

    MAIN -->|onSave| L_SAVE
    MAIN -->|onSave| G_SAVE
    MAIN -->|onSave| V_SAVE

    L_SAVE --> L_DB
    L_SAVE -.->|revision| L_BC
    L_BC -.->|other tab saved| DISP

    G_SAVE --> G_API
    G_SAVE -.->|saved| G_BC
    G_BC -.->|sync request| G_SAVE
    G_POLL -.->|sync request| G_SAVE
    G_SAVE -.->|remote update| DISP

    V_SAVE --> V_EXT --> V_FILE
    V_FILE -.->|change detected| V_EXT
    V_EXT -.->|changeDocument| DISP

    classDef common fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class UI,HOLDER,MAIN,SHELL,DISP,EVT common
    class L_SAVE,L_DB,L_BC,G_SAVE,G_API,G_BC,G_POLL,V_SAVE,V_EXT,V_FILE specific
```

---

## 2. Shared mechanisms

### 2.1 From edit to `onSave`

```mermaid
sequenceDiagram
    autonumber
    participant UI as Canvas / Dialog
    participant H as ErdDocumentsHolder
    participant M as MainView
    participant S as onSave (per build)

    UI->>H: updateTableViewModel() etc.
    H->>H: build new ErdDocument (skip if previous === next)
    H->>H: push to history (cursor = 0, max 100)
    H->>M: updateDocument(history, cursor, message)
    M->>S: onSave(documents[cursor], message)
    Note over UI,H: undo / redo go through updateDocument too
```

- `ErdDocument` is immutable. Unchanged sub-models share instances.
- `MainView` rebuilds `documentsHolder` whenever the `onSave` reference changes, so **every build must stabilise
  `onSave` with `useCallback`**.

Files: `src/context/ErdDocumentsHolderContext.ts`, `src/features/MainView.tsx`, `src/features/ErdApplicationShell.tsx`

### 2.2 External changes and echo suppression

`dispatch()` holds the imported instance only while it runs. `window.dispatchEvent` runs synchronously through
`holder.update()` into `onSave`. If `onSave` receives that same instance, the call is an echo.

```mermaid
sequenceDiagram
    autonumber
    participant SRC as Change source (per build)
    participant D as ExternalDocumentChangeDispatcher
    participant H as ErdDocumentsHolder
    participant S as onSave (per build)

    SRC->>D: dispatch(imported)
    D->>D: dispatchingDocument = imported
    D->>H: EXTERNAL_DOCUMENT_CHANGED_EVENT → update(imported)
    alt same content (equals)
        H-->>D: no-op
    else different content
        H->>S: onSave(imported)
        S->>D: isEcho(imported)
        D-->>S: true → do not save
    end
    D->>D: dispatchingDocument = null
```

Each build owns **exactly one** Dispatcher instance. If two stay alive, the echo check misses and saves loop.

### 2.3 Instance reuse on import

A document parsed from JSON has all-new instances, which would duplicate the undo history. Local and Google Drive
run `reuseInstancesFrom(current)` first. If nothing changed, it returns `current` itself, so `===` drops no-op
updates cheaply.

---

## 3. Browser (Local)

**Key points:** IndexedDB check-and-write keyed by `revision`, first write wins. Other tabs learn about a save
through BroadcastChannel and re-read the document from IndexedDB. If IndexedDB is unavailable,
`NoOperationStorage` lets editing continue without saving.

```mermaid
sequenceDiagram
    autonumber
    participant C as SyncChannel (tab A)
    participant DB as IndexedDB
    participant BC as BroadcastChannel
    participant C2 as SyncChannel (tab B)
    participant D2 as Dispatcher (tab B)

    C->>C: isEcho? → stop
    C->>DB: save(key, doc, expectedRevision = r)
    Note over DB: get → compare → put<br/>in one readwrite transaction
    alt stored revision == r
        DB-->>C: saved (r + 1)
        C->>BC: { revision: r + 1 }
        BC-->>C2: message (ignored if <= own revision)
        C2->>DB: find(key)
        C2->>D2: dispatch(reuseInstancesFrom(...))
    else mismatch
        DB-->>C: conflict (not written) → Snackbar
    end
```

```mermaid
stateDiagram-v2
    [*] --> Editing
    Editing --> Editing: saved / imported other tab
    Editing --> Conflict: save returned conflict
    Conflict --> Editing: Reload → reopen latest,<br/>generation + 1 remounts editor
    Conflict --> [*]: document deleted → StartUp
```

Files: `src/features/storage/*`, `src/features/LocalApplication.tsx`, `src/features/start_up/StartUp.tsx`

---

## 4. Google Drive App

**Key points:**
- The Drive API has no check-and-write operation. Exclusion is done on the client instead: a Promise-chain queue
  (`updateQueueRef`) within a tab, and `navigator.locks` across tabs.
- Before each write, the client compares the stored `modifiedTime` with the one it holds.
- Remote changes are pulled only through `REMOTE_SYNC_REQUESTED_EVENT`, which the 10 s timer, the manual refresh
  button and other tabs' broadcasts all fire. This happens only while `syncRemoteChanges` is ON.
- While authorization is expired, only the latest document is held back. It is saved after reauthorization, and
  the same version check still applies.

```mermaid
sequenceDiagram
    autonumber
    participant F as GoogleDriveFile
    participant Q as update queue
    participant L as Web Locks
    participant API as Drive API
    participant BC as BroadcastChannel

    F->>F: isEcho? → stop / expired → hold as pending
    F->>Q: enqueue(save)
    Q->>L: acquire lock
    L->>API: GET modifiedTime
    alt matches held version
        L->>API: PATCH content (+ name if renamed)
        API-->>Q: new modifiedTime
        Q->>BC: notify other tabs
    else changed by someone else
        L-->>F: conflict toast<br/>(sync ON: auto-sync soon / OFF: Reload)
    end
```

```mermaid
sequenceDiagram
    autonumber
    participant T as 10 s timer / manual / other tab
    participant F as GoogleDriveFile
    participant Q as update queue (same as saves)
    participant API as Drive API
    participant D as Dispatcher

    T->>F: REMOTE_SYNC_REQUESTED_EVENT
    F->>F: sync ON, state idle, authorized?
    F->>Q: enqueue(remote sync)
    Q->>API: GET modifiedTime
    alt changed
        Q->>API: GET content
        Q->>D: dispatch(reuseInstancesFrom(...))
    end
```

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> syncing: request accepted
    syncing --> idle: success / transient error
    syncing --> unauthorized: 401 / 403
    unauthorized --> idle: reauthorized
```

Files: `src/features/gdrive/GoogleDriveFile.tsx`, `src/features/gdrive/gdrive-file-support.ts`,
`src/features/gdrive/gdrive-authorization.ts`, `src/features/canvas/TitlePanel.tsx`

---

## 5. VSCode extension

**Key points:**
- The webview cannot write files, so it sends a `save` message to the extension host. The host then applies a
  `WorkspaceEdit` and calls `save()`.
- File changes arrive through `onDidChangeTextDocument` (same window) or the FileSystemWatcher (other windows).
  The host sends them to every panel with `alreadyPersisted = true`, so they are echo-suppressed.
- **MCP tool edits are the exception.** They exist only in memory, so they are sent with `alreadyPersisted = false`
  and **skip the Dispatcher**. The webview's normal `onSave` round trip is what writes them to disk.

```mermaid
flowchart LR
    subgraph WEBVIEW["Webview (React)"]
        SHELL["ErdApplicationShell"]
        APPV["VsCodeExtensionApplication"]
        DISP["ExternalDocumentChangeDispatcher"]
    end
    subgraph HOST["Extension host"]
        PROV["ExtensionProvider"]
        DOCRES["VsCodeDocumentResource"]
        MCP["MCP tools"]
    end
    TD[(".erd TextDocument")]

    SHELL --> APPV
    APPV -->|save| PROV
    PROV -->|"applyEdit + save()"| TD
    TD -->|"change / file watch"| PROV
    PROV -->|update| DOCRES
    PROV -->|"changeDocument<br/>alreadyPersisted = true"| DISP
    MCP -->|notify| DOCRES
    DOCRES -->|"changeDocument<br/>alreadyPersisted = false<br/>(bypasses Dispatcher)"| SHELL

    classDef common fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class SHELL,DISP common
    class APPV,PROV,DOCRES,MCP,TD specific
```

```mermaid
sequenceDiagram
    autonumber
    participant MCP as MCP tool
    participant R as VsCodeDocumentResource
    participant W as Webview
    participant P as ExtensionProvider
    participant TD as TextDocument

    MCP->>R: notify(doc)
    R->>W: changeDocument (alreadyPersisted = false)
    W->>W: holder.update → onSave (not an echo)
    W->>P: save
    P->>TD: applyEdit + save
    TD-->>P: onDidChangeTextDocument
    P->>W: changeDocument (alreadyPersisted = true)
    Note over W: same content → holder ignores it → round trip ends
```

| Message | Direction | Purpose |
|---|---|---|
| `ready` | webview → host | host registers the panel and replies with `init` |
| `init` | host → webview | file content (empty → new-document dialog) |
| `save` | webview → host | `ErdDocument.toJSON()` to write |
| `changeDocument` | host → webview | external change + `alreadyPersisted` |
| `drawnRectangles` | webview → host | table rectangles for MCP tools (not saving) |

Files: `src/features/VsCodeExtensionApplication.tsx`, `src/extension/ExtensionProvider.ts`,
`src/extension/vscode-message-resolver.ts`, `src/extension/VsCodeDocumentResource.ts`

---

## 6. Checklist for a new save backend

1. Implement `onSave(document, loggingMessage)`, stabilise it with `useCallback`, and pass it to
   `ErdApplicationShell`.
2. Keep exactly one `ExternalDocumentChangeDispatcher`. Inject changes with `dispatch()` and check `isEcho()`
   first in `onSave`.
3. Echo-suppress only changes that are already persisted. Suppressing an unpersisted change loses it.
4. Serialise asynchronous saves, and update the optimistic version from each save result.
