// Audience (1 open … 5 internal, per section; tradition-agnostic) and moments (verbatim, located, verified) — Chad 10-22.
import { describe, it, expect, vi } from 'vitest';
import { sectionsOf, audienceOf, introRanges, locate, momentKey, momentsOf, assessPrompt, RUBRIC, LABELS } from '../../api/lib/media/assess.js';

const words = (t, t0 = 0) => t.split(' ').map((w, i) => ({ w, s: t0 + i, e: t0 + i + 0.9 }));
const para = (n, t, t0) => ({ n, t0, t1: t0 + t.split(' ').length, words: words(t, t0) });
const ps = [para(1, 'Welcome friends. Tonight we speak of prayer.', 0), para(2, 'Prayer is conversation with God. It needs no priest and no ceremony at all.', 200),
  para(3, 'Now the delegates must vote on the budget and the plan goals.', 900), para(4, 'And she told him he was wrong.', 1300)];
ps[1].t1 = 700;   // a ~8-minute section

describe('audience', () => {
  it('sections come from the subheaders (opening added); scores are validated; intro ranges need an intro phrase', () => {
    const secs = sectionsOf(ps, [{ p: 2, text: 'What is prayer?', slug: 'what-is-prayer' }, { p: 3, text: 'Convention business' }]);
    expect(secs.map((s) => [s.k, s.p, s.title])).toEqual([[1, 1, 'Opening'], [2, 2, 'What is prayer?'], [3, 3, 'Convention business']]);
    const a = audienceOf({ audience: { score: 5, rationale: 'Delegates.', signals: { jargon: 'some', setting: 'convention' } },
      sections: [{ k: 1, score: 2 }, { k: 2, score: 1, intro: 'what prayer is' }, { k: 3, score: 9 }] }, secs, { model: 'm', tradition: "Bahá'í" });
    expect(a).toMatchObject({ score: 5, label: LABELS[5], tradition: "Bahá'í", model: 'm' });
    expect(a.sections.map((s) => s.score)).toEqual([2, 1, null]);
    expect(a.intro).toEqual([expect.objectContaining({ k: 2, t0: 200, intro: 'what prayer is' })]);
  });
  it('the rubric is tradition-agnostic and names Chad\'s internal examples', () => {
    expect(RUBRIC).toMatch(/any religious tradition/);
    expect(RUBRIC).toMatch(/delegates/); expect(RUBRIC).toMatch(/Covenant-breaking/);
    expect(assessPrompt({ speaker: 'X', tradition: 'Islam' }, 'lines')).toContain('Tradition: Islam');
    expect(introRanges([{ score: 2, t0: 0, t1: 60, intro: 'x' }])).toEqual([]);   // too short
  });
});

describe('moments', () => {
  it('a verbatim span is located with exact times; a paraphrase is rejected; the key is stable', async () => {
    expect(locate(ps[1], 'It needs no priest and no ceremony at all.')).toEqual([5, 14]);
    const verify = vi.fn(async (m) => ({ ok: !/she told/.test(m.text), why: 'no antecedent' }));
    const r = await momentsOf({ moments: [
      { p: 2, text: 'Prayer is conversation with God. It needs no priest', context: 'On prayer', kind: 'claim', topics: ['prayer'], why: 'plain' },
      { p: 2, text: 'Prayer means talking to God', kind: 'claim' },
      { p: 4, text: 'And she told him he was wrong.', kind: 'anecdote' },
    ] }, ps, { slug: 's', verify });
    expect(r.moments).toHaveLength(1);
    expect(r.moments[0]).toMatchObject({ para: 2, i0: 0, i1: 9, t0_ms: 200000, t1_ms: 208900, kind: 'claim', rank: 1, key: momentKey('s', 'Prayer is conversation with God. It needs no priest') });
    expect(r.rejected.map((x) => x.why_rejected)).toEqual(['not verbatim in that paragraph', 'no antecedent']);
    expect(momentKey('s', 'Prayer is  conversation')).toBe(momentKey('s', 'prayer is conversation'));
  });
});

describe('moment links', () => {
  it('the API emits the canonical moment page; the item page redirects the old ?m= form', async () => {
    const { momentUrl } = await import('../../api/routes/media.js');
    expect(momentUrl('sears-x', 'Ab_c-12')).toBe('/media/sears-x/m/Ab_c-12');
    const { readFileSync } = await import('fs');
    const route = readFileSync(new URL('../../api/routes/media.js', import.meta.url), 'utf8');
    expect(route).not.toMatch(/\?m=\$\{/);
    const page = readFileSync(new URL('../../src/pages/media/[slug].astro', import.meta.url), 'utf8');
    expect(page).toMatch(/searchParams\.get\('m'\)[\s\S]{0,200}Astro\.redirect\(`\/media\/\$\{encodeURIComponent\(slug\)\}\/m\//);
  });
});
