// A message that is ONLY a library book's title ("“God Passes By”") → that book at once: the link, a short summary, the offer.
// No Jev, no search, no writer (Chad 11-09: "12s is unacceptable … the user is stating the name of the book without any extra bits").
// Code only RESOLVES: the whole message must equal a book's title in the title index (work-request.js findWork, whole-title rule).
// The summary is written ONCE per book from its own opening pages (Haiku, role anis-work-summary) and cached in data/run.
// Deps: work-request (bareTitle, findWork, workLead, workOffer), hit-links workLinks, paragraphs-repo paragraphsInRange, ai chatCompletion.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareTitle, findWork, workLead, workOffer } from './work-request.js';
import { modelFor } from '../model-roles.js';
import { workUrl } from '../source-links.js';

const DEFAULT = join(dirname(fileURLToPath(import.meta.url)), '../../../data/run/work-summaries.json');
const FILE = () => process.env.ANIS_WORK_SUMMARIES || DEFAULT;   // tests point it at a temp file
let cache = null;
const load = () => { if (!cache) { try { cache = new Map(Object.entries(JSON.parse(readFileSync(FILE(), 'utf8')))); } catch { cache = new Map(); } } return cache; };
const save = () => { try { mkdirSync(dirname(FILE()), { recursive: true }); const tmp = `${FILE()}.${process.pid}`; writeFileSync(tmp, JSON.stringify(Object.fromEntries(load()))); renameSync(tmp, FILE()); } catch { /* the cache is a convenience */ } };

const PROMPT = (doc, opening) => `Write a short summary of the book "${doc.title}"${doc.author ? ` by ${doc.author}` : ''} for a reader who has just asked for it by name.
2 to 4 sentences, at most 90 words, plain prose: what the work is, who wrote it and when if known, what it covers, and why readers turn to it.
Use the opening pages below and only well-established facts about this work; never guess, never quote, no preamble, no heading.
Opening pages:
${opening}`;

/** The book's summary: cached, else written once from its opening pages. → text or null (no summary = link + offer only). */
export async function workSummary(doc, { read = null, complete = null } = {}) {
  const key = String(doc.id), hit = load().get(key);
  if (hit) return hit;
  const rows = await (read || (async (id) => (await import('../paragraphs-repo.js')).paragraphsInRange(id, 0, 60, { limit: 60 })))(doc.id).catch(() => []);
  let opening = '';
  for (const r of rows || []) { if (opening.length > 6000) break; const t = String(r.text || '').trim(); if (t) opening += `${t}\n`; }
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

/** Stream the answer: the linked book first (instant), then its summary, then the offer. → { reply, citations } */
export async function titleAnswer(work, { onEvent = () => {}, links = null, summary = workSummary } = {}) {
  const all = [work.doc, ...(work.others || [])];
  const wl = await (links || (async (xs) => (await import('../hit-links.js')).workLinks(xs)))(all).catch(() => null);
  const urlOf = (x) => wl?.get?.(x.id) ?? workUrl(x);
  const lead = workLead(work, urlOf);
  onEvent({ type: 'text', content: lead });
  const sum = await summary(work.doc).catch(() => null);
  if (sum) onEvent({ type: 'text', content: `\n\n${sum}` });
  const offer = workOffer(work);
  if (offer) onEvent({ type: 'text', content: `\n\n${offer}` });
  const reply = [lead, sum, offer].filter(Boolean).join('\n\n');
  const citations = all.map((x) => ({ title: x.title, author: x.author, url: urlOf(x) ?? null, religion: x.religion, document_id: x.id, paragraph_index: null, text: '' }));
  return { reply, citations };
}
