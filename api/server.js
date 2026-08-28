/**
 * Fastify Server Configuration
 * Sets up plugins, routes, and error handling
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { spawn } from 'child_process';
import { join } from 'path';
import { createRequire } from 'module';
import { loggerConfig } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

// Get server version from package.json
const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require('../package.json');
import authRoutes from './routes/auth.js';
import searchRoutes from './routes/search.js';
import sessionRoutes from './routes/session.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import docsRepoRoutes from './routes/docs.js';
import companionRoutes from './routes/companion.js';
import companionMeRoutes from './routes/companion-me.js';
import entityReviewRoutes from './routes/entity-review.js';
import documentsRoutes from './routes/documents.js';
import servicesRoutes from './routes/services.js';
import anonymousRoutes from './routes/anonymous.js';
import librarianRoutes from './routes/librarian.js';
import publicApiRoutes from './routes/public-api.js';
import deployRoutes from './routes/deploy.js';
import forumRoutes from './routes/forum.js';
import donationRoutes from './routes/donations.js';
import apiKeyRoutes from './routes/api-keys.js';
import libraryRoutes from './routes/library.js';
import chatRoutes from './routes/chat.js';
import graphRoutes from './routes/graph.js';
import peopleRoutes from './routes/people.js';
import deepResearchRoutes from './routes/deep-research.js';
import groundingRoutes from './routes/grounding.js';
import widgetRoutes from './routes/widget.js';
import ingestRoutes from './routes/ingest.js';
import bookNotesRoutes from './routes/book-notes.js';
import { config } from './lib/config.js';
import { ensureSessionId } from './lib/anonymous.js';

export async function createServer(opts = {}) {
  const server = Fastify({
    logger: loggerConfig,
    trustProxy: true,
    ...opts
  });

  // CORS - allow configured origins
  const allowedOrigins = config.server.corsOrigins.split(',').map(o => o.trim());
  // SifterChat widget embeds: host-site origins are approved dynamically from widget_profiles.domains
  // (planning/sifterchat-widget-plan.md). Cached 60s so the CORS preflight path never hits the DB per-request;
  // a missing table (pre-migration) just means no extra origins.
  let widgetOrigins = new Set();
  let widgetOriginsAt = 0;
  async function isWidgetOrigin(origin) {
    if (Date.now() - widgetOriginsAt > 60_000) {
      widgetOriginsAt = Date.now();
      try {
        const { queryAll } = await import('./lib/db.js');
        const rows = await queryAll(`SELECT domains FROM widget_profiles`);
        const s = new Set();
        for (const r of rows) {
          try { for (const d of JSON.parse(r.domains || '[]')) { s.add(`https://${d}`); s.add(`http://${d}`); } } catch { /* skip malformed */ }
        }
        widgetOrigins = s;
      } catch { /* table absent or read failure → keep previous set */ }
    }
    // The API's own origin (same-origin browser POSTs still send Origin — e.g. the /widget/demo page) + dev hosts.
    return widgetOrigins.has(origin) || origin === 'https://api.siftersearch.com' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  // THE PUBLIC API IS GUARDED BY ITS KEY, NOT BY ITS ORIGIN.
  //
  // Until 2026-08-28 a disallowed origin was rejected with `callback(new Error('Not allowed by CORS'))`,
  // which @fastify/cors surfaces as a 500. So every third-party browser caller of the documented public API
  // got {"statusCode":500,"error":"Internal Server Error"} with no Access-Control-Allow-Origin — which in a
  // browser is an opaque network failure, and was diagnosed as the Cloudflare tunnel being down. It was not:
  // the same request without an Origin header returned 200 throughout. A policy decision must never be
  // reported as a server fault.
  //
  // Origin is not a security boundary for a key-authenticated API: curl, servers and scripts never send an
  // Origin and are unaffected by CORS at all, so an allowlist only ever blocked legitimate browser consumers.
  // Third-party origins are therefore allowed — but WITHOUT credentials (browsers forbid sending cookies to a
  // reflected/wildcard origin, and we do not want ambient session auth from arbitrary sites) and only WITH an
  // API key, enforced below. Trusted origins keep credentials so the site's own cookie/session calls, the
  // admin UI and registered widget hosts are untouched.
  const corsShared = {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Internal-Key',
      'X-API-Key',
      'X-Requested-With',
      'X-User-Id',
      'X-Client-Version',
      'X-Request-Id'
    ],
    exposedHeaders: ['X-Server-Version']
  };
  const isTrustedOrigin = async (origin) =>
    allowedOrigins.includes(origin) || origin.endsWith('.pages.dev') || (await isWidgetOrigin(origin));

  await server.register(cors, () => async (req, callback) => {
    const origin = req.headers.origin;
    // No Origin = not a browser (curl, server-to-server, mobile). CORS does not apply; route auth still does.
    if (!origin) return callback(null, { origin: true, credentials: true, ...corsShared });
    if (await isTrustedOrigin(origin)) return callback(null, { origin: true, credentials: true, ...corsShared });
    return callback(null, { origin: true, credentials: false, ...corsShared });
  });

  // CROSS-ORIGIN API CALLS MUST CARRY A KEY. Registered after the CORS hook so the 401 still gets its CORS
  // headers — a bare 401 with no ACAO is unreadable in a browser and looks like an outage all over again.
  //
  // OPTIONS IS EXEMPT AND MUST BE: browsers never send custom headers (and so never the key) on a preflight.
  // Rejecting the preflight for a missing key would block every cross-origin call before the real request is
  // ever made, which is the same failure this change exists to remove.
  server.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (!origin) return;                                  // non-browser caller — route-level auth governs
    if (!req.url.startsWith('/api/')) return;             // /health, /widget assets etc. stay open
    if (await isTrustedOrigin(origin)) return;            // our own pages keep using the session cookie
    const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!key) {
      return reply.code(401).send({
        error: 'API key required for cross-origin requests. Set the X-API-Key header.',
        code: 'unauthorized',
      });
    }
  });

  // Cookies (for refresh tokens)
  await server.register(cookie, {
    secret: process.env.JWT_REFRESH_SECRET,
    hook: 'onRequest'
  });

  // Rate limiting
  if (config.rateLimit.enabled) {
    await server.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.windowMs
    });
  }

  // Request logging hook - log all incoming requests
  server.addHook('onRequest', async (request) => {
    const { method, url, headers } = request;
    const origin = headers.origin || 'no-origin';
    const userAgent = headers['user-agent']?.substring(0, 50) || 'unknown';
    request.log.info({
      msg: '→ REQUEST',
      method,
      url,
      origin,
      userAgent
    });
  });

  // Temporary relationship identity: mint the session cookie once per browser session so an
  // unconnected seeker keeps continuity within the visit and nothing durable is stored. Runs before
  // route handlers (and before SSE routes flush their own headers) so Set-Cookie is never too late.
  server.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    try { ensureSessionId(request, reply); } catch { /* identity is best-effort, never fatal */ }
  });

  // Add server version to every response for client-side auto-reload detection
  // Skip if headers already flushed (SSE streaming routes use reply.raw.flushHeaders)
  server.addHook('onSend', (request, reply, payload, done) => {
    if (!reply.raw.headersSent) {
      reply.header('X-Server-Version', SERVER_VERSION);
    }
    done();
  });

  // Cache policy: no-store is the DEFAULT, not a mandate. Any route that sets its own
  // Cache-Control (library tree/stats, doc pages, widget config, conversations …) keeps it —
  // that's what lets Cloudflare edge-cache the hot public reads instead of paying the tunnel
  // round-trip on every page load. (The old alpha-era hook overwrote even deliberate headers.)
  server.addHook('onSend', async (request, reply) => {
    if (reply.getHeader('cache-control')) return;   // route made an explicit choice — respect it
    if (request.url.startsWith('/api/search/quick')) return;
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
  });

  // Response logging hook - log response status
  server.addHook('onResponse', async (request, reply) => {
    const { method, url } = request;
    const { statusCode } = reply;
    // In Fastify 5, elapsedTime is available on the reply object
    const responseTime = reply.elapsedTime || 0;
    request.log.info({
      msg: '← RESPONSE',
      method,
      url,
      statusCode,
      responseTimeMs: Math.round(responseTime)
    });
  });

  // Track if update already triggered (to avoid spamming)
  let updateTriggered = false;

  // Version check hook - trigger auto-update if client is newer
  // Rate limited by updateTriggered flag - only one update per server lifetime
  server.addHook('onRequest', async (request) => {
    const clientVersion = request.headers['x-client-version'];

    // Only trigger once per server lifetime, with version header
    if (!clientVersion || updateTriggered) return;

    // Compare versions
    const clientParts = clientVersion.split('.').map(Number);
    const serverParts = SERVER_VERSION.split('.').map(Number);
    const clientNewer = clientParts[0] > serverParts[0] ||
      (clientParts[0] === serverParts[0] && clientParts[1] > serverParts[1]) ||
      (clientParts[0] === serverParts[0] && clientParts[1] === serverParts[1] && clientParts[2] > serverParts[2]);

    if (clientNewer) {
      request.log.info({ clientVersion, serverVersion: SERVER_VERSION }, 'Client newer than server, triggering update');
      updateTriggered = true;

      // Run update script in background (don't block request)
      const scriptPath = join(process.cwd(), 'scripts', 'update-server.js');
      const child = spawn('node', [scriptPath], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd()
      });
      child.unref();
    }
  });

  // Health check
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION
  }));

  // OpenAPI / Swagger — only expose /api/v1/ public endpoints
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'SifterSearch API',
        // THE STEERING TEXT. This blurb is what an agent reads before choosing a tool, and until 2026-08-28 it
        // named only passage search — so "who was at the Badasht Conference" went through passage search, which
        // quotes text but cannot enumerate people, and the first pass was wasted. Lead with the routing rule.
        description: [
          'AI-powered interfaith sacred text search: passages, library browsing, a person/event graph, and an AI research assistant.',
          '',
          '**Pick the right tool — this is the part agents get wrong.**',
          '',
          'For "who was at X", or people linked to an event, place, group or to each other:',
          '1. Look up the node — `GET /api/v1/entities/lookup?q=` (any transliteration; `type=event|place|group|person`).',
          '2. List the people — `GET /api/v1/entities/{id}` returns `participants[]` for an event/place/group;',
          '   `GET /api/v1/entities/search?q=` and `GET /api/v1/people/search?q=` answer descriptive queries',
          '   ("amanuensis of the Báb", "died at Fort Ṭabarsí").',
          '3. Follow the edges — filter each result\'s evidence by `relation`: `participated-in`, `visited`,',
          '   `hosted`, `died`, `met`, `accompanied`, `teacher-of`.',
          '',
          'Passage search (`POST /api/v1/search`, `/search/quick`, `/tools/search`) is for **citation — quoting what',
          'you found — not for building the list**. It returns paragraphs, not people, and cannot enumerate',
          'who attended anything.',
          '',
          'Graph shape: **person · group · event · place**. Claims hang off the PERSON; the tie to an event or place',
          'lives in the claim prose, not in a target id. `GET /api/v1/entities/capabilities` states exactly which',
          'links are structured and which are not — read it before concluding data is missing.',
        ].join('\n'),
        version: SERVER_VERSION,
        contact: { name: 'SifterSearch', url: 'https://siftersearch.com' }
      },
      servers: [{ url: 'https://api.siftersearch.com', description: 'Production' }],
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header', description: 'API key from Settings → API Keys' }
        }
      },
      tags: [
        { name: 'Search', description: 'Content search across sacred texts' },
        { name: 'Library', description: 'Browse and search the document library' },
        { name: 'Chat', description: 'AI-powered research assistant' },
        { name: 'System', description: 'Health checks and metadata' },
        { name: 'Entities', description: 'Person/group/event/place graph. START HERE for "who was at X" and for people linked to events or to each other — lookup the node, read its participants/evidence, filter by relation. Passage search is for quoting the result, not for building it.' }
      ]
    },
    transform: ({ schema, url, ...rest }) => {
      // Only include /api/v1/ routes in the OpenAPI spec
      if (!url.startsWith('/api/v1/')) return { schema: { ...schema, hide: true }, url, ...rest };
      return { schema, url, ...rest };
    }
  });
  await server.register(swaggerUi, {
    routePrefix: '/api/v1/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, defaultModelsExpandDepth: 1 }
  });

  // API routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(searchRoutes, { prefix: '/api/search' });
  await server.register(sessionRoutes, { prefix: '/api/session' });
  await server.register(userRoutes, { prefix: '/api/user' });
  await server.register(adminRoutes, { prefix: '/api/admin' });
  await server.register(docsRepoRoutes, { prefix: '/api/admin' });   // the ONE document surface (docs-repo)
  await server.register(entityReviewRoutes, { prefix: '/api/admin' });
  await server.register(groundingRoutes, { prefix: '/api/admin' });
  await server.register(ingestRoutes, { prefix: '/api/admin' });
  await server.register(bookNotesRoutes, { prefix: '/api/admin' });
  await server.register(companionRoutes, { prefix: '/api/admin' });
  await server.register(companionMeRoutes, { prefix: '/api/v1/companion' });
  await server.register(documentsRoutes, { prefix: '/api/documents' });
  await server.register(servicesRoutes, { prefix: '/api/services' });
  await server.register(anonymousRoutes, { prefix: '/api/anonymous' });
  await server.register(librarianRoutes, { prefix: '/api/librarian' });
  await server.register(publicApiRoutes, { prefix: '/api/v1' });
  // Content (docs + conversations) — public reads at /api/v1/docs/:slug,
  // admin writes at /api/v1/admin/docs/:slug (X-Admin-Key auth).
  const { default: contentRoutes } = await import('./routes/content.js');
  await server.register(contentRoutes, { prefix: '/api/v1' });
  await server.register(deployRoutes, { prefix: '/api/deploy' });
  await server.register(forumRoutes, { prefix: '/api/forum' });
  await server.register(donationRoutes, { prefix: '/api/donations' });
  await server.register(apiKeyRoutes, { prefix: '/api/api-keys' });
  await server.register(libraryRoutes, { prefix: '/api/library' });
  await server.register(chatRoutes, { prefix: '/api/chat' });
  await server.register(graphRoutes, { prefix: '/api/graph' });
  await server.register(peopleRoutes, { prefix: '/api/v1' });
  await server.register(deepResearchRoutes, { prefix: '/api/v1' });
  await server.register(widgetRoutes);   // SifterChat embed: /widget.js, /widget/sifter-chat.js, /api/v1/widget/config/:token (absolute paths)

  // Error handling
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  return server;
}
