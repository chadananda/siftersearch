// REPLY FORM checks (Chad 11-14, Reddit round 3): what the reply LOOKS like, never what the question means (no intent by words; md-valid.js is the
// precedent). Offers out of the prose and into the pills; section heads only when the agent itself chose depth (its marker) — otherwise
// turned into plain prose by code (deHead; a rewrite cleared 5 of 17 at +10 s); quotations in rank order (the Writings and
// Shoghi Effendi, then talks and pilgrim notes, then the House and every other body, then commentary). Pure. Deps: lint, source-tier.
import { isSearchOffer, isOffer } from './lint.js';
import { sourceTier, rankOf, TIER_ORDER } from './source-tier.js';
import { sentencesOf } from './sentences.js';

/** The agent starts its reply with this when IT decides the reader asked for depth or research (its judgement, never a keyword test).
 *  Stripped before anything is shown, as NOT_FOUND is. Without it the reply is a short answer: no run-in section heads. */
export const DEPTH = '[[DEPTH]]';
export const hasDepth = (text) => String(text || '').includes(DEPTH);
export const dropDepth = (text) => String(text || '').replaceAll(DEPTH, '').replace(/^[ \t]*\n/, '');

const STRUCTURED = /^\s*(?:>|\||[-*+]\s|\d+[.)]\s|\{\{|<!--)/;
const unquote = (s) => String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' ');

// AN INVITATION to ask (18t1bhn: "You are welcome to ask how…"): the pills are the reader's next question, never a sentence of the reply
const INVITE = /\b(?:you(?:['’]re| are) (?:welcome|free|invited) to (?:ask|explore|look)|feel free to (?:ask|let me know|follow up)|let me know if you(?:['’]d| would)? (?:like|want|wish)|(?:just )?ask me (?:about|if|for|to|how|what|why)\b|if you(?:['’]d| would)? like(?:,| to (?:explore|go|look|hear|read|see|know|learn|dig)| more\b| me to\b))/i;
const NUDGE = /^\s*(?:just\s+(?:ask|say|let\s+me\s+know)|let\s+me\s+know|happy\s+to\s+help|i['’]m\s+here\b)[^.!?\n]{0,80}[.!?]?\s*$/i;
export const isInvite = (s) => INVITE.test(unquote(s));
// A FIRST-PERSON OFFER of more (1j4m76y: "I can set out how the Christian or Islamic traditions answer your question."): Anís speaks of the
// texts, not of what it could do next — "I could not find…" and "I can only say…" are not offers
// "If you tell me how that sits with you, I can say more about …" (18t1bhn round 5): a conditional lead-in is part of the offer
const I_OFFER = /^\s*(?:if\s+[^,.!?]{1,80},\s*)?(?:and\s+|so\s+)?I\s+(?:can|could)(?:\s+also)?\s+(?!not\b|only\b|never\b|n['’]t\b|see\s+why\b)[a-z]/i;
const I_CLAUSE = /^([\s\S]*?\S)\s*[,;]?\s+(?:and|but|so)\s+(I\s+(?:can|could)(?:\s+also)?\s+(?!not\b|only\b|never\b)[a-z][^.!?]*)([.!?]+)(\s*)$/i;
export const isFirstPersonOffer = (s) => I_OFFER.test(unquote(s));
export const isOfferSentence = (s) => isSearchOffer(s) || isOffer(s) || isInvite(s) || isFirstPersonOffer(s);

const sentences = sentencesOf;   // abbreviations stay inside a sentence (sentences.js)

/** → { text, offers }: every offer or invitation sentence in the prose goes (a following "Just ask." with it); blockquotes, tables,
 *  lists, headings and templates are never touched, and the reply is never emptied (allowEmpty: a streamed piece that is only an offer goes). `offers` are the removed sentences, for the pills. */
export function dropOffers(text, { allowEmpty = false } = {}) {
  const src = String(text || ''), offers = [];
  const out = src.split('\n').map((line) => {
    if (!line.trim() || STRUCTURED.test(line) || /^\s*#/.test(line)) return line;
    const ss = sentences(line), kept = [];
    for (let i = 0; i < ss.length; i++) {
      if (isOfferSentence(ss[i])) { offers.push(ss[i].trim()); if (ss[i + 1] && NUDGE.test(ss[i + 1])) i++; continue; }
      // "…from their own scriptures, and I can set those out alongside it." → the claim stays, the offer goes
      const c = !/[“"]/.test(ss[i]) && ss[i].match(I_CLAUSE);
      if (c) { offers.push(`${c[2].trim()}${c[3][0]}`); kept.push(`${c[1].replace(/[,;]$/, '')}.${c[4]}`); continue; }
      kept.push(ss[i]);
    }
    return kept.join('') === ss.join('') ? line : kept.join('').trimEnd();
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return offers.length && (out || allowEmpty) ? { text: out, offers } : { text: src, offers: [] };
}

/** Bold run-in section heads: paragraphs opening with "**Sexism.**" / "**Sexism**" (then text, or a line of their own) or a "#" heading.
 *  Two or more make a sectioned essay — the depth form. A bold quotation ("**“…”**") and a bold word inside a sentence are not heads. */
export function runInHeads(text) {
  const heads = [];
  for (const para of String(text || '').split(/\n{2,}/)) {
    const first = para.trimStart().split('\n')[0];
    if (/^#{1,6}\s+\S/.test(first)) { heads.push(first.replace(/^#+\s*/, '').trim()); continue; }
    const m = first.match(/^\*\*([^*\n]{1,80})\*\*\s*(.*)$/);
    if (!m || /^\s*[“"‘'«]/.test(m[1])) continue;
    if (!m[2] || /^[.:—–-]/.test(m[2]) || /[.:—–-]\s*$/.test(m[1]) || /^[A-Z“"]/.test(m[2].trim())) heads.push(m[1].replace(/[.:—–\s-]+$/, ''));
  }
  return heads.length >= 2 ? heads : [];
}

// ---- heads → plain prose, by code (team-lead 11-14: "an 11 s rewrite that clears 2 of 9 isn't worth keeping for heads") ----
// Form only: the head's words stay, as the paragraph's first sentence. Without the agent's DEPTH marker:
//   "**Sexism.** On rights…" → "Sexism. On rights…";  "**How agreement is found**" / "## X" (not a "# X" title) alone, then a paragraph → "X. The paragraph…";
//   "1. Human origins and evolution" alone, then a paragraph (197utk7) → "Human origins and evolution. The paragraph…".
// A real list (numbered items in a row), a table's heading, a bold quotation, a bold word inside a sentence and "**X** Text" with no stop are left alone.
const QUOTED = /^\s*[“"‘«][\s\S]*[”"’»]\s*$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s/;
const asSentence = (h) => { const t = h.replace(/\*\*/g, '').trim().replace(/\s*[:—–-]+$/, '').trim(); return /[.!?]["”’)]*$/.test(t) ? t : `${t}.`; };
const isProse = (p) => !!p?.trim() && !STRUCTURED.test(p) && !/^\s*#/.test(p) && !/^\s*\*\*/.test(p);
/** → { head, body } when the paragraph opens with a section head (numbered heads need what is around them), else null. */
function headOf(para, prev, next) {
  const [first, ...more] = para.replace(/^\s+/, '').split('\n'), rest = more.join('\n');
  if (/^\s*\|/.test(rest.trim() ? rest : next || '')) return null;   // a table's title stays a heading (a compiled table or email)
  let m = first.match(/^#{2,6}\s+(\S.*?)\s*#*\s*$/);   // "# X" is the reply's title (a compiled table, an email) and stays
  if (m) return { head: m[1], body: rest };
  m = first.match(/^\*\*([^*\n]{1,160})\*\*\s*(.*)$/);
  if (m) {
    const [, h, after] = m;
    if (QUOTED.test(h)) return null;
    if (!after.trim()) return { head: h, body: rest };
    const p = after.match(/^([.:—–-])\s*(.*)$/);
    if (p) return { head: h, body: [p[2], rest].filter(Boolean).join('\n') };
    return /[.:!?]["”’)]*\s*$/.test(h) ? { head: h, body: [after, rest].filter(Boolean).join('\n') } : null;
  }
  m = !rest && first.match(/^\d{1,2}[.)]\s+(?:\*\*)?([^*\n]{1,80}?)(?:\*\*)?\s*$/);
  return m && !/[.!?;,:]$/.test(m[1]) && isProse(next) && !NUMBERED.test(prev || '') ? { head: m[1], body: '' } : null;
}
/** → { text, heads }: every section head made the first sentence of its paragraph. `prev`: the paragraph before `text` (a live piece). */
export function deHead(text, { prev = '' } = {}) {
  const heads = [];
  // a bold run-in at any line start, its text on the same line (1g330j9 put "**Purpose of sex.** …" after a single line break)
  const lined = String(text || '').split('\n').map((line) => {
    const m = !/^\s*[>|]/.test(line) && line.match(/^(\s*)\*\*([^*\n]{1,160})\*\*\s*(\S.*)$/), h = m && headOf(`**${m[2]}** ${m[3]}`);
    if (!h?.body?.trim()) return line;
    heads.push(h.head.replace(/[.:—–\s-]+$/, ''));
    return `${m[1]}${asSentence(h.head)} ${h.body}`;
  }).join('\n');
  const parts = lined.split(/(\n{2,})/), out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const para = parts[i], lead = para.match(/^\s*/)[0];
    const h = para.trim() ? headOf(para, i ? parts[i - 2] : prev, parts[i + 2]) : null;
    if (!h) { out.push(para, parts[i + 1] ?? ''); continue; }
    heads.push(h.head.replace(/\*\*/g, '').replace(/[.:—–\s-]+$/, ''));
    if (h.body.trim()) out.push(`${lead}${asSentence(h.head)} ${h.body.trimStart()}`, parts[i + 1] ?? '');
    else if (isProse(parts[i + 2])) { out.push(`${lead}${asSentence(h.head)} ${parts[i + 2].trimStart()}`, parts[i + 3] ?? ''); i += 2; }
    else out.push(`${lead}${asSentence(h.head)}`, parts[i + 1] ?? '');
  }
  return heads.length ? { text: out.join(''), heads } : { text: String(text || ''), heads };
}
// a paragraph that may be a head with its paragraph still to come (a live piece ends on it): "\n1. ", "Human origins\n\n", "**X**", "## X"
const OPEN_HEAD = /^(?:\d{1,2}[.)]\s*(?:\*\*)?[^*\n.!?]{0,80}(?:\*\*)?|#{1,6}\s+[^\n]+|\*\*[^*\n]{1,160}\*\*[.:]?)$/;
/** Live: pieces as the gate releases them → pieces de-headed. A piece ending on a possible head is held until the next arrives
 *  (197utk7 streamed "\n1. " then "Human origins and evolution\n\n"). `deep`: the agent's marker seen → pieces pass untouched. */
export function liveDeHead(deep = () => false) {
  let held = '', prev = '', heads = 0;
  const emit = (s) => { const r = deHead(s, { prev }); heads += r.heads.length; const paras = r.text.split(/\n{2,}/).filter((p) => p.trim()); if (paras.length) prev = paras.at(-1); return r.text; };
  return {
    push(piece) {
      if (deep()) { const s = held + piece; held = ''; return s ? [s] : []; }
      const s = held + piece; held = '';
      const at = s.search(/\n{2,}\s*\S[^\n]*\s*$/), tail = at < 0 ? s : s.slice(at), last = tail.trim();
      if (last && OPEN_HEAD.test(last) && !QUOTED.test(last.replace(/\*\*/g, ''))) { held = tail; const before = at < 0 ? '' : s.slice(0, at); return before ? [emit(before)] : []; }
      return [emit(s)];
    },
    flush() { const s = held; held = ''; return s ? [emit(s)] : []; },
    get heads() { return heads; },
  };
}

/** The quoted passages in the order the reader meets them: {{quote P3}} cards, blockquote lines citing P#, and an inline "…" right before its ref. */
export function quotedRefs(text) {
  const t = String(text || ''), hits = [];
  for (const m of t.matchAll(/\{\{\s*quote:?\s*[^}]*?\b(P\d+)\b/g)) hits.push([m.index, m[1]]);
  let at = 0;
  for (const line of t.split('\n')) {
    if (/^\s*>/.test(line)) for (const m of line.matchAll(/\b(P\d+)\b/g)) hits.push([at + m.index, m[1]]);
    at += line.length + 1;
  }
  for (const m of t.matchAll(/[”"][*_]{0,2}[ \t]*\(?\[\[?(P\d+)/g)) hits.push([m.index, m[1]]);
  const seen = new Set();
  return hits.sort((a, b) => a[0] - b[0]).map(([, r]) => r).filter((r) => !seen.has(r) && seen.add(r));
}

// Rank order of quotations (Chad 11-14): the Writings, Shoghi Effendi, a compilation of the Writings, then talks and pilgrim notes
// (a Central Figure's words as recorded) — above every administrative body, the House included — then commentary. TIER_ORDER
// (source-tier.js) by whole tier: the talk-before-pilgrim half step is not worth a rewrite. Nabíl's narrative keeps its place in
// a story (scenes run in time order), and a passage with no Bahá'í tier (another tradition, the web) is not ranked. The Writings
// and Shoghi Effendi are one written core: either may lead (round 5: 3 of 6 rewrites were only the Guardian first, none complied).
const CORE = TIER_ORDER.indexOf('writings');
const tierOf = (p) => { const t = sourceTier(p); return !t || t === 'narrative' ? null : t === 'guardian' ? CORE : Math.floor(rankOf(p)); };
/** → { first, core, firstTier, coreTier, order, tiers } when a quoted passage comes before one of higher rank (`first` before
 *  `core`); `order` is every ranked quotation in rank order (ties keep the reply's order); else null. `found`: Map ref → passage.
 *  Order only — never what is quoted. */
export function leadSource(text, found) {
  const get = (r) => found?.get?.(r);
  const refs = quotedRefs(text).filter((r) => get(r) && tierOf(get(r)) != null);
  for (let j = 1; j < refs.length; j++) {
    const i = refs.slice(0, j).findIndex((r) => tierOf(get(r)) > tierOf(get(refs[j])));
    if (i < 0) continue;
    const order = refs.map((r, k) => [r, k]).sort((x, y) => tierOf(get(x[0])) - tierOf(get(y[0])) || x[1] - y[1]).map(([r]) => r);
    return { first: refs[i], core: refs[j], firstTier: sourceTier(get(refs[i])), coreTier: sourceTier(get(refs[j])), order, tiers: Object.fromEntries(order.map((r) => [r, sourceTier(get(r))])) };
  }
  return null;
}
/** The first quoted passage that the turn holds, with its tier and writers — telemetry (timings.form.first), never shown. */
export function firstQuoted(text, found) {
  const ref = quotedRefs(text).find((r) => found?.get?.(r)), p = ref && found.get(ref);
  return p ? { ref, tier: sourceTier(p), author: p.author ?? p.source_author ?? null, book_author: p.book_author ?? null } : null;
}
const KIND = { writings: 'the Writings', guardian: 'Shoghi Effendi', compilation: 'a compilation of the Writings', reported: 'a talk or pilgrim’s note', house: 'a House of Justice letter', secondary: 'commentary or an institution’s letter' };
const kindOf = (t) => KIND[t] || 'another source';
export const leadAsk = ({ first, core, firstTier, coreTier, order = [core, first], tiers = {} }) => `(note from the library, not the reader) ${first} (${kindOf(firstTier)}) is quoted before ${core} (${kindOf(coreTier)}). Write the reply again with the quotations in this order: ${order.map((r) => `${r} (${kindOf(tiers[r])})`).join(', ')}. Keep a quotation only if it adds something. Say nothing in the reply about this order.`;

// ---- the fallback when the rewrite kept the wrong order (round 5: complied in 1 of 6) ----
// Whole quotation blocks trade places, each with its lead-in paragraph (one ending ":"), only when nothing refers across them:
// a lead-in or the paragraph after a moved block that opens on a back-reference ("This…", "There he…", "Shoghi Effendi frames it
// the same way") keeps the draft. Inline quotations never move; the result must pass leadSource or the draft stays. Pure.
const BACK = /^\s*[*_]*(?:(?:on|in|for|to|with|of|by|from|at) (?:this|that|these|those|it|him|them)\b|this|that|these|those|there|here|he|she|it|they|his|her|its|their|both|such|so|thus|likewise|similarly|again|in (?:it|this|that)|the same)\b/i;
const REFER = /\b(?:the same way|same point|as above|above|below|also|too|again|likewise|as well|that passage|this passage|these passages|the passage)\b/i;
const quoteBlock = (s) => /^\s*\{\{\s*quote:?[^}]*\}\}\s*$/.test(s) || s.split('\n').every((l) => /^\s*>/.test(l));
/** → { text, order } with the ranked quotation blocks in rank order, or null (keep the draft). `found`: Map ref → passage. */
export function reorderQuotes(text, found) {
  const paras = String(text || '').split(/\n{2,}/), get = (r) => found?.get?.(r);
  if (/\b(?:quoted|passage|words) (?:above|below)\b|\bas above\b/i.test(text)) return null;
  const units = [];   // { from, to, ref, tier }: paragraphs from..to (lead-in + block)
  paras.forEach((p, i) => {
    if (!quoteBlock(p)) return;
    const refs = quotedRefs(p).filter((r) => get(r) && tierOf(get(r)) != null);
    if (refs.length !== 1) return;
    const lead = i > 0 && !quoteBlock(paras[i - 1]) && /:[*_]*\s*$/.test(paras[i - 1]) && !units.some((u) => u.to === i - 1);
    units.push({ from: lead ? i - 1 : i, to: i, ref: refs[0], tier: tierOf(get(refs[0])) });
  });
  const sorted = units.map((u, k) => [u, k]).sort((a, b) => a[0].tier - b[0].tier || a[1] - b[1]).map(([u]) => u);
  if (sorted.every((u, k) => u === units[k])) return null;
  for (let k = 0; k < units.length; k++) {
    if (sorted[k] === units[k]) continue;
    const u = sorted[k];
    if (u.from < u.to && (BACK.test(paras[u.from]) || REFER.test(paras[u.from]))) return null;   // its lead-in leans on what came before
    const after = paras[units[k].to + 1];
    if (after != null && !quoteBlock(after) && (BACK.test(after) || /\babove\b/i.test(after))) return null;   // the next paragraph leans on the block it loses
    const own = paras[u.to + 1];
    if (own != null && !quoteBlock(own) && BACK.test(own)) return null;   // …or on this one, which leaves it
  }
  const out = []; let k = 0;
  for (let i = 0; i < paras.length;) {
    const slot = units.find((u) => u.from === i);
    if (slot) { const u = sorted[k++]; out.push(...paras.slice(u.from, u.to + 1)); i = slot.to + 1; } else out.push(paras[i++]);
  }
  const t = out.join('\n\n');
  return leadSource(t, found) ? null : { text: t, order: sorted.map((u) => u.ref) };
}

// ---- the offer becomes a pill ----
const STOP = new Set('about also could deeper further more into like would what which their there these those this that with from have your just tell some show share explain look further other bahá bahai faith writings teachings'.split(' '));
const words = (s) => (String(s || '').toLowerCase().match(/\p{L}{4,}/gu) || []).filter((w) => !STOP.has(w));
const OFFER_HEAD = /^.*?\b(?:I (?:can|could)(?: also)?|I(?:['’]d| would) be (?:glad|happy) to|I(?:['’]m| am) happy to|would you like me to|shall I|should I|want me to|(?:if )?you(?:['’]re| are) (?:welcome|free|invited) to ask(?: me)?|feel free to ask(?: me)?|ask me)\s+(?:go (?:deeper|further)\s+(?:into|on|in)|say more (?:about|on)|look (?:at|into)|walk you through|show you|share|explain|explore|trace|unpack|read|open|set out|lay out|about)?\s*/i;
/** "I can go deeper into how the Writings frame chastity, or …" → "Tell me more about how the Writings frame chastity" (≤ 90 chars), or null. */
export function offerPill(offer) {
  const s = String(offer || '').trim();
  if (!OFFER_HEAD.test(s)) return null;
  const topic = s.replace(OFFER_HEAD, '').split(/,\s*(?:or|and)\s|,\s*if\b|\s+(?:if|should|whenever|when) you\b|\s+—\s|[.!?;]/)[0].replace(/[\s,:]+$/, '').trim();
  // "I can set those out alongside it": the offer points back at the reply, not at a question a pill could ask
  if (words(topic).length < 1 || /^(?:those|these|them|it|this|that)\b/i.test(topic) || /\bI\s+(?:can|could)(?:\s+also)?\s+\w+\s+(?:those|these|them|it|this|that)\b/i.test(s)) return null;
  const pill = `Tell me more about ${topic}`;
  return pill.length <= 90 ? pill : null;
}
/** Pills that already take up the offer stay; an offer no pill covers becomes one (the last pill makes way when there are three). */
export function withOfferPill(pills = [], offers = []) {
  const out = [...pills];
  for (const o of offers) {
    const p = offerPill(o); if (!p) continue;
    const want = words(p.replace(/^Tell me more about /, ''));
    const covered = out.some((q) => { const have = new Set(words(q)); return want.filter((w) => have.has(w)).length >= Math.min(want.length, Math.max(2, Math.ceil(want.length / 2))); });
    if (covered) continue;
    if (out.length >= 3) out[out.length - 1] = p; else out.push(p);
    break;
  }
  return out;
}
