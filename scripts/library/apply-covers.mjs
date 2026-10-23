#!/usr/bin/env node
// Apply Chad's Bindery cover map (book id → image URL) to library docs BY TITLE (api/lib/library/cover-match.js).
// An internal-API client: finds docs via /api/library/documents?search, sets covers via POST /api/covers/:docId (the
// server copies the image into our own storage). "Already right" = the doc's cover hash equals the image's sha256[:12].
// Dry run by default; writes a Markdown report.
//   node scripts/library/apply-covers.mjs --map <covers.json> [--bindery <export.json>] [--report tmp/covers-apply-report.md]
//        [--only id,id] [--skip id,id] [--cache tmp/covers-search-cache.json] [--apply]
// Env: SIFTER_API (default https://api.siftersearch.com), DEPLOY_SECRET (X-Internal-Key, from .env-secrets).
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { matchCovers, foldTitle, coverVersion } from '../../api/lib/library/cover-match.js';

dotenv.config({ path: '.env-secrets', quiet: true });
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const list = (k) => new Set((opt(k) || '').split(',').filter(Boolean));
const MAP = opt('--map'), BINDERY = opt('--bindery'), REPORT = opt('--report', 'tmp/covers-apply-report.md');
const CACHE = opt('--cache');
const ONLY = list('--only'), SKIP = list('--skip'), APPLY = process.argv.includes('--apply');
const API = process.env.SIFTER_API || 'https://api.siftersearch.com';
const headers = { 'Content-Type': 'application/json', 'User-Agent': 'sifter-apply-covers', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' };
if (!MAP) throw new Error('--map is required');

const covers = JSON.parse(readFileSync(MAP, 'utf8'));
const exportJson = BINDERY ? JSON.parse(readFileSync(BINDERY, 'utf8'))
  : await (await fetch('https://bindery.lnker.com/api/libraries/oceanlibrary', { signal: AbortSignal.timeout(60000) })).json();
const meta = new Map(exportJson.project.books.map((b) => [b.id, b]));
const books = Object.keys(covers).filter((id) => (!ONLY.size || ONLY.has(id)) && !SKIP.has(id))
  .map((id) => ({ id, title: meta.get(id)?.title || '', author: meta.get(id)?.author === 'None' ? '' : (meta.get(id)?.author || '') }));
const noMeta = books.filter((b) => !b.title).map((b) => b.id);

// candidate docs per title: FTS on the main title with volume words dropped (the matcher decides)
// (--cache keeps the searches for a re-run; drop it before --apply so covers set since are seen)
const searches = new Map(CACHE ? Object.entries((() => { try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return {}; } })()) : []);
const queryOf = (b) => foldTitle(String(b.title).split(/:\s+/)[0]).replace(/\bvolume \d+\b/g, '').trim();
for (const b of books.filter((x) => x.title && !x.id.startsWith('col-'))) {
  const q = queryOf(b);
  if (searches.has(q)) continue;
  const r = await fetch(`${API}/api/library/documents?${new URLSearchParams({ search: q, limit: '200' })}`, { headers, signal: AbortSignal.timeout(60000) });
  searches.set(q, r.ok ? (await r.json()).documents || [] : []);
  await new Promise((res) => setTimeout(res, 100));
}
if (CACHE) writeFileSync(CACHE, JSON.stringify(Object.fromEntries(searches)));
const results = matchCovers(books.filter((b) => b.title), (b) => searches.get(queryOf(b)) || []);

// already right? compare the doc's cover hash with the image's (fetched once per matched book that has a covered doc)
const sha = async (url) => createHash('sha256').update(Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer())).digest('hex').slice(0, 12);
const rows = { applied: [], already: [], failed: [], ambiguous: [], unmatched: [], collection: [] };
for (const r of results) {
  if (r.status !== 'matched') { rows[r.status].push(r); continue; }
  const v = r.docs.some((d) => d.cover_url) ? await sha(covers[r.book.id]).catch(() => null) : null;
  for (const d of r.docs) {
    if (v && coverVersion(d.cover_url) === v) { rows.already.push({ book: r.book, doc: d }); continue; }
    if (!APPLY) { rows.applied.push({ book: r.book, doc: d, dry: true }); continue; }
    const res = await fetch(`${API}/api/covers/${d.id}`, { method: 'POST', headers, body: JSON.stringify({ url: covers[r.book.id], source: 'bindery-oceanlibrary-covers', rights: "Chad's generated OceanLibrary covers" }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) rows.applied.push({ book: r.book, doc: d, url: j.url }); else rows.failed.push({ book: r.book, doc: d, error: `${res.status} ${j.error || ''}` });
    await new Promise((res2) => setTimeout(res2, 150));
  }
}

const docCell = (d) => `${d.id} “${d.title}” — ${d.author || '?'}${d.cover_url ? ` (had ${d.cover_url})` : ' (no cover)'}`;
const md = [
  `# Covers apply report — ${new Date().toISOString()}${APPLY ? '' : ' (DRY RUN)'}`, '',
  `Map: ${MAP} (${Object.keys(covers).length} covers). Considered ${books.length}${SKIP.size ? `, skipped ${[...SKIP].join(', ')}` : ''}.`, '',
  `| result | count |`, `|---|---|`,
  `| matched books | ${results.filter((r) => r.status === 'matched').length} |`,
  `| ${APPLY ? 'applied' : 'would apply'} (docs) | ${rows.applied.length} |`, `| already right (docs) | ${rows.already.length} |`,
  `| failed (docs) | ${rows.failed.length} |`, `| ambiguous (books) | ${rows.ambiguous.length} |`, `| unmatched (books) | ${rows.unmatched.length} |`,
  `| collection covers (not docs) | ${rows.collection.length} |`, `| no Bindery metadata | ${noMeta.length} |`, '',
  `## ${APPLY ? 'Applied' : 'Would apply'}`, ...rows.applied.map((x) => `- \`${x.book.id}\` → ${docCell(x.doc)}${x.url ? ` → ${x.url}` : ''}`), '',
  '## Failed', ...rows.failed.map((x) => `- \`${x.book.id}\` → ${docCell(x.doc)}: ${x.error}`), '',
  '## Ambiguous (not applied — decide by hand)', ...rows.ambiguous.map((x) => `- \`${x.book.id}\` “${x.book.title}” — ${x.reason}\n${x.docs.map((d) => `  - ${docCell(d)}`).join('\n')}`), '',
  '## Unmatched (no doc with this title)', ...rows.unmatched.map((x) => `- \`${x.book.id}\` “${x.book.title}” — ${x.book.author || '?'}`), '',
  '## Collection / work covers', ...rows.collection.map((x) => `- \`${x.book.id}\` “${x.book.title}”`), '',
  '## Already right', ...rows.already.map((x) => `- \`${x.book.id}\` → ${x.doc.id} “${x.doc.title}”`), '',
  ...(noMeta.length ? ['## No Bindery metadata', ...noMeta.map((id) => `- \`${id}\``), ''] : []),
].join('\n');
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, md);
console.log(JSON.stringify({ report: REPORT, applied: rows.applied.length, already: rows.already.length, failed: rows.failed.length, ambiguous: rows.ambiguous.length, unmatched: rows.unmatched.length, collection: rows.collection.length }));
