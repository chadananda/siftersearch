// Reading guide — one non-streamed model call returning JSON (OpenAI-compatible endpoints, like anis/craft.js), logged to
// ai_usage under its caller. Deps: openai SDK, ai-services (logAIUsage), model-registry.
import OpenAI from 'openai';
import { logAIUsage } from '../../ai-services.js';
import { getModel } from '../../model-registry.js';

const BASE_URL = { openai: undefined, deepseek: 'https://api.deepseek.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', anthropic: 'https://api.anthropic.com/v1/' };
const KEY_ENV = { openai: 'OPENAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const clients = {};
const client = (p) => (clients[p] ||= new OpenAI({ apiKey: process.env[KEY_ENV[p]], maxRetries: 1, ...(BASE_URL[p] ? { baseURL: BASE_URL[p] } : {}) }));

/** The first JSON object in a model reply (fenced or bare). Pure. */
export function jsonOf(text) {
  const s = String(text || '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const cand of [fenced, s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]) {
    if (!cand) continue;
    try { return JSON.parse(cand); } catch { /* next */ }
  }
  return null;
}

export async function llmJson({ provider, model, system, user, maxTokens = 3000, caller, timeoutMs = 120000 }) {
  const reg = getModel(model) || {};
  const res = await client(provider).chat.completions.create({
    model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    [reg.maxTokensParam || 'max_tokens']: maxTokens,
    ...(reg.noTemperature ? {} : { temperature: 0.2 }),
    ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
  }, { timeout: timeoutMs });
  const text = res.choices?.[0]?.message?.content || '';
  logAIUsage({ provider: provider === 'gemini' ? 'google' : provider, model, serviceType: 'chat', caller,
    promptTokens: res.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4), completionTokens: res.usage?.completion_tokens ?? Math.ceil(text.length / 4) });
  return { json: jsonOf(text), text, usage: res.usage || null };
}
