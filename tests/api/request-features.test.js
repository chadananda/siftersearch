// Structural facts about a turn (request-features.js): position, length, quoted spans, script — and the Jev state that
// carries them with the reader card and the history. NOTHING here reads the words for intent (Chad 11-03).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isFirstMessage, quotedSpans, scriptOf, turnFacts, describeTurn, jevState, requestFeatures } from '../../api/lib/assistant/request-features.js';

const msgs = (...texts) => texts.map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content }));

describe('turn facts are structure, not meaning', () => {
  it('first message vs a thread', () => {
    expect(isFirstMessage(msgs('and the Báb?'))).toBe(true);
    expect(isFirstMessage(msgs('who was Táhirih?', 'A poet…', 'and the Báb?'))).toBe(false);
    expect(turnFacts(msgs('who was Táhirih?', 'A poet…', 'and the Báb?'))).toMatchObject({ first: false, turn: 2, words: 3 });
  });
  it('quoted spans by punctuation (curly, straight, guillemets), script by Unicode block', () => {
    expect(quotedSpans('where is "the earth is but one country" from?')).toEqual(['the earth is but one country']);
    expect(quotedSpans('he spoke of «الحمد لله» and of ‘the Most Great Peace’')).toEqual(['الحمد لله', 'the Most Great Peace']);
    expect(quotedSpans("don't you think it's fine")).toEqual([]);
    expect(scriptOf('هو الله')).toBe('Arabic');
    expect(scriptOf('what does الحمد لله mean in the Kitáb-i-Aqdas')).toBeNull();   // mostly Latin
    expect(scriptOf('धम्मपद')).toBe('Devanagari');
  });
  it('describeTurn states the position, the length and the quoted words — with the quoted-words prior, not a verdict', () => {
    const d = describeTurn(turnFacts(msgs('who was Táhirih?', 'A poet…', 'more "unveiling at Badasht"')));
    expect(d).toMatch(/user message #2 of a thread/);
    expect(d).toMatch(/quotes these words: «unveiling at Badasht»/);
    expect(d).toMatch(/nearly always wording to find/);
    expect(describeTurn(turnFacts(msgs('hi')))).toMatch(/FIRST message .* cannot be a follow-up.*single word/);
  });
  it('jevState: reader card, turn line, then the last N turns clipped', () => {
    const s = jevState({ messages: msgs('a'.repeat(50), 'b'.repeat(50), 'c'), card: 'a signed-in reader; studying: dawn-breakers', turns: 2, chars: 10 });
    expect(s.split('\n')[0]).toBe('READER: a signed-in reader; studying: dawn-breakers');
    expect(s).toMatch(/\nTURN: user message #2/);
    expect(s).toMatch(/CONVERSATION:\nassistant: bbbbbbbbbb\nuser: c$/);
    expect(jevState({ messages: msgs('x') })).toMatch(/^READER: unknown/);
  });
  it('requestFeatures is the same structural function (callers written against 11-03 keep working)', () => {
    expect(requestFeatures).toBe(turnFacts);
  });
  it('the module holds no vocabulary: no word lists for languages, requests or passages (Chad 11-03)', () => {
    const src = readFileSync(new URL('../../api/lib/assistant/request-features.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\b(hindi|persian|original|translat|show me|where is this|pasted)\b/i);
  });
});
