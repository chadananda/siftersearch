// Anis's one LLM call: stream a conversational reply over given passages with the lean Anis prompt.
// Any OpenAI-compatible provider (openai | groq | deepseek) — the model is ONE global switch (ANIS_LLM), so cost
// and speed can change without code. Deps: openai SDK, anis/prompt.js.
import OpenAI from 'openai';
import { anisSystem, anisUserPayload } from './prompt.js';

const BASE_URL = { openai: undefined, groq: 'https://api.groq.com/openai/v1', deepseek: 'https://api.deepseek.com/v1' };
const KEY_ENV = { openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const clients = {};
function client(provider) {
  return (clients[provider] ||= new OpenAI({
    apiKey: process.env[KEY_ENV[provider]], maxRetries: 0, ...(BASE_URL[provider] ? { baseURL: BASE_URL[provider] } : {}),
  }));
}

export async function anisCraft({ user_question, retrieved_quotes, conversation_summary, persona_name, mission, companion_append, llm, onChunk, signal }) {
  const params = {
    model: llm.model,
    messages: [
      { role: 'system', content: anisSystem({ persona: persona_name || 'Anis', mission, companionAppend: companion_append }) },
      { role: 'user', content: anisUserPayload({ question: user_question, conversation: conversation_summary, passages: retrieved_quotes }) },
    ],
    temperature: 0.3,
    // Reasoning models spend completion tokens thinking; leave room so the reply is never truncated.
    max_tokens: llm.reasoning_effort ? 1500 : 700,
    stream: true,
    ...(llm.reasoning_effort ? { reasoning_effort: llm.reasoning_effort } : {}),
    // DeepSeek v4-flash thinks unless told not to — TOP-LEVEL key, not extra_body (see ai-services chatDeepSeek).
    ...(llm.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
  };
  const stream = await client(llm.provider).chat.completions.create(params, signal ? { signal } : {});
  let full = '';
  for await (const chunk of stream) {
    const t = chunk.choices?.[0]?.delta?.content || '';
    if (t) { full += t; onChunk?.(t); }
  }
  return full;
}
