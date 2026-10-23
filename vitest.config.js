import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // .svelte imports compile for the server, so a test can render a component's SSR HTML (svelte/server)
  plugins: [svelte({ compilerOptions: { css: 'external' }, onwarn: (w, h) => { if (!/css_unused_selector|state_referenced_locally|^a11y/.test(w.code)) h(w); } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/']
    }
  }
});
