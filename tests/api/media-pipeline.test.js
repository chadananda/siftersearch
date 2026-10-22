// Media pipeline pieces around the core: renditions (transcript.md / page.html), rights + signed clips, enhancement choice by
// measurement, quote span location + gates, link rows for content_source_links, the edge R2 key/headers, the API's byte
// ranges and clip budget, YouTube helpers, thumbnail licence rules, the search-latency thread governor and the scan job.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { transcriptMarkdown, pageHtml, paragraphMarkdown, youtubeAt } from '../../api/lib/media/render.js';
import { defaultPlayback, canServeFile, clipQuery, verifyClip } from '../../api/lib/media/rights.js';
import { lightChain, probeStarts, chooseAsrInput, chooseListening } from '../../api/lib/media/enhance.js';
import { locateSpan, gateOf, writerName, linkQuotes, linkTeachings } from '../../api/lib/media/quotes.js';
import { linkRows } from '../../api/lib/media/ingest.js';
import { mediaKey, r2Headers } from '../../worker/media.js';
import { byteRange, clipBudget } from '../../api/routes/media.js';
import { youtubeId, isBotCheck } from '../../api/lib/media/youtube.js';
import { okLicence, describesBahai, tileSvg, findSpeakerImage } from '../../api/lib/media/thumbs.js';
import { threadsFor } from '../../api/lib/media/tools.js';
import { parseBlockAttrs } from '../../api/services/block-parser.js';

const words = (t, t0 = 0) => t.split(' ').map((w, i) => ({ w, s: t0 + i, e: t0 + i + 1 }));
const para = (n, t, t0 = 0, spk = 'S1') => { const ws = words(t, t0); return { n, t0: ws[0].s, t1: ws[ws.length - 1].e, spk, words: ws, sentences: [[0, ws.length]] }; };
const meta = { slug: 'grossmann-world-order-2-1999', title: 'World Order 2', speaker: 'Hartmut Grossmann', language: 'en', year: 1999, duration_s: 2763, rights: { playback: 'clips' }, source: { kind: 'file' } };

describe('renditions', () => {
  const ps = [para(1, 'Bahá’u’lláh says O Son of Being love Me that I may love thee and so on.'), para(2, 'Then the next thought.', 20)];
  const quotes = [{ para: 1, i0: 2, i1: 12, url: 'https://oceanlibrary.com/x?paraId=1', cite: 'The Hidden Words, Arabic 5' }];
  it('transcript.md: frontmatter, block ids with times, quotes as links on the speaker\'s own words', () => {
    const md = transcriptMarkdown({ meta, paragraphs: ps, quotes, chapters: [{ t: 20, title: 'Next part' }] });
    expect(md).toMatch(/^---\ntitle: "World Order 2"\nauthor: "Hartmut Grossmann"/);
    expect(md).toContain('needs_segmentation: false');
    expect(md).toContain('source_url: "https://siftersearch.com/media/grossmann-world-order-2-1999"');
    expect(md).toContain('Bahá’u’lláh says [O Son of Being love Me that I may love](https://oceanlibrary.com/x?paraId=1 "The Hidden Words, Arabic 5") thee and so on.');
    expect(md).toContain('## Next part');
    const attrs = md.split('\n').find((l) => l.startsWith('{id="para_2"'));
    expect(parseBlockAttrs(attrs)).toEqual({ id: 'para_2', t0: '20.00', t1: '24.00', spk: 'S1' });
  });
  it('page.html: self-contained, every word clickable with its time, breakouts after their paragraph, YouTube link', () => {
    const html = pageHtml({ meta: { ...meta, source: { kind: 'youtube', youtube_id: 'abcdefghijk', channel: 'Sharaf' } }, paragraphs: ps, quotes,
      crs: [{ para: 1, kind: 'concept', excerpt: 'Love Me, that I may love thee.', cite: 'The Hidden Words', url: 'https://oceanlibrary.com/hw' }], clipUrl: '/api/media/x/clip-url' });
    expect(html).toContain('<span class="w" data-s="20.00" data-e="21.00">Then</span>');
    expect(html).toContain('class="play" data-t="20.00"');
    expect(html.indexOf('<aside class="cr">')).toBeGreaterThan(html.indexOf('id="p1"'));
    expect(html.indexOf('<aside class="cr">')).toBeLessThan(html.indexOf('id="p2"'));
    expect(html).toContain('Source: Sharaf on YouTube');
    expect(html).not.toMatch(/<script src=|<link rel="stylesheet"/);
    expect(html).toContain('"playback":"clips"');
  });
  it('escapes transcript text', () => {
    const html = pageHtml({ meta, paragraphs: [para(1, 'a <script>x</script> b')] });
    expect(html).not.toContain('<script>x</script>');
  });
  it('youtube links carry the time', () => {
    expect(youtubeAt({ source: { youtube_id: 'abcdefghijk' } }, 754.6)).toBe('https://www.youtube.com/watch?v=abcdefghijk&t=754s');
    expect(youtubeAt({ source: { kind: 'file' } })).toBeNull();
    expect(paragraphMarkdown(para(1, 'a [b] c'), [])).toBe('a [b] c');
  });
});

describe('rights', () => {
  it('defaults: everything full from our own copy (Chad 10-22) unless a channel record says otherwise', () => {
    expect(defaultPlayback({ sourceKind: 'youtube' })).toBe('full');
    expect(defaultPlayback({ sourceKind: 'youtube', channel: { playback: 'clips' } })).toBe('clips');
    expect(defaultPlayback({ sourceKind: 'youtube', channel: { playback: 'search' } })).toBe('search');
    expect(defaultPlayback({ sourceKind: 'file', speaker: 'Hooper Dunbar' })).toBe('full');
    expect(defaultPlayback({ sourceKind: 'file', speaker: 'Chad Jones' })).toBe('full');
  });
  it('the full audio file is served only at level full', () => {
    expect(canServeFile('full', 'web/x.ogg')).toBe(true);
    expect(canServeFile('clips', 'web/x.ogg')).toBe(false);
    expect(canServeFile('clips', 'page.html')).toBe(true);
    expect(canServeFile('full', 'original/x.mp3')).toBe(false);
    expect(canServeFile('full', 'enhanced/light.flac')).toBe(false);
  });
  it('clip tokens verify, expire and bind the range', () => {
    const now = 1_800_000_000_000;
    const q = new URLSearchParams(clipQuery({ slug: 's', start: 10, end: 70, now }, 'k'));
    const [start, end] = q.get('t').split('-').map(Number);
    expect(verifyClip({ slug: 's', start, end, exp: q.get('exp'), sig: q.get('sig') }, 'k', now)).toBe(true);
    expect(verifyClip({ slug: 's', start, end: 200, exp: q.get('exp'), sig: q.get('sig') }, 'k', now)).toBe(false);
    expect(verifyClip({ slug: 's', start, end, exp: q.get('exp'), sig: q.get('sig') }, 'k', now + 2 * 3600_000)).toBe(false);
  });
});

describe('enhancement by measurement', () => {
  it('light chain: low-pass under the source Nyquist; hum notch only when measured', () => {
    expect(lightChain({ sample_rate: 16000 })).toContain('lowpass=f=7520');
    expect(lightChain({ sample_rate: 44100 })).not.toContain('bandreject');
    expect(lightChain({ sample_rate: 44100, hum50_db: 14, hum60_db: 2 })).toContain('bandreject=f=50:');
  });
  it('probe starts spread over the talk', () => {
    expect(probeStarts(2763)).toEqual([...probeStarts(2763)].sort((a, b) => a - b));
    expect(probeStarts(90)).toEqual([0]);
  });
  it('processing must clearly help recognition to be used for it', () => {
    expect(chooseAsrInput([{ name: 'original', avg_logprob: -0.31, words: 290 }, { name: 'light', avg_logprob: -0.328, words: 292 }]).name).toBe('original');
    expect(chooseAsrInput([{ name: 'original', avg_logprob: -0.6, words: 200 }, { name: 'light', avg_logprob: -0.4, words: 210 }, { name: 'dfn', avg_logprob: -0.41, words: 205 }]).name).toBe('light');
    expect(chooseListening([{ name: 'light', snr_db: 20, avg_logprob: -0.4 }, { name: 'dfn', snr_db: 27, avg_logprob: -0.42 }]).name).toBe('dfn');
    expect(chooseListening([{ name: 'light', snr_db: 20, avg_logprob: -0.4 }, { name: 'dfn', snr_db: 27, avg_logprob: -0.6 }]).name).toBe('light');
  });
});

describe('quotations', () => {
  it('locates the recited words even with a dropped word', () => {
    const ws = words('and he said O Son of Being love Me that I may love thee then we move on');
    expect(locateSpan(ws, 'O Son of Being! Love Me, that I may love thee.')).toMatchObject({ i0: 3, i1: 14 });
    expect(locateSpan(ws, 'O Son of Spirit my first counsel is this')).toBeNull();
  });
  it('gates: printed thresholds, then the looser spoken gate', () => {
    expect(gateOf(0.7)).toEqual({ gate: 'printed', basis: 'verbatim' });
    expect(gateOf(0.35)).toEqual({ gate: 'printed', basis: 'translation' });
    expect(gateOf(0.27)).toEqual({ gate: 'spoken', basis: 'translation' });
    expect(gateOf(0.1)).toBeNull();
    expect(writerName('the Guardian')).toBe('Shoghi Effendi');
    expect(writerName("Baha'u'llah")).toBe('Bahá’u’lláh');
  });
  it('links a recited quotation to the writer\'s own work and keeps the speaker\'s words', async () => {
    const ps = [para(1, 'as Bahá’u’lláh says O Son of Being love Me that I may love thee if thou lovest Me not')];
    const deps = {
      sourceHunt: vi.fn(async () => ({ origin: { id: 9, documentId: 90, title: 'The Hidden Words', author: 'Bahá’u’lláh', bookAuthor: 'Bahá’u’lláh', overlap: 0.82, url: 'u' }, considered: [] })),
      paragraphsByIds: vi.fn(async () => [{ id: 9, doc_id: 90, paragraph_index: 4, title: 'The Hidden Words', author: 'Bahá’u’lláh', language: 'en', text: 'O SON OF BEING! Love Me, that I may love thee.' }]),
      linkFor: vi.fn(() => ({ url: 'https://oceanlibrary.com/hw?paraId=5' })), resolveLinks: vi.fn(),
    };
    const r = await linkQuotes(ps, [{ p: 1, text: 'O Son of Being love Me that I may love thee if thou lovest Me not', writer: "Baha'u'llah" }], deps, { pauseMs: 0 });
    expect(r.linked).toHaveLength(1);
    expect(r.linked[0]).toMatchObject({ kind: 'quote', para: 1, i0: 3, gate: 'printed', basis: 'verbatim', url: 'https://oceanlibrary.com/hw?paraId=5', writer: 'Bahá’u’lláh' });
    expect(r.linked[0].said).toBe('O Son of Being love Me that I may love thee if thou lovest Me not');
  });
  it('refuses a source that is not the writer\'s own work', async () => {
    const ps = [para(1, 'he said the earth is but one country and mankind its citizens indeed')];
    const deps = { sourceHunt: vi.fn(async () => ({ origin: { id: 3, documentId: 30, title: 'A Compilation', author: 'Bahá’u’lláh', bookAuthor: 'Research Department', overlap: 0.9 }, considered: [] })),
      paragraphsByIds: vi.fn(), linkFor: vi.fn(), resolveLinks: vi.fn() };
    const r = await linkQuotes(ps, [{ p: 1, text: 'the earth is but one country and mankind its citizens', writer: 'Bahá’u’lláh' }], deps, { pauseMs: 0 });
    expect(r.linked).toHaveLength(0);
    expect(r.rejected[0].why).toBe('not-own-work');
  });
  it('a teaching becomes a cross-reference only on a confident yes', async () => {
    const ps = [para(1, 'the Guardian taught that the Administrative Order is the channel of the spirit')];
    const deps = { searchHype: vi.fn(async () => ({ hits: [{ paragraph_id: 5 }] })), searchConcepts: vi.fn(async () => ({ hits: [] })), searchPhrases: vi.fn(async () => ({ hits: [{ paragraph_id: 6 }] })),
      paragraphsByIds: vi.fn(async (ids) => ids.map((id) => ({ id, doc_id: 50, paragraph_index: id, title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', language: 'en', book_authority: 10, text: `passage ${id} `.repeat(20) }))),
      linkFor: vi.fn(() => ({ url: 'https://oceanlibrary.com/wob' })) };
    const verify = vi.fn(async () => [{ i: 0, states: false, confidence: 0.9 }, { i: 1, states: true, confidence: 0.85, excerpt: 'channel of the spirit' }]);
    const r = await linkTeachings(ps, [{ p: 1, writer: 'the Guardian', claim: 'The Administrative Order is the channel of the spirit.', words: 'the Administrative Order is the channel of the spirit' }], verify, deps, { pauseMs: 0 });
    expect(r.linked[0]).toMatchObject({ kind: 'concept', writer: 'Shoghi Effendi', source: { id: 6 }, confidence: 0.85, excerpt: 'channel of the spirit' });
    const none = await linkTeachings(ps, [{ p: 1, writer: 'Shoghi Effendi', claim: 'x' }], vi.fn(async () => [{ i: 0, states: true, confidence: 0.5 }]), deps, { pauseMs: 0 });
    expect(none.linked).toHaveLength(0);
    // a yes only from a visitor's account (low book authority) is not a canonical cross-reference
    const low = { ...deps, paragraphsByIds: vi.fn(async (ids) => ids.map((id) => ({ id, doc_id: 51, paragraph_index: id, title: 'A Visit to California', author: '‘Abdu’l-Bahá', language: 'en', book_authority: 4, text: 'passage '.repeat(20) }))) };
    const r2 = await linkTeachings(ps, [{ p: 1, writer: '‘Abdu’l-Bahá', claim: 'y' }], vi.fn(async () => [{ i: 0, states: true, confidence: 0.9 }]), low, { pauseMs: 0 });
    expect(r2.linked).toHaveLength(0);
    expect(r2.rejected[0].why).toBe('stated only outside the canonical works');
  });
  it('quote and CR records become content_source_links rows on the transcript paragraphs', () => {
    const rows = linkRows({ quotes: [{ kind: 'quote', para: 2, source: { id: 9, doc_id: 90 }, overlap: 0.8, basis: 'verbatim' }],
      teachings: [{ kind: 'concept', para: 3, source: { id: 7, doc_id: 70 }, confidence: 0.9 }, { kind: 'concept', para: 99, source: { id: 1 } }] }, new Map([[2, 102], [3, 103]]), 500);
    expect(rows).toEqual([
      { quote_id: 102, source_id: 9, quote_doc: 500, source_doc: 90, coverage: 0.8, share: null, basis: 'verbatim', method: 'media-sourcehunt' },
      { quote_id: 103, source_id: 7, quote_doc: 500, source_doc: 70, coverage: 0.9, share: null, basis: 'concept', method: 'media-cr' }]);
  });
});

describe('edge and API serving', () => {
  it('only versioned media files are cached on R2', () => {
    expect(mediaKey('https://siftersearch.com/api/media/a-b/file/web/a-b.ogg?v=3')).toBe('a-b/web/a-b.ogg@3');
    expect(mediaKey('https://siftersearch.com/api/media/a-b/file/web/a-b.ogg')).toBeNull();
    expect(mediaKey('https://siftersearch.com/api/media/a-b/clip?t=1-2&v=1')).toBeNull();
    expect(mediaKey('https://siftersearch.com/api/media/a-b/file/..%2Fx?v=1')).toBeNull();
  });
  it('R2 ranged reads answer with Content-Range', () => {
    const h = r2Headers({ size: 1000, range: { offset: 100, length: 50 }, httpMetadata: { contentType: 'audio/ogg' } }, true);
    expect(h.get('content-range')).toBe('bytes 100-149/1000');
    expect(h.get('content-length')).toBe('50');
    expect(r2Headers({ size: 10, httpMetadata: { contentType: 'text/html' } }, false).get('content-security-policy')).toContain("default-src 'self'");
  });
  it('byte ranges', () => {
    expect(byteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(byteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange('bytes=2000-', 1000)).toBe('bad');
    expect(byteRange(undefined, 1000)).toBeNull();
  });
  it('clip budget per IP', () => {
    const now = 1000;
    for (let i = 0; i < 3; i++) expect(clipBudget('1.2.3.4', { n: 3, now })).toBe(true);
    expect(clipBudget('1.2.3.4', { n: 3, now })).toBe(false);
    expect(clipBudget('1.2.3.4', { n: 3, now: now + 11 * 60_000 })).toBe(true);
  });
});

describe('sources and thumbnails', () => {
  it('YouTube ids and bot checks', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://example.com/v')).toBeNull();
    expect(isBotCheck("ERROR: Sign in to confirm you're not a bot")).toBe(true);
    expect(isBotCheck('HTTP Error 404')).toBe(false);
  });
  it('licences and identity checks for speaker photos', () => {
    expect(okLicence('CC BY-SA 4.0')).toBe(true);
    expect(okLicence('Public domain')).toBe(true);
    expect(okLicence('Fair use')).toBe(false);
    expect(describesBahai('Hand of the Cause of God (Bahá’í Faith)')).toBe(true);
    expect(describesBahai('American football player')).toBe(false);
    expect(tileSvg({ speaker: 'Hooper Dunbar', peaks: [0, 10, -5, 5] })).toContain('>HD<');
  });
  it('a photo only for a Bahá’í of that name (description or religion claim), with an accepted licence; Commons by file name as fallback', async () => {
    const info = (lic) => ({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://upload/jd.jpg', mime: 'image/jpeg', descriptionurl: 'https://commons/File:JD.jpg', extmetadata: { LicenseShortName: { value: lic }, Artist: { value: '<a>Someone</a>' } } }] } } } });
    const fetchImpl = vi.fn(async (url) => ({ json: async () => (url.includes('wbsearchentities')
      ? { search: [{ id: 'Q1', label: 'John Doe', description: 'American actor' }, { id: 'Q2', label: 'John Doe', description: 'Iranian historian' }] }
      : url.includes('wbgetentities') ? { entities: { [url.match(/ids=(Q\d+)/)[1]]: { claims: url.includes('Q2') ? { P140: [{ mainsnak: { datavalue: { value: { id: 'Q22679' } } } }], P18: [{ mainsnak: { datavalue: { value: 'JD.jpg' } } }] } : { P18: [{ mainsnak: { datavalue: { value: 'X.jpg' } } }] } } } }
        : info('CC BY-SA 3.0')) }));
    const r = await findSpeakerImage('Jóhn Dóe', { fetchImpl });
    expect(r).toMatchObject({ wikidata: 'Q2', licence: 'CC BY-SA 3.0', artist: 'Someone', url: 'https://upload/jd.jpg' });
    expect(fetchImpl.mock.calls[0][0]).toContain('search=John%20Doe');   // searched without diacritics
    expect(await findSpeakerImage('Doe', { fetchImpl })).toBeNull();
    // no Wikidata Bahá’í with an image → Commons, only a file whose name carries both names
    const commons = vi.fn(async (url) => ({ json: async () => (url.includes('wbsearchentities') ? { search: [] }
      : url.includes('list=search') ? { query: { search: [{ title: 'File:Jane Roe 1950.jpg' }, { title: 'File:John Doe portrait.jpg' }] } } : info('Public domain')) }));
    expect(await findSpeakerImage('John Doe', { fetchImpl: commons })).toMatchObject({ via: 'commons-search', licence: 'Public domain' });
  });
  it('threads follow search latency', () => {
    expect(threadsFor([1.2, 1.5, 2.0], { base: 16 })).toBe(16);
    expect(threadsFor([3.5, 4, 2.9], { base: 16 })).toBe(8);
    expect(threadsFor([7, 8, 9], { base: 16 })).toBe(4);
    expect(threadsFor([null], { base: 16 })).toBe(16);
  });
});

describe('transcript ingestion', () => {
  it('writes the library file, ingests it, links quotes on the right rows and maps para_N → paragraph_index', async () => {
    const { mkdtempSync, writeFileSync, readFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { ingestTranscript } = await import('../../api/lib/media/ingest.js');
    const dir = mkdtempSync(join(tmpdir(), 'mi-')), base = mkdtempSync(join(tmpdir(), 'lib-'));
    writeFileSync(join(dir, 'transcript.md'), '---\ntitle: "T"\n---\n\nhello\n{id="para_1"}\n');
    writeFileSync(join(dir, 'quotes.json'), JSON.stringify({ quotes: [{ kind: 'quote', para: 1, source: { id: 9, doc_id: 90 }, overlap: 0.7, basis: 'verbatim' }], teachings: [] }));
    const saveLinks = vi.fn(async () => ({}));
    const r = await ingestTranscript({ dir, meta: { slug: 's-1', tradition: "Baha'i" } }, { base, ingest: async () => ({ documentId: 500, status: 'ok' }),
      repo: { docParagraphMap: async () => [{ id: 7001, paragraph_index: 1, block_attrs: '{"id":"para_1","t0":"0.00"}' }, { id: 7000, paragraph_index: 0, block_attrs: null }] }, saveLinks });
    expect(readFileSync(join(base, "Baha'i", 'Media', 's-1.md'), 'utf8')).toContain('{id="para_1"}');
    expect(r).toMatchObject({ documentId: 500, links: 1, pi: { 1: 1 } });
    expect(saveLinks.mock.calls[0][0][0]).toMatchObject({ quote_id: 7001, source_id: 9, method: 'media-sourcehunt' });
  });
});

describe('older Safari (no Ogg Opus)', () => {
  it('the standalone page asks for AAC clips and the .m4a file when Ogg Opus cannot play', () => {
    const html = pageHtml({ meta, paragraphs: [para(1, 'a b c.')], clipUrl: '/api/media/x/clip-url', audio: 'web/x.ogg' });
    expect(html).toContain("'&fmt=m4a'");
    expect(html).toContain(".replace(/\\.ogg$/,'.m4a')");
  });
});
