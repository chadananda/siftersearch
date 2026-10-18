// dewey-ocr ops job — the FINAL text of a scanned (or garbled-layer) PDF from SearchLayerPDF, CHECKED before use (Chad
// 10-18: "use it judiciously and check output"). Queued by dewey-intake when a work fails the prose gate as a scan. Judicious:
// over DEWEY_SLP_MAX_PAGES pages waits for a person (cost and time). Checked: slpCheck() — real words, enough text a page,
// and the pages our own preliminary OCR reads must be in SLP's text. Pass → the Markdown is kept beside the originals and
// intake runs again on it; fail → needs-human, with the reasons and the SLP job id. HANDWRITING that SLP misreads is
// transcribed by the vision model instead (≤ 30 pages), under the same check. A result on file is re-checked, not re-bought.
// params { id }.
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { getItem, updateItem, listItems } from '../repos/dewey-repo.js';
import { appraiseDocument } from '../dewey/appraise.js';
import { workKey } from './dewey-ingest-folder-job.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { readPdf, ocrSample, visionRead } from '../dewey/convert.js';
import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { slpExtract, slpCheck, slpMaxPages, slpReceipt, slpToText } from '../dewey/searchlayer.js';
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
  const progress = (p) => { if (Date.now() - lastBeat < 30000 && !['complete', 'created', 'resumed'].includes(p.step)) return; lastBeat = Date.now();
    updateItem(item.id, { identified: { ...item.identified, slp_progress: { ...p, at: new Date().toISOString() } } }).catch(() => {}); };
  // a SLP result already on file (rejected under an earlier check) is re-checked, not paid for again
  const prior = item.identified?.slp_rejected;
  // SLP re-runs a job under the SAME id when it improves (10-18: "failed OCR jobs have been completed. you can request them
  // with the same url") — so the CURRENT result for that id is fetched first; the saved copy is the fallback
  if (prior?.job_id && !deps.read) {
    try { out = { ...(await extract({ path: item.original_path, context, resumeJobId: prior.job_id }, { log: progress })), refetched: true }; } catch { out = null; }
  }
  if (!out && prior?.path) {
    try { const md = String(await (deps.read || readFile)(prior.path)); out = { markdown: md, ...slpToText(md), job_id: prior.job_id, score: prior.score, cost_cents: prior.cost_cents, pages: prior.pages, reused: true }; } catch { out = null; }
  }
  if (!out) {
    // a job submitted before a restart is resumed (its id is on the item), never re-submitted
    const resume = item.identified?.slp_progress?.job_id && !['failed', 'capped'].includes(item.identified.slp_progress.step) ? item.identified.slp_progress.job_id : null;
    try { out = await extract({ path: item.original_path, context, resumeJobId: resume }, { log: progress }); } catch (err) {
      await updateItem(item.id, { state: 'needs-human' }, `full OCR failed: ${String(err.message).slice(0, 200)}`);
      return { id, state: 'needs-human', why: err.message };
    }
  }
  let check = slpCheck(out.text, { pages: out.pages || pages, sampleText: own?.text || null });
  const where = join(originalsDir(), 'ocr', `${item.sha256 || `item-${item.id}`}.slp.md`);
  if (!out.reused) await save(where, out.markdown);   // kept either way — a failed check can be read by a person
  let slp = { path: out.reused ? prior.path : where, job_id: out.job_id, score: out.score, cost_cents: out.cost_cents, pages: out.pages || pages, check, meta: out.meta,
    receipt: out.reused ? prior.receipt || null : await receipt(out.job_id).catch(() => null) };   // SLP's own account of the work, shown on the import board
  // HANDWRITING: SLP misreads it and can invent text ("How wonderful. Professor and Margaret and all…" for a Sears letter,
  // 10-18) while our vision read was right. A failed check on a handwritten scan of ≤ 30 pages → the vision model
  // transcribes every page, and that text must pass the same quality check (words, text per page).
  if (!check.ok && own?.langs === 'vision' && pages <= 30) {
    const vis = await (deps.transcribe || transcribeAll)(item.original_path, pages).catch(() => null);
    const vcheck = vis ? slpCheck(vis.text, { pages }) : null;
    if (vcheck?.ok) {
      const vwhere = join(originalsDir(), 'ocr', `${item.sha256 || `item-${item.id}`}.vision.md`);
      await save(vwhere, vis.text);
      slp = { path: vwhere, engine: 'vision', pages, check: vcheck, meta: {}, receipt: { narrative: `Handwriting: SearchLayerPDF's reading did not match what we read ourselves (${check.why.join('; ')}), so every page was transcribed by the vision model instead — ${pages} page${pages === 1 ? '' : 's'}, ${vcheck.words.toLocaleString('en-US')} words.`, processing: { method: 'vision transcription (handwriting)' } }, slp_rejected_job: out.job_id };
      check = vcheck;
      out = { ...out, text: vis.text, meta: {} };
    }
  }
  if (!check.ok) {
    await updateItem(item.id, { state: 'needs-human', identified: { ...item.identified, slp_rejected: slp } }, `SearchLayerPDF text did not pass the check (${check.why.join('; ')}) — job ${out.job_id}, kept at ${slp.path}`);
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

/** Every page of a (handwritten) scan transcribed by the vision model, in order — 4 at a time. → { text } with page markers. */
export async function transcribeAll(path, pages) {
  const dir = await mkdtemp(join(tmpdir(), 'dewey-vis-'));
  try {
    const one = async (p) => {
      await new Promise((res, rej) => execFile('pdftoppm', ['-r', '200', '-gray', '-f', String(p), '-l', String(p), '-singlefile', '-png', path, join(dir, `p${p}`)], { timeout: 120000 }, (e) => (e ? rej(e) : res())));
      const t = await visionRead(await readFile(join(dir, `p${p}.png`)));
      return /^\s*UNREADABLE\s*$/i.test(t) ? '' : t.trim();
    };
    const out = [];
    for (let p = 1; p <= pages; p += 4) out.push(...await Promise.all(Array.from({ length: Math.min(4, pages - p + 1) }, (_, k) => one(p + k))));
    return { text: out.map((t, i) => `<pb n="${i + 1}"/>\n\n${t}`).join('\n\n') };
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
