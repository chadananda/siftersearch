// Message Batches client (Chad 11-04 "use batch mode"): coalescing, custom_id mapping, per-request errors, restart adoption,
// poll backoff, submit retry; ask() routing (batch vs sync roles); roleBatchCreate logs usage batch=true. Fake transport + clock.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const usageLog = [];
vi.mock('../../api/lib/ai-services.js', () => ({ logAIUsage: (u) => usageLog.push(u) }));

const { BatchClient, batchKey, toCompat } = await import('../../api/lib/anthropic-batch.js');
const { roleBatchCreate } = await import('../../api/lib/role-client.js');
const { askModel, costOf, fanoutFor } = await import('../../api/lib/media/llm.js');
const { batchRole, mediaLlmBatching } = await import('../../api/lib/model-roles.js');

const msg = (text, u = { input_tokens: 100, output_tokens: 20 }) => ({ id: 'msg_x', model: 'claude-haiku-5-5', stop_reason: 'end_turn',
  content: [{ type: 'text', text }], usage: u });
const params = (prompt) => ({ model: 'claude-haiku-5-5', max_tokens: 100, messages: [{ role: 'user', content: prompt }] });

/** A fake batches API: create records bodies; retrieve says `ended` after `pollsUntilEnd` polls; results reply per custom_id. */
function fakeApi({ reply = (p) => ({ type: 'succeeded', message: msg(`re:${p.messages[0].content}`) }), pollsUntilEnd = 1, reverse = true } = {}) {
  const api = { creates: [], polls: 0, batches: new Map(),
    async create(body) { const id = `msgbatch_${api.creates.length + 1}`; api.creates.push(body); api.batches.set(id, body); return { id, processing_status: 'in_progress' }; },
    async retrieve(id) { api.polls++; return { id, processing_status: api.polls >= pollsUntilEnd ? 'ended' : 'in_progress' }; },
    async results(id) {
      const lines = api.batches.get(id).requests.map((r) => ({ custom_id: r.custom_id, result: reply(r.params) }));
      if (reverse) lines.reverse();   // results arrive in any order
      return (async function* () { yield* lines; })();
    } };
  return api;
}
const tmpState = () => join(mkdtempSync(join(tmpdir(), 'abatch-')), 'anthropic-batches.json');
const flushAll = () => new Promise((r) => setTimeout(r, 0));
function client(api, extra = {}) {
  const sleeps = [];
  const c = new BatchClient({ api, statePath: tmpState(), windowMs: 5, sleep: async (ms) => { sleeps.push(ms); }, ...extra });
  return Object.assign(c, { sleeps });
}

describe('BatchClient', () => {
  it('coalesces requests in the window into ONE batch and resolves each caller by custom_id (any order)', async () => {
    const api = fakeApi();
    const c = client(api);
    const outs = await Promise.all(['a', 'b', 'c'].map((p) => c.submit({ role: 'media-correct', params: params(p) })));
    expect(api.creates).toHaveLength(1);
    expect(api.creates[0].requests.map((r) => r.custom_id)).toEqual(['a', 'b', 'c'].map((p) => batchKey('media-correct', params(p))));
    expect(api.creates[0].requests[0].custom_id).toMatch(/^[a-f0-9]{64}$/);
    expect(outs.map((o) => o.choices[0].message.content)).toEqual(['re:a', 're:b', 're:c']);
    expect(outs[0].usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 20 });
  });

  it('maxRequests splits a big window into several batches', async () => {
    const api = fakeApi();
    const c = client(api, { maxRequests: 2 });
    await Promise.all(['a', 'b', 'c'].map((p) => c.submit({ role: 'r', params: params(p) })));
    expect(api.creates.map((b) => b.requests.length)).toEqual([2, 1]);
  });

  it('an errored / expired result rejects ONLY its own caller', async () => {
    const api = fakeApi({ reply: (p) => (p.messages[0].content === 'bad' ? { type: 'errored', error: { type: 'error', error: { type: 'invalid_request_error', message: 'nope' } } }
      : p.messages[0].content === 'old' ? { type: 'expired' } : { type: 'succeeded', message: msg('ok') }) });
    const c = client(api);
    const rs = await Promise.allSettled(['good', 'bad', 'old'].map((p) => c.submit({ role: 'r', params: params(p) })));
    expect(rs.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    expect(rs[1].reason.message).toMatch(/errored: invalid_request_error nope/);
    expect(rs[2].reason.batchResult).toBe('expired');
  });

  it('the same request twice in flight shares one batch request; only the first is billed', async () => {
    const api = fakeApi();
    const c = client(api);
    const [a, b] = await Promise.all([c.submit({ role: 'r', params: params('x') }), c.submit({ role: 'r', params: params('x') })]);
    expect(api.creates[0].requests).toHaveLength(1);
    expect([a.billed, b.billed]).toEqual([true, false]);
  });

  it('persists submitted batches; a restarted client ADOPTS the pending batch instead of resubmitting', async () => {
    const statePath = tmpState();
    const api = fakeApi({ pollsUntilEnd: 1e9 });     // never ends while the first process lives
    const first = new BatchClient({ api, statePath, windowMs: 1, sleep: () => new Promise(() => {}) });
    first.submit({ role: 'r', params: params('p') }).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    const saved = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(saved.batches).toHaveLength(1);
    expect(saved.batches[0]).toMatchObject({ id: 'msgbatch_1', keys: [batchKey('r', params('p'))] });

    api.polls = 0; Object.assign(api, { retrieve: async (id) => ({ id, processing_status: 'ended' }) });
    const second = new BatchClient({ api, statePath, windowMs: 1, sleep: async () => {} });
    const out = await second.submit({ role: 'r', params: params('p') });
    expect(api.creates).toHaveLength(1);              // adopted, not resubmitted
    expect(out.choices[0].message.content).toBe('re:p');
    expect(JSON.parse(readFileSync(statePath, 'utf8')).batches).toHaveLength(0);   // consumed → pruned
  });

  it('prunes state entries older than 29 days', () => {
    const c = client(fakeApi(), { now: () => 30 * 86_400_000 });
    c.state = { batches: [{ id: 'old', created: 0, keys: ['k'] }, { id: 'new', created: 29.5 * 86_400_000, keys: ['k2'] }] };
    c.prune();
    expect(c.state.batches.map((b) => b.id)).toEqual(['new']);
  });

  it('polls with backoff from 30 s ×1.5 up to the 5 min cap', async () => {
    const api = fakeApi({ pollsUntilEnd: 9 });
    const c = client(api);
    await c.submit({ role: 'r', params: params('p') });
    expect(c.sleeps).toEqual([30000, 45000, 67500, 101250, 151875, 227813, 300000, 300000, 300000]);
  });

  it('retries a 429 / 5xx on submit with backoff; a 400 fails the window at once', async () => {
    const api = fakeApi();
    const create = api.create;
    let n = 0;
    api.create = async (b) => { if (n++ < 2) throw Object.assign(new Error('429 rate_limit_error'), { status: 429 }); return create(b); };
    const c = client(api);
    const out = await c.submit({ role: 'r', params: params('p') });
    expect(out.choices[0].message.content).toBe('re:p');
    expect(c.sleeps.slice(0, 2)).toEqual([5000, 15000]);

    const bad = fakeApi(); bad.create = async () => { throw Object.assign(new Error('400 invalid_request_error'), { status: 400 }); };
    await expect(client(bad).submit({ role: 'r', params: params('p') })).rejects.toThrow(/400/);
  });

  it('the spend gate runs at submit: a disallowed request is refused before anything is queued', () => {
    const api = fakeApi();
    expect(() => client(api).submit({ role: 'some-job', params: { ...params('p'), model: 'claude-sonnet-4-6' } })).toThrow(/spend policy/i);
    expect(api.creates).toHaveLength(0);
  });

  it('toCompat: prompt_tokens is the whole prompt (cache read + write included)', () => {
    const r = toCompat(msg('t', { input_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 5, output_tokens: 3 }));
    expect(r.usage).toEqual({ prompt_tokens: 65, completion_tokens: 3, cached_tokens: 50, cache_write_tokens: 5 });
  });
});

describe('routing', () => {
  beforeEach(() => { usageLog.length = 0; delete process.env.MEDIA_LLM_BATCH; });

  it('media roles are batch roles; interactive roles are not; MEDIA_LLM_BATCH=0 is the kill switch', () => {
    for (const r of ['media-meta', 'media-correct', 'media-clean', 'media-clean-strong', 'media-assess', 'media-headings', 'media-quotes', 'media-verify'])
      expect(batchRole(r), r).toBe(true);
    expect(batchRole('media-people')).toBe(false);
    expect(batchRole('chat-answer')).toBe(false);
    expect(batchRole('media-correct', { MEDIA_LLM_BATCH: '0' })).toBe(false);
    expect(mediaLlmBatching({ MEDIA_LLM_BATCH: '0' })).toBe(false);
    expect(fanoutFor('media-correct')).toBe(Infinity);
  });

  it('ask() sends a batch role through batchCreate (no gate) and counts spend at the batch rate', async () => {
    const batchCreate = vi.fn(async () => ({ ...toCompat(msg('{"ok":1}', { input_tokens: 1000, output_tokens: 1000 })), billed: true }));
    const create = vi.fn();
    const spend = {};
    const out = await askModel('media-correct', 'hi', { batchCreate, create, spend });
    expect(out).toEqual({ ok: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(batchCreate.mock.calls[0][1]).toMatchObject({ max_tokens: 6000, messages: [{ role: 'user', content: 'hi' }] });
    expect(spend.usd).toBeCloseTo(costOf('media-correct', { prompt_tokens: 1000, completion_tokens: 1000 }) / 2);
    expect(spend.batched).toBe(1);
  });

  it('ask() keeps a non-batch role (and the kill switch) on the synchronous path', async () => {
    const res = { choices: [{ message: { content: '{"ok":2}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    const batchCreate = vi.fn();
    const create = vi.fn(async () => res);
    expect(await askModel('media-people', 'hi', { create, batchCreate })).toEqual({ ok: 2 });
    process.env.MEDIA_LLM_BATCH = '0';
    expect(await askModel('media-correct', 'hi', { create, batchCreate })).toEqual({ ok: 2 });
    expect(batchCreate).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('roleBatchCreate shapes native params (model, thinking) and logs usage batch=true with real tokens, once per billed request', async () => {
    const submit = vi.fn(async () => ({ ...toCompat(msg('x', { input_tokens: 40, cache_read_input_tokens: 60, output_tokens: 7 })), billed: true }));
    await roleBatchCreate('media-correct', { max_tokens: 500, messages: [{ role: 'user', content: 'p' }] }, { client: { submit } });
    const { role, params: p } = submit.mock.calls[0][0];
    expect(role).toBe('media-correct');
    expect(p).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 500, messages: [{ role: 'user', content: 'p' }] });
    expect(p.temperature).toBeUndefined();
    expect(usageLog).toHaveLength(1);
    expect(usageLog[0]).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5', caller: 'media-correct', batch: true,
      promptTokens: 100, completionTokens: 7, cachedTokens: 60 });
    submit.mockResolvedValueOnce({ ...toCompat(msg('x')), billed: false });
    await roleBatchCreate('media-correct', { max_tokens: 500, messages: [{ role: 'user', content: 'p' }] }, { client: { submit } });
    expect(usageLog).toHaveLength(1);
  });

  it('roleBatchCreate refuses a role that does not resolve to Anthropic', async () => {
    await expect(roleBatchCreate('media-people-not-a-role', { messages: [] }, { client: { submit: vi.fn() } })).rejects.toThrow();
  });
});
