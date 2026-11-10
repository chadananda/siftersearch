// "Give me the book" (Chad 11-01: "no matter what book people ask for, Anís never gives it"): a request to read, locate or
// link a WORK is answered with the library's own copy, linked — found by the librarian's fuzzy title index (dewey/title-index.js:
// "Dawnbreakers" ≡ The Dawn-Breakers, "Book of Certitude" ≡ the Kitáb-i-Íqán's subtitle). No search, no model. Before this,
// such turns went to passage search and the reply quoted works that MENTION the book and sent readers to "a digital catalog".
// Pure: workRequest / titleCandidates / workReply. findWork takes the index + listDocs injected (tests) or loads them lazily.
import { readFileSync } from 'fs';
import { workUrl } from '../source-links.js';
import { isCoreLiterature } from '../rights/canonical.js';
import { getAuthority, doctrinalTier } from '../authority.js';

// a work is core literature by the same rule as a passage (rights/canonical.js isCoreLiterature), its author being the book's
export const coreWork = (doc) => { let a = doc.book_authority; if (a == null) { try { a = getAuthority(doc); } catch { a = null; } }
  return isCoreLiterature({ ...doc, book_authority: a }); };

// the turn asks for the book itself: to read it, find it, get a copy, a link, or whether the library holds it
const ASKS = /\b(?:locate|where (?:can|could|do|might|would|should) (?:i|we|one|you) (?:read|find|get|access|see|look)|where(?:'s| is) (?:the (?:book|text)|a copy)|(?:full|complete|whole|entire) text|a copy of|(?:want|like|love|wish|hope) to read|read (?:it|the book|the full)|link(?: me)? to|do you (?:have|hold|carry)|have you got|show me (?:where|the book)|(?:open|download|access) (?:the|a|it)|in (?:the|your) library)\b/i;
// … unless it asks what the book SAYS (a passage, a quotation, a teaching in it) — that is a search
const CONTENT = /\b(?:says?|said|saying|teach(?:es|ing)?|mean(?:s|ing)?|explain(?:s|ed)?) (?:about|on|that)\b|\bwhat does\b|\b(?:quote|quotation|passage|verse|paragraph|chapter|the part|the line|the bit|the words)\b/i;
const TAIL = /\s+(?:and|that|which|so|because|since|when|where|while|if|in (?:the|your|this) library|on (?:the|your) (?:site|website)|online|please|pls|for me|myself|now|again|here|there|today|with me|by (?:the|its) author)\b.*$/i;
const TAIL_KEEP_AND = new RegExp(TAIL.source.replace('(?:and|', '(?:'), 'i');
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
  // each phrase twice: whole ("Prayers and Meditations") and cut at "and …" ("Seven Valleys and learn about it")
  const add = (s) => {
    for (const tail of [TAIL_KEEP_AND, TAIL]) {
      let c = String(s || '').replace(/^["“‘'*_]+|["”’'*_.,;:!?]+$/g, '').trim();
      for (let i = 0; i < 3; i++) c = c.replace(LEAD, '').replace(tail, '').trim();
      c = c.replace(/^(?:a|an)\s+/i, '');
      if (c && !PRONOUN.test(c) && c.split(' ').length <= 10 && /\p{L}{4,}/u.test(c)) out.push(c);
    }
  };
  for (const m of t.matchAll(/["“*_]([^"”*_]{3,80})["”*_]/g)) add(m[1]);   // a quoted or emphasised title
  for (const m of t.matchAll(/\b(?:book|work|text|volume|title)\s+(?:called|titled|named|entitled)\s+([^.?!,;]+)/gi)) add(m[1]);
  for (const m of t.matchAll(/\b(?:text|copy|edition)\s+of\s+([^.?!,;]+)/gi)) add(m[1]);
  for (const m of t.matchAll(/\b(?:read|locate|find|get|access|open|download|have|hold|carry|link(?: me)? to|show me|search(?:ing)? for|look(?:ing)? for|seek(?:ing)?)\s+([^.?!,;]+)/gi)) add(m[1]);
  if (named?.type === 'work' && named.name) add(named.name);
  return [...new Set(out)];
}

// not the work itself: a recorded talk (Media), a tag page, a page-range or part fragment
const notBook = (d) => /^media$/i.test(d.collection || '') || /^tag:/i.test(d.title || '') || /\b(?:part|pages?)\s*\d/i.test(d.title || '');
// a work ABOUT the book (unless that is what was asked for)
const DERIVED = /\b(?:study guide|guide|notes|interview|commentary|reflections?|meditation|principles|class|lecture|talks?|review|outline|questions|introduction|tag)\b/i;
const AUTHORS = /bah[aá].?u.?ll[aá]h|abdu.?l.?bah[aá]|\bthe b[aá]b\b|shoghi effendi/i;
// the fullest text by its own author: size first (an excerpt is not the book), the canonical author, the canonical site, English
const workRank = (d, asked, by = null) => Math.log10((d.paragraph_count || 0) + 1) + (AUTHORS.test(d.author || '') ? 1 : 0)
  // the byline the reader gave ("the Research Department's Deepening"): the compiler / author named outranks size (11-10)
  + (bylineHit(d.author, by) ? 3 : 0)
  // the canonical reader and the reader's language outweigh size (11-09: "The Hidden Words" opened the Persian edition on oceanoflights)
  + (d.source_site === 'oceanlibrary.com' ? 1.5 : 0) + (/^en/i.test(d.language || 'en') ? 1 : 0)
  - (derived(d.title, asked) ? 2 : 0)
  // the work itself — its tradition's scripture/primary text — outranks a study whose title merely contains the name (11-09: "Gita" → Gita and Gospel)
  + (d.religion && doctrinalTier(d) === 'core' ? 3 : 0);
// the byline names the book's author: folded and unspaced ("baha u llah" = Bahá’u’lláh), else authorMatch's surname test
const byAuthor = (by, author, am) => foldTitle(by).replace(/ /g, '') === foldTitle(author).replace(/ /g, '') || !!am?.(by, author);
const derived = (title, asked) => { const w = DERIVED.exec(title || '')?.[0]; return !!w && !new RegExp(`\\b${w}\\b`, 'i').test(asked); };

// the reader's byline names this book's author/compiler: folded, either contains the other ("Research Department" ⊂ "Universal House of Justice, Research Department")
const bylineHit = (author, by) => { const a = foldTitle(author), b = foldTitle(by); return !!a && b.length >= 3 && (a.includes(b) || b.includes(a)); };
const foldTitle = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');

const lib = async () => Promise.all([import('../dewey/title-index.js'), import('../docs-repo.js')]);

/** The question → { doc, others } — the library's best copy of the work asked for — or null. */
/** coreOnly (respond.js, unless Jev's lookup intent is 'book'): a bare title opens only a CORE work (Chad 11-03: "the earth is but
 *  one country" opened Hugh Adamson's book of that name); an explicit request for a book still resolves every book. */
// the other names a work is known by (config/work-names.json: "Book of Certitude", "Lord of Books" → the Kitáb-i-Íqán): data, not rules
let NAMES = null;
const nameMap = (list) => new Map(list.flatMap((w) => w.names.map((n) => [foldTitle(n), w.title])));
const loadNames = () => { try { return JSON.parse(readFileSync(new URL('../../../config/work-names.json', import.meta.url), 'utf8')).works; } catch { return []; } };
export function workName(text, list = null) {
  const map = list ? nameMap(list) : (NAMES ??= nameMap(loadNames()));
  return map.get(foldTitle(String(text || '').replace(/[?.!]+$/, ''))) ?? null;
}

export async function findWork(text, { named = null, index = null, match = null, listDocs = null, coreOnly = false } = {}) {
  if (workRequest(text)) { const c = titleCandidates(text, named); return findTitled([...c, ...c.map((x) => workName(x)).filter(Boolean)], { index, match, listDocs }); }
  // a bare title IS a request for the book (Chad 11-01: "Dawnbreakers" and "Seven Valleys" got unsourced summaries, no link):
  // only the book's WHOLE title ("Dawnbreakers" = The Dawn-Breakers), or a phrase of 2+ words naming a work by a Central
  // Figure or Shoghi Effendi ("Book of Certitude"): "Justice", "Love", "world peace" stay topic searches (checked against
  // tower's index: they match "Justice: The Best Beloved…", "On Love", "World Peace: Warwick Leaflets")
  const bare = bareTitle(text);
  if (!bare) return null;
  const { authorMatch: am } = await import('../dewey/title-index.js');
  // a listed name opens its book (core or not: the list is the curation)
  const known = workName(bare);
  if (known) { const k = await findTitled([known], { index, match, listDocs, min: 0.95, prefix: true, byline: true, authorMatch: am }); if ((k?.doc.paragraph_count || 0) >= 20) return k; }
  const w = await findTitled([bare], { index, match, listDocs, min: 0.95, prefix: false, byline: true, authorMatch: am });
  const sq = (t) => foldTitle(t).replace(/ /g, '');
  // the whole title, or one whole part of it: "The Book of Certitude (Kitáb-i-Íqán)" is named by either half
  const unby = (t) => { const f = foldTitle(t), i = f.lastIndexOf(' of '); return i > 0 && byAuthor(f.slice(i + 4), w?.doc.author || '', am) ? f.slice(0, i) : null; };
  const parts = (t) => [t, unby(t), ...String(t || '').split(/\s*[:()\[\]—]\s*/)].map((x) => String(x || '').trim()).filter(Boolean);
  const hitPart = w && parts(w.doc.title).find((p) => sq(p) === sq(bare));
  const whole = !!hitPart && (bare.includes(' ') || bare.includes('-') || foldTitle(w.doc.title).includes(' '));
  // and a BOOK: a word that happens to title a leaflet or a one-paragraph tablet ("True Seeker", "Spiritual Assemblies") is a topic
  const central = AUTHORS.test(w?.doc.author || '');
  const book = (w?.doc.paragraph_count || 0) >= (central ? 20 : 150);
  return w && book && (whole || (bare.trim().includes(' ') && central)) && (!coreOnly || coreWork(w.doc)) ? w : null;
}

/** The question is nothing but a title ("Seven Valleys", "The Dawnbreakers?") → that title, else null. Pure. */
export function bareTitle(text) {
  const t = String(text || '').trim().replace(/[?.!]+$/, '').replace(/^["“*_]+|["”*_]+$/g, '').trim();
  const w = t.split(/\s+/).filter(Boolean);
  if (!w.length || w.length > 6 || CONTENT.test(t)) return null;
  if (/^(?:who|what|why|how|when|where|which|whose|is|are|was|were|does|do|did|can|could|should|would|will|tell|explain|define|describe|list|give|show|compare|i|my|me|we|hi|hello|hey|thanks?|thank)\b/i.test(t)) return null;
  return t;
}

/** Title phrases → the library's books under those titles, best first: { sorted, books, asked } (sorted = listDocs rows by workRank).
 *  The ranked list without a pick — findTitled takes the first; the book fast path (book-pick.js) hands the top few to Jev.
 *  by = a byline the reader gave (author or compiler), ranked up; widen = also the titles a short name OPENS or ENDS
 *  ("Deepening" → "Deepening: …", "Gita" → "Bhagavad Gita") even when exact matches exist (a talk can carry the bare name). */
export async function rankTitled(cands, { index = null, match = null, listDocs = null, min = 0.86, prefix = true, byline = false, authorMatch = null, by = null, widen = false, limit = 40 } = {}) {
  if (!cands.length) return { sorted: [], books: false, asked: '' };
  if (!index || !match || !listDocs) {
    const [ti, docs] = await lib();
    index ??= await ti.titleIndex(); match ??= ti.matchTitle; listDocs ??= docs.listDocs; authorMatch ??= ti.authorMatch;
  }
  // every candidate against the index; the best title score wins (a word slip in one phrase costs nothing). A wide net: a talk
  // ON a book carries its title exactly ("Gleanings (part 14)", Hooper Dunbar), so dozens tie with the book at 1.0.
  const hits = new Map();
  for (const c of cands) for (const h of match(index, c, { min, limit: 60 })) if ((hits.get(h.doc.id)?.score ?? 0) < h.score) hits.set(h.doc.id, h);
  // the BOOK, not a talk about it, a tag page or a page-range fragment (11-01 live: "Gleanings" and "Seven Valleys" linked
  // Hooper Dunbar talks, "Find Seven Valleys … the complete text" got "the library does not contain the full writing")
  // a title that adds only its author's byline IS that title ("The Hidden Words" = The Hidden Words of Bahá’u’lláh): it joins the
  // exact matches at their score, so the canonical copy competes on rank instead of losing to a byline-less duplicate (11-09)
  if (byline && index.docs && authorMatch) {
    const top = Math.max(min, ...[...hits.values()].map((h) => h.score));
    for (const c of cands) {
      const q = foldTitle(c);
      if (q.length >= 4) for (const d of index.docs) {
        const t = foldTitle(d.title);
        if (t.startsWith(`${q} of `) && byAuthor(t.slice(q.length + 4), d.author || '', authorMatch) && !hits.has(d.id)) hits.set(d.id, { doc: d, score: top });
      }
    }
  }
  const all = [...hits.values()];
  let books = all.filter((h) => !notBook(h.doc));
  // a short title that OPENS the book's ("Gleanings" → Gleanings from the Writings of Bahá'u'lláh): the title matcher scores a
  // one-word query 0 against a longer title (right for the librarian's duplicate checks), so when no book matched, look for one
  if ((!books.length || widen) && prefix && index.docs) {
    const qs = cands.map(foldTitle).filter((q) => q.length >= 4);
    const top = Math.max(min, ...books.map((h) => h.score));
    // the reader's byline first, then the title closest to the name (fewest extra words), before the window is cut
    const opened = index.docs.filter((d) => !notBook(d) && !hits.has(d.id) && qs.some((q) => foldTitle(d.title).startsWith(`${q} `) || foldTitle(d.title).endsWith(` ${q}`)))
      .sort((a, b) => Number(bylineHit(b.author, by)) - Number(bylineHit(a.author, by)) || foldTitle(a.title).length - foldTitle(b.title).length)
      .slice(0, 200).map((doc) => ({ doc, score: widen ? top : min }));
    books = [...books, ...opened];
  }
  const pool = books.length ? books : all;
  if (!pool.length) return { sorted: [], books: false, asked: '' };
  const top = Math.max(...pool.map((h) => h.score));
  const ids = pool.filter((h) => h.score >= top - 0.06).sort((a, b) => b.score - a.score || Number(bylineHit(b.doc.author, by)) - Number(bylineHit(a.doc.author, by))).map((h) => h.doc.id).slice(0, limit);
  const { docs } = await listDocs({ ids, fields: ['id', 'title', 'author', 'religion', 'collection', 'slug', 'language', 'source_site', 'paragraph_count', 'encumbered', 'source_url', 'external_id', 'description', 'cover_url', 'year'], limit, count: false });
  const asked = cands.join(' ');
  const sorted = docs.filter((d) => (d.paragraph_count ?? 1) > 0 && (books.length ? !notBook(d) : true))
    .sort((a, b) => workRank(b, asked, by) - workRank(a, asked, by) || (b.paragraph_count || 0) - (a.paragraph_count || 0));
  return { sorted, books: books.length > 0, asked };
}

/** Title phrases → { doc, others } (the researcher's find_work calls this with the title it chose), or null. */
export async function findTitled(cands, opts = {}) {
  const { sorted, asked } = await rankTitled(cands, opts);
  if (!sorted.length) return null;
  return { doc: sorted[0], others: otherCopies(sorted, asked) };
}
/** Other copies worth offering beside the first. Pure. */
export function otherCopies(sorted, asked) {
  const seen = new Set([sorted[0].title]);
  // other copies worth offering: not a foreword / introduction stub split off a book (11-01 live: GPB's "also holds" listed two)
  const stub = (d) => /\b(?:foreword|introduction|preface|afterword|glossary|notes|index|bibliography)\b/i.test(d.title) || (d.paragraph_count ?? 99) < 20;
  // …and not a work ABOUT the book ("God Passes By: Outline and cross-reference of chapters")
  return sorted.slice(1).filter((d) => !stub(d) && !derived(d.title, asked) && !seen.has(d.title) && seen.add(d.title)).slice(0, 2);
}

const NO_AUTHOR = /^(?:unknown|anonymous|n\/?a|none|various|-+|\?+)$/i;
/** The reply's first lines: the work, linked (and other copies). Pure. */
export function workLead({ doc, others = [] }, urlOf = workUrl) {
  // the title link is the read link — no second link to the same page (battery 11-10 "hindus"); an author the library
  // does not know ("Unknown", "Anonymous") is not a byline
  const url = urlOf(doc), by = doc.author && !NO_AUTHOR.test(String(doc.author).trim()) ? ` by ${doc.author}` : '';
  const ln = (d, t = `*${d.title}*`) => (urlOf(d) ? `[${t}](${urlOf(d)})` : t);   // the online publisher when there is one, else our library reader (workUrl's fallback)
  const lines = [doc.encumbered === 1
    ? `${ln(doc)}${by} is in the library. It is still under copyright, so only the opening pages are open to read${url ? ' at that link' : ''}.`
    : `${ln(doc)}${by} is here in the library${url ? ', the full text at that link' : ''}.`];
  if (others.length) lines.push(`The library also holds ${others.map((o) => ln(o)).join(' and ')}.`);
  return lines.join('\n\n').replace(/\.\./g, '.');
}
/** The closing offer to read it together (never for a copyrighted book). Pure. */
export const workOffer = ({ doc }) => (doc.encumbered === 1 ? ''
  : `If you like, I can read it with you a page at a time, with notes on the people, places and words it mentions — just say “read ${doc.title} with me”.`);
/** The whole reply when nothing ABOUT the book was found: the link and the offer. Pure. */
export const workReply = (w, urlOf) => [workLead(w, urlOf), workOffer(w)].filter(Boolean).join('\n\n');

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
export const WORK_HOW = ({ doc }) => `The reader asked for the book *${doc.title}*. The link to it and the offer to read it together are ADDED BY CODE above and below your text — do not repeat the link, do not offer to read, no greeting, no sign-off. Write 2–4 sentences on the book's importance and role — what it is, why it matters, how it is regarded — ONLY from what the passages given say ABOUT it (Chad 11-01: "I do not want non-sourced answers"). Nothing from memory: no date, original title, translator, place or description that no passage states. Every sentence carries a passage's exact words as its link: ["exact words"](link). Name a source only as its writer and work ("Shoghi Effendi writes in *God Passes By* that …") — never put a work's title where the sentence needs a word. Never present a passage as a quotation FROM the book itself, and never say where the book begins. If the passages say little, write one sentence.`;

// Every book a reply names in italics is a link to the library's copy (Chad 11-01: "Why not just have a policy to always link
// the name of a book to the book in the library" — "The Seven Valleys" was italicised and linked nowhere). First mention only;
// italics already inside a link, and titles whose copy the reply already links, are left alone. No match → left as written.
const ITALIC = /(?<![*\w])\*(?!\*)([^*\n]{3,90}?)\*(?![*\w])/g;
export async function linkTitles(text, { find = (t, min) => findTitled([t], { min }), links = async (docs) => (await import('../hit-links.js')).workLinks(docs) } = {}) {
  const s = String(text || '');
  const inLink = [...s.matchAll(/\[[^\]\n]*\]\([^)\s]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  const seen = new Set();
  const hits = [...s.matchAll(ITALIC)].filter((m) => !inLink.some(([a, b]) => m.index >= a && m.index < b) && /\p{Lu}/u.test(m[1])
    && !seen.has(m[1].toLowerCase()) && seen.add(m[1].toLowerCase())).slice(0, 8);
  const found = await Promise.all(hits.map((m) => find(m[1], m[1].trim().includes(' ') ? 0.9 : 0.95).catch(() => null)));
  // the online publisher beats our own page: resolve link meta for the found works (a listDocs row has none)
  const urls = await links(found.map((f) => f?.doc).filter(Boolean)).catch(() => null);
  let out = s, shift = 0, linked = 0;
  hits.forEach((m, i) => {
    const url = found[i]?.doc && (urls?.get(found[i].doc.id) ?? workUrl(found[i].doc));
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
