// Windowed paragraph attribution (Chad 2026-10-08): a System-1 classifier reads a book 20 paragraphs at a time — 5 already
// decided (shown WITH their labels), 10 to decide, 5 ahead (attribution lines come AFTER extracts) — and picks, per
// paragraph, whose words it is (speaker) and whose words it quotes or cites (quotes), from the book's ROSTER. "another
// person" and low confidence go to a flash LLM on the same window, whose new names join the roster for what follows.
// Pure: roster, window text, questions, answer parsing, name matching. Driver: scripts/authorship/window-classify.mjs.

export const FIGURES = ['Bahá’u’lláh', 'The Báb', '‘Abdu’l-Bahá', 'Shoghi Effendi', 'Universal House of Justice'];
export const OTHER = 'another person', NONE = 'none';
const A = "['’‘ʼ`]?";
const ALIASES = [
  ['Bahá’u’lláh', new RegExp(`^bah[aá]${A}u${A}ll[aá]h$`, 'i')], ['‘Abdu’l-Bahá', new RegExp(`^${A}abdu${A}l[- ]bah[aá]$|^the master$`, 'i')],
  ['The Báb', /^(the )?b[aá]b$/i], ['Shoghi Effendi', /^shoghi effendi$|^the guardian$/i],
  ['Universal House of Justice', /^(the )?universal house of justice$/i],
];

/** Canonical form of a name an LLM wrote, matched against the roster (case, apostrophes, "the", accents). */
export function canonical(name, roster = []) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n) return null;
  for (const [c, re] of ALIASES) if (re.test(n)) return c;
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`']/g, '').replace(/^the /i, '').toLowerCase();
  return roster.find((r) => fold(r) === fold(n)) || n;
}

/** Starting roster: the doctrinal figures (Bahá’í books), the catalogue author, the book's own author list. */
export function initialRoster({ author, authors = [], religion = '' }) {
  const out = [];
  const add = (n) => { const c = canonical(n, out); if (c && !out.includes(c) && !/compil|^unknown$|^various$/i.test(c)) out.push(c); };
  if (/bah/i.test(religion)) FIGURES.forEach(add);
  [author, ...authors].forEach(add);
  return out;
}

const clip = (t, n) => (t.length > n ? `${t.slice(0, n)} […]` : t);

/** Window text: anchors (decided, labelled), targets (numbered T1…T10), lookahead (unlabelled). Section headings shown. */
export function windowState({ book, roster, anchors, targets, ahead }) {
  const lines = [`BOOK: ${book.title} — catalogued author: ${book.author}`, `KNOWN SPEAKERS: ${roster.join('; ')}`, ''];
  let lastHead = null;
  const head = (p) => { if (p.heading && p.heading !== lastHead) { lines.push(`## ${p.heading}`); lastHead = p.heading; } };
  if (anchors.length) lines.push('ALREADY DECIDED:');
  for (const p of anchors) { head(p); lines.push(`[speaker: ${p.label.speaker || '?'}; quotes: ${p.label.quotes || NONE}] ${clip(p.text, 300)}`); }
  lines.push('', 'TO DECIDE:');
  targets.forEach((p, i) => { head(p); lines.push(`T${i + 1}: ${clip(p.text, 700)}`); });
  if (ahead.length) lines.push('', 'WHAT FOLLOWS (attribution lines often come AFTER the extracts they name):');
  for (const p of ahead) { head(p); lines.push(clip(p.text, 300)); }
  return lines.join('\n');
}

/** System-1 questions: per target, speaker and quotes, each a choice over the roster. */
export function windowQuestions(roster, n, book) {
  const who = {};
  for (const r of roster) who[r] = FIGURES.includes(r) ? `words of ${r}${/Shoghi|House/.test(r) ? ' (including letters written on behalf)' : ''}` : r;
  if (!roster.includes(book.author) && book.author) who[book.author] = `${book.author}, the author or compiler, in their own voice`;
  who['the Qur’án'] = 'a verse of the Qur’án'; who['the Bible'] = 'a passage of the Bible';
  who[OTHER] = 'someone not in this list';
  const quotes = { [NONE]: 'quotes or cites no one', ...who };
  const q = {};
  for (let i = 1; i <= n; i++) {
    q[`s${i}`] = { type: 'choice', criteria: who, instructions: `Whose words are in T${i}? A reference or attribution line belongs to the extracts it names. Use the section heading, the decided paragraphs and the lines that follow.` };
    q[`q${i}`] = { type: 'choice', criteria: quotes, instructions: `Inside T${i}, whose words are quoted or whose work is cited (other than the speaker)?` };
  }
  return q;
}

/** Answers → per-target { speaker, quotes, conf } (conf = the lower of the two). */
export function parseAnswers(answers, n) {
  const pick = (a) => ({ v: a?.choice ?? a?.value ?? null, c: +(a?.confidence ?? 0) });
  return Array.from({ length: n }, (_, k) => {
    const s = pick(answers?.[`s${k + 1}`]), q = pick(answers?.[`q${k + 1}`]);
    return { speaker: s.v, quotes: q.v === NONE ? null : q.v, conf: Math.min(s.c, q.c), sconf: s.c };
  });
}

/** Targets that need the LLM: an unnamed speaker or quoted person, or confidence under `min`. */
export const needsEscalation = (l, min) => l.speaker === OTHER || l.quotes === OTHER || l.conf < min;

/** Escalation prompt for the flash LLM: same window, only the flagged targets, answer as JSON with real names. */
export function escalationPrompt(state, flagged) {
  return `${state}\n\nFor each of ${flagged.map((i) => `T${i + 1}`).join(', ')}, name whose words it is (speaker) and whose words it quotes or whose work it cites (quotes, or null). Use a name from KNOWN SPEAKERS when it is one of them; otherwise give the person's name as the text gives it. A reference or attribution line ("Shoghi Effendi, The Advent of Divine Justice, p. 30", "From a letter written on behalf of…") names the writer of the extracts above it.\nAnswer ONLY JSON: {"T1": {"speaker": "…", "quotes": null}, …}`;
}

export function parseEscalation(text, flagged, roster) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return {};
  let j; try { j = JSON.parse(m[0]); } catch { return {}; }
  const out = {};
  for (const i of flagged) {
    const v = j[`T${i + 1}`];
    if (!v?.speaker) continue;
    out[i] = { speaker: canonical(v.speaker, roster), quotes: v.quotes ? canonical(v.quotes, roster) : null };
  }
  return out;
}
