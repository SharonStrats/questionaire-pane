import { defineConfig } from 'vite'
import { solidPane } from 'solidos-toolkit/vite'

export default defineConfig({
  root: '.',
  plugins: [solidPane({ litDecoratorPaths: ['src/components'] })],
  build: {
    outDir: 'standalone-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'standalone/index.html'
    }
  },
  server: {
    open: '/standalone/index.html'
  }
})
