/**
 * AI Provider Abstraction
 *
 * Unified interface for OpenAI, Anthropic, and Ollama.
 * Provider selection based on config (dev mode = remote, prod = local).
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Ollama } from 'ollama';
import { config } from './config.js';
import { logger } from './logger.js';
import { logAIUsage } from './ai-services.js';
import { currentAIContext } from './ai-context.js';   // ambient doc/stage attribution for every logged call
import { getModel } from './model-registry.js';
import { assertAnthropicAllowed } from './anthropic-policy.js';   // fail-closed Anthropic allowlist (Persian plan only)

// Lazy-initialized clients
let openaiClient = null;
let anthropicClient = null;
let ollamaClient = null;
let deepseekClient = null;
let localClient = null;

function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getAnthropic() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function getOllama() {
  if (!ollamaClient) {
    ollamaClient = new Ollama({ host: config.ai.endpoints.ollama });
  }
  return ollamaClient;
}

export function getDeepSeek() {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for DeepSeek provider');
    deepseekClient = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' });
  }
  return deepseekClient;
}

// Local vLLM / llama-server — OpenAI-compatible, no API key required.
// Endpoint from LOCAL_LLM env var (e.g. http://boss:8080/v1).
export function getLocalLLM() {
  if (!localClient) {
    const baseURL = process.env.LOCAL_LLM || 'http://localhost:8080/v1';
    localClient = new OpenAI({ apiKey: 'local', baseURL });
  }
  return localClient;
}

/**
 * Chat completion with any provider
 */
export async function chatCompletion(messages, options = {}) {
  const {
    provider = config.ai.chat.provider,
    model = config.ai.chat.model,
    temperature = config.ai.chat.temperature,
    maxTokens = config.ai.chat.maxTokens,
    stream = false
  } = options;

  logger.debug({ provider, model, messageCount: messages.length }, 'Chat completion');

  // SPEND GATE (fail-closed): this is the one client every caller funnels through, so refusing here guarantees
  // no routing table, config default, or future stage can bill Anthropic outside the approved Persian plan books.
  // lang/docId ride the ambient ai-context opened by the grounding driver; a call with no such context → refused.
  if (provider === 'anthropic') {
    const g = currentAIContext() || {};
    assertAnthropicAllowed({ provider, model, lang: g.lang, docId: g.docId, caller: g.caller || options.caller, stage: g.stage });
  }

  const dispatch = () => {
    switch (provider) {
      case 'openai':
        return chatOpenAI(messages, { model, temperature, maxTokens, stream });
      case 'anthropic':
        return chatAnthropic(messages, { model, temperature, maxTokens, stream, usePromptCache: options.usePromptCache });
      case 'ollama':
        return chatOllama(messages, { model, temperature, maxTokens, stream });
      case 'deepseek':
        return chatDeepSeek(messages, { model, temperature, maxTokens, stream, responseFormat: options.responseFormat, thinking: options.thinking ?? false });
      case 'local':
        return chatLocal(messages, { model, temperature, maxTokens, stream, responseFormat: options.responseFormat });
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  };

  // METER EVERY CHAT CALL. createEmbedding has always logged; chatCompletion never did — so every chat
  // completion in the app (grounding, deep-research, translation, search, graph workers) billed invisibly.
  // Logging HERE, at the one client every caller funnels through, is what makes spend total-able per book and
  // per subsystem. Attribution (doc/stage) comes from the ambient AI context when a driver opened one.
  // Streaming is skipped: usage isn't known until the stream drains, and no pipeline stage streams.
  const { docId = null, stage = null, caller = null } = currentAIContext();
  const serviceType = stage ? `grounding:${stage}` : (options.serviceType || 'chat');
  if (stream) return dispatch();
  try {
    const res = await dispatch();
    logAIUsage({
      provider, model, serviceType, caller: caller || options.caller || null, documentId: docId,
      promptTokens: res.usage?.promptTokens || 0, completionTokens: res.usage?.completionTokens || 0,
      totalTokens: res.usage?.totalTokens || 0, cachedTokens: res.usage?.cachedTokens || 0,
      cacheWriteTokens: res.usage?.cacheWriteTokens || 0, success: true
    });
    return res;
  } catch (err) {
    logAIUsage({ provider, model, serviceType, caller: caller || options.caller || null, documentId: docId,
      success: false, errorMessage: err.message });
    throw err;
  }
}

async function chatOpenAI(messages, { model, temperature, maxTokens, stream }) {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream
  });

  if (stream) {
    return response; // Return stream iterator
  }

  return {
    content: response.choices[0].message.content,
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens
    },
    model: response.model
  };
}

async function chatAnthropic(messages, { model, temperature, maxTokens, stream, usePromptCache = false }) {
  const anthropic = getAnthropic();

  // Convert OpenAI message format to Anthropic format
  const systemMsg = messages.find(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');

  // Prompt caching: mark the system prompt for caching when the caller opts in.
  // The large extraction prompt (>1K tokens) is identical across all paragraphs in a batch
  // so caching saves ~$0.005/call and reduces latency on the 2nd–Nth calls.
  const systemParam = systemMsg
    ? (usePromptCache
        ? [{ type: 'text', text: systemMsg.content, cache_control: { type: 'ephemeral' } }]
        : systemMsg.content)
    : undefined;

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(systemParam !== undefined && { system: systemParam }),
    messages: otherMsgs.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    })),
    stream
  });

  if (stream) {
    return response; // Return stream
  }

  // Anthropic reports input_tokens EXCLUSIVE of cache reads/writes, while OpenAI/DeepSeek report a prompt total
  // that INCLUDES its cached portion. Normalise to one meaning — promptTokens = the WHOLE prompt — so a single
  // cost formula (fresh = prompt - cached) is right for every provider instead of silently under-billing the
  // fresh tokens of a cached Anthropic call. cacheWriteTokens is surfaced separately: it bills at ~1.25x.
  const cacheRead = response.usage?.cache_read_input_tokens || 0;
  const cacheWrite = response.usage?.cache_creation_input_tokens || 0;
  const freshIn = response.usage?.input_tokens || 0;
  return {
    content: response.content[0].text,
    finishReason: response.stop_reason,
    usage: {
      promptTokens: freshIn + cacheRead + cacheWrite,
      completionTokens: response.usage?.output_tokens,
      cachedTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      totalTokens: freshIn + cacheRead + cacheWrite + (response.usage?.output_tokens || 0)
    },
    model: response.model
  };
}

async function chatLocal(messages, { model, temperature, maxTokens, stream, responseFormat }) {
  const client = getLocalLLM();
  // Model name from LOCAL_LLM_MODEL env or caller-supplied model string
  const resolvedModel = model || process.env.LOCAL_LLM_MODEL || 'default';
  const params = { model: resolvedModel, messages, temperature, max_tokens: maxTokens, stream };
  if (responseFormat) params.response_format = responseFormat;
  const response = await client.chat.completions.create(params);
  if (stream) return response;
  return {
    content: response.choices[0].message.content,
    finishReason: response.choices[0].finish_reason,
    usage: {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      cachedTokens: 0,
      totalTokens: response.usage?.total_tokens || 0,
    },
    model: response.model || resolvedModel,
  };
}

async function chatDeepSeek(messages, { model, temperature, maxTokens, stream, responseFormat, thinking = false }) {
  const client = getDeepSeek();
  // resolve the registry key to its live DeepSeek API id via the registry's `apiModel` (e.g.
  // 'deepseek-v4-flash' → 'deepseek-v4-flash'); pass unknown raw ids straight through. NB: deepseek-chat is
  // the DEPRECATED V3 id — never emit it; v4 ids only (deepseek-v4-flash / deepseek-v4-pro).
  const apiModel = getModel(model)?.apiModel || model;
  const params = { model: apiModel, messages, temperature, max_tokens: maxTokens, stream };
  if (responseFormat) params.response_format = responseFormat;
  // Explicitly control thinking mode — never rely on model defaults.
  // deepseek-v4-flash: thinking disabled (fast extraction/classification)
  // deepseek-v4-pro: thinking enabled (adjudication, promotion)
  // Per DeepSeek API docs: https://api-docs.deepseek.com/guides/thinking_mode
  // extra_body passes non-standard params through the OpenAI SDK to the underlying API
  params.extra_body = { thinking: { type: thinking ? 'enabled' : 'disabled' } };
  const response = await client.chat.completions.create(params);
  if (stream) return response;
  return {
    content: response.choices[0].message.content,
    finishReason: response.choices[0].finish_reason,
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      cachedTokens: response.usage?.prompt_cache_hit_tokens || 0,
      totalTokens: response.usage?.total_tokens
    },
    model: response.model
  };
}

async function chatOllama(messages, { model, temperature, maxTokens, stream }) {
  const ollama = getOllama();

  const response = await ollama.chat({
    model,
    messages,
    options: {
      temperature,
      num_predict: maxTokens
    },
    stream
  });

  if (stream) {
    return response; // Return stream
  }

  return {
    content: response.message.content,
    usage: {
      promptTokens: response.prompt_eval_count,
      completionTokens: response.eval_count,
      totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
    },
    model: response.model
  };
}

/**
 * Generate embeddings (always uses OpenAI for consistency)
 */
export async function createEmbedding(text, options = {}) {
  const {
    model = config.ai.embeddings.model,
    dimensions = config.ai.embeddings.dimensions,
    caller = 'embedding'
  } = options;

  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model,
    input: text,
    dimensions
  });

  const totalTokens = response.usage?.total_tokens || 0;

  // Log embedding usage for cost tracking
  logAIUsage({
    provider: 'openai',
    model,
    serviceType: 'embedding',
    caller,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens
  });

  return {
    embedding: response.data[0].embedding,
    usage: {
      totalTokens
    }
  };
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function createEmbeddings(texts, options = {}) {
  const {
    model = config.ai.embeddings.model,
    dimensions = config.ai.embeddings.dimensions,
    caller = 'embedding-batch'
  } = options;

  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model,
    input: texts,
    dimensions
  });

  const totalTokens = response.usage?.total_tokens || 0;

  // Log embedding usage for cost tracking
  logAIUsage({
    provider: 'openai',
    model,
    serviceType: 'embedding',
    caller,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens
  });

  return {
    embeddings: response.data.map(d => d.embedding),
    usage: {
      totalTokens
    }
  };
}

/**
 * Convenience methods for specific use cases
 */
export const ai = {
  // Chat using configured chat provider
  chat: (messages, opts) => chatCompletion(messages, {
    provider: config.ai.chat.provider,
    model: config.ai.chat.model,
    ...opts
  }),

  // Search enhancement using configured search provider
  searchEnhance: (messages, opts) => chatCompletion(messages, {
    provider: config.ai.search.provider,
    model: config.ai.search.model,
    temperature: config.ai.search.temperature,
    maxTokens: config.ai.search.maxTokens,
    ...opts
  }),

  // Document processing using configured doc provider
  processDoc: (messages, opts) => chatCompletion(messages, {
    provider: config.ai.doc.provider,
    model: config.ai.doc.model,
    temperature: config.ai.doc.temperature,
    maxTokens: config.ai.doc.maxTokens,
    ...opts
  }),

  // Embeddings
  embed: createEmbedding,
  embedBatch: createEmbeddings,

  // Check if provider is available
  isAvailable: (provider) => {
    switch (provider) {
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'anthropic':
        return !!process.env.ANTHROPIC_API_KEY;
      case 'deepseek':
        return !!process.env.DEEPSEEK_API_KEY;
      case 'ollama':
        return true; // Assume local Ollama is available
      default:
        return false;
    }
  }
};

export default ai;
