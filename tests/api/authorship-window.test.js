// Windowed paragraph attribution helpers (api/lib/authorship/window.js).
import { describe, it, expect } from 'vitest';
import { canonical, initialRoster, windowState, windowQuestions, parseAnswers, needsEscalation, parseEscalation, OTHER } from '../../api/lib/authorship/window.js';

describe('authorship window', () => {
  it('folds LLM spellings onto the roster', () => {
    expect(canonical("Baha'u'llah")).toBe('Bahá’u’lláh');
    expect(canonical('the Guardian')).toBe('Shoghi Effendi');
    expect(canonical('Helen hornby', ['Helen Hornby'])).toBe('Helen Hornby');
    expect(canonical('Mírzá Abu’l-Faḍl')).toBe('Mírzá Abu’l-Faḍl');
  });
  it('starts the roster with the figures and the book author, never a compiler', () => {
    const r = initialRoster({ author: 'Research Department of the Universal House of Justice (compiler)', religion: "Bahá'í" });
    expect(r).toContain('Shoghi Effendi');
    expect(r.some((n) => /compiler/.test(n))).toBe(false);
  });
  it('shows decided paragraphs with labels, targets numbered, what follows unlabelled', () => {
    const s = windowState({ book: { title: 'B', author: 'X' }, roster: ['Shoghi Effendi'],
      anchors: [{ text: 'a', heading: 'H', label: { speaker: 'Shoghi Effendi' } }], targets: [{ text: 't1', heading: 'H' }], ahead: [{ text: 'Shoghi Effendi, ADJ, p. 30', heading: 'H' }] });
    expect(s).toMatch(/\[speaker: Shoghi Effendi; quotes: none\] a/);
    expect(s).toMatch(/T1: t1/);
    expect(s.match(/## H/g)).toHaveLength(1);
  });
  it('asks speaker and quotes per target and escalates the unsure and the unnamed', () => {
    const q = windowQuestions(['Shoghi Effendi'], 2, { author: 'X' });
    expect(Object.keys(q)).toEqual(['s1', 'q1', 's2', 'q2']);
    expect(q.s1.criteria[OTHER]).toBeTruthy();
    const l = parseAnswers({ s1: { choice: 'Shoghi Effendi', confidence: 0.95 }, q1: { choice: 'none', confidence: 0.9 }, s2: { choice: OTHER, confidence: 0.9 }, q2: { choice: 'none', confidence: 0.9 } }, 2);
    expect(l[0]).toMatchObject({ speaker: 'Shoghi Effendi', quotes: null });
    expect(needsEscalation(l[0], 0.7)).toBe(false);
    expect(needsEscalation(l[1], 0.7)).toBe(true);
  });
  it('reads the LLM JSON and canonicalises names', () => {
    expect(parseEscalation('ok {"T2": {"speaker": "the Guardian", "quotes": "Baha\'u\'llah"}}', [1], [])).toEqual({ 1: { speaker: 'Shoghi Effendi', quotes: 'Bahá’u’lláh' } });
  });
});

describe('condense', () => {
  it('keeps every quotation of a long paragraph with its lead-in', async () => {
    const { condense } = await import('../../api/lib/authorship/window.js');
    const t = 'x'.repeat(1200) + ' The Mu‘tamid could not help giving vent to his joy. “Hear me!” he exclaimed. ' + 'y'.repeat(300);
    const c = condense(t);
    expect(c.length).toBeLessThan(t.length);
    expect(c).toMatch(/giving vent to his joy\. “Hear me!”/);
    expect(condense('short')).toBe('short');
  });
});

describe('settle + editor label', () => {
  it('drops a quote of the speaker themself and maps generic narrators to one label', async () => {
    const { settle, canonical, EDITOR } = await import('../../api/lib/authorship/window.js');
    expect(settle({ speaker: 'Bahá’u’lláh', quotes: "Baha'u'llah" }).quotes).toBeNull();
    expect(settle({ speaker: 'John E. Esslemont', quotes: 'Bahá’u’lláh' }).quotes).toBe('Bahá’u’lláh');
    expect(canonical('narrator')).toBe(EDITOR);
    expect(canonical('The reporter')).toBe(EDITOR);
  });
});

describe('book brief (prompt tuner)', () => {
  it('reads speakers and rules, drops compilers, shows the rules in the window', async () => {
    const { parseBrief, windowState, windowQuestions } = await import('../../api/lib/authorship/window.js');
    const b = parseBrief('{"speakers":[{"name":"the Guardian","recognise":"letters signed Shoghi"},{"name":"Research Department","recognise":"x"}],"rules":["Letters follow a dateline."]}', []);
    expect(b.speakers.map((x) => x.name)).toEqual(['Shoghi Effendi']);
    expect(windowState({ book: { title: 'B', author: 'X' }, roster: ['Shoghi Effendi'], anchors: [], targets: [{ text: 't' }], ahead: [], brief: b })).toMatch(/HOW THIS BOOK WORKS: Letters follow a dateline\./);
    // v13: the description is stated once in the window, not in every question
    expect(windowState({ book: { title: 'B', author: 'X' }, roster: ['Shoghi Effendi'], anchors: [], targets: [{ text: 't' }], ahead: [], brief: b })).toMatch(/Shoghi Effendi \(letters signed Shoghi\)/);
    expect(windowQuestions(['Shoghi Effendi'], 1, { author: 'X' }).s1.instructions).toBe('Speaker of T1?');
  });
});

describe('editor label variants', () => {
  it('maps "narrator/editor" too', async () => {
    const { canonical, EDITOR } = await import('../../api/lib/authorship/window.js');
    expect(canonical('narrator/editor')).toBe(EDITOR);
    expect(canonical('the editor or reporter')).toBe(EDITOR);
  });
});

describe('relevantRoster', () => {
  it('keeps figures, the author, the brief and names in the text, and caps the rest', async () => {
    const { relevantRoster } = await import('../../api/lib/authorship/window.js');
    const roster = ['Bahá’u’lláh', 'The Báb', 'Nabil Zarandi', ...Array.from({ length: 40 }, (_, i) => `Person Number${i}`), 'Manúchihr Ḵhán'];
    const r = relevantRoster(roster, 'the Mu‘tamid, Manúchihr Ḵhán, said', { author: 'Nabil Zarandi' }, null, 10);
    expect(r).toContain('Bahá’u’lláh');
    expect(r).toContain('Nabil Zarandi');
    expect(r).toContain('Manúchihr Ḵhán');
    expect(r.length).toBeLessThanOrEqual(10);
  });
});
