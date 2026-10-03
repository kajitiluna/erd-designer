# Google Drive App Startup Flow

## TL;DR

- **Google Drive is always the entry point.** Drive's "Open with" and "New" redirect to
  `/erd-designer/gdrive/init?state=<json>`. `state` says `open` (file id) or `create` (folder id).
- **Two routes, one token.** `/init` (`GoogleDriveInitializer`) prepares the file. `/gdrive`
  (`GoogleDriveFile`) edits it. `useGdriveAuthorization` lives in their common parent, so the token survives the
  route change.
- **Authorization needs a click.** Google's token popup requires a user gesture, so the first screen is always
  "Authorize with Google".
- **The handoff goes through `sessionStorage`.** `/init` stores `gdriveFileId` and
  `temporaryDocument { erdDocument, version }`. `/gdrive` reads them in its first render and then deletes
  `temporaryDocument`.
- **A page reload starts from Drive, not from the cache.** The token lives only in memory and
  `temporaryDocument` is already gone. The user re-authorizes and the latest file is fetched again.
- **Remote sync is driven by one CustomEvent.** `REMOTE_SYNC_REQUESTED_EVENT` is fired by the 10 s timer, the
  refresh button and other tabs. It leads to `EXTERNAL_DOCUMENT_CHANGED_EVENT` only when `syncRemoteChanges` is ON.

| Phase | Route | Trigger | Main result |
|---|---|---|---|
| Authorize | `/init` | user clicks Authorize | token (`drive.file`, `drive.install`) |
| Prepare file | `/init` | `state.action` | `open`: fetch / `.erm` convert, `create`: new file |
| Handoff | `/init` → `/gdrive` | `onInitialize` | `sessionStorage` written, `navigate(replace)` |
| Editor mount | `/gdrive` | first render | `ErdApplicationShell`, effects registered |
| Remote sync | `/gdrive` | `REMOTE_SYNC_REQUESTED_EVENT` | changed file → history |
| Reload recovery | `/gdrive` | browser reload | re-authorize → `openErdGdriveFile` |

Legend for the diagrams: **blue = shared by all builds**, **orange = Google Drive-specific**, stadium shape = CustomEvent.

---

## 1. Overview

```mermaid
flowchart TB
    DRIVE(["Google Drive<br/>Open with / New"])
    APP["App.tsx<br/>/erd-designer/gdrive/*"]

    subgraph GD["Google Drive App"]
        GAPP["GoogleDriveApplication<br/>GoogleOAuthProvider"]
        INNER["GoogleDriveInnerApplication<br/>useGdriveAuthorization"]
        INIT["GoogleDriveInitializer<br/>route: init"]
        SS[("sessionStorage<br/>gdriveFileId / temporaryDocument")]
        FILE["GoogleDriveFile<br/>route: (root)"]
        API[("Drive API")]
        BC{{"BroadcastChannel<br/>erd-designer:gdrive-file:&lt;id&gt;"}}
        IND["RemoteSyncIndicator<br/>(10 s / manual)"]
        EVT_SYNC(["REMOTE_SYNC_REQUESTED_EVENT"])
    end

    subgraph COMMON["Shared core"]
        SHELL["ErdApplicationShell"]
        MAIN["MainView"]
        DISP["ExternalDocumentChangeDispatcher"]
        EVT_EXT(["EXTERNAL_DOCUMENT_CHANGED_EVENT"])
    end

    DRIVE -->|"?state=open|create"| APP --> GAPP --> INNER
    INNER --> INIT
    INNER --> FILE
    INIT <-->|"open / create / .erm import"| API
    INIT -->|onInitialize| SS
    SS -->|first render| FILE
    FILE --> SHELL --> MAIN
    IND --> EVT_SYNC
    BC --> EVT_SYNC
    EVT_SYNC --> FILE
    FILE <-->|"sync / save (queue)"| API
    FILE --> DISP --> EVT_EXT -->|"holder.update()"| MAIN

    classDef common fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef specific fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    class APP,SHELL,MAIN,DISP,EVT_EXT common
    class DRIVE,GAPP,INNER,INIT,SS,FILE,API,BC,IND,EVT_SYNC specific
```

Files: `src/App.tsx`, `src/features/GoogleDriveApplication.tsx`

---

## 2. `/init`: authorize and prepare the file

### 2.1 Authorization

**Key points:**
- `state` is parsed once per query string (`useMemo`). A missing or invalid `action` becomes `none`, and nothing
  starts.
- The token expiry is shortened by 60 s (`expiresAt = expires_in − 60 s`), so the app never uses a token at the
  moment it expires.

```mermaid
sequenceDiagram
    autonumber
    participant D as Google Drive
    participant I as GoogleDriveInitializer
    participant A as useGdriveAuthorization
    participant G as Google Identity (popup)

    D->>I: /erd-designer/gdrive/init?state={...}
    I->>I: useGdriveStateParam → open / create / none
    I->>I: state = unauthorized → "Authorize with Google"
    I->>A: authorize() (user click)
    A->>G: requestAccessToken (select_account)
    G-->>A: access_token, expires_in
    A->>A: drive.file granted? → authorized
    A-->>I: authorization changed → effect runs (§2.2 / §2.3)
```

### 2.2 `action = open`

```mermaid
sequenceDiagram
    autonumber
    participant I as GoogleDriveInitializer
    participant API as Drive API
    participant U as User
    participant P as GoogleDriveInnerApplication

    I->>API: openGdriveFile(fileId) (metadata + content)
    alt .erd
        API-->>I: { erdDocument, version }
        I->>P: onInitialize
    else .erm converted
        I->>API: findSiblingGdriveFile(<name>.erd)
        I->>U: confirm (Import / Overwrite)
        U->>I: confirm
        alt no sibling
            I->>API: createGdriveFile
        else sibling exists
            I->>API: verify version → updateGdriveFile
        end
        I->>P: onInitialize
    else .erm failed / folder unknown / sibling lookup failed
        I->>I: phase = failed → error Alert
    end
```

### 2.3 `action = create`

```mermaid
sequenceDiagram
    autonumber
    participant I as GoogleDriveInitializer
    participant U as User
    participant API as Drive API
    participant P as GoogleDriveInnerApplication

    I->>I: setGdriveFolderId(folderId)
    I->>U: InitializeDatabaseDialog
    U->>I: onCreate(erdDocument)
    I->>API: createGdriveFile(folderId, doc) (useEffect)
    API-->>I: { fileId, version }
    I->>P: onInitialize
```

Files: `src/features/gdrive/GoogleDriveInitializer.tsx`, `src/features/gdrive/gdrive-authorization.ts`,
`src/features/gdrive/gdrive-file-support.ts`

---

## 3. Handoff and editor mount

**Key points:**
- `onInitialize` writes `sessionStorage` and navigates with `replace: true`, so Back does not return to `/init`.
- `GoogleDriveFile` reads `temporaryDocument` in the `useState` initialiser. That is before any effect removes it.
- Every effect is registered at mount, but each waits for `sessionDocument`, `gdriveFileId` and an authorized
  token as needed.

```mermaid
sequenceDiagram
    autonumber
    participant P as GoogleDriveInnerApplication
    participant SS as sessionStorage
    participant F as GoogleDriveFile
    participant M as MainView
    participant WIN as window

    P->>SS: gdriveFileId, temporaryDocument
    P->>P: navigate("/erd-designer/gdrive", replace)
    P->>F: mount (same authorization)
    F->>SS: useState(initSessionDocument) ← temporaryDocument
    F->>M: ErdApplicationShell(remoteSync, erdExportable = false)
    rect rgba(234, 88, 12, 0.08)
        Note over F,WIN: useEffect (after first render)
        F->>F: open BroadcastChannel (message → REMOTE_SYNC_REQUESTED_EVENT)
        F->>F: seed update queue with version, latestDocumentRef = doc
        F->>WIN: add REMOTE_SYNC_REQUESTED_EVENT listener (syncState = idle)
        F->>F: arm expiry toast timer
        F->>SS: remove temporaryDocument
        M->>WIN: add EXTERNAL_DOCUMENT_CHANGED_EVENT listener
    end
```

### 3.1 Screen states

```mermaid
stateDiagram-v2
    [*] --> InvalidAccess: no gdriveFileId
    [*] --> Editing: temporaryDocument present
    [*] --> NeedAuthorize: reload (no temporaryDocument, token lost)
    NeedAuthorize --> Loading: Re-authorize
    Loading --> Editing: openErdGdriveFile → setSessionDocument
    Editing --> Editing: save / remote sync
```

| State | Condition | Screen |
|---|---|---|
| InvalidAccess | `gdriveFileId == null` | "Invalid access" |
| NeedAuthorize | `sessionDocument == null`, not authorized | Re-authorize button |
| Loading | `sessionDocument == null`, authorized | `CircularProgress` |
| Editing | `sessionDocument` set | `ErdApplicationShell` + toast |

Files: `src/features/GoogleDriveApplication.tsx`, `src/features/gdrive/GoogleDriveFile.tsx`

---

## 4. Remote sync: the CustomEvent flow

**Key points:**
- `REMOTE_SYNC_REQUESTED_EVENT` is the only trigger for pulling remote changes. The timer, the manual button and
  other tabs all fire it, so there is only one import path.
- The request is ignored unless all three hold: `syncRemoteChanges` is ON (default OFF), `syncState` is `idle`,
  and the token is authorized.
- The sync task runs in the same queue as saves, so a pull never interleaves with a write.

```mermaid
sequenceDiagram
    autonumber
    participant SRC as RemoteSyncIndicator (10 s / manual)<br/>or BroadcastChannel
    participant WIN as window
    participant F as GoogleDriveFile
    participant Q as update queue
    participant API as Drive API
    participant D as Dispatcher
    participant M as MainView

    SRC->>WIN: REMOTE_SYNC_REQUESTED_EVENT
    WIN->>F: handleSyncRequest
    F->>F: syncRemoteChanges ON, idle, authorized?
    F->>F: syncState = syncing
    F->>Q: enqueue(remote sync)
    Q->>API: GET modifiedTime
    alt changed
        Q->>API: GET content
        Q->>Q: reuseInstancesFrom(latest) (same → stop)
        Q->>D: dispatch(imported)
        D->>WIN: EXTERNAL_DOCUMENT_CHANGED_EVENT
        WIN->>M: holder.update(imported)
        M->>F: onSave(imported) → isEcho → not saved
    end
    Q->>F: syncState = idle (401/403 → unauthorized)
```

| Event | Fired by | Listened by | Condition |
|---|---|---|---|
| `REMOTE_SYNC_REQUESTED_EVENT` | `RemoteSyncIndicator` timer (paused while hidden), refresh button, BroadcastChannel | `GoogleDriveFile` | sync ON, `idle`, authorized |
| `EXTERNAL_DOCUMENT_CHANGED_EVENT` | Dispatcher (in the sync task) | `MainView` | content changed |
| `CANVAS_RECTANGLES_DRAWN_EVENT` | `ErdCanvas` | none | no effect in this build |

The save half (queue, Web Locks, conflicts) is in [21_save-flow.md §4](./21_save-flow.md#4-google-drive-app).

Files: `src/features/gdrive/GoogleDriveFile.tsx`, `src/features/canvas/TitlePanel.tsx`,
`src/components/constant.ts`

---

## 5. Token lifecycle after startup

**Key points:**
- Google's popup cannot open from a timer. Renewal piggybacks on the first click or keyup once less than 10 min
  remain. Keys typed into text inputs are skipped.
- An expired token does not stop editing. Saves are held back (latest only) and written after re-authorization.

```mermaid
stateDiagram-v2
    [*] --> unauthorized
    unauthorized --> authorized: Authorize (click)
    authorized --> authorized: silent renewal<br/>(click / keyup, < 10 min left)
    authorized --> expired: expiresAt timer
    expired --> authorized: Reauthorize toast / silent renewal
```

Files: `src/features/gdrive/gdrive-authorization.ts`, `src/features/gdrive/GoogleDriveFile.tsx`
