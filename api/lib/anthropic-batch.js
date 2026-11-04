// Anthropic Message Batches (half price, Chad 11-04: "yes, definitely use batch mode") for OFFLINE roles. Requests arriving
// within a short window coalesce into ONE batch; each caller is resolved by custom_id = sha256(role|model|max_tokens|prompt)
// with a chat.completions-shaped response (what roleCreate returns). Submitted batches persist to a JSON file, so a restarted
// process ADOPTS a pending or ended batch instead of resubmitting (and paying twice). Never falls back to a synchronous call.
// A sanctioned Anthropic client (scripts/check-anthropic-imports.js): every request passes the spend gate again at submit.
// Deps: @anthropic-ai/sdk (messages.batches), anthropic-policy, node:crypto, node:fs. Server-only (never in the worker bundle).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from './logger.js';
import { assertAnthropicAllowed } from './anthropic-policy.js';

const DAY = 86_400_000;
const KEEP_MS = 29 * DAY;                       // batch results are downloadable for 29 days
const envN = (k, d) => (Number(process.env[k]) > 0 ? Number(process.env[k]) : d);
const RETRYABLE = /\b(429|500|502|503|504|529)\b|rate.?limit|overloaded|timed? ?out|ECONNRESET|ETIMEDOUT|fetch failed|connection error/i;

/** The request's identity: same role, model, max_tokens, prompt (and thinking) → same result. 64 hex chars = the custom_id limit. */
export function batchKey(role, params) {
  return createHash('sha256').update(JSON.stringify([role, params.model, params.max_tokens, params.messages, params.thinking ?? null])).digest('hex');
}

/** A native Messages API message → the chat.completions shape callers already parse (text blocks joined; thinking left out). */
export function toCompat(message) {
  const blocks = message?.content || [];
  const u = message?.usage || {};
  const cached = u.cache_read_input_tokens || 0, written = u.cache_creation_input_tokens || 0;
  return {
    id: message?.id, model: message?.model, object: 'chat.completion', batch: true,
    choices: [{ index: 0, finish_reason: message?.stop_reason ?? null,
      message: { role: 'assistant', content: blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('') } }],
    // prompt_tokens is the WHOLE prompt (as the compat endpoint reports it); cached/written are subsets of it
    usage: { prompt_tokens: (u.input_tokens || 0) + cached + written, completion_tokens: u.output_tokens || 0, cached_tokens: cached, cache_write_tokens: written },
    content: blocks, stop_reason: message?.stop_reason ?? null,
  };
}

/** The SDK's batches surface ({ create, retrieve, results }) — the default transport. */
async function sdkBatches({ apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  return {
    create: (body) => client.messages.batches.create(body),
    retrieve: (id) => client.messages.batches.retrieve(id),
    results: (id) => client.messages.batches.results(id),
  };
}

export class BatchClient {
  /** api: { create(body), retrieve(id), results(id) → async iterable }; now/sleep: the clock (tests inject both). */
  constructor({ api = null, statePath = process.env.ANTHROPIC_BATCH_STATE || 'data/run/anthropic-batches.json',
    windowMs = envN('ANTHROPIC_BATCH_WINDOW_MS', 2000), maxRequests = envN('ANTHROPIC_BATCH_MAX', 200),
    pollStartMs = envN('ANTHROPIC_BATCH_POLL_MS', 30_000), pollMaxMs = envN('ANTHROPIC_BATCH_POLL_MAX_MS', 300_000), pollFactor = 1.5,
    submitRetryMs = [5000, 15_000, 45_000, 120_000, 300_000], now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref?.()), log = null } = {}) {
    Object.assign(this, { api, statePath, windowMs, maxRequests, pollStartMs, pollMaxMs, pollFactor, submitRetryMs, now, sleep, log });
    this.waiters = new Map();     // key → [{ resolve, reject }] (callers in this process)
    this.ready = new Map();       // key → result line, ended batch results nobody here has asked for yet (adopted after a restart)
    this.pending = [];            // [{ key, params }] the open window
    this.timer = null;
    this.polling = new Map();     // batch id → poll promise
    this.state = null;            // { batches: [{ id, created, ended, keys: [] }] }
  }

  // ── persistence ──
  load() {
    if (this.state) return this.state;
    try { this.state = JSON.parse(readFileSync(this.statePath, 'utf8')); } catch { this.state = null; }
    if (!Array.isArray(this.state?.batches)) this.state = { batches: [] };
    this.prune();
    return this.state;
  }
  save() {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state, null, 1));
      renameSync(tmp, this.statePath);
    } catch (err) { this.log?.(`anthropic-batch: state not saved (${err.message})`); }
  }
  /** Drop batches whose every key was consumed, and anything past the 29-day result window. */
  prune() {
    const cut = this.now() - KEEP_MS;
    this.state.batches = this.state.batches.filter((b) => b.keys?.length && (b.created || 0) > cut);
  }
  entryFor(key) { return this.load().batches.find((b) => b.keys.includes(key)); }
  consume(key) {
    const b = this.entryFor(key);
    if (!b) return;
    b.keys = b.keys.filter((k) => k !== key);
    this.prune(); this.save();
  }

  // ── the caller's side ──
  /** → Promise of the compat response for this request (native Messages params). Rejects with the batch error for this
   *  request alone; never retried synchronously. */
  submit({ role, params }) {
    const key = batchKey(role, params);
    assertAnthropicAllowed({ provider: 'anthropic', model: params.model, stage: `interactive:${role}`, caller: role });   // fail closed, before anything is queued
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      if (this.waiters.has(key)) { this.waiters.get(key).push(w); return; }   // the same request in flight here: share it
      this.waiters.set(key, [w]);
      if (this.ready.has(key)) { const line = this.ready.get(key); this.ready.delete(key); this.settle(key, line); return; }
      const b = this.entryFor(key);
      if (b) { this.log?.(`anthropic-batch: adopting ${b.id} for ${role}`); this.poll(b.id); return; }   // submitted before a restart
      this.pending.push({ key, params });
      if (this.pending.length >= this.maxRequests) this.flush();
      else if (!this.timer) { this.timer = setTimeout(() => this.flush(), this.windowMs); this.timer.unref?.(); }
    });
  }

  /** Resolve / reject every waiter of a key from its result line; the key is consumed either way. */
  settle(key, line) {
    const ws = this.waiters.get(key);
    if (!ws) { this.ready.set(key, line); return; }
    this.waiters.delete(key);
    this.consume(key);
    const r = line?.result || {};
    if (r.type === 'succeeded') {
      ws.forEach((w, i) => w.resolve({ ...toCompat(r.message), billed: i === 0 }));   // one request billed, however many callers shared it
      return;
    }
    const detail = r.error?.error || r.error || {};
    const err = new Error(`anthropic batch ${r.type || 'missing'}: ${detail.type || ''} ${detail.message || ''}`.trim());
    err.batchResult = r.type || 'missing';
    ws.forEach((w) => w.reject(err));
  }
  failKeys(keys, err) {
    for (const key of keys) { const ws = this.waiters.get(key) || []; this.waiters.delete(key); ws.forEach((w) => w.reject(err)); }
  }

  // ── submit ──
  async flush() {
    clearTimeout(this.timer); this.timer = null;
    const take = this.pending.splice(0, this.maxRequests);
    if (this.pending.length) { this.timer = setTimeout(() => this.flush(), this.windowMs); this.timer.unref?.(); }
    if (!take.length) return;
    const body = { requests: take.map(({ key, params }) => ({ custom_id: key, params })) };
    let batch;
    for (let k = 0; ; k++) {
      try {
        batch = await (await this.api_()).create(body);
        break;
      } catch (err) {
        const msg = `${err?.message} ${err?.status ?? ''}`;
        if (k < this.submitRetryMs.length && RETRYABLE.test(msg)) {
          this.log?.(`anthropic-batch: submit retry ${k + 1} (${msg.trim().slice(0, 120)})`);
          await this.sleep(this.submitRetryMs[k]);
          continue;
        }
        this.failKeys(take.map((t) => t.key), err);
        return;
      }
    }
    this.load().batches.push({ id: batch.id, created: this.now(), ended: null, keys: take.map((t) => t.key) });
    this.save();
    this.log?.(`anthropic-batch: ${batch.id} submitted (${take.length} requests)`);
    this.poll(batch.id);
  }

  // ── poll: backoff from pollStartMs ×pollFactor up to pollMaxMs; on `ended`, read every result line ──
  poll(id) {
    if (this.polling.has(id)) return this.polling.get(id);
    const p = (async () => {
      for (let delay = this.pollStartMs; ; delay = Math.min(this.pollMaxMs, Math.round(delay * this.pollFactor))) {
        const b = this.load().batches.find((x) => x.id === id);
        if (!b?.ended) await this.sleep(delay);
        let status;
        try { status = b?.ended ? { processing_status: 'ended' } : await this.api_().then((api) => api.retrieve(id)); } catch (err) {
          if (err?.status === 404) { this.dropBatch(id, err); return; }
          this.log?.(`anthropic-batch: ${id} poll failed (${err.message}); retrying`);
          continue;
        }
        if (status?.processing_status !== 'ended') continue;
        try {
          const seen = new Set();
          for await (const line of await (await this.api_()).results(id)) { seen.add(line.custom_id); this.settle(line.custom_id, line); }
          const left = this.load().batches.find((x) => x.id === id);
          if (left) {
            left.ended ||= this.now();
            for (const key of left.keys.filter((k) => !seen.has(k))) this.settle(key, { custom_id: key, result: { type: 'missing' } });
            this.save();
          }
          return;
        } catch (err) {
          this.log?.(`anthropic-batch: ${id} results failed (${err.message}); retrying`);
        }
      }
    })().finally(() => this.polling.delete(id));
    this.polling.set(id, p);
    return p;
  }
  async api_() { return (this.api ||= await sdkBatches()); }
  dropBatch(id, err) {
    const b = this.load().batches.find((x) => x.id === id);
    this.state.batches = this.state.batches.filter((x) => x.id !== id); this.save();
    this.failKeys(b?.keys || [], err);
  }
}

let shared = null;
/** The process-wide client (every role and talk in this process shares one window and one state file). */
export const batchClient = () => (shared ||= new BatchClient({ log: (m) => logger.info(m) }));
/** (tests) replace the process-wide client. */
export const setBatchClient = (c) => { shared = c; };
