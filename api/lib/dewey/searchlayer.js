// SearchLayerPDF (SLP) — the FINAL text of a scanned PDF (Chad 10-18: "use for final extraction of MD from image PDFs …
// It is experimental, so use it judiciously and check output"). Contract: SearchLayerPDF/docs/integrations/siftersearch.md
// — create a job (privacy 'open': scans OCR only on rented GPUs, which serve open jobs), PUT the PDF, start it, poll, fetch
// the Markdown. JUDICIOUS: only scans and garbled layers reach it (intake decides), at most DEWEY_SLP_MAX_PAGES pages. CHECKED:
// slpCheck() must pass — real words, enough text per page, and the pages our preliminary OCR read must be IN it — or the
// item waits for a person. Key: SEARCHLAYERPDF_API_KEY (read from .env-secrets if the process predates it).
import { readFileSync, createReadStream, statSync } from 'fs';
import { wordRatio } from './convert.js';

const BASE = () => process.env.SEARCHLAYERPDF_URL || 'https://searchlayerpdf.com';
export const slpMaxPages = () => Number(process.env.DEWEY_SLP_MAX_PAGES) || 400;
export function slpKey() {
  if (process.env.SEARCHLAYERPDF_API_KEY) return process.env.SEARCHLAYERPDF_API_KEY;
  try { return (readFileSync('.env-secrets', 'utf8').match(/^SEARCHLAYERPDF_API_KEY=(.*)$/m)?.[1] || '').replace(/^["']|["']$/g, '').trim() || null; } catch { return null; }
}
export const slpEnabled = () => process.env.DEWEY_SLP !== '0' && !!slpKey();

/** SLP Markdown → { meta (its frontmatter), text } with its page markers as the ingester's <pb n=…/> (pdf_page per paragraph). */
export function slpToText(md) {
  const s = String(md || '').replace(/\r/g, '');
  const fm = s.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  for (const line of (fm?.[1] || '').split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) { let v = m[2].trim(); try { v = JSON.parse(v); } catch { v = v.replace(/^["']|["']$/g, ''); } meta[m[1]] = v; }
  }
  const text = (fm ? s.slice(fm[0].length) : s).replace(/<!--\s*pdf:(\d+)\s*-->/g, '<pb n="$1"/>').replace(/\n{3,}/g, '\n\n').trim();
  return { meta, text };
}

/**
 * Is SLP's text fit to import? → { ok, why[], words, perPage, ratio, sampleFound }.
 *  - real words (Latin text): ≥ 75% word shapes
 *  - enough text: ≥ 40 words per page (a book page has hundreds)
 *  - CONSISTENT with what we read ourselves: ≥ 40% of the distinct 5+-letter words of the pages our preliminary OCR read
 *    are in it — catches a wrong file, garbled handwriting, a page that came back empty
 */
export function slpCheck(text, { pages = 1, sampleText = null } = {}) {
  const body = String(text || '').replace(/<pb[^>]*\/>/g, ' ');
  const words = body.split(/\s+/).filter(Boolean).length;
  const perPage = words / Math.max(1, pages);
  const latin = (body.match(/[A-Za-z]/g) || []).length / Math.max(1, (body.match(/\p{L}/gu) || []).length) > 0.8;
  const ratio = latin ? wordRatio(body) : null;
  let sampleFound = null;
  const why = [];
  // OUR OWN pages must be in it — measured on DISTINCT words of 5+ letters, not 4-grams: one misread word breaks every
  // 4-gram it touches, so a typed page we read noisily scored 21% against SLP's excellent text (Rosenberg, 10-18);
  // as distinct words it is 54%, while a wrong document scores ~2% and SLP's garbled handwriting 7–25%
  if (sampleText) {
    const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const ours = new Set(fold(sampleText).match(/\p{L}{5,}/gu) || []), theirs = new Set(fold(body).match(/\p{L}{5,}/gu) || []);
    if (ours.size >= 15) {
      sampleFound = +([...ours].filter((w) => theirs.has(w)).length / ours.size).toFixed(2);
      if (sampleFound < 0.4) why.push(`the pages we read ourselves are not in its text (${Math.round(sampleFound * 100)}% of their words found)`);
    }
  }
  if (ratio != null && ratio < 0.75) why.push(`not clean text (${Math.round(ratio * 100)}% real words)`);
  if (perPage < 40) why.push(`too little text (${Math.round(perPage)} words a page)`);
  return { ok: !why.length, why, words, perPage: Math.round(perPage), ratio: ratio == null ? null : +ratio.toFixed(2), sampleFound };
}

/**
 * A PDF (a server path) → SLP's { markdown, meta, text, job_id, score, cost_cents }. Polls until done (scans: a GPU pod
 * takes 2–3 min to come up, then ~9 s a page English, ~17 s Arabic) — `timeoutMs` bounds it. fetchImpl injectable.
 */
export async function slpExtract({ path, context = '', resumeJobId = null }, { fetchImpl = fetch, key = slpKey(), pollMs = 20000, timeoutMs = 3 * 3600000, log = () => {} } = {}) {
  if (!key) throw new Error('SearchLayerPDF is not configured (SEARCHLAYERPDF_API_KEY)');
  const H = { Authorization: `Bearer ${key}` };
  const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } };
  let r, job;
  if (resumeJobId) {
    // a job already submitted (the worker restarted while it ran): poll it — never upload and pay twice
    job = { job_id: resumeJobId };
    log({ job_id: job.job_id, step: 'resumed' });
  } else {
    r = await fetchImpl(`${BASE()}/v1/jobs`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ privacy: 'open', quality: 'economy', context: String(context).slice(0, 2000) }) });
    job = await json(r);
    if (!r.ok || !job.job_id) throw new Error(`SLP job not created (${r.status}): ${JSON.stringify(job).slice(0, 160)}`);
    log({ job_id: job.job_id, step: 'created' });
    r = await fetchImpl(job.upload_url, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/pdf', 'Content-Length': String(statSync(path).size) },
      body: createReadStream(path), duplex: 'half' });
    if (!r.ok) throw new Error(`SLP upload failed (${r.status}) for job ${job.job_id}`);
    r = await fetchImpl(job.process_url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) throw new Error(`SLP did not start job ${job.job_id} (${r.status})`);
  }
  const t0 = Date.now();
  let s;
  for (;;) {
    s = await json(await fetchImpl(`${BASE()}/v1/jobs/${job.job_id}`, { headers: H }));
    log({ job_id: job.job_id, step: s.status, stage: s.current_stage || null, pages_done: s.pages_done ?? null, pages_total: s.pages_total ?? s.page_count ?? null });
    if (['complete', 'failed', 'capped'].includes(s.status)) break;
    if (Date.now() - t0 > timeoutMs) throw new Error(`SLP job ${job.job_id} still ${s.status} after ${Math.round(timeoutMs / 60000)} min`);
    await new Promise((z) => setTimeout(z, pollMs));
  }
  if (s.status !== 'complete') throw new Error(`SLP job ${job.job_id} ${s.status}${s.failure_code ? `: ${s.failure_code}` : ''}`);
  const res = await json(await fetchImpl(`${BASE()}/v1/jobs/${job.job_id}/result`, { headers: { ...H, Accept: 'application/json' } }));
  const md = res.markdown ?? (res.markdown_url ? await (await fetchImpl(res.markdown_url)).text() : null);
  if (!md) throw new Error(`SLP job ${job.job_id} returned no Markdown`);
  return { markdown: md, ...slpToText(md), job_id: job.job_id, score: s.score_after ?? res.score_after ?? null, cost_cents: s.cost_cents ?? null, pages: s.pages_total ?? s.page_count ?? null };
}

/** SLP's work receipt, compacted for the Observatory: what it found, what it did, how well, how long, what it cost. */
export async function slpReceipt(jobId, { fetchImpl = fetch, key = slpKey() } = {}) {
  const r = await fetchImpl(`${BASE()}/v1/jobs/${jobId}/receipt`, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return { narrative: j.narrative || null, warnings: (j.warnings || []).slice(0, 5),
    document: { type: j.document?.type, pages: j.document?.page_count, language: j.document?.language, script: j.document?.script, text_layer: j.document?.has_text_layer, garbled_layer: j.document?.garbled_text_layer },
    quality: { before: j.quality?.before ?? null, after: j.quality?.after ?? null, retrievable_after: j.quality?.retrievable_after ?? null },
    processing: { ms: j.processing?.duration_ms ?? null, cost_usd: j.processing?.cost_usd ?? null, method: j.processing?.method_summary || null,
      engines: j.processing?.engines_used || [], pages_vision: j.processing?.pages_vision ?? 0, pages_escalated: j.processing?.pages_escalated ?? 0 } };
}
