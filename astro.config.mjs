import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import remarkSmartypants from 'remark-smartypants';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Single source of truth: .env-public has API_URL (prod) and API_URL_DEV (dev).
// Client code reads import.meta.env.PUBLIC_API_URL — Vite only exposes
// PUBLIC_-prefixed vars to the browser, so we resolve the right one here
// at build/dev time based on DEV_MODE. Never hard-code in .env-public.
dotenv.config({ path: '.env-public' });
dotenv.config({ path: '.env-secrets' });
const isDev = process.env.DEV_MODE === 'true' || process.env.NODE_ENV === 'development';
process.env.PUBLIC_API_URL = isDev
  ? (process.env.API_URL_DEV || 'http://localhost:3001')
  : (process.env.API_URL || 'https://api.siftersearch.com');

export default defineConfig({
  site: 'https://siftersearch.com',
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  }),

  devToolbar: {
    enabled: false
  },

  // Prefetch links on hover for instant navigation
  prefetch: {
    defaultStrategy: 'hover',
    prefetchAll: false
  },

  // Smart-quote transformation for all markdown content (dialogs, docs, agents).
  // " → " " and ' → ' ', em-dashes, ellipses. Never display straight quotes.
  markdown: {
    remarkPlugins: [remarkSmartypants],
  },

  integrations: [
    svelte(),
    sitemap({
      filter: (page) => {
        if (page.includes('/api/')) return false;
        if (page.includes('/admin')) return false;
        if (page.includes('/sitemap-library')) return false;
        if (page.match(/\/library\/[^/]+\/[^/]+\/[^/]+/)) return false;
        return true;
      },
      serialize: (item) => ({
        ...item,
        changefreq: item.url === 'https://siftersearch.com/' ? 'weekly' : 'monthly',
        priority: item.url === 'https://siftersearch.com/' ? 1.0 : 0.8,
      }),
      customPages: [
        'https://siftersearch.com/sitemap-library.xml'
      ]
    }),
    // No PWA — SSR + Cloudflare edge caching + browser prefetch handles performance.
    // The service worker caused more problems than it solved.
  ],

  vite: {
    plugins: [
      tailwindcss()
    ],
    define: {
      '__APP_VERSION__': JSON.stringify(pkg.version),
      '__APP_DESCRIPTION__': JSON.stringify(pkg.description)
    },
    build: {
      sourcemap: false
    },
    ssr: {
      external: ['node:path', 'node:url']
    }
  }
});
