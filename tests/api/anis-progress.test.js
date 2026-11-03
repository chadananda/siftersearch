// Progress words, the "understood" line (no LLM) and per-conversation totals.
import { describe, it, expect } from 'vitest';
import { understoodLine, progressText, conversationTotals } from '../../api/lib/assistant/progress.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';

describe('progress', () => {
  it('understood line for research, none for canned/refuse', () => {
    expect(understoodLine({ action: 'research' }, 'What is the Most Great Peace?')).toMatch(/Most Great Peace/);
    expect(understoodLine({ action: 'canned' }, 'hi')).toBeNull();
    expect(understoodLine({ action: 'refuse' }, 'x')).toBeNull();
    expect(understoodLine({ action: 'research' }, 'a '.repeat(200)).length).toBeLessThan(200);
  });
  it('stage words', () => { expect(progressText('search')).toMatch(/Searching/); expect(progressText('nope')).toBeNull(); });
  it('conversation totals sum time and cost', () => {
    expect(conversationTotals([{ meta: { usd: 0.01, latency_ms: 2000, calls: 2 } }, { meta: { usd: null, latency_ms: 500 } }]))
      .toEqual({ turns: 2, usd: 0.01, ms: 2500, calls: 2 });
  });
  it('a research turn emits understood first, then progress for each stage', async () => {
    const events = [];
    await anisTurn({ messages: [{ role: 'user', content: 'Where does Abdu\'l-Baha speak of the oneness of mankind?' }], onEvent: (e) => events.push(e), deps: {
      open: async () => ({ conversationId: 'c1' }), close: async () => {}, strikes: { inTarpit: () => false, strike() {} },
      triage: async () => ({ kind: { choice: 'research' } }),
      respond: async ({ onEvent }) => { onEvent({ type: 'stage', stage: 'search' }); onEvent({ type: 'stage', stage: 'craft' }); return { reply: 'Here.' }; },
      outputCheck: async () => 0, sleep: async () => {} } }).catch(() => {});
    const types = events.map((e) => e.type);
    expect(types).toContain('understood');
    expect(types.indexOf('understood')).toBeLessThan(types.indexOf('stage'));
    expect(events.filter((e) => e.type === 'progress').map((e) => e.stage)).toEqual(['search', 'craft']);
  });
});
