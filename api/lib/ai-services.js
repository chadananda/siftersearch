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
import { query, telemetryQuery } from './db.js';
import { getModel } from './model-registry.js';

// =============================================================================
// MODEL PRICING (per 1K tokens, Jan 2025)
// =============================================================================

const MODEL_PRICING = {
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'text-embedding-3-large': { input: 0.00013, output: 0 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },

  // Anthropic
  'claude-opus-4-7': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.00025, output: 0.00125 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },

  // Ollama (local, free)
  'qwen2.5:32b': { input: 0, output: 0 },
  'qwen2.5:14b': { input: 0, output: 0 },
  'qwen2.5:7b': { input: 0, output: 0 },
  'nomic-embed-text': { input: 0, output: 0 },

  // LM Studio (local network, free)
  'qwen2.5-72b-instruct': { input: 0, output: 0 },
  'qwen2.5-7b-instruct': { input: 0, output: 0 },
  'openai/gpt-oss-20b': { input: 0, output: 0 },
};

// =============================================================================
// SPENDING LIMITS & SAFEGUARDS
// =============================================================================

const DAILY_SPENDING_LIMIT_USD = 100;  // Per-service daily limit

// In-memory state (persisted to DB for recovery)
let aiProcessingPaused = false;
let pausedReason = null;
let pausedAt = null;

/**
 * Custom error for budget exceeded - allows UI to show specific message
 */
export class AIBudgetExceededError extends Error {
  constructor(service, dailySpend, limit) {
    super(`AI processing paused: ${service} exceeded daily limit ($${dailySpend.toFixed(2)} / $${limit})`);
    this.name = 'AIBudgetExceededError';
    this.service = service;
    this.dailySpend = dailySpend;
    this.limit = limit;
    this.isPaused = true;
  }
}

/**
 * Check if AI processing is paused
 */
export function isAIProcessingPaused() {
  return {
    paused: aiProcessingPaused,
    reason: pausedReason,
    pausedAt
  };
}

/**
 * Get daily spending for a service type
 */
async function getDailySpending(serviceType) {
  try {
    const result = await query(
      `SELECT SUM(estimated_cost_usd) as total
       FROM ai_usage
       WHERE service_type = ?
       AND date(timestamp) = date('now')`,
      [serviceType]
    );
    return result.rows?.[0]?.total || 0;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to check daily spending');
    return 0;  // Don't block on error
  }
}

/**
 * Get all daily spending by service
 */
export async function getAllDailySpending() {
  try {
    const result = await query(
      `SELECT service_type, SUM(estimated_cost_usd) as total
       FROM ai_usage
       WHERE date(timestamp) = date('now')
       GROUP BY service_type`
    );
    const spending = {};
    for (const row of result.rows || []) {
      spending[row.service_type] = row.total || 0;
    }
    return spending;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to get all daily spending');
    return {};
  }
}

/**
 * Service types exempt from the spending pause.
 * Search/chat AI should always work for users, and embeddings
 * must keep running to maintain the search index pipeline.
 * The embedding worker has its own backoff for API errors (429s).
 */
const PAUSE_EXEMPT_SERVICES = new Set(['fast', 'balanced', 'quality', 'creative', 'segmentation', 'embedding']);

/**
 * Check spending and pause if over limit
 * Returns true if processing should continue, throws if paused
 */
async function checkSpendingLimit(serviceType) {
  // Exempt services bypass spending limits entirely
  if (PAUSE_EXEMPT_SERVICES.has(serviceType)) {
    return true;
  }

  // If already paused, block non-exempt services
  if (aiProcessingPaused) {
    throw new AIBudgetExceededError(pausedReason, 0, DAILY_SPENDING_LIMIT_USD);
  }

  const dailySpend = await getDailySpending(serviceType);

  if (dailySpend >= DAILY_SPENDING_LIMIT_USD) {
    // Pause all AI processing
    aiProcessingPaused = true;
    pausedReason = serviceType;
    pausedAt = new Date().toISOString();

    logger.error({
      serviceType,
      dailySpend,
      limit: DAILY_SPENDING_LIMIT_USD
    }, '🚨 AI PROCESSING PAUSED - Daily spending limit exceeded');

    // Persist pause state to DB for recovery after restart
    try {
      await query(
        `INSERT OR REPLACE INTO app_config (key, value, updated_at)
         VALUES ('ai_processing_paused', ?, datetime('now'))`,
        [JSON.stringify({ paused: true, reason: serviceType, pausedAt })]
      );
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to persist pause state');
    }

    throw new AIBudgetExceededError(serviceType, dailySpend, DAILY_SPENDING_LIMIT_USD);
  }

  return true;
}

/**
 * Resume AI processing (admin action)
 */
export async function resumeAIProcessing() {
  aiProcessingPaused = false;
  pausedReason = null;
  pausedAt = null;

  logger.info('✅ AI processing resumed by admin');

  // Clear persisted pause state
  try {
    await query(
      `INSERT OR REPLACE INTO app_config (key, value, updated_at)
       VALUES ('ai_processing_paused', ?, datetime('now'))`,
      [JSON.stringify({ paused: false })]
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to clear pause state');
  }

  return { success: true, message: 'AI processing resumed' };
}

/**
 * Initialize pause state from DB (call on startup)
 */
export async function initAIProcessingState() {
  try {
    const result = await query(
      `SELECT value FROM app_config WHERE key = 'ai_processing_paused'`
    );
    if (result.rows?.[0]?.value) {
      const state = JSON.parse(result.rows[0].value);
      if (state.paused) {
        aiProcessingPaused = true;
        pausedReason = state.reason;
        pausedAt = state.pausedAt;
        logger.warn({ reason: pausedReason, pausedAt }, 'AI processing is paused (restored from DB)');
      }
    }
  } catch (err) {
    // Table might not exist yet, that's fine
    logger.debug({ err: err.message }, 'Could not restore AI pause state');
  }
}

// =============================================================================
// USAGE LOGGING
// =============================================================================

/**
 * Log AI usage to database for cost tracking.
 * Fire-and-forget: deferred via setImmediate so the caller's event-loop
 * tick completes first, then silently drops the record if the DB is locked.
 * better-sqlite3 is synchronous — a locked DB blocks the entire Node thread,
 * so we must never await this on a hot request path.
 */
export function logAIUsage({
  provider,
  model,
  serviceType,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  caller = null,
  success = true,
  errorMessage = null,
  userId = null,
  jobId = null,
  documentId = null
}) {
  // Telemetry write: use dedicated connection with 200ms busy_timeout so WAL
  // contention from the sync worker never freezes the event loop.
  setImmediate(() => {
    try {
      const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
      const inputTokens = promptTokens || totalTokens;
      const cost = (inputTokens * pricing.input + completionTokens * pricing.output) / 1000;
      telemetryQuery(
        `INSERT INTO ai_usage (
          provider, model, service_type,
          prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
          caller, success, error_message, user_id, job_id, document_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          provider, model, serviceType,
          promptTokens, completionTokens, totalTokens, cost,
          caller, success ? 1 : 0, errorMessage, userId, jobId, documentId
        ]
      );
    } catch (err) {
      logger.warn({ err: err.message, model, serviceType }, 'Failed to log AI usage');
    }
  });
}

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
      model: 'gpt-3.5-turbo',      // USER-FACING fast path — low latency. DeepSeek is reserved for backend/parallel.
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
      model: 'gpt-3.5-turbo',      // USER-FACING fast path
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
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',  // USER-FACING quality path — Haiku: fast + capable
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
      model: 'claude-haiku-4-5-20251001',  // USER-FACING conversational path — Haiku
      temperature: 0.8,
      maxTokens: 500
    }
  },

  // Segmentation: Arabic/Farsi document segmentation via LM Studio
  // Use: AI-powered text segmentation for non-Latin scripts
  get segmentation() {
    const segConfig = config.ai.segmentation;
    return {
      local: {
        provider: segConfig.provider,
        model: segConfig.model,
        temperature: segConfig.temperature,
        maxTokens: segConfig.maxTokens
      },
      remote: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 16000
      }
    };
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
  ollama: null,
  lmstudio: null
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

    case 'lmstudio':
      clients.lmstudio = new OpenAI({
        baseURL: `${config.ai.endpoints.lmstudio}/v1`,
        apiKey: 'lm-studio'  // LM Studio doesn't require a real key
      });
      break;

    case 'deepseek':
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY required for DeepSeek provider');
      }
      clients.deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
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
  const reqOpts = opts.signal ? { signal: opts.signal } : {};
  const response = await client.chat.completions.create({
    model: opts.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: opts.stream || false
  }, reqOpts);

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

// DeepSeek (OpenAI-compatible endpoint). Registry keys (deepseek-v4-flash / -pro) resolve to the live API id via the
// registry; thinking mode is explicit (v4-flash serves both — non-thinking by default, replacing the deprecated
// deepseek-chat). See https://api-docs.deepseek.com — deepseek-chat/deepseek-reasoner deprecate 2026-07-24.
async function chatDeepSeek(messages, opts) {
  const client = getClient('deepseek');
  const apiModel = getModel(opts.model)?.apiModel || opts.model;
  const reqOpts = opts.signal ? { signal: opts.signal } : {};
  const params = {
    model: apiModel, messages,
    temperature: opts.temperature, max_tokens: opts.maxTokens, stream: opts.stream || false,
    extra_body: { thinking: { type: opts.thinking ? 'enabled' : 'disabled' } }
  };
  if (opts.responseFormat) params.response_format = opts.responseFormat;
  const response = await client.chat.completions.create(params, reqOpts);
  if (opts.stream) return response;
  return {
    content: response.choices[0].message.content,
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      cachedTokens: response.usage?.prompt_cache_hit_tokens || 0,
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

  // Build system parameter — supports prefix caching when opts.cacheSystemPrompt is true.
  // Prefix caching reuses the KV cache for identical system prompts across calls,
  // reducing input token costs to ~10% for repeated calls with the same system prompt.
  let systemParam;
  if (systemMsg) {
    if (opts.cacheSystemPrompt) {
      // Structured format with cache_control for prefix caching
      systemParam = [
        { type: 'text', text: systemMsg.content, cache_control: { type: 'ephemeral' } }
      ];
    } else {
      systemParam = systemMsg.content;
    }
  }

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    ...(systemParam && { system: systemParam }),
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
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      cacheCreationInputTokens: response.usage?.cache_creation_input_tokens || 0,
      cacheReadInputTokens: response.usage?.cache_read_input_tokens || 0
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
    stream: opts.stream || false,
    ...(opts.signal ? { signal: opts.signal } : {}),
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

async function chatLmstudio(messages, opts) {
  const client = getClient('lmstudio');
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

// =============================================================================
// EMBEDDING IMPLEMENTATIONS
// =============================================================================

// OpenAI embedding limits:
// - text-embedding-3-large: 8191 tokens per text, 300,000 tokens per request
// - Roughly ~4 chars per token, so ~32k chars per text, ~1.2M chars per request
// We batch conservatively: 50 chunks per batch (assuming ~1500 chars/chunk = 75k chars = ~19k tokens)
const EMBEDDING_BATCH_SIZE = 50;

// Bulletproof against the three OpenAI embedding-request failures that caused infinite ingest-retry loops:
//   (1) a single input > 8192 tokens, (2) a batch > 300K tokens/request, (3) an empty input.
// Every input is capped + made non-empty, and batches are bounded by BOTH count and char-budget. Worst case is
// ~1 token/char (Arabic/CJK), so 8000 chars/input < 8192 tokens and 200K chars/batch < 300K tokens — safe for any script.
const MAX_EMBED_CHARS = 8000;
const MAX_BATCH_CHARS = 200000;
async function embedOpenAI(text, opts) {
  const client = getClient('openai');
  const raw = Array.isArray(text) ? text : [text];
  const inputs = raw.map((t) => { let s = String(t ?? ''); if (!s.trim()) s = ' '; return s.length > MAX_EMBED_CHARS ? s.slice(0, MAX_EMBED_CHARS) : s; });

  const allEmbeddings = [];
  let totalTokens = 0;
  let i = 0;
  while (i < inputs.length) {
    const batch = [];
    let chars = 0;
    while (i < inputs.length && batch.length < EMBEDDING_BATCH_SIZE && (batch.length === 0 || chars + inputs[i].length <= MAX_BATCH_CHARS)) {
      chars += inputs[i].length; batch.push(inputs[i]); i++;
    }
    const response = await client.embeddings.create({ model: opts.model, input: batch, dimensions: opts.dimensions });
    allEmbeddings.push(...response.data.map(d => d.embedding));
    totalTokens += response.usage?.total_tokens || 0;
  }

  return { embeddings: allEmbeddings, usage: { totalTokens } };
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
     * @param {Array} messages - Chat messages
     * @param {Object} overrides - Override options
     * @param {string} overrides.caller - Identifier for usage tracking (e.g., 'translation', 'search')
     * @param {string} overrides.userId - User ID for usage tracking
     * @param {string} overrides.jobId - Job ID for usage tracking
     * @param {string} overrides.documentId - Document ID for usage tracking
     */
    async chat(messages, overrides = {}) {
      const opts = { ...svcConfig, ...overrides };
      const startTime = Date.now();
      const { caller, userId, jobId, documentId } = overrides;

      // Check spending limit before making AI call (skip for local/free models)
      if (opts.provider !== 'ollama' && opts.provider !== 'lmstudio') {
        await checkSpendingLimit(serviceType);
      }

      logger.debug({
        service: serviceName,
        provider: opts.provider,
        model: opts.model,
        messageCount: messages.length
      }, 'AI chat request');

      let response;
      try {
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
          case 'lmstudio':
            response = await chatLmstudio(messages, opts);
            break;
          case 'deepseek':
            response = await chatDeepSeek(messages, opts);
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

        // Log successful usage
        logAIUsage({
          provider: opts.provider,
          model: opts.model,
          serviceType: 'chat',
          promptTokens: response.usage?.promptTokens || 0,
          completionTokens: response.usage?.completionTokens || 0,
          totalTokens: response.usage?.totalTokens || 0,
          caller: caller || serviceType,
          success: true,
          userId,
          jobId,
          documentId
        });

        return response;
      } catch (err) {
        // Log failed usage
        logAIUsage({
          provider: opts.provider,
          model: opts.model,
          serviceType: 'chat',
          caller: caller || serviceType,
          success: false,
          errorMessage: err.message?.substring(0, 500),
          userId,
          jobId,
          documentId
        });
        throw err;
      }
    },

    /**
     * Generate embeddings (only for embedding service)
     * @param {string|Array} text - Text(s) to embed
     * @param {Object} options - Options for usage tracking
     * @param {string} options.caller - Identifier for usage tracking
     * @param {string} options.userId - User ID for usage tracking
     * @param {string} options.jobId - Job ID for usage tracking
     * @param {string} options.documentId - Document ID for usage tracking
     */
    async embed(text, options = {}) {
      if (serviceType !== 'embedding') {
        throw new Error(`embed() only available on 'embedding' service, not '${serviceType}'`);
      }

      // Check spending limit before making AI call (skip for local/free models)
      if (svcConfig.provider !== 'ollama') {
        await checkSpendingLimit(serviceType);
      }

      const startTime = Date.now();
      const { caller, userId, jobId, documentId } = options;
      let result;

      try {
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

        // Log successful usage
        logAIUsage({
          provider: svcConfig.provider,
          model: svcConfig.model,
          serviceType: 'embedding',
          totalTokens: result.usage?.totalTokens || 0,
          caller: caller || 'embedding',
          success: true,
          userId,
          jobId,
          documentId
        });

        // Return single embedding if single input
        if (!Array.isArray(text)) {
          return result.embeddings[0];
        }
        return result.embeddings;
      } catch (err) {
        // Log failed usage
        logAIUsage({
          provider: svcConfig.provider,
          model: svcConfig.model,
          serviceType: 'embedding',
          caller: caller || 'embedding',
          success: false,
          errorMessage: err.message?.substring(0, 500),
          userId,
          jobId,
          documentId
        });
        throw err;
      }
    }
  };
}

// =============================================================================
// SEGMENTATION SERVICE (with automatic fallback)
// =============================================================================

/**
 * Get segmentation AI service with automatic fallback.
 * Tries LM Studio first (free, local network), falls back to cloud API on error.
 */
export function segmentationService() {
  // Always try local (LM Studio) first, regardless of USE_REMOTE_AI setting
  const primary = aiService('segmentation', { forceLocal: true });

  return {
    name: primary.name,
    config: primary.config,

    async chat(messages, overrides = {}) {
      try {
        return await primary.chat(messages, overrides);
      } catch (err) {
        // If LM Studio fails, fall back to cloud API
        const primaryProvider = primary.config.provider;
        if (primaryProvider === 'lmstudio') {
          logger.warn({ err: err.message }, 'LM Studio unreachable, falling back to cloud API for segmentation');
          const fallback = aiService('segmentation', { forceRemote: true });
          return await fallback.chat(messages, overrides);
        }
        throw err;
      }
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
