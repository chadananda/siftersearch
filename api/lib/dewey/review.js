// "Needs a person" → a way to comply (Chad 10-18: "a button to a popup that allows me to view the document and answer the
// question"). reviewOf(item) = the question Dewey is asking, what it knows, the text it has and the answers that fit;
// resolveItem(item, action) carries the answer out. An answer of "add it" sets identified.override — the guards that held
// the item (book fragment, possible twin, post-OCR recheck, OCR page limit) honour it. Deps: dewey-repo, ops queue.
import { readFile, stat } from 'fs/promises';
import { getItem, updateItem } from '../repos/dewey-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { libraryShelves } from './intake.js';
import { slpCancel } from './searchlayer.js';

const TEXT_PREVIEW = 2_000_000;   // the WHOLE text (10-19: "they all seem cut off" — the first 4,000 characters read as a cut-off)
const extOf = (p) => String(p || '').split('.').pop().toLowerCase();

/** The answers that fit this item. Pure. The recommended one (first) follows the question. */
export function answersFor(item) {
  const id = item.identified || {}, q = String(item.log?.at(-1)?.why || ''), pdf = extOf(item.original_path) === 'pdf';
  const rej = id.slp_rejected?.path ? id.slp_rejected : null, ocrQuestion = /over the \d+-page limit|full OCR failed/i.test(q) && pdf;
  const useOcr = rej && { action: 'use-ocr', label: 'The OCR text is good — use it', hint: 'imports the text shown below despite the failed check', fields: true };
  const retry = (rej || ocrQuestion) && pdf && { action: 'retry-ocr', label: /limit/i.test(q) ? 'Approve full OCR' : rej ? 'Run OCR again' : 'Try OCR again', hint: 'asks SearchLayerPDF for its current result for this scan' };
  // OCR that barely matched what we read ourselves (a handwritten letter at 2%) is not recommended: try again first
  const poor = rej && (rej.check?.sampleFound ?? 1) < 0.3;
  const out = poor ? [retry, useOcr] : [useOcr, retry];
  // "add it" for a scan with no accepted text would only send it back to OCR — there the OCR answers ARE the way to add it
  if (!rej && !ocrQuestion) out.push({ action: 'import', label: /same work|twin|already holds/i.test(q) ? 'Not the same — add it' : /part of a book/i.test(q) ? 'Add it as it is' : 'Add it', hint: 'imports it with the title, author and shelf below', fields: true });
  // THE ARCHIVE (Chad 10-19: "keep an archive of unsearchable documents that might have value later"): illegible handwriting,
  // a scan no OCR can read — the original kept on the NAS with its record, out of the searchable library
  out.push({ action: 'archive', label: 'Archive it', hint: 'keep the original and its record, not in the searchable library — for later' });
  out.push({ action: 'decline', label: 'Don\'t add it', hint: 'not wanted' });
  return out.filter(Boolean);
}

/** → everything the Review popup shows. */
export async function reviewOf(itemId, { read = readFile, size = stat, shelves = libraryShelves } = {}) {
  const item = await getItem(itemId);
  if (!item) throw Object.assign(new Error('no such item'), { statusCode: 404 });
  const id = item.identified || {}, a = id.appraisal || {};
  const textPath = id.slp?.path || id.slp_rejected?.path || (['txt', 'md', 'markdown'].includes(extOf(item.original_path)) ? item.original_path : null);
  const text = textPath ? String(await read(textPath).catch(() => '')).replace(/<!--[\s\S]*?-->/g, '').replace(/^---\n[\s\S]*?\n---\n/, '').trim() : '';
  const bytes = item.original_path ? (await size(item.original_path).catch(() => null))?.size ?? null : null;
  let sh = {};
  try { sh = shelves(); } catch { /* library not mounted here */ }
  return {
    item: { id: item.id, title: item.title, author: item.author || a.author || null, state: item.state, kind: a.kind || item.kind || null, year: a.year || null,
      summary: a.summary || null, shelf: id.shelf || null, doc_id: item.doc_id || null },
    question: item.log?.at(-1)?.why || null,
    history: (item.log || []).slice(-8).map((l) => ({ at: l.at, state: l.state, why: l.why })),
    source: item.original_path ? { name: id.file_name || item.original_path.split('/').pop(), ext: extOf(item.original_path), bytes } : null,
    text: text ? { from: id.slp?.path ? 'ocr' : id.slp_rejected?.path ? 'ocr-rejected' : 'file', preview: text.slice(0, TEXT_PREVIEW), chars: text.length,
      why_rejected: id.slp_rejected?.check?.why || null } : null,
    shelves: sh,
    answers: answersFor(item),
  };
}

/** Carry out a person's answer. action: import | use-ocr | retry-ocr | decline; fields { title?, author?, shelf? }. */
export async function resolveItem(itemId, action, { title, author, shelf } = {}, by = 'dewey', deps = {}) {
  const { queue = enqueue, cancel = slpCancel } = deps;
  const item = await getItem(itemId);
  if (!item) throw Object.assign(new Error('no such item'), { statusCode: 404 });
  // an IMPORTED document can be archived too (its text proved unreadable): it leaves the searchable library, its original stays
  if (action === 'archive' && item.state === 'ingested') return archiveItem(item, by, deps);
  if (!['needs-human', 'failed', 'needs-ocr'].includes(item.state)) throw Object.assign(new Error(`this item is ${item.state} — nothing to answer`), { statusCode: 409 });
  const allowed = answersFor(item).map((x) => x.action);
  if (!allowed.includes(action)) throw Object.assign(new Error(`“${action}” does not fit this item (${allowed.join(', ')})`), { statusCode: 400 });
  if (action === 'archive') return archiveItem(item, by, deps);
  if (action === 'decline') return declineItem(item, by, { cancel });
  const override = { add: true, by, at: new Date().toISOString() };
  let identified = { ...item.identified, override };
  if (shelf?.religion && shelf?.collection) identified.shelf = { religion: shelf.religion, collection: shelf.collection, why: `chosen by ${by}` };
  const named = { ...(title?.trim() ? { title: title.trim() } : {}), ...(author?.trim() ? { author: author.trim() } : {}) };
  if (action === 'retry-ocr') {
    // the job asks SLP for the current result under the earlier job id first (SLP finishes failed jobs later)
    await updateItem(item.id, { state: 'needs-ocr', identified, ...named }, `${by}: run OCR again`);
    await queue('dewey-ocr', { id: item.id, priority: 1 }, by);
    return getItem(item.id);
  }
  if (action === 'use-ocr') {
    const rej = identified.slp_rejected;
    if (!rej?.path) throw Object.assign(new Error('no OCR text on file'), { statusCode: 400 });
    identified = { ...identified, slp: { ...rej, accepted_by: by }, slp_rejected: null };
  }
  await updateItem(item.id, { state: 'source', identified, ...named }, `${by}: ${action === 'use-ocr' ? 'the OCR text is good — use it' : 'add it'}`);
  await queue('dewey-intake', { id: item.id, priority: 1 }, by);
  return getItem(item.id);
}

/** NO: declined, and an SLP job still reading it is cancelled (Chad 10-18: "choosing not to add a book did not stop the SLP
 *  processing") — a job whose connection dropped ("fetch failed") has no run polling it, so the decline itself cancels it. */
export async function declineItem(item, by, { cancel = slpCancel } = {}) {
  const id = item.identified || {};
  const job = id.slp_progress?.job_id && id.slp_progress.step !== 'complete' && !id.slp?.job_id && id.slp_progress.job_id !== id.slp_rejected?.job_id ? id.slp_progress.job_id : null;
  const c = job ? await cancel(job).catch(() => null) : null;
  return updateItem(item.id, { state: 'declined' }, `declined by ${by}${job ? (c?.deleted ? ` — SearchLayerPDF job ${job} cancelled` : ` — could not cancel SearchLayerPDF job ${job}`) : ''}`);
}

/** ARCHIVED: the original stays on the NAS (library-originals, with its sidecar), the record keeps what is known; a document
 *  already imported leaves the searchable library (soft delete — reversible). */
export async function archiveItem(item, by, { remove = null } = {}) {
  if (item.doc_id) {
    const softDeleteDocs = remove || (await import('../docs-repo.js')).softDeleteDocs;
    await softDeleteDocs([item.doc_id], { reason: `archived by ${by}: kept for later, not searchable (Dewey item ${item.id})`, allowLastCopy: true });
  }
  return updateItem(item.id, { state: 'archived' }, `archived by ${by} — the original is kept${item.original_path ? ` (${item.original_path.split('/').pop()})` : ''}, not in the searchable library${item.doc_id ? `; document ${item.doc_id} withdrawn` : ''}`);
}
