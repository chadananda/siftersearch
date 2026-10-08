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
export const EDITOR = 'the editor or reporter';
export function canonical(name, roster = []) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n) return null;
  if (/^(the )?(narrator|editor|reporter|recorder|chronicler|compiler'?s? (note|narrative)|author of (the|this) report)(\s*(\/|or|and)\s*(the )?(narrator|editor|reporter))?$/i.test(n)) return EDITOR;
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

/** A long paragraph shown in full where it matters for attribution: the opening, then every quotation with the words that
 *  introduce it ("…he exclaimed. “Hear me!”") — cutting at a fixed length hid quotations further in (v1 missed 6 of 30). */
export function condense(t, max = 900) {
  if (t.length <= max) return t;
  const parts = [t.slice(0, 380)];
  let last = 380;
  for (const m of t.matchAll(/[“"]([^”"]{8,})[”"]?/g)) {
    if (m.index < last) continue;
    const from = Math.max(last, m.index - 90);
    parts.push(t.slice(from, Math.min(t.length, m.index + 130)));
    last = m.index + 130;
    if (parts.length >= 6) break;
  }
  return parts.join(' […] ') + (last < t.length ? ' […]' : '');
}

/** The roster offered in ONE window: the figures, the book's author, the brief's speakers, anyone named in the window's own
 *  text, then the most recently added — capped. Offering the whole roster (Dawn-Breakers names hundreds) in each of 20
 *  questions overflowed Jev and quadrupled the cost (dry run 10-08: ~3,400 tokens/¶). */
export function relevantRoster(roster, text, book, brief, cap = 18) {
  const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`']/g, '').toLowerCase();
  const t = fold(text);
  const key = (n) => fold(n).split(/[\s,-]+/).filter((w) => w.length > 3 && !/^(mirza|haji|mulla|siyyid|shaykh|the|khan)$/.test(w));
  const keep = new Set([...FIGURES.filter((f) => roster.includes(f)), ...(book?.author && roster.includes(book.author) ? [book.author] : []),
    ...(brief?.speakers || []).map((x) => x.name).filter((n) => roster.includes(n))]);
  for (const n of roster) if (keep.size < cap && key(n).some((w) => t.includes(w))) keep.add(n);
  for (const n of [...roster].reverse()) { if (keep.size >= cap) break; keep.add(n); }
  return roster.filter((n) => keep.has(n));
}

/** Window text: anchors (decided, labelled), targets (numbered T1…T10), lookahead (unlabelled). Section headings shown. */
export function windowState({ book, roster, anchors, targets, ahead, brief = null }) {
  const lines = [`BOOK: ${book.title} — catalogued author: ${book.author}`, `KNOWN SPEAKERS: ${roster.join('; ')}`];
  if (brief?.rules?.length) lines.push(`HOW THIS BOOK WORKS: ${brief.rules.join(' ')}`);
  lines.push('');
  let lastHead = null;
  const head = (p) => { if (p.heading && p.heading !== lastHead) { lines.push(`## ${p.heading}`); lastHead = p.heading; } };
  if (anchors.length) lines.push('ALREADY DECIDED:');
  for (const p of anchors) { head(p); lines.push(`[speaker: ${p.label.speaker || '?'}; quotes: ${p.label.quotes || NONE}] ${clip(p.text, 300)}`); }
  lines.push('', 'TO DECIDE:');
  targets.forEach((p, i) => { head(p); lines.push(`T${i + 1}${p.known ? ` [speaker known: ${p.known}]` : ''}: ${condense(p.text)}`); });
  if (ahead.length) lines.push('', 'WHAT FOLLOWS (attribution lines often come AFTER the extracts they name):');
  for (const p of ahead) { head(p); lines.push(clip(p.text, 300)); }
  return lines.join('\n');
}

// A compiler gathers other people's words — never the speaker of an extract (v2 escalation credited 15 extracts to it).
export const isCompiler = (n) => /compil|research department/i.test(String(n || ''));

/** System-1 questions: per target, speaker and quotes, each a choice over the roster. `known[i]` = a speaker already fixed
 *  by evidence (hybrid): only its quotes are asked. */
export function windowQuestions(roster, n, book, known = [], brief = null) {
  const who = {};
  const how = new Map((brief?.speakers || []).map((x) => [x.name, x.recognise]));
  for (const r of roster) who[r] = (FIGURES.includes(r) ? `words of ${r}${/Shoghi|House/.test(r) ? ' (including letters written on behalf)' : ''}` : r) + (how.get(r) ? ` — ${how.get(r)}` : '');
  if (!roster.includes(book.author) && book.author) who[book.author] = `${book.author}, the author or compiler, in their own voice`;
  who['the Qur’án'] = 'a verse of the Qur’án'; who['the Bible'] = 'a passage of the Bible';
  who[OTHER] = 'someone not in this list';
  const quotes = { [NONE]: 'quotes or cites no one', ...who };
  const q = {};
  for (let i = 1; i <= n; i++) {
    if (!known[i - 1]) q[`s${i}`] = { type: 'choice', criteria: who, instructions: `Who is writing or speaking T${i} as a whole? A narrator who reports or quotes someone is still the speaker — the person quoted is NOT. Only when T${i} is entirely someone else's words (the body of their letter, an extract from their writings, their talk) are they the speaker. A reference or attribution line belongs to the extracts it names. Use the section heading, the decided paragraphs and the lines that follow.` };
    q[`q${i}`] = { type: 'choice', criteria: quotes, instructions: `Inside T${i}, whose words are quoted (“…”, "he said", "she wrote"), whose teaching is reported ("Bahá’u’lláh taught that…", "He lays stress on…") or whose work is cited — always someone OTHER than T${i}'s own speaker? If several, the one quoted most.` };
  }
  return q;
}

/** Answers → per-target { speaker, quotes, conf } (conf = the lower of the two). */
export function parseAnswers(answers, n) {
  const pick = (a) => ({ v: a?.choice ?? a?.value ?? null, c: +(a?.confidence ?? 0) });
  return Array.from({ length: n }, (_, k) => {
    const s = answers?.[`s${k + 1}`] ? pick(answers[`s${k + 1}`]) : { v: null, c: 1 }, q = pick(answers?.[`q${k + 1}`]);
    return { speaker: s.v, quotes: q.v === NONE ? null : q.v, conf: Math.min(s.c, q.c), sconf: s.c };
  });
}

/** A paragraph never "quotes" its own speaker (v6 listed Bahá’u’lláh as quoted in His own extracts). */
export function settle(l) {
  return { ...l, quotes: l.quotes && l.speaker && canonical(l.quotes) === canonical(l.speaker) ? null : l.quotes };
}

/** Targets that need the LLM: an unnamed speaker or quoted person, or confidence under `min`. */
export const needsEscalation = (l, min) => l.speaker === OTHER || l.quotes === OTHER || l.conf < min;

/** PROMPT TUNER (once per book, LLM): from the book's opening and its heading outline, a short brief for System-1 —
 *  who speaks in this book and how to recognise each, how quotations / letters / extracts are introduced and closed, what
 *  the headings mean. Chad 10-08: the LLM is "occasional arbitrator, author list extender and … system-1 prompt tuner". */
export function briefPrompt(book, opening, outline) {
  return `You are preparing instructions for a fast classifier that will read the book below a few paragraphs at a time and decide, for every paragraph, (1) who is writing or speaking it as a whole and (2) whose words it quotes or whose work it cites.

BOOK: ${book.title} — catalogued author: ${book.author}
HEADING OUTLINE (sample):
${outline}

OPENING PARAGRAPHS:
${opening}

Answer ONLY JSON: {"speakers": [{"name": "…", "recognise": "how to tell a paragraph is theirs"}], "rules": ["…", "…"]}
- speakers: everyone who speaks or writes whole paragraphs in this book (the author or narrator, people whose letters, talks or writings are reproduced, an editor), with the name as the book gives it.
- rules: at most 5 short, concrete rules specific to THIS book (e.g. "Each extract is followed by a line naming its source", "Paragraphs after a dateline are the letter's writer's own words until the signature", "The narrator quotes witnesses inside quotation marks; the narrator stays the speaker").`;
}

export function parseBrief(text, roster) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const speakers = (j.speakers || []).map((x) => ({ name: canonical(x.name, roster), recognise: String(x.recognise || '').slice(0, 200) }))
    .filter((x) => x.name && !isCompiler(x.name));
  return { speakers, rules: (j.rules || []).map((r) => String(r).slice(0, 240)).slice(0, 5) };
}

/** Escalation prompt for the flash LLM: same window, only the flagged targets, answer as JSON with real names. */
export function escalationPrompt(state, flagged) {
  return `${state}\n\nFor each of ${flagged.map((i) => `T${i + 1}`).join(', ')}, give the speaker — who writes or speaks the paragraph as a whole; a narrator who reports or quotes someone is still the speaker; only a paragraph that is entirely someone else's words (their letter, extract or talk) has them as speaker — and quotes: whose words are quoted inside it or whose work it cites (the one quoted most), or null. Use a name from KNOWN SPEAKERS when it is one of them; otherwise give the person's name as the text gives it. A reference or attribution line ("Shoghi Effendi, The Advent of Divine Justice, p. 30", "From a letter written on behalf of…") names the writer of the extracts above it. In a compilation the speaker of an extract is its writer, never the compiler.\nAnswer ONLY JSON: {"T1": {"speaker": "…", "quotes": null}, …}`;
}

export function parseEscalation(text, flagged, roster) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return {};
  let j; try { j = JSON.parse(m[0]); } catch { return {}; }
  const out = {};
  for (const i of flagged) {
    const v = j[`T${i + 1}`];
    if (!v?.speaker) continue;
    const speaker = canonical(v.speaker, roster);
    if (isCompiler(speaker)) continue;   // keep System-1's answer rather than credit the compiler
    out[i] = { speaker, quotes: v.quotes ? canonical(v.quotes, roster) : null };
  }
  return out;
}
