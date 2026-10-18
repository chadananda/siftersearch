// dewey-ingest-folder ops job — THE INGEST FOLDER (Chad 10-18: "an ingest folder where we can place copies of documents we
// decide to add. The system can then work on those gradually, adding the easiest first"). A file placed in
// DEWEY_INGEST_DIR is a decision to add it. Each round takes the next `batch` files, EASIEST FIRST (plain text and Word
// before PDFs, small before large; scans fail the prose gate and wait as needs-ocr for full OCR), re-checks each against
// the library just before (a copy already held — or added earlier in this same batch — is not added twice), and queues
// its intake in the same lane, then queues the next round behind them. Progress is on the Dewey items (Loading column).
// A file is handled once: its sha256 is on its item. params { batch?, round? }.
import { readdir, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { join, extname } from 'path';
import { findBySha, createItem, updateItem, listItems } from '../repos/dewey-repo.js';
import { compareWords, compareTexts } from '../dewey/compare.js';
import { toMarkdownText } from '../dewey/convert.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { identifyAndCheck } from '../dewey/holdings.js';
import { appraiseDocument } from '../dewey/appraise.js';
import { logActivity } from '../repos/activity-repo.js';

// on the NAS, OUTSIDE the synced Dropbox (Chad 10-18: no large PDFs, video or audio in Dropbox)
export const ingestDir = () => process.env.DEWEY_INGEST_DIR || '/tank/dewey-ingest/new';
const EASE = { txt: 0, md: 0, markdown: 0, docx: 1, html: 2, htm: 2, xhtml: 2, epub: 2, rtf: 2, odt: 2, doc: 3, wpd: 3, wps: 3, webarchive: 4, pdf: 5 };
const HELD_WHY = 'ingest folder: already in the library';
/** A work's title for "the same work?": diacritics, apostrophes and the subtitle after ':' folded away. */
export const workKey = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().split(':')[0].replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const DONE = new Set(['source', 'processing', 'ingested', 'needs-ocr', 'needs-human', 'failed']);

/** The folder's documents, easiest first: by format, then size. */
export async function easiestFirst(dir) {
  const files = [];
  const walk = async (d) => { for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else { const ext = extname(e.name).slice(1).toLowerCase(); if (ext in EASE) files.push({ path: p, ext, size: (await stat(p)).size }); }
  } };
  await walk(dir);
  return files.sort((a, b) => EASE[a.ext] - EASE[b.ext] || a.size - b.size);
}

const sha256Of = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });

export async function deweyIngestFolderJob({ batch = 5, round = 1, reconsider = [] } = {}, deps = {}) {
  const { list = easiestFirst, sha = sha256Of, check = identifyAndCheck, queue = enqueue, appraise = appraiseDocument, by = 'dewey-ingest-folder',
    recent = async () => (await listItems({ limit: 1000 })).filter((i) => ['source', 'processing', 'ingested'].includes(i.state) && String(i.original_path || '').includes('/Dewey Ingest/')),
    // the twin's FULL text (a spot-check sample of each of two scans of one book covers different pages — the World's
    // Congress of Religions went in twice, 10-18); this job runs in the reports worker, where a full read is fine
    textOf = async (path) => (await toMarkdownText(null, path.split('/').pop(), { path, full: true, ocr: false })).markdown || '' } = deps;
  // RECONSIDER: items held under an earlier rule (failed "too short", unappraisable scans) — back to intake once
  for (const id of reconsider) {
    await updateItem(Number(id), { state: 'source' }, 'reconsidered under the current rules');
    await queue('dewey-intake', { id: Number(id) }, by);
  }
  const dir = ingestDir();
  const files = await list(dir);
  const out = { round, queued: [], held: [], needs_person: [], skipped: 0 };
  for (const f of files) {
    if (out.queued.length + out.held.length + out.needs_person.length >= batch) break;
    const hash = await sha(f.path);
    const known = await findBySha(hash);
    // handled already — or found held by an earlier round. (A file Chad once DECLINED but has now placed here is a yes.)
    const heldBefore = known?.state === 'declined' && String(known.log?.at(-1)?.why || '').startsWith(HELD_WHY);
    if (known && (DONE.has(known.state) || heldBefore)) { out.skipped++; continue; }
    // re-check just before adding: the library may hold it by now (another copy in this batch, a different edition)
    const doc = await check({ path: f.path });
    if (doc.result.verdict === 'held') {
      const top = doc.result.candidates?.[0];
      const item = known || await createItem({ title: doc.identified.title || f.path.split('/').pop(), identified: { ...doc.identified, file_name: f.path.split('/').pop() }, by, state: 'declined', why: HELD_WHY });
      await updateItem(item.id, { state: 'declined', sha256: hash, original_path: f.path }, `${HELD_WHY}${top ? ` — #${top.id} ${top.title}` : ''}; not added`);
      out.held.push(f.path);
      continue;
    }
    // EVERY file is appraised from its own text before it goes in (an earlier offer's appraisal is reused when it has one).
    // 10-18: "Copyright Book List.txt" — a list of PDF file names whose earlier appraisal had failed — went in titled by its
    // first line. No appraisal, or "out of scope", now waits for a person instead.
    let a = known?.identified?.appraisal?.recommendation ? known.identified.appraisal : null;
    if (!a) a = await appraise(doc.identified, doc.excerpt, doc.result.verdict).catch(() => null);
    const name = f.path.split('/').pop();
    const item = known || await createItem({ title: a?.title || `Untitled (${name})`, author: a?.author || null, kind: a?.kind || doc.identified.kind || null,
      identified: { ...doc.identified, file_name: name, shelf: a?.shelf || null, appraisal: a || null }, by, state: 'offered', why: 'placed in the ingest folder' });
    // a SCAN with nothing readable yet (handwriting, an empty text layer) goes forward to full OCR; it is appraised from the
    // OCR text before anything is imported (dewey-ocr-job). Anything else without an appraisal waits for a person.
    const scanFirst = !a?.title && (doc.identified.needs_ocr || doc.identified.kind === 'scan' || /\.pdf$/i.test(f.path));
    if (scanFirst) {
      await updateItem(item.id, { state: 'source', sha256: hash, original_path: f.path }, `ingest folder (round ${round}): a scan with nothing readable yet — to full OCR, appraised from its text before import`);
      await queue('dewey-intake', { id: item.id }, by);
      out.queued.push(f.path);
      continue;
    }
    const hold = !a?.title ? 'could not be appraised (no title from its contents)'
      : a.recommendation === 'skip' || a.in_scope === 'no' ? `Dewey judged it out of scope: ${String(a.summary || a.scope_why || '').slice(0, 200)}` : null;
    // the SAME WORK already taken from this folder (another copy — a .doc beside its .pdf — queued in this round or an
    // earlier one, so the library check could not see it yet). 10-18: The Station and Claims of Bahá'u'llah and the
    // Olinga interview went in twice. Same title → compare the texts; same text → not added.
    if (!hold && a?.title) {
      const twin = (await recent()).find((i) => i.id !== item.id && workKey(i.title) === workKey(a.title));
      if (twin) {
        const ours = compareWords(doc.identified._text || doc.excerpt), sm = doc.identified.sample;
        const c = compareTexts(ours, compareWords(await textOf(twin.original_path).catch(() => '')),
          sm ? { sample: true, ourLength: Math.round(ours.length * sm.of / Math.max(1, sm.sampled.length)) } : {});
        if (['same', 'inside', 'partial'].includes(c.relation)) {
          await updateItem(item.id, { state: 'declined', sha256: hash, original_path: f.path }, `${HELD_WHY} — the same work as item ${twin.id} (“${twin.title}”), taken from this folder already (${c.relation})`);
          out.held.push(f.path);
          continue;
        }
      }
    }
    if (hold) {
      await updateItem(item.id, { state: 'needs-human', sha256: hash, original_path: f.path, identified: { ...item.identified, appraisal: a || null, shelf: a?.shelf || null } },
        `ingest folder: ${hold} — add it by hand if you want it`);
      out.needs_person.push(f.path);
      continue;
    }
    await updateItem(item.id, { state: 'source', sha256: hash, original_path: f.path, title: a.title, author: a.author || item.author || null,
      identified: { ...item.identified, appraisal: a, shelf: a.shelf || item.identified?.shelf || null } }, `ingest folder (round ${round}, easiest first): ${doc.result.verdict} → adding`);
    await queue('dewey-intake', { id: item.id }, by);
    out.queued.push(f.path);
  }
  const remaining = files.length - out.skipped - out.queued.length - out.held.length - out.needs_person.length;
  // the next round queues BEHIND this round's intakes (same lane, first in first out) — gradual by construction
  if (remaining > 0 && batch > 0) await queue('dewey-ingest-folder', { batch, round: round + 1 }, by);   // batch 0 = reconsider only
  await logActivity('ingest', `ingest folder round ${round}: ${out.queued.length} queued, ${out.held.length} already held, ${out.needs_person.length} for a person, ${remaining} waiting`).catch(() => {});
  return { ...out, remaining };
}
