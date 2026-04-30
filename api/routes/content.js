// Content CRUD routes — DB-backed docs and conversations.
//
// Public reads (no auth):       GET /api/v1/docs/:slug   GET /api/v1/docs
// Admin writes (X-Admin-Key):   PUT|DELETE /api/v1/admin/pages/:slug etc.
//
// Bodies are stored as markdown (body_md). On every write we re-render to
// body_html so reads can serve pre-rendered HTML — fast, no LLM, no rebuild.
//
// Mounted in server.js with prefix '/api/v1' so the routes match the URLs above.

import { marked } from 'marked';
import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// Edge cache headers for public reads. 5-min Cloudflare cache + 24h
// stale-while-revalidate keeps origin load near zero on hot pages while
// updates propagate within minutes when content changes.
const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';
const ADMIN_NOCACHE = 'private, no-store';

// ─── Auth: bearer-style admin key from env ────────────────────────────────────
function requireAdminKey(req, reply) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    reply.code(503).send({ error: 'admin_key_unconfigured' });
    return false;
  }
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== expected) {
    reply.code(401).send({ error: 'invalid_admin_key' });
    return false;
  }
  return true;
}

function renderMarkdown(md) {
  if (!md) return '';
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(md);
}

// Slug validator — kebab-case, no slashes
function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length <= 100;
}

export default async function contentRoutes(fastify) {
  // ─── Public: list docs (only published) ─────────────────────────────────────
  fastify.get('/pages', async (req, reply) => {
    const section = req.query?.section;
    let sql = 'SELECT slug, section, nav_label, sort_order, title, description, layout, updated_at FROM doc_pages WHERE status = ?';
    const params = ['published'];
    if (section) { sql += ' AND section = ?'; params.push(section); }
    sql += ' ORDER BY section, sort_order, title';
    const rows = await queryAll(sql, params);
    reply.header('Cache-Control', PUBLIC_CACHE);
    return { docs: rows };
  });

  // ─── Public: single doc by slug ─────────────────────────────────────────────
  fastify.get('/pages/:slug', async (req, reply) => {
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });
    const doc = await queryOne(
      `SELECT slug, section, nav_label, sort_order, title, description,
              body_html, layout, active_section, updated_at
         FROM doc_pages WHERE slug = ? AND status = 'published'`,
      [slug]
    );
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    reply.header('Cache-Control', PUBLIC_CACHE);
    return { doc };
  });

  // ─── Public: single conversation by slug + tenant ──────────────────────────
  fastify.get('/conversations/:tenant/:slug', async (req, reply) => {
    const { tenant, slug } = req.params;
    const conv = await queryOne(
      `SELECT slug, tenant_id, title, description, question, topic, tags_json,
              keywords_json, excerpt, hero_image, rounds_json, body_html,
              published_at, updated_at
         FROM published_conversations
        WHERE tenant_id = ? AND slug = ?
          AND COALESCE(status, 'published') = 'published'`,
      [tenant, slug]
    );
    if (!conv) return reply.code(404).send({ error: 'not_found' });
    reply.header('Cache-Control', PUBLIC_CACHE);
    return { conversation: conv };
  });

  // ─── Admin: list ALL docs (including draft + archived) ─────────────────────
  fastify.get('/admin/pages', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const rows = await queryAll(
      `SELECT slug, section, nav_label, sort_order, title, description, status, layout,
              created_at, updated_at, length(body_md) AS body_length
         FROM doc_pages
         ORDER BY section, sort_order, title`
    );
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { docs: rows };
  });

  // ─── Admin: get one doc with raw markdown ─────────────────────────────────
  fastify.get('/admin/pages/:slug', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });
    const doc = await queryOne('SELECT * FROM doc_pages WHERE slug = ?', [slug]);
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { doc };
  });

  // ─── Admin: upsert (create or update) a doc ─────────────────────────────
  fastify.put('/admin/pages/:slug', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });

    const body = req.body || {};
    const required = ['title', 'body_md'];
    for (const f of required) {
      if (typeof body[f] !== 'string' || !body[f].trim()) {
        return reply.code(400).send({ error: 'missing_field', field: f });
      }
    }

    const html = renderMarkdown(body.body_md);
    const existing = await queryOne('SELECT id FROM doc_pages WHERE slug = ?', [slug]);

    if (existing) {
      await query(
        `UPDATE doc_pages
            SET section = ?, nav_label = ?, sort_order = ?, title = ?,
                description = ?, body_md = ?, body_html = ?, layout = ?,
                status = ?, active_section = ?, updated_at = CURRENT_TIMESTAMP
          WHERE slug = ?`,
        [
          body.section || null,
          body.nav_label || null,
          typeof body.sort_order === 'number' ? body.sort_order : 100,
          body.title,
          body.description || null,
          body.body_md,
          html,
          body.layout || 'docs',
          body.status || 'published',
          body.active_section || slug,
          slug
        ]
      );
      logger.info({ slug, action: 'update' }, 'doc_pages: updated');
    } else {
      await query(
        `INSERT INTO doc_pages (slug, section, nav_label, sort_order, title,
            description, body_md, body_html, layout, status, active_section)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          slug,
          body.section || null,
          body.nav_label || null,
          typeof body.sort_order === 'number' ? body.sort_order : 100,
          body.title,
          body.description || null,
          body.body_md,
          html,
          body.layout || 'docs',
          body.status || 'published',
          body.active_section || slug
        ]
      );
      logger.info({ slug, action: 'create' }, 'doc_pages: created');
    }

    // TODO: Cloudflare cache-purge call once CF_API_TOKEN + zone are configured.

    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { ok: true, slug };
  });

  // ─── Admin: soft-delete a doc (status=archived) ────────────────────────
  fastify.delete('/admin/pages/:slug', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });
    const result = await query(
      `UPDATE doc_pages SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
      [slug]
    );
    if (!result.rows[0].changes) return reply.code(404).send({ error: 'not_found' });
    logger.info({ slug, action: 'archive' }, 'doc_pages: archived');
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { ok: true, slug, status: 'archived' };
  });
}
