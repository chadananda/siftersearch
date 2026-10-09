#!/usr/bin/env node
// Windowed paragraph attribution — PRODUCTION run (runs ON tower). Classifies whole books with the v10 engine
// (window-core.mjs) and saves each book to <out>/<id>.json (a run RESUMES: saved books are not re-asked). With --write,
// applies the saved labels to content.authors through the single writer:
//   · speaker — only where the reader had no evidence (basis book / system1 / continuation, or none). An evidence-backed
//     author (STRONG), an official-edition row (authors_model official-sections*) and heading / reference / meta lines are
//     never changed. The book's own author keeps the book default entry (one spelling per book in the index).
//   · quoted — {name, role:'quoted', basis:'window'} (previous window entries replaced; the reader's own kept).
// authors_model = window-v10-2026-10-08 where the author changed. Every written row's previous authors / authors_model are
// appended to <out>/rollback.jsonl first, so a run can be undone exactly. synced is NOT reset: push-meili-authors.mjs carries
// authors to Meili as a two-field partial update afterwards. Dry run unless --write (needs SIFTER_WRITER_URL).
//   node scripts/authorship/window-run.mjs <out> (<docId> … | --oceanlibrary | --secondary) [--religion bah] [--concurrency 4] [--write] [--limit N]
// --secondary: every canonical book with prose that is secondary literature (authority < 8) or a multi-author compilation —
// histories, studies, biographies, papers, letters collections: where quoting and citing others is the norm (Chad 10-09).
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getDoc, listDocs } from '../../api/lib/docs-repo.js';
import { getAuthority } from '../../api/lib/authority.js';
import { isCompilation } from '../../api/lib/doc-tier.js';
import { createClassifier, fragmentShare, loadRows, nextAuthors, refineLabel, WINDOW_MODEL as MODEL } from './window-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const { ask } = await import('../../api/lib/systemone.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const VALUED = ['--concurrency', '--limit', '--religion'];
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !VALUED.includes(all[i - 1]));
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const [OUT, ...IDS] = args;
// --religion <regex>: only books of that tradition (writes are validated on Bahá’í books only, 10-08)
const RELIGION = opt('--religion', null) ? new RegExp(opt('--religion'), 'i') : null;
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
const SECONDARY = process.argv.includes('--secondary');
if (SECONDARY) {
  ids = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await listDocs({ scope: 'canonicalWithProse', fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site'], limit: 1000, offset });
    // several authors: doc-tier's compilation test, plus 'Compilation (…)' / 'Various' authors (not added to doc-tier: it routes enrichment)
    const multi = (d) => isCompilation(d) || /^(Compilation\b|Various\b)/i.test(d.author || '');
    for (const d of page.docs) if ((getAuthority(d) < 8 || multi(d)) && (!RELIGION || RELIGION.test(d.religion || ''))) ids.push(d.id);
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
  if (!d || (RELIGION && !RELIGION.test(d.religion || ''))) return;
  const book = { title: d.title, author: d.author, religion: d.religion };
  const rows = loadRows(db, id);
  let saved;
  if (existsSync(file)) { saved = JSON.parse(readFileSync(file, 'utf-8')); stats.resumed++; }
  else {
    const { roster, brief, labels } = await classify(book, rows);
    saved = { id, title: d.title, author: d.author, roster, brief, labels: rows.map((r, i) => ({ id: r.id, ...labels[i] })) };
    writeFileSync(file, JSON.stringify(saved));
  }
  // secondary: a book of line fragments is not written — listed for a rejoin instead (10-09: Taherzadeh vol. 2, Covenant)
  const frag = fragmentShare(rows);
  if (SECONDARY && frag > 0.25) {
    stats.fragmented = (stats.fragmented || 0) + 1;
    appendFileSync(join(OUT, 'fragmented.txt'), `${id}\t${frag.toFixed(2)}\t${d.title}\n`);
    console.log(JSON.stringify({ id, title: (d.title || '').slice(0, 40), skip: 'fragmented', share: Number(frag.toFixed(2)) }));
    return;
  }
  // the deterministic checks run again on saved labels, so a book classified by an earlier version gets today's rules
  const raw = new Map(saved.labels.map((l) => [l.id, l]));
  const byId = new Map();
  rows.forEach((r, i) => { byId.set(r.id, refineLabel(raw.get(r.id), r, rows[i - 1], byId.get(rows[i - 1]?.id), book, { secondary: SECONDARY })); });
  for (const r of rows) {
    stats.paras++;
    const n = nextAuthors(r, byId.get(r.id), book, { noDemote: SECONDARY });
    if (!n) continue;
    if (n.changed) stats.author_changed++;
    if (n.authors.some((e) => e.role === 'quoted' && e.basis === 'window')) stats.quoted_added++;
    stats.writes++;
    if (WRITE) appendFileSync(join(OUT, 'rollback.jsonl'), JSON.stringify({ id: r.id, authors: r.authors, authors_model: r.authors_model }) + '\n');
    pending.push(n.changed
      ? { sql: 'UPDATE content SET authors = ?, authors_model = ? WHERE id = ?', args: [JSON.stringify(n.authors), MODEL, r.id] }
      : { sql: 'UPDATE content SET authors = ? WHERE id = ?', args: [JSON.stringify(n.authors), r.id] });
  }
  if (pending.length >= 500) await flush();
  stats.books++;
  console.log(JSON.stringify({ id, title: d.title.slice(0, 40), paras: rows.length, ...stats, cost }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // windows inside a book are sequential (each reads the decided labels + roster), so parallelism is across books: saved
  // books first (no LLM), then the longest unsaved books, so one 3,000-paragraph history doesn't run alone at the end
  const size = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const r of db.prepare(`SELECT doc_id, COUNT(*) n FROM content WHERE deleted_at IS NULL AND doc_id IN (${chunk.map(() => '?').join(',')}) GROUP BY doc_id`).all(...chunk)) size.set(r.doc_id, r.n);
  }
  const saved = (id) => existsSync(join(OUT, `${id}.json`));
  const queue = [...ids].sort((a, b) => (saved(b) - saved(a)) || ((size.get(b) || 0) - (size.get(a) || 0)));
  console.log(JSON.stringify({ start: true, books: ids.length, saved: ids.filter(saved).length, concurrency: CONC }));
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
