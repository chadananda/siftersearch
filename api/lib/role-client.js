// roleCreate(role, params): a drop-in for `openai.chat.completions.create(params)` whose MODEL comes from the role table
// (model-roles.js → the registry), on whichever provider that model lives — Anthropic, Gemini and DeepSeek through their
// OpenAI-compatible endpoints (tools and streaming included). Chad 10-13: "update all model use" — no call site names a
// model. Per-model quirks come from the registry (noTemperature, maxTokensParam); every Anthropic call passes the spend
// policy as stage `interactive:<role>`. Usage is logged for every call (streams: from the final usage chunk). Deps: openai SDK, model-roles, registry.
import OpenAI from 'openai';
import { modelFor, retireDeepSeek } from './model-roles.js';
import { getModel, thinkingParam } from './model-registry.js';
import { assertAnthropicAllowed, guardLongContext } from './anthropic-policy.js';
import { logAIUsage } from './ai-services.js';
import { assertSpendCap, noteCreditOut } from './spend-caps.js';

const BASE_URL = { openai: undefined, groq: 'https://api.groq.com/openai/v1', deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', anthropic: 'https://api.anthropic.com/v1/' };
const KEY_ENV = { openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const clients = {};
export const clientFor = (provider) => (clients[provider] ||= new OpenAI({ apiKey: process.env[KEY_ENV[provider]], maxRetries: 1,
  ...(BASE_URL[provider] ? { baseURL: BASE_URL[provider] } : {}) }));

/** Pure: the top-level `thinking` field for an OpenAI-compatible request (a top-level key — openai@6 for Node drops
 *  extra_body). DeepSeek: always disabled. Anthropic: the registry default (Haiku 5.5 → disabled unless `requested`,
 *  Chad 11-03 "fast and cheap"). Others: nothing. */
export function thinkingFields(provider, model, requested) {
  if (provider === 'deepseek') return { thinking: { type: 'disabled' } };
  if (provider !== 'anthropic') return {};
  const tp = thinkingParam(model, requested);
  return tp ? { thinking: tp } : {};
}

/** Pure: the request a role's model accepts — model set, temperature dropped where rejected, the right max-tokens key,
 *  response_format dropped where the compat endpoint does not take it. */
export function shapeParams(params, { provider, model }) {
  const reg = getModel(model) || {};
  const { max_tokens: maxTokens, max_completion_tokens: maxCompletion, temperature, response_format: responseFormat, thinking, ...rest } = params;
  const limit = maxCompletion ?? maxTokens;
  return {
    ...rest, model,
    ...(reg.noTemperature || temperature == null ? {} : { temperature }),
    ...(limit != null ? { [reg.maxTokensParam || 'max_tokens']: limit } : {}),
    ...(responseFormat && provider !== 'anthropic' ? { response_format: responseFormat } : {}),
    ...thinkingFields(provider, model, thinking),
  };
}

export async function roleCreate(role, params, opts = {}) {
  const { provider, model } = retireDeepSeek(modelFor(role));
  await assertSpendCap(role, { provider });   // the daily cap (spend-caps.js), before the call
  if (provider === 'anthropic') assertAnthropicAllowed({ provider, model, stage: `interactive:${role}`, caller: role });
  guardLongContext({ model, messages: params.messages || [], caller: role });   // the cheap price tier, never silently past it
  const shaped = shapeParams(params, { provider, model });
  if (params.stream) shaped.stream_options = { include_usage: true, ...params.stream_options };
  const res = await clientFor(provider).chat.completions.create(shaped, opts).catch((err) => { throw noteCreditOut(provider, err) || err; });   // out of credit → wait, not fail
  const log = (usage) => usage && logAIUsage({ provider: provider === 'gemini' ? 'google' : provider, model, serviceType: 'chat',
    caller: role, promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 });
  if (!params.stream) { log(res?.usage); return res; }
  return logStreamUsage(res, log);
}

/** The Message Batches twin of roleCreate (half price) for roles marked `batch` (model-roles batchRole): same spend policy,
 *  same long-context guard, same model/thinking/temperature shaping — only the transport differs. Native params go into the
 *  process-wide batch (anthropic-batch.js); the result comes back chat.completions-shaped. Usage is logged batch=true with
 *  the real token counts, once per billed request. No synchronous fallback: a failed batch request throws. */
export async function roleBatchCreate(role, params, { client } = {}) {
  const { provider, model } = retireDeepSeek(modelFor(role));
  if (provider !== 'anthropic') throw new Error(`roleBatchCreate: ${role} resolves to ${provider}, not Anthropic — not batchable`);
  await assertSpendCap(role, { provider });   // before the submit
  assertAnthropicAllowed({ provider, model, stage: `interactive:${role}`, caller: role });
  guardLongContext({ model, messages: params.messages || [], caller: role });
  const shaped = shapeParams(params, { provider, model });
  const native = { model, max_tokens: params.max_completion_tokens ?? params.max_tokens, messages: params.messages,
    ...(shaped.temperature != null ? { temperature: shaped.temperature } : {}), ...(shaped.thinking ? { thinking: shaped.thinking } : {}) };
  const c = client || (await import('./anthropic-batch.js')).batchClient();
  const res = await c.submit({ role, params: native }).catch((err) => { throw noteCreditOut(provider, err) || err; });
  const u = res?.usage;
  if (u && res.billed !== false) logAIUsage({ provider, model, serviceType: 'chat', caller: role, batch: true,
    promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0, cachedTokens: u.cached_tokens ?? 0, cacheWriteTokens: u.cache_write_tokens ?? 0 });
  return res;
}

/** A stream's usage arrives on its last chunk: log it once the caller has read the stream (11-02: streamed Sonnet
 *  chat-answer and dewey-chat were billed but never in ai_usage). The stream object is kept; only its iterator wraps. */
export function logStreamUsage(stream, log) {
  const inner = stream?.[Symbol.asyncIterator]?.bind(stream);
  if (!inner) return stream;
  stream[Symbol.asyncIterator] = async function* () {
    let usage = null;
    try { for await (const chunk of inner()) { if (chunk?.usage) usage = chunk.usage; yield chunk; } }
    finally { log(usage); }
  };
  return stream;
}

/** The model a role resolves to (for logs / caches that record which model answered). */
export const roleModel = (role) => modelFor(role).model;
