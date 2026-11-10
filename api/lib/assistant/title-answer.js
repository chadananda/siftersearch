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
import { bareTitle, findWork, findTitled, workLead, workOffer } from './work-request.js';
import { modelFor } from '../model-roles.js';
import { workUrl, SITE } from '../source-links.js';

const DEFAULT = join(dirname(fileURLToPath(import.meta.url)), '../../../data/run/work-summaries.json');
const FILE = () => process.env.ANIS_WORK_SUMMARIES || DEFAULT;   // tests point it at a temp file
let cache = null;
const load = () => { if (!cache) { try { cache = new Map(Object.entries(JSON.parse(readFileSync(FILE(), 'utf8')))); } catch { cache = new Map(); } } return cache; };
const save = () => { try { mkdirSync(dirname(FILE()), { recursive: true }); const tmp = `${FILE()}.${process.pid}`; writeFileSync(tmp, JSON.stringify(Object.fromEntries(load()))); renameSync(tmp, FILE()); } catch { /* the cache is a convenience */ } };

// warm the title index a few seconds after a chat process starts (off the boot path), so the FIRST bare title is as instant as the rest
if (!process.env.VITEST) setTimeout(() => import('../dewey/title-index.js').then((m) => m.titleIndex()).catch(() => {}), 8000).unref?.();

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

/** The message is only a book's title → { work } (resolved in code), else null. Cheap for anything that is not a short bare title. */
// core works only (Chad 11-03: "the earth is but one country" is a quotation, not Hugh Adamson's book); other titles go through Jev's book route
export async function titleOnly(text, { find = findWork } = {}) {
  if (!bareTitle(text)) return null;
  const work = await find(text, { coreOnly: true }).catch(() => null);
  return work?.doc ? work : null;
}

/** Stream the answer: the summary, then the book (a `book` card event + its linked lead line), then the offer. → { reply, citations, book } */
export async function titleAnswer(work, { onEvent = () => {}, links = null, summary = workSummary } = {}) {
  const all = [work.doc, ...(work.others || [])], d = work.doc;
  const [wl, sum] = await Promise.all([(links || (async (xs) => (await import('../hit-links.js')).workLinks(xs)))(all).catch(() => null), summary(d).catch(() => null)]);
  const urlOf = (x) => wl?.get?.(x.id) ?? workUrl(x);
  // cover_url absolute: widgets embed anywhere, and images live on the site, never the api host.
  const book = { id: d.id, title: d.title, author: d.author || null, year: d.year ?? null, url: urlOf(d) || null, cover_url: d.cover_url ? (/^https?:/.test(d.cover_url) ? d.cover_url : `${SITE}${d.cover_url}`) : null, description: sum || null, encumbered: d.encumbered === 1 };
  onEvent({ type: 'book', book });
  const lead = workLead(work, urlOf), offer = workOffer(work);
  const reply = [sum, lead, offer].filter(Boolean).join('\n\n');
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
