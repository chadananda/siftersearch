// dewey-ocr ops job — the FINAL text of a scanned (or garbled-layer) PDF from SearchLayerPDF, CHECKED before use (Chad
// 10-18: "use it judiciously and check output"). Queued by dewey-intake when a work fails the prose gate as a scan. Judicious:
// over DEWEY_SLP_MAX_PAGES pages waits for a person (cost and time). Checked: slpCheck() — real words, enough text a page,
// and the pages our own preliminary OCR reads must be in SLP's text. Pass → the Markdown is kept beside the originals and
// intake runs again on it; fail → needs-human, with the reasons and the SLP job id. params { id }.
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getItem, updateItem, listItems } from '../repos/dewey-repo.js';
import { appraiseDocument } from '../dewey/appraise.js';
import { workKey } from './dewey-ingest-folder-job.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { readPdf, ocrSample } from '../dewey/convert.js';
import { slpExtract, slpCheck, slpMaxPages, slpReceipt } from '../dewey/searchlayer.js';
import { originalsDir } from '../dewey/intake.js';
import { logActivity } from '../repos/activity-repo.js';

export async function deweyOcrJob({ id } = {}, deps = {}) {
  const { extract = slpExtract, receipt = slpReceipt, sample = ocrSample, pdfInfo = readPdf, queue = enqueue, appraise = appraiseDocument,
    others = async () => listItems({ limit: 1000 }), save = async (p, t) => { await mkdir(join(p, '..'), { recursive: true }); await writeFile(p, t); } } = deps;
  const item = await getItem(id);
  if (!item?.original_path) throw new Error(`dewey item ${id} has no source`);
  if (item.identified?.slp?.path) return { id, skipped: 'already has SLP text' };
  // never OCR the same work twice (two copies of "Islam and the Baha'i Faith" were both sent, 10-18): an earlier item with
  // the same title already on its way through OCR or in the library → a person decides
  const untitled = /^untitled/i.test(String(item.title || ''));
  const twin = untitled ? null : (await others()).find((o) => o.id < item.id && workKey(o.title) === workKey(item.title)
    && (['source', 'processing', 'ingested'].includes(o.state) || (o.state === 'needs-ocr' && !o.identified?.slp_rejected)));
  if (twin) {
    await updateItem(item.id, { state: 'needs-human' }, `possibly the same work as item ${twin.id} (“${twin.title}”, ${twin.state}) — not sent for OCR twice`);
    return { id, state: 'needs-human', twin: twin.id };
  }
  const { pages } = await pdfInfo({ path: item.original_path });
  if (pages > slpMaxPages()) {
    await updateItem(item.id, { state: 'needs-human' }, `a ${pages}-page scan — over the ${slpMaxPages()}-page limit for automatic OCR; approve it by hand`);
    return { id, state: 'needs-human', pages };
  }
  await updateItem(item.id, { state: 'needs-ocr' }, `full OCR started (SearchLayerPDF, ${pages} pages)`);
  // our own read of a few pages — what SLP's text must contain
  const own = await sample({ path: item.original_path }, pages).catch(() => null);
  const a = item.identified?.appraisal || {};
  const context = [a.title || item.title, a.author || item.author, a.year, a.summary].filter(Boolean).join(' — ');
  let out;
  // live progress for the Observatory's import board (pages done / total, SLP's stage) — no log line, just the field
  let lastBeat = 0;
  const progress = (p) => { if (Date.now() - lastBeat < 30000 && p.step !== 'complete') return; lastBeat = Date.now();
    updateItem(item.id, { identified: { ...item.identified, slp_progress: { ...p, at: new Date().toISOString() } } }).catch(() => {}); };
  try { out = await extract({ path: item.original_path, context }, { log: progress }); } catch (err) {
    await updateItem(item.id, { state: 'needs-human' }, `full OCR failed: ${String(err.message).slice(0, 200)}`);
    return { id, state: 'needs-human', why: err.message };
  }
  const check = slpCheck(out.text, { pages: out.pages || pages, sampleText: own?.text || null });
  const where = join(originalsDir(), 'ocr', `${item.sha256 || `item-${item.id}`}.slp.md`);
  await save(where, out.markdown);   // kept either way — a failed check can be read by a person
  const slp = { path: where, job_id: out.job_id, score: out.score, cost_cents: out.cost_cents, pages: out.pages || pages, check, meta: out.meta,
    receipt: await receipt(out.job_id).catch(() => null) };   // SLP's own account of the work, shown on the import board
  if (!check.ok) {
    await updateItem(item.id, { state: 'needs-human', identified: { ...item.identified, slp_rejected: slp } }, `SearchLayerPDF text did not pass the check (${check.why.join('; ')}) — job ${out.job_id}, kept at ${where}`);
    return { id, state: 'needs-human', check };
  }
  // a scan that could not be appraised before OCR is appraised NOW, from SLP's text — title, author, shelf, scope
  let ap = a;
  if (!a.title) {
    ap = await appraise({ ...item.identified, file_name: item.identified?.file_name }, out.text.slice(0, 8000), 'not held (checked before OCR)').catch(() => null) || {};
    if (ap.recommendation === 'skip' || ap.in_scope === 'no') {
      await updateItem(item.id, { state: 'needs-human', identified: { ...item.identified, slp, appraisal: ap } }, `read by full OCR, then judged out of scope: ${String(ap.summary || ap.scope_why || '').slice(0, 200)} — add it by hand if you want it`);
      return { id, state: 'needs-human', why: 'out of scope after OCR' };
    }
  }
  // SLP read the title page too: its title/author fill in what the appraisal could not
  const title = ap.title || (untitled ? null : item.title) || out.meta.title || item.title, author = ap.author || item.author || out.meta.author || null;
  await updateItem(item.id, { state: 'source', title, author, identified: { ...item.identified, slp, appraisal: ap.title ? ap : item.identified?.appraisal || null, shelf: ap.shelf || item.identified?.shelf || null } },
    `full OCR passed the check (${check.words.toLocaleString('en-US')} words, ${check.perPage}/page${check.sampleFound != null ? `, our sampled pages ${Math.round(check.sampleFound * 100)}% found` : ''}; SLP score ${out.score ?? '?'}, job ${out.job_id})`);
  await queue('dewey-intake', { id: item.id }, 'dewey-ocr');
  logActivity('job', `dewey · OCR done for “${title}” (${pages} pages)`).catch(() => {});
  return { id, state: 'source', check, job_id: out.job_id };
}
