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
  const how = new Map((brief?.speakers || []).map((x) => [x.name, x.recognise]));
  const lines = [`BOOK: ${book.title} — catalogued author: ${book.author}`, `RULES: ${RULES.join(' ')}`,
    `KNOWN SPEAKERS: ${roster.map((r) => (how.get(r) ? `${r} (${how.get(r)})` : r)).join('; ')}`];
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
// Stated ONCE per window (v13): repeating these and the roster descriptions in all 20 questions was ~60% of the tokens.
export const RULES = [
  'SPEAKER = who writes or speaks the paragraph as a whole. A narrator who reports or quotes someone is still the speaker — the person quoted is NOT. Only when the paragraph is entirely someone else\'s words (the body of their letter, an extract from their writings, their talk, a poem) are they the speaker.',
  'A reference or attribution line belongs to the extracts it names. In a compilation the speaker of an extract is its writer, never the compiler.',
  'QUOTES = whose words are quoted inside the paragraph ("…", "he said", "she wrote"), whose teaching it reports ("Bahá’u’lláh taught that…") or whose work it cites — always someone OTHER than the paragraph\'s own speaker; if several, the one quoted most; "none" if no one.',
];

/** Who-labels: name → short description (only for the figures and the author; the brief's "how to recognise" goes in the
 *  window text once, not into every question). */
export function speakerLabels(roster, book) {
  const who = {};
  for (const r of roster) who[r] = FIGURES.includes(r) ? `${r}${/Shoghi|House/.test(r) ? ' (incl. on behalf)' : ''}` : r;
  if (!roster.includes(book.author) && book.author) who[book.author] = `${book.author} (author/compiler, own voice)`;
  who['the Qur’án'] = 'the Qur’án'; who['the Bible'] = 'the Bible';
  who[OTHER] = 'someone not in this list';
  return who;
}

/** System-1 questions: per target, speaker and quotes, each a choice over the roster. `known[i]` = a speaker already fixed
 *  by evidence (hybrid): only its quotes are asked. The rules live in the window text (RULES). */
export function windowQuestions(roster, n, book, known = []) {
  const who = speakerLabels(roster, book);
  const quotes = { [NONE]: 'no one', ...who };
  const q = {};
  for (let i = 1; i <= n; i++) {
    if (!known[i - 1]) q[`s${i}`] = { type: 'choice', criteria: who, instructions: `Speaker of T${i}?` };
    q[`q${i}`] = { type: 'choice', criteria: quotes, instructions: `Quoted or cited in T${i}?` };
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

/** NARRATED, not spoken (v14, from the change spot-check: 12 of 36 sampled changes credited the quoted person): a paragraph
 *  whose text OUTSIDE its quotation marks names the predicted speaker, or reports speech ("wrote", "said", "affirms",
 *  "told him"), is the narrator's — the predicted person is quoted in it. A paragraph that is wholly a quotation (no
 *  narration outside the marks) or an unmarked block (a letter body, an extract) is untouched. */
const SPEECH = /\b(wr[io]te|written|writes|said|says|saying|told|tells|replied|repl(?:y|ies)|answered|exclaimed|declared|declares|affirm(?:s|ed)?|stat(?:es|ed)|asked|remarked|observed|added|continued|revealed|address(?:ed|es)|cabled|announc(?:ed|es))\b/i;
export function outsideQuotes(text) {
  // drop “…” / "…" spans (an unclosed opening quote runs to the end of the paragraph)
  return String(text || '').replace(/[“"][^”"]*(?:[”"]|$)/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = /^(mirza|haji|hajji|mulla|siyyid|shaykh|the|khan|and|of|sir|mr|mrs|dr)$/;
export function isNarrated(text, speaker) {
  // possessives drop first: "an ode of Rúmí’s" names Rúmí
  const fold = (x) => String(x || '').replace(/[’'ʼ]s\b/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`']/g, '').toLowerCase();
  const words = fold(speaker).split(/[\s,()\[\]-]+/).filter((w) => w.length >= 3 && !STOP.test(w));   // "Báb" counts
  const named = (t) => { const f = fold(t); return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f)); };
  if (!/[“"]/.test(text)) return named(text);                        // unmarked: a letter's writer does not name themself
  const out = outsideQuotes(text);
  if (SPEECH.test(out)) return true;                                  // “…,” he said. “…” — however short the tag
  return out.length >= 25 || (out.length >= 12 && named(out));        // a quote introduced in the narration
}
/** Lines that never get a speaker of their own: image captions, one-line titles / names / datelines without a sentence. */
// a dateline ("Bran August 27th 1926") or a salutation ("Dear Sir,") opens a letter and is its writer's — not a title
export const isStructuralLine = (text) => {
  const t = String(text || '').trim();
  if (/^!\[/.test(t)) return true;
  return t.length < 40 && !/[“"]/.test(t) && !/\d/.test(t) && !/,$/.test(t) && !/\b(is|was|are|were|have|has|had|will|shall|be)\b/i.test(t);
};

/** Apply the narration guard to a label: a narrated paragraph keeps the narrator (null = the book's default) and the
 *  predicted person moves to quotes. */
export function guardNarration(label, text) {
  if (!label?.speaker || label.fixed || label.speaker === EDITOR) return label;
  if (isStructuralLine(text)) return { ...label, speaker: null, structural: true };
  if (isNarrated(text, label.speaker)) return { ...label, speaker: null, quotes: label.quotes || label.speaker, narrated: true };
  return label;
}

/** An UNMARKED block (no quotation marks — a letter body, a prayer, a quoted will) moves away from the book's author only
 *  with evidence on the page (v16, from the change spot-check: ‘Abdu’l-Bahá's prayer in Memorials and His Will quoted in
 *  New Era were credited to Bahá’u’lláh with nothing introducing Him): the previous paragraph or the heading names the
 *  speaker, the block continues one already theirs, or it ends with their signature. */
export function blockHasEvidence(speaker, { text, prevText = '', prevSpeaker = null, heading = '' }) {
  if (/[“"]/.test(text)) return true;                                  // marked quotations are judged by the narration guard
  if (prevSpeaker && prevSpeaker === speaker) return true;              // continues a block already theirs
  // possessives drop first: "an ode of Rúmí’s" names Rúmí
  const fold = (x) => String(x || '').replace(/[’'ʼ]s\b/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`']/g, '').toLowerCase();
  const words = fold(speaker).split(/[\s,()\[\]-]+/).filter((w) => w.length >= 3 && !STOP.test(w));
  const named = (t) => { const f = fold(t); return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f)); };
  // the previous paragraph must name them AND introduce the block ("…sing these lines:", "He afterwards wrote:—"); merely
  // mentioning them ("But then Bahá’u’lláh left the world…") is not an introduction
  const p = String(prevText || '').trim();
  const introduces = /[:—–]\s*[”"]?\s*$/.test(p) || /\b(as follows|the following|thus)\b/i.test(p.slice(-160));
  // a heading counts only when it attributes ("Address by ‘Abdu’l-Bahá", "Words of…"), not when it names a subject
  // ("Bahá’u’lláh’s Proclamation to the Kings" passed God Passes By ¶307 to Him)
  const attributes = /\b(address|talk|discourse|words?|letters?|tablets?|prayers?|writings?|extracts?|by|from|said|says|speech|message)\b/i.test(heading || '');
  return (named(p.slice(-1500)) && introduces) || (attributes && named(heading)) || named(String(text).slice(-120));
}

/** SECONDARY literature only (random spot-check 10-09: 31 of 40 changes right — planning/authorship-secondary-sample-20261009.md).
 *  Marked quotations skip blockHasEvidence, so an un-introduced quotation took whatever source the model guessed. Here:
 *  1. junk rows (OCR garbage, catalogue metadata) take no speaker and no quoted person;
 *  2. a person named in the third person inside the paragraph, with no first person, is its subject, not its speaker
 *     ("Michael Linton sought to…");
 *  3. an introduction naming exactly ONE of the five figures decides the speaker ("Shoghi Effendi approved of…:");
 *  4. a WRITTEN source (Bahá’u’lláh, the Báb, Shoghi Effendi, the House of Justice) needs the page to give it — an
 *     introduction naming them, a citation at the end, an attributing heading, or a quotation still open from the
 *     previous paragraph (a new quotation after a closed one does not inherit). ‘Abdu’l-Bahá is exempt: His spoken words
 *     in diaries follow "He said to me:", which names no one. */
const foldName = (x) => String(x || '').replace(/[’'ʼ]s\b/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`']/g, '').toLowerCase();
const namerOf = (speaker) => {
  const words = foldName(speaker).split(/[\s,()[\]-]+/).filter((w) => w.length >= 3 && !STOP.test(w));
  return (t) => { const f = foldName(t); return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f)); };
};
const WRITTEN = new Set(['Bahá’u’lláh', 'The Báb', 'Shoghi Effendi', 'Universal House of Justice']);
export const isJunk = (text) => {
  const t = String(text || '').replace(/\s+/g, '');
  if (/\bTAGS:|\bAbstract:/.test(String(text || ''))) return true;
  return t.length >= 8 && (t.match(/\p{L}/gu) || []).length / t.length < 0.6;
};
// the full name, or a personal surname of 4+ letters — never one word of an institution ("justice")
const namesInThirdPerson = (speaker, text) => {
  const f = foldName(text), s = foldName(speaker);
  if (f.includes(s)) return true;
  const parts = s.split(/\s+/);
  if (FIGURES.includes(speaker) || parts.length < 2 || parts.length > 3) return false;
  const last = parts[parts.length - 1];
  return last.length >= 4 && !STOP.test(last) && new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f);
};
export function secondaryGuard(label, { text, prevText = '', prevSpeaker = null, heading = '', bookAuthor = '' }) {
  if (!label) return label;
  if (isJunk(text)) return { ...label, speaker: null, quotes: null, junk: true };
  // only a speaker the model gave to SOMEONE ELSE is checked; the book's own author (default or demoted) is left alone
  if (!label.speaker || label.fixed || label.speaker === EDITOR || label.unproven || foldName(label.speaker) === foldName(bookAuthor)) return label;
  const p = String(prevText || '').trim();
  const introduces = /[:—–]\s*[”"]?\s*$/.test(p) || /\b(as follows|the following|thus)\b/i.test(p.slice(-160));
  if (namesInThirdPerson(label.speaker, text) && !/\b(I|[Mm]e|[Mm]y|[Mm]ine|[Ww]e|[Uu]s|[Oo]ur)\b/.test(String(text))) return { ...label, speaker: null, subject: true };
  if (introduces) {
    const hits = FIGURES.filter((f) => namerOf(f)(p.slice(-400)));
    if (hits.length === 1) return hits[0] === label.speaker ? label : { ...label, speaker: hits[0], leadIn: true };
  }
  if (!WRITTEN.has(label.speaker)) return label;
  const named = namerOf(label.speaker);
  const attributes = /\b(address|talk|words?|letters?|tablets?|prayers?|writings?|extracts?|by|from|message)\b/i.test(heading || '');
  const stillOpen = prevSpeaker === label.speaker && !/[”"]\s*\S{0,4}$/.test(p);
  const given = (named(p.slice(-400)) && introduces) || stillOpen || (attributes && named(heading)) || named(String(text).slice(-160));
  return given ? label : { ...label, speaker: null, unproven: true };
}

/** "The editor or reporter" for a NON-footnote paragraph needs editorial evidence (v17, from the OceanLibrary run: in
 *  Days of Remembrance Bahá’u’lláh speaking of Himself in the third person — "upon Him Who is the Revealer…" — and
 *  ‘Abdu’l-Bahá's "He is God!" went to the editor): the paragraph names the book's author in the third person (or an
 *  alias — the Guardian, the Master, the Blessed Beauty) or opens like a note. */
const ALIAS = { 'Shoghi Effendi': /\bthe guardian\b/i, '‘Abdu’l-Bahá': /\bthe master\b/i, 'Bahá’u’lláh': /\b(the )?blessed beauty\b|\bthe ancient beauty\b/i };
const NOTE_OPEN = /^(revealed|written|translated|dictated|addressed|this (message|letter|tablet|cable|book|edition|compilation)|excerpts?|extracts?|from (a|the|his|her)|cf\.|see |literally|note:|the (following|above)|introduction|preface|foreword)\b/i;
export function editorHasEvidence(text, bookAuthor, { footnote = false } = {}) {
  if (footnote) return true;
  const t = String(text || '').trim();
  if (NOTE_OPEN.test(t)) return true;
  const fold = (x) => String(x || '').replace(/[’'ʼ]s\b/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`']/g, '').toLowerCase();
  const author = canonical(bookAuthor);
  const words = fold(author).split(/[\s,()\[\]-]+/).filter((w) => w.length >= 3 && !STOP.test(w));
  const f = fold(t);
  return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f)) || !!ALIAS[author]?.test(t);
}

/** A letter written ON BEHALF of Shoghi Effendi is Shoghi Effendi's (Chad: "on behalf of SE IS SE"). v17 credited his
 *  secretaries ("I am directed by Shoghi Effendi to inform you…" → H. Rabbání / Rúḥí Afnán). */
const ON_BEHALF_SE = /\b(directed by (shoghi effendi|the guardian)|on behalf of (shoghi effendi|the (beloved )?guardian)|(our|the) (beloved )?guardian (wishes|desires|hopes|has (asked|instructed|directed)|was (very )?(pleased|happy|glad|sorry)|greatly values|has been (greatly )?encouraged)|he \(the guardian\)|his \((shoghi effendi|the guardian)['’]?s?\))/i;
// his secretaries, whose letters were written for him (Rúḥí Afnán, Ḥusayn / H. Rabbání, R. Rabbání = Rúḥíyyih Khánum as
// secretary, Soheil Afnán): in Shoghi Effendi's own books their letters are his, on his behalf
const SE_SECRETARY = /\b(r[uú][ḥh][ií] afn[aá]n|soheil afn[aá]n|(h\.|[ḥh]usayn|r\.) rabb[aá]n[ií])\b/i;
const SE_POSSESSIVE = /\bthe (beloved )?guardian[’']s\b/i;
export function onBehalfOfShoghiEffendi(label, text, bookAuthor = '') {
  if (!label?.speaker || label.fixed || label.speaker === EDITOR || FIGURES.includes(canonical(label.speaker))) return label;
  const t = String(text || '');
  const seBook = canonical(bookAuthor) === 'Shoghi Effendi';
  if (ON_BEHALF_SE.test(t) || (seBook && (SE_SECRETARY.test(label.speaker) || SE_POSSESSIVE.test(t)))) return { ...label, speaker: 'Shoghi Effendi', on_behalf: true };
  return label;
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
