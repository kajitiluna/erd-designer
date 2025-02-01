import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true
        },
        globals: {
          ...globals.browser,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react': react,
      'jest-dom': jestDom,
      'testing-library': testingLibrary,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
    overrides: [
      {
        files: [
          '**/__tests__/**/?(*.)+(spec|test).+(ts|tsx|js)'
        ],
        rules: {
          'testing-library/no-debug': 'warn',
          'testing-library/no-manual-cleanup': 'warn',
          'testing-library/no-wait-for-snapshot': 'warn',
          'testing-library/prefer-find-by': 'warn',
          'testing-library/prefer-presence-queries': 'warn',
          'testing-library/prefer-screen-queries': 'warn',
          'testing-library/prefer-user-event': 'warn',
        },
        extends: [
          'plugin:jest-dom/recommended',
          'plugin:testing-library/react',
        ],
      },
    ],
  },
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
)
