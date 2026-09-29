// Document metadata endpoints. Admin (/api/admin): capture frontmatter from the files, load Phelps' raw rows and
// bibliography, link notes, rebuild doc_meta + its own Meili index. Public (/api/documents): GET /:id/about.
// :deps: lib/tablet-meta.js (pure merge) · db.js (reads; writes go through the single writer via transaction)
// :edge: the ingester flattens frontmatter arrays to strings, so frontmatter is re-read from the file with gray-matter.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import matter from 'gray-matter';
import { queryAll, queryOne, transaction } from '../lib/db.js';
import { config } from '../lib/config.js';
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { buildDocMeta, contextLine, indexDoc, DOC_META_INDEX, DOC_META_SETTINGS } from '../lib/doc-meta.js';
import { getMeili } from '../lib/search.js';

const admin = { preHandler: requireInternal };
const inChunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export default async function tabletAdminRoutes(fastify) {
  /** POST /tablets/frontmatter {dir, dryRun=true} — store each doc's full frontmatter (arrays intact) in docs.frontmatter. */
  fastify.post('/tablets/frontmatter', admin, async (req) => {
    const { dir, dryRun = true } = req.body || {};
    if (!dir) throw ApiError.badRequest('dir required (library-relative, e.g. "Baha\'i/Core Tablets")');
    const docs = await queryAll(`SELECT id, file_path FROM docs WHERE deleted_at IS NULL AND file_path LIKE ? || '%'`, [dir], 'tablets:fm-docs');
    let found = 0, missing = 0; const rows = [];
    for (const d of docs) {
      try {
        const { data } = matter(await readFile(resolve(config.library.basePath, d.file_path), 'utf8'));
        if (Object.keys(data || {}).length) { rows.push([JSON.stringify(data), d.id]); found++; }
      } catch { missing++; }
    }
    if (!dryRun) for (const part of inChunks(rows, 500)) await transaction(part.map(([fm, id]) => ({ sql: 'UPDATE docs SET frontmatter = ? WHERE id = ?', args: [fm, id] })), 'tablets:fm-write');
    return { dryRun, docs: docs.length, withFrontmatter: found, unreadable: missing };
  });

  /** POST /tablets/inventory-raw {rows:[{pin, raw}]} — Phelps' complete CSV row per PIN (inventory_items.raw). */
  fastify.post('/tablets/inventory-raw', admin, async (req) => {
    const rows = req.body?.rows || [];
    if (!rows.length || rows.length > 5000) throw ApiError.badRequest('1..5000 rows');
    await transaction(rows.map((r) => ({ sql: 'UPDATE inventory_items SET raw = ? WHERE pin = ?', args: [JSON.stringify(r.raw), r.pin] })), 'tablets:inv-raw');
    return { written: rows.length };
  });

  /** POST /tablets/bib {rows:[{code, citation, url}]} — Phelps' bibliography: source code → citation. */
  fastify.post('/tablets/bib', admin, async (req) => {
    const rows = req.body?.rows || [];
    if (!rows.length || rows.length > 5000) throw ApiError.badRequest('1..5000 rows');
    await transaction(rows.map((r) => ({ sql: `INSERT INTO bib_codes (code, citation, url) VALUES (?,?,?)
      ON CONFLICT (code) DO UPDATE SET citation = excluded.citation, url = excluded.url`, args: [r.code, r.citation, r.url ?? null] })), 'tablets:bib');
    return { written: rows.length };
  });

  /**
   * POST /tablets/notes {rows:[{notesDocId, tabletDocId, basis}]} — link oceanoflights notes to their tablet, mark them
   * doc_role 'notes' and attribute them to oceanoflights' editors (they are scholarship, not the Writings), and send
   * their paragraphs back to search with the new author.
   */
  fastify.post('/tablets/notes', admin, async (req) => {
    const rows = req.body?.rows || [];
    if (!rows.length || rows.length > 2000) throw ApiError.badRequest('1..2000 rows');
    const notes = [...new Set(rows.map((r) => r.notesDocId))];
    await transaction([
      ...rows.map((r) => ({ sql: `INSERT INTO tablet_notes (tablet_doc_id, notes_doc_id, basis) VALUES (?,?,?)
        ON CONFLICT DO NOTHING`, args: [r.tabletDocId, r.notesDocId, r.basis ?? null] })),
      ...notes.flatMap((id) => [
        { sql: `UPDATE docs SET doc_role = 'notes', author = 'oceanoflights (notes)' WHERE id = ?`, args: [id] },
        { sql: 'UPDATE content SET synced = 0 WHERE doc_id = ? AND deleted_at IS NULL', args: [id] }]),
    ], 'tablets:notes');
    return { links: rows.length, notesDocs: notes.length };
  });

  /**
   * POST /docmeta/rebuild {dir, index=true} — one sourced record per document under dir (doc_meta): tablets merge
   * frontmatter + Phelps' row (the doc's own pin, else its inventory link) + linked notes; books use their library row +
   * frontmatter. Then (re)fills the SEPARATE Meili index doc_meta — never the paragraphs index. Notes docs get no record.
   * /tablets/rebuild is the same call (kept for the scripts that use it).
   */
  const rebuild = async (req) => {
    const { dir, index = true } = req.body || {};
    if (dir == null) throw ApiError.badRequest('dir required ("" = the whole library)');
    const bib = Object.fromEntries((await queryAll('SELECT code, citation, url FROM bib_codes', [], 'docmeta:bib-read')).map((b) => [b.code, b]));
    const docs = await queryAll(`SELECT d.id, d.frontmatter, d.title, d.author, d.religion, d.collection, d.language, d.year,
        d.description, d.metadata, d.doc_role,
        (SELECT l.pin FROM inventory_links l WHERE l.doc_id = d.id ORDER BY l.coverage DESC LIMIT 1) AS linked_pin
        FROM docs d WHERE d.deleted_at IS NULL AND d.file_path LIKE ? || '%'`, [dir], 'docmeta:rebuild-docs');
    const fms = new Map(docs.map((d) => [d.id, parse(d.frontmatter) || {}]));
    const notesFor = new Map();
    for (const part of inChunks(docs.map((d) => d.id), 500)) {
      for (const n of await queryAll(`SELECT t.tablet_doc_id, n.id, n.title, n.language FROM tablet_notes t JOIN docs n ON n.id = t.notes_doc_id
          WHERE n.deleted_at IS NULL AND t.tablet_doc_id IN (${part.map(() => '?').join(',')})`, part, 'docmeta:notes-read')) {
        notesFor.set(n.tablet_doc_id, [...(notesFor.get(n.tablet_doc_id) || []), { docId: n.id, title: n.title, language: n.language }]);
      }
    }
    const pins = [...new Set(docs.map((d) => fms.get(d.id).pin || fms.get(d.id).catalog_ref || d.linked_pin).filter(Boolean))];
    const raws = new Map();
    for (const part of inChunks(pins, 500)) {
      for (const r of await queryAll(`SELECT pin, raw FROM inventory_items WHERE pin IN (${part.map(() => '?').join(',')})`, part, 'docmeta:inv-read')) raws.set(r.pin, parse(r.raw) || {});
    }
    const out = [];
    for (const d of docs) {
      if (d.doc_role === 'notes') continue;                         // a notes document describes a tablet; it isn't one
      const fm = fms.get(d.id);
      const pin = fm.pin || fm.catalog_ref || d.linked_pin || null;
      const meta = buildDocMeta({ doc: d, fm, pi: pin ? raws.get(pin) || { PIN: pin } : null, bib, notes: notesFor.get(d.id) || [] });
      out.push({ meta, row: [d.id, meta.kind, JSON.stringify(meta), contextLine(meta)] });
    }
    for (const part of inChunks(out, 400)) await transaction(part.map(({ row }) => ({ sql: `INSERT INTO doc_meta (doc_id, kind, meta, context, built_at)
      VALUES (?,?,?,?, unixepoch()) ON CONFLICT (doc_id) DO UPDATE SET kind = excluded.kind, meta = excluded.meta,
      context = excluded.context, built_at = excluded.built_at`, args: row })), 'docmeta:rebuild-write');
    let indexed = 0;
    if (index && out.length) {
      const meili = getMeili();
      try { await meili.createIndex(DOC_META_INDEX, { primaryKey: 'id' }); } catch { /* exists */ }
      await meili.index(DOC_META_INDEX).updateSettings(DOC_META_SETTINGS);   // this small index only
      for (const part of inChunks(out, 5000)) { await meili.index(DOC_META_INDEX).addDocuments(part.map(({ meta }) => indexDoc(meta))); indexed += part.length; }
    }
    return { docs: docs.length, built: out.length, tablets: out.filter((o) => o.meta.kind === 'tablet').length, indexed };
  };
  fastify.post('/docmeta/rebuild', admin, rebuild);
  fastify.post('/tablets/rebuild', admin, rebuild);
}

/** Public: GET /api/documents/:id/about — the document's metadata record (reader box, chat "about this book"). */
export async function tabletPublicRoutes(fastify) {
  fastify.get('/:id/about', async (req, reply) => {
    const id = Number(req.params.id);
    const row = await queryOne('SELECT meta FROM doc_meta WHERE doc_id = ?', [id], 'docmeta:about')
      || await queryOne('SELECT meta FROM tablet_meta WHERE doc_id = ?', [id], 'docmeta:about-legacy');
    if (!row) return reply.code(404).send({ error: 'NotFound', message: 'No metadata for this document' });
    reply.header('Cache-Control', 'public, max-age=300');
    return parse(row.meta);
  });
}
