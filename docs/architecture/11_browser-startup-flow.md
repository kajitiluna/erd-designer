# Browser (Local) Startup Flow

## TL;DR

- **Selected by elimination.** `App.tsx` routes here when there is no `window.vscodeApi` and the path is outside
  `/erd-designer/gdrive/*`.
- **Storage first, then UI.** `LocalApplication` opens IndexedDB before it shows anything. If opening fails,
  `NoOperationStorage` is used instead: editing still works, but nothing is saved.
- **Every document is persisted before the editor opens.** New, imported and sample documents are saved with
  `expectedRevision = 0` under a fresh UUID. The editor starts from the revision that save actually assigned.
- **One editor = one sync channel.** `LocalDocumentEditor` is keyed by `documentKey:generation`. Its channel
  subscribes to BroadcastChannel in a `useEffect` setup/cleanup pair, so StrictMode and remounts never leave two
  channels alive.
- **Only one CustomEvent is used.** `EXTERNAL_DOCUMENT_CHANGED_EVENT` carries another tab's save into `MainView`.
  `CANVAS_RECTANGLES_DRAWN_EVENT` fires but has no listener in this build.
- **Reload after a conflict is a remount.** The editor re-reads the document and increments `generation`, which
  rebuilds the editor and its channel.

| Phase | Trigger | Main result |
|---|---|---|
| Storage init | `LocalApplication` mount | `IndexedDBStorage` or `NoOperationStorage` |
| Document list | `StartUp` mount | `findAll()` → Hero (0 docs) / Dashboard |
| Open | new / import / sample / list click | `onOpenDocument(key, doc, revision)` |
| Editor mount | `openDocument` set | channel subscribed, `MainView` built |
| Other-tab sync | BroadcastChannel message | `EXTERNAL_DOCUMENT_CHANGED_EVENT` → history |
| Reload | conflict → Reload | `generation + 1` → editor rebuilt |

Legend for the diagrams: **blue = shared by all builds**, **orange = Browser-specific**, stadium shape = CustomEvent.

---

## 1. Overview

```mermaid
flowchart TB
    APP["App.tsx<br/>no vscodeApi, path ≠ /gdrive/*"]

    subgraph LOCAL["Browser (Local)"]
        LAPP["LocalApplication"]
        INITDB["initializeErdDocumentDB()"]
        IDB[("IndexedDB")]
        NOOP["NoOperationStorage"]
        STARTUP["StartUp<br/>(Hero / Dashboard)"]
        EDITOR["LocalDocumentEditor<br/>key = documentKey:generation"]
        SYNC["useLocalDocumentSync<br/>→ LocalDocumentSyncChannel"]
        BC{{"BroadcastChannel<br/>erd-designer:local-document:&lt;key&gt;"}}
    end

    subgraph COMMON["Shared core"]
        SHELL["ErdApplicationShell"]
        MAIN["MainView"]
        CANVAS["ErdCanvas"]
        DISP["ExternalDocumentChangeDispatcher"]
        EVT_EXT(["EXTERNAL_DOCUMENT_CHANGED_EVENT"])
        EVT_RECT(["CANVAS_RECTANGLES_DRAWN_EVENT<br/>(no listener)"])
    end

    APP --> LAPP --> INITDB
    INITDB -->|onsuccess| IDB
    INITDB -.->|onerror| NOOP
    LAPP -->|storage ready| STARTUP
    STARTUP -->|onOpenDocument| EDITOR
    EDITOR --> SYNC
    EDITOR --> SHELL --> MAIN --> CANVAS
    CANVAS -.-> EVT_RECT
    SYNC <-->|subscribe / notify| BC
    SYNC -->|dispatch| DISP --> EVT_EXT -->|"holder.update()"| MAIN
    MAIN -->|onSave| SYNC

    classDef common fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class APP,SHELL,MAIN,CANVAS,DISP,EVT_EXT,EVT_RECT common
    class LAPP,INITDB,IDB,NOOP,STARTUP,EDITOR,SYNC,BC specific
```

Files: `src/App.tsx`, `src/features/LocalApplication.tsx`

---

## 2. Storage initialisation

**Key points:**
- `initializeErdDocumentDB()` always resolves. It never rejects, so the app always reaches `StartUp`.
- While the promise is pending, the "Please allow IndexedDB" notice is rendered. It flashes briefly even on a
  normal start.

```mermaid
sequenceDiagram
    autonumber
    participant L as LocalApplication
    participant I as initializeErdDocumentDB
    participant DB as indexedDB

    L->>L: render (documentStorage = null) → IndexedDB notice
    L->>I: useEffect (mount)
    I->>DB: open(INDEXED_DB_NAME, VERSION)
    alt first time / version up
        DB-->>I: onupgradeneeded → createObjectStore("key")
        I-->>L: IndexedDBStorage
    else opened
        DB-->>I: onsuccess
        I-->>L: IndexedDBStorage
    else blocked / error
        DB-->>I: onerror
        I-->>L: NoOperationStorage (isAvailable = false)
    end
    L->>L: setDocumentStorage → render StartUp
```

Files: `src/features/storage/IndexedErdDocumentStorage.ts`, `src/features/storage/ErdDocumentStorage.ts`

---

## 3. Screen states

```mermaid
stateDiagram-v2
    [*] --> StorageInit
    StorageInit --> ListLoading: storage resolved
    ListLoading --> Hero: findAll() = 0 docs
    ListLoading --> Dashboard: findAll() ≥ 1 doc
    Hero --> Editing: new / import / sample
    Dashboard --> Editing: list click / new / import / sample
    Editing --> Conflict: save returned conflict
    Conflict --> Editing: Reload (generation + 1)
    Conflict --> ListLoading: document deleted elsewhere
```

| State | Rendered by | Screen |
|---|---|---|
| StorageInit | `LocalApplication` | IndexedDB notice |
| ListLoading | `StartUp` | `CircularProgress` |
| Hero | `HeroLayout` | first-run landing |
| Dashboard | `DashboardLayout` | document list + actions |
| Editing | `LocalDocumentEditor` | `ErdApplicationShell` |
| Conflict | `LocalDocumentEditor` | editor + Reload Snackbar |

---

## 4. Opening a document

**Key points:**
- All four paths end in the same call, `onOpenDocument(documentKey, erdDocument, revision)`.
- New, import and sample documents are written before opening. Waiting for the assigned revision avoids a false
  conflict on the first edit.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant S as StartUp
    participant ST as ErdDocumentStorage
    participant L as LocalApplication

    alt new (InitializeDatabaseDialog)
        U->>S: create
    else import .erd / .erm (LoadFileDialog)
        U->>S: select file → FileReader
        S->>S: ErdDocument.toObject / convertErm
    else sample
        U->>S: open sample
        S->>S: fetch(sample-ec_mysql.erd)
    end
    opt new / import / sample
        S->>ST: save(uuidV4(), doc, expectedRevision = 0)
        ST-->>S: saved(revision) (failure → revision 0)
    end
    alt list click (Dashboard)
        U->>S: select summary
        S->>ST: find(key)
        ST-->>S: { erdDocument, revision }
    end
    S->>L: onOpenDocument(key, doc, revision)
    L->>L: setOpenDocument({ ..., generation: 0 })
```

Files: `src/features/start_up/StartUp.tsx`, `src/features/start_up/ErdDocumentListPanel.tsx`,
`src/features/start_up/InitializeDatabaseDialog.tsx`

---

## 5. Editor mount and the CustomEvent flow

**Key points:**
- Creating the channel has no side effects. Only `subscribe()` opens the BroadcastChannel, and the returned
  cleanup closes it.
- `onSave` comes from `useCallback`, so `MainView` does not rebuild its holder on every render.
- The Dispatcher lives inside the channel, one per editor. That is what makes the echo check reliable.

```mermaid
sequenceDiagram
    autonumber
    participant E as LocalDocumentEditor
    participant C as LocalDocumentSyncChannel
    participant BC as BroadcastChannel
    participant M as MainView
    participant CV as ErdCanvas
    participant WIN as window

    E->>C: useState(() => new Channel(storage, key, doc, revision))
    E->>M: ErdApplicationShell(erdDocument, onSave)
    M->>CV: render
    CV->>WIN: CANVAS_RECTANGLES_DRAWN_EVENT (useLayoutEffect, ignored)
    E->>C: useEffect → subscribe()
    C->>BC: open erd-designer:local-document:<key>
    M->>WIN: useEffect → add EXTERNAL_DOCUMENT_CHANGED_EVENT listener
    Note over E,WIN: editing — saves follow 21_save-flow.md §3
    BC-->>C: { revision } from another tab
    C->>C: revision > current? → storage.find(key)
    C->>C: reuseInstancesFrom(latestKnown) (same → stop)
    C->>WIN: Dispatcher.dispatch → EXTERNAL_DOCUMENT_CHANGED_EVENT
    WIN->>M: holder.update(imported)
    M->>C: onSave(imported) → isEcho → not saved
```

| Event | Fired by | Listened by | Effect in this build |
|---|---|---|---|
| `EXTERNAL_DOCUMENT_CHANGED_EVENT` | `LocalDocumentSyncChannel` (via Dispatcher) | `MainView` | other tab's save enters the undo history |
| `CANVAS_RECTANGLES_DRAWN_EVENT` | `ErdCanvas` | none | no effect |

Files: `src/features/storage/useLocalDocumentSync.ts`, `src/features/storage/LocalDocumentSyncChannel.ts`,
`src/features/MainView.tsx`

---

## 6. Reload after a conflict

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant E as LocalDocumentEditor (gen n)
    participant L as LocalApplication
    participant ST as ErdDocumentStorage
    participant E2 as LocalDocumentEditor (gen n+1)

    U->>E: Reload (Snackbar)
    E->>L: onReloadRequested()
    L->>ST: find(documentKey)
    alt found
        ST-->>L: { erdDocument, revision }
        L->>L: setOpenDocument(generation + 1)
        L->>E: unmount → channel cleanup (close)
        L->>E2: mount → new channel, subscribe (§5)
    else deleted elsewhere
        L->>L: setOpenDocument(null) → StartUp
    end
```

Files: `src/features/LocalApplication.tsx`
