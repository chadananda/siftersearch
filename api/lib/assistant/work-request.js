// "Give me the book" (Chad 11-01: "no matter what book people ask for, Anís never gives it"): a request to read, locate or
// link a WORK is answered with the library's own copy, linked — found by the librarian's fuzzy title index (dewey/title-index.js:
// "Dawnbreakers" ≡ The Dawn-Breakers, "Book of Certitude" ≡ the Kitáb-i-Íqán's subtitle). No search, no model. Before this,
// such turns went to passage search and the reply quoted works that MENTION the book and sent readers to "a digital catalog".
// Pure: workRequest / titleCandidates / workReply. findWork takes the index + listDocs injected (tests) or loads them lazily.
import { readerUrl } from '../source-links.js';

// the turn asks for the book itself: to read it, find it, get a copy, a link, or whether the library holds it
const ASKS = /\b(?:locate|where (?:can|could|do|might|would|should) (?:i|we|one|you) (?:read|find|get|access|see|look)|where(?:'s| is) (?:the (?:book|text)|a copy)|(?:full|complete|whole|entire) text|a copy of|(?:want|like|love|wish|hope) to read|read (?:it|the book|the full)|link(?: me)? to|do you (?:have|hold|carry)|have you got|show me (?:where|the book)|(?:open|download|access) (?:the|a|it)|in (?:the|your) library)\b/i;
// … unless it asks what the book SAYS (a passage, a quotation, a teaching in it) — that is a search
const CONTENT = /\b(?:says?|said|saying|teach(?:es|ing)?|mean(?:s|ing)?|explain(?:s|ed)?) (?:about|on|that)\b|\bwhat does\b|\b(?:quote|quotation|passage|verse|paragraph|chapter|the part|the line|the bit|the words)\b/i;
const TAIL = /\s+(?:and|that|which|so|because|since|when|where|while|if|in (?:the|your|this) library|on (?:the|your) (?:site|website)|online|please|pls|for me|myself|now|again|here|there|today|with me|by (?:the|its) author)\b.*$/i;
// "the full text of X", "a book called X" — but never "The Book of" (a title: The Book of Certitude)
const LEAD = /^(?:the\s+|a\s+)?(?:(?:(?:full|complete|whole|entire)\s+)?(?:text|copy|edition)\s+of|(?:book|work|text|volume)\s+(?:called|titled|named|entitled)|(?:book|work)(?=\s+(?!of\b)))\s+/i;
const PRONOUN = /^(?:it|this|that|them|these|those|one|some|something|anything|more|a book|the book|books?)$/i;

export function workRequest(text) {
  const t = String(text || '');
  return ASKS.test(t) && !CONTENT.test(t);
}

/** The phrases that may be the title asked for, most specific first. Pure. */
export function titleCandidates(text, named = null) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = [];
  const add = (s) => {
    let c = String(s || '').replace(/^["“‘'*_]+|["”’'*_.,;:!?]+$/g, '').trim();
    for (let i = 0; i < 3; i++) c = c.replace(LEAD, '').replace(TAIL, '').trim();
    c = c.replace(/^(?:a|an)\s+/i, '');
    if (c && !PRONOUN.test(c) && c.split(' ').length <= 10 && /\p{L}{4,}/u.test(c)) out.push(c);
  };
  for (const m of t.matchAll(/["“*_]([^"”*_]{3,80})["”*_]/g)) add(m[1]);   // a quoted or emphasised title
  for (const m of t.matchAll(/\b(?:book|work|text|volume|title)\s+(?:called|titled|named|entitled)\s+([^.?!,;]+)/gi)) add(m[1]);
  for (const m of t.matchAll(/\b(?:text|copy|edition)\s+of\s+([^.?!,;]+)/gi)) add(m[1]);
  for (const m of t.matchAll(/\b(?:read|locate|find|get|access|open|download|have|hold|carry|link(?: me)? to|show me|search(?:ing)? for|look(?:ing)? for|seek(?:ing)?)\s+([^.?!,;]+)/gi)) add(m[1]);
  if (named?.type === 'work' && named.name) add(named.name);
  return [...new Set(out)];
}

const lib = async () => Promise.all([import('../dewey/title-index.js'), import('../docs-repo.js')]);

/** The question → { doc, others } — the library's best copy of the work asked for — or null. */
export async function findWork(text, { named = null, index = null, match = null, listDocs = null } = {}) {
  if (!workRequest(text)) return null;
  return findTitled(titleCandidates(text, named), { index, match, listDocs });
}

/** Title phrases → { doc, others } (the researcher's find_work calls this with the title it chose), or null. */
export async function findTitled(cands, { index = null, match = null, listDocs = null, min = 0.86 } = {}) {
  if (!cands.length) return null;
  if (!index || !match || !listDocs) {
    const [ti, docs] = await lib();
    index ??= await ti.titleIndex(); match ??= ti.matchTitle; listDocs ??= docs.listDocs;
  }
  // every candidate against the index; the best title score wins (a word slip in one phrase costs nothing)
  const hits = new Map();
  for (const c of cands) for (const h of match(index, c, { min, limit: 8 })) if ((hits.get(h.doc.id)?.score ?? 0) < h.score) hits.set(h.doc.id, h);
  if (!hits.size) return null;
  const top = Math.max(...[...hits.values()].map((h) => h.score));
  const ids = [...hits.values()].filter((h) => h.score >= top - 0.03).map((h) => h.doc.id).slice(0, 12);
  const { docs } = await listDocs({ ids, fields: ['id', 'title', 'author', 'religion', 'collection', 'slug', 'language', 'source_site', 'paragraph_count', 'encumbered'], limit: 12, count: false });
  // the canonical OceanLibrary copy, then English, then the fullest
  const rank = (d) => (d.source_site === 'oceanlibrary.com' ? 4 : 0) + (/^en/i.test(d.language || 'en') ? 2 : 0) + Math.min(1, (d.paragraph_count || 0) / 1000);
  const sorted = docs.filter((d) => (d.paragraph_count ?? 1) > 0).sort((a, b) => rank(b) - rank(a) || (b.paragraph_count || 0) - (a.paragraph_count || 0));
  if (!sorted.length) return null;
  const seen = new Set([sorted[0].title]);
  const others = sorted.slice(1).filter((d) => !seen.has(d.title) && seen.add(d.title)).slice(0, 2);
  return { doc: sorted[0], others };
}

/** The reply's first lines: the work, linked (and other copies). Pure. */
export function workLead({ doc, others = [] }) {
  const url = readerUrl(doc);
  const by = doc.author ? ` by ${doc.author}` : '';
  const lines = [doc.encumbered === 1
    ? `[*${doc.title}*](${url})${by} is in the library. It is still under copyright, so the opening pages are open to read here: [read the opening of *${doc.title}*](${url}).`
    : `[*${doc.title}*](${url})${by} is here in the library, the full text: [read *${doc.title}*](${url}).`];
  if (others.length) lines.push(`The library also holds ${others.map((o) => `[*${o.title}*](${readerUrl(o)})`).join(' and ')}.`);
  return lines.join('\n\n');
}
/** The closing offer to read it together (never for a copyrighted book). Pure. */
export const workOffer = ({ doc }) => (doc.encumbered === 1 ? ''
  : `If you like, I can read it with you a page at a time, with notes on the people, places and words it mentions — just say “read ${doc.title} with me”.`);
/** The whole reply when nothing ABOUT the book was found: the link and the offer. Pure. */
export const workReply = (w) => [workLead(w), workOffer(w)].filter(Boolean).join('\n\n');

/** What to search for passages ABOUT the work (its importance and role, Chad 11-01: "very thin … juicy bits"). Pure. */
export const workAboutQuery = ({ doc }) => `the importance and station of ${mainTitle(doc.title)}${doc.author ? ` by ${doc.author}` : ''}`;
const mainTitle = (t) => String(t || '').split(/\s*:\s*/)[0].replace(/^the\s+/i, '');
const foldT = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘'ʼ`-]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Passages that speak OF the work: not its own paragraphs (they are the book, not about it — 11-01 a reply called a late
 *  line "the opening words"), and naming it by its title or subtitle. Pure. */
export function aboutWork(work, rows) {
  const names = [...new Set(String(work.doc.title || '').split(/\s*:\s*/).map((x) => foldT(x.replace(/^the\s+/i, ''))).filter((x) => x.length >= 4))];
  const own = new Set([work.doc, ...work.others].map((x) => Number(x.id)));
  return rows.filter((q) => !own.has(Number(q.doc_id)) && names.some((n) => ` ${foldT(q.text)} `.includes(` ${n} `)));
}
/** The formatter's instructions for the middle of a work reply. */
export const WORK_HOW = ({ doc }) => `The reader asked for the book *${doc.title}*. The link to it and the offer to read it together are ADDED BY CODE above and below your text — do not repeat the link, do not offer to read, no greeting, no sign-off. Write 2–4 sentences on the book's importance and role — what it is, why it matters, how it is regarded — from what the passages say ABOUT it, weaving in their exact words with their links. Never present a passage as a quotation FROM the book itself, and never say where the book begins.`;

// Every book a reply names in italics is a link to the library's copy (Chad 11-01: "Why not just have a policy to always link
// the name of a book to the book in the library" — "The Seven Valleys" was italicised and linked nowhere). First mention only;
// italics already inside a link, and titles whose copy the reply already links, are left alone. No match → left as written.
const ITALIC = /(?<![*\w])\*(?!\*)([^*\n]{3,90}?)\*(?![*\w])/g;
export async function linkTitles(text, { find = (t, min) => findTitled([t], { min }) } = {}) {
  const s = String(text || '');
  const inLink = [...s.matchAll(/\[[^\]\n]*\]\([^)\s]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  const seen = new Set();
  const hits = [...s.matchAll(ITALIC)].filter((m) => !inLink.some(([a, b]) => m.index >= a && m.index < b) && /\p{Lu}/u.test(m[1])
    && !seen.has(m[1].toLowerCase()) && seen.add(m[1].toLowerCase())).slice(0, 8);
  const found = await Promise.all(hits.map((m) => find(m[1], m[1].trim().includes(' ') ? 0.9 : 0.95).catch(() => null)));
  let out = s, shift = 0, linked = 0;
  hits.forEach((m, i) => {
    const url = found[i]?.doc && readerUrl(found[i].doc);
    if (!url || s.includes(`](${url})`)) return;
    const link = `[${m[0]}](${url})`;
    out = out.slice(0, m.index + shift) + link + out.slice(m.index + shift + m[0].length);
    shift += link.length - m[0].length; linked++;
  });
  return { text: out, linked };
}

// The reply never opens by announcing itself or restating a question nobody asked (Chad 11-01: "To answer your question
// directly about what this work is:" after a bare title). The prompt forbids it; code removes what slips through.
const PREAMBLE = /(^|\n)[ \t]*(?:To answer your question(?: directly)?|To (?:respond to|address) your (?:question|query)|In answer to your question|Let me (?:explain|answer|begin|start)|Here is (?:what|an? (?:answer|overview|summary))|You asked (?:about|what))[^.:\n]{0,80}[:,.—–-]\s*/i;
export function dropPreamble(text) {
  const s = String(text || '');
  const m = s.match(PREAMBLE);
  if (!m) return s;
  const rest = s.slice(m.index + m[0].length);
  return s.slice(0, m.index) + m[1] + rest.charAt(0).toUpperCase() + rest.slice(1);
}
