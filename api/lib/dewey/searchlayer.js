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
  // page markers: "<!-- pdf:2 -->" or "<!-- pdf:2, pg:98 -->" → the ingester's <pb n="2"/> (the PDF page — what a link
  // into the original scan opens; the print page rides along as data-pg for citations)
  let text = (fm ? s.slice(fm[0].length) : s).replace(/<!--\s*pdf:(\d+)(?:\s*,\s*pg:([\w-]+))?\s*-->/g, (m, pdf) => `<pb n="${pdf}"/>`);
  return { meta, text: rejoinLines(text).replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * SLP ends a block at every printed LINE ("There were probably fewer than 6,000 ⏎⏎ Baha'is in the United States"), and
 * the library splits paragraphs on blank lines — one sentence became several paragraphs (10-18). A block that does not end
 * a sentence is joined to the next when that one continues it (starts lower-case, with a digit, or the previous ends with a
 * hyphen); headings, list items, footnotes and page markers stay as they are. Pure.
 */
export function rejoinLines(text) {
  const blocks = String(text).split(/\n{2,}/);
  const out = [];
  for (const b0 of blocks) {
    const b = b0.trim();
    if (!b) continue;
    const prev = out.at(-1);
    const keep = (x) => /^(#|<pb|[*\-•]\s|\d+[.)]\s|>)/.test(x);
    const open = prev && !keep(prev) && !/[.!?:;"”’)\]]$/.test(prev);
    // a broken line of RUNNING TEXT (5+ words, mostly lower case) continues even into a capital ("…fewer than 6,000 ⏎⏎
    // Baha'is in…"); a Title-Case block ("The Making of the Babi Movement in Iran") is a heading and stays
    const words = prev ? prev.split(/\s+/) : [];
    const running = words.length >= 5 && words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length < 0.6;
    const cont = !keep(b) && (/^[\p{Ll}\d(“"‘'—–-]/u.test(b) || running);
    if (open && (cont || /-$/.test(prev))) out[out.length - 1] = /-$/.test(prev) ? prev.replace(/-$/, '') + b : `${prev} ${b}`;
    else out.push(b);
  }
  return out.join('\n\n');
}

/**
 * Is SLP's text fit to import? → { ok, why[], words, perPage, ratio, sampleFound }.
 *  - real words (Latin text): ≥ 75% word shapes
 *  - enough text: ≥ 40 words per page (a book page has hundreds)
 *  - CONSISTENT with what we read ourselves: ≥ 40% of the distinct 5+-letter words of the pages our preliminary OCR read
 *    are in it — catches a wrong file, garbled handwriting, a page that came back empty
 */
/**
 * IS IT THE WHOLE DOCUMENT? (Chad 10-18: "I see lots of books with just the first pages and we do not want to add a book
 * if it is only a sample of the beginning".) The pooled sample score and SLP's own page count can't see a result that stops
 * early, so two measures against the PDF itself: (1) SLP's page markers (<pb n>) must reach the end — the last page with text
 * at least 85% of the way through (or within 2 pages), and text on most pages; (2) our own sampled pages from the LAST third
 * must be found in its text. text: slpToText's text; sampleText: ocrSample's "[page N]" sections. Pure.
 */
export function completeness(text, { pdfPages = null, sampleText = null } = {}) {
  const why = [];
  const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // pages with text, by marker
  const withText = new Set();
  const parts = String(text || '').split(/<pb n="(\d+)"\/>/);
  for (let k = 1; k < parts.length; k += 2) if ((parts[k + 1] || '').split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length >= 15) withText.add(Number(parts[k]));
  const lastPage = withText.size ? Math.max(...withText) : null;
  if (pdfPages && pdfPages > 3 && lastPage != null && lastPage < pdfPages * 0.85 && pdfPages - lastPage > 2)
    why.push(`only the beginning: its text stops at page ${lastPage} of ${pdfPages}`);
  if (pdfPages && pdfPages > 6 && withText.size && withText.size < pdfPages * 0.5)
    why.push(`text on only ${withText.size} of ${pdfPages} pages`);
  // our own late pages
  let lateFound = null;
  if (sampleText && pdfPages > 6) {
    const theirs = new Set(fold(text).match(/\p{L}{5,}/gu) || []);
    const scores = [];
    for (const m of String(sampleText).matchAll(/\[page (\d+)\]\n([\s\S]*?)(?=\n\[page \d+\]|$)/g)) {
      if (Number(m[1]) < pdfPages * 0.67) continue;
      const ours = new Set(fold(m[2]).match(/\p{L}{5,}/gu) || []);
      if (ours.size >= 12) scores.push([...ours].filter((w) => theirs.has(w)).length / ours.size);
    }
    if (scores.length) {
      lateFound = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
      if (lateFound < 0.3) why.push(`the last pages we read ourselves are not in it (${Math.round(lateFound * 100)}% of their words found)`);
    }
  }
  return { ok: !why.length, why, lastPage, pagesWithText: withText.size, pdfPages, lateFound };
}

export function slpCheck(text, { pages = 1, sampleText = null, pdfPages = null } = {}) {
  const body = String(text || '').replace(/<pb[^>]*\/>/g, ' ');
  const words = body.split(/\s+/).filter(Boolean).length;
  const perPage = words / Math.max(1, pdfPages || pages);
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
  // the WHOLE document, measured against the PDF's own page count (never SLP's — a truncated job reports its own pages)
  const whole = pdfPages ? completeness(text, { pdfPages, sampleText }) : null;
  if (whole) why.push(...whole.why);
  return { ok: !why.length, why, words, perPage: Math.round(perPage), ratio: ratio == null ? null : +ratio.toFixed(2), sampleFound, whole };
}

/** Cancel (delete) an SLP job. SLP answers 202 "deleted" even while it is processing; it may finish the page in hand. */
export async function slpCancel(jobId, { fetchImpl = fetch, key = slpKey() } = {}) {
  if (!jobId || !key) return { deleted: false };
  const r = await fetchImpl(`${BASE()}/v1/jobs/${jobId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  return { deleted: r.ok && j.deleted !== false, status: r.status };
}

/**
 * A PDF (a server path) → SLP's { markdown, meta, text, job_id, score, cost_cents }. Polls until done (scans: a GPU pod
 * takes 2–3 min to come up, then ~9 s a page English, ~17 s Arabic) — `timeoutMs` bounds it. fetchImpl injectable.
 */
export async function slpExtract({ path, context = '', resumeJobId = null }, { fetchImpl = fetch, key = slpKey(), pollMs = 20000, retryMs = 5000, timeoutMs = 3 * 3600000, log = () => {}, stop = async () => false } = {}) {
  if (!key) throw new Error('SearchLayerPDF is not configured (SEARCHLAYERPDF_API_KEY)');
  const H = { Authorization: `Bearer ${key}` };
  const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } };
  // every request retried on a NETWORK error (10-18: four jobs ended "fetch failed" — two uploads of 270 KB–11 MB never
  // arrived, a poll and a result fetch dropped; tower's uplink, not the files). HTTP errors are answers, not retried.
  const call = async (url, opts = {}, tries = 5) => {
    for (let k = 0; ; k++) {
      try { return await fetchImpl(url, typeof opts === 'function' ? opts() : opts); } catch (err) {
        if (k >= tries - 1) throw err;
        await new Promise((z) => setTimeout(z, Math.min(60000, retryMs * 2 ** k)));
      }
    }
  };
  const upload = async (job) => {
    const r1 = await call(job.upload_url || `${BASE()}/v1/jobs/${job.job_id}/source`, () => ({ method: 'PUT', headers: { ...H, 'Content-Type': 'application/pdf', 'Content-Length': String(statSync(path).size) },
      body: createReadStream(path), duplex: 'half' }));   // a fresh stream per attempt
    if (!r1.ok) throw new Error(`SLP upload failed (${r1.status}) for job ${job.job_id}`);
    const r2 = await call(job.process_url || `${BASE()}/v1/jobs/${job.job_id}/process`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' });
    if (!r2.ok) throw new Error(`SLP did not start job ${job.job_id} (${r2.status})`);
  };
  let r, job;
  if (resumeJobId) {
    // a job already submitted (the worker restarted while it ran): poll it — never upload and pay twice; but a job still
    // AWAITING its upload (the upload failed) gets it now
    job = { job_id: resumeJobId };
    log({ job_id: job.job_id, step: 'resumed' });
    const st = await json(await call(`${BASE()}/v1/jobs/${job.job_id}`, { headers: H }));
    if (st.status === 'awaiting_upload') { log({ job_id: job.job_id, step: 'reuploading' }); await upload(job); }
  } else {
    r = await call(`${BASE()}/v1/jobs`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ privacy: 'open', quality: 'economy', context: String(context).slice(0, 2000) }) });
    job = await json(r);
    if (!r.ok || !job.job_id) throw new Error(`SLP job not created (${r.status}): ${JSON.stringify(job).slice(0, 160)}`);
    log({ job_id: job.job_id, step: 'created' });
    await upload(job);
  }
  const t0 = Date.now();
  let s;
  for (;;) {
    s = await json(await call(`${BASE()}/v1/jobs/${job.job_id}`, { headers: H }));
    log({ job_id: job.job_id, step: s.status, stage: s.current_stage || null, pages_done: s.pages_done ?? null, pages_total: s.pages_total ?? s.page_count ?? null });
    if (['complete', 'failed', 'capped'].includes(s.status)) break;
    // the member said NO while SLP was reading it (Chad 10-18: "choosing not to add a book did not stop the SLP processing"):
    // the job is cancelled at SLP and this wait ends — its result is never fetched or used
    if (await stop()) {
      await slpCancel(job.job_id, { fetchImpl, key }).catch(() => null);
      throw Object.assign(new Error(`SLP job ${job.job_id} cancelled: the item was declined`), { cancelled: true });
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`SLP job ${job.job_id} still ${s.status} after ${Math.round(timeoutMs / 60000)} min`);
    await new Promise((z) => setTimeout(z, pollMs));
  }
  if (s.status !== 'complete') throw new Error(`SLP job ${job.job_id} ${s.status}${s.failure_code ? `: ${s.failure_code}` : ''}`);
  const res = await json(await call(`${BASE()}/v1/jobs/${job.job_id}/result`, { headers: { ...H, Accept: 'application/json' } }));
  const md = res.markdown ?? (res.markdown_url ? await (await call(res.markdown_url)).text() : null);
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
