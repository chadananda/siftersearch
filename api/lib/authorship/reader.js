// Per-book attribution state machine (planning/paragraph-authorship-plan.md). Reads a book FORWARD with a current state;
// a quotation span stays PENDING until its evidence arrives — a lead-in before it, or a trailer / reference / footnote
// after it — and then the speaker is written BACK over every paragraph of the span. Quotation formatting is NOT trusted
// (Chad: "quotes are NOT dependably formatted"): boundaries come from content evidence — headings, trailers, references,
// lead-ins, source links. Spans that close with no evidence are returned as `open` for a System-1 call over THAT span's own
// evidence only (bounded by its neighbours' boundaries, so another passage's attribution can never mislead it).
// `checks` = paragraphs right after a lead-in quotation that may continue it (formatting can't tell) — System-1 decides.
// Pure: evidence in, { paragraphs: [{id, authors:[…]}], spans, open, checks } out. Deps: none.

const A = "['’‘ʼ`]?";
export const PEOPLE = [
  ['Bahá’u’lláh', new RegExp(`Bah[aá]${A}u${A}ll[aá]h|the Blessed Beauty|the Ancient Beauty`, 'i')],
  ['The Báb', /\bthe B[aá]b\b|the Primal Point/i],
  ['‘Abdu’l-Bahá', new RegExp(`${A}Abdu${A}l[- ]Bah[aá]|\\bthe Master\\b`, 'i')],
  ['Shoghi Effendi', /Shoghi Effendi|\bthe Guardian\b/i],
  ['Universal House of Justice', /Universal House of Justice|\bthe House of Justice\b/i],
];
const FIGURE_NAMES = new Set(PEOPLE.map(([n]) => n));
export const firstPerson = (text) => {
  let best = null, pos = Infinity;
  for (const [n, re] of PEOPLE) { const m = String(text).match(re); if (m && m.index < pos) { best = n; pos = m.index; } }
  return best;
};

const SAY = '(writes|wrote|written|says|said|states|stated|declares|declared|affirms|affirmed|asserts|asserted|explains|explained|proclaims|proclaimed|testifies|testified|exclaims|exclaimed|reveals|revealed|observes|observed|adds|added|counsels|counselled|counseled|warns|warned|assures|assured|enjoins|enjoined|sent|cabled|telegraphed|recounts|recounted|recorded|relates|related|recalls|recalled|remarks|remarked|replies|replied|answers|answered|asks|asked|describes|described|prays|prayed|comments|commented|exhorts|exhorted|urges|urged|addresses|addressed)';
const LEADIN = new RegExp(`(${SAY}[^.:!?]{0,80}|following|these words|as follows|this passage|\\bhere (?:is|are)\\b[^.!?]{0,80}|\\b(?:prayer|words|tablet|passage|statement|letter) (?:of|by|from)\\b[^.!?]{0,80})[^.!?]{0,40}:\\s*$`, 'i');
const INLINE = new RegExp(`(?:^|[\\s“"‘'(—–-])([^.;:!?]{0,60}?)\\b${SAY}\\b`, 'gi');

const SAY_RE = new RegExp(`\\b${SAY}\\b`, 'gi');
/** The person attached to the LAST speech verb ("…the Declaration of Bahá’u’lláh… Here is what the Báb wrote:" → the Báb):
 *  the name ending closest before that verb, else the first name after it ("writes Bahá’u’lláh"), else the first name. */
export function speakerOf(text) {
  const t = String(text), verbs = [...t.matchAll(SAY_RE)];
  // no speech verb: only "the words / prayer / Tablet / cable of X" names X ("challenged the truth of Bahá’u’lláh by the
  // following argument:" names the OBJECT of a challenge, not a speaker)
  if (!verbs.length) {
    const m = t.match(/\b(?:words|prayer|tablet|passage|statement|letter|message|cable|telegram|counsel|exhortation)s?\s+(?:of|from|by)\s+(.{3,60})/i);
    return m ? firstPerson(m[1].slice(0, 40)) : null;
  }
  const v = verbs[verbs.length - 1].index;
  const after = t.slice(v + verbs[verbs.length - 1][0].length).replace(/^\s+/, '');   // "writes Bahá’u’lláh:" (inverted)
  for (const [n, re] of PEOPLE) { const m = after.match(re); if (m && m.index === 0) return n; }
  // the figure must be the verb's SUBJECT: the last mention before the verb, not in object position ("the room of
  // ’Abdu’l-Bahá, declared", "wrote to the Master"), within 80 characters of the verb, with no other subject between
  // ("Lee McClung … declared", "The Chicago Inter-Ocean said", "she asks", "which he wrote"). Otherwise the speaker is
  // left open for System-1, which can answer "someone else" — narratives mention the figures constantly.
  let best = null, end = -1;
  const before = t.slice(0, v);
  for (const [n, re] of PEOPLE) for (const m of before.matchAll(new RegExp(re.source, 'gi'))) {
    if (/\b(?:of|to|with|from|by|for|about|upon|unto|before|after|toward|towards|against|at|in)\s+(?:the\s+)?$/i.test(before.slice(0, m.index))) continue;
    if (m.index + m[0].length > end) { best = n; end = m.index + m[0].length; }
  }
  if (!best) return null;
  const gap = t.slice(end, v);
  if (gap.length > 80) return null;
  // (a capital "He" mid-sentence is the reverential pronoun for the figure just named, so it does not end the subject)
  if (/(?:^|[\s,;])(?:he|she|they|we|I|who|which|whom)\s+(?:\w+[\s,]+){0,3}$/.test(gap)) return null;
  const words = gap.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const aside = /^\s*,[^,]{0,70},\s*$/.test(gap);   // "Bahá’u’lláh, in His Tablet to the Pope, writes:"
  if (!aside && words.some((w) => /^\p{Lu}/u.test(w) && !/^(He|His|Him|Himself|In|On|At|To|From|Thus|Then|Later|Once|Further|Again|Also|And|But|As|When|While|After|Before|Here|There|This|That|These|Those|The|A|An)$/.test(w))) return null;
  return best;
}

/** A paragraph that ends by introducing a quotation ("Bahá’u’lláh writes:"), with the named speaker if any. */
export function leadIn(text) {
  const t = String(text).trim();
  if (!t.endsWith(':') || t.length > 600 || !LEADIN.test(t)) return null;
  const tail = t.slice(-220);
  return { speaker: speakerOf(tail), pronoun: !firstPerson(tail) && /\b(He|She|They|it)\b/.test(tail) };
}

/** A trailing reference inside the paragraph: "… (Bahá’u’lláh, Gleanings, p. 287)", "— ‘Abdu’l-Bahá [BWF 353]",
 *  or a footnote "[^175] [175]: Bahá’u’lláh, Seven Valleys". Returns the named writer. */
export function trailingReference(text) {
  // a markdown link / URL ("[45](http://bahai-library.com/balyuzi_Bahá’u’lláh_brief_life…)") names a FILE, never the writer
  const t = String(text).replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, '').replace(/(\s*\[pg\.?\s*\d+\])+\s*$/i, '').trim();
  const paren = t.match(/\(([^()]{3,260})\)\s*\.?\s*$/);
  if (paren && firstPerson(paren[1])) return { name: firstPerson(paren[1]), kind: 'reference', cited_in: /cited in|quoted in/i.test(paren[1]) };
  // "… — ‘Abdu’l-Bahá [SWAB 2]": the name must OPEN the dash segment ("Kansas— Upon her be Bahá’u’lláh El-Abhá!" names
  // no writer — it is an ‘Abdu’l-Bahá Tablet's greeting)
  const dash = t.match(/[—–]\s*([^—–\n]{3,80})$/);
  const seg = dash ? dash[1].replace(/^[_*\s]+/, '') : '';
  if (dash && PEOPLE.some(([, re]) => { const m = seg.match(re); return m && m.index === 0; })) return { name: firstPerson(seg), kind: 'dash' };
  const fn = t.match(/\[\^?\d+\]:?\s*([^\n]{3,200})$/);
  if (fn && firstPerson(fn[1].slice(0, 60))) return { name: firstPerson(fn[1].slice(0, 60)), kind: 'footnote' };
  return null;
}

/** A paragraph that QUOTES inside the writer's own prose: > 20 letters of prose OUTSIDE its quotation marks (after
 *  dropping "[185]" / "12." numbering and a closing "(Bahá’u’lláh, Gleanings, p. 10)" reference; an unclosed quotation runs
 *  to the end). Such a paragraph has two authors — the writer, and the person quoted. */
export function mixedLead(text) {
  const t = String(text).trim().replace(/(\s*\[pg\.?\s*\d+\])+\s*$/i, '').replace(/^(\[\d+\]|\d{1,4}\.)\s*/, '').replace(/\([^()]*\)\s*\.?$/, '').replace(/\[\^?\d+\]/g, '');
  if (!/[“"«]/.test(t)) return false;
  const outside = t.replace(/[“"«][^”"»]*(?:[”"»]|$)/g, ' ');
  return (outside.match(/\p{L}/gu) || []).length > 20;
}

/** People named as SPEAKING inside a paragraph ("as Bahá’u’lláh says, “…”") — inline quotations, not the writer. */
export function inlineSpeakers(text) {
  const out = new Set();
  for (const m of String(text).matchAll(INLINE)) { const p = firstPerson(m[1]); if (p) out.add(p); }
  return [...out];
}

/**
 * Read one book.
 * @param book  { author, compilation: bool }
 * @param paras [{ id, text, heading?, section?: {names:[..], on_behalf, mixed, role}, trailer?: {name,on_behalf,kind,date} ,
 *               source?: { author, coverage } }]   — evidence already gathered by the caller
 */
export function readBook(book, paras) {
  const out = new Map(), spans = [], open = [], checks = [], owner = new Map();   // owner: who writes the prose at each paragraph
  // a speaker heading ("ADDRESS BY ‘ABDU’L-BAHÁ") makes the paragraphs under it that speaker's, until the next heading
  let byline = null;
  const own = () => (byline ? { name: byline, role: 'author', basis: 'byline' } : { name: book.author, role: 'author', basis: 'book' });
  let span = null;                                  // { ids:[], speaker, basis, start, leadIn }
  let lastProse = null;                             // index of the last paragraph read as the book author's prose
  const close = (speaker, basis, extra = {}) => {
    if (!span || !span.ids.length) { span = null; return; }
    const s = { ...span, speaker: speaker ?? span.speaker, basis: speaker ? basis : span.basis, ...extra };
    if (s.speaker) for (const id of s.ids) out.set(id, [{ name: s.speaker, role: 'author', basis: s.basis, ...(s.on_behalf ? { on_behalf: true } : {}) }]);
    else open.push(s);
    spans.push(s); span = null;
  };
  const sectionSpeaker = (p) => (p.section && !p.section.mixed && p.section.names?.length === 1 ? p.section : null);

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i], t = String(p.text || '').trim();
    if (!t) continue;
    // a heading sets the speaker; a heading right after another heading (venue, date: "ADDRESS BY ‘ABDU’L-BAHÁ" /
    // "UNITARIAN CHURCH, PALO ALTO") keeps the speaker the first one named
    const prevHeading = i > 0 && !!paras[i - 1]?.isHeading;
    if (p.isHeading) byline = p.byline || (prevHeading ? byline : null);
    else if (p.byline) byline = p.byline;           // "Interpreter —? You are all welcome…": a talk opening inline
    owner.set(p.id, byline || book.author);
    if (p.isHeading) { close(null, null); out.set(p.id, [{ name: null, role: 'heading', basis: 'heading' }]); continue; }   // ends any span
    if (p.isMeta) { out.set(p.id, [{ name: null, role: 'meta', basis: 'meta' }]); continue; }   // a date / source note: transparent
    if (p.trailer) {                                                       // attribution line → resolve the span back
      if (!span && book.compilation) span = { ids: [], start: i };
      // an UNNAMED trailer ("(From a Tablet—translated from the Persian)") still ends the extract: it keeps its section's
      // writer if the section names one, else it is left open for System-1 — never run on into the next extract
      if (span) p.trailer.name ? close(p.trailer.name, 'trailer', { on_behalf: p.trailer.on_behalf }) : close(null, null);
      // ordinary book, no open span: the trailer names the writer of the ONE quotation just above it (never a run —
      // the author's own prose before that must not inherit it)
      else if (p.trailer.name && FIGURE_NAMES.has(p.trailer.name) && lastProse != null && lastProse === i - 1 && String(paras[i - 1].text).trim().length >= 25
        && !/^\(?\s*(\w+ \d{1,2},? \d{4}|\d{1,2} \w+ \d{4})/.test(String(paras[i - 1].text).trim()))   // not a date / addressee line
        out.set(paras[i - 1].id, [{ name: p.trailer.name, role: 'author', basis: 'trailer-prev', ...(p.trailer.on_behalf ? { on_behalf: true } : {}) }]);
      out.set(p.id, [{ name: p.trailer.name || null, role: 'reference', basis: p.trailer.name ? 'trailer' : 'trailer-unnamed' }]);
      continue;
    }
    const lead = leadIn(t);
    if (lead && !book.compilation) {                                       // prose that introduces a quotation
      close(null, null);
      const q = inlineSpeakers(t);
      out.set(p.id, [own(p), ...q.map((n) => ({ name: n, role: 'quoted', basis: 'inline' }))]);
      span = { ids: [], start: i + 1, speaker: lead.speaker, basis: lead.speaker ? 'lead-in' : null, leadIn: p.id, pronoun: lead.pronoun };
      continue;
    }
    const sec = sectionSpeaker(p);
    const ref = trailingReference(t);
    if (book.compilation) {                                                // every paragraph belongs to the current extract
      // a new section naming a different writer ends the extract even when no heading row or trailer survived ingest
      if (sec && span?.ids.length && span.basis === 'section' && span.speaker !== sec.names[0]) close(span.speaker, 'section', { on_behalf: span.on_behalf });
      span ??= { ids: [], start: i, speaker: sec ? sec.names[0] : null, basis: sec ? 'section' : null, on_behalf: sec?.on_behalf };
      span.ids.push(p.id);
      // a footnote cites the source of an INLINE quotation (a compilation's introduction): it does not name the extract's writer
      if (ref && ref.kind !== 'footnote') close(ref.name, 'reference');
      continue;
    }
    // the first paragraph after a lead-in that NAMES its speaker is that speaker's — a source link (a catalogue-level clue)
    // never overrides the book's own introduction ("the following words of ’Abdu’l-Bahá are illuminating:")
    if (span && !span.ids.length && span.leadIn != null && span.speaker) {
      span.ids.push(p.id);
      if (ref) close(ref.name, 'reference');
      continue;
    }
    // ordinary book: a source-linked WHOLE quotation is definite — the source is (nearly) all present (coverage) AND fills
    // most of this paragraph (share); a short passage inside long prose is an inline quotation (handled below as `quoted`)
    if (p.source && p.source.coverage >= 0.8 && (p.source.share ?? 1) >= 0.6) {
      if (span && span.speaker && span.speaker !== p.source.author) close(null, null);
      span ??= { ids: [], start: i };
      span.speaker ??= p.source.author; span.basis ??= 'source_link';
      span.ids.push(p.id);
      if (ref) close(ref.name, 'reference');
      continue;
    }
    if (span && !span.ids.length && span.leadIn != null) {                 // first paragraph after a lead-in IS the quotation
      span.ids.push(p.id);
      if (ref) close(ref.name, 'reference');
      continue;
    }
    if (span && span.ids.length) {
      if (ref) { span.ids.push(p.id); close(ref.name, 'reference'); continue; }   // the reference closes it
      // Formatting can't say whether a quotation continues; record THIS paragraph for a continuation check (System-1)
      // and end the span here. The check may extend the span; until then the paragraph reads as the book's prose.
      if (span.leadIn != null) checks.push({ id: p.id, after: span.ids[span.ids.length - 1], span_start: span.ids[0], speaker: span.speaker });
      close(null, null);
    }
    // a whole quotation signalled by its own ending: "… — ‘Abdu’l-Bahá [SWAB 2]", or a paragraph that opens as a quotation
    // and closes with its reference. (A footnote/parenthetical inside ordinary prose cites an INLINE quotation instead.)
    if (ref && (ref.kind === 'dash' || /^[“"‘'>«]/.test(t))) {
      out.set(p.id, [{ name: ref.name, role: 'author', basis: 'reference' }]);
      continue;
    }
    // an interview / Q&A transcript line names its own speaker ("’Abdu’l-Bahá. No, …", "Mr. Lawson. Then you …")
    if (p.dialogue) { out.set(p.id, [{ ...p.dialogue, role: 'author', basis: 'dialogue' }]); continue; }
    // plain prose of the book's author, with any inline quotations it names
    const authors = [own(p)];
    for (const n of inlineSpeakers(t)) if (n !== book.author) authors.push({ name: n, role: 'quoted', basis: 'inline' });
    if (p.source && p.source.coverage >= 0.2 && !authors.some((a) => a.name === p.source.author)) authors.push({ name: p.source.author, role: 'quoted', basis: 'source_link' });
    if (ref && ref.name !== book.author && !authors.some((a) => a.name === ref.name)) authors.push({ name: ref.name, role: 'quoted', basis: 'reference' });
    out.set(p.id, authors);
    lastProse = i;
  }
  close(null, null);
  // paragraphs never assigned (inside spans left open): unresolved until the System-1 pass
  const paragraphs = paras.filter((p) => String(p.text || '').trim()).map((p) => ({ id: p.id, authors: out.get(p.id) || null }));
  return { paragraphs, spans, open, checks, owner };
}
