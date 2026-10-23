// RIGHTS-ISBN — Chad 10-23: "with non-canonical books with ISBN codes, we should consider them copyright encumbered and the
// first 40 paragraphs is all we do"; narrowed: "This applies to published books." Over every live document: canonical?
// (rights/canonical.js) → what type? → its OWN ISBN (metadata, the file's frontmatter, or its copyright page in the first
// 40 paragraphs; rights/isbn.js — a cited ISBN never counts). A non-canonical BOOK with its own ISBN → encumbered = 1,
// rights_reason 'isbn-noncanonical'. Nothing is ever un-encumbered; nothing but books changes. Dry run unless write:true.
// params { write = false, ids?, limit? (docs scanned, for a trial), samples = 30, checks = 10 }
import { readFile } from 'fs/promises';
import { join } from 'path';
import { rightsScanPage, frontParagraphs, recordIsbnRights } from '../repos/rights-repo.js';
import { canonicalOf, docType } from '../rights/canonical.js';
import { ownIsbn, FRONT_PARAGRAPHS } from '../rights/isbn.js';

const parseJson = (s) => { if (!s) return null; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return null; } };
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

export async function rightsIsbnJob({ write = false, ids = null, limit = Infinity, samples = 30, checks = 10 } = {}, deps = {}) {
  const { page = rightsScanPage, front = frontParagraphs, record = recordIsbnRights,
    readText = (p) => readFile(p, 'utf8'),
    parseFm = async (t) => (await import('../../services/ingester.js')).parseMarkdownFrontmatter(t).metadata,
    base = (await import('../config.js')).config.library.basePath, random = Math.random } = deps;
  const out = { write, scanned: 0, canonical: {}, noncanonical_by_type: {}, own_isbn_by_type: {}, own_isbn_by_source: {},
    would_encumber: 0, already_encumbered_books: 0, by_religion: {}, by_collection: {}, by_source_site: {}, isbn_recorded: 0, encumbered_now: 0,
    file_unreadable: 0, flagged: [] };
  const idSet = ids?.length ? new Set(ids.map(Number)) : null;
  let afterId = 0;
  scan: for (;;) {
    const rows = await page({ afterId, limit: 500 });
    if (!rows.length) break;
    afterId = rows[rows.length - 1].id;
    for (const d of rows) {
      if (idSet && !idSet.has(d.id)) continue;
      if (out.scanned >= limit) break scan;
      out.scanned++;
      const c = canonicalOf(d);
      if (c.canonical) { bump(out.canonical, c.basis.startsWith('collection:') ? 'collection' : c.basis); continue; }
      const meta = { ...(parseJson(d.frontmatter) || {}), ...(parseJson(d.metadata) || {}) };
      const type = docType({ ...d, document_type: meta.documentType });
      bump(out.noncanonical_by_type, type);
      // the main library's own file: its frontmatter may carry the ISBN (Dewey writes it) — read for books only
      if (type === 'book' && d.file_path && !d.source_site) {
        try { Object.assign(meta, await parseFm(await readText(d.file_path.startsWith('/') ? d.file_path : join(base, d.file_path)))); }
        catch { out.file_unreadable++; }
      }
      const own = ownIsbn({ meta, paragraphs: await front(d.id, FRONT_PARAGRAPHS) });
      if (!own) continue;
      bump(out.own_isbn_by_type, type); bump(out.own_isbn_by_source, own.source);
      const encumber = type === 'book';
      if (encumber) {
        if (d.encumbered) out.already_encumbered_books++;
        else {
          out.would_encumber++;
          bump(out.by_religion, d.religion || '?'); bump(out.by_collection, `${d.religion || '?'} / ${d.collection || '?'}`);
          bump(out.by_source_site, d.source_site || 'library');
          out.flagged.push({ id: d.id, title: d.title, author: d.author, collection: d.collection, source_site: d.source_site || 'library',
            paragraphs: d.paragraph_count, isbn: own.isbn13, source: own.source, evidence: own.evidence, paragraph_index: own.paragraph_index ?? null });
        }
      }
      if (write && (own.isbn13 !== d.isbn || (encumber && !d.encumbered))) {
        const r = await record(d.id, { isbn: own.isbn13, encumber: encumber && !d.encumbered });
        if (r.changed) { out.isbn_recorded++; if (encumber && !d.encumbered) out.encumbered_now++; }
      }
    }
  }
  // the report: sample titles + a random false-positive check (each with its evidence line)
  const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
  const flagged = out.flagged;
  return { ...out, flagged: undefined, samples: pick(flagged, samples).map((f) => ({ id: f.id, title: f.title, author: f.author, collection: f.collection })),
    false_positive_check: pick(flagged, checks), flagged_ids: flagged.map((f) => f.id), flagged_all: flagged };
}
