#!/usr/bin/env node
// Import book covers from a map of { md5(OceanLibrary bookid) → image URL } (Chad's generated OceanLibrary covers,
// 10-10): fetch each image ONCE, store it as the cover original on tower with provenance (api/lib/covers.js), and set
// docs.cover_url to its image-service URL. Matching: md5(docs.external_id) for source_site oceanlibrary.com. Runs ON
// tower (SIFTER_WRITER_URL). Dry run by default.
//   node scripts/library/import-covers.mjs --map <json> --source <label> --rights "<terms>" [--bindery <project.json>] [--ids 1,2] [--replace] [--apply]
// --bindery: the Bindery library export (GET bindery.lnker.com/api/libraries/oceanlibrary). Its books carry the
// OceanLibrary source URL, so a doc whose bookid hash misses (ids drifted between exports; copies filed outside the
// OceanLibrary folder have no bookid) still finds its cover by source URL (10-10: 94 books had none).
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { listDocs, setDocCover } from '../../api/lib/docs-repo.js';
import { storeCover } from '../../api/lib/covers.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const MAP = opt('--map'), SOURCE = opt('--source'), RIGHTS = opt('--rights'), BINDERY = opt('--bindery');
const ONLY = opt('--ids') ? new Set(opt('--ids').split(',').map(Number)) : null;   // limit to these doc ids (e.g. covers Chad regenerated)
const APPLY = process.argv.includes('--apply'), REPLACE = process.argv.includes('--replace');
if (!MAP || !SOURCE || !RIGHTS) throw new Error('--map, --source and --rights are required (provenance is stored with every cover)');
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const covers = JSON.parse(readFileSync(MAP, 'utf8'));

const docs = [];
for (let after = 0; ;) {
  const page = await listDocs({ sourceSite: 'oceanlibrary.com', afterId: after, fields: ['id', 'title', 'external_id', 'cover_url', 'source_url'], limit: 1000 });
  if (!page.docs.length) break;
  docs.push(...page.docs); after = page.docs[page.docs.length - 1].id;
}
const md5 = (s) => createHash('md5').update(s).digest('hex');
const srcSlug = (u) => String(u || '').replace(/^https?:\/\/(www\.)?oceanlibrary\.com\//, '').replace(/\/+$/, '').toLowerCase();
const bySource = new Map(BINDERY ? JSON.parse(readFileSync(BINDERY, 'utf8')).project.books.filter((b) => b.source).map((b) => [srcSlug(b.source), b.id]) : []);
// last resort: the folded title, only when exactly ONE Bindery book carries it (never guess between two)
const foldT = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const titleCount = new Map(), byTitle = new Map();
if (BINDERY) for (const b of JSON.parse(readFileSync(BINDERY, 'utf8')).project.books) {
  const k = foldT(b.title); titleCount.set(k, (titleCount.get(k) || 0) + 1); byTitle.set(k, b.id);
}
/** The cover URL for a doc: by bookid hash, else (with --bindery) by its OceanLibrary source URL, else a unique title. */
const coverFor = (d) => (d.external_id && covers[md5(d.external_id)]) || covers[bySource.get(srcSlug(d.source_url))]
  || (titleCount.get(foldT(d.title)) === 1 ? covers[byTitle.get(foldT(d.title))] : null) || null;
const work = docs.filter((d) => (!ONLY || ONLY.has(d.id)) && coverFor(d) && (REPLACE || !d.cover_url));
console.log(JSON.stringify({ oceanlibraryDocs: docs.length, coversInMap: Object.keys(covers).length, toImport: work.length,
  alreadyHaveCover: docs.filter((d) => d.cover_url).length, noMatch: docs.filter((d) => !coverFor(d)).map((d) => `${d.id} ${d.title}`).slice(0, 200) }));
if (!APPLY) process.exit(0);

let ok = 0; const failed = [];
for (const d of work) {
  const src = coverFor(d);
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stored = await storeCover(d.id, Buffer.from(await res.arrayBuffer()), { source: SOURCE, url: src, rights: RIGHTS, bookid: d.external_id || null });
    await setDocCover(d.id, stored.url);
    ok++;
  } catch (e) { failed.push({ id: d.id, title: d.title, error: String(e.message || e).slice(0, 120) }); }
  await new Promise((r) => setTimeout(r, 150));   // gentle on the source host
}
console.log(JSON.stringify({ finished: true, imported: ok, failed }));
process.exit(0);
