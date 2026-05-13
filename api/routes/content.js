// Content CRUD routes — DB-backed docs and conversations.
//
// Public reads (no auth):       GET /api/v1/docs/:slug   GET /api/v1/docs
// Admin writes (X-Admin-Key):   PUT|DELETE /api/v1/admin/pages/:slug etc.
//
// Bodies are stored as markdown (body_md). On every write we re-render to
// body_html so reads can serve pre-rendered HTML — fast, no LLM, no rebuild.
//
// Mounted in server.js with prefix '/api/v1' so the routes match the URLs above.

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { generatePublishMetadata, generateRoundSummaries, anonymizeUserTurns, pairRounds } from '../lib/publish-pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BATCH_RUNNER = join(__dirname, '../../scripts/jafar-batch-runner.js');

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

function applyHighlightParams(html) {
  // Add ?find=<first 8 words of link text> to internal /library/ links so DocumentPresentation highlights the phrase
  return html.replace(
    /<a\s+([^>]*href="(https?:\/\/siftersearch\.com\/library\/[^"#]*)(#[^"]*)"[^>]*)>([^<]{3,})<\/a>/g,
    (match, attrs, baseUrl, fragment, linkText) => {
      const clean = linkText.replace(/[\u201C\u201D\u2018\u2019"""'']/g, '').trim();
      if (!clean) return match;
      const phrase = clean.split(/\s+/).slice(0, 8).join(' ');
      const newHref = `${baseUrl}?find=${encodeURIComponent(phrase)}${fragment}`;
      return `<a ${attrs.replace(baseUrl + fragment, newHref)}>${linkText}</a>`;
    }
  );
}

function applySmartQuotes(html) {
  // SmartyPants-style smart quotes in text nodes only (HTML tags/attrs untouched).
  // Rules (industry standard, same as Pandoc/WordPress/Jekyll):
  //   " after space/open-bracket/start → " (open)
  //   " after word-char/close-punct   → " (close)
  //   ' between word chars            → ' (apostrophe)
  //   ' after space/open-bracket/start → ' (open)
  //   ' after word-char/close-punct   → ' (close)
  const parts = html.split(/(<[^>]+>)/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    // Double quotes
    part = part.replace(/"/g, (m, offset, str) => {
      const prev = str[offset - 1] ?? '';
      return /[\s(\[{"\u201C\u2018\u2014\u2013\-]/.test(prev) || offset === 0
        ? '\u201C' : '\u201D';
    });
    // Apostrophes / single quotes
    part = part.replace(/'/g, (m, offset, str) => {
      const prev = str[offset - 1] ?? '';
      const next = str[offset + 1] ?? '';
      // Contraction / possessive: letter on left AND right
      if (/\w/.test(prev) && /\w/.test(next)) return '\u2019';
      // Opening: after space/bracket/start
      if (/[\s(\[{"\u201C\u2014\u2013\-]/.test(prev) || offset === 0) return '\u2018';
      // Closing (default)
      return '\u2019';
    });
    // &#39; entities written by the markdown parser → right single quote (no exceptions)
    part = part.replace(/&#39;/g, '\u2019');
    return part;
  }).join('');
}

function applyInlineQuoteItalics(html) {
  // Wrap curly-quoted text in <em> unless already inside <em> or <a>.
  // Targets "quoted passage" spans that are direct text content of elements.
  const parts = html.split(/(<[^>]+>)/);
  const result = [];
  let inEm = 0, inA = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      const tag = part.toLowerCase();
      if (/^<em[\s>]/.test(tag)) inEm++;
      else if (tag === '</em>') inEm = Math.max(0, inEm - 1);
      if (/^<a[\s>]/.test(tag)) inA++;
      else if (tag === '</a>') inA = Math.max(0, inA - 1);
      result.push(part);
    } else {
      // Italicize curly-quoted text only when not already inside <em> or <a>
      const transformed = (inEm > 0 || inA > 0)
        ? part
        : part.replace(/(\u201C[^\u201D]+\u201D)/g, '<em>$1</em>');
      result.push(transformed);
    }
  }
  return result.join('');
}

function renderMarkdown(md) {
  if (!md) return '';
  // Open all links in a new tab
  const renderer = new marked.Renderer();
  renderer.link = ({ href, title, tokens }) => {
    const text = tokens?.map(t => t.raw ?? t.text ?? '').join('') || '';
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  marked.setOptions({ gfm: true, breaks: false, renderer });
  let html = marked.parse(md);
  // Add sequential id="round-N-answer" to jafar-turn divs so TOC deep-links work
  let n = 0;
  html = html.replace(/<div class="jafar-turn">/g, () => `<div class="jafar-turn" id="round-${++n}-answer">`);
  html = applyHighlightParams(html);
  html = applySmartQuotes(html);
  html = applyInlineQuoteItalics(html);
  return html;
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

  // ════════════════════════════════════════════════════════════════════════════
  // DIALOGS — published_conversations rows with tenant_id='siftersearch'
  // ════════════════════════════════════════════════════════════════════════════

  const DIALOG_TENANT = 'siftersearch';

  const DIALOG_LIST_COLS = `
    slug, title, description, question, topic, tags_json, keywords_json,
    excerpt, hero_image, score, featured, rounds_count, published_at, updated_at`;

  const DIALOG_FULL_COLS = `
    slug, title, description, question, topic, tags_json, keywords_json,
    excerpt, hero_image, hero_prompt, score, featured, rounds_count,
    round_titles_json, assessment_json, body_md, published_at, updated_at`;

  // ─── Public: list published dialogs ─────────────────────────────────────
  fastify.get('/dialogs', async (req, reply) => {
    const { topic, tag, featured, limit: lim = '100' } = req.query ?? {};
    let sql = `SELECT ${DIALOG_LIST_COLS} FROM published_conversations
               WHERE tenant_id = ? AND COALESCE(status,'published') = 'published'`;
    const params = [DIALOG_TENANT];
    if (topic) { sql += ' AND topic = ?'; params.push(topic); }
    if (featured === 'true') { sql += ' AND featured = 1'; }
    if (tag) { sql += ` AND tags_json LIKE ?`; params.push(`%"${tag}"%`); }
    sql += ' ORDER BY published_at DESC, score DESC LIMIT ?';
    params.push(Math.min(parseInt(lim) || 100, 500));
    const rows = await queryAll(sql, params);
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { dialogs: rows };
  });

  // ─── Public: single dialog by slug ──────────────────────────────────────
  fastify.get('/dialogs/:slug', async (req, reply) => {
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });
    const dialog = await queryOne(
      `SELECT ${DIALOG_FULL_COLS} FROM published_conversations
       WHERE tenant_id = ? AND slug = ? AND COALESCE(status,'published') = 'published'`,
      [DIALOG_TENANT, slug]
    );
    if (!dialog) return reply.code(404).send({ error: 'not_found' });
    // Render body_html at request time — not stored in DB
    dialog.body_html = renderMarkdown(dialog.body_md);
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { dialog };
  });

  // ─── Admin: upsert dialog ────────────────────────────────────────────────
  fastify.put('/admin/dialogs/:slug', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });

    const b = req.body || {};
    if (!b.title || !b.body_md) return reply.code(400).send({ error: 'missing_field', fields: ['title', 'body_md'] });

    const existing = await queryOne(
      'SELECT id FROM published_conversations WHERE tenant_id = ? AND slug = ?',
      [DIALOG_TENANT, slug]
    );

    const vals = [
      b.title,
      b.description || null,
      b.question || null,
      b.topic || null,
      b.tags_json || '[]',
      b.keywords_json || '[]',
      b.excerpt || null,
      b.hero_image || null,
      b.hero_prompt || null,
      typeof b.score === 'number' ? b.score : 0,
      b.featured ? 1 : 0,
      typeof b.rounds_count === 'number' ? b.rounds_count : 0,
      b.round_titles_json || null,
      b.assessment_json || null,
      b.rounds_json || '[]',
      b.body_md,
      b.status || 'published',
    ];

    if (existing) {
      await query(
        `UPDATE published_conversations SET
          title=?, description=?, question=?, topic=?, tags_json=?, keywords_json=?,
          excerpt=?, hero_image=?, hero_prompt=?, score=?, featured=?, rounds_count=?,
          round_titles_json=?, assessment_json=?, rounds_json=?, body_md=?, status=?,
          updated_at=CURRENT_TIMESTAMP
         WHERE tenant_id=? AND slug=?`,
        [...vals, DIALOG_TENANT, slug]
      );
      logger.info({ slug, action: 'update' }, 'dialog: updated');
    } else {
      await query(
        `INSERT INTO published_conversations
          (tenant_id, slug, title, description, question, topic, tags_json, keywords_json,
           excerpt, hero_image, hero_prompt, score, featured, rounds_count,
           round_titles_json, assessment_json, rounds_json, body_md, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [DIALOG_TENANT, slug, ...vals]
      );
      logger.info({ slug, action: 'create' }, 'dialog: created');
    }

    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { ok: true, slug };
  });

  // ─── Admin: update hero image only ───────────────────────────────────────
  fastify.patch('/admin/dialogs/:slug/hero', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });
    const { hero_image } = req.body || {};
    if (!hero_image) return reply.code(400).send({ error: 'hero_image required' });
    await query(
      `UPDATE published_conversations SET hero_image=?, updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=? AND slug=?`,
      [hero_image, DIALOG_TENANT, slug]
    );
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { ok: true, slug, hero_image };
  });

  // ─── Admin: soft-delete dialog ───────────────────────────────────────────
  fastify.delete('/admin/dialogs/:slug', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });
    await query(
      `UPDATE published_conversations SET status='archived', updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=? AND slug=?`,
      [DIALOG_TENANT, slug]
    );
    logger.info({ slug, action: 'archive' }, 'dialog: archived');
    reply.header('Cache-Control', ADMIN_NOCACHE);
    return { ok: true, slug, status: 'archived' };
  });

  // ─── Admin: save a conversation as a dialog ────────────────────────────────
  // Takes a messages array (alternating user/assistant) + optional metadata.
  // Runs the publish pipeline (metadata generation, round summaries, optional
  // anonymization) and upserts into published_conversations.
  //
  // POST /api/v1/admin/conversations/save
  // Body: { messages, slug?, title?, description?, topic?, tags?, keywords?,
  //         excerpt?, hero_image?, hero_prompt?, anonymize?, score?, featured?,
  //         status? }
  fastify.post('/admin/conversations/save', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;

    const b = req.body || {};
    let { messages } = b;

    if (!Array.isArray(messages) || messages.length < 2) {
      return reply.code(400).send({ error: 'messages array with at least 2 entries required' });
    }

    // Always sanitize before publishing — PII must not appear in public conversations
    try { messages = await anonymizeUserTurns(messages); }
    catch (e) { logger.warn({ err: e.message }, 'sanitize failed, using original'); }

    // Generate metadata if title not provided
    let meta;
    if (!b.title) {
      meta = await generatePublishMetadata({ messages, topic_hint: b.topic });
    } else {
      meta = {
        title: b.title,
        description: b.description || '',
        slug: b.slug || b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 70),
        topic: b.topic || 'theology',
        tags: b.tags || [],
        keywords: b.keywords || [],
        excerpt: b.excerpt || ''
      };
    }

    const slug = b.slug || meta.slug;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug', slug });

    // Generate per-round h3/h4 summaries
    const rounds = pairRounds(messages);
    let roundSummaries = [];
    try { roundSummaries = await generateRoundSummaries(rounds); }
    catch (e) { logger.warn({ err: e.message }, 'round summaries failed'); }

    // Build body_md from messages + round summaries
    const bodyParts = [];
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const rs = roundSummaries[i] || {};
      const n = i + 1;
      const qHead = rs.question || `Round ${n}`;
      const aHead = rs.answer || `Response ${n}`;
      bodyParts.push(`### ${qHead}`, '');
      bodyParts.push(`<div class="user-turn" id="round-${n}">`, '', r.user, '', '</div>', '');
      bodyParts.push(`#### ${aHead}`, '');
      bodyParts.push(`<div class="jafar-turn">`, '', r.jafar, '', '</div>', '');
    }
    const body_md = bodyParts.join('\n');

    const roundTitlesJson = JSON.stringify(
      roundSummaries.map(rs => ({ user: rs.question || '', jafar: rs.answer || '' }))
    );

    const question = messages.find(m => m.role === 'user')?.content || '';

    const vals = [
      meta.title,
      meta.description || b.description || null,
      question.slice(0, 1000),
      meta.topic || b.topic || null,
      JSON.stringify(meta.tags || b.tags || []),
      JSON.stringify(meta.keywords || b.keywords || []),
      meta.excerpt || b.excerpt || null,
      b.hero_image || null,
      b.hero_prompt || null,
      typeof b.score === 'number' ? b.score : 0,
      b.featured ? 1 : 0,
      rounds.length,
      roundTitlesJson,
      null, // assessment_json — not generated here
      '[]', // rounds_json legacy
      body_md,
      b.status || 'published',
    ];

    const existing = await queryOne(
      'SELECT id FROM published_conversations WHERE tenant_id = ? AND slug = ?',
      [DIALOG_TENANT, slug]
    );

    if (existing) {
      await query(
        `UPDATE published_conversations SET
          title=?, description=?, question=?, topic=?, tags_json=?, keywords_json=?,
          excerpt=?, hero_image=?, hero_prompt=?, score=?, featured=?, rounds_count=?,
          round_titles_json=?, assessment_json=?, rounds_json=?, body_md=?, status=?,
          updated_at=CURRENT_TIMESTAMP
         WHERE tenant_id=? AND slug=?`,
        [...vals, DIALOG_TENANT, slug]
      );
      logger.info({ slug, action: 'update' }, 'dialog: saved from conversation');
    } else {
      await query(
        `INSERT INTO published_conversations
          (tenant_id, slug, title, description, question, topic, tags_json, keywords_json,
           excerpt, hero_image, hero_prompt, score, featured, rounds_count,
           round_titles_json, assessment_json, rounds_json, body_md, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [DIALOG_TENANT, slug, ...vals]
      );
      logger.info({ slug, action: 'create' }, 'dialog: saved from conversation');
    }

    reply.header('Cache-Control', ADMIN_NOCACHE);
    return {
      ok: true,
      slug,
      url: `https://siftersearch.com/dialogue/${slug}/`,
      title: meta.title,
      topic: meta.topic,
      tags: meta.tags,
      rounds: rounds.length,
    };
  });

  // ─── Admin: generate a new dialog from a seed question (SSE) ──────────────
  // POST /api/v1/admin/dialogs/generate
  // Body: { title, question, topic?, tags?, keywords?, heroPrompt? }
  // Streams batch-runner stdout as SSE. Final "done" event carries { slug, url }.
  fastify.post('/admin/dialogs/generate', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const b = req.body || {};
    if (!b.title || !b.question) return reply.code(400).send({ error: 'title and question required' });

    const tmpFile = join(tmpdir(), `gen-dialog-${Date.now()}.json`);
    writeFileSync(tmpFile, JSON.stringify([b]));

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const child = spawn('node', [BATCH_RUNNER, '--questions', tmpFile, '--min-score', '75', '--max-retries', '3'], {
      env: { ...process.env, JAFAR_API_URL: 'http://localhost:7839/api/chat/stream' },
    });
    child.stdout.on('data', d => res.write(`data: ${String(d).replace(/\n/g, '\ndata: ')}\n\n`));
    child.stderr.on('data', d => res.write(`data: [err] ${String(d).trim()}\n\n`));
    child.on('close', () => {
      try { unlinkSync(tmpFile); } catch {}
      res.write('event: done\ndata: {}\n\n');
      res.end();
    });
  });

  // ─── Admin: regenerate an existing dialog (SSE) ───────────────────────────
  // POST /api/v1/admin/dialogs/:slug/regenerate
  // Keeps slug, title, hero_image. Re-runs Jafar from the stored question.
  // Streams batch-runner stdout as SSE.
  fastify.post('/admin/dialogs/:slug/regenerate', async (req, reply) => {
    if (!requireAdminKey(req, reply)) return;
    const { slug } = req.params;
    if (!isValidSlug(slug)) return reply.code(400).send({ error: 'invalid_slug' });

    const existing = await queryOne(
      'SELECT title, question, topic, tags_json, keywords_json, hero_image, hero_prompt FROM published_conversations WHERE tenant_id=? AND slug=?',
      [DIALOG_TENANT, slug]
    );
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const q = {
      slug,
      title: existing.title,
      question: existing.question,
      topic: existing.topic,
      tags: JSON.parse(existing.tags_json || '[]'),
      keywords: JSON.parse(existing.keywords_json || '[]'),
      heroImage: existing.hero_image || null,
      heroPrompt: existing.hero_prompt || null,
    };

    const tmpFile = join(tmpdir(), `regen-dialog-${Date.now()}.json`);
    writeFileSync(tmpFile, JSON.stringify([q]));

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const child = spawn('node', [BATCH_RUNNER, '--questions', tmpFile, '--rerun', '--min-score', '75', '--max-retries', '3'], {
      env: { ...process.env, JAFAR_API_URL: 'http://localhost:7839/api/chat/stream' },
    });
    child.stdout.on('data', d => res.write(`data: ${String(d).replace(/\n/g, '\ndata: ')}\n\n`));
    child.stderr.on('data', d => res.write(`data: [err] ${String(d).trim()}\n\n`));
    child.on('close', () => {
      try { unlinkSync(tmpFile); } catch {}
      res.write(`event: done\ndata: {"slug":"${slug}","url":"https://siftersearch.com/dialogue/${slug}/"}\n\n`);
      res.end();
    });
  });
}
