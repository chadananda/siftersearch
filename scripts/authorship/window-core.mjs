// Windowed paragraph attribution — the per-book engine shared by the eval (window-classify.mjs) and the production run
// (window-run.mjs). Defaults = v10, the measured best (planning/window-classifier-log.md): hybrid, one pass, LLM only to
// name "another person", one LLM brief per book. Runs ON tower (System-1 calls logged per task for Laya, Clef shadowed).
import { canonical, EDITOR, initialRoster, relevantRoster, guardNarration, blockHasEvidence, secondaryGuard, editorHasEvidence, onBehalfOfShoghiEffendi, isCompiler, windowState, windowQuestions, parseAnswers, needsEscalation, escalationPrompt, parseEscalation, settle, briefPrompt, parseBrief, OTHER } from '../../api/lib/authorship/window.js';

export const TASK = 'paragraph-speaker-window';
export const WINDOW_MODEL = 'window-v10-2026-10-08';
// basis of an author entry the reader took from evidence on the page — fixed, never re-asked, never overwritten
// source_link: the paragraph is the text of a known source (New Era ¶456, ‘Abdu’l-Bahá's prayer, was overwritten without it)
// byline / dialogue: a speaker heading ("ADDRESS BY ‘ABDU’L-BAHÁ") or a Q./A. line — 10-09 secondary spot-check: pilgrim notes
// lost ‘Abdu’l-Bahá's prayers and talks to the note-taker when these were open to the window
export const STRONG = new Set(['trailer', 'reference', 'section', 'lead-in', 'identical-text', 'official-section', 'official-work', 'trailer-work', 'source_link', 'trailer-prev', 'byline', 'dialogue']);
const BACK = 5, AHEAD = 5;

/** A book's paragraphs in order, each with the full heading path (chapter › section › extract) when the ingest kept it. */
export function loadRows(db, docId) {
  return db.prepare('SELECT id, paragraph_index pidx, text, heading, blocktype, block_attrs, authors, authors_model FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(docId)
    .map((r) => { const path = r.block_attrs ? JSON.parse(r.block_attrs).path : null; return { ...r, heading: path?.length ? path.join(' › ') : r.heading }; });
}

/** Share of prose rows that break mid-sentence into the next row (a book ingested one printed line per paragraph, e.g.
 *  Taherzadeh's Revelation vol. 2). No speaker can be judged on such fragments — the secondary write skips these books. */
export function fragmentShare(rows) {
  const prose = rows.filter((r) => String(r.text || '').trim().length > 20);
  const broken = rows.filter((r, i) => String(r.text || '').trim().length > 20 && !/[.!?:;"”’)\]*]\s*$/.test(String(r.text).trim())
    && /^[a-z]/.test(String(rows[i + 1]?.text || '').trim())).length;
  return prose.length ? broken / prose.length : 0;
}

/** Speaker already settled by evidence (hybrid): the reader's evidence-backed author, a heading (the book's author or
 *  compiler), or an attribution line (the writer it names). */
export function knownSpeaker(r, book) {
  const list = JSON.parse(r.authors || '[]');
  const a = list.find((e) => e.role === 'author');
  if (a?.name && STRONG.has(a.basis)) return a.name;
  if (list.some((e) => e.role === 'heading')) return book.author;
  const ref = list.find((e) => e.role === 'reference' && e.name);
  return ref ? ref.name : null;
}

/** The deterministic checks on one System-1 label, in order (v14-v17). Pure and idempotent, so the write step re-applies
 *  them to labels saved by an earlier version: "another person" → unresolved; a quote introduced in the narration stays
 *  the narrator's; an unmarked block leaves the book's author only when introduced; the editor only with editorial
 *  evidence; a paragraph never quotes its own speaker. */
export function refineLabel(l, row, prevRow, prevLabel, book, { secondary = false, prevRaw = null } = {}) {
  if (!l) return l;
  const clean = { ...l, speaker: l.speaker === OTHER ? null : l.speaker, quotes: l.quotes === OTHER ? null : l.quotes };
  let g = guardNarration(clean, row.text);
  if (g.narrated && !g.speaker) g = { ...g, speaker: book.author };
  if (g.speaker && !g.fixed && g.speaker !== EDITOR && g.speaker !== book.author
    // secondary: the model's own label for the previous paragraph counts as continuation too — otherwise one rejected
    // half rejects the rest of a quotation split across paragraphs ("…asked Me concern-" / "ing the nature of…")
    && !blockHasEvidence(g.speaker, { text: row.text, prevText: prevRow?.text, heading: row.heading,
      prevSpeaker: secondary && prevRaw?.speaker === g.speaker ? g.speaker : prevLabel?.speaker })) {
    g = { ...g, speaker: book.author, unproven: true };
  }
  if (g.speaker === EDITOR && !g.fixed && !editorHasEvidence(row.text, book.author, { footnote: row.blocktype === 'footnote' || /\{language=/.test(row.text) })) {
    g = { ...g, speaker: book.author, unproven: true };
  }
  if (secondary) g = secondaryGuard(g, { text: row.text, prevText: prevRow?.text, prevSpeaker: prevLabel?.speaker, prevRawSpeaker: prevRaw?.speaker, heading: row.heading, bookAuthor: book.author });
  // a narrated paragraph that reports a letter "written on behalf of the Guardian" stays the narrator's (held-out #40)
  // nor one a check just handed back to the author ("…acting on behalf of the Guardian…" in Hassall's prose, held-out #3)
  if (!(secondary && (g.narrated || g.prose || g.subject || g.unproven))) g = onBehalfOfShoghiEffendi(g, row.text, book.author);
  return settle(g);
}

export function createClassifier({ ask, chatCompletion, min = 0, step = 10, hybrid = true, backend = null, brief = true }) {
  const cost = { calls: 0, tokens: 0, llm: 0 };
  const llm = async (content, maxTokens, caller) => {
    const r = await chatCompletion([{ role: 'user', content }], { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, maxTokens, thinking: false, caller });
    cost.llm++;
    return r?.content ?? r;
  };

  async function makeBrief(book, allRows, roster) {
    const opening = allRows.slice(0, 40).map((r) => r.text.slice(0, 300)).join('\n');
    const heads = [...new Set(allRows.map((r) => r.heading).filter(Boolean))];
    const outline = heads.filter((_, i) => i % Math.max(1, Math.ceil(heads.length / 40)) === 0).slice(0, 40).join('\n');
    const b = parseBrief(await llm(briefPrompt(book, opening, outline), 900, 'authorship-brief'), roster);
    for (const x of b?.speakers || []) if (!roster.includes(x.name)) roster.push(x.name);
    return b;
  }

  // one System-1 call for a window; too long for Jev (max_tokens_exceeded) → the window is split in two, never dropped
  async function askWindow(state, offered, targets, book, b) {
    try {
      const r = await ask(TASK, state, windowQuestions(offered, targets.length, book, targets.map((p) => p.known)),
        { ref: targets[0].id, timeoutMs: 40000, ...(backend ? { backend } : {}) });
      cost.calls++; cost.tokens += r.tokens || 0;
      return r;
    } catch (e) {
      if (!/max_tokens|too long|413/i.test(String(e.message || e)) || targets.length < 2) throw e;
      const h = Math.ceil(targets.length / 2);
      const shorter = (ts) => windowState({ book, roster: offered, anchors: [], targets: ts, ahead: [], brief: b });
      const [a, z] = [await askWindow(shorter(targets.slice(0, h)), offered, targets.slice(0, h), book, b), await askWindow(shorter(targets.slice(h)), offered, targets.slice(h), book, b)];
      const answers = { ...a.answers };
      for (const [k, v] of Object.entries(z.answers || {})) answers[k.replace(/\d+$/, (n) => String(Number(n) + h))] = v;
      return { answers, tokens: 0 };
    }
  }

  async function pass(book, rows, roster, prior, b) {
    const labels = new Array(rows.length).fill(null);
    for (let i0 = 0; i0 < rows.length; i0 += step) {
      const targets = rows.slice(i0, i0 + step).map((p) => ({ ...p, known: hybrid ? knownSpeaker(p, book) : null }));
      const anchors = rows.slice(Math.max(0, i0 - BACK), i0).map((p, k) => ({ ...p, label: labels[Math.max(0, i0 - BACK) + k] || {} }));
      const ahead = rows.slice(i0 + step, i0 + step + AHEAD);
      const offered = relevantRoster(roster, [...anchors, ...targets, ...ahead].map((p) => p.text).join(' '), book, b);
      const state = windowState({ book, roster: offered, anchors, targets, ahead, brief: b });
      const r = await askWindow(state, offered, targets, book, b);
      const got = parseAnswers(r.answers, targets.length).map((l, k) => (targets[k].known ? { ...l, speaker: targets[k].known, fixed: true } : l));
      // the LLM arbitrates: an unnamed person, low confidence (when min > 0), or a pass-2 disagreement
      const flagged = got.map((l, k) => (needsEscalation(l, min) || (prior && prior[i0 + k] && prior[i0 + k].speaker !== l.speaker) ? k : -1)).filter((k) => k >= 0);
      if (flagged.length) {
        const fix = parseEscalation(await llm(escalationPrompt(state, flagged), 160 * flagged.length + 200, 'authorship-window'), flagged, roster);
        for (const [k, v] of Object.entries(fix)) {
          got[k] = { ...got[k], ...v, ...(got[k].fixed ? { speaker: got[k].speaker } : {}), via: 'llm' };
          for (const n of [v.speaker, v.quotes]) if (n && !roster.includes(n) && n !== OTHER) roster.push(n);   // the roster grows going forward
        }
      }
      // "another person" is not an answer: the LLM names them, or the paragraph stays unresolved (null)
      got.forEach((l, k) => { labels[i0 + k] = refineLabel(l, rows[i0 + k], rows[i0 + k - 1], labels[i0 + k - 1], book); });
    }
    return labels;
  }

  /** Classify `rows` (default: the whole book). The brief is always written from the book's own opening. */
  async function classify(book, allRows, { rows = allRows, passes = 1 } = {}) {
    const roster = initialRoster(book), base = [...roster];
    const b = brief ? await makeBrief(book, allRows, roster) : null;
    const p1 = await pass(book, rows, roster, null, b);
    const p2 = passes > 1 ? await pass(book, rows, roster, p1, b) : p1;
    return { roster, base, brief: b, p1, labels: p2 };
  }

  return { classify, cost };
}

const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`'-]/g, '').toLowerCase().trim();
// "Nabíl" for a book catalogued "Nabil Zarandi": the book's own author, whatever spelling the brief used
const HONORIFIC = new Set(['mirza', 'haji', 'hajji', 'mulla', 'siyyid', 'sayyid', 'shaykh', 'shaikh', 'aqa', 'ustad', 'the', 'sir', 'dr', 'mr', 'mrs', 'miss', 'lady', 'lord', 'imam', 'sultan']);
export const sameAsAuthor = (name, author) => {
  const n = fold(name), a = fold(author);
  if (!n || !a) return false;
  if (n === a) return true;
  const nw = n.split(/\s+/), aw = a.split(/\s+/);
  const [short, long] = nw.length <= aw.length ? [nw, aw] : [aw, nw];
  return short.length === 1 && short[0].length > 3 && !HONORIFIC.has(short[0]) && short[0] === long[0];
};


/** The authors list a paragraph should have after this run, or null when nothing changes. */
// noDemote (secondary literature, 10-09): never hand a paragraph already credited to a named person back to the book's
// author — the spot-check found those demotions wrong far more often than right (diaries, pilgrim notes); additions only.
export function nextAuthors(row, label, book, { noDemote = false } = {}) {
  const cur = JSON.parse(row.authors || '[]');
  const own = cur.find((e) => e.role === 'author');
  const structural = !own && cur.some((e) => ['heading', 'reference', 'meta'].includes(e.role));
  const locked = structural || String(row.authors_model || '').startsWith('official-sections') || (own && STRONG.has(own.basis));
  let author = own || null, changed = false;
  if (!locked && label?.speaker) {
    const isBook = sameAsAuthor(label.speaker, book.author);
    const want = isBook ? { name: book.author, role: 'author', basis: 'book', via: 'window' }
      : { name: label.speaker === EDITOR ? EDITOR : canonical(label.speaker), role: 'author', basis: 'window', confidence: label.conf, ...(label.on_behalf ? { on_behalf: true } : {}) };
    // the book's own author needs no entry change: a book default stays as it is (its spelling is the doc's anyway), and a
    // paragraph with no author entry already falls back to the book (dry run 10-08: 4,259 of 5,371 "changes" were these)
    // a compiler is never an extract's speaker: in a compilation the window never sets the book default over anything
    const noop = isBook && (!own || own.basis === 'book' || isCompiler(book.author) || /^compilation\b/i.test(book.author)
      || (noDemote && own && !sameAsAuthor(own.name, book.author)));
    if (!noop && (!own || own.name !== want.name || (own.basis === 'book') !== (want.basis === 'book'))) { author = want; changed = true; }
  }
  const speakerName = author?.name;
  const quoted = cur.filter((e) => e.role === 'quoted' && e.basis !== 'window');
  const q = label?.quotes && !structural ? canonical(label.quotes) : null;
  if (q && fold(q) !== fold(speakerName) && !sameAsAuthor(q, speakerName || '') && !quoted.some((e) => fold(e.name) === fold(q))) quoted.push({ name: q, role: 'quoted', basis: 'window' });
  const others = cur.filter((e) => e.role !== 'author' && e.role !== 'quoted');
  const next = [...(author ? [author] : []), ...others, ...quoted];
  return JSON.stringify(next) === JSON.stringify(cur) ? null : { authors: next, changed };
}

