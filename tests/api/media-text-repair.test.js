// Whisper's mojibake (Chad 10-22 screenshot, 16:16) is repaired where ASR words enter; real transliteration stays.
import { describe, it, expect } from 'vitest';
import { fixMojibake, hasMojibake } from '../../api/lib/media/text-repair.js';
import { flattenWords } from '../../api/lib/media/paragraphs.js';
import { stripMdLinks, transcriptMarkdown } from '../../api/lib/media/render.js';
import { judgeEdit } from '../../api/lib/media/cleanup.js';

describe('mojibake', () => {
  it('Chad’s exact string', () => {
    expect(fixMojibake("He said, ìWhy don't they read my book?î And it touched my heart")).toBe("He said, “Why don't they read my book?” And it touched my heart");
  });
  it('contractions and double-encoded forms; Persian names keep their í', () => {
    expect(fixMojibake('Iím sure itís what you donít know, thatís the Guardianís word')).toBe('I’m sure it’s what you don’t know, that’s the Guardian’s word');
    expect(fixMojibake('the Bábís, Anís, Majíd, Rashíd, Idrís, ‘Alí, Íqán, Bahá’ís')).toBe('the Bábís, Anís, Majíd, Rashíd, Idrís, ‘Alí, Íqán, Bahá’ís');
    expect(fixMojibake('â€œHelloâ€\u009d and ‚ÄúHi‚Äù and caf√© and cafÃ©')).toBe('“Hello” and “Hi” and café and café');
    expect(fixMojibake('ëAbduíl-Bahá')).toBe('‘Abduíl-Bahá');   // ‘ayn repaired; the inner í is left for the name pass
    expect(hasMojibake('plain text')).toBe(false);
  });
  it('flattenWords repairs words as they enter the pipeline', () => {
    const ws = flattenWords([{ s: 0, e: 2, words: [{ w: 'ìWhy', s: 0, e: 1 }, { w: 'book?î', s: 1, e: 2 }] }]);
    expect(ws.map((w) => w.w)).toEqual(['“Why', 'book?”']);
  });
});

describe('indexed text has no markup (10-22: "[Shoghi Effendi](https://…" in a snippet)', () => {
  it('transcript.md paragraphs are plain words; snippets of older ingests are stripped', () => {
    const words = 'because Shoghi Effendi makes it very clear'.split(' ').map((w, i) => ({ w, s: i, e: i + 1 }));
    const md = transcriptMarkdown({ meta: { slug: 's', title: 'T' }, paragraphs: [{ n: 1, t0: 0, t1: 7, words }],
      quotes: [{ para: 1, i0: 1, i1: 3, url: 'https://x', cite: 'c' }], links: [{ para: 1, i0: 1, i1: 3, kind: 'person', url: '/biography/1' }] });
    expect(md).toContain('because Shoghi Effendi makes it very clear\n{id="para_1"');
    expect(md).not.toContain('](http');
    expect(stripMdLinks('Both, no, because [Shoghi Effendi](https://siftersearch.com/biography/1248214 "Shoghi Effendi") makes it')).toBe('Both, no, because Shoghi Effendi makes it');
  });
});

describe('pronoun house style', () => {
  it('a capitalisation edit "He" → "he" (Shoghi Effendi) passes the guard', () => {
    const ws = 'all of a sudden He said'.split(' ').map((w, i) => ({ w, s: i, e: i + 1 }));
    expect(judgeEdit(ws, { kind: 'capitalisation', from: 'He said', to: 'he said', confidence: 0.9 }).ok).toBeTruthy();
  });
});

describe('model calls survive a transient timeout (10-22: describe "Request timed out." failed a talk)', () => {
  it('retries a timeout, raises other errors', async () => {
    const { describeTalk } = await import('../../api/lib/media/llm.js');
    let n = 0;
    const create = async () => { if (n++ === 0) throw new Error('Request timed out.'); return { choices: [{ message: { content: '{"summary":"ok"}' } }], usage: {} }; };
    expect(await describeTalk([{ n: 1, t0: 0, t1: 1, words: [{ w: 'x', s: 0, e: 1 }] }], {}, { create, retryMs: [1] })).toMatchObject({ summary: 'ok' });
    await expect(describeTalk([{ n: 1, t0: 0, t1: 1, words: [{ w: 'x', s: 0, e: 1 }] }], {}, { create: async () => { throw new Error('400 bad request'); }, retryMs: [1] })).rejects.toThrow('400');
  });
});
