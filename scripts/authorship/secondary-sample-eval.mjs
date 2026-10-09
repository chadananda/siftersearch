#!/usr/bin/env node
// Score the CURRENT secondary write rules (refineLabel {secondary} + nextAuthors {noDemote}) on the judged random sample
// (planning/authorship-secondary-sample-*.json): a correct change must survive, a wrong one must be undone or corrected
// (to `right` when the judge named it). No LLM — saved labels only. Runs ON tower.
//   node scripts/authorship/secondary-sample-eval.mjs [sampleFile …]   (default: every planning/authorship-secondary-sample-*.json)
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadRows, nextAuthors, refineLabel } from './window-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = '/tank/sifter/authorship/wrun-sec';
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true });
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(ROOT, 'planning')).filter((f) => /^authorship-secondary-sample-.*\.json$/.test(f)).map((f) => join(ROOT, 'planning', f));
for (const file of files) {
const { sample } = JSON.parse(readFileSync(file, 'utf8'));
console.log(`== ${file.split('/').pop()}`);
const score = { C: [0, 0], W: [0, 0], U: [0, 0] };
for (const s of sample) {
  const saved = JSON.parse(readFileSync(join(DIR, `${s.doc}.json`), 'utf8'));
  const book = { title: saved.title, author: saved.author || '', religion: '' };
  const rows = loadRows(db, s.doc);
  const raw = new Map(saved.labels.map((l) => [l.id, l])), by = new Map();
  rows.forEach((r, i) => by.set(r.id, refineLabel(raw.get(r.id), r, rows[i - 1], by.get(rows[i - 1]?.id), book, { secondary: true, prevRaw: raw.get(rows[i - 1]?.id) })));
  const r = rows.find((x) => x.id === s.row);
  const n = r && nextAuthors(r, by.get(r.id), book, { noDemote: true });
  const speaker = n?.changed ? n.authors.find((e) => e.role === 'author')?.name : null;
  const quoted = (n?.authors || []).filter((e) => e.role === 'quoted' && e.basis === 'window').map((e) => e.name);
  const same = speaker === s.speaker && JSON.stringify(quoted) === JSON.stringify(s.quoted);
  const good = s.verdict === 'C' ? same : s.verdict === 'W' ? (s.right ? speaker === s.right : !same) : null;
  score[s.verdict][0]++; if (good) score[s.verdict][1]++;
  if (s.verdict !== 'U' && !good) console.log(`  #${s.n} ${s.verdict} ${s.speaker} → now ${speaker ?? '(no change)'} q:[${quoted}]${s.why ? ' — ' + s.why : ''}`);
}
console.log(JSON.stringify({ correct_kept: `${score.C[1]}/${score.C[0]}`, wrong_fixed: `${score.W[1]}/${score.W[0]}`, unclear: score.U[0] }));
}
