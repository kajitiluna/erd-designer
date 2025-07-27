# ERD Designer マニュアル

Entity Relationship Diagram Designer（ERD Designer）マニュアルへようこそ。この包括的なガイドは、ERD Designer のすべての機能を効果的に理解し、活用するのに役立ちます。

## 目次

1. [概要](#1-概要)
   - 1.1. [ERD Designer とは](#11-erd-designer-とは)
   - 1.2. [提供形式](#12-提供形式)
     - 1.2.1. [オンラインサービス（GitHub Pages への直接アクセス）](#121-オンラインサービスgithub-pages-への直接アクセス)
     - 1.2.2. [Google Drive App](#122-google-drive-app)

2. [利用開始](Getting-Started.md)
   - 2.1. [オンラインサービス（GitHub Pages への直接アクセス）](Getting-Started.md#21-オンラインサービスgithub-pages-への直接アクセス)
   - 2.2. [Google Drive App](Getting-Started.md#22-google-drive-app)
   - 2.3. [キャンバス](Canvas-Interface.md)
     - 2.3.1. [各メニューについて](Canvas-Interface.md#231-各メニューについて)

3. [各機能について](Features-Guide.md)
   - 3.1. [テーブル](Features-Guide.md#31-テーブル)
     - 3.1.1. [テーブル作成概要](Features-Guide.md#311-テーブル作成概要)
     - 3.1.2. [カラム追加、編集、削除](Features-Guide.md#312-カラム追加編集削除)
     - 3.1.3. [インデクス追加、編集、削除](Features-Guide.md#313-インデクス追加編集削除)
     - 3.1.4. [ドラッグ移動、カラー変更、編集、削除](Features-Guide.md#314-ドラッグ移動カラー変更編集削除)
   - 3.2. [リレーション](Features-Guide.md#32-リレーション)
     - 3.2.1. [リレーション作成方法](Features-Guide.md#321-リレーション作成方法)
     - 3.2.2. [リレーション設定内容](Features-Guide.md#322-リレーション設定内容)
     - 3.2.3. [リレーション線の変更](Features-Guide.md#323-リレーション線の変更)
   - 3.3. [メモ](Features-Guide.md#33-メモ)
     - 3.3.1. [メモ作成概要](Features-Guide.md#331-メモ作成概要)
     - 3.3.2. [テキスト編集方法](Features-Guide.md#332-テキスト編集方法)
     - 3.3.3. [サイズ変更、位置移動、カラー変更、フォント変更、削除](Features-Guide.md#333-サイズ変更位置移動カラー変更フォント変更削除)
   - 3.4. [その他の編集機能](Features-Guide.md#34-その他の編集機能)
     - 3.4.1. [カラムグループ定義](Features-Guide.md#341-カラムグループ定義)
     - 3.4.2. [DDL インポート](Features-Guide.md#342-ddl-インポート)
   - 3.5. [その他の操作](Features-Guide.md#35-その他の操作)
     - 3.5.1. [単一選択、複数選択、Grab操作](Features-Guide.md#351-単一選択複数選択grab操作)
     - 3.5.2. [デフォルトカラー設定](Features-Guide.md#352-デフォルトカラー設定)
     - 3.5.3. [Display Style](Features-Guide.md#353-display-style)
     - 3.5.4. [アンドゥ、リドゥ](Features-Guide.md#354-アンドゥリドゥ)
     - 3.5.5. [DDL エクスポート](Features-Guide.md#355-ddl-エクスポート)
     - 3.5.6. [ER図 画像保存](Features-Guide.md#356-er図-画像保存)
     - 3.5.7. [テーブル定義書出力](Features-Guide.md#357-テーブル定義書出力)
     - 3.5.8. [erd ファイル出力（Google Drive App 除く）](Features-Guide.md#358-erd-ファイル出力google-drive-app-除く)

## 1. 概要

### 1.1. ERD Designer とは

Entity Relationship Diagram Designer（ERD Designer）は、エンティティ関係図を設計するためのWebベースのツールです。このツールは [ERMaster](https://ermaster.sourceforge.net/index.html) にインスパイアされています。

ERD Designer は以下の機能を提供します：

- **グラフィカルインターフェース**: ERD Designer では、グラフィカルインターフェースを介してデータベーステーブルと関係を設計できます。
- **エクスポート機能**: ERD Designer は PNG 画像のエクスポートと DDL ファイルの生成をサポートしています。
- **カラムモデルの再利用**: ERD Designer は、テーブル設計のためのカラムモデルの再利用と共有をサポートしています。

### 1.2. 提供形式

ERD Designer は、さまざまなユーザーのニーズに対応するため、2つの異なる形式で提供されています。

#### 1.2.1. オンラインサービス（GitHub Pages への直接アクセス）

ERD Designer は以下のオンラインツールとして利用できます： [kajitiluna.github.io/erd-designer](https://kajitiluna.github.io/erd-designer)

このオンラインツールは、プライバシーとデータセキュリティを確保するため、データをオンラインではなくユーザーのマシンにローカルに保存します。

#### 1.2.2. Google Drive App

ERD Designer は Google Drive App としても利用できます。[Google Workspace Marketplace](https://workspace.google.com/marketplace/app/erd_designer/952307856491) から ERD Designer アプリを Google Workspace にインストールすることで、ERD Designer を使用して Google Drive で作業を保存および編集できます。

**Google Drive App の重要な注意事項：**
- Google Drive でファイルが共有されている場合、ERD Designer で同時に表示することはできますが、同時編集はサポートされていません。楽観的同時実行制御により、最初に保存されたコンテンツが保持されます。
- オンラインツールでは仕様書を Excel ファイルとしてダウンロードできますが、Google Drive App ではスプレッドシートとしてエクスポートされます。

---

続き: [利用開始](Getting-Started.md)