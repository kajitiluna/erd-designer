# 複数ウィンドウ同時編集 — 技術方針調査

1 台のローカルマシン上で、同一ドキュメントを複数ウィンドウ (タブ / エディタパネル) で開き、
一方の編集が他方へ即時反映される状態を目指すための調査と実現方式の比較。

## 0. 実装状況

方式A (§4) を採用し、3 シェル全てに実装済み。

| 段階 (§7) | 内容 | 状態 |
|---|---|---|
| 0 | VSCode 複数パネル登録の不具合修正 | 完了 (`VsCodeDocumentResource.ts`, `ExtensionProvider.ts`) |
| 1 | `ExternalDocumentChangeDispatcher` (echo 抑止の共通化) | 完了 (`src/components/ExternalDocumentChangeDispatcher.ts`) |
| 2 | VSCode 同一ウィンドウ内の複数パネル | 完了 (段階 0 の修正でカバー) |
| 3 | ブラウザ版 (IndexedDB CAS + BroadcastChannel) | 完了 (`ErdDocumentStorage.ts`, `LocalDocumentSyncChannel.ts`, `LocalApplication.tsx`) |
| 4 | GDrive 版 (BroadcastChannel + `navigator.locks`) | 完了 (`GoogleDriveFile.tsx`) |
| 5 | VSCode ウィンドウ跨ぎ (`createFileSystemWatcher`) | 完了 (`ExtensionProvider.ts`) |

実装時に判明した、本調査の時点では見えていなかった論点:

- **VSCode の echo 抑止は 2 種類の「外部変更」を区別する必要があった。** MCP ツール経由の変更
  (`VsCodeDocumentResource.notify`) はメモリ上の更新のみでファイルへは書き込まれておらず、
  webview からの保存往復で初めて永続化される。一方、他パネル/他ウィンドウ/ファイル監視経由の変更は
  既にファイルへ書き込み済みである。どちらも同じ `changeDocument` メッセージ・同じ
  `EXTERNAL_DOCUMENT_CHANGED_EVENT` に載っていたため、当初の実装は前者まで一律に echo 扱いし、
  MCP ツールの変更が保存されずに消える回帰を起こした。`ChangeDocumentMessage` に
  `alreadyPersisted: boolean` を追加し、MCP 経由は `false` (echo 抑止を経由しない生の dispatch)、
  それ以外は `true` (`ExternalDocumentChangeDispatcher` 経由) で区別して解消した
  (`vscode-message-resolver.ts`)。
- **MainView 自体は無変更で済んだ。** §5 で当初 `MainView.tsx` の `handleOnSave` を書き換える設計を
  示していたが、実装では `onSave` prop と `EXTERNAL_DOCUMENT_CHANGED_EVENT` という既存の 2 つの
  フックがシェル注入ポイントとして十分だったため、同期ロジックは全て各シェル
  (`LocalApplication.tsx` / `GoogleDriveFile.tsx` / `VsCodeExtensionApplication.tsx`) 側に閉じ込められた。
- **IndexedDB の compare-and-swap は 1 トランザクション内の get→put で実現できた** (`readwrite`
  トランザクションはスコープの重なるものを並行実行しないという IndexedDB 仕様どおり)。§8 で
  「実機確認が必要」としていたが、これは追加検証を要さない標準仕様として扱ってよいと判断した。
- **VSCode のウィンドウ跨ぎ検知 (段階5) は「保険」のまま。** VSCode 自身が dirty でない
  TextDocument をディスク変更に追従させる挙動が既にこのケースをカバーしている可能性が高いが、
  実際のマルチウィンドウ VSCode セッションでの検証はこの環境では行えなかったため、
  `createFileSystemWatcher` を併設する形で確実性を優先した。

## 1. 要件

| # | 要件 | 備考 |
|---|---|---|
| R1 | GDrive 版・VSCode 拡張・ブラウザ版の 3 シェル全てに対応 | |
| R2 | 1 ローカルマシンの範囲内。複数マシンは考慮不要 | GDrive 版の既存リモート同期は別関心事 |
| R3 | 一方のウィンドウの更新が他ウィンドウへ反映される。原則即時 | |
| R4 | 反映契機は `ErdDocument` が更新された時点 | |
| R5 | undo / redo も反映対象 | |
| R6 | 同時更新は先勝ち。後者はエラー扱い | 人手操作では実質発生しない前提 |
| R7 | 追加のインストールを伴わない | 新規 npm 依存・常駐サーバの追加不可 |

## 2. 現状調査

### 2.1 更新は 1 本の経路に集約されている

全ての編集操作は `ErdDocumentsHolder` の `doUpdate` を通り、コンストラクタで受け取った
`updateDocument` コールバックへ流れる。

- `src/context/ErdDocumentsHolderContext.ts:73` — `doUpdate` が履歴を積んで `updateDocument` を呼ぶ
- `src/context/ErdDocumentsHolderContext.ts:44`, `:56` — `undo` / `redo` も同じ `updateDocument` を呼ぶ
- `src/features/MainView.tsx:116` — `handleOnSave` が唯一の実装。ここで `onSave(documents[cursor], ...)` を呼ぶ
- `src/features/MainView.tsx:126` — `handleOnSave` を渡して `ErdDocumentsHolder` を生成

つまり **R4 と R5 の発火点は `MainView.tsx:116` の `handleOnSave` 1 箇所**で足りる。
undo / redo は「カーソル移動の結果として得られた `ErdDocument`」を同じ経路で流すため、
発行側に特別な分岐は要らない。

### 2.2 外部変更の取り込み経路も 1 本ある

`EXTERNAL_DOCUMENT_CHANGED_EVENT` (`src/components/constant.ts:22`) が
window の CustomEvent として使われており、受信側は `MainView` の 1 箇所。

- `src/features/MainView.tsx:137` — `initHandleExternallyChangedDocument` が
  `documentsHolder.update(erdDocument, ...)` を呼び、履歴に 1 件積む
- 発火元は 2 つ
  - `src/extension/vscode-message-resolver.ts:120` — VSCode 拡張からの `changeDocument` メッセージ
  - `src/features/gdrive/GoogleDriveFile.tsx:602` — Drive のリモート更新取り込み

**受信側の器は既に存在する。** 本件で新設が要るのは「他ウィンドウの更新をこのイベントへ届けるトランスポート」だけ。

### 2.3 エコー抑止の既存パターン

取り込んだドキュメントは `documentsHolder.update` → `handleOnSave` → `onSave` と流れるため、
何もしないと「受け取った内容をそのまま保存し直す」echo が起きる。
GDrive 版はこれを参照同一性で潰している。

- `src/features/gdrive/GoogleDriveFile.tsx:602` — dispatch の直前に `importedDocumentRef` へ格納し、`finally` で解除
- `src/features/gdrive/GoogleDriveFile.tsx:58` — `importedDocumentRef.current === erdDocument` なら保存しない

`documentsHolder.update` は受け取ったインスタンスをそのまま次状態にするため、この同一性判定は成立する。
**この仕組みを全シェル共通に引き上げるのが正しい方向**で、シェルごとに再発明すべきではない。

### 2.4 先勝ち制御の素材

| シェル | 版数として使えるもの | 比較と書き込みの原子性 |
|---|---|---|
| ブラウザ版 (IndexedDB) | 現状なし。レコードに `revision` を追加する必要あり | `readwrite` トランザクション内で read → compare → put すれば真の CAS |
| GDrive 版 | Drive の `modifiedTime`。既に実装済み (`gdrive-file-support.ts:84` `verifyGdriveVersionOrThrow`) | check-then-act。原子的ではない |
| VSCode 拡張 | 現状なし。ファイル内容のハッシュ、または `fs.stat` の mtime | 拡張ホストが書き込みを直列化。ウィンドウ跨ぎは check-then-act |

GDrive 版は既に楽観排他と競合トーストを持っている (`GoogleDriveFile.tsx:344` `doUpdateDocument`、
`:363` `initConflictToast`)。**R6 のモデルは GDrive 版に既にある**ので、それを他 2 シェルへ展開する形になる。

### 2.5 各シェルの現状ギャップ

**ブラウザ版 (LocalApplication)** — 何もない。
`onSave` は `documentStorage.save(key, ...)` を呼ぶだけ (`ErdDocumentListPanel.tsx:38`)。
`documentKey` はクロージャに閉じ込められており外へ出ていないため、
ドキュメント単位のチャネル名を作るには `onOpenDocument` のシグネチャに key を通す必要がある。

**VSCode 拡張** — 同一ウィンドウ内の複数パネルについては **ファン アウトの半分が既に動く**。
`resolveCustomTextEditor` はパネルごとに呼ばれ、パネルごとに `onDidChangeTextDocument` の
watcher を張る (`ExtensionProvider.ts:39`)。同一 URI の `TextDocument` は共有されるため、
片方のパネルの保存が全パネルの watcher を発火させ、各々の webview へ `changeDocument` が届く。

ただし同じ経路に 2 つの実害がある。

- `VsCodeDocumentResource.register` は URI 1 件につき 1 エントリしか持たない
  (`VsCodeDocumentResource.ts:87`)。2 枚目のパネルが `ready` を送った時点で
  1 枚目の `onUpdateDocument` が上書きされ、**MCP ツール経由の更新通知
  (`VsCodeDocumentResource.ts:191` `notify`) が最後のパネルにしか届かない**。
- `webviewPanel.onDidDispose` が無条件に `documentResource.remove` を呼ぶ
  (`ExtensionProvider.ts:50`)。**2 枚開いて 1 枚閉じると、残ったパネルの登録ごと消える。**

また、外部変更を取り込んだ webview が echo で保存し直すため、
**外部変更 1 回につきウィンドウ数 - 1 回の余計なディスク書き込み**が発生する
(2.3 のガードが VSCode 側には無い)。`ErdDocument.equals` で 2 巡目は止まるのでループはしない。

**GDrive 版** — 10 秒間隔のポーリング (`constant.ts:REMOTE_SYNC_INTERVAL_MILLISECOND`) で
リモート差分を取り込む。同一マシン上の別タブも「リモート」として最大 10 秒遅れで見える。
`gdriveFileId` は sessionStorage 保持なのでタブごとに独立しており、
同一ファイルを 2 タブで開く導線自体は成立する。R3 の「原則即時」を満たしていないだけ。

### 2.6 更新頻度

ドラッグ操作は `handleDragEnd` でのみコミットされる (`ErdCanvas.tsx:249`, `:282`)。
mousemove ごとには `doUpdate` を呼ばない。つまり発行レートは人間操作の頻度 (高々毎秒数回) に収まる。
サンプル ERD の JSON は約 57KB (`samples/sample-ec_mysql.erd`)。
**ドキュメント全体を毎回転送する方式で性能上の問題は出ない**と判断してよい。

## 3. 制約の整理 — なぜ「全シェル共通の単一トランスポート」が成立しないか

### 3.1 保存先が互いに素

| シェル | 保存先 |
|---|---|
| ブラウザ版 | IndexedDB (`erd_designer` / `erd_document`) |
| GDrive 版 | Google Drive 上のファイル |
| VSCode 拡張 | ワークスペースの `.erd` ファイル |

**同一ドキュメントを別シェルで同時に開く状況は存在しない。**
したがって「3 シェルを跨ぐ同期」は要件ではなく、
**シェルごとに最適なトランスポートを選んでよい**。

### 3.2 VSCode webview は origin 分離されている

VSCode の webview は 1 枚ごとに固有 origin (`vscode-webview://<uuid>`) で動く。
このため webview 間では以下がいずれも共有されない。

- `BroadcastChannel`
- `localStorage` / `storage` イベント
- `IndexedDB`
- `navigator.locks`

**ブラウザ標準の同一 origin 前提の機構は VSCode 拡張では一切使えない。**
VSCode 側のハブは拡張ホスト (`postMessage`) とファイルシステムに限られる。
※ この前提は 8. のスパイクで実機確認する。

### 3.3 利用できる素材 (追加インストール不要)

| 機構 | ブラウザ版 | GDrive 版 | VSCode 拡張 |
|---|---|---|---|
| `BroadcastChannel` | ○ | ○ | × (3.2) |
| `storage` イベント | ○ | ○ | × |
| IndexedDB (CAS 可) | ○ | △ (本体は Drive) | × |
| `navigator.locks` | ○ | ○ | × |
| 拡張ホストの `postMessage` ファンアウト | — | — | ○ |
| `createFileSystemWatcher` | — | — | ○ (ウィンドウ跨ぎ) |
| サーバ (Drive API) | — | ○ | — |

## 4. 実現方式の候補

### 方式A: 共通契約 + シェル別トランスポート **(推奨)**

`MainView` に対して「保存」と「他ウィンドウからの受信」を 1 つの契約として渡し、
その実装をシェルごとに差し替える。

```ts
// src/features/sync/document-sync-channel.ts (公開面は index.ts の再エクスポートのみ)
export type DocumentRevision = {
    version: string,
    erdDocument: ErdDocument
};

export type PublishResult =
    { result: "accepted", version: string }
    | { result: "conflict", latest: DocumentRevision }
    | { result: "unavailable" };

export type DocumentSyncChannel = {
    publish: (updating: ErdDocument, loggingMessage: string) => Promise<PublishResult>,
    subscribe: (onReceived: (revision: DocumentRevision) => void) => () => void
};
```

- `publish` = 保存 + 楽観排他。`MainView.tsx:116` の `handleOnSave` から呼ぶ (R4 / R5)
- `subscribe` = 他ウィンドウの更新受信。受信内容を `EXTERNAL_DOCUMENT_CHANGED_EVENT` へ流す (R3)
- 版数 (`version`) の保持はチャネル実装側の責務。`ErdDocumentsHolder` は履歴だけを持ち続ける

**シェル別の実装**

| シェル | 通知 | 真実の源 / 排他 |
|---|---|---|
| ブラウザ版 | `BroadcastChannel("erd-designer:" + documentKey)` | IndexedDB レコードの `revision` を `readwrite` トランザクション内で CAS |
| GDrive 版 | `BroadcastChannel("erd-designer:gdrive:" + fileId)` | Drive の `modifiedTime` (既存)。同一マシン内の直列化は `navigator.locks` で補強 |
| VSCode 拡張 | 拡張ホストが同一 URI の全パネルへ `changeDocument` を `postMessage` | 拡張ホストが書き込みを直列化。ウィンドウ跨ぎは `createFileSystemWatcher` + 書き込み直前の内容ハッシュ比較 |

**長所**

- 2.1 / 2.2 で確認した既存の 2 本の経路にそのまま乗る。`ErdDocument` と `ErdDocumentsHolder` は無変更
- シェルごとに一番強い排他を使える。特にブラウザ版は IndexedDB トランザクションで**真の CAS** が取れる
- GDrive 版は「BroadcastChannel を受けたら既存の `REMOTE_SYNC_REQUESTED_EVENT` を即発火する」だけで
  即時化でき、差分が極小
- 追加依存ゼロ

**短所**

- 実装が 3 通りになる。シェル別のテストが要る
- 契約を導入する分、`onSave` prop を差し替える小さなリファクタが `MainView` / 3 シェルに波及する

### 方式B: 共有ストアのポーリングに統一

新しいトランスポートを入れず、GDrive 版が既にやっているポーリングを全シェルへ広げる。
ブラウザ版は IndexedDB の `revision` だけを短間隔で読み、変わっていたら本体を取りに行く。

**長所**

- 機構が 1 つ。3.2 の origin 分離を気にしなくてよい (VSCode も同じ形で書ける)
- 既にリポジトリ内で動いている実績のある形。失敗リスクが最も低い

**短所**

- **R3「原則即時」を満たさない。** 体感即時にするには 300〜500ms 間隔が必要で、
  現行の 10 秒とは桁が違う常時ポーリングになる
- ウィンドウ数 × 全ドキュメントで読み取りが走り続ける。アイドル時も電力を使う

軽量化 (`revision` だけを読む別オブジェクトストア) すればコストは抑えられるが、
「即時」の要件に対しては本質的に妥協。**方式A の初期段階 / フォールバックとしては有用。**

### 方式C: 操作ログ (コマンド) の伝搬

ドキュメント全体ではなく `ErdDocumentsHolder` の操作そのもの
(メソッド名 + 引数) を配信し、各ウィンドウが自分の履歴上で再生する。

**長所**

- **undo / redo が「カーソル移動」として全ウィンドウで共有される。**
  他方式では undo の結果が受信側に「新しい 1 状態」として積まれるが、この方式だけは意味論が一致する
- ペイロードが小さい

**短所**

- `ErdDocumentsHolder` の public メソッド 30 件弱を全てシリアライズ可能にする必要がある。
  引数にモデルインスタンスを含むものが多く、`toJSON` / `toObject` の整備が大掛かり
- 一度でも再生がずれると全ウィンドウが恒久的に乖離する。検知も復旧も難しい
- R6 が「先勝ち・後者エラー」で済む (= 真のマージが不要) なのに、複雑さだけが CRDT 並

**R6 が緩い以上、この複雑さは引き合わない。** undo の意味論のために採る価値は薄い。

### 方式D: マシンローカルの HTTP / WebSocket ハブ

拡張に既にある express サーバ (`McpServerManager.ts:139`、既定ポート 53753) を
ウィンドウ間ハブとして使う、あるいは同等のものを立てる。

**長所**

- 全シェルが同じプロトコルで喋れる。ハブが単一の直列化点になるため R6 が自明に満たせる

**短所**

- **ブラウザ版単独の利用者にはサーバが存在しない。** R7 により常駐プロセスを追加できない
- 拡張のサーバは `erdDesigner.mcpServer.enabled` が既定 false。有効化を前提にできない
- GitHub Pages の https ページから `http://localhost` への接続は mixed content / CORS で塞がれる

**要件を満たせないため不採用。** 記録として残す。

### 4.1 比較

| 観点 | 方式A | 方式B | 方式C | 方式D |
|---|---|---|---|---|
| R1 全シェル対応 | ○ | ○ | ○ | × |
| R3 即時性 | ○ (数 ms) | △ (間隔依存) | ○ | ○ |
| R5 undo/redo 反映 | ○ (結果として) | ○ (結果として) | ◎ (履歴共有) | ○ |
| R6 先勝ち | ○ (ブラウザ版は真の CAS) | ○ | △ | ◎ |
| R7 追加インストール不要 | ○ | ○ | ○ | × |
| 既存コードへの影響 | 小 | 最小 | 大 | 大 |
| 実装ボリューム | 中 | 小 | 大 | 大 |

**方式A を推奨。** 即時性 (R3) を満たしつつ既存の 2 本の経路に素直に乗り、追加依存が無い。
段階導入の第 1 段として方式B の形を挟むこともできる (7. 参照)。

## 5. 推奨案 (方式A) の設計

### 5.1 ウィンドウの同期状態

コーディング規約 16 に従い、複数の boolean ではなく 1 つの文字列 union で表す。

```ts
type WindowSyncState = "synced" | "publishing" | "conflicted" | "detached";
```

- `synced` — 自分の保持する版数がストアの最新と一致
- `publishing` — `publish` 実行中
- `conflicted` — `publish` が競合で拒否された。R6 の「後者はエラー」の状態
- `detached` — トランスポートが使えない (IndexedDB 不許可、`BroadcastChannel` 未提供など)。
  単一ウィンドウとして従来どおり動作する

### 5.2 発行 (publish)

`MainView.tsx:116` の `handleOnSave` から呼ぶ。現在の `onSave(documents[cursor], loggingMessage)` を
`channel.publish(...)` に置き換え、結果で状態遷移する。

- `accepted` → 保持する版数を更新、`synced`
- `conflict` → `conflicted`。エラートーストを出す (5.5)
- `unavailable` → `detached`

### 5.3 受信 (subscribe)

チャネルが受け取った `DocumentRevision` を、既存の `EXTERNAL_DOCUMENT_CHANGED_EVENT` へそのまま流す。
`MainView.tsx:137` の受信口は無変更で動く。

受信側の履歴の扱いは**現行の `documentsHolder.update` の挙動を踏襲する**。
すなわち受信内容を新しい 1 状態として履歴の先頭に積む (`doUpdate` が `cursor` 以降を切り捨てる)。

- これは GDrive 版のリモート取り込みで既に確立している挙動であり、新しい意味論を持ち込まない
- 帰結として、**A で undo した結果は B では「新しい編集」として見える。**
  B でそれを undo すると A の undo 前の状態に戻る。方式C を採らない限りこれは避けられない。
  R5 は「反映されること」の要求なので満たすが、**この意味論は仕様として明記すべき**

取り込み時は `reuseInstancesFrom` (`ErdDocument.ts:1861`) を通して未変更モデルのインスタンスを寄せる。
GDrive 版が既にやっているとおり (`GoogleDriveFile.tsx:591` 付近)、
履歴 100 件に完全コピーが積み上がるのを防ぐ効果がある。

### 5.4 エコー抑止

2.3 の `importedDocumentRef` パターンをチャネル契約側へ引き上げ、
**シェルによらず 1 つの実装**にする。

- チャネルは「いま配信中のインスタンス」を保持したまま `EXTERNAL_DOCUMENT_CHANGED_EVENT` を同期 dispatch する
- `publish` は引数がそのインスタンスと同一参照なら何もせず `accepted` を返す
- dispatch 区間を抜けたら保持を解除する

これにより 2.5 で挙げた VSCode 側の余計なディスク書き込みも同時に消える。

### 5.5 競合時の扱い (R6)

GDrive 版の `initConflictToast` (`GoogleDriveFile.tsx:370`) を共通コンポーネントへ切り出し、
3 シェルで同一の振る舞いにする。

- 「別のウィンドウの更新と競合しました」というエラー表示
- 「最新を読み込む」操作で、ストアから読み直して履歴ごと置き換える (= 後者の編集は破棄)
- **未保存分を失わせないための逃げ道**として「この状態を .erd に書き出す」導線を併置することを推奨。
  R6 は編集の破棄を許容しているが、破棄しか選べない UI は避けたい

### 5.6 シェル別の実装要点

**ブラウザ版**

- `InternalDocument` (`IndexedErdDocumentStorage.ts:7`) に `revision: number` を追加する。
  規約 17 の後方互換方針に従い、**`revision` 不在のレコードは 0 とみなす**。
  値に項目を足すだけなので `INDEXED_DB_VERSION` の更新は不要
- `save` を CAS 化する。1 つの `readwrite` トランザクション内で
  `get` → 保持中の版数と比較 → 一致すれば `revision + 1` で `put`、不一致なら競合を返す。
  IndexedDB はスコープの重なる `readwrite` トランザクションを同時に走らせない仕様のため、
  **これは真の compare-and-swap になる** (8. で実機確認)
- `documentKey` を `onOpenDocument` 経由で外へ通す必要がある
  (`StartUp.tsx`, `ErdDocumentListPanel.tsx:31`, `LocalApplication.tsx`)
- IndexedDB が使えない場合は `NoOperationStorage` が選ばれる (`IndexedErdDocumentStorage.ts:170`)。
  この場合は `detached` とし、従来どおり単一ウィンドウで動作させる

**GDrive 版**

- `publish` は既存の `doUpdateDocument` (`GoogleDriveFile.tsx:344`) をほぼそのまま使える
- 保存成功後に `BroadcastChannel` へ `{ fileId, version }` を流す。
  受信した他タブは **既存の `REMOTE_SYNC_REQUESTED_EVENT` を即発火するだけ**でよい。
  以降は現行の `initHandleSyncRemoteRequest` → `doImportRemoteUpdate` の経路がそのまま走る
- `verifyGdriveVersionOrThrow` → `updateGdriveFile` は原子的ではない。
  同一マシン内の直列化は `navigator.locks.request("erd-designer:gdrive:" + fileId, ...)` で
  この区間を囲えば解消できる (R2 の範囲では十分)
- 10 秒ポーリングは残す。ローカル即時同期の取りこぼしに対する保険として無害
- **要検討**: 現行の即時同期は `syncRemoteChanges` 設定 (既定 off) に依存している
  (`GoogleDriveFile.tsx:466`)。同一マシンのウィンドウ間同期をこの設定に紐づけるか、
  常時有効にするかは UX 判断が要る

**VSCode 拡張**

- `VsCodeDocumentResource` を URI 1 件につき**複数の `onUpdateDocument` を保持する形**に変える
  (2.5 の 1 点目)。`register` はハンドラを追加し、パネル単位の解除キーを返す
- `remove` をパネル単位の解除に変え、**最後の 1 枚が閉じたときだけ**エントリを消す
  (2.5 の 2 点目)。`ExtensionProvider.ts:48` の `onDidDispose` を対応させる
- 同一ウィンドウ内のファンアウトは `onDidChangeTextDocument` の既存経路で動く。上記 2 点の修正で MCP 経路も揃う
- ウィンドウ跨ぎは `vscode.workspace.createFileSystemWatcher` を追加する。
  開いている `TextDocument` がディスク変更で自動リロードされ `onDidChangeTextDocument` が
  発火するかは環境依存なので、watcher を明示的に張るほうが確実 (8. で確認)
- 排他は `onSaveDocument` (`vscode-message-resolver.ts:165`) の `applyEdit` 直前に
  現ファイル内容のハッシュと webview が持つ版数を比較する。
  mtime は FS によって粒度が粗い場合があるため、内容ハッシュのほうが安全

## 6. 先に直すべき既存の不具合

方式選定と独立に、**複数パネルを開いた時点で既に壊れている**ものが 2 件ある。
同期機能の土台になるため先に手当てするのが良い。

1. `VsCodeDocumentResource.register` が URI 単位で上書きするため、
   MCP ツール経由の更新が最後に開いたパネルにしか届かない (`VsCodeDocumentResource.ts:87`)
2. `webviewPanel.onDidDispose` が無条件に `remove` するため、
   2 枚開いて 1 枚閉じると残ったパネルの登録が消える (`ExtensionProvider.ts:48`)

加えて、外部変更の取り込み時に echo で保存し直す点 (2.5) も、
ウィンドウ数に比例してディスク書き込みが増えるため 5.4 と合わせて解消する。

## 7. 段階的な導入

| 段階 | 内容 | 得られる状態 |
|---|---|---|
| 0 | 6. の既存不具合の修正 | VSCode で複数パネルを開いても MCP 連携が壊れない |
| 1 | `DocumentSyncChannel` 契約の導入 + 5.4 のエコー抑止を共通化 | 既存挙動は不変。土台のみ |
| 2 | VSCode (同一ウィンドウの複数パネル) | 最小の差分で R1 の一角が満たせる |
| 3 | ブラウザ版 (`BroadcastChannel` + IndexedDB CAS) | 3 シェル中で最も強い排他が得られる |
| 4 | GDrive 版 (`BroadcastChannel` で既存ポーリングを即時化) | 差分が極小 |
| 5 | VSCode (ウィンドウ跨ぎ、`createFileSystemWatcher`) | 段階 2 の範囲外を埋める |

段階 2 を先に置くのは、既存実装の大半が揃っており修正量が最小だから。
段階 3 以降でトランスポートの差異が契約に収まっていることを確認しながら進められる。

## 8. 実機で確認すべき事項 (スパイク)

本調査は静的読解によるもので、以下はコード上からは確定できない。着手前に実機検証が要る。

1. **VSCode webview の origin 分離** (3.2) — 2 枚の webview 間で `BroadcastChannel` /
   `localStorage` が共有されないことの確認。共有されるなら方式A の VSCode 実装が大幅に単純化する
2. **VSCode ウィンドウ跨ぎの変更検知** — 別ウィンドウがディスク上の `.erd` を書き換えたとき、
   こちら側の `onDidChangeTextDocument` が発火するか。しないなら `createFileSystemWatcher` が必須
3. **IndexedDB のタブ跨ぎトランザクション直列化** (5.6) — スコープの重なる `readwrite` が
   本当に直列化されるか。対象ブラウザで CAS が成立することの確認
4. **`BroadcastChannel` の対象ブラウザ可用性** — 未提供環境では `detached` へ落とす分岐が要る
5. **大きめのドキュメントでの転送コスト** — 2.6 の見積り (57KB / 人間操作レート) の裏取り

## 9. テスト方針

- **契約単位**: `DocumentSyncChannel` のモック実装に対し、`MainView` の発行/受信が
  期待どおり動くこと (echo 抑止、競合時の状態遷移、undo/redo が publish を通ること)
- **ブラウザ版の CAS**: 同一 DB への 2 本の `publish` を並行させ、片方が `conflict` を返すこと。
  `fake-indexeddb` のような追加依存は入れられないため、
  IndexedDB のモック相当を自前で置くか、CAS ロジックを純関数へ切り出して単体化する
- **VSCode**: `VsCodeDocumentResource` の複数ハンドラ登録/解除を単体テストで固める
  (現状 `src/extension/` にはテストが無いため新設になる)
- **GDrive**: `gdrive-file-support.test.ts` に倣い、版数比較の分岐を拡張する

## 10. 未決事項

- GDrive 版の同一マシン内即時同期を `syncRemoteChanges` 設定に紐づけるか (5.6)
- 競合時に後者の編集を破棄する際、`.erd` への書き出し導線を用意するか (5.5)
- 受信側の undo 意味論 (5.3) を仕様として明記するか、方式C を将来的に検討するか
