// SifterChat embeddable widget — Phase 0/1 surface (planning/sifterchat-widget-plan.md).
// Serves: the loader (/widget.js), the compiled custom element (/widget/sifter-chat.js), and the per-token
// config (GET /api/v1/widget/config/:token, origin-checked, edge-cacheable). Chat itself reuses the existing
// Jafar endpoint (/api/v1/chat/stream — it already handles anonymous users, rate limits, and site scoping via
// chatbot_location); CORS for host origins is granted dynamically in server.js from widget_profiles.domains.
// Bundle files are committed build artifacts (api/static/widget/) because the backend deploy path has no build
// step; rebuild with `npm run build:widget`.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'static', 'widget');

const loadAsset = (file) => {
  try { return readFileSync(join(STATIC_DIR, file), 'utf8'); }
  catch { return null; }
};

// Loaded once at boot (small files; a deploy restarts the process anyway).
const ASSETS = { 'widget.js': loadAsset('widget.js'), 'sifter-chat.js': loadAsset('sifter-chat.js') };
const DEMO_HTML = loadAsset('demo.html');

const originHost = (origin) => { try { return new URL(origin).hostname; } catch { return null; } };
const DEV_HOSTS = new Set(['localhost', '127.0.0.1']);

export default async function widgetRoutes(fastify) {
  // The two static assets, long-cached (bundle is versioned by deploy; 5-min edge TTL keeps rollout fast).
  for (const [file, body] of Object.entries(ASSETS)) {
    const path = file === 'widget.js' ? '/widget.js' : '/widget/sifter-chat.js';
    fastify.get(path, async (req, reply) => {
      if (!body) return reply.code(404).send('// widget asset not built — run: npm run build:widget');
      return reply
        .header('content-type', 'application/javascript; charset=utf-8')
        .header('cache-control', 'public, max-age=300, s-maxage=300')
        .header('access-control-allow-origin', '*')
        .send(body);
    });
  }

  // Same-origin demo page — instant hands-on test without touching a host site.
  fastify.get('/widget/demo', async (req, reply) => {
    if (!DEMO_HTML) return reply.code(404).send('demo not built');
    return reply.header('content-type', 'text/html; charset=utf-8').send(DEMO_HTML);
  });

  // Per-token widget config. Origin-checked against the profile's domain allowlist: a wrong-site embed gets
  // 403 (and we log it — that's the signal a token leaked or a domain needs adding). No Origin header (curl,
  // previews) is allowed through for config READS — the chat CORS layer still gates actual usage.
  fastify.get('/api/v1/widget/config/:token', async (req, reply) => {
    const row = await queryOne(`SELECT token, name, domains, tier, config_json FROM widget_profiles WHERE token=?`, [req.params.token]);
    if (!row) return reply.code(404).send({ error: 'unknown widget token' });
    let domains = []; let cfg = {};
    try { domains = JSON.parse(row.domains || '[]'); } catch { /* malformed row */ }
    try { cfg = JSON.parse(row.config_json || '{}'); } catch { /* malformed row */ }
    const origin = req.headers.origin;
    const host = origin ? originHost(origin) : null;
    if (origin && !(domains.includes(host) || DEV_HOSTS.has(host))) {
      logger.warn({ token: row.token, origin }, 'widget config refused: origin not in profile domains');
      return reply.code(403).send({ error: 'origin not authorized for this widget token' });
    }
    return reply
      .header('cache-control', 'public, max-age=60, s-maxage=300')
      .send({
        name: row.name,
        greeting: cfg.greeting || 'Hello! Ask me anything about the sacred literature.',
        accent: cfg.accent || '#1a6b5e',
        position: cfg.position || 'bottom-right',
        chatbotLocation: cfg.chatbotLocation || null,   // site-scoped retrieval (existing chat feature)
        placeholder: cfg.placeholder || 'Ask a question…',
      });
  });
}
