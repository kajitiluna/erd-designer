// `vscode` は VSCode 拡張ホストが実行時に注入するモジュールで、npm パッケージとしては存在しない。
// テスト実行環境 (vitest) では解決できないため、単体テスト時のみこの空モジュールへ差し替える
// (vite.config.ts の "unit" プロジェクトの resolve.alias を参照)。
// 実際の vscode API を呼び出すコードパスは対象外にし、必要なテストは vi.mock で個別に上書きする。
export {};
