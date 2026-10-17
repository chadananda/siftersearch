// The Observatory (home page) — pure helpers: ring geometry, number formatting, live interpolation between snapshots,
// which ring a running job feeds, and how a terminal line is coloured. Tested in tests/lib/observatory.test.js.

/** Point on a circle; angle in degrees, 0 = up (12 o'clock), clockwise. */
export function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG path of an annular sector (a ring cell) from `a0` to `a1` degrees between radii r0 < r1. */
export function arcPath(cx, cy, r0, r1, a0, a1) {
  if (a1 - a0 <= 0.0001) return '';
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  const f = (n) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
}

/** Layout of the dial: traditions share the circle minus a gap at the top (where ring names sit); rings stack outward. */
export function dialLayout(traditions, rings, { inner = 128, outer = 432, gapDeg = 34, padDeg = 0.9, ringGap = 3 } = {}) {
  const span = 360 - gapDeg, per = span / Math.max(1, traditions.length);
  const width = (outer - inner) / Math.max(1, rings.length);
  return {
    sectors: traditions.map((t, i) => ({ id: t, a0: gapDeg / 2 + i * per + padDeg / 2, a1: gapDeg / 2 + (i + 1) * per - padDeg / 2 })),
    bands: rings.map((r, i) => ({ id: r, r0: inner + i * width + ringGap / 2, r1: inner + (i + 1) * width - ringGap / 2 })),
  };
}

/** Filled share of a cell: done/total, with a visible sliver for any non-zero progress. */
export function fillDeg(done, total, a0, a1, minDeg = 0.7) {
  if (!total || !done) return 0;
  return Math.min(a1 - a0, Math.max(minDeg, ((a1 - a0) * done) / total));
}

/** 8489697 → "8.49M"; 12345 → "12.3K"; exact when small. */
export function compact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString('en-US');
}
export const exact = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
export const pct = (done, total, digits = 1) => (!total ? '—' : `${((100 * done) / total).toFixed(done && done / total < 0.001 ? 2 : digits)}%`);
export const rate = (perHour) => (!perHour ? '' : `${perHour > 0 ? '+' : '−'}${compact(Math.abs(perHour))}/h`);

/** A counter between snapshots: value + rate × hours since the snapshot (never below the measured value). */
export const interpolate = (value, perHour, sinceSec) => (value == null ? null : value + Math.max(0, perHour || 0) * Math.max(0, sinceSec) / 3600);

/** 3725 → "1h 02m"; 95 → "1m 35s". */
export function duration(sec) {
  if (sec == null) return '—';
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Which ring a running ops job is feeding (drives the particle streams). */
export function ringOfJob(name, label = '') {
  if (name === 'phrase-index') return /hype/.test(label) ? 'hype' : /concept/.test(label) ? 'concepts' : 'phrase';
  return { 'hype-index': 'hype', 'concept-index': 'concepts', 'section-index': 'sections', 'episode-extract': 'entities', 'coverage-refresh': 'text', 'ingest-files': 'text', 'keyword-fill': 'keyword', 'keyword-fill-sites': 'keyword' }[name] || null;
}

/** Colour class of a terminal line: by kind, and probes by outcome. */
export function lineTone(line) {
  if (line.kind === 'probe') return /→ #1\b/.test(line.text) ? 'hit1' : /→ #\d/.test(line.text) ? 'hit' : 'miss';
  if (line.kind === 'job') return /^✗/.test(line.text) ? 'error' : /^■/.test(line.text) ? 'warn' : 'job';
  return line.kind;
}

/** Sparkline path for values in a w×h box (flat line when constant). `minSpan` stops measurement jitter from being
 *  stretched into a staircase that reads as work (Chad 10-16: BM25 looked active "from the sparkline"; it was idle). */
export function sparkPath(values, w = 120, h = 24, minSpan = 0) {
  const v = values.filter((x) => typeof x === 'number');
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = Math.max(hi - lo, minSpan) || 1, min = lo - (span - (hi - lo)) / 2;
  return v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)} ${(h - ((x - min) / span) * (h - 2) - 1).toFixed(1)}`).join('');
}

/** What each index IS (Chad 10-16: "Searchable text is what? BM25? Then what is the keyword index? Even I am not sure"):
 *  a technical title (the index and its engine) and one plain line of what it lets a reader do. */
export const RING_INFO = {
  text: { title: 'Paragraph store · SQLite', sub: 'every paragraph — the source of all indexes', why: 'Nothing can be found that is not first here. Each book is split into paragraphs at its natural boundaries — Arabic and Persian included — so every later index points at a precise, citable paragraph rather than a whole book.' },
  refs: { title: 'References · verse, section, page', sub: 'the number a citation uses', why: 'Readers cite by tradition: John 3:16, Qur’an 2:255, Gleanings CXXV, Hidden Words Arabic 5, Aqdas ¶12 — or by the page of a printed edition. Every paragraph that carries its traditional number or its page can be reached by that citation, and every result can be cited back the same way.' },
  embedding: { title: 'Paragraph vectors · OpenAI', sub: 'each paragraph’s overall meaning', why: 'A reader rarely knows the exact words. One vector per paragraph captures its overall meaning, so a question phrased in modern language can still reach a passage written in 19th-century English.' },
  keyword: { title: 'BM25 keywords · Qdrant', sub: 'exact words, rare ones weigh most', why: 'When a reader does remember the words — a quotation, a name, a rare term — exact matching is the most reliable route. BM25 rewards the rare words that identify a passage, and misspellings are corrected against the library’s own vocabulary first.' },
  phrase: { title: 'Phrase vectors · Gemini', sub: 'each clause — finds half-memories', why: 'Memory works in fragments. Embedding every clause on its own lets three half-remembered words, even with a synonym, find the one sentence they came from inside a long paragraph — and works across scripts.' },
  sections: { title: 'Structure · table of contents', sub: 'parts, chapters and headings of each book', why: 'Every book is read for its own structure right after it is ingested: the tablets inside a compilation, the chapters of a history, the headings inside each chapter. A reader can then find ’the Badasht chapter’ or ’The Dispensation of Bahá’u’lláh’ without knowing which volume holds it — and every later layer, disambiguation first, knows where in a work each paragraph sits.' },
  context: { title: 'Disambiguation · LLM', sub: 'who “He” and “the Master” are', why: 'Sacred texts speak in titles and pronouns — ’He’, ’the Master’, ’the Blessed Beauty’. Resolving who is meant in each paragraph is what lets search answer questions about a person, and keeps the people graph from confusing namesakes.' },
  hype: { title: 'HyPE questions · LLM', sub: 'the questions each paragraph answers', why: 'People ask questions; texts make statements. For each paragraph an LLM writes the questions it answers, and those questions are indexed — so a seeker’s question meets the passage that answers it, even when they share no words.' },
  entities: { title: 'Historical entities · LLM', sub: 'people, places, events → the graph', why: 'Every person, place and event named in a paragraph is linked to one record in the people graph. That is what makes ’who met whom’, timelines and biographies possible, each claim citing the paragraph it came from.' },
  concepts: { title: 'Concept claims · LLM', sub: 'proof-checked doctrinal ideas', why: 'Doctrinal ideas — what a symbol means, what a teaching implies — are extracted as claims and checked against their verbatim proof. Linking them across works shows how an idea is developed by scripture, interpretation and scholarship.' },
  alignment: { title: 'Language links', sub: 'translations ↔ their originals', why: 'Many works exist in an original and in translation. Pairing them paragraph by paragraph lets a reader move from Shoghi Effendi’s English to Bahá’u’lláh’s Persian or Arabic — and lets a search in one language find the passage in the other.' },
  translation: { title: 'Machine translation', sub: 'planned: English for the rest', why: 'Planned: an English rendering for non-English paragraphs that have no aligned translation, so the whole library is searchable by meaning in one language — clearly marked as machine translation.' },
};
