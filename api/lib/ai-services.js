/**
 * AI Services Abstraction Layer
 *
 * Defines AI capabilities by quality/purpose tokens, not specific models.
 * Each service has a local (Ollama) and remote (API) implementation.
 *
 * Usage:
 *   import { aiService } from './ai-services.js';
 *   const response = await aiService('fast').chat(messages);
 *   const embedding = await aiService('embedding').embed(text);
 *
 * To swap implementations, update the SERVICE_CONFIG below.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Ollama } from 'ollama';
import { config } from './config.js';
import { logger } from './logger.js';

// =============================================================================
// SERVICE DEFINITIONS
// =============================================================================

/**
 * Service quality tokens and their purposes:
 *
 * - fast:       Quick responses, simple tasks (planning, classification)
 * - balanced:   Good quality + reasonable speed (analysis, summarization)
 * - quality:    Best results, speed less important (complex reasoning)
 * - embedding:  Text embeddings for semantic search
 * - vision:     Image understanding (future)
 */

const SERVICE_CONFIG = {
  // Fast: Quick responses for simple tasks
  // Use: search planning, query classification, simple extraction
  fast: {
    local: {
      provider: 'ollama',
      model: 'qwen2.5:14b',       // Use 14b (7b not pulled)
      temperature: 0.3,
      maxTokens: 500
    },
    remote: {
      provider: 'openai',
      model: 'gpt-3.5-turbo',     // Fastest OpenAI model
      temperature: 0.3,
      maxTokens: 500
    }
  },

  // Balanced: Good quality with reasonable speed
  // Use: passage analysis, re-ranking, summarization
  balanced: {
    local: {
      provider: 'ollama',
      model: 'qwen2.5:14b',       // Good balance of quality/speed
      temperature: 0.3,
      maxTokens: 1000
    },
    remote: {
      provider: 'openai',
      model: 'gpt-4o-mini',       // Good quality, reasonable cost
      temperature: 0.3,
      maxTokens: 1000
    }
  },

  // Quality: Best results when speed is less critical
  // Use: complex analysis, nuanced reasoning, important decisions
  quality: {
    local: {
      provider: 'ollama',
      model: 'qwen2.5:32b',       // Largest local model
      temperature: 0.7,
      maxTokens: 2000
    },
    remote: {
      provider: 'openai',
      model: 'gpt-4o',            // Best OpenAI model
      temperature: 0.7,
      maxTokens: 2000
    }
  },

  // Creative: More varied, expressive outputs
  // Use: generating introductions, conversational responses
  creative: {
    local: {
      provider: 'ollama',
      model: 'qwen2.5:14b',
      temperature: 0.8,
      maxTokens: 500
    },
    remote: {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',  // Good at natural language
      temperature: 0.8,
      maxTokens: 500
    }
  },

  // ==========================================================================
  // EMBEDDING SERVICE
  // ==========================================================================
  // IMPORTANT: Embedding config is centralized in config.js (config.ai.embeddings)
  // Both local and remote use the SAME settings to ensure dimension consistency
  // between indexed documents and search queries.
  // NOTE: Uses getter to avoid ES module hoisting issues - config must be
  // resolved at runtime, not at module load time.
  // ==========================================================================

  get embedding() {
    // Resolve config at runtime to avoid ES module hoisting issues
    const embeddingConfig = {
      provider: config.ai.embeddings.provider,
      model: config.ai.embeddings.model,
      dimensions: config.ai.embeddings.dimensions
    };
    return {
      local: embeddingConfig,
      remote: embeddingConfig
    };
  }
};

// =============================================================================
// CLIENT MANAGEMENT
// =============================================================================

let clients = {
  openai: null,
  anthropic: null,
  ollama: null
};

function getClient(provider) {
  if (clients[provider]) return clients[provider];

  switch (provider) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY required for OpenAI provider');
      }
      clients.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      break;

    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY required for Anthropic provider');
      }
      clients.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      break;

    case 'ollama':
      clients.ollama = new Ollama({
        host: process.env.OLLAMA_HOST || 'http://localhost:11434'
      });
      break;

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  return clients[provider];
}

// =============================================================================
// CHAT IMPLEMENTATIONS
// =============================================================================

async function chatOpenAI(messages, opts) {
  const client = getClient('openai');
  const response = await client.chat.completions.create({
    model: opts.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: opts.stream || false
  });

  if (opts.stream) return response;

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

async function chatAnthropic(messages, opts) {
  const client = getClient('anthropic');

  // Convert to Anthropic format
  const systemMsg = messages.find(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    ...(systemMsg && { system: systemMsg.content }),
    messages: otherMsgs.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    })),
    stream: opts.stream || false
  });

  if (opts.stream) return response;

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

async function chatOllama(messages, opts) {
  const client = getClient('ollama');

  const response = await client.chat({
    model: opts.model,
    messages,
    options: {
      temperature: opts.temperature,
      num_predict: opts.maxTokens
    },
    stream: opts.stream || false
  });

  if (opts.stream) return response;

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

// =============================================================================
// EMBEDDING IMPLEMENTATIONS
// =============================================================================

// OpenAI embedding limits:
// - text-embedding-3-large: 8191 tokens per text, 300,000 tokens per request
// - Roughly ~4 chars per token, so ~32k chars per text, ~1.2M chars per request
// We batch conservatively: 50 chunks per batch (assuming ~1500 chars/chunk = 75k chars = ~19k tokens)
const EMBEDDING_BATCH_SIZE = 50;

async function embedOpenAI(text, opts) {
  const client = getClient('openai');
  const inputs = Array.isArray(text) ? text : [text];

  // Process in batches to avoid token limits
  const allEmbeddings = [];
  let totalTokens = 0;

  for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await client.embeddings.create({
      model: opts.model,
      input: batch,
      dimensions: opts.dimensions
    });

    allEmbeddings.push(...response.data.map(d => d.embedding));
    totalTokens += response.usage?.total_tokens || 0;

    // Log progress for large batches
    if (inputs.length > EMBEDDING_BATCH_SIZE) {
      logger.debug({
        batch: Math.floor(i / EMBEDDING_BATCH_SIZE) + 1,
        total: Math.ceil(inputs.length / EMBEDDING_BATCH_SIZE),
        processed: Math.min(i + EMBEDDING_BATCH_SIZE, inputs.length),
        of: inputs.length
      }, 'Embedding batch progress');
    }
  }

  return {
    embeddings: allEmbeddings,
    usage: { totalTokens }
  };
}

async function embedOllama(text, opts) {
  const client = getClient('ollama');
  const inputs = Array.isArray(text) ? text : [text];

  // Ollama processes one at a time
  const embeddings = [];
  for (const input of inputs) {
    const response = await client.embeddings({
      model: opts.model,
      prompt: input
    });
    embeddings.push(response.embedding);
  }

  return {
    embeddings,
    usage: { totalTokens: 0 } // Ollama doesn't report token usage
  };
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

/**
 * Get an AI service by quality token
 *
 * @param {string} serviceType - One of: fast, balanced, quality, creative, embedding
 * @param {Object} options - Override options
 * @param {boolean} options.forceLocal - Force local provider even in dev mode
 * @param {boolean} options.forceRemote - Force remote provider even in prod mode
 * @returns {Object} Service object with chat() and/or embed() methods
 */
export function aiService(serviceType, options = {}) {
  const serviceConfig = SERVICE_CONFIG[serviceType];
  if (!serviceConfig) {
    throw new Error(`Unknown service type: ${serviceType}. Valid types: ${Object.keys(SERVICE_CONFIG).join(', ')}`);
  }

  // Determine which config to use (local vs remote)
  // USE_REMOTE_AI flag forces remote providers even in production
  const useRemote = options.forceRemote || config.useRemoteAI || (config.isDevMode && !options.forceLocal);
  const svcConfig = useRemote ? serviceConfig.remote : serviceConfig.local;

  const serviceName = `${serviceType}:${useRemote ? 'remote' : 'local'}`;

  // Return service object
  return {
    name: serviceName,
    config: svcConfig,

    /**
     * Chat completion
     */
    async chat(messages, overrides = {}) {
      const opts = { ...svcConfig, ...overrides };
      const startTime = Date.now();

      logger.debug({
        service: serviceName,
        provider: opts.provider,
        model: opts.model,
        messageCount: messages.length
      }, 'AI chat request');

      let response;
      switch (opts.provider) {
        case 'openai':
          response = await chatOpenAI(messages, opts);
          break;
        case 'anthropic':
          response = await chatAnthropic(messages, opts);
          break;
        case 'ollama':
          response = await chatOllama(messages, opts);
          break;
        default:
          throw new Error(`Unknown provider: ${opts.provider}`);
      }

      const duration = Date.now() - startTime;
      logger.debug({
        service: serviceName,
        duration,
        tokens: response.usage?.totalTokens
      }, 'AI chat complete');

      return response;
    },

    /**
     * Generate embeddings (only for embedding service)
     */
    async embed(text) {
      if (serviceType !== 'embedding') {
        throw new Error(`embed() only available on 'embedding' service, not '${serviceType}'`);
      }

      const startTime = Date.now();
      let result;

      switch (svcConfig.provider) {
        case 'openai':
          result = await embedOpenAI(text, svcConfig);
          break;
        case 'ollama':
          result = await embedOllama(text, svcConfig);
          break;
        default:
          throw new Error(`Embedding not supported for provider: ${svcConfig.provider}`);
      }

      const duration = Date.now() - startTime;
      const count = Array.isArray(text) ? text.length : 1;
      logger.debug({ service: serviceName, duration, count }, 'Embedding complete');

      // Return single embedding if single input
      if (!Array.isArray(text)) {
        return result.embeddings[0];
      }
      return result.embeddings;
    }
  };
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

// Pre-configured services for common use cases
export const ai = {
  fast: () => aiService('fast'),
  balanced: () => aiService('balanced'),
  quality: () => aiService('quality'),
  creative: () => aiService('creative'),
  embedding: () => aiService('embedding'),

  // Direct access for backwards compatibility
  chat: (messages, opts = {}) => {
    const service = opts.service || 'balanced';
    return aiService(service).chat(messages, opts);
  },

  embed: (text) => aiService('embedding').embed(text),

  embedBatch: (texts) => aiService('embedding').embed(texts)
};

// Export config for inspection/debugging
export const getServiceConfig = () => ({ ...SERVICE_CONFIG });

/**
 * Get embedding dimensions for a service
 * Useful for configuring vector storage
 */
export function getEmbeddingDimensions(serviceType = 'embedding', options = {}) {
  const serviceConfig = SERVICE_CONFIG[serviceType];
  if (!serviceConfig) {
    throw new Error(`Unknown embedding service: ${serviceType}`);
  }

  const useRemote = options.forceRemote || config.useRemoteAI || (config.isDevMode && !options.forceLocal);
  const svcConfig = useRemote ? serviceConfig.remote : serviceConfig.local;

  return svcConfig.dimensions;
}

export default ai;
