import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { solidPane } from 'solidos-toolkit/vite'

// The standalone HTML entry lives in `standalone/` so local development can
// keep using http://localhost:3200/standalone/. Pages publishes that entry at
// the project-site root, so CI supplies `/questionaire-pane/` instead.
const configuredBase = process.env.VITE_BASE_PATH?.trim() || '/'
const base = configuredBase === '/'
  ? '/'
  : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`
const solidUiDist = resolve(import.meta.dirname, '../solid-ui/dist')
const webAwesome = resolve(import.meta.dirname, '../solid-ui/node_modules/@awesome.me/webawesome')

export default defineConfig({
  root: '.',
  base,
  plugins: [solidPane({
    litDecoratorPaths: ['src/components'],
    sandbox: {
      subject: 'https://testingsolidos.solidcommunity.net/'
    }
  })],
  resolve: {
    dedupe: ['solid-ui', '@awesome.me/webawesome', 'lit', 'lit-html'],
    alias: [
      { find: /^solid-ui$/, replacement: `${solidUiDist}/index.esm.js` },
      { find: /^solid-ui\/components\/(.+)$/, replacement: `${solidUiDist}/components/$1/index.esm.js` },
      { find: /^solid-ui\/(.+)$/, replacement: `${solidUiDist}/$1` },
      { find: /^@awesome\.me\/webawesome$/, replacement: webAwesome },
      { find: /^@awesome\.me\/webawesome\/(.+)$/, replacement: `${webAwesome}/$1` },
    ],
  },
  optimizeDeps: {
    exclude: ['@awesome.me/webawesome'],
  },
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
