// SearchLayerPDF for scans (Chad 10-18: "use it judiciously and check output"): SLP's Markdown → ingester text with page
// markers; the CHECK that guards import; the job's outcomes; intake sending scans to it and importing its checked text.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slpToText, slpCheck, slpExtract } from '../../api/lib/dewey/searchlayer.js';

const ROSENBERG = `---
title: "Copy of Notes of Miss Rosenberg on the reading of the Will of 'Abdu'l-Bahá"
author: "Ethel J. Rosenberg"
keywords: ["Will", "Shoghi Effendi"]
pages: 1
---

<!-- pdf:1 -->

Miss Rosenberg said, that the Will was left sealed up in a packet, and addressed in the Master's own hand to Shoghi Effendi and nothing could be done until Shoghi Effendi came and opened the packet. A very solemn meeting was appointed for the reading of the Will. There were old gray-headed men present, who had been in the Movement for many years, and if there had been the slightest doubt of the authenticity of the Will, they would have known it. The whole document was in His own hand-writing.`;

describe('slpToText', () => {
  it('reads its frontmatter and turns <!-- pdf:N --> into the ingester\'s <pb n="N"/>', () => {
    const { meta, text } = slpToText(ROSENBERG);
    expect(meta).toMatchObject({ title: "Copy of Notes of Miss Rosenberg on the reading of the Will of 'Abdu'l-Bahá", author: 'Ethel J. Rosenberg', pages: 1 });
    expect(text.startsWith('<pb n="1"/>')).toBe(true);
    expect(text).not.toMatch(/^---/);
  });
});

describe('rejoinLines — SLP breaks blocks at printed line ends', () => {
  it('joins a sentence split across blocks; keeps headings, footnotes and page markers', async () => {
    const { rejoinLines } = await import('../../api/lib/dewey/searchlayer.js');
    const t = 'There were probably fewer than 6,000\n\nBaha\'is in the United States at this time.\n\n## A heading\n\n* a footnote\n\n<pb n="2"/>\n\nA new para-\n\ngraph continues.\n\nThe Making of the Babi Movement in Iran\n\nThe book begins in Shiraz.';
    expect(rejoinLines(t)).toBe('There were probably fewer than 6,000 Baha\'is in the United States at this time.\n\n## A heading\n\n* a footnote\n\n<pb n="2"/>\n\nA new paragraph continues.\n\nThe Making of the Babi Movement in Iran\n\nThe book begins in Shiraz.');
  });
  it('a print page in the marker keeps the PDF page for the link into the scan', () => {
    expect(slpToText('<!-- pdf:2, pg:98 -->\n\nText.').text).toBe('<pb n="2"/>\n\nText.');
  });
});

describe('slpCheck — nothing is imported unchecked', () => {
  const { text } = slpToText(ROSENBERG);
  it('passes clean text that contains the pages we read ourselves', () => {
    const own = 'the Will was left sealed up in a packet, and addressed in the Masters own hand to Shoghi Effendi and nothing could be done until Shoghi Effendi came and opened the packet. A very solemn meeting was appointed for the reading of the Will. There were old gray headed men present';
    expect(slpCheck(text, { pages: 1, sampleText: own })).toMatchObject({ ok: true });
  });
  it('fails when the pages we read are not in it (a wrong file, a lost page)', () => {
    const other = 'An entirely different document about the gardens on Mount Carmel and the terraces built over many decades by thousands of workers from many lands, with stone brought from Italy and plants from every continent of the world. '.repeat(2);
    const r = slpCheck(text, { pages: 1, sampleText: other });
    expect(r.ok).toBe(false);
    expect(r.why.join(' ')).toMatch(/not in its text/);
  });
  it('fails OCR noise and too little text per page', () => {
    expect(slpCheck('uld ooo;o aiM1 r thea ~lk bout 9a.hs i Cau SOGle evar la:Ul aevere illiness fhe Xinneye Uuy lfaxwel.l oame tb~ !or snr~rise pleaours '.repeat(3), { pages: 1 }).ok).toBe(false);
    expect(slpCheck(text, { pages: 50 }).why.join(' ')).toMatch(/too little text/);
  });
});

describe('slpExtract — the SLP contract', () => {
  it('creates an open job, uploads, starts, polls, fetches the Markdown', async () => {
    const { writeFileSync, mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const f = `${mkdtempSync(`${tmpdir()}/slp-`)}/scan.pdf`; writeFileSync(f, '%PDF-1.4 x');
    const calls = []; let polls = 0;
    const fetchImpl = async (url, opts = {}) => {
      calls.push([opts.method || 'GET', url.replace(/^https:\/\/[^/]+/, '')]);
      const ok = (o, status = 200) => ({ ok: true, status, text: async () => (typeof o === 'string' ? o : JSON.stringify(o)) });
      if (url.endsWith('/v1/jobs') && opts.method === 'POST') { expect(JSON.parse(opts.body)).toMatchObject({ privacy: 'open', quality: 'economy' }); return ok({ job_id: 'j1', upload_url: 'https://slp/v1/jobs/j1/source', process_url: 'https://slp/v1/jobs/j1/process' }, 201); }
      if (url.endsWith('/source')) return ok({ uploaded: true });
      if (url.endsWith('/process')) return ok({ status: 'processing' }, 202);
      if (url.endsWith('/v1/jobs/j1')) return ok({ status: ++polls < 2 ? 'processing' : 'complete', score_after: 95, cost_cents: 1, pages_total: 1 });
      if (url.endsWith('/result')) return ok({ markdown_url: 'https://slp/out.md' });
      if (url.endsWith('/out.md')) return ok(ROSENBERG);
      throw new Error(`unexpected ${url}`);
    };
    const r = await slpExtract({ path: f, context: 'Rosenberg' }, { fetchImpl, key: 'k', pollMs: 1 });
    expect(r).toMatchObject({ job_id: 'j1', score: 95, cost_cents: 1, pages: 1, meta: { author: 'Ethel J. Rosenberg' } });
    expect(calls.map(([m]) => m)).toEqual(['POST', 'PUT', 'POST', 'GET', 'GET', 'GET', 'GET']);
  });
});

describe('slpExtract survives a flaky network and a lost upload', () => {
  it('retries a network error; a resumed job still awaiting its upload is uploaded', async () => {
    const { writeFileSync, mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const f = `${mkdtempSync(`${tmpdir()}/slp-`)}/scan.pdf`; writeFileSync(f, '%PDF-1.4 x');
    const calls = []; let flaky = 1, polls = 0;
    const ok = (o) => ({ ok: true, status: 200, text: async () => (typeof o === 'string' ? o : JSON.stringify(o)) });
    const fetchImpl = async (url, opts = {}) => {
      calls.push(`${opts.method || 'GET'} ${url.replace(/^https:\/\/[^/]+/, '')}`);
      if (url.endsWith('/source') && flaky-- > 0) throw new TypeError('fetch failed');
      if (url.endsWith('/v1/jobs/j8')) return ok({ status: polls++ === 0 ? 'awaiting_upload' : 'complete', pages_total: 1 });
      if (url.endsWith('/source') || url.endsWith('/process')) return ok({});
      if (url.endsWith('/result')) return ok({ markdown: ROSENBERG });
      throw new Error(`unexpected ${url}`);
    };
    const r = await slpExtract({ path: f, resumeJobId: 'j8' }, { fetchImpl, key: 'k', pollMs: 1, retryMs: 1 });
    expect(r.job_id).toBe('j8');
    expect(calls.filter((c) => c.startsWith('PUT'))).toHaveLength(2);   // the failed upload was retried
    expect(calls).toContain('POST /v1/jobs/j8/process');
  });
});

describe('slpExtract resumes a submitted job after a restart', () => {
  it('polls the job it already has — no create, no upload, no second charge', async () => {
    const calls = [];
    const ok = (o) => ({ ok: true, status: 200, text: async () => (typeof o === 'string' ? o : JSON.stringify(o)) });
    const fetchImpl = async (url, opts = {}) => { calls.push(opts.method || 'GET');
      if (url.endsWith('/v1/jobs/j7')) return ok({ status: 'complete', pages_total: 1 });
      if (url.endsWith('/result')) return ok({ markdown: ROSENBERG });
      throw new Error(`unexpected ${opts.method} ${url}`); };
    const r = await slpExtract({ path: '/nope.pdf', resumeJobId: 'j7' }, { fetchImpl, key: 'k', pollMs: 1 });
    expect(r.job_id).toBe('j7');
    expect(calls).toEqual(['GET', 'GET', 'GET']);   // status (resume check), poll, result
  });
});

// ── the ops job ──
const items = [];
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  listItems: vi.fn(async () => items),
  getItem: vi.fn(async (id) => items.find((i) => i.id === id)),
  updateItem: vi.fn(async (id, f, why) => { const i = items.find((x) => x.id === id); Object.assign(i, f); (i.log ||= []).push({ state: i.state, why }); return i; }),
}));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn(async () => {}) }));
const { deweyOcrJob } = await import('../../api/lib/ops/dewey-ocr-job.js');

describe('dewey-ocr job', () => {
  beforeEach(() => { items.length = 0; items.push({ id: 7, title: 'Rosenberg notes', original_path: '/in/scan.pdf', sha256: 'abc', identified: {}, state: 'needs-ocr' }); });
  const base = (over = {}) => ({ pdfInfo: async () => ({ pages: 1 }), save: async () => {}, receipt: async () => ({ narrative: 'read with 4 engines' }), appraise: async () => ({ title: 'Rosenberg notes' }), sample: async () => ({ text: slpToText(ROSENBERG).text }), queue: vi.fn(async () => {}),
    extract: async () => ({ markdown: ROSENBERG, ...slpToText(ROSENBERG), job_id: 'j1', score: 95, cost_cents: 0, pages: 1 }), ...over });
  it('a passing result is kept and intake runs again on it', async () => {
    const d = base();
    const r = await deweyOcrJob({ id: 7 }, d);
    expect(r.state).toBe('source');
    expect(items[0].identified.slp).toMatchObject({ job_id: 'j1', pages: 1 });
    expect(d.queue).toHaveBeenCalledWith('dewey-intake', { id: 7 }, 'dewey-ocr');
  });
  it('a failing check waits for a person — never imported', async () => {
    const d = base({ sample: async () => ({ text: 'An entirely different document about gardens and terraces on Mount Carmel built over many decades by thousands of workers from many lands with stone from Italy. '.repeat(3) }) });
    const r = await deweyOcrJob({ id: 7 }, d);
    expect(r.state).toBe('needs-human');
    expect(items[0].identified.slp).toBeUndefined();
    expect(d.queue).not.toHaveBeenCalled();
  });
  it('the same work already on its way through OCR is not sent twice', async () => {
    items.unshift({ id: 3, title: 'Rosenberg Notes', state: 'needs-ocr', identified: {} });
    const r = await deweyOcrJob({ id: 7 }, base({ extract: async () => { throw new Error('must not be called'); } }));
    expect(r).toMatchObject({ state: 'needs-human', twin: 3 });
  });
  it('an untitled scan is appraised from the OCR text before import; out of scope waits for a person', async () => {
    items[0].title = 'Untitled (scan.pdf)';
    const ok = await deweyOcrJob({ id: 7 }, base({ appraise: async () => ({ title: 'Notes on the Will', author: 'Ethel Rosenberg', shelf: { religion: "Baha'i", collection: 'Pilgrim Notes' } }) }));
    expect(ok.state).toBe('source');
    expect(items[0]).toMatchObject({ title: 'Notes on the Will', author: 'Ethel Rosenberg', identified: { shelf: { collection: 'Pilgrim Notes' } } });
    items[0] = { id: 7, title: 'Untitled (scan.pdf)', original_path: '/in/scan.pdf', sha256: 'abc', identified: {}, state: 'needs-ocr' };
    const no = await deweyOcrJob({ id: 7 }, base({ appraise: async () => ({ title: 'A catalogue', recommendation: 'skip', in_scope: 'no', summary: 'a bookseller catalogue' }) }));
    expect(no).toMatchObject({ state: 'needs-human', why: 'out of scope after OCR' });
  });
  it('a SLP result on file is re-checked, not paid for again', async () => {
    items[0].identified = { slp_rejected: { path: '/ocr/abc.slp.md', job_id: 'j0', pages: 1 } };
    const r = await deweyOcrJob({ id: 7 }, base({ read: async () => ROSENBERG, extract: async () => { throw new Error('must not be called'); } }));
    expect(r.state).toBe('source');
    expect(items[0].identified.slp).toMatchObject({ job_id: 'j0', path: '/ocr/abc.slp.md' });
  });
  it('HANDWRITING SLP misread → the vision transcription is used when it passes the check', async () => {
    const vision = slpToText(ROSENBERG).text;
    const r = await deweyOcrJob({ id: 7 }, base({
      sample: async () => ({ text: vision, langs: 'vision' }),
      extract: async () => ({ markdown: 'x', text: 'Bok P-0. boy /SS Hafa Durael deanthoy and oylos Sepf. Bo man form Bhi whos sysbles ui fulap Ma ose lly aarp feast ans Bot spgtiars fue sippecl feo Cameylondinee piined. '.repeat(3), meta: {}, job_id: 'j9', pages: 1 }),
      transcribe: async () => ({ text: vision }) }));
    expect(r.state).toBe('source');
    expect(items[0].identified.slp).toMatchObject({ engine: 'vision', slp_rejected_job: 'j9' });
  });
  it('REFRESH: an imported document takes SLP\'s improved result when it agrees with our own text; re-imported in place', async () => {
    const text = slpToText(ROSENBERG).text;
    items[0] = { id: 7, title: 'Rosenberg notes', state: 'ingested', doc_id: 99, original_path: '/in/scan.pdf', sha256: 'abc',
      identified: { slp: { engine: 'vision', path: '/ocr/abc.vision.md', slp_rejected_job: 'j5' } } };
    const d = base({ read: async () => text, extract: async ({ resumeJobId }) => ({ markdown: ROSENBERG, ...slpToText(ROSENBERG), job_id: resumeJobId, score: 95, pages: 1 }) });
    const r = await deweyOcrJob({ id: 7, refresh: true }, d);
    expect(r).toMatchObject({ refreshed: true });
    expect(items[0].identified.slp).toMatchObject({ job_id: 'j5' });
    expect(items[0].identified.slp_previous).toMatchObject({ engine: 'vision' });
    expect(d.queue).toHaveBeenCalledWith('dewey-reimport', { docs: [99] }, 'dewey-ocr');
  });
  it('a scan over the page limit is not sent automatically', async () => {
    const r = await deweyOcrJob({ id: 7 }, base({ pdfInfo: async () => ({ pages: 969 }), extract: async () => { throw new Error('must not be called'); } }));
    expect(r).toMatchObject({ state: 'needs-human', pages: 969 });
  });
});

// THE WHOLE DOCUMENT (Chad 10-18: "lots of books with just the first pages … we do not want to add … only a sample")
import { completeness } from '../../api/lib/dewey/searchlayer.js';
describe('completeness', () => {
  const page = (n) => `<pb n="${n}"/>\n\n${Array.from({ length: 40 }, (_, i) => `word${n}x${i} lorem`).join(' ')} the chapter continues here with more words`;
  const book = (upTo) => Array.from({ length: upTo }, (_, i) => page(i + 1)).join('\n\n');
  it('a result that stops at page 20 of 300 is only the beginning', () => {
    const c = completeness(book(20), { pdfPages: 300 });
    expect(c.ok).toBe(false);
    expect(c.why.join()).toMatch(/stops at page 20 of 300/);
  });
  it('the whole book (a blank last page or two allowed) passes', () => {
    expect(completeness(book(298), { pdfPages: 300 }).ok).toBe(true);
    expect(completeness(book(9), { pdfPages: 10 }).ok).toBe(true);
  });
  it('our own late pages missing from its text fail it', () => {
    const late = '[page 250]\n' + 'Concluding remarks regarding everlasting sovereignty, providence, steadfastness, magnanimity, tranquility, benevolence, consolation, faithfulness, radiance, heavenly, kingdom, assemblies';
    const c = completeness('<pb n="1"/>\n\nnothing alike', { pdfPages: 260, sampleText: late });
    expect(c.lateFound).toBe(0);
    expect(c.why.join()).toMatch(/last pages we read ourselves/);
  });
});

describe('slpExtract stop', () => {
  it('declined while SLP reads it → the job is cancelled at SLP and the wait ends', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, opts = {}) => { calls.push(`${opts.method || 'GET'} ${url}`);
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'processing' }), json: async () => ({ deleted: true }) }; });
    await expect(slpExtract({ path: '/x.pdf', resumeJobId: 'job_9' }, { fetchImpl, key: 'k', pollMs: 1, stop: async () => true })).rejects.toMatchObject({ cancelled: true });
    expect(calls.some((c) => c.startsWith('DELETE') && c.endsWith('/v1/jobs/job_9'))).toBe(true);
    expect(calls.some((c) => c.includes('/result'))).toBe(false);
  });
});

describe('a drain never waits on SearchLayerPDF (10-21)', () => {
  it('slpExtract stops waiting when the service drains — the job is NOT cancelled at SLP', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, opts = {}) => { calls.push(`${opts.method || 'GET'} ${url}`);
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'processing' }) }; });
    await expect(slpExtract({ path: '/x.pdf', resumeJobId: 'job_d' }, { fetchImpl, key: 'k', pollMs: 1, yieldNow: () => true })).rejects.toMatchObject({ yielded: true, job_id: 'job_d' });
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false);
  });
  it('the OCR job yields with the SLP job id on the item, and the next run resumes that job', async () => {
    items.length = 0; items.push({ id: 8, title: 'Long scan', original_path: '/in/long.pdf', sha256: 'def', identified: {}, state: 'needs-ocr' });
    const seen = [];
    const d = { pdfInfo: async () => ({ pages: 1 }), save: async () => {}, receipt: async () => null, sample: async () => ({ text: slpToText(ROSENBERG).text }), queue: vi.fn(async () => {}), appraise: async () => ({ title: 'Long scan' }), draining: () => true,
      extract: async ({ resumeJobId }, { yieldNow }) => { seen.push(resumeJobId); if (yieldNow()) throw Object.assign(new Error('draining'), { yielded: true, job_id: 'job_long' }); return { markdown: ROSENBERG, ...slpToText(ROSENBERG), job_id: 'job_long', pages: 1 }; } };
    expect(await deweyOcrJob({ id: 8 }, d)).toMatchObject({ yielded: true, job_id: 'job_long' });
    expect(items[0].identified.slp_progress.job_id).toBe('job_long');
    expect(await deweyOcrJob({ id: 8 }, { ...d, draining: () => false })).toMatchObject({ state: 'source', job_id: 'job_long' });
    expect(seen).toEqual([null, 'job_long']);
  });
});

describe('slpExtract — SLP-side failure and cancel', () => {
  it('a job failed inside SLP is reprocessed once under the same id, then its result is used', async () => {
    let n = 0;
    const calls = [];
    const fetchImpl = vi.fn(async (url, opts = {}) => {
      calls.push(`${opts.method || 'GET'} ${url}`);
      const body = url.endsWith('/result') ? { markdown: '<!-- pdf:1 -->\n\nHello world' }
        : url.endsWith('/reprocess') ? { ok: true }
        : { status: n++ < 2 ? 'failed' : 'complete', failure_code: 'fetch source (4 tries): HTTP 401', pages_total: 1 };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    });
    const out = await slpExtract({ path: '/x.pdf', resumeJobId: 'job_r' }, { fetchImpl, key: 'k', pollMs: 1 });
    expect(calls.filter((c) => c === 'POST https://searchlayerpdf.com/v1/jobs/job_r/reprocess')).toHaveLength(1);
    expect(out.markdown).toMatch(/Hello world/);
  });
  it('a cancelled job ends the wait', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'cancelled' }), json: async () => ({}) }));
    await expect(slpExtract({ path: '/x.pdf', resumeJobId: 'job_c' }, { fetchImpl, key: 'k', pollMs: 1 })).rejects.toMatchObject({ cancelled: true });
  });
});

describe('placeholderTitle', () => {
  it('a title that only says it could not be read is re-appraised from the OCR text', async () => {
    const { placeholderTitle } = await import('../../api/lib/ops/dewey-ocr-job.js');
    expect(placeholderTitle("Doctoral dissertation on 'Abdu'l-Bahá's Western travels (full title not legible in the excerpts; contents include chapters)")).toBe(true);
    expect(placeholderTitle('Untitled handwritten letter')).toBe(true);
    expect(placeholderTitle('Sirah of the Prophet Muhammad (title not stated in the excerpts)')).toBe(true);
    expect(placeholderTitle('Resurrection and Renewal')).toBe(false);
  });
});
describe('SLP awaiting_approval (10-19)', () => {
  it('a job held for approval is approved once and then read', async () => {
    let n = 0; const calls = [];
    const fetchImpl = vi.fn(async (url, opts = {}) => {
      calls.push(`${opts.method || 'GET'} ${url}`);
      const body = url.endsWith('/result') ? { markdown: '<!-- pdf:1 -->\n\nHello' } : url.endsWith('/approve') ? {} : { status: n++ < 2 ? 'awaiting_approval' : 'complete', pages_total: 1, progress: { awaiting_approval: { est_usd: 0.4 } } };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    });
    const out = await slpExtract({ path: '/x.pdf', resumeJobId: 'job_a' }, { fetchImpl, key: 'k', pollMs: 1 });
    expect(calls.filter((c) => c.endsWith('/approve'))).toHaveLength(1);
    expect(out.markdown).toMatch(/Hello/);
  });
});
