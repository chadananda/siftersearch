// roleCreate(role, params): a drop-in for `openai.chat.completions.create(params)` whose MODEL comes from the role table
// (model-roles.js → the registry), on whichever provider that model lives — Anthropic, Gemini and DeepSeek through their
// OpenAI-compatible endpoints (tools and streaming included). Chad 10-13: "update all model use" — no call site names a
// model. Per-model quirks come from the registry (noTemperature, maxTokensParam); every Anthropic call passes the spend
// policy as stage `interactive:<role>`. Usage is logged for every call (streams: from the final usage chunk). Deps: openai SDK, model-roles, registry.
import OpenAI from 'openai';
import { modelFor, retireDeepSeek } from './model-roles.js';
import { getModel } from './model-registry.js';
import { assertAnthropicAllowed } from './anthropic-policy.js';
import { logAIUsage } from './ai-services.js';

const BASE_URL = { openai: undefined, groq: 'https://api.groq.com/openai/v1', deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', anthropic: 'https://api.anthropic.com/v1/' };
const KEY_ENV = { openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const clients = {};
export const clientFor = (provider) => (clients[provider] ||= new OpenAI({ apiKey: process.env[KEY_ENV[provider]], maxRetries: 1,
  ...(BASE_URL[provider] ? { baseURL: BASE_URL[provider] } : {}) }));

/** Pure: the request a role's model accepts — model set, temperature dropped where rejected, the right max-tokens key,
 *  response_format dropped where the compat endpoint does not take it. */
export function shapeParams(params, { provider, model }) {
  const reg = getModel(model) || {};
  const { max_tokens: maxTokens, max_completion_tokens: maxCompletion, temperature, response_format: responseFormat, ...rest } = params;
  const limit = maxCompletion ?? maxTokens;
  return {
    ...rest, model,
    ...(reg.noTemperature || temperature == null ? {} : { temperature }),
    ...(limit != null ? { [reg.maxTokensParam || 'max_tokens']: limit } : {}),
    ...(responseFormat && provider !== 'anthropic' ? { response_format: responseFormat } : {}),
    ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
  };
}

export async function roleCreate(role, params, opts = {}) {
  const { provider, model } = retireDeepSeek(modelFor(role));
  if (provider === 'anthropic') assertAnthropicAllowed({ provider, model, stage: `interactive:${role}`, caller: role });
  const shaped = shapeParams(params, { provider, model });
  if (params.stream) shaped.stream_options = { include_usage: true, ...params.stream_options };
  const res = await clientFor(provider).chat.completions.create(shaped, opts);
  const log = (usage) => usage && logAIUsage({ provider: provider === 'gemini' ? 'google' : provider, model, serviceType: 'chat',
    caller: role, promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 });
  if (!params.stream) { log(res?.usage); return res; }
  return logStreamUsage(res, log);
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
