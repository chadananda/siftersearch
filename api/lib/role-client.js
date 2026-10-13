// roleCreate(role, params): a drop-in for `openai.chat.completions.create(params)` whose MODEL comes from the role table
// (model-roles.js → the registry), on whichever provider that model lives — Anthropic, Gemini and DeepSeek through their
// OpenAI-compatible endpoints (tools and streaming included). Chad 10-13: "update all model use" — no call site names a
// model. Per-model quirks come from the registry (noTemperature, maxTokensParam); every Anthropic call passes the spend
// policy as stage `interactive:<role>`. Usage is logged for non-streamed calls. Deps: openai SDK, model-roles, registry.
import OpenAI from 'openai';
import { modelFor } from './model-roles.js';
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
  const { provider, model } = modelFor(role);
  if (provider === 'anthropic') assertAnthropicAllowed({ provider, model, stage: `interactive:${role}`, caller: role });
  const res = await clientFor(provider).chat.completions.create(shapeParams(params, { provider, model }), opts);
  if (!params.stream && res?.usage) {
    logAIUsage({ provider: provider === 'gemini' ? 'google' : provider, model, serviceType: 'chat', caller: role,
      promptTokens: res.usage.prompt_tokens ?? 0, completionTokens: res.usage.completion_tokens ?? 0 });
  }
  return res;
}

/** The model a role resolves to (for logs / caches that record which model answered). */
export const roleModel = (role) => modelFor(role).model;
