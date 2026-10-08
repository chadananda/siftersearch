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
