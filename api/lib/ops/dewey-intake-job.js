// dewey-intake ops job — a wanted work whose source has been attached becomes a library document (Chad 10-17): read the
// archived original, extract its text, check it is real prose (a scan waits as 'needs-ocr' until OCR exists), choose its
// shelf among the library's existing tradition › collection folders, write the Markdown, ingest it through the ingester
// and single writer, attach its researched cover. From there the automatic chain (structure → BM25 → references →
// vectors → …) takes over with no manual step. Every outcome is a state on the item with its reason. params { id }.
import { readFile, unlink, writeFile } from 'fs/promises';
import { getItem, updateItem } from '../repos/dewey-repo.js';
import { garbledLayer } from '../dewey/convert.js';
import { cleanText } from '../dewey/clean.js';
import { slpToText, slpEnabled } from '../dewey/searchlayer.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { ingestDir } from './dewey-ingest-folder-job.js';
import { extractText, archiveFile, inArchive, proseGate, libraryShelves, chooseShelf, writeLibraryFile, toMarkdown } from '../dewey/intake.js';
import { detectLang } from '../pipeline/profile.js';
import { withAIContext } from '../ai-context.js';
import { waitForQuietWriter } from './ctai-jobs.js';
import { audit } from '../audit.js';
import { logActivity } from '../repos/activity-repo.js';

export async function deweyIntakeJob({ id } = {}, deps = {}) {
  const { ingest = async (md, rel) => (await import('../../services/ingester.js')).ingestDocument(md, {}, rel),
    storeCover = async (docId, buf, meta) => (await import('../covers.js')).storeCover(docId, buf, meta),
    shelves = libraryShelves, choose = chooseShelf, write = writeLibraryFile, read = readFile } = deps;
  const item = await getItem(id);
  if (!item) throw new Error(`dewey item ${id} not found`);
  if (!item.original_path) throw new Error(`dewey item ${id} has no source attached`);
  await updateItem(item.id, { state: 'processing' }, 'intake started');
  // the source is ARCHIVED on the NAS (outside the synced Dropbox) before anything else; a copy in the ingest folder is then
  // removed — the archive is the original from here on (the reader can open it: GET /api/documents/:id/source)
  if (!inArchive(item.original_path) && !deps.read) {
    const arc = await archiveFile(item.original_path, { itemId: item.id, title: item.title, kind: item.identified?.appraisal?.kind || item.kind || null });
    if (item.original_path.startsWith(`${ingestDir()}/`)) await unlink(item.original_path).catch(() => {});
    await updateItem(item.id, { original_path: arc.path, sha256: arc.sha256 }, `source archived on the NAS (${Math.round(arc.bytes / 1048576 * 10) / 10} MB)`);
    item.original_path = arc.path; item.sha256 = arc.sha256;
  }
  const ext = item.original_path.split('.').pop().toLowerCase();
  let text, pages;
  const slp = item.identified?.slp;   // SearchLayerPDF's checked text of a scan (dewey-ocr-job.js), when it has run
  // a PDF is read in place by poppler (a 270 MB book never enters this process's memory); anything else is small
  try {
    if (slp?.path) ({ text } = slpToText(String(await read(slp.path))), pages = slp.pages || 1);
    else ({ text, pages } = ext === 'pdf' && !deps.read ? await extractText(null, ext, item.original_path) : await extractText(await read(item.original_path), ext));
  } catch (err) {
    // a damaged or unreadable file is an outcome with its reason, not a crashed job
    await updateItem(item.id, { state: 'failed' }, `could not read the ${ext.toUpperCase()}: ${String(err.message).slice(0, 160)}`);
    return { id: item.id, state: 'failed', why: err.message };
  }
  // the text cleaner (dewey/clean.js): pages marked, running headers/page numbers out, the source's false paragraph marks
  // (a hard break on every printed line) repaired, hyphens closed, emphasis markers dropped — every format, SLP's too
  text = cleanText(text);
  const gate = proseGate(text.replace(/<pb[^>]*\/>/g, ' '), { pages });
  // a scan or a GARBLED text layer (old OCR) is not the book's text: it waits for full OCR — SearchLayerPDF, queued here
  // when configured (its output is checked before it comes back to this job)
  // ANY PDF that fails the gate goes to OCR — a handwritten letter's junk text layer (77 words, letter ratio 0.43) is a scan too
  const needsOcr = !slp && ext === 'pdf' && (gate.ok ? garbledLayer(text) : true);
  if (needsOcr) {
    const why = gate.ok ? 'its text layer is a garbled old OCR' : `a scan: no text layer (${gate.why})`;
    const slpOn = (deps.slpEnabled || slpEnabled)();
    await updateItem(item.id, { state: 'needs-ocr' }, `${why} — ${slpOn ? 'sent for full OCR (SearchLayerPDF)' : 'waits for full OCR'}`);
    if (slpOn) await (deps.queue || enqueue)('dewey-ocr', { id: item.id }, 'dewey-intake');
    return { id: item.id, state: 'needs-ocr', why };
  }
  if (!gate.ok) {
    await updateItem(item.id, { state: 'failed' }, `not usable text: ${gate.why}`);
    return { id: item.id, state: 'failed', why: gate.why };
  }
  // a BOOK that reads as a few pages is a fragment — "The Apocalypse Unsealed" (10-18) was its preface only (1,479 words):
  // a person decides whether a fragment belongs. Pilgrim notes, letters and talks are short by nature and pass.
  const kind = String(item.identified?.appraisal?.kind || item.kind || '').toLowerCase();
  if (kind === 'book' && gate.words < 5000 && !deps.allowFragment) {
    await updateItem(item.id, { state: 'needs-human' }, `only part of a book? Its text is ${gate.words.toLocaleString('en-US')} words — check whether this file holds the whole work`);
    return { id: item.id, state: 'needs-human', why: 'book fragment' };
  }
  const r = item.research || {};
  const title = r.matched && r.title ? r.title : item.title;
  const author = (r.matched && r.author) || item.author || null;
  const language = detectLang(text.slice(0, 6000), null) || r.language || 'en';
// the shelf the member already said yes to (the offer's appraisal), when it is still an existing shelf
  const offered = item.identified?.shelf, sh = shelves();
  const shelf = offered && sh[offered.religion]?.includes(offered.collection) ? offered : await choose({ title, author, language, subjects: r.subjects, description: r.description?.slice(0, 600), kind: item.kind }, sh);
  if (!shelf) {
    await updateItem(item.id, { state: 'needs-human' }, 'no existing shelf fits — file it by hand');
    return { id: item.id, state: 'needs-human' };
  }
  const markdown = toMarkdown({ title, author, language, research: r, sourceUrl: item.source_url, sha256: item.sha256, itemId: item.id }, text);
  const rel = await write({ religion: shelf.religion, collection: shelf.collection, title, itemId: item.id, markdown });
  await audit({ actor: 'dewey-intake', action: 'file.write', target: rel, reason: `wanted item ${item.id} — ${shelf.why || 'shelved'}` });
  await waitForQuietWriter();
  const res = await withAIContext({ caller: 'dewey-intake', localOnly: true }, () => ingest(markdown, rel));
  const docId = res?.documentId;
  if (!docId || res.status === 'error') {
    await updateItem(item.id, { state: 'failed' }, `ingest failed: ${res?.error || res?.status || 'no document id'}`);
    return { id: item.id, state: 'failed' };
  }
  // the archive's sidecar learns which document this source became (the reader's "original scan" link resolves through it)
  if (inArchive(item.original_path)) {
    const side = `${item.original_path}.json`;
    const prev = await readFile(side, 'utf8').then(JSON.parse).catch(() => ({}));
    await writeFile(side, JSON.stringify({ ...prev, docId, title, shelf: `${shelf.religion} › ${shelf.collection}` }, null, 2)).catch(() => {});
  }
  if (item.cover_path) {
    const buf = await read(item.cover_path).catch(() => null);
    if (buf) await storeCover(docId, buf, { source: r.cover?.source || 'research', url: r.cover?.url }).catch(() => null);
  }
  await updateItem(item.id, { state: 'ingested', doc_id: docId }, `ingested as document ${docId} in ${shelf.religion} › ${shelf.collection} (${gate.words.toLocaleString('en-US')} words${slp ? (slp.engine === 'vision' ? ', text by our vision transcription (handwriting SLP could not read)' : `, text by SearchLayerPDF job ${slp.job_id}`) : ''})`);
  logActivity('job', `dewey · “${title}” added to ${shelf.religion} › ${shelf.collection}`);
  return { id: item.id, state: 'ingested', doc_id: docId, rel, words: gate.words };
}
