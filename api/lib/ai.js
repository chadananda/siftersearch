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

// Lazy-initialized clients
let openaiClient = null;
let anthropicClient = null;
let ollamaClient = null;

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

  switch (provider) {
    case 'openai':
      return chatOpenAI(messages, { model, temperature, maxTokens, stream });
    case 'anthropic':
      return chatAnthropic(messages, { model, temperature, maxTokens, stream });
    case 'ollama':
      return chatOllama(messages, { model, temperature, maxTokens, stream });
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
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

async function chatAnthropic(messages, { model, temperature, maxTokens, stream }) {
  const anthropic = getAnthropic();

  // Convert OpenAI message format to Anthropic format
  const systemMsg = messages.find(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(systemMsg && { system: systemMsg.content }),
    messages: otherMsgs.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    })),
    stream
  });

  if (stream) {
    return response; // Return stream
  }

  return {
    content: response.content[0].text,
    usage: {
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
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
      case 'ollama':
        return true; // Assume local Ollama is available
      default:
        return false;
    }
  }
};

export default ai;
