import { defineConfig } from 'vite'
import { solidPane } from 'solidos-toolkit/vite'

// The standalone HTML entry lives in `standalone/` so local development can
// keep using http://localhost:3200/standalone/. Pages publishes that entry at
// the project-site root, so CI supplies `/questionaire-pane/` instead.
const configuredBase = process.env.VITE_BASE_PATH?.trim() || '/'
const base = configuredBase === '/'
  ? '/'
  : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`

export default defineConfig({
  root: '.',
  base,
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
