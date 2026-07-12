// entities/mentions — pure parse/anchor + run() on fakes.
import { describe, it, expect } from 'vitest';
import { parseMentions, normSurface, anchorOf } from '../../api/lib/rag/entities/mentions.js';
import { fakeLLM, makeRag } from './kit.js';

describe('mentions — pure helpers', () => {
  it('parseMentions pulls quoted surface=resolved pairs, skipping abstentions and the header', () => {
    // Real corpus format: quoted surfaces after the em-dash; header may itself contain an em-dash.
    const note = '@(not established — infer), ~1844 — the Declaration · "He" = the Báb; "Mullá Ḥusayn" = first Letter; "X" = ?';
    expect(parseMentions(note)).toEqual([
      { surface: 'He', resolvedAs: 'the Báb' },
      { surface: 'Mullá Ḥusayn', resolvedAs: 'first Letter' }, // "X" = ? abstention dropped; header ignored
    ]);
    expect(parseMentions('@x, ~y — an idea with no resolves')).toEqual([]);
  });

  it('parseMentions handles the wave-1 UNQUOTED "idea · surface = handle" format too', () => {
    const note = '@Ṭihrán, ~1852 [pin] — the lineage of Bahá’u’lláh · Mírzá Buzurg = Mírzá ‘Abbás-i-Núrí; the Sháh = Náṣiri’d-Dín Sháh';
    expect(parseMentions(note)).toEqual([
      { surface: 'Mírzá Buzurg', resolvedAs: 'Mírzá ‘Abbás-i-Núrí' },
      { surface: 'the Sháh', resolvedAs: 'Náṣiri’d-Dín Sháh' },
    ]);
  });

  it('anchorOf is deterministic and content-addressed', () => {
    expect(anchorOf(21308, 'para_5', normSurface('the Báb'), 0)).toBe(anchorOf(21308, 'para_5', normSurface('the Báb'), 0));
    expect(anchorOf(21308, 'para_5', normSurface('the Báb'), 0)).not.toBe(anchorOf(21308, 'para_6', normSurface('the Báb'), 0));
  });
});

describe('mentions — run() on fake ports', () => {
  const paras = [
    { id: 1, pid: 'para_1', text: 't', context: '@Shíráz, ~1844 — Declaration · "He" = the Báb; "Vaḥíd" = Siyyid Yaḥyá', contextModel: 'v1' },
    { id: 2, pid: 'para_2', text: 't', context: 'no note here', contextModel: 'v1' },      // no resolves
    { id: 3, pid: 'para_3', text: 't', context: '@x — y · "A" = B', contextModel: 'other' }, // wrong version → skipped
  ];

  it('records deferred, source-anchored mentions from disambiguated paragraphs only', async () => {
    const { rag, store } = makeRag({ seed: { paras: { 5: paras }, coverage: { 5: 1 } }, llm: fakeLLM([]) });
    const stats = await rag.entities.mentions(5, { version: 'v1' });
    expect(stats.mentions).toBe(2);                       // only para_1's two resolves (para_2 empty, para_3 wrong version)
    expect(store.mentions.map((m) => m.surface)).toEqual(['He', 'Vaḥíd']);
    for (const m of store.mentions) {
      expect(m).not.toHaveProperty('entity_id');          // LAW: identity is deferred — never bound here
      expect(m.anchor).toMatch(/^[0-9a-f]{16}$/);         // stable content-addressed id
    }
  });

  it('gates on disambiguation', async () => {
    const { rag } = makeRag({ seed: { paras: { 5: paras }, coverage: { 5: 0.4 } } });
    await expect(rag.entities.mentions(5)).rejects.toThrow(/disambiguated/);
  });
});
