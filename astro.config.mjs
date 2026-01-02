import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';
import cloudflare from '@astrojs/cloudflare';
import { readFileSync } from 'fs';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  site: 'https://siftersearch.com',
  // Server mode for Cloudflare Pages - allows SSR routes like /library/[...path]
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  }),

  // Disable noisy dev toolbar audits
  devToolbar: {
    enabled: false
  },

  integrations: [
    svelte(),
    sitemap({
      // Filter out pages that shouldn't be in the main sitemap
      // - /api/ routes are server-side
      // - /library/* dynamic routes are handled by sitemap-library.xml
      // - /sitemap-library.xml is the custom sitemap endpoint
      filter: (page) => {
        if (page.includes('/api/')) return false;
        if (page.includes('/sitemap-library')) return false;
        // Exclude catch-all library routes (handled by sitemap-library.xml)
        if (page.match(/\/library\/[^/]+\/[^/]+\/[^/]+/)) return false;
        return true;
      },
      // Customize sitemap entries
      serialize: (item) => ({
        ...item,
        changefreq: item.url === 'https://siftersearch.com/' ? 'weekly' : 'monthly',
        priority: item.url === 'https://siftersearch.com/' ? 1.0 : 0.8,
      }),
      // Reference the custom library sitemap
      customPages: [
        'https://siftersearch.com/sitemap-library.xml'
      ]
    }),
    AstroPWA({
      registerType: 'autoUpdate',  // Auto-update without user prompt
      devOptions: {
        enabled: false
      },
      includeAssets: ['favicon.ico', 'ocean.svg', 'logo.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SifterSearch',
        short_name: 'Sifter',
        description: 'AI-powered interfaith library search',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // Precache static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Clean up old caches when new SW activates
        cleanupOutdatedCaches: true,
        // Auto-activate new SW immediately - no waiting for tab close
        skipWaiting: true,
        clientsClaim: true,
        // IMPORTANT: Disable navigation fallback for SSR routes
        // The default navigateFallback "/" breaks dynamic routes like /library/*
        navigateFallback: null,
        // Runtime caching
        runtimeCaching: [
          {
            // Don't cache stats endpoint - need fresh version info
            urlPattern: /^https:\/\/api\.siftersearch\.com\/api\/search\/stats/,
            handler: 'NetworkOnly'
          },
          {
            // Cache other API responses
            urlPattern: /^https:\/\/api\.siftersearch\.com\/api\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 86400 // 24 hours
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ],

  vite: {
    plugins: [tailwindcss()],
    define: {
      '__APP_VERSION__': JSON.stringify(pkg.version),
      '__APP_DESCRIPTION__': JSON.stringify(pkg.description),
      'import.meta.env.PUBLIC_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.PUBLIC_API_URL': JSON.stringify(process.env.PUBLIC_API_URL || 'https://api.siftersearch.com'),
      'import.meta.env.PUBLIC_DEPLOY_SECRET': JSON.stringify(process.env.PUBLIC_DEPLOY_SECRET || '')
    },
    optimizeDeps: {
      exclude: ['@libsql/client']
    }
  }
});
