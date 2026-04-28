import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import remarkSmartypants from 'remark-smartypants';
import { readFileSync } from 'fs';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

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
