#!/usr/bin/env node
// Import book covers from a map of { md5(OceanLibrary bookid) → image URL } (Chad's generated OceanLibrary covers,
// 10-10): fetch each image ONCE, store it as the cover original on tower with provenance (api/lib/covers.js), and set
// docs.cover_url to its image-service URL. Matching: md5(docs.external_id) for source_site oceanlibrary.com. Runs ON
// tower (SIFTER_WRITER_URL). Dry run by default.
//   node scripts/library/import-covers.mjs --map <json> --source <label> --rights "<terms>" [--replace] [--apply]
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { listDocs, setDocCover } from '../../api/lib/docs-repo.js';
import { storeCover } from '../../api/lib/covers.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const MAP = opt('--map'), SOURCE = opt('--source'), RIGHTS = opt('--rights');
const APPLY = process.argv.includes('--apply'), REPLACE = process.argv.includes('--replace');
if (!MAP || !SOURCE || !RIGHTS) throw new Error('--map, --source and --rights are required (provenance is stored with every cover)');
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const covers = JSON.parse(readFileSync(MAP, 'utf8'));

const docs = [];
for (let after = 0; ;) {
  const page = await listDocs({ sourceSite: 'oceanlibrary.com', afterId: after, fields: ['id', 'title', 'external_id', 'cover_url'], limit: 1000 });
  if (!page.docs.length) break;
  docs.push(...page.docs); after = page.docs[page.docs.length - 1].id;
}
const md5 = (s) => createHash('md5').update(s).digest('hex');
const work = docs.filter((d) => d.external_id && covers[md5(d.external_id)] && (REPLACE || !d.cover_url));
console.log(JSON.stringify({ oceanlibraryDocs: docs.length, coversInMap: Object.keys(covers).length, toImport: work.length,
  alreadyHaveCover: docs.filter((d) => d.cover_url).length, noMatch: docs.filter((d) => !d.external_id || !covers[md5(d.external_id)]).map((d) => d.title).slice(0, 200) }));
if (!APPLY) process.exit(0);

let ok = 0; const failed = [];
for (const d of work) {
  const src = covers[md5(d.external_id)];
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stored = await storeCover(d.id, Buffer.from(await res.arrayBuffer()), { source: SOURCE, url: src, rights: RIGHTS, bookid: d.external_id });
    await setDocCover(d.id, stored.url);
    ok++;
  } catch (e) { failed.push({ id: d.id, title: d.title, error: String(e.message || e).slice(0, 120) }); }
  await new Promise((r) => setTimeout(r, 150));   // gentle on the source host
}
console.log(JSON.stringify({ finished: true, imported: ok, failed }));
process.exit(0);
