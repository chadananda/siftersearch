// Build config for the SifterChat custom-element bundle (src/widget → api/static/widget/sifter-chat.js).
// Separate from the Astro build: the widget ships from the API origin (no CF Pages dependency), and the
// output is a committed artifact because the backend deploy path has no build step. Run: npm run build:widget.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  publicDir: false,   // do NOT copy the Astro public/ dir into the widget outDir
  plugins: [svelte({ compilerOptions: { customElement: true } })],
  build: {
    lib: { entry: 'src/widget/element.js', formats: ['iife'], name: 'SifterChat', fileName: () => 'sifter-chat.js' },
    outDir: 'api/static/widget',
    emptyOutDir: false,          // widget.js (the hand-written loader) lives here too
    target: 'es2020',
    minify: true,
  },
});
