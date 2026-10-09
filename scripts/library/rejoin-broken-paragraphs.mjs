#!/usr/bin/env node
// Re-join library paragraphs that PDF conversion broke mid-sentence (api/lib/rejoin-paragraphs.js), runs ON tower over
// the library tree (not -sites). Only files whose broken share > 15% AND whose document is secondary literature
// (authority < 8): in scripture, short lines and lone numbers are verse structure, not damage (Khordeh Avesta, Yasna,
// tafsir were flagged by the raw scan). --apply backs each original up under /tank/sifter/rejoin-backup/<path> before
// rewriting it (frontmatter untouched) and lists the changed docs for re-ingest in <list>. Dry run prints totals and a
// few sample joins.
//   node scripts/library/rejoin-broken-paragraphs.mjs [--apply] [--list /tank/sifter/rejoin-docs.txt] [--sample 3]
import dotenv from 'dotenv';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { rejoin, brokenShare } from '../../api/lib/rejoin-paragraphs.js';
import { getAuthority } from '../../api/lib/authority.js';
import { listDocs } from '../../api/lib/docs-repo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const BASE = process.env.LIBRARY_BASE_PATH || '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';
const BACKUP = '/tank/sifter/rejoin-backup';
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const APPLY = process.argv.includes('--apply'), LIST = opt('--list', '/tank/sifter/rejoin-docs.txt'), SAMPLE = Number(opt('--sample', 3));
const docOf = async (filePath) => (await listDocs({ filePath, fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site'], limit: 1 })).docs[0];

const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!/^(-sites|_retired|\.)/.test(e.name)) walk(p); } else if (e.name.endsWith('.md')) files.push(p);
  }
})(BASE);

const stats = { files: files.length, flagged: 0, skipped_scripture: 0, no_doc: 0, changed: 0, joins: 0, pages: 0 };
const docs = [];
let shown = 0;
for (const f of files) {
  const raw = readFileSync(f, 'utf-8');
  const fm = raw.match(/^---\n[\s\S]*?\n---\n/);
  const head = fm ? fm[0] : '', body = raw.slice(head.length);
  const s = brokenShare(body);
  if (s.prose < 15 || s.share <= 0.15) continue;
  stats.flagged++;
  const rel = relative(BASE, f);
  const d = await docOf(rel);
  if (!d) { stats.no_doc++; continue; }
  if (getAuthority(d) >= 8) { stats.skipped_scripture++; continue; }
  const r = rejoin(body);
  if (!r.joins && !r.pages) continue;
  stats.changed++; stats.joins += r.joins; stats.pages += r.pages;
  docs.push(d.id);
  if (shown < SAMPLE) {
    const joined = r.body.split('\n\n').filter((b) => b.length > 300).slice(2, 3)[0] || '';
    console.log(`\n== ${rel} (doc ${d.id}): ${r.joins} joins, ${r.pages} page markers\n${joined.slice(0, 500)}…`);
    shown++;
  }
  if (APPLY) {
    const bak = join(BACKUP, rel);
    mkdirSync(dirname(bak), { recursive: true });
    if (!existsSync(bak)) writeFileSync(bak, raw);
    writeFileSync(f, head + r.body + (r.body.endsWith('\n') ? '' : '\n'));
  }
}
if (APPLY) writeFileSync(LIST, docs.join('\n') + '\n');
console.log(JSON.stringify({ apply: APPLY, ...stats, list: APPLY ? LIST : null }));
process.exit(0);
