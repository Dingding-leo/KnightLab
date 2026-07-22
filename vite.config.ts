import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.KNIGHTCLUB_BASE ?? '/'

export default defineConfig({
  base,
  clearScreen: false,
  build: {
    // Sites discovers static assets through dist/server/wrangler.json. Keep the
    // browser bundle in the matching Cloudflare assets directory.
    outDir: 'dist/client',
  },
  server: {
    host: process.env.TAURI_DEV_HOST ?? '127.0.0.1',
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'KnightClub — Local Chess Studio',
        short_name: 'KnightClub',
        description: 'Offline-first chess play, review, training, library and insights.',
        theme_color: '#090d13',
        background_color: '#090d13',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2,wav,wasm,txt}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
})
