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
export async function findTitled(cands, { index = null, match = null, listDocs = null } = {}) {
  if (!cands.length) return null;
  if (!index || !match || !listDocs) {
    const [ti, docs] = await lib();
    index ??= await ti.titleIndex(); match ??= ti.matchTitle; listDocs ??= docs.listDocs;
  }
  // every candidate against the index; the best title score wins (a word slip in one phrase costs nothing)
  const hits = new Map();
  for (const c of cands) for (const h of match(index, c, { min: 0.86, limit: 8 })) if ((hits.get(h.doc.id)?.score ?? 0) < h.score) hits.set(h.doc.id, h);
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

/** The reply: the work, linked, and the offer to read it together. Pure. */
export function workReply({ doc, others = [] }) {
  const url = readerUrl(doc);
  const by = doc.author ? ` by ${doc.author}` : '';
  const lines = [doc.encumbered === 1
    ? `[*${doc.title}*](${url})${by} is in the library. It is still under copyright, so the opening pages are open to read here: [read the opening of *${doc.title}*](${url}).`
    : `[*${doc.title}*](${url})${by} is here in the library, the full text: [read *${doc.title}*](${url}).`];
  if (others.length) lines.push(`The library also holds ${others.map((o) => `[*${o.title}*](${readerUrl(o)})`).join(' and ')}.`);
  if (doc.encumbered !== 1) lines.push(`If you like, I can read it with you a page at a time, with notes on the people, places and words it mentions — just say “read ${doc.title} with me”.`);
  return lines.join('\n\n');
}
