// Anis's one LLM call: stream a conversational reply over given passages with the lean Anis prompt.
// Any OpenAI-compatible provider (openai | groq | deepseek) — the model is ONE global switch (ANIS_LLM), so cost
// and speed can change without code. Deps: openai SDK, anis/prompt.js.
import OpenAI from 'openai';
import { anisSystem, anisUserPayload, anisDirection } from './prompt.js';
import { logAIUsage } from '../ai-services.js';
import { noteProviderError } from '../spend-alerts.js';

const BASE_URL = { openai: undefined, groq: 'https://api.groq.com/openai/v1', deepseek: 'https://api.deepseek.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', anthropic: 'https://api.anthropic.com/v1/' };
const KEY_ENV = { openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const clients = {};
function client(provider) {
  return (clients[provider] ||= new OpenAI({
    apiKey: process.env[KEY_ENV[provider]], maxRetries: 0, ...(BASE_URL[provider] ? { baseURL: BASE_URL[provider] } : {}),
  }));
}

export async function anisCraft({ user_question, retrieved_quotes, conversation_summary, persona_name, mission, companion_append, conversational = false, entities = null, peopleAnswer = null, target = null, direction = {}, llm, onChunk, signal }) {
  // System = soul + house style (constant → cached prefix); everything about THIS reply goes in the user message.
  const dir = anisDirection({ channelFrame: direction.channel?.frame ?? null, stance: direction.stance ?? null, guarded: !!direction.guarded,
    conversational, mission, companionAppend: companion_append, formatHow: direction.format?.how ?? null });
  const params = {
    model: llm.model,
    messages: [
      { role: 'system', content: anisSystem({ persona: persona_name || 'Anís' }) },
      { role: 'user', content: anisUserPayload({ question: user_question, conversation: conversation_summary, passages: retrieved_quotes, conversational, entities, peopleAnswer, target, direction: dir }) },
    ],
    temperature: 0.3,
    // Reasoning models spend completion tokens thinking; leave room so the reply is never truncated.
    max_tokens: llm.reasoning_effort && llm.reasoning_effort !== 'none' ? 1500 : 700,
    stream: true,
    stream_options: { include_usage: true },   // the final chunk reports tokens → spend (ai_usage)
    ...(llm.reasoning_effort ? { reasoning_effort: llm.reasoning_effort } : {}),
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
  let full = '', usage = null;
  for await (const chunk of stream) {
    const t = chunk.choices?.[0]?.delta?.content || '';
    if (t) { full += t; onChunk?.(t); }
    if (chunk.usage) usage = chunk.usage;
  }
  // Spend: every Anís reply. Providers that don't report usage on a stream get an estimate (~4 chars/token).
  const promptChars = params.messages.reduce((n, m) => n + String(m.content || '').length, 0);
  logAIUsage({ provider: llm.provider === 'gemini' ? 'google' : llm.provider, model: llm.model, serviceType: 'chat', caller: 'anis-craft',
    promptTokens: usage?.prompt_tokens ?? Math.ceil(promptChars / 4), completionTokens: usage?.completion_tokens ?? Math.ceil(full.length / 4) });
  return full;
}
