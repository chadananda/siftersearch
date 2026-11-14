// Round 3 + Taherzadeh failures (11-14), the replies themselves as fixtures: volume-blind work resolution, absence and source narration,
// a manufactured dispute, a lead rewrite that left "There he names…" dangling, and a compilation cited for 'Abdu'l-Bahá's own Paris Talks line.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { contentAbsence, emptyInWork, conflictClaims, danglingOpens, askedSource } from '../../api/lib/assistant/lint.js';
import { askedLead, contentAbsenceAsk, conflictAsk } from '../../api/lib/assistant/agent-core.js';
import { strategyImpl, sourceFirst, volumeOf, seriesTitle, volumesOf } from '../../api/lib/assistant/agent-strategies.js';

const F = JSON.parse(readFileSync(new URL('../fixtures/anis/round3-taherzadeh-20261114.json', import.meta.url), 'utf8'));
const TZ = (n) => ({ id: 428 + n, title: `The Revelation of Bahá’u’lláh vol. ${n}`, author: 'Adib Taherzadeh', paragraph_count: [0, 1851, 2281, 3254, 2759][n] });

describe('a work in volumes (tz1: every volume resolved to vol. 3)', () => {
  it('volumeOf / seriesTitle read the volume a title names', () => {
    expect(volumeOf('The Revelation of Bahá’u’lláh vol. 2')).toBe(2);
    expect(volumeOf("The Revelation of Bahá'u'lláh, Volume IV")).toBe(4);
    expect(volumeOf("The Revelation of Bahá'u'lláh")).toBeNull();
    expect(seriesTitle('The Revelation of Bahá’u’lláh vol. 2')).toBe('The Revelation of Bahá’u’lláh');
  });
  it('volumesOf: one per volume, same series and author, in order', () => {
    const other = { id: 9, title: 'The Revelation of Bahá’u’lláh vol. 1', author: 'Someone Else' };
    expect(volumesOf(TZ(3), [TZ(3), TZ(1), other, TZ(4), TZ(2)]).map((d) => d.id)).toEqual([429, 430, 431, 432]);
  });
  const mk = () => {
    const quote = vi.fn(async () => ({ total: 0, passages: [] }));
    const s = strategyImpl({ deps: { quoteSearch: quote, findTitled: async () => ({ doc: TZ(3), others: [] }), seriesDocs: async () => [TZ(3), TZ(4), TZ(2), TZ(1)] } });
    return { s, quote };
  };
  it('the volume asked is the volume searched (vol. 2 holds the Tablet of Aḥmad chapter)', async () => {
    const { s, quote } = mk();
    const r = await s.searchInWork({ work: "The Revelation of Bahá'u'lláh vol. 2", queries: ['Tablet of Aḥmad'] });
    expect(quote.mock.calls.every(([a]) => a.works.length === 1 && a.works[0] === 430)).toBe(true);
    expect(r.work.title).toBe('The Revelation of Bahá’u’lláh vol. 2');
  });
  it('the series asked with no volume searches every volume', async () => {
    const { s, quote } = mk();
    const r = await s.searchInWork({ work: "The Revelation of Bahá'u'lláh", queries: ['Tablet of Aḥmad'] });
    expect(quote.mock.calls[0][0].works).toEqual([429, 430, 431, 432]);
    expect(r.work.title).toMatch(/vols\. 1, 2, 3, 4/);
  });
  it('a volume the library lacks says which it holds', async () => {
    const { s } = mk();
    const r = await s.searchInWork({ work: "The Revelation of Bahá'u'lláh vol. 7", queries: ['x'] });
    expect(r.passages).toEqual([]);
    expect(r.note).toMatch(/vols\. 1, 2, 3, 4 — no vol\. 7/);
  });
});

describe('absence and source narration (tz1, 1fuszlx, 181upeh)', () => {
  it('flags every absence claim in the replies', () => {
    expect(contentAbsence(F.tz1.reply).join(' ')).toMatch(/does not appear to hold/);
    expect(contentAbsence(F.tz1.draft).join(' ')).toMatch(/only as opening pages/);
    const f = contentAbsence(F['1fuszlx'].reply).join(' | ');
    expect(f).toMatch(/these sources show no official/);
    expect(f).toMatch(/I found no welcome page/);
    expect(f).toMatch(/I also found nothing on legal/);
    const w = contentAbsence(F['181upeh'].reply).join(' | ');
    expect(w).toMatch(/I found no sentence in the Will/);
    expect(w).toMatch(/I have not searched for the historical account/);
  });
  it('leaves statements about the text alone', () => {
    for (const s of ['It does not say what happens if no successor can be appointed at all.', 'The community does not organise by identity groups.',
      'The Will does not say the House would be elected in his lifetime.', '> "I found no rest" — a quotation is not a claim.']) expect(contentAbsence(s)).toEqual([]);
  });
  it('an empty search inside a work is what backs an absence; the re-ask says how to state it', () => {
    expect(emptyInWork([{ tool: 'search_in_work', found: 3 }, { tool: 'fused_search', found: 0 }])).toBe(false);
    expect(emptyInWork([{ tool: 'search_in_work', found: 0 }])).toBe(true);
    expect(contentAbsenceAsk(['x'], false)).toMatch(/search_in_work/);
    expect(contentAbsenceAsk(['x'], true)).not.toMatch(/Run search_in_work/);
    expect(contentAbsenceAsk(['x'], true)).toMatch(/The Will does not say/);
  });
});

describe('a manufactured dispute (tz1: Aḥmad of Yazd lived in Baghdád — one man)', () => {
  it('flags the dispute sentences in reply and draft', () => {
    const r = conflictClaims(F.tz1.reply).join(' | ');
    expect(r).toMatch(/The two accounts differ/);
    expect(r).toMatch(/leave the point open/);
    expect(conflictClaims(F.tz1.draft).join(' | ')).toMatch(/a different man from the Arab believer/);
    expect(conflictClaims(F['181upeh'].reply)).toEqual([]);
    expect(conflictAsk(['x'])).toMatch(/Arabic and the Persian Tablets of Aḥmad are two tablets/);
  });
});

describe('the lead and the antecedent (tz1)', () => {
  it('the rewrite left "There he names…" with no one named; the draft did not', () => {
    expect(danglingOpens(F.tz1.reply)).toHaveLength(1);
    expect(danglingOpens(F.tz1.draft)).toEqual([]);
  });
  it('the source the question asks about keeps the lead', () => {
    const tz = { author: 'Adib Taherzadeh', book_author: 'Adib Taherzadeh', title: 'The Revelation of Bahá’u’lláh vol. 2' };
    const se = { author: 'Shoghi Effendi', title: 'Uncompiled Published Letters' };
    expect(askedSource(F.tz1.question, tz)).toBe(true);
    expect(askedSource(F.tz1.question, se)).toBe(false);
    expect(askedSource('What does the Revelation of Bahá’u’lláh say about Badí‘?', { ...tz, author: '' , book_author: '' })).toBe(true);
    const found = new Map([['P1', tz], ['P2', se]]);
    expect(askedLead({ first: 'P1', core: 'P2', firstTier: 'secondary' }, found, F.tz1.question)).toBeNull();
    expect(askedLead({ first: 'P1', core: 'P2', firstTier: 'secondary' }, found, 'Who received the Tablet of Aḥmad?')).toMatchObject({ first: 'P1' });
  });
});

describe('the writer’s own work over a compilation quoting him (1dafwvt)', () => {
  const line = 'If we are true Bahá’ís speech is not needed. Our actions will help on the world, will spread civilization, will help the progress of science.';
  const live = [
    { id: 1, title: 'Bahá’í Sacred Writings', author: '‘Abdu’l-Bahá', book_author: "Compilation (Bahá'í Writings)", authority: 'scripture', text: line },
    { id: 2, title: 'Paris Talks', author: '‘Abdu’l-Bahá', book_author: '‘Abdu’l-Bahá', authority: 'reported', text: line },
    { id: 3, title: 'The Bahá’í Faith in Malwa', author: 'William Garlington', book_author: 'William Garlington', authority: 'scholarship', text: line },
  ];
  it('Paris Talks leads, the compilation follows', () => {
    expect(F['1dafwvt'].reply).toMatch(/Bahá’í Sacred Writings|Bahá'í Sacred Writings/);
    expect(sourceFirst(live).map((p) => p.id)).toEqual([2, 1, 3]);
  });
  it('a compilation of other words does not lift an unrelated book', () => {
    const other = { ...live[1], text: 'A wholly different talk about the light of the sun and the springtime of the world today.' };
    expect(sourceFirst([live[0], other]).map((p) => p.id)).toEqual([1, 2]);
  });
});
