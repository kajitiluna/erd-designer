# MCP Server 実装タスク

## テーブル一覧の絞り込み機能

### 概要
テーブル一覧リソース (`erd-designer://documents/{documentId}/tables`) にクエリパラメータによる絞り込み機能を追加する。

### 実装対象ファイル
- `src/extension/mcpserver/tables.ts`

### 要件

#### クエリパラメータ仕様
以下のクエリパラメータをサポートする（すべて任意）：

| パラメータ名 | 型 | 検索タイプ | 説明 |
|------------|-----|----------|------|
| `tableName.physical.contains` | string | 部分一致 | テーブルの物理名に指定文字列を含む |
| `tableName.logical.contains` | string | 部分一致 | テーブルの論理名に指定文字列を含む |
| `columnName.physical.contains` | string | 部分一致 | カラムの物理名に指定文字列を含むカラムを持つテーブル |
| `columnName.logical.contains` | string | 部分一致 | カラムの論理名に指定文字列を含むカラムを持つテーブル |
| `columnId` | string | 完全一致 | 指定したカラムIDを含むテーブル |

**複数条件の扱い:**
- 異なるパラメータを複数指定した場合は **AND条件** として処理する
- 同一パラメータを複数指定した場合も **AND条件** として処理する
  - 例: `?tableName.physical.contains=user&tableName.physical.contains=admin` → 物理名に "user" **かつ** "admin" を含む
  - 例: `?columnId=abc-123&columnId=def-456` → 両方のカラムIDを持つテーブルのみ

#### 実装詳細

1. **クエリパラメータの取得**
   ```typescript
   const tableNamePhysicalContains = url.searchParams.getAll('tableName.physical.contains');
   const tableNameLogicalContains = url.searchParams.getAll('tableName.logical.contains');
   const columnNamePhysicalContains = url.searchParams.getAll('columnName.physical.contains');
   const columnNameLogicalContains = url.searchParams.getAll('columnName.logical.contains');
   const columnIds = url.searchParams.getAll('columnId');
   ```

2. **フィルタリング処理**
   - `tableName.physical.contains`: テーブルの `physicalName` に部分一致
   - `tableName.logical.contains`: テーブルの `logicalName` に部分一致
   - `columnName.physical.contains`: テーブルが持つカラムの `physicalName` に部分一致するカラムが存在する
   - `columnName.logical.contains`: テーブルが持つカラムの `logicalName` に部分一致するカラムが存在する
   - `columnId`: テーブルが指定された `columnModelId` を持つ
   - **AND条件の処理:**
     - 異なるパラメータを複数指定した場合、すべての条件を満たすテーブルのみを返す
     - 同一パラメータを複数指定した場合も、すべての条件を満たすテーブルのみを返す
       - `?tableName.physical.contains=user&tableName.physical.contains=admin` → 物理名に両方の文字列を含むテーブル
       - `?columnId=abc&columnId=def` → 両方のカラムIDを持つテーブル

3. **descriptionList の更新**
   - クエリパラメータの説明を追加

#### テストケース
- [ ] クエリパラメータなしで全テーブルが返却される
- [ ] `tableName.physical.contains` でテーブル物理名による絞り込みができる
- [ ] `tableName.logical.contains` でテーブル論理名による絞り込みができる
- [ ] `columnName.physical.contains` でカラムの物理名による絞り込みができる
- [ ] `columnName.logical.contains` でカラムの論理名による絞り込みができる
- [ ] `columnId` で特定カラムを持つテーブルが取得できる
- [ ] 異なるパラメータの複数指定（AND条件）が正しく動作する
- [ ] 同一パラメータの複数指定（AND条件）が正しく動作する
  - [ ] `tableName.physical.contains` を複数指定した場合、すべての文字列を含む物理名のテーブルが返却される
  - [ ] `tableName.logical.contains` を複数指定した場合、すべての文字列を含む論理名のテーブルが返却される
  - [ ] `columnName.physical.contains` を複数指定した場合、すべての文字列を含む物理名のカラムを持つテーブルが返却される
  - [ ] `columnName.logical.contains` を複数指定した場合、すべての文字列を含む論理名のカラムを持つテーブルが返却される
  - [ ] `columnId` を複数指定した場合、すべてのカラムIDを持つテーブルが返却される
- [ ] 該当するテーブルがない場合は空配列が返却される
- [ ] 大文字小文字を区別しない検索（検討）

#### URI例
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

# 複数条件: 物理名に "user" を含み、かつカラム物理名に "id" を含む
erd-designer://documents/doc123/tables?tableName.physical.contains=user&columnName.physical.contains=id

# 同一パラメータの複数指定: 物理名に "user" かつ "account" を含む
erd-designer://documents/doc123/tables?tableName.physical.contains=user&tableName.physical.contains=account

# 物理名と論理名の両方で絞り込み
erd-designer://documents/doc123/tables?tableName.physical.contains=user&tableName.logical.contains=ユーザー

# 同一パラメータの複数指定: 指定した複数のカラムIDをすべて含むテーブル
erd-designer://documents/doc123/tables?columnId=abc-123&columnId=def-456
```

#### 実装ステータス
- [ ] 未着手

#### 備考
- 大文字小文字の扱いについては実装時に検討が必要
- パフォーマンスが問題になる場合はインデックス機能の追加を検討

---

## カラム詳細リソースの実装

### 概要
カラム詳細リソース (`erd-designer://documents/{documentId}/columns/{columnId}`) を実装する。

### 実装対象ファイル
- `src/extension/mcpserver/columns.ts` (新規作成)
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### リソースURI
`erd-designer://documents/{documentId}/columns/{columnId}`

#### レスポンス形式
以下のプロパティを持つオブジェクトを返却する：

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| `columnId` | string | カラムID |
| `columnShareId` | string | 共有カラムモデルID（型定義の参照先） |
| `overrideName` | object \| null | 個別定義されたカラム名のオブジェクト。未定義の場合は null |
| `overrideName.physical` | string? | 個別定義された物理名。未定義の場合は返却されない |
| `overrideName.logical` | string? | 個別定義された論理名。未定義の場合は返却されない |
| `primaryKey` | boolean | 主キーであるか |
| `notNull` | boolean | NOT NULL 制約があるか |
| `unique` | boolean | UNIQUE 制約があるか |
| `autoIncrement` | boolean | 自動インクリメントが有効か |
| `defaultValue` | string? | デフォルト値 |

#### 実装詳細

1. **リソースハンドラの作成**
   - `src/extension/mcpserver/columns.ts` に新規ファイルを作成
   - URI パターン: `erd-designer://documents/{documentId}/columns/{columnId}`
   - パスパラメータ `documentId` と `columnId` を取得
   - DocumentResource から該当ドキュメントを取得
   - ドキュメント内の全テーブルからカラムを検索
   - カラムが見つからない場合はエラーを返す

2. **McpServerManager への登録**
   - `src/extension/McpServerManager.ts` の `setupResourceRoutes()` に追加
   - `this.registerResourceRoute(columns.tableColumnsRoute);` を追加

3. **エラーハンドリング**
   - ドキュメントが見つからない場合: 404エラー
   - カラムが見つからない場合: 404エラー
   - 無効なパラメータの場合: 400エラー

#### テストケース
- [ ] 有効なカラムIDでカラム詳細が取得できる
- [ ] `overrideName` が設定されている場合、正しく返却される
- [ ] `overrideName` が未設定の場合、null が返却される
- [ ] `overrideName.physical` のみ設定されている場合、logical は返却されない
- [ ] `overrideName.logical` のみ設定されている場合、physical は返却されない
- [ ] 存在しないカラムIDで404エラーが返る
- [ ] 存在しないドキュメントIDで404エラーが返る
- [ ] カラムの制約（primaryKey, notNull, unique, autoIncrement）が正しく返却される
- [ ] `defaultValue` が設定されている場合、正しく返却される
- [ ] `defaultValue` が未設定の場合、undefined が返却される

#### 実装ステータス
- [ ] 未着手

#### 備考
- カラムは複数のテーブルに存在する可能性があるため、全テーブルを検索する必要がある
- パフォーマンスが問題になる場合は、カラムIDのインデックスを作成することを検討

---

## 共有カラムモデル一覧の絞り込み機能

### 概要
共有カラムモデル一覧リソース (`erd-designer://documents/{documentId}/share_columns`) にクエリパラメータによる絞り込み機能を追加する。

### 実装対象ファイル
- `src/extension/mcpserver/share-columns.ts` (新規作成)
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### クエリパラメータ仕様
以下のクエリパラメータをサポートする（すべて任意）：

| パラメータ名 | 型 | 検索タイプ | 説明 |
|------------|-----|----------|------|
| `columnName.physical.contains` | string | 部分一致 | カラムの物理名に指定文字列を含む |
| `columnName.logical.contains` | string | 部分一致 | カラムの論理名に指定文字列を含む |
| `columnTypeId` | string | 完全一致 | 指定したカラム型IDを持つ |

**複数条件の扱い:**
- 異なるパラメータを複数指定した場合は **AND条件** として処理する
- 同一パラメータを複数指定した場合も **AND条件** として処理する
  - 例: `?columnName.physical.contains=user&columnName.physical.contains=id` → 物理名に "user" **かつ** "id" を含む

#### 実装詳細

1. **クエリパラメータの取得**
   ```typescript
   const columnNamePhysicalContains = url.searchParams.getAll('columnName.physical.contains');
   const columnNameLogicalContains = url.searchParams.getAll('columnName.logical.contains');
   const columnTypeIds = url.searchParams.getAll('columnTypeId');
   ```

2. **フィルタリング処理**
   - `columnName.physical.contains`: 共有カラムモデルの物理名に部分一致
   - `columnName.logical.contains`: 共有カラムモデルの論理名に部分一致
   - `columnTypeId`: 共有カラムモデルの `columnTypeId` に完全一致
   - **AND条件の処理:**
     - 異なるパラメータを複数指定した場合、すべての条件を満たす共有カラムモデルのみを返す
     - 同一パラメータを複数指定した場合も、すべての条件を満たす共有カラムモデルのみを返す

3. **レスポンス形式**
   - 以下のプロパティを持つオブジェクトを配列形式で返却
   - `uri`: 共有カラムモデルのURI
   - `columnShareId`: 共有カラムモデルID
   - `columnName`: カラム名（物理名・論理名）
   - `columnType`: データ型情報
   - `precision`, `scale`, `unsigned`, `isArray`: 型に応じた属性
   - `description`: カラムの説明

#### テストケース
- [ ] クエリパラメータなしで全共有カラムモデルが返却される
- [ ] `columnName.physical.contains` で物理名による絞り込みができる
- [ ] `columnName.logical.contains` で論理名による絞り込みができる
- [ ] `columnTypeId` で特定のカラム型による絞り込みができる
- [ ] 異なるパラメータの複数指定（AND条件）が正しく動作する
- [ ] 同一パラメータの複数指定（AND条件）が正しく動作する
  - [ ] `columnName.physical.contains` を複数指定した場合、すべての文字列を含む物理名の共有カラムモデルが返却される
  - [ ] `columnName.logical.contains` を複数指定した場合、すべての文字列を含む論理名の共有カラムモデルが返却される
- [ ] 該当する共有カラムモデルがない場合は空配列が返却される
- [ ] 大文字小文字を区別しない検索（検討）

#### URI例
```
# すべての共有カラムモデル
erd-designer://documents/doc123/share_columns

# 物理名に "user" を含む
erd-designer://documents/doc123/share_columns?columnName.physical.contains=user

# 論理名に "ユーザー" を含む
erd-designer://documents/doc123/share_columns?columnName.logical.contains=ユーザー

# 特定のカラム型IDを持つ
erd-designer://documents/doc123/share_columns?columnTypeId=type-123

# 複数条件: 物理名に "user" を含み、かつカラム型IDが一致
erd-designer://documents/doc123/share_columns?columnName.physical.contains=user&columnTypeId=type-123

# 同一パラメータの複数指定: 物理名に "user" かつ "id" を含む
erd-designer://documents/doc123/share_columns?columnName.physical.contains=user&columnName.physical.contains=id

# 物理名と論理名の両方で絞り込み
erd-designer://documents/doc123/share_columns?columnName.physical.contains=user&columnName.logical.contains=ユーザー
```

#### 実装ステータス
- [ ] 未着手

#### 備考
- 大文字小文字の扱いについては実装時に検討が必要

---

## 共有カラムモデル詳細リソースの実装

### 概要
共有カラムモデル詳細リソース (`erd-designer://documents/{documentId}/share_columns/{shareColumnId}`) を実装する。

### 実装対象ファイル
- `src/extension/mcpserver/share-columns.ts`
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### リソースURI
`erd-designer://documents/{documentId}/share_columns/{shareColumnId}`

#### レスポンス形式
以下のプロパティを持つオブジェクトを返却する：

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| `uri` | string | 共有カラムモデルのURI |
| `columnShareId` | string | 共有カラムモデルID |
| `columnName` | object | カラム名（物理名・論理名を含むオブジェクト） |
| `columnName.physical` | string | 物理名 |
| `columnName.logical` | string | 論理名 |
| `columnType` | object | データ型情報 |
| `columnType.uri` | string | データ型URI |
| `columnType.columnTypeId` | string | データ型ID |
| `columnType.columnTypeName` | string | データ型の名称 |
| `columnType.baseExpression` | string | 通常のデータ型表現 |
| `columnType.inChildExpression` | string | 外部キーとして指定された場合のデータ型表現 |
| `precision` | string? | 精度（サポートされる型のみ） |
| `scale` | string? | スケール（サポートされる型のみ） |
| `unsigned` | boolean? | 符号なし指定があるか（サポートされる型のみ） |
| `isArray` | boolean | 配列型であるか |
| `description` | string | カラムの説明 |

#### 実装詳細

1. **リソースハンドラの作成**
   - `src/extension/mcpserver/share-columns.ts` に実装
   - URI パターン: `erd-designer://documents/{documentId}/share_columns/{shareColumnId}`
   - パスパラメータ `documentId` と `shareColumnId` を取得
   - DocumentResource から該当ドキュメントを取得
   - ドキュメントの `columnShareModelStorage` から共有カラムモデルを検索
   - 共有カラムモデルが見つからない場合はエラーを返す

2. **McpServerManager への登録**
   - `src/extension/McpServerManager.ts` の `setupResourceRoutes()` に追加

3. **エラーハンドリング**
   - ドキュメントが見つからない場合: 404エラー
   - 共有カラムモデルが見つからない場合: 404エラー
   - 無効なパラメータの場合: 400エラー

#### テストケース
- [ ] 有効な共有カラムモデルIDで詳細が取得できる
- [ ] `columnName` の物理名・論理名が正しく返却される
- [ ] `columnType` の情報が正しく返却される
- [ ] `precision` が設定されている場合、正しく返却される
- [ ] `scale` が設定されている場合、正しく返却される
- [ ] `unsigned` が設定されている場合、正しく返却される
- [ ] `isArray` が正しく返却される
- [ ] `description` が正しく返却される
- [ ] 存在しない共有カラムモデルIDで404エラーが返る
- [ ] 存在しないドキュメントIDで404エラーが返る

#### 実装ステータス
- [ ] 未着手

#### 備考
- 共有カラムモデルは `columnShareModelStorage` から取得する

---

## カラム型一覧リソースの実装

### 概要
カラム型一覧リソース (`erd-designer://documents/{documentId}/column_types/`) を実装する。

### 実装対象ファイル
- `src/extension/mcpserver/column-types.ts` (新規作成)
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### リソースURI
`erd-designer://documents/{documentId}/column_types/`

#### レスポンス形式
以下のプロパティを持つオブジェクトを配列形式で返却する：

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| `uri` | string | カラム型詳細のURI (`erd-designer://documents/{documentId}/column_types/{columnTypeId}` 形式) |
| `columnTypeId` | string | カラム型ID |
| `columnTypeName` | string | カラム型の名称 |
| `withPrecision` | boolean | 精度指定のサポート有無 |
| `withScale` | boolean | スケール指定のサポート有無 |
| `withUnsigned` | boolean | 符号なし指定のサポート有無 |
| `baseExpression` | string | 通常のデータ型表現 |
| `inChildExpression` | string | 外部キーとして指定された場合のデータ型表現 |
| `description` | string | カラム型の説明 |
| `defaultValueCandidates` | string[] | デフォルト値として指定可能な式 |

#### 実装詳細

1. **リソースハンドラの作成**
   - `src/extension/mcpserver/column-types.ts` に新規ファイルを作成
   - URI パターン: `erd-designer://documents/{documentId}/column_types/`
   - パスパラメータ `documentId` を取得
   - DocumentResource から該当ドキュメントを取得
   - ドキュメントの `database.columnTypes` から全カラム型を取得
   - 各カラム型を仕様書のレスポンス形式に変換して返却

2. **McpServerManager への登録**
   - `src/extension/McpServerManager.ts` の `setupResourceRoutes()` に追加
   - `this.registerResourceRoute(columnTypes.columnTypesListRoute);` を追加

3. **エラーハンドリング**
   - ドキュメントが見つからない場合: 404エラー
   - 無効なパラメータの場合: 400エラー

#### テストケース
- [ ] 有効なドキュメントIDで全カラム型が取得できる
- [ ] レスポンスに `uri`, `columnTypeId`, `columnTypeName` が含まれる
- [ ] `withPrecision`, `withScale`, `withUnsigned` が正しく返却される
- [ ] `baseExpression`, `inChildExpression` が正しく返却される
- [ ] `description` が正しく返却される
- [ ] `defaultValueCandidates` が配列形式で返却される
- [ ] 存在しないドキュメントIDで404エラーが返る
- [ ] データベースによって異なるカラム型が返却される

#### 実装ステータス
- [ ] 未着手

#### 備考
- カラム型は `database.columnTypes` から取得する
- データベース種別（PostgreSQL, MySQL, MS SQL Server）によって異なるカラム型が返される

---

## カラム型詳細リソースの実装

### 概要
カラム型詳細リソース (`erd-designer://documents/{documentId}/column_types/{columnTypeId}`) を実装する。

### 実装対象ファイル
- `src/extension/mcpserver/column-types.ts`
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### リソースURI
`erd-designer://documents/{documentId}/column_types/{columnTypeId}`

#### レスポンス形式
以下のプロパティを持つオブジェクトを返却する：

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| `uri` | string | カラム型詳細のURI (`erd-designer://documents/{documentId}/column_types/{columnTypeId}` 形式) |
| `columnTypeId` | string | カラム型ID |
| `columnTypeName` | string | カラム型の名称 |
| `withPrecision` | boolean | 精度指定のサポート有無 |
| `withScale` | boolean | スケール指定のサポート有無 |
| `withUnsigned` | boolean | 符号なし指定のサポート有無 |
| `baseExpression` | string | 通常のデータ型表現 |
| `inChildExpression` | string | 外部キーとして指定された場合のデータ型表現 |
| `description` | string | カラム型の説明 |
| `defaultValueCandidates` | string[] | デフォルト値として指定可能な式 |

#### 実装詳細

1. **リソースハンドラの作成**
   - `src/extension/mcpserver/column-types.ts` に実装
   - URI パターン: `erd-designer://documents/{documentId}/column_types/{columnTypeId}`
   - パスパラメータ `documentId` と `columnTypeId` を取得
   - DocumentResource から該当ドキュメントを取得
   - ドキュメントの `database.columnTypes` から指定されたカラム型を検索
   - カラム型が見つからない場合はエラーを返す
   - カラム型を仕様書のレスポンス形式に変換して返却

2. **McpServerManager への登録**
   - `src/extension/McpServerManager.ts` の `setupResourceRoutes()` に追加
   - `this.registerResourceRoute(columnTypes.columnTypeDetailRoute);` を追加

3. **エラーハンドリング**
   - ドキュメントが見つからない場合: 404エラー
   - カラム型が見つからない場合: 404エラー
   - 無効なパラメータの場合: 400エラー

#### テストケース
- [ ] 有効なカラム型IDでカラム型詳細が取得できる
- [ ] レスポンスに `uri`, `columnTypeId`, `columnTypeName` が含まれる
- [ ] `withPrecision`, `withScale`, `withUnsigned` が正しく返却される
- [ ] `baseExpression`, `inChildExpression` が正しく返却される
- [ ] `description` が正しく返却される
- [ ] `defaultValueCandidates` が配列形式で返却される
- [ ] 存在しないカラム型IDで404エラーが返る
- [ ] 存在しないドキュメントIDで404エラーが返る

#### 実装ステータス
- [ ] 未着手

#### 備考
- カラム型は `database.columnTypes` から取得する
- カラム型IDはデータベース種別によって異なる

---

## リレーション一覧の絞り込み機能

### 概要
リレーション一覧リソース (`erd-designer://documents/{documentId}/relations`) にクエリパラメータによる絞り込み機能を追加する。

### 実装対象ファイル
- `src/extension/mcpserver/relations.ts` (新規作成または既存ファイルの修正)
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### クエリパラメータ仕様
以下のクエリパラメータをサポートする（すべて任意）：

| パラメータ名 | 型 | 検索タイプ | 説明 |
|------------|-----|----------|------|
| `parentTableId` | string | 完全一致 | 親テーブルIDが一致するリレーション |
| `childTableId` | string | 完全一致 | 子テーブルIDが一致するリレーション |
| `relationName.contains` | string | 部分一致 | リレーション名に指定文字列を含む |

**複数条件の扱い:**
- 異なるパラメータを複数指定した場合は **AND条件** として処理する
- 同一パラメータを複数指定した場合も **AND条件** として処理する
  - 例: `?parentTableId=table-123&parentTableId=table-456` → 両方の親テーブルIDを持つリレーション（通常は空配列）
  - 例: `?relationName.contains=user&relationName.contains=order` → リレーション名に "user" **かつ** "order" を含む

#### 実装詳細

1. **クエリパラメータの取得**
   ```typescript
   const parentTableIds = url.searchParams.getAll('parentTableId');
   const childTableIds = url.searchParams.getAll('childTableId');
   const relationNameContains = url.searchParams.getAll('relationName.contains');
   ```

2. **フィルタリング処理**
   - `parentTableId`: リレーションの `parentTableId` に完全一致
   - `childTableId`: リレーションの `childTableId` に完全一致
   - `relationName.contains`: リレーションの `relationName` に部分一致
   - **AND条件の処理:**
     - 異なるパラメータを複数指定した場合、すべての条件を満たすリレーションのみを返す
     - 同一パラメータを複数指定した場合も、すべての条件を満たすリレーションのみを返す

3. **レスポンス形式**
   - 以下のプロパティを持つオブジェクトを配列形式で返却
   - `uri`: リレーションのURI
   - `relationId`: リレーションID
   - `relationName`: リレーション名
   - `parentTableId`: 親テーブルID
   - `parentCardinality`: 親側のカーディナリティ
   - `childTableId`: 子テーブルID
   - `childCardinality`: 子側のカーディナリティ
   - `relationPairs`: カラムペア配列
   - `onUpdateAction`: 更新時の参照動作
   - `onDeleteAction`: 削除時の参照動作
   - `view`: 表示設定

#### テストケース
- [ ] クエリパラメータなしで全リレーションが返却される
- [ ] `parentTableId` で親テーブルIDによる絞り込みができる
- [ ] `childTableId` で子テーブルIDによる絞り込みができる
- [ ] `relationName.contains` でリレーション名による絞り込みができる
- [ ] 異なるパラメータの複数指定（AND条件）が正しく動作する
  - [ ] `parentTableId` と `childTableId` を同時指定した場合、両方の条件を満たすリレーションが返却される
  - [ ] `parentTableId` と `relationName.contains` を同時指定した場合、両方の条件を満たすリレーションが返却される
- [ ] 同一パラメータの複数指定（AND条件）が正しく動作する
  - [ ] `relationName.contains` を複数指定した場合、すべての文字列を含むリレーションが返却される
  - [ ] `parentTableId` を複数指定した場合（通常は空配列）
- [ ] 該当するリレーションがない場合は空配列が返却される
- [ ] 大文字小文字を区別しない検索（検討）

#### URI例
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

#### 実装ステータス
- [ ] 未着手

#### 備考
- 大文字小文字の扱いについては実装時に検討が必要
- 特定のテーブルに関連するすべてのリレーションを検索する場合、親テーブルと子テーブルの両方で検索する必要がある（1回のクエリでは片方のみ）

---

## カラムグループ一覧の絞り込み機能

### 概要
カラムグループ一覧リソース (`erd-designer://documents/{documentId}/column_groups`) にクエリパラメータによる絞り込み機能を追加する。

### 実装対象ファイル
- `src/extension/mcpserver/column-groups.ts` (新規作成または既存ファイルの修正)
- `src/extension/McpServerManager.ts` (リソースルート登録)

### 要件

#### クエリパラメータ仕様
以下のクエリパラメータをサポートする（すべて任意）：

| パラメータ名 | 型 | 検索タイプ | 説明 |
|------------|-----|----------|------|
| `columnId` | string | 完全一致 | 指定したカラムIDを含むカラムグループ |

**複数条件の扱い:**
- 同一パラメータを複数指定した場合は **AND条件** として処理する
  - 例: `?columnId=abc-123&columnId=def-456` → 両方のカラムIDを含むカラムグループ

#### 実装詳細

1. **クエリパラメータの取得**
   ```typescript
   const columnIds = url.searchParams.getAll('columnId');
   ```

2. **フィルタリング処理**
   - `columnId`: カラムグループの `columnIds` 配列に指定されたカラムIDが含まれる
   - **AND条件の処理:**
     - 複数の `columnId` を指定した場合、すべてのカラムIDを含むカラムグループのみを返す

3. **レスポンス形式**
   - 以下のプロパティを持つオブジェクトを配列形式で返却
   - `uri`: カラムグループのURI
   - `columnGroupId`: カラムグループID
   - `groupName`: グループ名
   - `columns`: グループに含まれるカラム情報の配列
   - `description`: グループの説明

#### テストケース
- [ ] クエリパラメータなしで全カラムグループが返却される
- [ ] `columnId` で特定のカラムを含むカラムグループが取得できる
- [ ] 複数の `columnId` を指定した場合（AND条件）、すべてのカラムIDを含むカラムグループが返却される
- [ ] 該当するカラムグループがない場合は空配列が返却される
- [ ] 存在しないカラムIDを指定した場合は空配列が返却される

#### URI例
```
# すべてのカラムグループ
erd-designer://documents/doc123/column_groups

# 特定のカラムIDを含むカラムグループ
erd-designer://documents/doc123/column_groups?columnId=abc-123-def-456

# 同一パラメータの複数指定（AND）: 指定した複数のカラムIDをすべて含むカラムグループ
erd-designer://documents/doc123/column_groups?columnId=abc-123&columnId=def-456
```

#### 実装ステータス
- [ ] 未着手

#### 備考
- カラムグループは `columnIds` 配列でカラムIDを保持している
- 複数のカラムIDを指定した場合、すべてのIDを含むグループのみを返す（AND条件）

