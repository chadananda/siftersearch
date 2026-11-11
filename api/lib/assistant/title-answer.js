// A message that is ONLY a library book's title ("“God Passes By”") → that book at once: the link, a short summary, the offer.
// No Jev, no search, no writer (Chad 11-09: "12s is unacceptable … the user is stating the name of the book without any extra bits").
// Code only RESOLVES: the whole message must equal a book's title in the title index (work-request.js findWork, whole-title rule).
// The summary is the document's own description (docs.description, every document has one — Chad 11-09); only a document
// without one gets a summary written ONCE from its opening pages (Haiku, role anis-work-summary), cached in data/run.
// Order (Chad 11-09): the summary, then the book itself — a `book` event (cover, title, author, link) the chat renders as a card.
// Deps: work-request (bareTitle, findWork, workLead, workOffer), hit-links workLinks, paragraphs-repo paragraphsInRange, ai chatCompletion.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareTitle, findWork, findTitled, workLead } from './work-request.js';
import { modelFor } from '../model-roles.js';
import { workUrl, SITE } from '../source-links.js';

const DEFAULT = join(dirname(fileURLToPath(import.meta.url)), '../../../data/run/work-summaries.json');
const FILE = () => process.env.ANIS_WORK_SUMMARIES || DEFAULT;   // tests point it at a temp file
let cache = null;
const load = () => { if (!cache) { try { cache = new Map(Object.entries(JSON.parse(readFileSync(FILE(), 'utf8')))); } catch { cache = new Map(); } } return cache; };
const save = () => { try { mkdirSync(dirname(FILE()), { recursive: true }); const tmp = `${FILE()}.${process.pid}`; writeFileSync(tmp, JSON.stringify(Object.fromEntries(load()))); renameSync(tmp, FILE()); } catch { /* the cache is a convenience */ } };

// warm the title index a few seconds after a chat process starts (off the boot path), so the FIRST bare title is as instant as the rest
// …and the book finder's index beside it (works + sections; book-finder.js), built from the same rows
if (!process.env.VITEST) setTimeout(() => import('../dewey/title-index.js').then((m) => m.titleIndex()).then(() => import('./book-finder.js')).then((m) => m.warmBookFinder()).catch(() => {}), 8000).unref?.();

const PROMPT = (doc, opening) => `Write a short summary of the book "${doc.title}"${doc.author ? ` by ${doc.author}` : ''} for a reader who has just asked for it by name.
2 to 4 sentences, at most 90 words, plain prose: what the work is, who wrote it and when if known, what it covers, and why readers turn to it.
Use the opening pages below and only well-established facts about this work; never guess, never quote, no preamble, no heading.
Opening pages:
${opening}`;

/** The book's summary: cached, else written once from its opening pages. → text or null (no summary = link + offer only). */
export async function workSummary(doc, { read = null, complete = null } = {}) {
  const own = String(doc.description || '').trim();
  if (own) return own;
  const key = String(doc.id), hit = load().get(key);
  if (hit) return hit;
  const rows = await (read || (async (id) => (await import('../paragraphs-repo.js')).paragraphsInRange(id, 0, 60, { limit: 60 })))(doc.id).catch(() => []);
  let opening = '';
  for (const r of rows || []) { if (opening.length > 3000) break; const t = String(r.text || '').trim(); if (t) opening += `${t}\n`; }
  if (!opening) return null;
  const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-work-summary'), temperature: 0, maxTokens: 220, thinking: false, caller: 'anis-work-summary' }));
  const out = await call([{ role: 'user', content: PROMPT(doc, opening) }]).catch(() => null);
  const text = String(out?.content ?? out?.text ?? out ?? '').trim();
  if (!text || text.split(/\s+/).length > 160) return null;
  load().set(key, text); save();
  return text;
}

/** The summary the card can show NOW: the document's own description, else one already written. Never a model call. */
export function cachedSummary(doc) {
  const own = String(doc?.description || '').trim();
  return own || load().get(String(doc?.id)) || null;
}
/** No summary yet: write it AFTER the reply (Haiku, once), so the next reader's card has it. Never awaited on the reply path. */
export function summaryLater(doc, write = workSummary) {
  if (!doc?.id || cachedSummary(doc)) return null;
  return Promise.resolve().then(() => write(doc)).catch(() => null);
}

/** The message is only a book's title → { work } (resolved in code), else null. Cheap for anything that is not a short bare title. */
// core works only (Chad 11-03: "the earth is but one country" is a quotation, not Hugh Adamson's book); other titles go through Jev's book route
export const WORK_FOLLOW_UP = 'Is there something particular I can help you find in the book, or would you like to discuss it?';

export async function titleOnly(text, { find = findWork } = {}) {
  if (!bareTitle(text)) return null;
  const work = await find(text, { coreOnly: true }).catch(() => null);
  return work?.doc ? work : null;
}

/** The card's own fields (cover, year, rights) for a doc row that lacks them: the book fast path's rows come from the title index
 *  (id/title/author/collection), so its cards had no cover (11-11 "Why no book image?" — The Dhammapada, doc 20925, has one). One read by id. */
const CARD_FIELDS = ['id', 'cover_url', 'year', 'encumbered'];
export async function cardFields(doc, { read = async (id) => (await (await import('../docs-repo.js')).listDocs({ ids: [id], fields: CARD_FIELDS, count: false, limit: 1 })).docs?.[0] } = {}) {
  if (!doc?.id || 'cover_url' in doc) return doc;
  const row = await read(doc.id).catch(() => null);
  return row ? { ...doc, cover_url: row.cover_url ?? null, year: doc.year ?? row.year ?? null, encumbered: doc.encumbered ?? row.encumbered } : doc;
}
const absCover = (u) => (u ? (/^https?:/.test(u) ? u : `${SITE}${u}`) : null);

/** Stream the answer: the summary, then the book (a `book` card event + its linked lead line), then the offer. → { reply, citations, book } */
// The card is on the hot path (Chad 11-10: "the book card should be almost immediate"): only the description or the cached summary;
// a book with neither gets its summary written in the background (`later`), after the reply.
export async function titleAnswer(work, { onEvent = () => {}, links = null, summary = async (doc) => cachedSummary(doc), later = summaryLater, card = cardFields } = {}) {
  const all = [work.doc, ...(work.others || [])];
  const [wl, sum, d] = await Promise.all([(links || (async (xs) => (await import('../hit-links.js')).workLinks(xs)))(all).catch(() => null), summary(work.doc).catch(() => null), card(work.doc).catch(() => work.doc)]);
  if (!sum && later) later(d);
  const urlOf = (x) => wl?.get?.(x.id) ?? workUrl(x);
  // cover_url absolute: widgets embed anywhere, and images live on the site, never the api host.
  const book = { id: d.id, title: d.title, author: d.author || null, year: d.year ?? null, url: urlOf(d) || null, cover_url: absCover(d.cover_url), description: sum || null, encumbered: d.encumbered === 1, sufficient: true };   // the card IS the answer where a card can show (widget); text stays for history and other channels
  // A bare title asks nothing yet: the card answers, then ONE question invites the real request (Chad 11-10).
  book.follow_up = WORK_FOLLOW_UP;
  onEvent({ type: 'book', book });
  const lead = workLead(work, urlOf);
  const reply = [sum, lead, WORK_FOLLOW_UP].filter(Boolean).join('\n\n');
  onEvent({ type: 'text', content: reply });
  const citations = all.map((x) => ({ title: x.title, author: x.author, url: urlOf(x) ?? null, religion: x.religion, document_id: x.id, paragraph_index: null, text: '' }));
  return { reply, citations, book };
}

/** Jev named ONLY a work (strategy book, units.named_work alone) → the library's copy of it, or null. Code resolves the name Jev gave
 *  (any author: Jev already said it is a book; a short name opens the title it begins, "Gleanings" → Gleanings from the Writings…). */
export async function namedWork(name, { find = findTitled } = {}) {
  if (!name || String(name).length > 120) return null;
  const w = await find([String(name).trim()]);
  if (!w?.doc || (w.doc.paragraph_count ?? 0) < 20) return null;
  // other copies are the same work only: a short name also opened unrelated titles ("Gleanings" → Gleanings among the Sheaves)
  const f = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return { ...w, others: (w.others || []).filter((o) => f(o.title).includes(f(w.doc.title)) || f(w.doc.title).includes(f(o.title))) };
}

/** A SUB-DOCUMENT was asked for ("The Dispensation of Bahá’u’lláh", "Matthew"): its card — the section's title, the work it is part of,
 *  the link to where it starts. sec = { doc_id, book, author, title, start_index, end_index, paragraphs, first_para_id }; doc = its book's row.
 *  → { reply, citations, book }. No model: the section's own words are not summarised on the hot path. */
export async function sectionAnswer({ sec, doc = null }, { onEvent = () => {}, link = null, card = cardFields } = {}) {
  const bare = doc || { id: sec.doc_id, title: sec.book, author: sec.author };
  const [url0, parent] = await Promise.all([(link || sectionLink)(sec, bare).catch(() => null), card(bare).catch(() => bare)]);
  const url = url0 || workUrl(parent) || null;
  const by = parent.author || sec.author || null;
  const book = { id: parent.id ?? sec.doc_id, title: sec.title, author: by, year: parent.year ?? null, url, cover_url: absCover(parent.cover_url),
    description: null, encumbered: parent.encumbered === 1, sufficient: true, section: { title: sec.title, of: parent.title ?? sec.book, start_index: sec.start_index, end_index: sec.end_index, paragraphs: sec.paragraphs ?? null } };
  book.follow_up = WORK_FOLLOW_UP;
  onEvent({ type: 'book', book });
  const t = url ? `[*${sec.title}*](${url})` : `*${sec.title}*`;
  const lead = `${t} is in the library, part of *${parent.title ?? sec.book}*${by ? ` by ${by}` : ''}${sec.paragraphs ? ` (${sec.paragraphs} paragraphs)` : ''}.`;
  const reply = [lead, WORK_FOLLOW_UP].join('\n\n');
  onEvent({ type: 'text', content: reply });
  const citations = [{ title: parent.title ?? sec.book, author: by, url, religion: parent.religion ?? null, document_id: parent.id ?? sec.doc_id, paragraph_index: sec.start_index ?? null, text: '' }];
  return { reply, citations, book };
}

/** The link to where a section starts: its first paragraph by the citation policy (OceanLibrary range → … → our reader #p). Reads only. */
export async function sectionLink(sec, parent) {
  const [{ paragraphsInRange }, { withLinks }] = await Promise.all([import('../paragraphs-repo.js'), import('../hit-links.js')]);
  const [first] = await paragraphsInRange(sec.doc_id, sec.start_index, sec.start_index, { limit: 1 }).catch(() => []);
  const hit = { id: first?.id ?? sec.first_para_id, doc_id: sec.doc_id, paragraph_index: sec.start_index, text: first?.text ?? null, block_attrs: first?.block_attrs ?? null,
    external_para_id: first?.external_para_id ?? null, title: parent?.title ?? sec.book };
  const [linked] = await withLinks([hit]);
  return linked?.url ?? null;
}
