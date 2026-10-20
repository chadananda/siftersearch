// PARAGRAPH AUTHORS for a whole tradition (Chad 10-19: "doctrinal teachings are sometimes found in compilations, sometimes
// quoted in other books. You cannot exclude an entire book … Just make sure each paragraph has an author field so our
// author granularity is not at the document level"). The window classifier (authorship/window-core.js, v18b rules: the
// narrator stays speaker, on-behalf letters = Shoghi Effendi, a compiler is never an author, evidence-backed authors and
// official sections are never touched) over every book of the tradition, resumable: each book's labels are saved to
// <outDir>/<id>.json and never asked again. Secondary books (scholars, compilations — authority < 8 or several authors) get
// the secondary rules; a book of line fragments is listed, not written. With write, content.authors goes through the
// writer, every previous value first appended to <outDir>/rollback.jsonl. Port of scripts/authorship/window-run.mjs,
// which opened the database directly. params { religion = "Baha'i", ids?, write = false, limit?, concurrency = 4, outDir }.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDoc, listDocs } from '../docs-repo.js';
import { getAuthority } from '../authority.js';
import { isCompilation } from '../doc-tier.js';
import { authorshipRows, writeParagraphAuthors } from '../paragraphs-repo.js';
import { createClassifier, fragmentShare, nextAuthors, refineLabel, WINDOW_MODEL as MODEL } from '../authorship/window-core.js';

const multiAuthor = (d) => isCompilation(d) || /^(Compilation\b|Various\b)/i.test(d.author || '');
export const isSecondaryBook = (d) => getAuthority(d) < 8 || multiAuthor(d);

export async function paragraphAuthorsJob({ religion = "Baha'i", ids = null, write = false, limit = 0, concurrency = 4,
  outDir = '/tank/sifter/authorship/wrun-all' } = {}, deps = {}) {
  const { ask = (await import('../systemone.js')).ask, chatCompletion = (await import('../ai.js')).chatCompletion,
    rowsOf = authorshipRows, writeAuthors = writeParagraphAuthors, docs = listDocs, doc = getDoc } = deps;
  mkdirSync(outDir, { recursive: true });
  const { classify, cost } = createClassifier({ ask, chatCompletion });
  let books = [];
  if (ids?.length) for (const id of ids) { const d = await doc(Number(id), { follow: false, fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site', 'paragraph_count'] }); if (d) books.push(d); }
  else {
    for (let offset = 0; ; offset += 1000) {
      const page = await docs({ scope: 'canonicalWithProse', religion, fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site', 'paragraph_count'], limit: 1000, offset, count: false });
      books.push(...page.docs);
      if (page.docs.length < 1000) break;
    }
  }
  if (limit) books = books.slice(0, limit);
  const saved = (id) => existsSync(join(outDir, `${id}.json`));
  // saved books first (no model calls), then the longest, so one 3,000-paragraph history does not run alone at the end
  const queue = books.sort((a, b) => (saved(b.id) - saved(a.id)) || ((b.paragraph_count || 0) - (a.paragraph_count || 0)));
  const stats = { books: 0, resumed: 0, paras: 0, author_changed: 0, quoted_added: 0, writes: 0, fragmented: 0, errors: 0 };

  async function runBook(d) {
    const secondary = isSecondaryBook(d);
    const book = { title: d.title, author: d.author, religion: d.religion };
    const rows = await rowsOf(d.id);
    if (!rows.length) return;
    const file = join(outDir, `${d.id}.json`);
    let lab;
    if (existsSync(file)) { lab = JSON.parse(readFileSync(file, 'utf-8')); stats.resumed++; }
    else {
      const { roster, brief, labels } = await classify(book, rows);
      lab = { id: d.id, title: d.title, author: d.author, secondary, roster, brief, labels: rows.map((r, i) => ({ id: r.id, ...labels[i] })) };
      writeFileSync(file, JSON.stringify(lab));
    }
    if (secondary && fragmentShare(rows) > 0.25) { stats.fragmented++; appendFileSync(join(outDir, 'fragmented.txt'), `${d.id}\t${d.title}\n`); return; }
    // the deterministic rules run again on saved labels, so a book classified under an earlier version gets today's rules
    const raw = new Map(lab.labels.map((l) => [l.id, l]));
    const byId = new Map();
    rows.forEach((r, i) => { byId.set(r.id, refineLabel(raw.get(r.id), r, rows[i - 1], byId.get(rows[i - 1]?.id), book, { secondary, prevRaw: raw.get(rows[i - 1]?.id) })); });
    const updates = [];
    for (const r of rows) {
      stats.paras++;
      const n = nextAuthors(r, byId.get(r.id), book, { noDemote: secondary });
      if (!n) continue;
      if (n.changed) stats.author_changed++;
      if (n.authors.some((e) => e.role === 'quoted' && e.basis === 'window')) stats.quoted_added++;
      updates.push({ id: r.id, authors: n.authors, ...(n.changed ? { model: MODEL } : {}), prev: { authors: r.authors, authors_model: r.authors_model } });
    }
    stats.writes += updates.length;
    if (write && updates.length) {
      appendFileSync(join(outDir, 'rollback.jsonl'), updates.map((u) => JSON.stringify({ id: u.id, ...u.prev })).join('\n') + '\n');
      await writeAuthors(updates);
    }
    stats.books++;
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const d = queue.shift();
      // one retry after a pause: a transient model / writer error must not drop a whole book (10-08: 6 of 6 failed once)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { await runBook(d); break; } catch (e) { if (attempt === 2) stats.errors++; else await new Promise((r) => setTimeout(r, 30000)); }
      }
    }
  }));
  return { religion, write, outDir, total_books: books.length, ...stats, cost };
}
