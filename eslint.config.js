import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

// 内部モジュール (private 相当) は、そのディレクトリ内、またはバレル (index.ts) 経由でのみ参照可能とする
const PRIVATE_MODULES = [
  {
    directory: "src/features/canvas/ErdCanvas",
    group: ["**/ErdCanvas/*"],
    message: "ErdCanvas internal modules are private. Import \"~/features/canvas/ErdCanvas\" instead.",
  },
  {
    directory: "src/models/schema/schema-migration-ddl",
    group: ["**/schema-migration-ddl/*"],
    message: "schema-migration-ddl internal modules are private. "
      + "Import \"~/models/schema/schema-migration-ddl\" instead.",
  },
  {
    directory: "src/models/erm",
    group: ["**/erm/*"],
    message: "erm internal modules are private. Import \"~/models/erm\" instead.",
  },
];

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
  ...initRestrictedImportsConfigs(PRIVATE_MODULES)
);

// flat config では同じルールを複数ブロックで設定すると後のブロックが前の設定を丸ごと上書きする。
// そのため、ファイルごとに適用すべきパターンをすべて 1 ブロックにまとめる (自ディレクトリのパターンだけを除く)。
function initRestrictedImportsConfigs(privateModules) {
  const outsideConfig = {
    files: ["src/**/*.{ts,tsx}"],
    ignores: privateModules.map((privateModule) => { return `${privateModule.directory}/**`; }),
    rules: { "no-restricted-imports": toRestrictedImportsRule(privateModules) },
  };
  const insideConfigs = privateModules.map((privateModule) => {
    const otherModules = privateModules.filter((otherModule) => otherModule !== privateModule);
    return {
      files: [`${privateModule.directory}/**/*.{ts,tsx}`],
      rules: { "no-restricted-imports": toRestrictedImportsRule(otherModules) },
    };
  });
  return [outsideConfig, ...insideConfigs];
}

function toRestrictedImportsRule(privateModules) {
  const patterns = privateModules.map((privateModule) => {
    return { group: privateModule.group, message: privateModule.message };
  });
  return ["error", { patterns }];
}
