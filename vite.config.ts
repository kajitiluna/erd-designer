import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  base: '/erd-designer',
  plugins: [react()],
  resolve: {
    alias: {
      '~': '/src'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    server: {
      deps: {
        // @mui/material ships ESM that reaches react-transition-group through a directory import,
        // which Node cannot resolve on its own. Inlining lets Vite resolve it the way the browser
        // build already does, so MUI components can be rendered in tests.
        inline: ['@mui/material'],
      },
    },
  },
})
