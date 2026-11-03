// Progress words, the "understood" line (Jev's decision restated, never an echo) and per-conversation totals.
import { describe, it, expect } from 'vitest';
import { progressText, NEUTRAL, conversationTotals } from '../../api/lib/assistant/progress.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';

const deps = (extra = {}) => ({
  open: async () => ({ conversationId: 'c1' }), close: async () => {}, strikes: { inTarpit: () => false, strike() {} },
  triage: async () => ({ kind: { choice: 'research' } }),
  respond: async ({ onEvent }) => { await new Promise((r) => setTimeout(r, 5)); onEvent({ type: 'stage', stage: 'search' }); onEvent({ type: 'stage', stage: 'craft' }); return { reply: 'Here.' }; },
  outputCheck: async () => 0, sleep: async () => {}, strategy: async () => null, restate: async () => ({ phrase: 'the oneness of mankind in ‘Abdu’l-Bahá’s talks', text: 'Understood — the oneness of mankind in ‘Abdu’l-Bahá’s talks.', ms: 3 }), ...extra });

describe('progress', () => {
  it('stage words: understand is neutral, search/craft named', () => {
    expect(progressText('understand')).toBe(NEUTRAL); expect(progressText('search')).toMatch(/Searching/); expect(progressText('nope')).toBeNull();
  });
  it('conversation totals sum time and cost', () => {
    expect(conversationTotals([{ meta: { usd: 0.01, latency_ms: 2000, calls: 2 } }, { meta: { usd: null, latency_ms: 500 } }]))
      .toEqual({ turns: 2, usd: 0.01, ms: 2500, calls: 2 });
  });
  it('a research turn: neutral understand stage first, then the restated decision, then progress per stage', async () => {
    const events = [];
    await anisTurn({ messages: [{ role: 'user', content: 'Where does Abdu\'l-Baha speak of the oneness of mankind?' }], onEvent: (e) => events.push(e), deps: deps() }).catch(() => {});
    const types = events.map((e) => e.type);
    expect(events[0]).toEqual({ type: 'stage', stage: 'understand' });
    expect(events[1]).toEqual({ type: 'progress', stage: 'understand', text: NEUTRAL });
    expect(types).toContain('understood');
    expect(types.indexOf('understood')).toBeLessThan(events.findIndex((e) => e.type === 'stage' && e.stage === 'craft'));
    const u = events.find((e) => e.type === 'understood');
    expect(u.text).toMatch(/^Understood — /); expect(u.text).not.toMatch(/Where does/);
    expect(events.filter((e) => e.type === 'progress').map((e) => e.stage)).toEqual(['understand', 'search', 'craft']);
  });
  it('no understood line for a canned turn', async () => {
    const events = [];
    await anisTurn({ messages: [{ role: 'user', content: 'hi' }], onEvent: (e) => events.push(e), deps: deps({ triage: async () => ({ kind: { choice: 'thanks', confidence: 0.95 } }), respond: async () => ({ reply: 'Hello.' }) }) }).catch(() => {});
    expect(events.map((e) => e.type)).not.toContain('understood');
  });
});
