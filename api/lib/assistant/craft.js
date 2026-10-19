// Anis's one LLM call: stream a conversational reply over given passages with the lean Anis prompt.
// Any OpenAI-compatible provider (openai | groq | deepseek) — the model is ONE global switch (ANIS_LLM), so cost
// and speed can change without code. Deps: openai SDK, anis/prompt.js.
import OpenAI from 'openai';
import { anisSystem, anisUserPayload, anisDirection } from './prompt.js';
import { logAIUsage } from '../ai-services.js';
import { noteProviderError } from '../spend-alerts.js';
import { getModel } from '../model-registry.js';

const BASE_URL = { openai: undefined, groq: 'https://api.groq.com/openai/v1', deepseek: 'https://api.deepseek.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', anthropic: 'https://api.anthropic.com/v1/' };
const KEY_ENV = { openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const clients = {};
function client(provider) {
  return (clients[provider] ||= new OpenAI({
    apiKey: process.env[KEY_ENV[provider]], maxRetries: 0, ...(BASE_URL[provider] ? { baseURL: BASE_URL[provider] } : {}),
  }));
}

export async function anisCraft({ user_question, retrieved_quotes, conversation_summary, persona_name, mission, companion_append, conversational = false, entities = null, peopleAnswer = null, target = null, onUsage = null, direction = {}, llm, onChunk, signal }) {
  // System = soul + house style (constant → cached prefix); everything about THIS reply goes in the user message.
  const dir = anisDirection({ channelFrame: direction.channel?.frame ?? null, stance: direction.stance ?? null, guarded: !!direction.guarded,
    conversational, mission, companionAppend: companion_append, formatHow: direction.format?.how ?? null });
  // Per-model request shape from the registry: Haiku 5.5 and the GPT-5 family reject temperature; GPT-5 counts
  // max_completion_tokens and should not reason for a chat reply (reasoning_effort minimal).
  const reg = getModel(llm.model) || {};
  const effort = llm.reasoning_effort ?? reg.reasoningEffort;
  // a LETTER (email) or a POSITION answer is longer than a chat reply: 700 tokens cut both mid-sentence (10-19 — Chad's
  // socialism answer ended at "'Abdu'l-Bah", another mid-link). Chat stays short.
  const long = direction.format?.id === 'position' || /email/.test(String(direction.channel?.id || direction.channel?.name || ''));
  const maxTok = (effort && effort !== 'none' && effort !== 'minimal' ? 1500 : 700) + (long ? 2000 : 0);
  const params = {
    model: llm.model,
    messages: [
      { role: 'system', content: anisSystem({ persona: persona_name || 'Anís' }) },
      { role: 'user', content: anisUserPayload({ question: user_question, conversation: conversation_summary, passages: retrieved_quotes, conversational, entities, peopleAnswer, target, direction: dir }) },
    ],
    ...(reg.noTemperature ? {} : { temperature: 0.3 }),
    // Reasoning models spend completion tokens thinking; leave room so the reply is never truncated.
    [reg.maxTokensParam || 'max_tokens']: maxTok,
    stream: true,
    stream_options: { include_usage: true },   // the final chunk reports tokens → spend (ai_usage)
    ...(effort ? { reasoning_effort: effort } : {}),
    // DeepSeek v4-flash thinks unless told not to — TOP-LEVEL key, not extra_body (see ai-services chatDeepSeek).
    ...(llm.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
  };
  let stream;
  try {
    stream = await client(llm.provider).chat.completions.create(params, signal ? { signal } : {});
  } catch (e) {
    noteProviderError(llm.provider === 'gemini' ? 'Gemini' : llm.provider, { status: e?.status ?? null, message: e?.message || String(e) });
    throw e;
  }
  let full = '', usage = null, finish = null;
  for await (const chunk of stream) {
    const t = chunk.choices?.[0]?.delta?.content || '';
    if (t) { full += t; onChunk?.(t); }
    if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  // a reply CUT by the token cap is never silent (10-19: two letters ended mid-sentence)
  if (finish === 'length') console.warn(JSON.stringify({ anis_craft: 'reply hit the token cap', max_tokens: maxTok, chars: full.length, format: direction.format?.id || null }));
  // Spend: every Anís reply. Providers that don't report usage on a stream get an estimate (~4 chars/token).
  const promptChars = params.messages.reduce((n, m) => n + String(m.content || '').length, 0);
  const promptTokens = usage?.prompt_tokens ?? Math.ceil(promptChars / 4), completionTokens = usage?.completion_tokens ?? Math.ceil(full.length / 4);
  logAIUsage({ provider: llm.provider === 'gemini' ? 'google' : llm.provider, model: llm.model, serviceType: 'chat', caller: llm.caller || 'anis-craft',
    promptTokens, completionTokens });
  onUsage?.({ promptTokens, completionTokens, reported: !!usage });   // the model bake-off prices each reply exactly
  return full;
}
