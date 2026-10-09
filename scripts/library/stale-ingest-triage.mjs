#!/usr/bin/env node
// Triage the stale-ingest sweep (stale-ingest-sweep.mjs output): which stale books are worth re-ingesting. A stale book is
// only BROKEN when its stored rows break mid-sentence (fragmentShare); verse stored line by line ("Ode of the Dove": 260
// verses, today's parser would make 7 blocks) is better as it is. Arabic/Persian originals were AI-segmented at ingest, so
// a count difference there means nothing. Read-only (on tower).
//   node scripts/library/stale-ingest-triage.mjs [--in /tank/sifter/stale-sweep.jsonl] [--min-frag 0.25]
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fragmentShare, loadRows } from '../authorship/window-core.mjs';
import { getDoc } from '../../api/lib/docs-repo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const IN = opt('--in', '/tank/sifter/stale-sweep.jsonl'), MIN = Number(opt('--min-frag', 0.25));
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
const stale = readFileSync(IN, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = { reingest: [], keep_rtl: [], keep_whole_rows: [] };
for (const s of stale) {
  const lang = String((await getDoc(s.id, { follow: false, fields: ['id', 'language'] }))?.language || '').toLowerCase().slice(0, 2);
  if (['ar', 'fa', 'ur', 'he'].includes(lang)) { out.keep_rtl.push({ ...s, lang }); continue; }
  const rows = loadRows(db, s.id);
  const frag = fragmentShare(rows);
  const sample = rows.slice(Math.floor(rows.length / 3), Math.floor(rows.length / 3) + 3).map((r) => r.text.replace(/\s+/g, ' ').slice(0, 90));
  (frag > MIN ? out.reingest : out.keep_whole_rows).push({ ...s, lang, frag: Number(frag.toFixed(2)), sample });
}
writeFileSync(IN.replace(/\.jsonl$/, '-triage.json'), JSON.stringify(out, null, 1));
const by = (a) => a.reduce((m, x) => ((m[x.authority >= 8 ? 'authoritative' : 'secondary'] = (m[x.authority >= 8 ? 'authoritative' : 'secondary'] || 0) + 1), m), {});
console.log(JSON.stringify({ stale: stale.length, reingest: out.reingest.length, reingest_by: by(out.reingest), keep_rtl: out.keep_rtl.length, keep_whole_rows: out.keep_whole_rows.length }));
for (const x of out.reingest.filter((r) => r.authority >= 8).sort((a, b) => b.authority - a.authority))
  console.log(`  ${x.authority} ${x.id} ${x.religion} ${x.rows}→${x.parsed} frag ${x.frag} | ${x.title}\n      ${x.sample.join(' ‖ ')}`);
process.exit(0);
