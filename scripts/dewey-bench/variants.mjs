// Dewey benchmark text transforms — each one a scenario a found document can be in (other OCR, other typist, other
// edition, abridged, excerpt, superset, compilation). Pure and SEEDED: the same seed gives the same case. Plan:
// planning/dewey-benchmark-plan.md

/** A small seeded PRNG (mulberry32) → () => [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const paras = (text) => String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
const join = (ps) => ps.join('\n\n');

/** OCR errors: character confusions at `rate` per word, hyphenation breaks, running headers and page numbers. */
export function ocrNoise(text, { rate = 0.03, seed = 1, header = null } = {}) {
  const r = rng(seed);
  const SWAPS = [[/rn/, 'm'], [/m/, 'rn'], [/l/, '1'], [/I/, 'l'], [/e/, 'c'], [/c/, 'e'], [/fi/, 'ﬁ'], [/o/, '0'], [/h/, 'b'], [/u/, 'n'], [/á/, 'a'], [/í/, 'i'], [/’/, "'"], [/,/, '.']];
  const out = [];
  let words = 0;
  for (const p of paras(text)) {
    const ws = p.split(/\s+/).map((w) => {
      words++;
      if (r() >= rate) return w;
      const cands = SWAPS.filter(([re]) => re.test(w));
      if (!cands.length) return w;
      const [re, to] = cands[Math.floor(r() * cands.length)];
      return w.replace(re, to);
    });
    // a printed line broken with a hyphen, now and then
    const line = ws.map((w, i) => (w.length > 7 && r() < 0.02 ? `${w.slice(0, 4)}-\n${w.slice(4)}` : w) + (i && i % 12 === 0 ? '\n' : ' ')).join('').trim();
    out.push(line);
    if (words > 350 && r() < 0.25) { out.push(`${Math.floor(words / 300) + 1}`); if (header) out.push(header.toUpperCase()); words = 0; }
  }
  return join(out);
}

/** A different typist: diacritics and curly quotes gone, a typo rate, Bahai/Baha'i spellings, other paragraphing. */
export function retype(text, { typos = 0.01, seed = 2, stripDiacritics = true } = {}) {
  const r = rng(seed);
  let t = String(text);
  if (stripDiacritics) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ‘’`]/g, "'").replace(/[“”]/g, '"').replace(/['’](?=[A-Za-z]{1,2}l?lah)/g, '');
  t = t.replace(/Baha'i/g, () => (r() < 0.5 ? 'Bahai' : "Baha'i"));
  const typo = (w) => { if (w.length < 4 || r() >= typos) return w; const i = 1 + Math.floor(r() * (w.length - 2)); return r() < 0.5 ? w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2) : w.slice(0, i) + w.slice(i + 1); };
  const ps = paras(t).map((p) => p.split(/\s+/).map(typo).join(' '));
  // other paragraphing: some paragraphs merged, some long ones split at a sentence
  const out = [];
  for (const p of ps) {
    if (out.length && r() < 0.15) out[out.length - 1] += ` ${p}`;
    else if (p.length > 800 && r() < 0.4) { const k = p.indexOf('. ', p.length / 2); out.push(...(k > 0 ? [p.slice(0, k + 1), p.slice(k + 2)] : [p])); }
    else out.push(p);
  }
  return join(out);
}

/** Another edition: a new preface and index, `edit` of paragraphs reworded (a clause changed), `drop` removed. */
export function edition(text, { edit = 0.05, drop = 0.03, seed = 3, title = 'this book' } = {}) {
  const r = rng(seed);
  const reword = (p) => { const s = p.split(/(?<=[.;:])\s+/); const i = Math.floor(r() * s.length); s[i] = s[i].split(' ').reverse().slice(0, 6).join(' ') + ' — as later editions put it.'; return s.join(' '); };
  const body = paras(text).filter(() => r() >= drop).map((p) => (r() < edit ? reword(p) : p));
  const preface = `PREFACE TO THE NEW EDITION\n\nThis new edition of ${title} has been reset and corrected. Spelling has been brought into line with current usage, a number of misprints in the earlier printings have been removed, and an index has been added for the convenience of readers and students. The publishers wish to thank all who assisted with the preparation of this edition.`;
  const words = [...new Set(String(text).match(/\b[A-Z][a-z]{4,}\b/g) || [])].slice(0, 60).sort();
  const index = `INDEX\n\n${words.map((w, i) => `${w}, ${3 + ((i * 37) % 280)}`).join('\n')}`;
  return join([preface, ...body, index]);
}

/** Abridged: `keep` of paragraphs kept, in order, long ones trimmed to their first sentences. */
export function abridge(text, { keep = 0.4, seed = 4 } = {}) {
  const r = rng(seed);
  return join(paras(text).filter(() => r() < keep).map((p) => { const s = p.split(/(?<=[.!?])\s+/); return s.length > 3 ? s.slice(0, Math.ceil(s.length * 0.7)).join(' ') : p; }));
}

/** An excerpt: one contiguous run of paragraphs, `share` of the text, from the middle. */
export function excerpt(text, { share = 0.1, seed = 5 } = {}) {
  const ps = paras(text), r = rng(seed), n = Math.max(3, Math.round(ps.length * share));
  const start = Math.floor((0.2 + r() * 0.5) * Math.max(0, ps.length - n));
  return join(ps.slice(start, start + n));
}

/** The front matter only: the first `n` paragraphs (a title page, contents, a preface — "only the beginning"). */
export const frontOnly = (text, n = 8) => join(paras(text).slice(0, n));

/** A superset: the held text with new chapters (from a text we do not hold) before and after. */
export function superset(text, other, { share = 0.5 } = {}) {
  const o = paras(other), k = Math.round(o.length * share / 2);
  return join([...o.slice(0, k), ...paras(text), ...o.slice(k, 2 * k)]);
}

/** A new compilation: `n` short quotations (2–3 sentences) from several held texts, between new prose. */
export function compilation(sources, prose, { n = 20, seed = 6 } = {}) {
  const r = rng(seed), np = paras(prose), out = [];
  for (let i = 0; i < n; i++) {
    const src = sources[i % sources.length], ps = paras(src).filter((p) => p.length > 120);
    if (!ps.length) continue;
    const s = ps[Math.floor(r() * ps.length)].split(/(?<=[.!?])\s+/);
    const at = Math.floor(r() * Math.max(1, s.length - 3));
    out.push(np[i % np.length] || '', `“${s.slice(at, at + 3).join(' ')}”`);
  }
  return join(out.filter(Boolean));
}

/** Commentary: new prose quoting one held text heavily — about `share` of the words are quotation. */
export function commentary(text, prose, { share = 0.3, seed = 7 } = {}) {
  const r = rng(seed), held = paras(text).filter((p) => p.length > 150), np = paras(prose), out = [];
  let quoted = 0, total = 0;
  for (const p of np) {
    out.push(p); total += p.split(/\s+/).length;
    while (held.length && quoted < share * (total + quoted)) {
      const q = held[Math.floor(r() * held.length)];
      out.push(`As the author writes: “${q}”`); quoted += q.split(/\s+/).length;
    }
  }
  return join(out);
}

/** Same title and author as a held work, a different text (a filename/title page must never decide). */
export const sameTitle = (title, author, other) => join([title.toUpperCase(), `by ${author}`, ...paras(other)]);
