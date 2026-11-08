// Daily spend caps (api/lib/spend-caps.js + config/spend-caps.json): caller→group, the dated anis schedule, blocking, one alert per group per day,
// the Anís polite reply, and the typed error queue callers treat as retry-later.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})), dailySpendByProvider: vi.fn(async () => ({})) }));
import { groupOf, capFor, dayOf, assertSpendCap, capStatus, isSpendCap, SpendCapError, waitMs, _reset, providerCapFor, noteCreditOut, TEST_BILL_TO } from '../../api/lib/spend-caps.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { withAIContext, currentAIContext } from '../../api/lib/ai-context.js';
import { SPEND_CAP_REPLY } from '../../api/lib/assistant/limits.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const spend = (o) => ({ byCaller: async () => o });
beforeEach(() => _reset());

describe('caller → group', () => {
  it('media-*, anis-* (and Jev, sourcehunt), everything else', () => {
    expect(groupOf('media-clean-strong')).toBe('media');
    expect(groupOf('media-assess')).toBe('media');
    for (const c of ['anis-turn', 'assistant-writer', 'system1:strategy', 'sourcehunt-x', 'turn-resolver']) expect(groupOf(c)).toBe('anis');
    for (const c of ['corpus-rag', 'segmenter', 'embedding', 'hype-batch', '', null, undefined]) expect(groupOf(c)).toBe('other');
  });
});

describe('the dated schedule', () => {
  it('anis: $30 through 11-07, $20 from 11-08; media 40 → 20 from 11-06; improve 5 from 11-06; other 10; the env overrides', () => {
    expect(capFor('anis', '2026-11-04')).toBe(30);
    expect(capFor('anis', '2026-11-07')).toBe(30);
    expect(capFor('anis', '2026-11-08')).toBe(20);
    expect(capFor('anis', '2027-01-01')).toBe(20);
    expect(capFor('media', '2026-11-04')).toBe(40);
    expect(capFor('media', '2026-11-06')).toBe(20);   // Chad 11-06
    expect(capFor('improve', '2026-11-06')).toBe(5);   // Chad 11-06
    expect(capFor('improve', '2026-11-07')).toBe(0);   // Chad 11-07: paused (consolidate)
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
    const s = await capStatus({ now, deps: spend({ 'media-x': 20, 'corpus-rag': 1 }) });
    expect(s.find((g) => g.group === 'media')).toMatchObject({ spent_usd: 20, cap_usd: 20, remaining_usd: 0, blocking: true });
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
  it('a group paused at $0 waits but never mails (paused on purpose is not broken)', async () => {
    _reset();
    const sendEmail = vi.fn(async () => {}), alert = { sendEmail, dir: mkdtempSync(join(tmpdir(), 'cap-')), to: 'a@b.c', now };
    await expect(assertSpendCap('improve-judge', { now, deps: { ...spend({}), alert } })).rejects.toMatchObject({ code: 'SPEND_CAP', group: 'improve' });
    expect(sendEmail).not.toHaveBeenCalled();
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

describe('the Anthropic-wide cap (Chad 11-06: "cap anthropic costs to $20/day. when it hits that budget, queue up the work")', () => {
  const NOW = Date.parse('2026-11-06T12:00:00Z');
  const deps = (provider, caller = {}) => ({ byCaller: async () => caller, byProvider: async () => provider, alert: { send: async () => {} } });
  it('$20 a day from 11-06; background work stops at $15 so live Anís replies keep the last $5', () => {
    expect(providerCapFor('anthropic', '2026-11-06')).toEqual({ usd: 20, background_usd: 15 });
    expect(providerCapFor('anthropic', '2026-11-05')).toBe(null);
    expect(providerCapFor('openai', '2026-11-06')).toBe(null);
    expect(providerCapFor('anthropic', '2026-11-06', undefined, { SPEND_CAP_ANTHROPIC_TOTAL_USD: '7' })).toEqual({ usd: 7, background_usd: 7 });
  });
  it('every group counts: improve, media and other wait at $15 of Anthropic spend; anis at $20; other providers unaffected', async () => {
    for (const c of ['improve-judge', 'media-clean-strong', 'segmenter']) {
      _reset();
      await expect(assertSpendCap(c, { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 15.01 }) })).rejects.toMatchObject({ code: 'SPEND_CAP', group: 'anthropic-total' });
    }
    _reset();
    await expect(assertSpendCap('improve-judge', { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 14.9 }) })).resolves.toBeUndefined();
    _reset();
    await expect(assertSpendCap('anis-agent', { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 19 }) })).resolves.toBeUndefined();
    _reset();
    await expect(assertSpendCap('anis-agent', { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 20 }) })).rejects.toMatchObject({ group: 'anthropic-total' });
    _reset();
    await expect(assertSpendCap('improve-judge', { provider: 'google', now: NOW, deps: deps({ anthropic: 50 }) })).resolves.toBeUndefined();
  });
  it('the refusal is a wait until the next UTC day (queue work keeps its place)', async () => {
    const err = await assertSpendCap('media-assess', { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 16 }) }).catch((e) => e);
    expect(isSpendCap(err)).toBe(true);
    expect(err.retryAfterMs).toBe(waitMs(NOW));
  });
  it('capStatus shows the provider row', async () => {
    const rows = await capStatus({ now: NOW, deps: deps({ anthropic: 16 }) });
    expect(rows.find((r) => r.group === 'anthropic-total')).toMatchObject({ spent_usd: 16, cap_usd: 20, background_cap_usd: 15, blocking: false, background_blocking: true });
  });
});

describe('real readers are never capped; tests and analysis bill to improve (Chad 11-06)', () => {
  const NOW = Date.parse('2026-11-06T12:00:00Z');
  const deps = (provider, caller = {}) => ({ byCaller: async () => caller, byProvider: async () => provider, alert: { send: async () => {} } });
  it('an organic Anís call passes every cap; the same call in a test scope stops at the improve cap', async () => {
    _reset();
    await expect(withAIContext({ organic: true }, () => assertSpendCap('anis-agent', { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 50 }, { 'anis-agent': 40 }) }))).resolves.toBeUndefined();
    _reset();
    await expect(withAIContext({ organic: false, billTo: TEST_BILL_TO }, () => assertSpendCap('anis-agent', { provider: 'anthropic', now: NOW, deps: deps({ anthropic: 1 }, { [TEST_BILL_TO]: 6 }) })))
      .rejects.toMatchObject({ group: 'improve' });
  });
  it('battery-judge and exchange-audit are analysis: the improve group', () => {
    expect(groupOf('battery-judge')).toBe('improve');
    expect(groupOf('exchange-audit')).toBe('improve');
    expect(groupOf('anis-craft')).toBe('anis');
  });
  it('anisTurn marks a reader\'s turn organic and a test turn billed to improve', async () => {
    const seen = [];
    const d = { open: async () => ({ conversationId: 'c1', round: 0 }), close: async () => {}, fail: async () => {}, spendCap: async () => { seen.push({ ...currentAIContext() }); },
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' } }),
      respond: async () => ({ reply: 'x', citations: [], retrieved: [], plan: {}, timings: {} }), outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    const turn = (test) => anisTurn({ messages: [{ role: 'user', content: 'What is the Covenant?' }], participant: { id: 's1' }, clientKey: 's1', onEvent: () => {}, deps: d, test });
    await turn(false); await turn(true);
    expect(seen[0]).toMatchObject({ organic: true }); expect(seen[0].billTo).toBeUndefined();
    expect(seen[1]).toMatchObject({ organic: false, billTo: TEST_BILL_TO });
  });
});

describe('out of credit → wait, not fail (11-06: 40,375 failed calls in 6 h on an empty balance)', () => {
  const NOW = Date.parse('2026-11-06T12:00:00Z');
  it('the provider\'s credit refusal becomes a SpendCapError, and later calls wait without asking the provider', async () => {
    const e = noteCreditOut('anthropic', { status: 400, message: 'Your credit balance is too low to access the Anthropic API.' }, NOW);
    expect(isSpendCap(e)).toBe(true);
    expect(e.credit).toBe(true);
    await expect(assertSpendCap('improve-judge', { provider: 'anthropic', now: NOW + 60_000, deps: spend({}) })).rejects.toMatchObject({ group: 'anthropic-credit' });
    await expect(assertSpendCap('improve-judge', { provider: 'anthropic', now: NOW + 16 * 60_000, deps: { ...spend({}), byProvider: async () => ({}) } })).resolves.toBeUndefined();
  });
  it('an ordinary error stays an ordinary error', () => {
    expect(noteCreditOut('anthropic', { status: 529, message: 'Overloaded' })).toBe(null);
    expect(noteCreditOut('anthropic', { status: 429, message: 'rate limit: requests per minute' })).toBe(null);
  });
});

describe('isTestTurn (mail): the battery sender or test:true is a test turn', () => {
  it('matches test senders only', async () => {
    const { isTestTurn } = await import('../../api/routes/assistant-mail.js');
    expect(isTestTurn({ email: 'battery@siftersearch.com' })).toBe(true);
    expect(isTestTurn({ email: 'Battery+eval-x@siftersearch.com' })).toBe(true);
    expect(isTestTurn({ email: 'reader@gmail.com', test: true })).toBe(true);
    expect(isTestTurn({ email: 'reader@gmail.com' })).toBe(false);
    expect(isTestTurn({ email: 'battery@gmail.com' })).toBe(false);
  });
});
