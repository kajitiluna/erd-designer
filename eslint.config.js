import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "out", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
        globals: {
          ...globals.browser,
        },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      react: react,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "no-mixed-operators": ["error", {
        groups: [
          ["==", "!=", "===", "!==", ">", ">=", "<", "<=", "&&", "||"],
        ],
        allowSamePrecedence: true,
      }],
    },
  },
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  { settings: { react: { version: "detect" } } },
  {
    // コンポーネント/モジュール内部の private 相当ファイルは、そのディレクトリ内からのみ参照可能とする
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/canvas/ErdCanvas/**", "src/models/schema/schema-migration-ddl/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/ErdCanvas/*"],
            message: "ErdCanvas internal modules are private. Import \"~/features/canvas/ErdCanvas\" instead.",
          },
          {
            group: ["**/schema-migration-ddl/*"],
            message: "schema-migration-ddl internal modules are private. "
              + "Import \"~/models/schema/schema-migration-ddl\" instead.",
          },
        ],
      }],
    },
  },
  {
    // erm/ 内部モジュール (private 相当) は erm ディレクトリ内、またはバレル (index.ts) 経由でのみ参照可能とする
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/models/erm/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/erm/*"],
          message: "erm internal modules are private. Import \"~/models/erm\" instead.",
        }],
      }],
    },
  }
);
