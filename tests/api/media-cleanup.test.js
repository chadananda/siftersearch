// The copy-edit pass's guard (api/lib/media/cleanup.js): only verifiable small edits; dropped words hidden with their
// time; never a paraphrase; low confidence only flagged.
import { describe, it, expect, vi } from 'vitest';
import { judgeEdit, judgeAll, applyClean, cleanParagraphs, soundKey } from '../../api/lib/media/cleanup.js';
import { paragraphMarkdown, pageHtml } from '../../api/lib/media/render.js';

const W = (t) => t.split(' ').map((w, i) => ({ w, s: i, e: i + 1 }));

describe('copy-edit guard', () => {
  const ws = W('um so the the soul is uh is eternal and their is no end Thank you for watching');
  it('accepts fillers, stutters, homophones and hallucinations', () => {
    expect(judgeEdit(ws, { from: 'um', to: '', kind: 'filler', confidence: 0.95 }).ok).toMatchObject({ i0: 0, i1: 1, hide: true });
    expect(judgeEdit(ws, { from: 'the the', to: 'the', kind: 'stutter', confidence: 0.9 }).ok).toMatchObject({ i0: 2, i1: 3, hide: true });
    expect(judgeEdit(ws, { from: 'their', to: 'there', kind: 'homophone', confidence: 0.9 }).ok).toMatchObject({ to: 'there' });
    expect(judgeEdit(ws, { from: 'Thank you for watching', to: '', kind: 'hallucination', confidence: 0.9 }).ok).toMatchObject({ hide: true });
  });
  it('refuses rewording, a dropped meaning word, and an unknown kind; flags low confidence', () => {
    expect(judgeEdit(ws, { from: 'is eternal', to: 'lives forever', kind: 'spelling' }).refused).toBeTruthy();
    expect(judgeEdit(ws, { from: 'eternal', to: '', kind: 'filler' }).refused).toBe('not a filler');
    expect(judgeEdit(ws, { from: 'and their is no end', to: 'and there is no end', kind: 'style' }).refused).toMatch(/unknown kind/);
    expect(judgeEdit(ws, { from: 'their', to: 'there', kind: 'homophone', confidence: 0.4 }).flagged).toMatch(/low confidence/);
    expect(judgeEdit(ws, { from: 'soul is', to: 'soul was', kind: 'stutter' }).refused).toBeTruthy();
  });
  it('capitals and sentence boundaries keep the letters', () => {
    const p = W('life and the next world begins');
    expect(judgeEdit(p, { from: 'life and', to: 'life. And', kind: 'punctuation', confidence: 0.9 }).ok).toMatchObject({ to: 'life. And' });
    expect(judgeEdit(p, { from: 'life and', to: 'life, but', kind: 'punctuation', confidence: 0.9 }).refused).toBe('letters changed');
  });
  it('sound keys', () => expect(soundKey('their')).toBe(soundKey('there')));
});

describe('applying and rendering', () => {
  it('hidden words keep their time and vanish from the text; replacements keep the verbatim', () => {
    const ws = W('um so their is a way');
    const j = judgeAll(ws, [{ from: 'um', to: '', kind: 'filler' }, { from: 'their', to: 'there', kind: 'homophone' }]);
    const out = applyClean(ws, j.ok);
    expect(out.length).toBe(ws.length);
    expect(out[0]).toMatchObject({ w: 'um', hide: true, s: 0, e: 1 });
    expect(out[2]).toMatchObject({ w: 'there', v: 'their', s: 2 });
    const p = { n: 1, t0: 0, t1: 6, words: out, sentences: [[0, 6]] };
    expect(paragraphMarkdown(p, [])).toBe('so there is a way');
    expect(pageHtml({ meta: { slug: 's', title: 't', rights: { playback: 'full' } }, paragraphs: [p] })).toContain('class="w x" data-s="0.00" data-e="1.00" hidden></span>');
  });
  it('the pass logs every change and counts them', async () => {
    const ps = [{ n: 1, t0: 0, t1: 6, words: W('um so so their is a way'), sentences: [[0, 7]] }];
    const ask = vi.fn(async () => ({ edits: [{ p: 1, from: 'um', to: '', kind: 'filler', confidence: 0.9 }, { p: 1, from: 'so so', to: 'so', kind: 'stutter', confidence: 0.9 },
      { p: 1, from: 'their', to: 'there', kind: 'homophone', confidence: 0.9 }, { p: 1, from: 'a way', to: 'one road', kind: 'spelling', confidence: 0.9 }] }));
    const r = await cleanParagraphs(ps, ask);
    expect(r.stats).toMatchObject({ applied: 3, hidden_words: 2, refused: 1 });
    expect(paragraphMarkdown(r.paragraphs[0], [])).toBe('so there is a way');
    expect(r.log.filter((l) => !l.refused).map((l) => l.kind)).toEqual(['homophone', 'stutter', 'filler']);
    expect(r.log.find((l) => l.refused)).toMatchObject({ kind: 'spelling', from: 'a way', why: expect.any(String) });
  });
  it('names: the model knowledge respells a misheard title; never adds words (Chad 10-22 examples)', async () => {
    const ps = [{ n: 2, t0: 0, t1: 9, words: W("he translated Nabips Narrative (Vol II), he was not only foreigner of Bahá’u’lláh"), sentences: [[0, 13]] }];
    const ask = vi.fn(async () => ({ edits: [
      { p: 2, from: 'Nabips', to: 'Nabíl’s', kind: 'name', confidence: 0.95 },
      { p: 2, from: 'foreigner', to: 'forerunner', kind: 'homophone', confidence: 0.9 },
      { p: 2, from: 'Narrative', to: 'Narrative, the Dawn-Breakers,', kind: 'name', confidence: 0.9 },   // adds words: refused
    ], mentions: [{ p: 2, text: 'Nabíl’s Narrative', kind: 'work', canonical: 'The Dawn-Breakers: Nabíl’s Narrative', confidence: 0.95 }, { p: 9, text: 'x', kind: 'work' }] }));
    const r = await cleanParagraphs(ps, ask, { ctx: { speaker: 'A. Furútan', title: 'Forerunner' } });
    expect(paragraphMarkdown(r.paragraphs[0], [])).toBe('he translated Nabíl’s Narrative (Vol II), he was not only forerunner of Bahá’u’lláh');
    expect(r.log.find((l) => l.refused)?.why).toMatch(/adds words/);
    expect(r.mentions).toEqual([expect.objectContaining({ para: 2, i0: 2, i1: 4, text: 'Nabíl’s Narrative', kind: 'work' })]);
    expect(ask.mock.calls[0][0]).toContain('Speaker: A. Furútan');
    expect(ask.mock.calls[0][0]).toContain('Shoghi Effendi');
  });
  it('chunks by audio minutes, with two paragraphs before and one after as read-only context', async () => {
    const { chunksOf } = await import('../../api/lib/media/cleanup.js');
    const ps = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, t0: i * 100, t1: i * 100 + 90 }));
    expect(chunksOf(ps, { chunkSeconds: 300 })).toEqual([
      { edit: [1, 2, 3, 4], before: [], after: [5] },
      { edit: [5, 6, 7, 8], before: [3, 4], after: [9] },
      { edit: [9, 10], before: [7, 8], after: [] },
    ]);
  });
});
