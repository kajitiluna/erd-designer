import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  base: '/erd-designer',
  // vitest はこの設定ファイルをそのまま読み込むため、react() を無条件に呼ぶと
  // テスト実行のたびに [vite:react-swc] の"no swc plugins are used"警告が出る。
  // テストに JSX トランスパイルは不要(*.test.tsx は存在しない)なので、
  // process.env.VITEST(vitest が自動設定する)を見て vite build/dev 時のみ有効にする。
  plugins: process.env.VITEST ? [] : [react()],
  resolve: {
    alias: {
      '~': '/src'
    }
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '~': '/src'
          }
        },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: './vitest.setup.ts',
          exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
          server: {
            deps: {
              // @mui/material ships ESM that reaches react-transition-group through a directory import,
              // which Node cannot resolve on its own. Inlining lets Vite resolve it the way the browser
              // build already does, so MUI components can be rendered in tests.
              inline: ['@mui/material'],
            },
          },
        },
      },
      {
        // integration: 実DBへ接続するテストのみ。node環境で動かし、globalSetup が
        // テスト対象のDBコンテナ群を起動・停止する(詳細は vitest.global-setup.db.ts)。
        resolve: {
          alias: {
            '~': '/src'
          }
        },
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          include: ['src/**/__tests__/**/*.integration.test.ts'],
          globalSetup: './vitest.global-setup.db.ts',
          testTimeout: 60_000,
        },
      },
    ],
  },
})
