import { defineConfig } from 'vite'
import { solidPane } from 'solidos-toolkit/vite'

export default defineConfig({
  root: '.',
  base: process.env.GITHUB_ACTIONS ? '/questionaire-pane/' : '/',
  plugins: [solidPane({ litDecoratorPaths: ['src/components'] })],
  build: {
    outDir: 'standalone-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'standalone/index.html'
    }
  },
  server: {
    open: '/standalone/index.html',
    // Do not silently move the OAuth callback to another port when a second
    // Vite process is started. The login component uses window.location as its
    // redirect URI, so the server must either own 3200 or fail clearly.
    port: 3200,
    strictPort: true
  }
})
