import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

// HTTPS=1 (npm run dev:https / preview:https) serves over HTTPS with a self-signed
// certificate, for testing installs and the offline cache from a tablet on the LAN.
const https = process.env.HTTPS === '1'

/**
 * Serves /api from server/app.ts inside the dev server, so local development
 * needs no Vercel CLI. In production the same code runs as api/index.ts.
 */
function apiDevServer(): Plugin {
  return {
      name: 'little-lines-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api')) return next()
          try {
            const mod = (await server.ssrLoadModule('/server/app.ts')) as typeof import('./server/app.js')
            await mod.handle(req, res)
          } catch (err) {
            next(err)
          }
        })
      },
    }
  }

  export default defineConfig(({ mode }) => {
    // Server-side settings from .env (DATABASE_URL, secrets). Only VITE_* values ever reach the browser.
    Object.assign(process.env, { ...loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), ''), ...process.env })
    return {
    plugins: [
      apiDevServer(),
      react(),
      tailwindcss(),
      ...(https ? [basicSsl()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Little Lines',
          short_name: 'Little Lines',
          description: 'Coloring books for the whole family, with crayons, glitter and a real page-turning book.',
          theme_color: '#4A2C1A',
          background_color: '#F6EEDF',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // The app, its fonts, every bundled book page and the 1200 px scene pictures, so coloring works with no internet.
          globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,woff2,mp3}'],
          // PDF import and the owner console (owner only, online anyway) and rarely used font subsets
          // still load online; leaving them out keeps the offline cache small on tablets.
          globIgnores: ['**/pdf*.{js,mjs}', '**/ImportScreen-*.js', '**/{Admin*,OverviewScreen,AuditScreen,BookChips,BookDetailsFields,format}-*.js', '**/*-cyrillic*.woff2', '**/*-vietnamese*.woff2', '**/*-greek*.woff2', 'scenes/**/!(*-1200).webp'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: '/index.html',
          // Sign-in redirects (Google, password reset links) must reach the server, not the cached app.
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          // Pages of books the owner published. Their URLs include the book's version, so a cached
          // image never goes stale: an edited book gets new URLs. Kept so opened books work offline.
          runtimeCaching: [
            // The sharp 2000 px scene pictures for big screens: cached the first time each one shows, and
            // refreshed in the background so redrawn scenes reach devices. The 1200 px copies are in the
            // offline cache, and screens fall back to them.
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/scenes/'),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'scenes', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: ({ url }) => url.pathname === '/api/catalog/image' && url.searchParams.has('v'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'catalog-images',
                expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    server: { port: 5173, strictPort: true },
    build: {
      rollupOptions: {
        output: {
          // Long-lived libraries in their own files so app updates don't re-download them.
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react'
            if (id.includes('node_modules/dexie')) return 'dexie'
            if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs'
          },
        },
      },
    },
  }
})
