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
import { findBySha, createItem, updateItem } from '../repos/dewey-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { identifyAndCheck } from '../dewey/holdings.js';
import { appraiseDocument } from '../dewey/appraise.js';
import { logActivity } from '../repos/activity-repo.js';

export const ingestDir = () => process.env.DEWEY_INGEST_DIR || '/tank/dropbox/Ocean2.0 Supplemental/Dewey Ingest/new';
const EASE = { txt: 0, md: 0, markdown: 0, docx: 1, html: 2, htm: 2, xhtml: 2, epub: 2, rtf: 2, odt: 2, doc: 3, wpd: 3, wps: 3, webarchive: 4, pdf: 5 };
const HELD_WHY = 'ingest folder: already in the library';
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

export async function deweyIngestFolderJob({ batch = 5, round = 1 } = {}, deps = {}) {
  const { list = easiestFirst, sha = sha256Of, check = identifyAndCheck, queue = enqueue, appraise = appraiseDocument, by = 'dewey-ingest-folder' } = deps;
  const dir = ingestDir();
  const files = await list(dir);
  const out = { round, queued: [], held: [], skipped: 0 };
  for (const f of files) {
    if (out.queued.length + out.held.length >= batch) break;
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
    // a file never offered before is appraised from its own text (title, author, shelf) — as an upload would be
    const a = known ? null : await appraise(doc.identified, doc.excerpt, doc.result.verdict).catch(() => null);
    const item = known || await createItem({ title: a?.title || doc.identified.title || f.path.split('/').pop(), author: a?.author || doc.identified.author || null,
      kind: a?.kind || doc.identified.kind || null, identified: { ...doc.identified, file_name: f.path.split('/').pop(), shelf: a?.shelf || null, appraisal: a || null },
      by, state: 'offered', why: 'placed in the ingest folder' });
    await updateItem(item.id, { state: 'source', sha256: hash, original_path: f.path }, `ingest folder (round ${round}, easiest first): ${doc.result.verdict} → adding`);
    await queue('dewey-intake', { id: item.id }, by);
    out.queued.push(f.path);
  }
  const remaining = files.length - out.skipped - out.queued.length - out.held.length;
  // the next round queues BEHIND this round's intakes (same lane, first in first out) — gradual by construction
  if (remaining > 0) await queue('dewey-ingest-folder', { batch, round: round + 1 }, by);
  await logActivity('ingest', `ingest folder round ${round}: ${out.queued.length} queued, ${out.held.length} already held, ${remaining} waiting`).catch(() => {});
  return { ...out, remaining };
}
