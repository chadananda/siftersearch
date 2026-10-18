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

// ── the ops job ──
const items = [];
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  getItem: vi.fn(async (id) => items.find((i) => i.id === id)),
  updateItem: vi.fn(async (id, f, why) => { const i = items.find((x) => x.id === id); Object.assign(i, f); (i.log ||= []).push({ state: i.state, why }); return i; }),
}));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn(async () => {}) }));
const { deweyOcrJob } = await import('../../api/lib/ops/dewey-ocr-job.js');

describe('dewey-ocr job', () => {
  beforeEach(() => { items.length = 0; items.push({ id: 7, title: 'Rosenberg notes', original_path: '/in/scan.pdf', sha256: 'abc', identified: {}, state: 'needs-ocr' }); });
  const base = (over = {}) => ({ pdfInfo: async () => ({ pages: 1 }), save: async () => {}, sample: async () => ({ text: slpToText(ROSENBERG).text }), queue: vi.fn(async () => {}),
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
  it('a scan over the page limit is not sent automatically', async () => {
    const r = await deweyOcrJob({ id: 7 }, base({ pdfInfo: async () => ({ pages: 969 }), extract: async () => { throw new Error('must not be called'); } }));
    expect(r).toMatchObject({ state: 'needs-human', pages: 969 });
  });
});
