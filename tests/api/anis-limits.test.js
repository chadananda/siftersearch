// F15: Anís chat kill switch and rate caps (per person, global), plus the wiring in turn().
import { describe, it, expect } from 'vitest';
import { makeLimits, PAUSED_REPLY } from '../../api/lib/assistant/limits.js';
import { anisTurn as turn } from '../../api/lib/assistant/turn.js';

describe('anis chat limits', () => {
  it('kill switch refuses everyone', () => expect(makeLimits({ env: { ANIS_CHAT_PAUSED: '1' } })('a')).toMatchObject({ reason: 'paused', reply: PAUSED_REPLY }));
  it('per-person cap, rolling hour', () => {
    let t = 0; const lim = makeLimits({ now: () => t, env: { ANIS_TURNS_PER_HOUR: '2' } });
    expect(lim('a')).toBeNull(); expect(lim('a')).toBeNull();
    expect(lim('a')?.reason).toBe('person'); expect(lim('b')).toBeNull();
    t = 3600_001; expect(lim('a')).toBeNull();
  });
  it('global cap', () => {
    const lim = makeLimits({ env: { ANIS_TURNS_GLOBAL_PER_HOUR: '2' } });
    lim('a'); lim('b'); expect(lim('c')?.reason).toBe('global');
  });
  it('turn() answers a capped message with the fixed reply and never reaches triage or research', async () => {
    const boom = () => { throw new Error('reached the model'); };
    const r = await turn({ messages: [{ role: 'user', content: 'hello' }], clientKey: 'k',
      deps: { limits: () => ({ reason: 'person', reply: 'later' }), triage: boom, respond: boom, open: boom, strikes: { inTarpit: () => false } } });
    expect(r).toMatchObject({ status: 'limited', reply: 'later' });
  });
});
