// Daily spend caps (api/lib/spend-caps.js + config/spend-caps.json): caller→group, the dated anis schedule, blocking, one alert per group per day,
// the Anís polite reply, and the typed error queue callers treat as retry-later.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { groupOf, capFor, dayOf, assertSpendCap, capStatus, isSpendCap, SpendCapError, waitMs, _reset } from '../../api/lib/spend-caps.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { SPEND_CAP_REPLY } from '../../api/lib/assistant/limits.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const spend = (o) => ({ byCaller: async () => o });
beforeEach(() => _reset());

describe('caller → group', () => {
  it('media-*, anis-* (and Jev, sourcehunt, the battery judge), everything else', () => {
    expect(groupOf('media-clean-strong')).toBe('media');
    expect(groupOf('media-assess')).toBe('media');
    for (const c of ['anis-turn', 'assistant-writer', 'system1:strategy', 'sourcehunt-x', 'battery-judge', 'turn-resolver']) expect(groupOf(c)).toBe('anis');
    for (const c of ['corpus-rag', 'segmenter', 'embedding', 'hype-batch', '', null, undefined]) expect(groupOf(c)).toBe('other');
  });
});

describe('the dated schedule', () => {
  it('anis: $30 through 11-07, $20 from 11-08; media 40; other 10; the env overrides', () => {
    expect(capFor('anis', '2026-11-04')).toBe(30);
    expect(capFor('anis', '2026-11-07')).toBe(30);
    expect(capFor('anis', '2026-11-08')).toBe(20);
    expect(capFor('anis', '2027-01-01')).toBe(20);
    expect(capFor('media', '2026-11-04')).toBe(40);
    expect(capFor('other', '2026-11-04')).toBe(10);
    expect(capFor('anis', '2026-11-04', undefined, { SPEND_CAP_ANIS_USD: '5' })).toBe(5);
    expect(capFor('anis', '2026-11-03')).toBe(Infinity);   // before the first entry: no cap
  });
});

describe('the improvement cycle group (Chad 11-04)', () => {
  it('improve-* is its own group (ahead of anis); a large start budget (Chad 11-04: cover everything, reduce over time), env overrides', () => {
    expect(groupOf('improve-judge')).toBe('improve');
    expect(groupOf('improve-analysis')).toBe('improve');
    expect(capFor('improve', '2026-11-04', undefined, {})).toBe(200);
    expect(capFor('improve', '2026-11-04', undefined, { IMPROVE_DAILY_USD: '5' })).toBe(5);
    expect(capFor('improve', '2026-11-04', undefined, { IMPROVE_DAILY_USD: '5', SPEND_CAP_IMPROVE_USD: '7' })).toBe(7);
    expect(capFor('anis', '2026-11-04', undefined, { IMPROVE_DAILY_USD: '5' })).toBe(30);
  });
});

describe('blocking at the cap', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  it('passes under the cap, throws SPEND_CAP at it, and reads the group sum across its callers', async () => {
    await assertSpendCap('anis-turn', { now, deps: spend({ 'anis-turn': 5, 'system1:x': 10 }) });
    _reset();
    const err = await assertSpendCap('anis-turn', { now, deps: spend({ 'anis-turn': 12, 'system1:x': 8.5, 'media-assess': 99 }) }).catch((e) => e);
    expect(err).toBeInstanceOf(SpendCapError);
    expect(isSpendCap(err)).toBe(true);
    expect(err).toMatchObject({ code: 'SPEND_CAP', group: 'anis', cap: 20 });
    expect(err.retryAfterMs).toBeGreaterThanOrEqual(60_000);
  });
  it('one group at its cap does not block another; local providers and exempt callers pass', async () => {
    const deps = spend({ 'media-assess': 41, 'search-query': 50 });
    await expect(assertSpendCap('media-assess', { now, deps })).rejects.toMatchObject({ code: 'SPEND_CAP' });
    await assertSpendCap('anis-turn', { now, deps });
    await assertSpendCap('media-assess', { now, deps, provider: 'ollama' });
    await assertSpendCap('search-query', { now, deps });   // exempt: counted, never refused
  });
  it('the status lists each group with remaining and blocking; a failed read does not block', async () => {
    const s = await capStatus({ now, deps: spend({ 'media-x': 40, 'corpus-rag': 1 }) });
    expect(s.find((g) => g.group === 'media')).toMatchObject({ spent_usd: 40, cap_usd: 40, remaining_usd: 0, blocking: true });
    expect(s.find((g) => g.group === 'anis')).toMatchObject({ cap_usd: 20, blocking: false });
    _reset();
    await assertSpendCap('media-x', { now, deps: { byCaller: async () => { throw new Error('db locked'); } } });
  });
  it('waits at most 30 minutes and at least a minute', () => {
    expect(waitMs(Date.parse('2026-11-08T00:00:00Z'))).toBe(30 * 60_000);
    expect(waitMs(Date.parse('2026-11-08T23:59:30Z'))).toBe(60_000);
    expect(dayOf(Date.parse('2026-11-08T23:59:59Z'))).toBe('2026-11-08');
  });
});

describe('one alert per group per day, only when the cap blocks a call', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  it('mails once for many refused calls; nothing while under the cap; another group mails again', async () => {
    const sendEmail = vi.fn(async () => {}), alert = { sendEmail, dir: mkdtempSync(join(tmpdir(), 'cap-')), to: 'a@b.c', now };
    await assertSpendCap('media-assess', { now, deps: { ...spend({ 'media-assess': 10 }), alert } });
    expect(sendEmail).not.toHaveBeenCalled();
    _reset();
    const over = { ...spend({ 'media-assess': 41, 'anis-turn': 25 }), alert };
    for (let i = 0; i < 5; i++) await assertSpendCap('media-assess', { now, deps: over }).catch(() => {});
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/media spend cap/);
    await assertSpendCap('anis-turn', { now, deps: over }).catch(() => {});
    expect(sendEmail).toHaveBeenCalledTimes(2);
    _reset();   // another process: the stamp file still holds the day
    await assertSpendCap('media-assess', { now, deps: over }).catch(() => {});
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

describe('Anís at the cap', () => {
  const base = (over = {}) => {
    const calls = { open: 0, fail: 0, respond: 0 }, events = [];
    const deps = { open: async () => { calls.open++; return { conversationId: 'c1', round: 0 }; }, close: async () => {}, fail: async () => { calls.fail++; },
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' } }),
      respond: async () => { calls.respond++; return { reply: 'x', citations: [], retrieved: [], plan: {}, timings: {} }; }, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {}, ...over };
    return { calls, events, run: () => anisTurn({ messages: [{ role: 'user', content: 'What is the Covenant?' }], participant: { id: 's1' }, clientKey: 's1', onEvent: (e) => events.push(e), deps }) };
  };
  const capErr = () => new SpendCapError({ group: 'anis', spent: 20, cap: 20, caller: 'anis-turn', retryAfterMs: 60_000 });
  it('the pre-check answers politely: no LLM, no throw, status limited', async () => {
    const h = base({ spendCap: async () => { throw capErr(); } });
    const r = await h.run();
    expect(r).toMatchObject({ reply: SPEND_CAP_REPLY, status: 'limited', limit: 'spend-cap' });
    expect(SPEND_CAP_REPLY).toMatch(/today's limit/);
    expect(h.calls.respond).toBe(0);
    expect(h.events).toContainEqual({ type: 'text', content: SPEND_CAP_REPLY });
  });
  it('a cap reached mid-turn also becomes the polite reply, and the exchange is failed cleanly', async () => {
    const h = base({ respond: async () => { throw capErr(); } });
    const r = await h.run();
    expect(r).toMatchObject({ reply: SPEND_CAP_REPLY, status: 'limited' });
    expect(h.calls.fail).toBe(1);
  });
  it('any other error still throws', async () => {
    await expect(base({ respond: async () => { throw new Error('boom'); } }).run()).rejects.toThrow('boom');
  });
});
