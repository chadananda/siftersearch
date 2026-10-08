#!/usr/bin/env node
// Windowed paragraph attribution — PRODUCTION run (runs ON tower). Classifies whole books with the v10 engine
// (window-core.mjs) and saves each book to <out>/<id>.json (a run RESUMES: saved books are not re-asked). With --write,
// applies the saved labels to content.authors through the single writer:
//   · speaker — only where the reader had no evidence (basis book / system1 / continuation, or none). An evidence-backed
//     author (STRONG), an official-edition row (authors_model official-sections*) and heading / reference / meta lines are
//     never changed. The book's own author keeps the book default entry (one spelling per book in the index).
//   · quoted — {name, role:'quoted', basis:'window'} (previous window entries replaced; the reader's own kept).
// authors_model = window-v10-2026-10-08 where the author changed. synced is NOT reset: push-meili-authors.mjs carries
// authors to Meili as a two-field partial update afterwards. Dry run unless --write (needs SIFTER_WRITER_URL).
//   node scripts/authorship/window-run.mjs <out> (<docId> … | --oceanlibrary) [--concurrency 4] [--write] [--limit N]
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getDoc, listDocs } from '../../api/lib/docs-repo.js';
import { createClassifier, loadRows, nextAuthors, WINDOW_MODEL as MODEL } from './window-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const { ask } = await import('../../api/lib/systemone.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const VALUED = ['--concurrency', '--limit'];
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !VALUED.includes(all[i - 1]));
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const [OUT, ...IDS] = args;
const WRITE = process.argv.includes('--write'), CONC = Number(opt('--concurrency', 4)), LIMIT = Number(opt('--limit', 0));
if (WRITE && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write (tower scripts go through the single writer)');
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
mkdirSync(OUT, { recursive: true });
const { classify, cost } = createClassifier({ ask, chatCompletion });

let ids = IDS.map(Number);
if (process.argv.includes('--oceanlibrary')) {
  ids = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await listDocs({ sourceSite: 'oceanlibrary.com', fields: ['id'], limit: 1000, offset });
    ids.push(...page.docs.map((d) => d.id));
    if (page.docs.length < 1000) break;
  }
}
if (LIMIT) ids = ids.slice(0, LIMIT);

const stats = { books: 0, resumed: 0, paras: 0, author_changed: 0, quoted_added: 0, writes: 0, errors: 0 };
let pending = [];
const flush = async () => {
  if (!WRITE || !pending.length) { pending = []; return; }
  const { transaction } = await import('../../api/lib/db.js');
  const batch = pending; pending = [];
  for (let i = 0; i < batch.length; i += 500) await transaction(batch.slice(i, i + 500), 'authorship:window');
};

async function runBook(id) {
  const file = join(OUT, `${id}.json`);
  const d = await getDoc(id, { follow: false, fields: ['id', 'title', 'author', 'religion'] });
  if (!d) return;
  const book = { title: d.title, author: d.author, religion: d.religion };
  const rows = loadRows(db, id);
  let saved;
  if (existsSync(file)) { saved = JSON.parse(readFileSync(file, 'utf-8')); stats.resumed++; }
  else {
    const { roster, brief, labels } = await classify(book, rows);
    saved = { id, title: d.title, author: d.author, roster, brief, labels: rows.map((r, i) => ({ id: r.id, ...labels[i] })) };
    writeFileSync(file, JSON.stringify(saved));
  }
  const byId = new Map(saved.labels.map((l) => [l.id, l]));
  for (const r of rows) {
    stats.paras++;
    const n = nextAuthors(r, byId.get(r.id), book);
    if (!n) continue;
    if (n.changed) stats.author_changed++;
    if (n.authors.some((e) => e.role === 'quoted' && e.basis === 'window')) stats.quoted_added++;
    stats.writes++;
    pending.push(n.changed
      ? { sql: 'UPDATE content SET authors = ?, authors_model = ? WHERE id = ?', args: [JSON.stringify(n.authors), MODEL, r.id] }
      : { sql: 'UPDATE content SET authors = ? WHERE id = ?', args: [JSON.stringify(n.authors), r.id] });
  }
  if (pending.length >= 500) await flush();
  stats.books++;
  console.log(JSON.stringify({ id, title: d.title.slice(0, 40), paras: rows.length, ...stats, cost }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const queue = [...ids];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (queue.length) {
      const id = queue.shift();
      // one retry after a pause: a transient Jev / writer error must not drop a whole book (10-08: 6 of 6 failed once)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { await runBook(id); break; } catch (e) {
          if (attempt === 2) { stats.errors++; console.log(JSON.stringify({ id, error: String(e.message || e).slice(0, 200) })); }
          else await new Promise((r) => setTimeout(r, 30000));
        }
      }
    }
  }));
  await flush();
  console.log(JSON.stringify({ done: true, write: WRITE, ...stats, cost }));
  process.exit(0);
}
