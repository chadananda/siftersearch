// REPLY FORM checks (Chad 11-14, Reddit round 3): what the reply LOOKS like, never what the question means (no intent by words; md-valid.js is the
// precedent). Offers out of the prose and into the pills; bold run-in section heads only when the agent itself chose depth (its marker);
// a pilgrim note / talk / commentary never quoted ahead of a written core passage the same reply quotes. Pure. Deps: lint, source-tier.
import { isSearchOffer, isOffer } from './lint.js';
import { sourceTier, isWrittenCore } from './source-tier.js';

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
export const isOfferSentence = (s) => isSearchOffer(s) || isOffer(s) || isInvite(s);

const sentences = (line) => line.match(/[^.!?]+(?:[.!?]+["”’)*_]*|$)\s*/g) || [line];

/** → { text, offers }: every offer or invitation sentence in the prose goes (a following "Just ask." with it); blockquotes, tables,
 *  lists, headings and templates are never touched, and the reply is never emptied (allowEmpty: a streamed piece that is only an offer goes). `offers` are the removed sentences, for the pills. */
export function dropOffers(text, { allowEmpty = false } = {}) {
  const src = String(text || ''), offers = [];
  const out = src.split('\n').map((line) => {
    if (!line.trim() || STRUCTURED.test(line) || /^\s*#/.test(line)) return line;
    const ss = sentences(line), kept = [];
    for (let i = 0; i < ss.length; i++) {
      if (isOfferSentence(ss[i])) { offers.push(ss[i].trim()); if (ss[i + 1] && NUDGE.test(ss[i + 1])) i++; continue; }
      kept.push(ss[i]);
    }
    return kept.length === ss.length ? line : kept.join('').trimEnd();
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
export const headsAsk = (heads) => `(note from the library, not the reader) Your reply is set out under section heads (${heads.slice(0, 4).map((h) => `"${h.slice(0, 40)}"`).join(', ')}). Unless the reader asked for depth or research, answer as a few short plain paragraphs: no bold run-in heads, no headings — same substance, same quotations and refs, said directly. If the reader DID ask for depth or research, keep the sections and start the reply with ${DEPTH}. Write the whole reply again.`;

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

const BELOW_CORE = new Set(['reported', 'house', 'secondary']);
/** → { first, core } when the first quoted passage is a talk / pilgrim note, a House letter or commentary while a written core passage
 *  (the Writings, Shoghi Effendi) is quoted later in the same reply; else null. `found`: Map ref → passage. Order only — never what is quoted. */
export function leadSource(text, found) {
  const get = (r) => found?.get?.(r);
  const refs = quotedRefs(text).filter((r) => get(r));
  if (refs.length < 2 || !BELOW_CORE.has(sourceTier(get(refs[0])))) return null;
  const core = refs.slice(1).find((r) => isWrittenCore(get(r)));
  return core ? { first: refs[0], core, firstTier: sourceTier(get(refs[0])) } : null;
}
const KIND = { reported: 'a talk or pilgrim’s recollection', house: 'a letter of the House of Justice', secondary: 'commentary' };
export const leadAsk = ({ first, core, firstTier }) => `(note from the library, not the reader) Your first quotation, ${first}, is ${KIND[firstTier] || 'not a written core text'}, and you also quote ${core}, a written core text (the Writings or Shoghi Effendi). The core text leads: write the reply again with ${core} quoted first; keep ${first} after it only if it adds something, named for what it is.`;

// ---- the offer becomes a pill ----
const STOP = new Set('about also could deeper further more into like would what which their there these those this that with from have your just tell some show share explain look further other bahá bahai faith writings teachings'.split(' '));
const words = (s) => (String(s || '').toLowerCase().match(/\p{L}{4,}/gu) || []).filter((w) => !STOP.has(w));
const OFFER_HEAD = /^.*?\b(?:I (?:can|could)(?: also)?|I(?:['’]d| would) be (?:glad|happy) to|I(?:['’]m| am) happy to|would you like me to|shall I|should I|want me to|(?:if )?you(?:['’]re| are) (?:welcome|free|invited) to ask(?: me)?|feel free to ask(?: me)?|ask me)\s+(?:go (?:deeper|further)\s+(?:into|on|in)|say more (?:about|on)|look (?:at|into)|walk you through|show you|share|explain|explore|trace|unpack|read|open|about)?\s*/i;
/** "I can go deeper into how the Writings frame chastity, or …" → "Tell me more about how the Writings frame chastity" (≤ 90 chars), or null. */
export function offerPill(offer) {
  const s = String(offer || '').trim();
  if (!OFFER_HEAD.test(s)) return null;
  const topic = s.replace(OFFER_HEAD, '').split(/,\s*(?:or|and)\s|\s+(?:if|should|whenever|when) you\b|\s+—\s|[.!?;]/)[0].replace(/[\s,:]+$/, '').trim();
  if (words(topic).length < 1) return null;
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
