# ERD Designer MCP Server 要件仕様書

## 1. 概要

### 1.1 目的

ERD Designer の MCP (Model Context Protocol) Server は、
AI エージェントや外部ツールが ERD ドキュメントへプログラマティックにアクセスできるようにするための API インターフェースを提供します。
これにより、ERD 設計作業の自動化、ドキュメント生成、整合性チェック、DDL 生成などの高度な支援機能を実現します。

### 1.2 スコープ

本仕様書は、ERD Designer が MCP Server として提供すべき機能要件を定義します。
ERD Designer の既存機能を MCP プロトコルを通じてアクセス可能にすることで、以下のユースケースを実現します:

- **ERD ドキュメントの自動生成**: 既存データベースや要件定義から ERD を自動作成
- **設計支援**: テーブル設計の推奨、命名規則のチェック、正規化の提案
- **ドキュメント化**: ERD 情報からMarkdown やHTML形式のドキュメント生成
- **DDL 管理**: データベーススキーマの生成とバージョン管理
- **統合**: CI/CD パイプラインへの組み込み、他ツールとの連携

---

## 2. システムアーキテクチャ

### 2.1 コンポーネント構成

```
┌─────────────────────────────────────┐
│   MCP Client (AI Agent / Tool)      │
└─────────────┬───────────────────────┘
              │ HTTP (JSON-RPC)
              ▼
┌─────────────────────────────────────┐
│   ERD Designer MCP Server           │
│  ┌───────────────────────────────┐  │
│  │  HTTP Server (Express)        │  │
│  └───────────┬───────────────────┘  │
│              ▼                      │
│  ┌───────────────────────────────┐  │
│  │  MCP Protocol Handler         │  │
│  │  - Resources                  │  │
│  │  - Tools                      │  │
│  │  - Prompts                    │  │
│  └───────────┬───────────────────┘  │
│              ▼                      │
│  ┌───────────────────────────────┐  │
│  │  DocumentResource Manager     │  │
│  │  - Document Lifecycle         │  │
│  │  - Change Notification        │  │
│  └───────────┬───────────────────┘  │
└──────────────┼──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│   VSCode Extension                  │
│   - Document Management             │
│   - File System Integration         │
└─────────────────────────────────────┘
```

### 2.2 通信プロトコル

- **プロトコル**: Model Context Protocol (MCP) over HTTP
- **エンコーディング**: JSON-RPC 2.0
- **エンドポイント**: `http://localhost:{port}/mcp`
- **認証**: なし (ローカルホストのみアクセス可能)

### 2.3 データフロー

1. MCP Client が HTTP リクエストを送信
2. MCP Server がリクエストを解釈し、DocumentResource にアクセス
3. VSCode 拡張機能からドキュメントデータを取得/更新
4. レスポンスを JSON 形式で返却

---

## 3. リソース設計

### 3.1 URI スキーム

ERD Designer は以下の階層的な URI スキームを採用します:

```
erd-designer://
├── documents                                   # ドキュメント一覧
│   └── {documentId}                            # 特定ドキュメント
│       ├── database                            # データベース情報
│       ├── tables                              # テーブル一覧
│       │   └── {tableId}                       # 特定テーブル
│       │       ├── unique_keys                 # ユニークキー一覧
│       │       │   └── {uniqueKeyId}           # 特定ユニークキー
│       │       └── indexes                     # インデックス一覧
│       │           └── {indexId}               # 特定インデックス
│       ├── columns                             # カラム定義一覧
│       │   └── {columnId}                      # 特定カラム
│       ├── column_shares                       # 共有カラムモデル定義一覧
│       │   └── {columnShareId}                 # 特定共有カラムモデル
│       ├── relations                           # リレーション一覧
│       │   └── {relationId}                    # 特定リレーション
│       ├── memos                               # メモ一覧
│       │   └── {memoId}                        # 特定メモ
│       ├── column_groups                       # カラムグループ一覧
│       │   └── {columnGroupId}                 # 特定カラムグループ
│       ├── schemas                             # スキーマ一覧
│       │   └── {schemaId}                      # 特定スキーマ
│       └── perspectives                        # Perspective 一覧
│           └── {perspectiveId}                 # 特定 Perspective

file://{filepath}                                # ファイルパスアクセス
```

### 3.2 データモデル

#### 3.2.1 ERD Document

ERD ドキュメントの最上位エンティティ

```typescript
interface ErdDocument {
  documentId: string;              // UUID
  documentName: string;            // ドキュメント名
  filePath: string;                // ファイルパス
  database: Database;              // データベース設定
  tables: Table[];                 // テーブル一覧
  relations: Relation[];           // リレーション一覧
  memos: Memo[];                   // メモ一覧
  columnGroups: ColumnGroup[];     // カラムグループ一覧
  schemas: DbSchema[];             // スキーマ一覧 (DB依存)
  settings: DocumentSettings;      // ドキュメント設定
  lastUpdatedAt: string;           // ISO 8601 形式
}
```

#### 3.2.2 Database

データベース設定とメタ情報

```typescript
interface Database {
  databaseType: DatabaseType;      // "postgresql" | "mysql" | "sqlite" | etc.
  databaseName: string;            // データベース名
  version: number;                 // スキーマバージョン
  columnTypes: ColumnType[];       // 利用可能なカラム型
  supportsSchema: boolean;         // スキーマサポート
}
```

#### 3.2.3 Table

テーブル定義とビュー情報

```typescript
interface Table {
  tableId: string;                        // UUID
  tableName: Name;                        // 物理名・論理名
  schemaId?: string;                      // スキーマID (オプション)
  columns: ColumnReference[];             // カラム参照
  uniqueKeys: UniqueKey[];                // ユニークキー制約
  indexes: TableIndex[];                  // インデックス
  description: string;                    // テーブル説明
  view: TableView;                        // 表示設定
  createdAt: string;                      // 作成日時 (ISO 8601)
}

interface Name {
  physical: string;                       // 物理名
  logical: string;                        // 論理名
}

interface ColumnReference {
  type: "single" | "group";               // 単一カラムorグループ
  id: string;                             // columnId or columnGroupId
}

interface TableView {
  position: { x: number; y: number };     // ERD上の位置
  size: { width: number; height: number } | null;  // サイズ (null = 未レンダリング)
  color: {
    background: string;                   // 背景色 (hex)
    foreground: string;                   // 前景色 (hex)
  };
}
```

#### 3.2.4 Column

カラム定義

```typescript
interface Column {
  columnId: string;                       // UUID
  columnShareId: string;                  // 共有型定義ID
  columnName: Name;                       // 物理名・論理名
  primaryKey: boolean;                    // 主キー
  notNull: boolean;                       // NOT NULL
  unique: boolean;                        // UNIQUE
  autoIncrement: boolean;                 // 自動インクリメント
  defaultValue?: string;                  // デフォルト値
}
```

#### 3.2.5 ColumnShareModel

共有カラムモデル定義（複数のColumnで共有される型定義）

```typescript
interface ColumnShareModel {
  columnShareId: string;                  // UUID
  columnName: Name;                       // 物理名・論理名
  columnType: string;                     // データ型
  precision?: string;                     // 精度
  scale?: string;                         // スケール
  unsigned?: boolean;                     // 符号なし
  isArray?: boolean;                      // 配列型
  description: string;                    // カラム説明
  createdAt: string;                      // 作成日時
}
```

#### 3.2.6 Relation

テーブル間のリレーション

```typescript
interface Relation {
  relationId: string;                     // UUID
  relationName: string;                   // リレーション名
  parentTableId: string;                  // 親テーブルID
  parentCardinality: Cardinality;         // "1" | "0..1" | "0..N" | "1..N"
  childTableId: string;                   // 子テーブルID
  childCardinality: Cardinality;          // "1" | "0..1" | "0..N" | "1..N"
  relationPairs: RelationPair[];          // カラムペア
  onUpdateAction: ReferenceAction;        // 更新時アクション
  onDeleteAction: ReferenceAction;        // 削除時アクション
  view: RelationView;                     // 表示設定
}

interface RelationPair {
  parentColumnId: string;                 // 親カラムID
  childColumnId: string;                  // 子カラムID
}

type ReferenceAction = "RESTRICT" | "SET NULL" | "CASCADE" | "NO ACTION" | "SET DEFAULT";

interface RelationView {
  lineType: "orthogonal" | "direct";      // 線の種類
  startDirection?: OrthogonalDirection;   // 開始方向 (orthogonal時)
  endDirection?: OrthogonalDirection;     // 終了方向 (orthogonal時)
}

type OrthogonalDirection = "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
```

#### 3.2.7 Memo

ERD上のメモ

```typescript
interface Memo {
  memoId: string;                         // UUID
  memo: string;                           // メモ内容
  view: MemoView;                         // 表示設定
  createdAt: string;                      // 作成日時
}

interface MemoView {
  position: { x: number; y: number };     // 位置
  size: { width: number; height: number }; // サイズ
  color: {
    background: string;                   // 背景色 (hex)
    foreground: string;                   // 前景色 (hex)
  };
  layer: "front" | "back";                // レイヤー
  verticalAlign: "start" | "center" | "end";    // 垂直配置
  horizontalAlign: "start" | "center" | "end";  // 水平配置
  fontSize: number;                       // フォントサイズ
}
```

#### 3.2.8 ColumnGroup

カラムの再利用可能なグループ

```typescript
interface ColumnGroup {
  columnGroupId: string;                  // UUID
  groupName: string;                      // グループ名
  columnIds: string[];                    // カラムID配列
  description: string;                    // グループ説明
}
```

#### 3.2.9 DbSchema

データベーススキーマ (PostgreSQL, Oracle等)

```typescript
interface DbSchema {
  schemaId: string;                       // UUID
  schemaName: string;                     // スキーマ名
  description: string;                    // スキーマ説明
}
```

#### 3.2.10 Perspective

テーブル/メモのフィルタビュー

```typescript
interface Perspective {
  perspectiveId: string;                  // UUID
  perspectiveName: string;                // Perspective名
  description: string;                    // 説明
  containIds: string[];                   // 含まれるtableId/memoIdの配列
}
```

#### 3.2.11 DocumentSettings

ドキュメント設定

```typescript
interface DocumentSettings {
  displayStyle: DisplayStyle;             // 表示スタイル
  exportDdlSetting: ExportDdlSetting;     // DDLエクスポート設定
}

interface DisplayStyle {
  tableNameStyle: "both" | "physical" | "logical";
  columnNameStyle: "both" | "physical" | "logical";
}

interface ExportDdlSetting {
  fileName: string;                       // 出力ファイル名
  withTable: boolean;                     // CREATE TABLE文
  withIndex: boolean;                     // CREATE INDEX文
  withForeignKey: boolean;                // FOREIGN KEY制約
  withComment: boolean;                   // COMMENT文
  withSchema: boolean;                    // CREATE SCHEMA文
}
```

---

## 4. 機能要件

### 4.1 リソース操作 (Resources)

#### 4.1.1 ドキュメント管理

| Resource | URI | 説明 |
|----------|-----|------|
| ドキュメント一覧 | `erd-designer://documents` | 開いている全ドキュメント取得 |
| ドキュメント詳細 (ID) | `erd-designer://documents/{documentId}` | IDでドキュメント取得 |
| ドキュメント詳細 (URI) | `file://{filepath}` | ファイルパスでドキュメント取得 |

##### ドキュメント一覧
**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: ドキュメントのURI (`erd-designer://documents/{documentId}` 形式)
- `documentId`: ドキュメントID
- `filePath`: ファイルパス
- `documentName`: ドキュメント名
- `databaseName`: データベース名
- `lastUpdatedAt`: 最終更新日時 (ISO 8601形式)

##### ドキュメント詳細 (ID, URL)
**レスポンス形式:**
- `uri`: ドキュメントのURI (`erd-designer://documents/{documentId}` 形式)
- `documentId`: ドキュメントID
- `filePath`: ファイルパス
- `documentName`: ドキュメント名
- `database`: データベース情報オブジェクト
  - `uri`: データベース情報のURI (`erd-designer://documents/{documentId}/database` 形式)
  - `databaseName`: データベース名
- `tables`: テーブル配列、各要素に以下を含む
  - `uri`: テーブル詳細のURI (`erd-designer://documents/{documentId}/tables/{tableId}` 形式)
  - `tableId`: テーブルID
  - `tableName`: 物理名と論理名を含むオブジェクト
  - `view`: 表示設定（位置、サイズ、色）
- `relations`: リレーション配列、各要素に以下を含む
  - `uri`: リレーション詳細のURI (`erd-designer://documents/{documentId}/relations/{relationId}` 形式)
  - `relationId`: リレーションID
  - `relationName`: リレーション名
  - `parentTableId`: 親テーブルID
  - `childTableId`: 子テーブルID
- `memos`: メモ配列、各要素に以下を含む
  - `uri`: メモ詳細のURI (`erd-designer://documents/{documentId}/memos/{memoId}` 形式)
  - `memoId`: メモID
  - `view`: 表示設定（位置、サイズ、色）
- `setting`: 設定情報オブジェクト
  - `perspectives`: Perspective一覧のURIを含むオブジェクト
  - `columnGroups`: カラムグループ一覧のURIを含むオブジェクト
  - `schemas`: スキーマ一覧のURIを含むオブジェクト（DBがスキーマをサポートする場合のみ）
- `lastUpdatedAt`: 最終更新日時 (ISO 8601形式)

#### 4.1.2 データベース管理

| Resource | URI | 説明 |
|----------|-----|------|
| データベース情報 | `erd-designer://documents/{documentId}/database` | データベース設定取得 |


##### データベース情報

**レスポンス形式:**
- `databaseType`: データベース種別 ("postgres", "mysql", "ms_sqlserver")
- `databaseName`: データベース名
- `version`: スキーマバージョン番号
- `columnTypes`: 利用可能なカラム型の配列、各要素に以下を含む
  - `id`: カラム型ID
  - `name`: カラム型名
  - `withPrecision`: 精度指定のサポート有無
  - `withScale`: スケール指定のサポート有無
  - `withUnsigned`: 符号なし指定のサポート有無
- `supportsSchema`: スキーマ機能のサポート有無
- `supportArray`: カラムの型定義で配列の指定をサポートしているか否か
- `uniqueKeySupport`: 一意キー制約に関するサポート情報
  - `orderable`: カラムのソート順を指定できるか
- `tableIndexSupport`: インデクス定義に関するサポート情報
  - `indexOptions`: 指定可能なインデクスオプションの一覧 ("UNIQUE", "FULLTEXT", "SPATIAL")
  - `indexTypes`: 指定可能なインデクスタイプの一覧 ("BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN")
  - `nullsOrder`: インデクスのカラムごとのソート順を定義する際、 NULLS FIRST or LAST を指定できるか否か
  - `supportsClustered`: インデクスのクラスタ指定が可能か (MS SQL Server のみ true となる)

#### 4.1.3 テーブル管理

| Resource | URI | 説明 |
|----------|-----|------|
| テーブル一覧 | `erd-designer://documents/{documentId}/tables` | 全テーブル取得 |
| テーブル一覧（絞り込み） | `erd-designer://documents/{documentId}/tables?tableName.physical.contains={文字列}&tableName.logical.contains={文字列}&columnName.physical.contains={文字列}&columnName.logical.contains={文字列}&columnId={columnId}` | 条件に一致するテーブル取得 |
| テーブル詳細 | `erd-designer://documents/{documentId}/tables/{tableId}` | 特定テーブル取得 |

##### テーブル一覧
**クエリパラメータ:**
絞り込み条件を指定可能（すべて任意）

| パラメータ名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `tableName.physical.contains` | string | テーブルの物理名に指定文字列を含む（部分一致） | `?tableName.physical.contains=user` |
| `tableName.logical.contains` | string | テーブルの論理名に指定文字列を含む（部分一致） | `?tableName.logical.contains=ユーザー` |
| `columnName.physical.contains` | string | カラムの物理名に指定文字列を含むカラムを持つテーブル（部分一致） | `?columnName.physical.contains=email` |
| `columnName.logical.contains` | string | カラムの論理名に指定文字列を含むカラムを持つテーブル（部分一致） | `?columnName.logical.contains=メール` |
| `columnId` | string | 指定したカラムIDを含むテーブル（完全一致） | `?columnId=abc-123-def-456` |

**複数条件の指定:**
- 異なるパラメータを複数指定した場合は **AND条件** として処理される
- 同一パラメータを複数指定した場合も **AND条件** として処理される
  - 例: `?tableName.physical.contains=user&tableName.physical.contains=admin` → 物理名に "user" **かつ** "admin" を含む

**URI例:**
```
# すべてのテーブル
erd-designer://documents/doc123/tables

# テーブルの物理名に "user" を含む
erd-designer://documents/doc123/tables?tableName.physical.contains=user

# テーブルの論理名に "ユーザー" を含む
erd-designer://documents/doc123/tables?tableName.logical.contains=ユーザー

# カラムの物理名に "email" を含むカラムを持つテーブル
erd-designer://documents/doc123/tables?columnName.physical.contains=email

# カラムの論理名に "メール" を含むカラムを持つテーブル
erd-designer://documents/doc123/tables?columnName.logical.contains=メール

# 特定のカラムIDを持つテーブル
erd-designer://documents/doc123/tables?columnId=abc-123-def-456

# 複数条件（AND）: 物理名に "user" を含み、かつカラム物理名に "id" を含む
erd-designer://documents/doc123/tables?tableName.physical.contains=user&columnName.physical.contains=id

# 同一パラメータの複数指定（AND）: 物理名に "user" かつ "account" を含む
erd-designer://documents/doc123/tables?tableName.physical.contains=user&tableName.physical.contains=account

# 物理名と論理名の両方で絞り込み
erd-designer://documents/doc123/tables?tableName.physical.contains=user&tableName.logical.contains=ユーザー

# 同一パラメータの複数指定（AND）: 指定した複数のカラムIDをすべて含むテーブル
erd-designer://documents/doc123/tables?columnId=abc-123&columnId=def-456
```

**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: テーブル詳細のURI (`erd-designer://documents/{documentId}/tables/{tableId}` 形式)
- `tableId`: テーブルID
- `tableName`: 物理名と論理名を含むオブジェクト
- `description`: テーブルの説明
- `view`: 表示設定オブジェクト
  - `position`: ERD上の位置 (x, y 座標)
  - `size`: テーブルのサイズ (width, height)、未レンダリングの場合は返却されない
  - `color`: 背景色と前景色 (16進数形式)
- `schema`: スキーマ定義がある場合のみオブジェクトが指定される
  - `uri`: スキーマのURI (`erd-designer://documents/{documentId}/schemas/{schemaId}` 形式)
  - `schemaId`: スキーマID
  - `schemaName`: スキーマ名
- `columns`: カラム配列、各要素に以下を含む
  - `uri`: カラム詳細のURI (`erd-designer://documents/{documentId}/columns/{columnId}` 形式)
  - `columnModelId`: カラムID
  - `columnName`: 物理名と論理名を含むオブジェクト
  - `typeExpression`: データ型表現
  - `primaryKey`: 主キーであるか
  - `notNull`: NOT NULL 制約があるか
  - `unique`: UNIQUE 制約があるか
  - `autoIncrement`: 自動インクリメントが有効か（サポートされる型のみ）
  - `defaultValue`: デフォルト値
  - `description`: カラムの説明
- `uniqueConstraints`: ユニーク制約配列、各要素に以下を含む
  - `uniqueKeysModelId`: ユニーク制約ID
  - `uniqueKeysName`: ユニーク制約名
  - `uniqueKeys`: 制約を構成するカラムとソート順の配列
  - `description`: 制約の説明
- `tableIndices`: インデックス配列、各要素に以下を含む
  - `tableIndexModelId`: インデックスID
  - `indexName`: インデックス名
  - `indexColumns`: インデックスを構成するカラム、ソート順、NULL順の配列
  - `indexOption`: インデックスオプション
  - `indexType`: インデックスタイプ (BTREE, HASH 等)
  - `clustered`: クラスター化インデックスか（DBがサポートする場合のみ）
  - `description`: インデックスの説明

##### テーブル詳細
**レスポンス形式:**
- `uri`: テーブル詳細のURI (`erd-designer://documents/{documentId}/tables/{tableId}` 形式)
- `tableId`: テーブルID
- `tableName`: 物理名と論理名を含むオブジェクト
- `description`: テーブルの説明
- `view`: 表示設定オブジェクト
  - `position`: ERD上の位置 (x, y 座標)
  - `size`: テーブルのサイズ (width, height)、未レンダリングの場合はプロパティ自体が存在しない
  - `color`: 背景色と前景色 (16進数形式)
- `columns`: カラム配列、各要素に以下を含む
  - `uri`: カラム詳細のURI (`erd-designer://documents/{documentId}/columns/{columnId}` 形式)
  - `columnModelId`: カラムID
  - `columnName`: 物理名と論理名を含むオブジェクト
  - `typeExpression`: データ型表現
  - `primaryKey`: 主キーであるか
  - `notNull`: NOT NULL 制約があるか
  - `unique`: UNIQUE 制約があるか
  - `autoIncrement`: 自動インクリメントが有効か（サポートされる型のみ）
  - `defaultValue`: デフォルト値
  - `description`: カラムの説明
- `uniqueConstraints`: ユニーク制約配列、各要素に以下を含む
  - `uniqueKeysModelId`: ユニーク制約ID
  - `uniqueKeysName`: ユニーク制約名
  - `uniqueKeys`: 制約を構成するカラムとソート順の配列
  - `description`: 制約の説明
- `tableIndices`: インデックス配列、各要素に以下を含む
  - `tableIndexModelId`: インデックスID
  - `indexName`: インデックス名
  - `indexColumns`: インデックスを構成するカラム、ソート順、NULL順の配列
  - `indexOption`: インデックスオプション
  - `indexType`: インデックスタイプ (BTREE, HASH 等)
  - `clustered`: クラスター化インデックスか（DBがサポートする場合のみ）
  - `description`: インデックスの説明
- `columnDefinitions`: カラム定義参照の配列、各要素は以下のいずれか
  - 単一カラムの場合: `uri`, `columnModelId`, `modelType`: "single"
  - カラムグループの場合: `uri`, `columnGroupId`, `modelType`: "group"

#### 4.1.4 カラム管理

| Resource | URI | 説明 |
|----------|-----|------|
| カラム詳細 | `erd-designer://documents/{documentId}/columns/{columnId}` | 特定カラム取得 |

##### カラム詳細
**レスポンス形式:**
- `uri`: カラム詳細のURI (`erd-designer://documents/{documentId}/columns/{columnId}` 形式)
- `columnId`: カラムID
- `columnShare`: 共有カラムモデルのオブジェクト
  - `uri`: 共有カラムモデルのURI (`erd-designer://documents/{documentId}/column_shares/{columnShareId}` 形式)
  - `columnShareId`: 共有カラムモデルID（型定義の参照先）
- `overrideName`: 個別定義されたカラム名のオブジェクト。未定義の場合は null
  - `physical`: 個別定義された物理名。未定義の場合は返却されない
  - `logical`: 個別定義された論理名。未定義の場合は返却されない
- `primaryKey`: 主キーであるか
- `notNull`: NOT NULL 制約があるか
- `unique`: UNIQUE 制約があるか
- `autoIncrement`: 自動インクリメントが有効か
- `defaultValue`: デフォルト値

#### 4.1.5 共有カラムモデル管理

| Resource | URI | 説明 |
|----------|-----|------|
| 共有カラムモデル一覧 | `erd-designer://documents/{documentId}/column_shares` | 全共有カラムモデル取得 |
| 共有カラムモデル一覧（絞り込み） | `erd-designer://documents/{documentId}/column_shares?columnName.physical.contains={文字列}&columnName.logical.contains={文字列}&columnTypeId={columnTypeId}` | 条件に一致する共有カラムモデル取得 |
| 共有カラムモデル詳細 | `erd-designer://documents/{documentId}/column_shares/{columnShareId}` | 特定共有カラムモデル取得 |

##### 共有カラムモデル一覧
**クエリパラメータ:**
絞り込み条件を指定可能（すべて任意）

| パラメータ名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `columnName.physical.contains` | string | カラムの物理名に指定文字列を含む（部分一致） | `?columnName.physical.contains=user` |
| `columnName.logical.contains` | string | カラムの論理名に指定文字列を含む（部分一致） | `?columnName.logical.contains=ユーザー` |
| `columnTypeId` | string | 指定したカラム型IDを持つ（完全一致） | `?columnTypeId=type-123` |

**複数条件の指定:**
- 異なるパラメータを複数指定した場合は **AND条件** として処理される
- 同一パラメータを複数指定した場合も **AND条件** として処理される
  - 例: `?columnName.physical.contains=user&columnName.physical.contains=id` → 物理名に "user" **かつ** "id" を含む

**URI例:**
```
# すべての共有カラムモデル
erd-designer://documents/doc123/column_shares

# 物理名に "user" を含む
erd-designer://documents/doc123/column_shares?columnName.physical.contains=user

# 論理名に "ユーザー" を含む
erd-designer://documents/doc123/column_shares?columnName.logical.contains=ユーザー

# 特定のカラム型IDを持つ
erd-designer://documents/doc123/column_shares?columnTypeId=type-123

# 複数条件（AND）: 物理名に "user" を含み、かつカラム型IDが一致
erd-designer://documents/doc123/column_shares?columnName.physical.contains=user&columnTypeId=type-123

# 同一パラメータの複数指定（AND）: 物理名に "user" かつ "id" を含む
erd-designer://documents/doc123/column_shares?columnName.physical.contains=user&columnName.physical.contains=id

# 物理名と論理名の両方で絞り込み
erd-designer://documents/doc123/column_shares?columnName.physical.contains=user&columnName.logical.contains=ユーザー
```

**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: 共有カラムモデルのURI (`erd-designer://documents/{documentId}/column_shares/{columnShareId}` 形式)
- `columnShareId`: 共有カラムモデルID
- `columnName`: カラム名の物理名と論理名を含むオブジェクト
  - `physical`: 物理名
  - `logical`: 論理名
- `columnType`: データ型
  - `uri`: データ型URI - `uri`: 共有カラムモデルのURI (`erd-designer://documents/{documentId}/column_types/{columnTypeId}` 形式)
  - `columnTypeId`: データ型ID
  - `columnTypeName`: データ型の名称
  - `baseExpression`: 通常のデータ型表現
  - `inChildExpression`: 外部キーとして指定された場合のデータ型表現
- `precision`: 精度（サポートされる型のみ）
- `scale`: スケール（サポートされる型のみ）
- `unsigned`: 符号なし指定があるか（サポートされる型のみ）
- `isArray`: 配列型であるか
- `description`: カラムの説明

##### 共有カラムモデル詳細
**レスポンス形式:**
- `uri`: 共有カラムモデルのURI (`erd-designer://documents/{documentId}/column_shares/{columnShareId}` 形式)
- `columnShareId`: 共有カラムモデルID
- `columnName`: カラム名の物理名と論理名を含むオブジェクト
  - `physical`: 物理名
  - `logical`: 論理名
- `columnType`: データ型
  - `uri`: データ型URI - `uri`: 共有カラムモデルのURI (`erd-designer://documents/{documentId}/column_types/{columnTypeId}` 形式)
  - `columnTypeId`: データ型ID
  - `columnTypeName`: データ型の名称
  - `baseExpression`: 通常のデータ型表現
  - `inChildExpression`: 外部キーとして指定された場合のデータ型表現
- `precision`: 精度（サポートされる型のみ）
- `scale`: スケール（サポートされる型のみ）
- `unsigned`: 符号なし指定があるか（サポートされる型のみ）
- `isArray`: 配列型であるか
- `description`: カラムの説明

#### 4.1.6 カラム型管理

| Resource | URI | 説明 |
|----------|-----|------|
| カラム型一覧 | `erd-designer://documents/{documentId}/column_types/` | データベースで利用可能なカラム型の一覧を取得 |
| カラム型詳細| `erd-designer://documents/{documentId}/column_types/{columnTypeId}` | 特定のカラム型の詳細情報を取得 |

##### カラム型一覧
**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: カラム型詳細のURI (`erd-designer://documents/{documentId}/column_types/{columnTypeId}` 形式)
- `columnTypeId`: カラム型ID
- `columnTypeName`: カラム型の名称
- `withPrecision`: 精度指定のサポート有無
- `withScale`: スケール指定のサポート有無
- `withUnsigned`: 符号なし指定のサポート有無
- `baseExpression`: 通常のデータ型表現
- `inChildExpression`: 外部キーとして指定された場合のデータ型表現
- `description`: カラム型の説明
- `defaultValueCandidates`: デフォルト値として指定可能な式

##### カラム型詳細
**レスポンス形式:**
- `uri`: カラム型詳細のURI (`erd-designer://documents/{documentId}/column_types/{columnTypeId}` 形式)
- `columnTypeId`: カラム型ID
- `columnTypeName`: カラム型の名称
- `withPrecision`: 精度指定のサポート有無
- `withScale`: スケール指定のサポート有無
- `withUnsigned`: 符号なし指定のサポート有無
- `baseExpression`: 通常のデータ型表現
- `inChildExpression`: 外部キーとして指定された場合のデータ型表現
- `description`: カラム型の説明
- `defaultValueCandidates`: デフォルト値として指定可能な式


#### 4.1.7 リレーション管理

| Resource | URI | 説明 |
|----------|-----|------|
| リレーション一覧 | `erd-designer://documents/{documentId}/relations` | 全リレーション取得 |
| リレーション一覧（絞り込み） | `erd-designer://documents/{documentId}/relations?parentTableId={parentTableId}&childTableId={childTableId}&relationName.contains={文字列}` | 条件に一致するリレーション取得 |
| リレーション詳細 | `erd-designer://documents/{documentId}/relations/{relationId}` | 特定リレーション取得 |

##### リレーション一覧
**クエリパラメータ:**
絞り込み条件を指定可能（すべて任意）

| パラメータ名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `parentTableId` | string | 親テーブルIDが一致するリレーション（完全一致） | `?parentTableId=table-123` |
| `childTableId` | string | 子テーブルIDが一致するリレーション（完全一致） | `?childTableId=table-456` |
| `relationName.contains` | string | リレーション名に指定文字列を含む（部分一致） | `?relationName.contains=user` |

**複数条件の指定:**
- 異なるパラメータを複数指定した場合は **AND条件** として処理される
- 同一パラメータを複数指定した場合も **AND条件** として処理される
  - 例: `?parentTableId=table-123&parentTableId=table-456` → 両方の親テーブルIDを持つリレーション（通常は空配列）
  - 例: `?relationName.contains=user&relationName.contains=order` → リレーション名に "user" **かつ** "order" を含む

**URI例:**
```
# すべてのリレーション
erd-designer://documents/doc123/relations

# 特定の親テーブルIDを持つリレーション
erd-designer://documents/doc123/relations?parentTableId=table-123

# 特定の子テーブルIDを持つリレーション
erd-designer://documents/doc123/relations?childTableId=table-456

# リレーション名に "user" を含む
erd-designer://documents/doc123/relations?relationName.contains=user

# 複数条件（AND）: 親テーブルIDが一致し、かつリレーション名に "fk" を含む
erd-designer://documents/doc123/relations?parentTableId=table-123&relationName.contains=fk

# 複数条件（AND）: 親テーブルIDと子テーブルIDが両方一致
erd-designer://documents/doc123/relations?parentTableId=table-123&childTableId=table-456

# 同一パラメータの複数指定（AND）: リレーション名に "user" かつ "order" を含む
erd-designer://documents/doc123/relations?relationName.contains=user&relationName.contains=order
```

**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: リレーションのURI (`erd-designer://documents/{documentId}/relations/{relationId}` 形式)
- `relationId`: リレーションID
- `relationName`: リレーション名
- `parentTableId`: 親テーブルID
- `parentCardinality`: 親側のカーディナリティ ("1", "0..1", "0..N", "1..N")
- `childTableId`: 子テーブルID
- `childCardinality`: 子側のカーディナリティ ("1", "0..1", "0..N", "1..N")
- `relationPairs`: カラムペア配列、各要素に以下を含む
  - `parentColumnId`: 親カラムID
  - `childColumnId`: 子カラムID
- `onUpdateAction`: 更新時の参照動作 ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT")
- `onDeleteAction`: 削除時の参照動作 ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT")
- `view`: 表示設定オブジェクト
  - `lineType`: 線の種類 ("points", "orthogonal")
  - `edges`: lineType が "points" の場合のみ、配列が指定される。各要素に以下を含む
    - `x`: x 座標
    - `y`: y 座標
  - `lines`: lineType が "orthogonal" の場合のみ、配列が指定される。各要素に以下を含む
    - `direction`: 線分の方向 ("horizontal", "vertical")
    - `position`: 座標

##### リレーション詳細
**レスポンス形式:**
- `uri`: リレーションのURI (`erd-designer://documents/{documentId}/relations/{relationId}` 形式)
- `relationId`: リレーションID
- `relationName`: リレーション名
- `parentTableId`: 親テーブルID
- `parentCardinality`: 親側のカーディナリティ ("1", "0..1", "0..N", "1..N")
- `childTableId`: 子テーブルID
- `childCardinality`: 子側のカーディナリティ ("1", "0..1", "0..N", "1..N")
- `relationPairs`: カラムペア配列、各要素に以下を含む
  - `parentColumnId`: 親カラムID
  - `childColumnId`: 子カラムID
- `onUpdateAction`: 更新時の参照動作 ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT")
- `onDeleteAction`: 削除時の参照動作 ("RESTRICT", "SET NULL", "CASCADE", "NO ACTION", "SET DEFAULT")
- `view`: 表示設定オブジェクト
  - `lineType`: 線の種類 ("points", "orthogonal")
  - `edges`: lineType が "points" の場合のみ、配列が指定される。各要素に以下を含む
    - `x`: x 座標
    - `y`: y 座標
  - `lines`: lineType が "orthogonal" の場合のみ、配列が指定される。各要素に以下を含む
    - `direction`: 線分の方向 ("horizontal", "vertical")
    - `position`: 座標

#### 4.1.8 メモ管理

| Resource | URI | 説明 |
|----------|-----|------|
| メモ一覧 | `erd-designer://documents/{documentId}/memos` | 全メモ取得 |
| メモ詳細 | `erd-designer://documents/{documentId}/memos/{memoId}` | 特定メモ取得 |

##### メモ一覧
**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: メモのURI (`erd-designer://documents/{documentId}/memos/{memoId}` 形式)
- `memoId`: メモID
- `memo`: メモのテキスト内容
- `view`: 表示設定オブジェクト
  - `position`: ERD上の位置 (x, y 座標)
  - `size`: メモのサイズ (width, height)
  - `color`: 背景色と前景色 (16進数形式)
  - `font`: フォント表示設定オブジェクト
    - `verticalAlign`: 垂直配置 ("start", "center", "end")
    - `horizontalAlign`: 水平配置 ("start", "center", "end")
    - `fontSize`: フォントサイズ

##### メモ詳細
**レスポンス形式:**
- `uri`: メモのURI (`erd-designer://documents/{documentId}/memos/{memoId}` 形式)
- `memoId`: メモID
- `memo`: メモのテキスト内容
- `view`: 表示設定オブジェクト
  - `position`: ERD上の位置 (x, y 座標)
  - `size`: メモのサイズ (width, height)
  - `color`: 背景色と前景色 (16進数形式)
  - `font`: フォント表示設定オブジェクト
    - `verticalAlign`: 垂直配置 ("start", "center", "end")
    - `horizontalAlign`: 水平配置 ("start", "center", "end")
    - `fontSize`: フォントサイズ

#### 4.1.9 カラムグループ管理

| Resource | URI | 説明 |
|----------|-----|------|
| カラムグループ一覧 | `erd-designer://documents/{documentId}/column_groups` | 全カラムグループ取得 |
| カラムグループ一覧（絞り込み） | `erd-designer://documents/{documentId}/column_groups?columnId={columnId}` | 条件に一致するカラムグループ取得 |
| カラムグループ詳細 | `erd-designer://documents/{documentId}/column_groups/{columnGroupId}` | 特定カラムグループ取得 |

##### カラムグループ一覧
**クエリパラメータ:**
絞り込み条件を指定可能（すべて任意）

| パラメータ名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `columnId` | string | 指定したカラムIDを含むカラムグループ（完全一致） | `?columnId=abc-123-def-456` |

**複数条件の指定:**
- 同一パラメータを複数指定した場合は **AND条件** として処理される
  - 例: `?columnId=abc-123&columnId=def-456` → 両方のカラムIDを含むカラムグループ

**URI例:**
```
# すべてのカラムグループ
erd-designer://documents/doc123/column_groups

# 特定のカラムIDを含むカラムグループ
erd-designer://documents/doc123/column_groups?columnId=abc-123-def-456

# 同一パラメータの複数指定（AND）: 指定した複数のカラムIDをすべて含むカラムグループ
erd-designer://documents/doc123/column_groups?columnId=abc-123&columnId=def-456
```

**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: カラムグループのURI (`erd-designer://documents/{documentId}/column_groups/{columnGroupId}` 形式)
- `columnGroupId`: カラムグループID
- `groupName`: グループ名
- `columns`: グループに含まれるカラム情報の配列。各要素に以下を含む
  - `uri`: カラム詳細のURI (`erd-designer://documents/{documentId}/columns/{columnId}` 形式)
  - `columnId`: カラムID
- `description`: グループの説明

##### カラムグループ詳細
**レスポンス形式:**
- `uri`: カラムグループのURI (`erd-designer://documents/{documentId}/column_groups/{columnGroupId}` 形式)
- `columnGroupId`: カラムグループID
- `groupName`: グループ名
- `columns`: グループに含まれるカラム情報の配列。各要素に以下を含む
  - `uri`: カラム詳細のURI (`erd-designer://documents/{documentId}/columns/{columnId}` 形式)
  - `columnId`: カラムID
  - `columnShare`: 共有カラムモデルのオブジェクト
    - `uri`: 共有カラムモデルのURI (`erd-designer://documents/{documentId}/column_shares/{columnShareId}` 形式)
    - `columnShareId`: 共有カラムモデルID（型定義の参照先）
  - `overrideName`: 個別定義されたカラム名のオブジェクト。未定義の場合は null
    - `physical`: 個別定義された物理名。未定義の場合は返却されない
    - `logical`: 個別定義された論理名。未定義の場合は返却されない
  - `primaryKey`: 主キーであるか
  - `notNull`: NOT NULL 制約があるか
  - `unique`: UNIQUE 制約があるか
  - `autoIncrement`: 自動インクリメントが有効か
  - `defaultValue`: デフォルト値
- `description`: グループの説明

#### 4.1.10 スキーマ管理

| Resource | URI | 説明 |
|----------|-----|------|
| スキーマ一覧 | `erd-designer://documents/{documentId}/schemas` | 全スキーマ取得 (DB依存) |
| スキーマ詳細 | `erd-designer://documents/{documentId}/schemas/{schemaId}` | 特定スキーマ取得 |

##### スキーマ一覧
**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: スキーマのURI (`erd-designer://documents/{documentId}/schemas/{schemaId}` 形式)
- `schemaId`: スキーマID
- `schemaName`: スキーマ名
- `description`: スキーマの説明
- `default`: デフォルトスキーマ指定されている場合に true

##### スキーマ詳細
**レスポンス形式:**
- `uri`: スキーマのURI (`erd-designer://documents/{documentId}/schemas/{schemaId}` 形式)
- `schemaId`: スキーマID
- `schemaName`: スキーマ名
- `tables`: スキーマに属するテーブル情報の配列。各要素に以下を含む
  - `uri`: テーブル詳細のURI (`erd-designer://documents/{documentId}/tables/{tableId}` 形式)
  - `tableId`: テーブルID
  - `tableName`: 物理名と論理名を含むオブジェクト
- `description`: スキーマの説明
- `default`: デフォルトスキーマ指定されている場合に true

#### 4.1.11 Perspective 管理

| Resource | URI | 説明 |
|----------|-----|------|
| Perspective一覧 | `erd-designer://documents/{documentId}/perspectives` | 全Perspective取得 |
| Perspective詳細 | `erd-designer://documents/{documentId}/perspectives/{perspectiveId}` | 特定Perspective取得 |

##### Perspective一覧
**レスポンス形式:**
以下のオブジェクトを配列形式で返却
- `uri`: Perspective詳細のURI (`erd-designer://documents/{documentId}/perspectives/{perspectiveId}` 形式)
- `perspectiveId`: PerspectiveID
- `perspectiveName`: Perspective名
- `description`: Perspectiveの説明
- `containIds`: このPerspectiveに含まれるテーブルIDとメモIDの配列

##### Perspective詳細
**レスポンス形式:**
- `uri`: Perspective詳細のURI (`erd-designer://documents/{documentId}/perspectives/{perspectiveId}` 形式)
- `perspectiveId`: PerspectiveID
- `perspectiveName`: Perspective名
- `description`: Perspectiveの説明
- `containIds`: このPerspectiveに含まれるテーブルIDとメモIDの配列

### 4.2 操作ツール (Tools)

#### 4.2.1 ドキュメント操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| update-document | ドキュメント更新 | documentId, document | document (詳細) |
| export-ddl | DDL生成 | documentId, exportDdlSetting | ddl (text) |

**出力形式:**
- `update-document`: 更新されたドキュメント情報（`erd-designer://documents/{documentId}` のResource内容と同一）

**update-document 入力パラメータ:**
```typescript
{
  documentId: string;                                   // ドキュメントID（必須）
  document: {                                           // 更新内容（すべて任意）
    documentName?: string;                              // ドキュメント名
    displayStyle?: "both" | "physical" | "logical";     // 表示スタイル
  };
}
```

**export-ddl 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  exportDdlSetting: {                      // DDLエクスポート設定
    fileName?: string;                     // 出力ファイル名
    withTable?: boolean;                   // CREATE TABLE文
    withIndex?: boolean;                   // CREATE INDEX文
    withForeignKey?: boolean;              // FOREIGN KEY制約
    withComment?: boolean;                 // COMMENT文
    withSchema?: boolean;                  // CREATE SCHEMA文
  };
}
```

#### 4.2.2 テーブル基本操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-table | テーブル作成（基本情報のみ） | documentId, table | table (詳細) |
| update-table | テーブル基本情報更新 | documentId, tableId, table | table (詳細) |
| delete-table | テーブル削除 | documentId, tableId | success |
| move-table | テーブル移動 | documentId, tableIds, moveTo | tables (詳細配列) |
| update-table-color | テーブル色変更 | documentId, tableIds, color | tables (詳細配列) |

**出力形式:**
- `create-table`, `update-table`: 作成/更新されたテーブル情報（`erd-designer://documents/{documentId}/tables/{tableId}` のResource内容と同一）
- `move-table`, `update-table-color`: 更新されたテーブル情報の配列（各要素は `erd-designer://documents/{documentId}/tables/{tableId}` のResource内容と同一）
- `delete-table`: `{ success: true }`

**create-table 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  table: {                                 // テーブル情報
    tableName: {                           // テーブル名（必須）
      physical: string;                    // 物理名（必須）
      logical?: string;                    // 論理名（省略時は物理名と同じ）
    };
    schemaId?: string;                     // スキーマID（DBがスキーマをサポートする場合）
    description?: string;                  // テーブルの説明
  };
}
```

**update-table 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  tableId: string;                         // テーブルID（必須）
  table: {                                 // 更新内容（すべて任意）
    tableName?: {                          // テーブル名
      physical?: string;                   // 物理名
      logical?: string;                    // 論理名
    };
    schemaId?: string;                     // スキーマID
    description?: string;                  // テーブルの説明
  };
}
```

**move-table 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  tableIds: string[];                      // テーブルIDの配列（必須）
  moveTo: {                                // 移動先（必須）
    type: "absolute" | "relative";         // 移動タイプ（必須）
    x: number;                             // X座標（必須）
    y: number;                             // Y座標（必須）
  };
}
```

**moveTo の type による動作:**
- `"absolute"`: 絶対位置への移動。x, y の値がERD上の絶対座標として使用されます
- `"relative"`: 相対位置への移動。現在位置から x, y の値だけ移動します（正の値で右下、負の値で左上）

**使用例:**
```typescript
// 単一テーブルを絶対位置 (100, 200) へ移動
{
  documentId: "doc-123",
  tableIds: ["table-456"],
  moveTo: {
    type: "absolute",
    x: 100,
    y: 200
  }
}

// 複数テーブルを現在位置から右に50、下に30移動
{
  documentId: "doc-123",
  tableIds: ["table-456", "table-789", "table-012"],
  moveTo: {
    type: "relative",
    x: 50,
    y: 30
  }
}

// 現在位置から左に20、上に40移動
{
  documentId: "doc-123",
  tableIds: ["table-456"],
  moveTo: {
    type: "relative",
    x: -20,
    y: -40
  }
}
```

**update-table-color 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  tableIds: string[];                      // テーブルIDの配列（必須）
  color: {                                 // 色設定（必須）
    background: string;                    // 背景色（16進数形式: "#RRGGBB"）
    foreground: string;                    // 前景色（16進数形式: "#RRGGBB"）
  };
}
```

**使用例:**
```typescript
// 単一テーブルの色を変更
{
  documentId: "doc-123",
  tableIds: ["table-456"],
  color: {
    background: "#E3F2FD",
    foreground: "#1976D2"
  }
}

// 複数テーブルの色を一度に変更
{
  documentId: "doc-123",
  tableIds: ["table-456", "table-789", "table-012"],
  color: {
    background: "#FFF3E0",
    foreground: "#E65100"
  }
}
```

#### 4.2.3 テーブルのカラム操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| add-column-to-table | テーブルにカラム追加 | documentId, tableId, columns | table (詳細) |
| update-column | カラム更新 | documentId, columnId, column | column (詳細) |
| remove-column-from-table | テーブルからカラム削除 | documentId, tableId, columnIds | table (詳細) |
| reorder-table-columns | カラムの順序変更 | documentId, tableId, columnIds | success |

**出力形式:**
- `add-column-to-table`, `remove-column-from-table`: 更新されたテーブル情報（`erd-designer://documents/{documentId}/tables/{tableId}` のResource内容と同一）
- `update-column`: 更新されたカラム情報（`erd-designer://documents/{documentId}/columns/{columnId}` のResource内容と同一）
- `reorder-table-columns`: `{ success: true }`

**add-column-to-table 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  tableId: string;                         // テーブルID（必須）
  columns: {                               // 追加するカラムの配列
    column: {
      // パターン1: 既存の共有カラムモデルを使用
      columnShareId: string;                 // 共有カラムモデルID（必須）
      overrideName?: {                       // 名前を上書きする場合
        physical?: string;
        logical?: string;
      };
      primaryKey?: boolean;                  // 主キー（デフォルト: false）
      notNull?: boolean;                     // NOT NULL（デフォルト: false）
      unique?: boolean;                      // UNIQUE（デフォルト: false）
      autoIncrement?: boolean;               // 自動インクリメント（デフォルト: false）
      defaultValue?: string;                 // デフォルト値
    } | {
      // パターン2: 新規の共有カラムモデルを作成して使用
      columnShare: {                         // 共有カラムモデル定義（必須）
        columnName: {
          physical: string;                  // 物理名（必須）
          logical?: string;                  // 論理名（省略時は物理名と同じ）
        };
        columnTypeId: string;                // カラム型ID（データベース情報から取得）
        precision?: string;                  // 精度（型がサポートする場合）
        scale?: string;                      // スケール（型がサポートする場合）
        unsigned?: boolean;                  // 符号なし（型がサポートする場合）
        isArray?: boolean;                   // 配列型（DBがサポートする場合）
        description?: string;                // カラムの説明
      };
      overrideName?: {                       // 名前を上書きする場合
        physical?: string;
        logical?: string;
      };
      primaryKey?: boolean;                  // 主キー（デフォルト: false）
      notNull?: boolean;                     // NOT NULL（デフォルト: false）
      unique?: boolean;                      // UNIQUE（デフォルト: false）
      autoIncrement?: boolean;               // 自動インクリメント（デフォルト: false）
      defaultValue?: string;                 // デフォルト値
    };
    insertIndex?: number;                    // 挿入位置のインデックス（省略時は末尾に追加）
  }[]
}
```

**insertIndex の動作:**
- **省略時**: カラムリストの末尾に追加されます
- **0**: 先頭（index=0）の位置に挿入されます
- **正の値**: 指定されたインデックス位置に挿入されます。既存のカラムは後ろにシフトされます
- **負の値**: 0とみなされ、先頭に挿入されます
- **配列長以上の値**: 末尾に追加されます

**使用例:**
```typescript
// 既存の共有カラムモデルを使用して末尾に追加
{
  documentId: "doc-123",
  tableId: "table-456",
  columns: [
    {
      column: {
        columnShareId: "colshare-789",
        primaryKey: true,
        notNull: true
      }
    }
  ]
}

// 新規の共有カラムモデルを作成して先頭に挿入
{
  documentId: "doc-123",
  tableId: "table-456",
  columns: [
    {
      column: {
        columnShare: {
          columnName: {
            physical: "id",
            logical: "ID"
          },
          columnTypeId: "bigint"
        },
        primaryKey: true,
        autoIncrement: true
      },
      insertIndex: 0
    }
  ]
}

// 複数カラムを一度に追加（異なる位置に挿入）
{
  documentId: "doc-123",
  tableId: "table-456",
  columns: [
    {
      column: {
        columnShareId: "colshare-111",
        primaryKey: true
      },
      insertIndex: 0  // 先頭に挿入
    },
    {
      column: {
        columnShareId: "colshare-999",
        notNull: true,
        defaultValue: "CURRENT_TIMESTAMP"
      },
      insertIndex: 2  // index=2の位置に挿入
    }
  ]
}
```

**update-column 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  columnId: string;                        // カラムID（必須）
  column: {
    // パターン1: 既存の共有カラムモデルに変更
    columnShareId: string;                 // 共有カラムモデルID（必須）
    overrideName?: {                       // 名前の上書き変更
      physical?: string;
      logical?: string;
    };
    primaryKey?: boolean;                  // 主キー
    notNull?: boolean;                     // NOT NULL
    unique?: boolean;                      // UNIQUE
    autoIncrement?: boolean;               // 自動インクリメント
    defaultValue?: string;                 // デフォルト値
  } | {
    // パターン2: 新規の共有カラムモデルを作成して使用
    columnShare: {                         // 共有カラムモデル定義（必須）
      columnName: {
        physical: string;                  // 物理名（必須）
        logical?: string;                  // 論理名（省略時は物理名と同じ）
      };
      columnTypeId: string;                // カラム型ID（データベース情報から取得）
      precision?: string;                  // 精度（型がサポートする場合）
      scale?: string;                      // スケール（型がサポートする場合）
      unsigned?: boolean;                  // 符号なし（型がサポートする場合）
      isArray?: boolean;                   // 配列型（DBがサポートする場合）
      description?: string;                // カラムの説明
    };
    overrideName?: {                       // 名前の上書き変更
      physical?: string;
      logical?: string;
    };
    primaryKey?: boolean;                  // 主キー
    notNull?: boolean;                     // NOT NULL
    unique?: boolean;                      // UNIQUE
    autoIncrement?: boolean;               // 自動インクリメント
    defaultValue?: string;                 // デフォルト値
  } | {
    // パターン3: カラム属性のみ変更（共有カラムモデルは変更しない）
    overrideName?: {                       // 名前の上書き変更
      physical?: string;
      logical?: string;
    };
    primaryKey?: boolean;                  // 主キー
    notNull?: boolean;                     // NOT NULL
    unique?: boolean;                      // UNIQUE
    autoIncrement?: boolean;               // 自動インクリメント
    defaultValue?: string;                 // デフォルト値
  };
}
```

**使用例:**
```typescript
// カラムの制約のみを変更（共有カラムモデルは変更しない）
{
  documentId: "doc-123",
  columnId: "column-456",
  column: {
    notNull: true,
    defaultValue: "0"
  }
}

// 既存の共有カラムモデルに変更
{
  documentId: "doc-123",
  columnId: "column-456",
  column: {
    columnShareId: "colshare-999",
    notNull: true
  }
}

// 新規の共有カラムモデルを作成して変更
{
  documentId: "doc-123",
  columnId: "column-456",
  column: {
    columnShare: {
      columnName: {
        physical: "updated_at",
        logical: "更新日時"
      },
      columnTypeId: "timestamp"
    },
    notNull: true,
    defaultValue: "CURRENT_TIMESTAMP"
  }
}

// 名前を上書き
{
  documentId: "doc-123",
  columnId: "column-456",
  column: {
    overrideName: {
      physical: "user_id",
      logical: "ユーザーID"
    }
  }
}
```

**注意事項:**
- `columnShareId` と `columnShare` は排他的です。どちらか一方のみを指定してください
- `columnShare` で新規の共有カラムモデルを作成した場合、そのモデルは他のテーブルでも再利用可能になります
- カラムが参照している共有カラムモデル自体を変更したい場合は `update-column-share` を使用してください
- `columnShareId` または `columnShare` を指定すると、カラムが参照する型定義が完全に変更されます
- 主キーを変更する場合、テーブルに既に主キーが存在する場合はエラーになる可能性があります

**remove-column-from-table 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  tableId: string;                         // テーブルID（必須）
  columnIds: string[];                     // 削除するカラムIDの配列（必須）
}
```

**使用例:**
```typescript
// 単一のカラムを削除
{
  documentId: "doc-123",
  tableId: "table-456",
  columnIds: ["column-789"]
}

// 複数のカラムを一度に削除
{
  documentId: "doc-123",
  tableId: "table-456",
  columnIds: ["column-111", "column-222", "column-333"]
}
```

**reorder-table-columns 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  tableId: string;                         // テーブルID
  columnIds: string[];                     // 新しい順序のカラムID配列
}
```

**注意事項:**
- `add-column-to-table` は複数のカラムを一度に追加できます。各カラムに個別の `insertIndex` を指定可能です
- `remove-column-from-table` は複数のカラムを一度に削除できます
- `add-column-to-table` で新規の共有カラムモデル（`columnShare`）を作成した場合、そのカラムモデルは他のテーブルでも再利用可能になります
- `columnShareId` と `columnShare` は排他的です。どちらか一方のみを指定してください
- カラム削除時、そのカラムを参照しているリレーションがある場合はエラーになります
- カラム削除時、そのカラムが一意キー制約やインデックスに含まれている場合、その制約/インデックスも自動的に削除されます

#### 4.2.4 テーブルの制約・インデックス操作

##### 一意キー制約操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| add-unique-constraint | 一意キー制約追加 | documentId, tableId, uniqueConstraint | table (詳細) |
| update-unique-constraint | 一意キー制約更新 | documentId, tableId, uniqueConstraintId, uniqueConstraint | table (詳細) |
| delete-unique-constraint | 一意キー制約削除 | documentId, tableId, uniqueConstraintIds | table (詳細) |

**出力形式:**
- `add-unique-constraint`, `update-unique-constraint`, `delete-unique-constraint`: 更新されたテーブル情報（`erd-designer://documents/{documentId}/tables/{tableId}` のResource内容と同一）

**add-unique-constraint 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  tableId: string;                         // テーブルID
  uniqueConstraints: Array<{
    uniqueConstraint: {
      constraintName?: string;             // 制約名（省略時は自動生成）
      uniqueKeys: Array<{                  // 制約を構成するカラム
        columnId: string;                  // カラムID
        order?: "ASC" | "DESC" | "";       // ソート順（DBがサポートする場合）
      }>;
      description?: string;                // 制約の説明
    };
    insertIndex?: number;                  // 挿入位置のインデックス（省略時は末尾に追加）
  }>;
}
```

**update-unique-constraint 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  tableId: string;                         // テーブルID
  uniqueConstraintId: string;              // 制約ID
  uniqueConstraint: {
    constraintName?: string;               // 制約名
    uniqueKeys?: Array<{                   // 制約を構成するカラム
      columnId: string;
      order?: "ASC" | "DESC" | "";
    }>;
    description?: string;                  // 制約の説明
  };
}
```

**delete-unique-constraint 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  tableId: string;                         // テーブルID
  uniqueConstraintIds: string[];           // 制約IDの配列
}
```

##### インデックス操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| add-table-index | インデックス追加 | documentId, tableId, index | table (詳細) |
| update-table-index | インデックス更新 | documentId, tableId, indexId, index | table (詳細) |
| delete-table-index | インデックス削除 | documentId, tableId, indexId | table (詳細) |

**出力形式:**
- `add-table-index`, `update-table-index`, `delete-table-index`: 更新されたテーブル情報（`erd-designer://documents/{documentId}/tables/{tableId}` のResource内容と同一）

**add-table-index 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  tableId: string;                         // テーブルID
  tableIndexes: Array<{
    tableIndex: {
      indexName?: string;                    // インデックス名（省略時は自動生成）
      indexColumns: Array<{                  // インデックスを構成するカラム
        columnId: string;                    // カラムID
        order?: "ASC" | "DESC" | "";         // ソート順（デフォルト: ASC）
        nullsOrder?: "FIRST" | "LAST" | "";  // NULL値の順序（DBがサポートする場合）
      }>;
      indexOption?: "UNIQUE" | "FULLTEXT" | "SPATIAL" | "";  // インデックスオプション（DBがサポートする場合）
      indexType?: "BTREE" | "HASH" | "GIST" | "SPGIST" | "GIN" | "BRIN" | "";  // インデックスタイプ（DBがサポートする場合）
      clustered?: boolean;                   // クラスター化インデックス（MS SQL Serverのみ）
      description?: string;                  // インデックスの説明
    };
    insertIndex?: number;                  // 挿入位置のインデックス（省略時は末尾に追加）
  }>;
}
```

**update-table-index 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  tableId: string;                         // テーブルID
  tableIndexId: string;                    // インデックスID
  tableIndex: {
    indexName?: string;                    // インデックス名
    indexColumns?: Array<{                 // インデックスを構成するカラム
      columnId: string;
      order?: "ASC" | "DESC" | "";
      nullsOrder?: "FIRST" | "LAST" | "";
    }>;
    indexOption?: "UNIQUE" | "FULLTEXT" | "SPATIAL" | "";
    indexType?: "BTREE" | "HASH" | "GIST" | "SPGIST" | "GIN" | "BRIN" | "";
    clustered?: boolean;
    description?: string;
  };
}
```

**注意事項:**
- 一意キー制約やインデックスに指定するカラムは、そのテーブルに属するカラムである必要があります
- データベースがサポートしていない機能（例: MySQLでのnullsOrder）を指定した場合はエラーになります
- 制約名やインデックス名を省略した場合、`uk_{table}_{columns}` や `idx_{table}_{columns}` の形式で自動生成されます

#### 4.2.5 共有カラムモデル操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-column-share | 共有カラムモデル作成 | documentId, columnShare | columnShare (詳細) |
| update-column-share | 共有カラムモデル更新 | documentId, columnShareId, columnShare | columnShare (詳細) |

**出力形式:**
- `create-column-share`, `update-column-share`: 作成/更新された共有カラムモデル情報（`erd-designer://documents/{documentId}/column_shares/{columnShareId}` のResource内容と同一）

**create-column-share 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID
  columnShare: {
    columnName: {
      physical: string;                    // 物理名（必須）
      logical?: string;                    // 論理名（省略時は物理名と同じ）
    };
    columnTypeId: string;                  // カラム型ID（データベース情報から取得）
    precision?: string;                    // 精度（型がサポートする場合）
    scale?: string;                        // スケール（型がサポートする場合）
    unsigned?: boolean;                    // 符号なし（型がサポートする場合）
    isArray?: boolean;                     // 配列型（DBがサポートする場合）
    description?: string;                  // カラムの説明
  };
}
```

**update-column-share 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  columnShareId: string;                   // 共有カラムモデルID（必須）
  columnShare: {                           // 更新内容（すべて任意）
    columnName?: {                         // カラム名
      physical?: string;
      logical?: string;
    };
    columnTypeId?: string;                 // カラム型ID
    precision?: string;
    scale?: string;
    unsigned?: boolean;
    isArray?: boolean;
    description?: string;
  };
}
```

**注意事項:**
- 共有カラムモデルを更新すると、それを参照しているすべてのカラムに影響します

#### 4.2.6 リレーション操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-relation | リレーション作成 | documentId, relation | relation (詳細) |
| update-relation | リレーション更新 | documentId, relationId, relation | relation (詳細) |
| delete-relation | リレーション削除 | documentId, relationId | success |

**出力形式:**
- `create-relation`, `update-relation`: 作成/更新されたリレーション情報（`erd-designer://documents/{documentId}/relations/{relationId}` のResource内容と同一）
- `delete-relation`: `{ success: true }`

**create-relation 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  relation: {                              // リレーション情報
    relationName?: string;                 // リレーション名（省略時は自動生成）
    parentTableId: string;                 // 親テーブルID（必須）
    parentCardinality: "1" | "0..1" | "0..N" | "1..N";  // 親側カーディナリティ（必須）
    childTableId: string;                  // 子テーブルID（必須）
    childCardinality: "1" | "0..1" | "0..N" | "1..N";   // 子側カーディナリティ（必須）
    relationPairs: Array<{                 // カラムペア（必須）
      parentColumnId: string;              // 親カラムID
      childColumnId: string;               // 子カラムID
    }>;
    onUpdateAction?: "RESTRICT" | "SET NULL" | "CASCADE" | "NO ACTION" | "SET DEFAULT";  // 更新時動作
    onDeleteAction?: "RESTRICT" | "SET NULL" | "CASCADE" | "NO ACTION" | "SET DEFAULT";  // 削除時動作
  };
}
```

**update-relation 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  relationId: string;                      // リレーションID（必須）
  relation: {                              // 更新内容（すべて任意）
    relationName?: string;                 // リレーション名
    parentTableId?: string;                // 親テーブルID
    parentCardinality?: "1" | "0..1" | "0..N" | "1..N";  // 親側カーディナリティ
    childTableId?: string;                 // 子テーブルID
    childCardinality?: "1" | "0..1" | "0..N" | "1..N";   // 子側カーディナリティ
    relationPairs?: Array<{                // カラムペア
      parentColumnId: string;
      childColumnId: string;
    }>;
    onUpdateAction?: "RESTRICT" | "SET NULL" | "CASCADE" | "NO ACTION" | "SET DEFAULT";
    onDeleteAction?: "RESTRICT" | "SET NULL" | "CASCADE" | "NO ACTION" | "SET DEFAULT";
  };
}
```

#### 4.2.7 メモ操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-memo | メモ作成 | documentId, memo | memo (詳細) |
| update-memo | メモ更新 | documentId, memoId, memo | memo (詳細) |
| delete-memo | メモ削除 | documentId, memoId | success |
| move-memo | メモ移動 | documentId, memoId, position | memo (詳細) |

**出力形式:**
- `create-memo`, `update-memo`, `move-memo`: 作成/更新されたメモ情報（`erd-designer://documents/{documentId}/memos/{memoId}` のResource内容と同一）
- `delete-memo`: `{ success: true }`

**create-memo 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  memo: {                                  // メモ情報
    memo: string;                          // メモ内容（必須）
    position: {                            // 表示位置
      x: number;
      y: number;
    };
    size?: {                               // サイズ（省略時はデフォルトサイズ）
      width: number;
      height: number;
    };
    color?: {                              // 色設定（省略時はデフォルト色）
      background: string;                  // 背景色
      foreground: string;                  // 前景色
    };
    font?: {                               // フォント設定
      verticalAlign?: "start" | "center" | "end";
      horizontalAlign?: "start" | "center" | "end";
      fontSize?: number;
    };
  };
}
```

**update-memo 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  memoId: string;                          // メモID（必須）
  memo: {                                  // 更新内容（すべて任意）
    memo?: string;                         // メモ内容
    size?: {                               // サイズ
      width: number;
      height: number;
    };
    color?: {                              // 色設定
      background: string;
      foreground: string;
    };
    font?: {                               // フォント設定
      verticalAlign?: "start" | "center" | "end";
      horizontalAlign?: "start" | "center" | "end";
      fontSize?: number;
    };
  };
}
```

**move-memo 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  memoIds: string[];                       // メモIDの配列（必須）
  moveTo: {                                // 移動先（必須）
    type: "absolute" | "relative";         // 移動タイプ（必須）
    x: number;                             // X座標（必須）
    y: number;                             // Y座標（必須）
  };
}
```

#### 4.2.8 カラムグループ操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-column-group | カラムグループ作成 | documentId, columnGroup | columnGroup (詳細) |
| update-column-group | カラムグループ更新 | documentId, columnGroupId, columnGroup | columnGroup (詳細) |
| delete-column-group | カラムグループ削除 | documentId, columnGroupId | success |

**出力形式:**
- `create-column-group`, `update-column-group`: 作成/更新されたカラムグループ情報（`erd-designer://documents/{documentId}/column_groups/{columnGroupId}` のResource内容と同一）
- `delete-column-group`: `{ success: true }`

**create-column-group 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  columnGroup: {                           // カラムグループ情報
    groupName: string;                     // グループ名（必須）
    columnIds: string[];                   // カラムID配列（必須）
    description?: string;                  // グループの説明
  };
}
```

**update-column-group 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  columnGroupId: string;                   // カラムグループID（必須）
  columnGroup: {                           // 更新内容（すべて任意）
    groupName?: string;                    // グループ名
    columnIds?: string[];                  // カラムID配列
    description?: string;                  // グループの説明
  };
}
```

#### 4.2.9 スキーマ操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-schema | スキーマ作成 | documentId, schema | schema (詳細) |
| update-schema | スキーマ更新 | documentId, schemaId, schema | schema (詳細) |
| delete-schema | スキーマ削除 | documentId, schemaId | success |

**出力形式:**
- `create-schema`, `update-schema`: 作成/更新されたスキーマ情報（`erd-designer://documents/{documentId}/schemas/{schemaId}` のResource内容と同一）
- `delete-schema`: `{ success: true }`

**create-schema 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  schema: {                                // スキーマ情報
    schemaName: string;                    // スキーマ名（必須）
    description?: string;                  // スキーマの説明
    default?: boolean;                     // デフォルトスキーマとして設定
  };
}
```

**update-schema 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  schemaId: string;                        // スキーマID（必須）
  schema: {                                // 更新内容（すべて任意）
    schemaName?: string;                   // スキーマ名
    description?: string;                  // スキーマの説明
    default?: boolean;                     // デフォルトスキーマとして設定
  };
}
```

#### 4.2.10 Perspective 操作

| Tool | 説明 | 入力 | 出力 |
|------|------|------|------|
| create-perspective | Perspective作成 | documentId, perspective | perspective (詳細) |
| update-perspective | Perspective更新 | documentId, perspectiveId, perspective | perspective (詳細) |
| delete-perspective | Perspective削除 | documentId, perspectiveId | success |

**出力形式:**
- `create-perspective`, `update-perspective`: 作成/更新されたPerspective情報（`erd-designer://documents/{documentId}/perspectives/{perspectiveId}` のResource内容と同一）
- `delete-perspective`: `{ success: true }`

**create-perspective 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  perspective: {                           // Perspective情報
    perspectiveName: string;               // Perspective名（必須）
    containIds?: string[];                 // 含まれるtableId/memoID配列
    description?: string;                  // Perspectiveの説明
  };
}
```

**update-perspective 入力パラメータ:**
```typescript
{
  documentId: string;                      // ドキュメントID（必須）
  perspectiveId: string;                   // PerspectiveID（必須）
  perspective: {                           // 更新内容（すべて任意）
    perspectiveName?: string;              // Perspective名
    containIds?: string[];                 // 含まれるtableId/memoID配列
    description?: string;                  // Perspectiveの説明
  };
}
```


---

## 10. 参考資料

### 10.1 関連仕様

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [VSCode Extension API](https://code.visualstudio.com/api)

### 10.2 ERD Designer モデル

ERD Designer の内部モデルについては、以下のファイルを参照:

- `src/models/ErdDocument.ts`: ドキュメントモデル
- `src/models/database/TableModel.ts`: テーブルモデル
- `src/models/database/ColumnModel.ts`: カラムモデル
- `src/models/database/ColumnShareModel.ts`: 共有カラムモデル
- `src/models/database/ColumnGroupModel.ts`: カラムグループモデル
- `src/models/database/RelationModel.ts`: リレーションモデル
- `src/models/MemoViewModel.ts`: メモモデル
- `src/models/PerspectiveModel.ts`: Perspectiveモデル

---

## 11. 用語集

| 用語 | 説明 |
|------|------|
| MCP | Model Context Protocol - AI エージェントとアプリケーション間の通信プロトコル |
| Resource | 読み取り専用のデータエンドポイント |
| Tool | 操作を実行する書き込み可能なエンドポイント |
| Prompt | AI エージェントに提供するコンテキスト付きプロンプト |
| Perspective | ERD 上のテーブル/メモをフィルタリングするビュー |
| ColumnGroup | 複数テーブルで再利用可能なカラムの集合 |
| Column | テーブル内の個別カラム定義（ColumnShareModel を参照して型情報を取得） |
| ColumnShareModel | カラムの型定義情報（物理名・論理名・データ型など）。複数の Column で共有可能 |
| DocumentResource | VSCode で開いているドキュメントを管理するコンポーネント |

---

## 12. 変更履歴

| バージョン | 日付 | 変更内容 | 担当者 |
|------------|------|----------|--------|
| 1.0.0 | 2025-11-16 | 要件仕様書初版作成 | - |