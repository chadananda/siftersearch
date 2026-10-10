// siftersearch-img: the image Worker, routed at siftersearch.com/img/* (more specific than the site Worker's /*).
// Separate from the Astro site Worker so Photon's WASM never passes through the Astro/Vite build. See cdn.js.
import { handleImage } from './cdn.js';

export default {
  async fetch(req, env, ctx) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    return handleImage(req, env, ctx);
  },
};
