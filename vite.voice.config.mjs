// Build config for the lazy Anís voice bundle (src/widget/voice.js → api/static/widget/anis-voice.js): loaded by the element
// only on first voice use, so the page's critical path never carries it. Built BEFORE the element (npm run build:widget):
// the element embeds this file's content hash (__VOICE_V__) and tower serves that URL immutable (api/routes/widget.js).
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'src/widget/voice.js', formats: ['iife'], name: 'AnisVoice', fileName: () => 'anis-voice.js' },
    outDir: 'api/static/widget',
    emptyOutDir: false,
    target: 'es2020',
    minify: true,
  },
});
