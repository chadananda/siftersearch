// dewey-intake ops job — a wanted work whose source has been attached becomes a library document (Chad 10-17): read the
// archived original, extract its text, check it is real prose (a scan waits as 'needs-ocr' until OCR exists), choose its
// shelf among the library's existing tradition › collection folders, write the Markdown, ingest it through the ingester
// and single writer, attach its researched cover. From there the automatic chain (structure → BM25 → references →
// vectors → …) takes over with no manual step. Every outcome is a state on the item with its reason. params { id }.
import { readFile } from 'fs/promises';
import { getItem, updateItem } from '../repos/dewey-repo.js';
import { extractText, proseGate, libraryShelves, chooseShelf, writeLibraryFile, toMarkdown } from '../dewey/intake.js';
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
  const ext = item.original_path.split('.').pop().toLowerCase();
  let text, pages;
  try { ({ text, pages } = await extractText(await read(item.original_path), ext)); } catch (err) {
    // a damaged or unreadable file is an outcome with its reason, not a crashed job
    await updateItem(item.id, { state: 'failed' }, `could not read the ${ext.toUpperCase()}: ${String(err.message).slice(0, 160)}`);
    return { id: item.id, state: 'failed', why: err.message };
  }
  const gate = proseGate(text, { pages });
  if (!gate.ok) {
    const scan = ext === 'pdf' && gate.scan;
    await updateItem(item.id, { state: scan ? 'needs-ocr' : 'failed' }, scan ? `a scan: no text layer (${gate.why}) — waits for OCR` : `not usable text: ${gate.why}`);
    return { id: item.id, state: scan ? 'needs-ocr' : 'failed', why: gate.why };
  }
  const r = item.research || {};
  const title = r.matched && r.title ? r.title : item.title;
  const author = (r.matched && r.author) || item.author || null;
  const language = detectLang(text.slice(0, 6000), null) || r.language || 'en';
  const shelf = await choose({ title, author, language, subjects: r.subjects, description: r.description?.slice(0, 600), kind: item.kind }, shelves());
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
  if (item.cover_path) {
    const buf = await read(item.cover_path).catch(() => null);
    if (buf) await storeCover(docId, buf, { source: r.cover?.source || 'research', url: r.cover?.url }).catch(() => null);
  }
  await updateItem(item.id, { state: 'ingested', doc_id: docId }, `ingested as document ${docId} in ${shelf.religion} › ${shelf.collection} (${gate.words.toLocaleString('en-US')} words)`);
  logActivity('job', `dewey · “${title}” added to ${shelf.religion} › ${shelf.collection}`);
  return { id: item.id, state: 'ingested', doc_id: docId, rel, words: gate.words };
}
