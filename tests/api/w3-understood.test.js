// W3 three-part reply: the "what I understood" line is a restatement of Jev's decision (never an echo of the reader, never keywords),
// emitted after the neutral word and before the search; the tarpit shows the same shape.
import { describe, it, expect } from 'vitest';
import { cleanRestatement, decisionLine, restate, tarpitPhrase, understoodText, NEUTRAL } from '../../api/lib/assistant/understanding.js';
import { progressText } from '../../api/lib/assistant/progress.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';

const msgs = [{ role: 'user', content: 'What is the second Arabic Hidden Word in the original?' }];

describe('cleanRestatement', () => {
  it('keeps one short phrase, strips quotes and preambles', () => {
    expect(cleanRestatement('"the original Arabic of the second Arabic Hidden Word."', msgs[0].content)).toBe('the original Arabic of the second Arabic Hidden Word');
    expect(cleanRestatement('Understood: the original Arabic of Hidden Word 2\nmore lines', msgs[0].content)).toBe('the original Arabic of Hidden Word 2');
  });
  it('rejects an echo of the reader, a question, or a paragraph', () => {
    expect(cleanRestatement(msgs[0].content, msgs[0].content)).toBeNull();
    expect(cleanRestatement('Is it the second Hidden Word?', msgs[0].content)).toBeNull();
    expect(cleanRestatement('word '.repeat(25), msgs[0].content)).toBeNull();
    expect(cleanRestatement('', msgs[0].content)).toBeNull();
  });
});

describe('decisionLine', () => {
  it('names the strategy, sides, kind, language and original wish; null when nothing decided', () => {
    expect(decisionLine({ strategy: 'comparison', sides: ['Islam', 'Christian'], kind: 'research', features: { language: 'fr', original: 'ar' } }))
      .toBe('strategy comparison; sides Islam, Christian; kind research; answer language fr; original wanted (ar)');
    expect(decisionLine({})).toBeNull();
  });
});

describe('restate', () => {
  it('asks the model with the thread and the decision, returns the cleaned phrase and the line', async () => {
    const seen = [];
    const r = await restate(msgs, { strategy: 'reference', kind: 'research' }, { complete: async (m) => { seen.push(m[0].content); return { content: 'the original Arabic of the second Arabic Hidden Word' }; } });
    expect(seen[0]).toMatch(/strategy reference/); expect(seen[0]).toMatch(/second Arabic Hidden Word/);
    expect(r.phrase).toBe('the original Arabic of the second Arabic Hidden Word');
    expect(r.text).toBe('Understood — the original Arabic of the second Arabic Hidden Word.');
  });
  it('null on an echo, an error, a timeout or an empty thread — the neutral word stays', async () => {
    expect(await restate(msgs, {}, { complete: async () => ({ content: msgs[0].content }) })).toBeNull();
    expect(await restate(msgs, {}, { complete: async () => { throw new Error('x'); } })).toBeNull();
    expect(await restate(msgs, {}, { complete: () => new Promise(() => {}), timeoutMs: 10 })).toBeNull();
    expect(await restate([], {}, { complete: async () => ({ content: 'anything' }) })).toBeNull();
    expect(progressText('understand')).toBe(NEUTRAL);
  });
});

describe('tarpit', () => {
  it('a generic phrase, stable per seed, in the same shape as a real line', () => {
    expect(tarpitPhrase('k1')).toBe(tarpitPhrase('k1'));
    expect(understoodText(tarpitPhrase('k1'))).toMatch(/^Understood — .+\.$/);
    expect(understoodText(null)).toBeNull();
  });
  it('a tarpit turn that imitates research emits the neutral word, an understood line, then the stages (a refusal: no understood)', async () => {
    // the tarpit draws refusal/research at random (strikes.js); run until a research-shaped turn appears
    let events = [], refusals = 0;
    for (let i = 0; i < 40 && !events.some((e) => e.type === 'understood'); i++) {
      events = [];
      await anisTurn({ messages: msgs, clientKey: 'k', onEvent: (e) => events.push(e), deps: {
        open: async () => ({ conversationId: 'c1' }), close: async () => {}, strikes: { inTarpit: () => true, strike() {} },
        triage: async () => ({ kind: { choice: 'research' } }), respond: async () => ({ reply: 'x' }), outputCheck: async () => 0, sleep: async () => {} } }).catch(() => {});
      if (!events.some((e) => e.type === 'understood')) { refusals++; expect(events.map((e) => e.type)).not.toContain('sources'); }
    }
    const types = events.map((e) => e.type);
    expect(events.find((e) => e.type === 'stage')?.stage).toBe('understand');
    expect(types.indexOf('understood')).toBeGreaterThan(types.indexOf('stage'));
    expect(types.indexOf('understood')).toBeLessThan(events.findIndex((e) => e.type === 'stage' && e.stage === 'search'));
    expect(events.find((e) => e.type === 'understood').text).toMatch(/^Understood — /);
  });
});

describe('anisTurn', () => {
  const base = (over = {}) => ({ open: async () => ({ conversationId: 'c1' }), close: async () => {}, strikes: { inTarpit: () => false, strike() {} },
    triage: async () => ({ kind: { choice: 'research' } }), respond: async ({ onEvent }) => { await new Promise((r) => setTimeout(r, 5)); onEvent({ type: 'stage', stage: 'search' }); return { reply: 'x' }; },
    outputCheck: async () => 0, sleep: async () => {}, ...over });
  it('passes Jev\'s decision to the restatement and emits it before the search; the path records strategy, phrase and decisions', async () => {
    const events = []; let closed = null; const seenDecision = [];
    const strategy = async () => ({ strategy: { choice: 'comparison', confidence: 0.9 }, sides: ['Islam', 'Christian'], ms: 40, decisions: [{ point: 'strategy', by: 'jev', chosen: 'comparison' }] });
    await anisTurn({ messages: msgs, onEvent: (e) => events.push(e), deps: base({ strategy, close: async (args) => { closed = args; },
      restate: async (m, decision) => { seenDecision.push(decision); return { phrase: 'the two scriptures on prayer, side by side', text: 'Understood — the two scriptures on prayer, side by side.', ms: 5 }; } }) }).catch(() => {});
    expect(seenDecision[0]).toMatchObject({ strategy: 'comparison', sides: ['Islam', 'Christian'] });
    const types = events.map((e) => e.type);
    expect(types.indexOf('understood')).toBeLessThan(events.findIndex((e) => e.type === 'stage' && e.stage === 'search'));
    const path = closed?.path || closed;
    expect(JSON.stringify(path)).toMatch(/"understood":"the two scriptures on prayer, side by side"/);
    expect(JSON.stringify(path)).toMatch(/"chosen":"comparison"/);
  });
  it('no restatement without a decision helper (injected deps), none for refuse, and a late one is dropped', async () => {
    const events = [];
    await anisTurn({ messages: msgs, onEvent: (e) => events.push(e), deps: base() }).catch(() => {});
    expect(events.map((e) => e.type)).not.toContain('understood');
    const late = [];
    await anisTurn({ messages: msgs, onEvent: (e) => late.push(e), deps: base({ respond: async () => ({ reply: 'x' }), restate: () => new Promise((r) => setTimeout(() => r({ phrase: 'p', text: 'Understood — p.' }), 30)) }) }).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(late.map((e) => e.type)).not.toContain('understood');
  });
});
