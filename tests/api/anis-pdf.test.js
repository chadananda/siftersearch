// Anís document modality (Chad 11-10): Jev's document/delivery choices, the PDF renderer (real file: pages, table text, QR
// images, links), the documents service (unguessable key, mail = approval draft) and the turn paths on fakes (no Anthropic).
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDocumentProxy, extractText } from 'unpdf';
import jsQR from 'jsqr';
import PDFDocument from 'pdfkit';
import { setCacheDir, qrMatrix, drawQr, shortUrl, qrSvgPath, runsOf, stats, resetCache } from '../../api/lib/qr.js';
import { renderPdf, runs } from '../../api/lib/assistant/pdf/render.js';
import { makeDocuments, DOC_TEXT } from '../../api/lib/assistant/pdf/documents.js';
import { reportOutbox, offerStore } from '../../api/lib/assistant/deep-report.js';
import { triageMessage, DOCUMENTS, DELIVERIES, DOCUMENT_Q, T } from '../../api/lib/assistant/triage.js';
import { backupQuestions } from '../../api/lib/assistant/jev-backup.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const TIMELINE = `Here is the timeline, oldest first.

| Date | Event | Source |
|---|---|---|
| 1817 | Bahá'u'lláh born at Ṭihrán | [*'Abbás Effendi*](https://oceanlibrary.com/abbas-effendi/?paraId=p21&selectionString=a.b) |
| 23 May 1844 | The Báb declares His mission in Shiraz | Shoghi Effendi, [*God Passes By*](https://oceanlibrary.com/god-passes-by/) |
| 1892 | Bahá'u'lláh passes away near 'Akká | [*God Passes By*](https://oceanlibrary.com/god-passes-by/) again |

**The Báb.** He proclaimed *"His twofold mission"* ([God Passes By, #4](https://oceanlibrary.com/god-passes-by/?paraId=p4)).

> The arrival of Bahá'u'lláh in 'Akká marks the opening of the last phase.

- first point
- second point

1. one
2. two
`;
const parse = async (buf) => { const pdf = await getDocumentProxy(new Uint8Array(buf)); const { text } = await extractText(pdf, { mergePages: true }); return { pages: pdf.numPages, text }; };
const count = (buf, re) => (buf.toString('latin1').match(re) || []).length;

describe('renderPdf', () => {
  it('a timeline reply becomes a real PDF: parses, has the table text, links, QR images, page numbers', async () => {
    const buf = await renderPdf({ title: "Timeline of the ministries", markdown: TIMELINE, date: new Date('2026-11-10T12:00:00Z') });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const { pages, text } = await parse(buf);
    expect(pages).toBeGreaterThanOrEqual(1);
    for (const w of ['Timeline of the ministries', '1844', 'Shiraz', 'Ṭihrán', 'Akká', 'Sources', 'Page 1 of']) expect(text).toContain(w);
    // QR codes are vector paths (only the logo is an image); every link clickable (5 link uses + 2 numbers + brand link)
    expect(count(buf, /\/Subtype \/Image/g)).toBeLessThanOrEqual(2);   // the logo + its alpha mask
    expect(stats.encoded + stats.memHits + stats.diskHits).toBeGreaterThanOrEqual(4);   // 3 sources + the closing code
    expect(count(buf, /\/Subtype \/Link/g)).toBeGreaterThanOrEqual(6);
    expect(buf.toString('latin1')).toContain('oceanlibrary.com/god-passes-by');
  });
  it('a long answer paginates and every page carries the header and "Page n of N"', async () => {
    const md = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\nParagraph ${i} ${'words '.repeat(60)}`).join('\n\n');
    const { pages, text } = await parse(await renderPdf({ title: 'Long', markdown: md }));
    expect(pages).toBeGreaterThan(3);
    expect(text).toContain(`Page ${pages} of ${pages}`);
  });
  it('characters no bundled font covers are dropped, never a broken glyph; diacritics kept', () => {
    expect(runs('Bahá’í ḥ ص', 'r').map((r) => r.text).join('')).toBe('Bahá’í ḥ ');
  });
  it('empty markdown still yields a valid one-page document', async () => {
    expect((await parse(await renderPdf({ title: 'x', markdown: '' }))).pages).toBe(1);
  });
});

describe('documents service', () => {
  const mk = (extra = {}) => { const up = []; const d = makeDocuments({ upload: async (k, b) => { up.push({ k, b }); return `https://files.example/${k}`; }, outbox: reportOutbox(mkdtempSync(join(tmpdir(), 'ob-'))), store: offerStore(mkdtempSync(join(tmpdir(), 'of-'))), ...extra }); return { d, up }; };
  it('creates the PDF under an unguessable key and returns the link', async () => {
    const { d, up } = mk();
    const a = await d.create({ title: 'Timeline of the Báb', markdown: TIMELINE }), b = await d.create({ title: 'Timeline of the Báb', markdown: TIMELINE });
    expect(a.file_url).toMatch(/^https:\/\/files\.example\/anis\/pdf\/[a-f0-9]{32}\/anis-timeline-of-the-bab\.pdf$/);
    expect(a.key).not.toBe(b.key);
    expect(up.find((x) => x.k.endsWith('.pdf')).b.subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('the PDF carries its own address (the share QR on its last page, 11-13): the URL it is stored under', async () => {
    const seen = [];
    const { d } = mk({ publicUrl: (k) => `https://files.example/${k}`, render: async (o) => { seen.push(o.pdfUrl); return Buffer.from('%PDF-x'); } });
    const doc = await d.create({ title: 'T', markdown: 'x', cacheKey: 'k1' });
    expect(seen[0]).toBe(doc.url);
    expect((await renderPdf({ title: 'T', markdown: 'x', pdfUrl: doc.url })).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('no storage → null (never a fake link)', async () => {
    expect(await mk({ upload: async () => null }).d.create({ title: 't', markdown: 'x' })).toBeNull();
  });
  it('email = an approval draft with the link in the report outbox; direct mode sends', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ob-')); const ob = reportOutbox(dir);
    const { d } = mk({ outbox: ob });
    const doc = await d.create({ title: 'T', markdown: 'x' });
    expect(await d.email(doc, 'a@b.org')).toBe('drafted');
    const [m] = await ob.list(); expect(m).toMatchObject({ to: 'a@b.org' }); expect(m.html).toContain(doc.url);
    const sent = []; const { d: dd } = mk({ mode: 'direct', sendMail: async (x) => sent.push(x) });
    expect(await dd.email(doc, 'a@b.org')).toBe('sent'); expect(sent[0].text).toContain(doc.url);
  });
});

describe('Jev reads the document wish (never words)', () => {
  const capture = (answers) => { const c = {}; c.fetch = async (_u, init) => { c.body = JSON.parse(init.body); return { ok: true, json: async () => ({ answers }) }; }; return c; };
  const base = { malicious: { noul: 0.01 }, complete: { noul: 0.99 }, stop_request: { noul: 0.01 }, kind: { choice: 'research', confidence: 0.9 } };
  it('asks document + delivery as typed choices and returns them', async () => {
    const c = capture({ ...base, document: { choice: 'pdf_new', confidence: 0.9 }, delivery: { choice: 'email', confidence: 0.8 } });
    const t = await triageMessage([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }, { role: 'user', content: 'send it as a pdf' }], { apiKey: 'k', fetchImpl: c.fetch });
    expect(Object.keys(c.body.questions.document.criteria)).toEqual(['text', 'pdf_previous', 'pdf_new']);
    expect(c.body.questions.document.instructions).toBe(DOCUMENT_Q);
    expect(Object.keys(c.body.questions.delivery.criteria)).toEqual(Object.keys(DELIVERIES));
    expect(t.document).toEqual({ choice: 'pdf_new', confidence: 0.9 }); expect(t.delivery.choice).toBe('email');
  });
  it('a first message cannot ask for the previous reply as a document', async () => {
    const c = capture(base);
    await triageMessage([{ role: 'user', content: 'timeline as a pdf' }], { apiKey: 'k', fetchImpl: c.fetch });
    expect(Object.keys(c.body.questions.document.criteria)).toEqual(['text', 'pdf_new']);
    expect(backupQuestions({ first: false }).document.options).toBe(DOCUMENTS);
  });
});

describe('turns on fakes', () => {
  const t = (o) => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, ...o });
  const harness = ({ triage, participant = { id: 'sess_1' }, channel } = {}) => {
    const calls = { respond: 0, create: [], email: [] };
    const deps = { open: async () => ({ conversationId: 'conv_1', round: 0 }), close: async () => {}, fail: async () => {}, triage: async () => triage, outputCheck: async () => 0.01,
      respond: async () => { calls.respond++; return { reply: TIMELINE, citations: [], retrieved: [], plan: { shape: 'timeline' }, timings: {} }; }, strikes: makeStrikes(), sleep: async () => {},
      documents: { create: async (a) => { calls.create.push(a); return { url: 'https://files.example/d.pdf', key: 'k', title: a.title }; }, email: async (doc, to) => { calls.email.push(to); return 'drafted'; }, last: async () => null, remember: async () => {} } };
    const events = [];
    return { calls, events, run: (messages) => anisTurn({ messages, participant, clientKey: 's', onEvent: (e) => events.push(e), deps, ...(channel ? { channel } : {}) }) };
  };
  const thread = [{ role: 'user', content: 'Give me a timeline of the Báb' }, { role: 'assistant', content: TIMELINE }, { role: 'user', content: 'can I have that as a printable PDF?' }];
  it('pdf_previous: renders the earlier reply with ZERO research and answers with the download link', async () => {
    const h = harness({ triage: t({ document: { choice: 'pdf_previous', confidence: 0.9 }, delivery: { choice: 'link', confidence: 0.9 }, features: {} }) });
    const r = await h.run(thread);
    expect(h.calls.respond).toBe(0);
    expect(h.calls.create[0]).toMatchObject({ title: 'Give me a timeline of the Báb', markdown: TIMELINE });
    expect(r).toMatchObject({ status: 'document' }); expect(r.reply).toContain('https://files.example/d.pdf');
  });
  it('pdf_previous by email with a known address: mails the link; unknown address: link + asks', async () => {
    const tri = t({ document: { choice: 'pdf_previous', confidence: 0.9 }, delivery: { choice: 'email', confidence: 0.9 }, features: {} });
    const a = harness({ triage: tri, participant: { id: 's', email: 'reader@example.org' } }); const ra = await a.run(thread);
    expect(a.calls.email).toEqual(['reader@example.org']); expect(ra.reply).toContain('reader@example.org');
    const b = harness({ triage: tri }); const rb = await b.run(thread);
    expect(b.calls.email).toEqual([]); expect(rb.reply).toContain('tell me the address');
  });
  it('pdf_new: researches as usual, then appends the PDF link to the reply; text choice adds nothing', async () => {
    const h = harness({ triage: t({ document: { choice: 'pdf_new', confidence: 0.9 }, features: { first: true } }) });
    const r = await h.run([{ role: 'user', content: 'Timeline of the Báb as a PDF please' }]);
    expect(h.calls.respond).toBe(1); expect(r.reply).toContain(TIMELINE.slice(0, 30)); expect(r.reply).toContain('[Download the PDF](https://files.example/d.pdf)');
    expect(h.calls.create[0].markdown).toBe(TIMELINE);   // the PDF holds the answer, not the link line
    const p = harness({ triage: t({ document: { choice: 'text', confidence: 0.99 } }) }); const rp = await p.run([{ role: 'user', content: 'Timeline of the Báb' }]);
    expect(p.calls.create).toHaveLength(0); expect(rp.reply).not.toContain('Download');
  });
  it('a low-confidence document wish is ignored', async () => {
    const h = harness({ triage: t({ document: { choice: 'pdf_new', confidence: T.document - 0.2 } }) });
    await h.run([{ role: 'user', content: 'timeline' }]); expect(h.calls.create).toHaveLength(0);
  });
  it('DOC_TEXT carries a markdown link the chat renders', () => expect(DOC_TEXT.link('https://x/y.pdf')).toBe('Here is your document, ready to print or save: [Download the PDF](https://x/y.pdf).'));
});

describe('qr.js: cached vector QR', () => {
  const URL1 = 'https://oceanlibrary.com/god-passes-by_shoghi-effendi/?paraId=para_416&selectionString=god_passes_by_ocean_en_eb.0~god_passes_by_ocean_en_eb.1417';
  // rasterize the matrix (quiet zone 4, 6 px/module) and decode it with an independent decoder
  const decode = (m) => { const q = 4, s = 6, n = (m.size + 2 * q) * s, px = new Uint8ClampedArray(n * n * 4).fill(255);
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.data[y * m.size + x]) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = (((y + q) * s + dy) * n + (x + q) * s + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    return jsQR(px, n, n)?.data; };
  it('the encoded matrix decodes back to the URL (full, shortened, and a non-ASCII one)', () => {
    for (const u of [URL1, shortUrl(URL1), 'https://oceanlibrary.com/the-kitáb-i-aqdas?paraId=p9']) expect(decode(qrMatrix(u))).toBe(u);
  });
  it('same URL = cache hit, no re-encode; a cold process reads the disk cache', () => {
    setCacheDir(mkdtempSync(join(tmpdir(), 'qr2-'))); resetCache(); qrMatrix(URL1); qrMatrix(URL1); qrMatrix(URL1);
    expect(stats).toMatchObject({ encoded: 1, memHits: 2, diskHits: 0 });
    resetCache(); const m = qrMatrix(URL1);   // memory cold, disk warm
    expect(stats).toMatchObject({ encoded: 0, diskHits: 1 }); expect(decode(m)).toBe(URL1);
  });
  it('shortUrl drops the highlight range and a slash before the query, keeps paraId; other URLs unchanged', () => {
    expect(shortUrl(URL1)).toBe('https://oceanlibrary.com/god-passes-by_shoghi-effendi?paraId=para_416');
    expect(shortUrl('https://oceanlibrary.com/call-to-the-nations_shoghi-effendi/')).toBe('https://oceanlibrary.com/call-to-the-nations_shoghi-effendi');
    expect(shortUrl('not a url')).toBe('not a url');
    expect(shortUrl(URL1).length).toBeLessThan(URL1.length / 1.8);
  });
  it('the SVG path covers exactly the dark modules; runs merge horizontally', () => {
    const m = qrMatrix('https://oceanlibrary.com/x'), dark = m.data.reduce((a, b) => a + b, 0);
    expect(runsOf(m).reduce((a, [, , l]) => a + l, 0)).toBe(dark);
    expect(qrSvgPath('https://oceanlibrary.com/x').d.startsWith('M')).toBe(true);
  });
  it('40 codes on one printed page: renders, timed cold then warm', async () => {
    setCacheDir(mkdtempSync(join(tmpdir(), 'qr3-'))); resetCache();
    const page = async (urls) => { const doc = new PDFDocument({ size: 'LETTER' }); const ch = []; doc.on('data', (c) => ch.push(c)); const end = new Promise((r) => doc.on('end', r));
      urls.forEach((u, i) => drawQr(doc, u, 40 + (i % 8) * 66, 40 + Math.floor(i / 8) * 66, 51)); doc.end(); await end; return Buffer.concat(ch).length; };
    const urls = Array.from({ length: 40 }, (_, i) => `https://oceanlibrary.com/book-${i}_author?paraId=para_${1000 + i}&selectionString=a.0~a.${i}`);
    let t = performance.now(); const bytes = await page(urls); const cold = performance.now() - t;
    t = performance.now(); await page(urls); const warm = performance.now() - t;
    console.log(`QR page of 40: cold ${cold.toFixed(1)} ms, warm ${warm.toFixed(1)} ms, ${bytes} bytes`);
    expect(stats.encoded).toBe(40); expect(bytes).toBeLessThan(200000);
  });
});

describe('transliteration coverage', () => {
  it("every text style draws all of Bahá'í transliteration as written, no letter dropped or replaced", () => {
    const t = 'Bahá’u’lláh ‘Abdu’l-Bahá Ḥusayn Ṭáhirih Ṣádiq Ẓuhúr Ḍiyá’ K͟hán S͟hoghi Lawḥ-i-Aḥmad Kitáb-i-Íqán ÁÍÚ'.normalize('NFC');
    for (const style of ['r', 'b', 'i', 'h', 's']) expect(runs(t, style).map((x) => x.text).join(''), style).toBe(t);
  });
});

describe('side-by-side: a row taller than the page (11-13: the Tablet of Aḥmad verse 6 started its English a page before its Arabic)', () => {
  it('both columns break together: each page holds the start of both, and the end of both', async () => {
    const { buildSideBySide, toMarkdown } = await import('../../api/lib/assistant/widgets/side-by-side.js');
    const long = (tag, w) => `${tag}START ${Array.from({ length: 900 }, (_, i) => `${w}${i}`).join(' ')} ${tag}END`;
    const data = buildSideBySide([
      { id: 1, role: 'original', language: 'de', document_id: 5, paragraph_index: 0, text: 'Kurzer Vers am Anfang.' },
      { id: 2, role: 'original', language: 'de', document_id: 5, paragraph_index: 1, text: long('ORIG', 'wort') },
      { id: 11, role: 'translation', language: 'en', document_id: 6, paragraph_index: 0, aligned_to: [1], text: 'A short verse first.' },
      { id: 12, role: 'translation', language: 'en', document_id: 6, paragraph_index: 1, aligned_to: [2], text: long('ENG', 'word') },
    ]);
    const buf = await renderPdf({ title: 'Tall row', markdown: `<!-- widget:${data.id} -->\n\n${toMarkdown(data)}`, widgets: [data] });
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: false });
    const page = (s) => text.findIndex((t) => t.includes(s));
    expect(page('ORIGSTART')).toBeGreaterThanOrEqual(0);
    expect(page('ENGSTART')).toBe(page('ORIGSTART'));
    expect(page('ENGEND')).toBe(page('ORIGEND'));
    expect(page('ORIGEND')).toBeGreaterThan(page('ORIGSTART'));
  });
});
