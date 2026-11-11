// PARAGRAPH AUTHORS for a whole tradition (Chad 10-19: "doctrinal teachings are sometimes found in compilations, sometimes
// quoted in other books. You cannot exclude an entire book … Just make sure each paragraph has an author field so our
// author granularity is not at the document level"). The window classifier (authorship/window-core.js, v18b rules: the
// narrator stays speaker, on-behalf letters = Shoghi Effendi, a compiler is never an author, evidence-backed authors and
// official sections are never touched) over every book of the tradition, resumable: each book's labels are saved to
// <outDir>/<id>.json and never asked again. Secondary books (scholars, compilations — authority < 8 or several authors) get
// the secondary rules; a book of line fragments is listed, not written. With write, content.authors goes through the
// writer, every previous value first appended to <outDir>/rollback.jsonl. Port of scripts/authorship/window-run.mjs,
// which opened the database directly. params { religion = "Baha'i", ids?, write = false, limit?, concurrency = 4, outDir, maxLlm = 20000 (Haiku-call cap), fresh (ignore saved labels) }.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDoc, listDocs } from '../docs-repo.js';
import { getAuthority } from '../authority.js';
import { isCompilation } from '../doc-tier.js';
import { authorshipRows, writeParagraphAuthors } from '../paragraphs-repo.js';
import { canonical } from '../authorship/window.js';
import { createClassifier, fragmentShare, nextAuthors, refineLabel, WINDOW_MODEL as MODEL } from '../authorship/window-core.js';
import { trailerAuthors } from '../authorship/trailers.js';
import { articleWriters } from '../authorship/articles.js';
import { isDraining } from '../drain.js';

// a periodical's paragraphs are the ARTICLE's writer's (byline / FROM heading / signature / contents), not the placeholder doc author
const PLACEHOLDER = /^(unknown|anonymous|various|n\/?a)$/i;
export const isPeriodical = (d) => d.collection === 'News' || /^Star of the West,/i.test(d.title || '');
const multiAuthor = (d) => isCompilation(d) || /^(Compilation\b|Various\b)/i.test(d.author || '');
export const isSecondaryBook = (d) => getAuthority(d) < 8 || multiAuthor(d);

export async function paragraphAuthorsJob({ religion = "Baha'i", ids = null, all = false, write = false, limit = 0, concurrency = 4,
  outDir = '/tank/sifter/authorship/wrun-all', maxLlm = 20000, fresh = false } = {}, deps = {}) {
  // a whole tradition is never a DEFAULT (10-21: a run queued with params null set out to classify all 57,903 Bahá'í books —
  // beyond the approved scope); it takes ids, or an explicit all: true
  if (!ids?.length && !all) return { refused: 'no ids — pass ids, or all: true for every book of the tradition' };
  const { ask = (await import('../systemone.js')).ask, chatCompletion = (await import('../ai.js')).chatCompletion,
    rowsOf = authorshipRows, writeAuthors = writeParagraphAuthors, docs = listDocs, doc = getDoc, draining = isDraining } = deps;
  mkdirSync(outDir, { recursive: true });
  const { classify, cost } = createClassifier({ ask, chatCompletion });
  let books = [];
  if (ids?.length) for (const id of ids) { const d = await doc(Number(id), { follow: false, fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site', 'paragraph_count'] }); if (d) books.push(d); }
  else {
    for (let afterId = 0; ;) {   // keyset: each page a short read (OFFSET re-walked every skipped book)
      const page = await docs({ scope: 'canonicalWithProse', religion, fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site', 'paragraph_count'], limit: 1000, afterId, count: false });
      books.push(...page.docs);
      if (page.docs.length < 1000) break;
      afterId = page.docs[page.docs.length - 1].id;
    }
  }
  if (limit) books = books.slice(0, limit);
  // the saved labels, read ONCE: an existsSync per sort comparison was ~1M synchronous calls over 57,903 books and froze the
  // service's event loop for minutes (10-21: reports went 'silent'; its cancel and drain could not get through)
  const savedIds = new Set(readdirSync(outDir).filter((f) => /^\d+\.json$/.test(f)).map((f) => Number(f.slice(0, -5))));
  const saved = (id) => (savedIds.has(Number(id)) ? 1 : 0);
  // saved books first (no model calls), then the longest, so one 3,000-paragraph history does not run alone at the end
  const queue = books.sort((a, b) => (saved(b.id) - saved(a.id)) || ((b.paragraph_count || 0) - (a.paragraph_count || 0)));
  const stats = { books: 0, resumed: 0, paras: 0, author_changed: 0, quoted_added: 0, writes: 0, fragmented: 0, errors: 0 };

  async function runBook(d) {
    const secondary = isSecondaryBook(d);
    const book = { title: d.title, author: d.author, religion: d.religion };
    const rows = await rowsOf(d.id);
    if (!rows.length) return;
    // EVIDENCE FIRST: a quotation followed by its attribution trailer is the trailer's writer (basis 'trailer'), set before
    // the classifier runs so it is a fixed anchor there and is never overridden (10-19: Lights of Guidance's quotations
    // were labelled 'the compiler, quoting Shoghi Effendi')
    const evidence = [];
    const trailers = trailerAuthors(rows);
    // STALE evidence: a trailer author today's trailer rules no longer give (an earlier, unbounded run) is dropped so the
    // classifier decides the row again; the row is written even when nothing else changes (11-01: Bahá'í World VIII)
    const stale = new Map();
    for (const r of rows) {
      if (trailers.has(r.id)) continue;
      const cur = (() => { try { return JSON.parse(r.authors || '[]') || []; } catch { return []; } })();
      if (!cur.some((e) => e.role === 'author' && e.basis === 'trailer')) continue;
      stale.set(r.id, { authors: r.authors, authors_model: r.authors_model });
      r.authors = JSON.stringify(cur.filter((e) => !(e.role === 'author' && e.basis === 'trailer')));
    }
    stats.stale_trailer = (stats.stale_trailer || 0) + stale.size;
    for (const [id, t] of trailers) {
      const r = rows.find((x) => x.id === id);
      const cur = (() => { try { return JSON.parse(r.authors || '[]') || []; } catch { return []; } })();
      if (cur.some((e) => e.role === 'author' && e.basis && !['book', 'system1', 'window', 'continuation'].includes(e.basis))) continue;   // evidence already
      const authors = [{ name: t.name, role: 'author', basis: 'trailer', ...(t.on_behalf ? { on_behalf: true } : {}), ...(t.kind ? { kind: t.kind } : {}) }, ...cur.filter((e) => e.role !== 'author')];
      evidence.push({ id, authors, model: 'trailers-2026-10-19', prev: { authors: r.authors, authors_model: r.authors_model } });
      r.authors = JSON.stringify(authors);   // the classifier and the write rules see the evidence
    }
    stats.trailer_assigned = (stats.trailer_assigned || 0) + evidence.length;
    const file = join(outDir, `${d.id}.json`);
    let lab;
    // saved labels made while a stale trailer credit was a FIXED anchor are stale too (11-01: BW VIII's resumed labels wrote
    // Bahá'u'lláh back over 6,567 paragraphs with basis 'window'); `fresh` re-asks a book whatever was saved
    if (existsSync(file) && !fresh && !stale.size) { lab = JSON.parse(readFileSync(file, 'utf-8')); stats.resumed++; }
    else {
      // a CHECKPOINT every 20 windows (<id>.partial.json): a drain stops the book there and the next run resumes it — a
      // 15,600-paragraph volume no longer holds the service in 'draining' until it ends (10-21)
      const part = join(outDir, `${d.id}.partial.json`);
      let resume = null;
      try { const p = JSON.parse(readFileSync(part, 'utf-8')); if (p.labels?.length === rows.length) resume = p; } catch { /* none yet */ }
      let w = 0;
      const onWindow = (st) => {
        if (++w % 20 === 0 || draining()) writeFileSync(part, JSON.stringify(st));
        if (draining() && st.from < rows.length) throw Object.assign(new Error('drain'), { yielded: true });
      };
      const { roster, brief, labels } = await classify(book, rows, { resume, onWindow });
      try { unlinkSync(part); } catch { /* none */ }
      lab = { id: d.id, title: d.title, author: d.author, secondary, roster, brief, labels: rows.map((r, i) => ({ id: r.id, ...labels[i] })) };
      writeFileSync(file, JSON.stringify(lab));
    }
    if (secondary && fragmentShare(rows) > 0.25) {
      stats.fragmented++; appendFileSync(join(outDir, 'fragmented.txt'), `${d.id}\t${d.title}\n`);
      // a book of fragments is listed, not classified — but its stale trailer authors still come off (back to the book default)
      const drop = rows.filter((r) => stale.has(r.id)).map((r) => ({ id: r.id, authors: JSON.parse(r.authors), prev: stale.get(r.id) }));
      stats.writes += drop.length;
      if (write && drop.length) { appendFileSync(join(outDir, 'rollback.jsonl'), drop.map((u) => JSON.stringify({ id: u.id, ...u.prev })).join('\n') + '\n'); await writeAuthors(drop); }
      return;
    }
    // the deterministic rules run again on saved labels, so a book classified under an earlier version gets today's rules
    const raw = new Map(lab.labels.map((l) => [l.id, l]));
    const byId = new Map();
    // periodical / placeholder author: the fallback narrator is the article's writer; no writer → unattributed, never "Unknown"
    const placeholder = PLACEHOLDER.test(String(d.author || '').trim());
    const writers = placeholder || isPeriodical(d) ? articleWriters(rows) : new Map();
    rows.forEach((r, i) => {
      const aw = writers.get(r.id);
      let l = refineLabel(raw.get(r.id), r, rows[i - 1], byId.get(rows[i - 1]?.id), aw ? { ...book, author: aw.writer } : book, { secondary, prevRaw: raw.get(rows[i - 1]?.id) });
      if (l && placeholder && (!l.speaker || PLACEHOLDER.test(l.speaker))) l = { ...l, speaker: aw?.writer ?? null };
      else if (l && aw && PLACEHOLDER.test(String(l.speaker || ''))) l = { ...l, speaker: aw.writer };
      byId.set(r.id, l);
    });
    const updates = [];
    const fromTrailer = new Map(evidence.map((u) => [u.id, u]));
    for (const r of rows) {
      stats.paras++;
      // a trailer paragraph still gets the classifier's QUOTED voices (the author is locked: 'trailer' is a strong basis) —
      // Shoghi Effendi's letter quoting Bahá'u'lláh keeps Bahá'u'lláh findable (10-19 dry run: skipping them lost ~1,000)
      const n = nextAuthors(r, byId.get(r.id), book, { noDemote: secondary });
      // the article writer's entry carries its own basis ('article') so the source of the attribution stays visible
      const aw = writers.get(r.id);
      if (n && aw) n.authors = n.authors.map((e) => (e.role === 'author' && e.basis === 'window' && e.name === canonical(aw.writer) ? { ...e, basis: 'article', via: aw.basis } : e));
      const ev = fromTrailer.get(r.id);
      if (ev) {
        if (n?.authors.some((e) => e.role === 'quoted' && e.basis === 'window')) stats.quoted_added++;
        updates.push({ ...ev, authors: n?.authors || ev.authors });
        continue;
      }
      if (!n) { if (stale.has(r.id)) updates.push({ id: r.id, authors: JSON.parse(r.authors), prev: stale.get(r.id) }); continue; }
      if (n.changed) stats.author_changed++;
      // a dry run shows what it would write: two changed paragraphs per book, forty at most
      if (n.changed && !write && (stats.samples ||= []).length < 40 && stats.samples.filter((x) => x.doc === d.id).length < 2) stats.samples.push({ doc: d.id, id: r.id, from: r.authors, to: n.authors });
      if (n.authors.some((e) => e.role === 'quoted' && e.basis === 'window')) stats.quoted_added++;
      updates.push({ id: r.id, authors: n.authors, ...(n.changed ? { model: MODEL } : {}), prev: stale.get(r.id) || { authors: r.authors, authors_model: r.authors_model } });
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
      // a SPEND CAP: no new book once the Haiku calls (briefs + escalations) reach maxLlm; the rest resume next run
      if (cost.llm >= maxLlm) { stats.stopped_at_cap = queue.length; break; }
      // an update is waiting: stop between books (every finished book is saved and written) — the service requeues the run
      if (draining()) { stats.yielded = true; break; }
      const d = queue.shift();
      // one retry after a pause: a transient model / writer error must not drop a whole book (10-08: 6 of 6 failed once)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { await runBook(d); break; } catch (e) {
          if (e.yielded) { stats.yielded = true; break; }
          if (attempt === 2) { stats.errors++; if ((stats.error_samples ||= []).length < 10) stats.error_samples.push(`${d.id}: ${String(e?.message || e).slice(0, 200)}`); } else await new Promise((r) => setTimeout(r, 30000));
        }
      }
      if (stats.yielded) break;
    }
  }));
  return { religion, write, outDir, total_books: books.length, ...stats, cost };
}
