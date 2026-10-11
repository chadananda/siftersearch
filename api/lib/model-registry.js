/**
 * AI Model Registry
 *
 * Centralized database of AI models with costs, capabilities, and recommendations.
 * Update periodically as new models are released and prices change.
 *
 * Last updated: January 2025
 */

// =============================================================================
// MODEL REGISTRY
// =============================================================================

export const MODEL_REGISTRY = {
  // =========================================================================
  // OpenAI Models
  // =========================================================================
  'gpt-4o': {
    provider: 'openai',
    name: 'GPT-4o',
    type: 'chat',
    pricing: { input: 0.0025, output: 0.01 },  // per 1K tokens
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision', 'function_calling'],
    quality: 'quality',
    speed: 'medium',
    recommended: ['complex_reasoning', 'multi_step_tasks', 'code_generation'],
    notes: 'Best overall model. Use for important tasks requiring high quality.'
  },

  'gpt-4o-mini': {
    provider: 'openai',
    name: 'GPT-4o Mini',
    type: 'chat',
    pricing: { input: 0.00015, output: 0.0006 },
    contextWindow: 128000,
    maxOutput: 16384,
    capabilities: ['reasoning', 'coding', 'analysis', 'function_calling'],
    quality: 'balanced',
    speed: 'fast',
    recommended: ['general_tasks', 'summarization', 'classification'],
    notes: 'Great balance of quality and cost. Default choice for most tasks.'
  },

  'gpt-4-turbo': {
    provider: 'openai',
    name: 'GPT-4 Turbo',
    type: 'chat',
    pricing: { input: 0.01, output: 0.03 },
    contextWindow: 128000,
    maxOutput: 4096,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision', 'function_calling'],
    quality: 'quality',
    speed: 'medium',
    deprecated: true,
    notes: 'Deprecated. Use gpt-4o instead for better price/performance.'
  },

  'gpt-3.5-turbo': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'openai',
    name: 'GPT-3.5 Turbo',
    type: 'chat',
    pricing: { input: 0.0005, output: 0.0015 },
    contextWindow: 16385,
    maxOutput: 4096,
    capabilities: ['basic_reasoning', 'coding', 'classification'],
    quality: 'fast',
    speed: 'very_fast',
    recommended: ['simple_tasks', 'classification', 'extraction'],
    notes: 'Fastest OpenAI model. Good for simple tasks where quality is less critical.'
  },

  'text-embedding-3-large': {
    provider: 'openai',
    name: 'Text Embedding 3 Large',
    type: 'embedding',
    pricing: { input: 0.00013, output: 0 },
    dimensions: 3072,
    maxInput: 8191,
    capabilities: ['semantic_search', 'clustering', 'similarity'],
    quality: 'quality',
    recommended: ['semantic_search', 'document_similarity'],
    notes: 'Best embedding model. Use for search and similarity tasks.'
  },

  'text-embedding-3-small': {
    provider: 'openai',
    name: 'Text Embedding 3 Small',
    type: 'embedding',
    pricing: { input: 0.00002, output: 0 },
    dimensions: 1536,
    maxInput: 8191,
    capabilities: ['semantic_search', 'clustering', 'similarity'],
    quality: 'balanced',
    recommended: ['cost_sensitive_search'],
    notes: '6x cheaper than large. Consider if cost is a major concern.'
  },

  'tts-1': {
    provider: 'openai',
    name: 'TTS-1',
    type: 'tts',
    pricing: { perChar: 0.000015 },  // $0.015 per 1K characters
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    quality: 'standard',
    speed: 'fast',
    notes: 'Standard quality TTS. Good for most use cases.'
  },

  'tts-1-hd': {
    provider: 'openai',
    name: 'TTS-1 HD',
    type: 'tts',
    pricing: { perChar: 0.00003 },  // $0.030 per 1K characters
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    quality: 'quality',
    speed: 'medium',
    notes: 'High quality TTS. 2x cost of standard.'
  },

  // =========================================================================
  // Anthropic Models
  // =========================================================================
  'claude-3-opus-20240229': {
    provider: 'anthropic',
    deprecated: true,   // superseded by the 5.5 family (Chad 10-11)
    name: 'Claude 3 Opus',
    type: 'chat',
    pricing: { input: 0.015, output: 0.075 },
    contextWindow: 200000,
    maxOutput: 4096,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision', 'creative_writing'],
    quality: 'premium',
    speed: 'slow',
    recommended: ['complex_analysis', 'creative_tasks', 'nuanced_writing'],
    notes: 'Most capable Claude. High cost - reserve for critical tasks.'
  },

  'claude-3-sonnet-20240229': {
    provider: 'anthropic',
    deprecated: true,   // superseded by the 5.5 family (Chad 10-11)
    name: 'Claude 3 Sonnet',
    type: 'chat',
    pricing: { input: 0.003, output: 0.015 },
    contextWindow: 200000,
    maxOutput: 4096,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
    quality: 'quality',
    speed: 'medium',
    recommended: ['balanced_quality', 'general_tasks'],
    notes: 'Good balance. Use when Claude quality is needed at reasonable cost.'
  },

  'claude-3-haiku-20240307': {
    provider: 'anthropic',
    deprecated: true,   // superseded by the 5.5 family (Chad 10-11)
    name: 'Claude 3 Haiku',
    type: 'chat',
    pricing: { input: 0.00025, output: 0.00125 },
    contextWindow: 200000,
    maxOutput: 4096,
    capabilities: ['reasoning', 'coding', 'analysis'],
    quality: 'fast',
    speed: 'very_fast',
    recommended: ['quick_tasks', 'classification', 'simple_generation'],
    notes: 'Fastest Claude 3. Great for high-volume, simpler tasks.'
  },

  'claude-haiku-4-5-20251001': {
    provider: 'anthropic',
    deprecated: true,   // superseded by the 5.5 family (Chad 10-11)
    name: 'Claude Haiku 4.5',
    type: 'chat',
    pricing: { input: 0.001, output: 0.005 },   // Haiku 4.5 = $1/M in, $5/M out (per-1K here). Was Haiku-3 rates ($0.25/$1.25) → 4× undercount that hid a ~$200 drain.
    contextWindow: 200000,
    maxOutput: 8192,
    capabilities: ['validation', 'classification', 'extraction', 'batch'],
    quality: 'balanced',
    speed: 'very_fast',
    recommended: ['entity_validation', 'qa_sampling', 'high_volume_classification'],
    notes: 'Use via Anthropic batch API for 50% discount on validation passes.'
  },

  'claude-sonnet-4-6': {
    provider: 'anthropic',
    deprecated: true,   // superseded by the 5.5 family (Chad 10-11)
    name: 'Claude Sonnet 4.6',
    type: 'chat',
    pricing: { input: 0.003, output: 0.015 },
    contextWindow: 200000,
    maxOutput: 8192,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision', 'extraction'],
    quality: 'quality',
    speed: 'medium',
    recommended: ['complex_extraction', 'adjudication', 'period_extraction', 'bridge_mining'],
    notes: 'Arbiter model for entity pipeline. Use for significance markers, period/episode extraction.'
  },

  'claude-opus-4-7': {
    provider: 'anthropic',
    deprecated: true,   // superseded by the 5.5 family (Chad 10-11)
    name: 'Claude Opus 4.7',
    type: 'chat',
    pricing: { input: 0.005, output: 0.025 },   // $5/$25 (was Claude-3-Opus $15/$75 — 3× overcount)
    contextWindow: 200000,
    maxOutput: 8192,
    capabilities: ['reasoning', 'analysis', 'coding', 'vision'],
    quality: 'premium',
    speed: 'slow',
    recommended: ['apex_tasks', 'rare_high_stakes'],
    notes: 'Apex model. Reserve for highest-stakes adjudication only.'
  },

  // --- Claude 5.5 family: the ONLY Anthropic models we use (Chad 2026-10-11). Prices per 1K tokens. Live list:
  // GET https://api.anthropic.com/v1/models (tests/api/model-registry-anthropic.test.js pins this set). Every
  // Anthropic call still passes api/lib/anthropic-policy.js (fail-closed).
  'claude-haiku-5-5': {
    provider: 'anthropic',
    noTemperature: true,   // the API rejects `temperature` ("deprecated for this model", 10-11)
    name: 'Claude Haiku 5.5',
    type: 'chat',
    pricing: { input: 0.0001, output: 0.0005 },            // $0.10 / $0.50 per 1M on prompts up to 100k tokens
    longContext: { threshold: 100000, input: 0.0005, output: 0.0025 },   // 5× above 100k ($0.50 / $2.50) — keep calls under it
    batch: 0.5,                                             // Message Batches: half price
    cacheRead: 0.1,
    contextWindow: 1000000,                                 // accepted; priced 5× past 100k
    maxOutput: 128000,
    capabilities: ['classification', 'extraction', 'segmentation', 'multilingual', 'batch'],
    quality: 'balanced',
    speed: 'very_fast',
    recommended: ['arabic_segmentation', 'system1_escalation', 'high_volume_classification'],
    released: '2026-10-07',
    notes: 'Best value model for Arabic (Chad 10-11). Segmentation: index/ending-only output, cached system prompt, <100k per call.'
  },
  'claude-sonnet-5-5': {
    provider: 'anthropic',
    noTemperature: true,   // the API rejects `temperature` ("deprecated for this model", 10-11)
    name: 'Claude Sonnet 5.5', type: 'chat',
    pricing: { input: 0.002, output: 0.010 }, batch: 0.5, cacheRead: 0.1,
    contextWindow: 1000000, maxOutput: 128000,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision', 'extraction'], quality: 'quality', speed: 'medium',
    recommended: ['complex_extraction', 'adjudication'], released: '2026-09-28',
  },
  'claude-opus-5-5': {
    provider: 'anthropic',
    noTemperature: true,   // the API rejects `temperature` ("deprecated for this model", 10-11)
    name: 'Claude Opus 5.5', type: 'chat',
    pricing: { input: 0.004, output: 0.020 }, batch: 0.5, cacheRead: 0.1,
    contextWindow: 1000000, maxOutput: 128000,
    capabilities: ['reasoning', 'analysis', 'coding', 'vision'], quality: 'premium', speed: 'slow',
    recommended: ['apex_tasks', 'rare_high_stakes'], released: '2026-09-21',
  },
  // Listed so a stray call is still PRICED (never logged at $0) — not for use: Chad 10-11, "the anthropic 5.5 models
  // are the only ones worth using".
  'claude-fable-5-1': { provider: 'anthropic', name: 'Claude Fable 5.1', type: 'chat', pricing: { input: 0.010, output: 0.050 }, batch: 0.5, contextWindow: 1000000, maxOutput: 128000, deprecated: true, notes: 'Not for use — 5.5 family only.' },
  'claude-fable-5': { provider: 'anthropic', name: 'Claude Fable 5', type: 'chat', pricing: { input: 0.010, output: 0.050 }, batch: 0.5, contextWindow: 1000000, maxOutput: 128000, deprecated: true, notes: 'Not for use — 5.5 family only.' },
  'claude-opus-5': { provider: 'anthropic', name: 'Claude Opus 5', type: 'chat', pricing: { input: 0.005, output: 0.025 }, batch: 0.5, contextWindow: 1000000, maxOutput: 128000, deprecated: true, notes: 'Not for use — 5.5 family only.' },
  'claude-sonnet-5': { provider: 'anthropic', name: 'Claude Sonnet 5', type: 'chat', pricing: { input: 0.003, output: 0.015 }, batch: 0.5, contextWindow: 1000000, maxOutput: 128000, deprecated: true, notes: 'Not for use — 5.5 family only.' },
  'claude-opus-4-8': { provider: 'anthropic', name: 'Claude Opus 4.8', type: 'chat', pricing: { input: 0.005, output: 0.025 }, batch: 0.5, contextWindow: 1000000, maxOutput: 128000, deprecated: true, notes: 'Not for use — 5.5 family only.' },

  // =========================================================================
  // Ollama / Local Models (Free)
  // Server: AMD 365+ Framework Desktop with 128GB shared RAM
  // All local models have zero API cost
  // =========================================================================

  // --- Qwen 2.5 Series (Excellent multilingual, coding) ---
  'qwen2.5:72b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Qwen 2.5 72B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    ramRequired: '45GB',
    capabilities: ['reasoning', 'coding', 'analysis', 'multilingual'],
    quality: 'premium',
    speed: 'slow',
    local: true,
    recommended: ['complex_local_tasks', 'translation', 'high_quality_free'],
    notes: 'Largest Qwen. Quality rivals GPT-4o. Needs ~45GB RAM. Perfect for 128GB system.'
  },

  'qwen2.5:32b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Qwen 2.5 32B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    ramRequired: '20GB',
    capabilities: ['reasoning', 'coding', 'analysis', 'multilingual'],
    quality: 'quality',
    speed: 'medium',
    local: true,
    recommended: ['cost_free_quality', 'translation', 'privacy_sensitive'],
    notes: 'Best balance for local. Quality comparable to GPT-4o-mini. Good for translation.'
  },

  'qwen2.5:14b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Qwen 2.5 14B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    ramRequired: '9GB',
    capabilities: ['reasoning', 'coding', 'analysis', 'multilingual'],
    quality: 'balanced',
    speed: 'fast',
    local: true,
    recommended: ['cost_free_balanced', 'development', 'search_planning'],
    notes: 'Good local model. Fast responses with solid quality.'
  },

  'qwen2.5:7b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Qwen 2.5 7B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    ramRequired: '5GB',
    capabilities: ['basic_reasoning', 'coding', 'classification'],
    quality: 'fast',
    speed: 'very_fast',
    local: true,
    recommended: ['simple_local_tasks', 'classification', 'routing'],
    notes: 'Fastest Qwen. Great for simple tasks and query routing.'
  },

  // --- DeepSeek API (cloud, OpenAI-compatible) ---
  // IMPORTANT: Verify model IDs at https://api.deepseek.com/models before first use.
  // If IDs differ, update these two keys — they are the single source of truth.
  'deepseek-v4-flash': {
    provider: 'deepseek',
    apiModel: 'deepseek-v4-flash',    // DeepSeek V4 flash — the live API id (deepseek-chat V3 is DEPRECATED; v4 only)
    name: 'DeepSeek V4 Flash',        // hybrid: CAN reason (emits reasoning_content); we run it thinking-disabled
                                      // for fast extraction, but reasoning still counts vs max_tokens → give
                                      // large-output stages full maxOutput headroom (see rag/entities/claims.js)
    type: 'chat',
    pricing: { input: 0.0003, output: 0.0012 },   // PEAK list $0.30 / $1.20 per 1M (official page, 10-10); off-peak ×0.5
    cacheRead: 0.02,                               // cache hit $0.006/1M = 2% of the miss rate (not the generic 10%)
    contextWindow: 64000,
    maxOutput: 8192,
    capabilities: ['extraction', 'classification', 'json_schema'],
    quality: 'quality',
    speed: 'fast',
    recommended: ['entity_extraction', 'classification', 'resolution'],
    // OFF-PEAK: everything outside 01-04 + 06-10 UTC Mon-Fri, and all weekend (pipeline/peak.js, 10-10) — the window
    // the pipeline is scheduled around. Multipliers are the published chat rate; override per-model from an invoice via
    // DEEPSEEK_OFFPEAK_INPUT / _OUTPUT rather than editing code, because the vendor changes these.
    // CACHE: hits bill at 10% of the input rate (already applied in logAIUsage). The previous note here
    // claimed "~98% discount", which contradicted the code and overstated how cheap cached input is.
    offPeak: { input: Number(process.env.DEEPSEEK_OFFPEAK_INPUT || 0.5), output: Number(process.env.DEEPSEEK_OFFPEAK_OUTPUT || 0.5) },
    notes: 'Primary bulk extraction model. Supports response_format json_schema. Cache hits bill at 10% of input.'
  },

  'deepseek-v4-pro': {
    provider: 'deepseek',
    apiModel: 'deepseek-v4-pro',      // DeepSeek V4 pro (thinking) — live API id, v4 only
    name: 'DeepSeek V4 Pro (thinking)',
    type: 'chat',
    pricing: { input: 0.00132, output: 0.00396 },  // PEAK list $1.32 / $3.96 per 1M (official page, 10-10); off-peak ×0.5
    cacheRead: 0.0333,                             // cache hit $0.044/1M
    contextWindow: 64000,
    maxOutput: 8192,
    capabilities: ['reasoning', 'adjudication', 'analysis'],
    quality: 'premium',
    speed: 'medium',
    recommended: ['promotion_adjudication', 'high_stakes_resolution'],
    offPeak: { input: 0.5, output: 0.5 },          // same schedule as flash (pipeline/peak.js)
    notes: 'Use for promotion adjudication.'
  },

  // --- DeepSeek Series (local Ollama) ---
  'deepseek-r1:32b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'DeepSeek R1 32B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 64000,
    maxOutput: 8192,
    ramRequired: '20GB',
    capabilities: ['reasoning', 'coding', 'analysis', 'chain_of_thought'],
    quality: 'quality',
    speed: 'medium',
    local: true,
    recommended: ['complex_reasoning', 'code_generation', 'analysis'],
    notes: 'Excellent reasoning model. Shows step-by-step thinking. Great for analysis.'
  },

  'deepseek-coder-v2:16b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'DeepSeek Coder V2 16B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 128000,
    maxOutput: 8192,
    ramRequired: '10GB',
    capabilities: ['coding', 'debugging', 'code_review'],
    quality: 'quality',
    speed: 'fast',
    local: true,
    recommended: ['code_generation', 'debugging', 'code_review'],
    notes: 'Specialized for code. Long context window. Fast for coding tasks.'
  },

  // --- Llama 3.2 Series (Meta, well-rounded) ---
  'llama3.2:90b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Llama 3.2 90B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 131072,
    maxOutput: 8192,
    ramRequired: '55GB',
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
    quality: 'premium',
    speed: 'slow',
    local: true,
    recommended: ['complex_tasks', 'multimodal'],
    notes: 'Largest Llama. Supports vision. Needs significant RAM.'
  },

  'llama3.2:11b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Llama 3.2 11B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 131072,
    maxOutput: 8192,
    ramRequired: '7GB',
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
    quality: 'balanced',
    speed: 'fast',
    local: true,
    recommended: ['general_tasks', 'vision_tasks'],
    notes: 'Compact vision model. Good all-rounder.'
  },

  // --- Mistral Series (Fast, efficient) ---
  'mistral-nemo:12b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Mistral Nemo 12B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 128000,
    maxOutput: 8192,
    ramRequired: '8GB',
    capabilities: ['reasoning', 'coding', 'function_calling'],
    quality: 'balanced',
    speed: 'fast',
    local: true,
    recommended: ['function_calling', 'api_integration'],
    notes: 'Great for tool use and function calling. Very long context.'
  },

  'mixtral:8x7b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'ollama',
    name: 'Mixtral 8x7B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    ramRequired: '26GB',
    capabilities: ['reasoning', 'coding', 'multilingual'],
    quality: 'quality',
    speed: 'medium',
    local: true,
    recommended: ['multilingual', 'diverse_tasks'],
    notes: 'MoE architecture. Only uses 12B params per inference. Efficient for quality.'
  },

  // =========================================================================
  // LM Studio Models (Local Network - Tailscale, Free)
  // Server: LM Studio on 100.103.78.63:1234
  // =========================================================================
  'qwen2.5-72b-instruct': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'lmstudio',
    name: 'Qwen 2.5 72B Instruct',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 16384,
    capabilities: ['reasoning', 'coding', 'analysis', 'multilingual', 'segmentation'],
    quality: 'premium',
    speed: 'medium',
    local: true,
    recommended: ['arabic_segmentation', 'farsi_segmentation', 'document_processing'],
    notes: 'Primary segmentation model. Excellent multilingual support. Hosted on LM Studio via Tailscale.'
  },

  'qwen2.5-7b-instruct': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'lmstudio',
    name: 'Qwen 2.5 7B Instruct',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    capabilities: ['basic_reasoning', 'classification', 'multilingual'],
    quality: 'fast',
    speed: 'very_fast',
    local: true,
    recommended: ['simple_tasks', 'classification'],
    notes: 'Fast lightweight model on LM Studio. Good for simple tasks.'
  },

  'openai/gpt-oss-20b': {
    deprecated: true,   // retired 10-11: no local LLM host (LM Studio/Ollama gone); obsolete remote
    provider: 'lmstudio',
    name: 'GPT-OSS 20B',
    type: 'chat',
    pricing: { input: 0, output: 0 },
    contextWindow: 32768,
    maxOutput: 8192,
    capabilities: ['reasoning', 'coding', 'analysis'],
    quality: 'balanced',
    speed: 'fast',
    local: true,
    recommended: ['general_tasks'],
    notes: 'Open-source GPT variant on LM Studio.'
  },

  // --- Embedding Models ---
  'nomic-embed-text': {
    provider: 'ollama',
    name: 'Nomic Embed Text',
    type: 'embedding',
    pricing: { input: 0, output: 0 },
    dimensions: 768,
    maxInput: 8192,
    ramRequired: '1GB',
    capabilities: ['semantic_search', 'clustering', 'similarity'],
    quality: 'balanced',
    local: true,
    notes: 'Free local embeddings. Good for cost-sensitive search.'
  },

  'mxbai-embed-large': {
    provider: 'ollama',
    name: 'MxBAI Embed Large',
    type: 'embedding',
    pricing: { input: 0, output: 0 },
    dimensions: 1024,
    maxInput: 512,
    ramRequired: '1.5GB',
    capabilities: ['semantic_search', 'clustering', 'similarity'],
    quality: 'quality',
    local: true,
    notes: 'Higher quality local embeddings. Good alternative to OpenAI.'
  },

  'snowflake-arctic-embed:l': {
    provider: 'ollama',
    name: 'Snowflake Arctic Embed L',
    type: 'embedding',
    pricing: { input: 0, output: 0 },
    dimensions: 1024,
    maxInput: 2048,
    ramRequired: '1.2GB',
    capabilities: ['semantic_search', 'retrieval'],
    quality: 'quality',
    local: true,
    notes: 'Optimized for retrieval. Good for search applications.'
  },

  // ── Spend-tracking entries (10-10: "make sure all spending is tracked"). Pricing per 1K tokens like the rest.
  // `unpriced: true` = the rate is not known to us yet: calls and tokens are still logged, and the analytics page lists
  // these models as UNPRICED instead of silently showing $0. Replace with the invoice rate when known.
  'jev-latest': {
    provider: 'typesafe', name: 'Jev (System-1)', type: 'classification',
    pricing: { input: 0.000042, output: 0 },   // Chad 09-28: $42 per BILLION input tokens, output free
  },
  // Clef: Cloudflare Workers AI list price 2026-10-10 (developers.cloudflare.com/workers-ai/platform/pricing):
  // input only ($0.011/1k neurons; clef 21,818 neurons/M, clef-flash 3,455/M); no output rate is listed.
  'clef': { provider: 'cloudflare', name: 'Clef (System-1, Workers AI)', type: 'classification', pricing: { input: 0.00024, output: 0 } },
  'clef-flash': { provider: 'cloudflare', name: 'Clef-flash (System-1, Workers AI)', type: 'classification', pricing: { input: 0.000038, output: 0 } },
  'gemini-embedding-2': {
    provider: 'google', name: 'Gemini Embedding 2', type: 'embedding',
    pricing: { input: 0.0002, output: 0 },     // $0.20 / 1M text (ai.google.dev pricing, checked 10-10)
  },
  // $0.30 in / $2.50 out per 1M, standard paid tier (ai.google.dev/gemini-api/docs/pricing, 10-10)
  // Flash tier, verified on the providers' own pricing pages 2026-10-11 (per 1k tokens; batch = 50% everywhere).
  'gemini-3.5-flash-lite': { provider: 'google', name: 'Gemini 3.5 Flash-Lite (Anís replies)', type: 'chat', pricing: { input: 0.0003, output: 0.0025 }, batch: 0.5, speed: 'very_fast', quality: 'balanced' },
  'gemini-3.1-flash-lite': { provider: 'google', name: 'Gemini 3.1 Flash-Lite', type: 'chat', pricing: { input: 0.00025, output: 0.0015 }, batch: 0.5, speed: 'very_fast', quality: 'fast' },
  'gemini-3.8-flash': { provider: 'google', name: 'Gemini 3.8 Flash', type: 'chat', pricing: { input: 0.00075, output: 0.00375 }, batch: 0.5, speed: 'fast', quality: 'quality',
    notes: 'introductory price through 2026-12-31; from 2027-01-01 $1.50 / $7.50 per 1M' },
  'gpt-5-nano': { provider: 'openai', noTemperature: true, maxTokensParam: 'max_completion_tokens', reasoningEffort: 'minimal', name: 'GPT-5 nano', type: 'chat', pricing: { input: 0.00005, output: 0.0004 }, cacheRead: 0.1, batch: 0.5, speed: 'very_fast', quality: 'fast' },
  'gpt-5.4-nano': { provider: 'openai', noTemperature: true, maxTokensParam: 'max_completion_tokens', reasoningEffort: 'minimal', name: 'GPT-5.4 nano', type: 'chat', pricing: { input: 0.0002, output: 0.00125 }, cacheRead: 0.1, batch: 0.5, speed: 'very_fast', quality: 'balanced' },
  'gpt-5-mini': { provider: 'openai', noTemperature: true, maxTokensParam: 'max_completion_tokens', reasoningEffort: 'minimal', name: 'GPT-5 mini', type: 'chat', pricing: { input: 0.00025, output: 0.002 }, cacheRead: 0.1, batch: 0.5, speed: 'fast', quality: 'balanced' },
  'gpt-5.4-mini': { provider: 'openai', noTemperature: true, maxTokensParam: 'max_completion_tokens', reasoningEffort: 'minimal', name: 'GPT-5.4 mini', type: 'chat', pricing: { input: 0.00075, output: 0.0045 }, cacheRead: 0.1, batch: 0.5, speed: 'fast', quality: 'quality' },
  'deepseek-flash': { provider: 'deepseek', name: 'DeepSeek V4.1 Flash (current id)', type: 'chat', pricing: { input: 0.0003, output: 0.0012 }, cacheRead: 0.02,
    notes: 'peak list; off-peak (outside 01-04 & 06-10 UTC weekdays) is half. deepseek-v4-flash is the older id' },
  // $0.59 / $0.79 per 1M = Groq's last public self-serve rate; since 08-2026 the model is enterprise "contact sales".
  'llama-3.3-70b-versatile': { provider: 'groq', name: 'Llama 3.3 70B (Groq)', type: 'chat', pricing: { input: 0.00059, output: 0.00079 } },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get model info by ID
 */
export function getModel(modelId) {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * Get model pricing
 */
export function getModelPricing(modelId) {
  const model = MODEL_REGISTRY[modelId];
  return model?.pricing || { input: 0, output: 0 };
}

/** Pricing for a call of this prompt size: a model with a longContext block bills its surcharged rates past the
 *  threshold (Haiku 5.5: 5× above 100k tokens). */
export function effectivePricing(modelId, promptTokens = 0) {
  const m = MODEL_REGISTRY[modelId];
  const lc = m?.longContext;
  return lc && promptTokens > lc.threshold ? { ...m.pricing, input: lc.input, output: lc.output } : (m?.pricing || { input: 0, output: 0 });
}

/**
 * Calculate cost for a request
 */
export function calculateCost(modelId, promptTokens, completionTokens) {
  const pricing = effectivePricing(modelId, promptTokens);
  if (pricing.perChar) {
    // TTS pricing is per character, not tokens
    return 0; // TTS cost calculated separately
  }
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1000;
}

/**
 * Get all models by type
 */
export function getModelsByType(type) {
  return Object.entries(MODEL_REGISTRY)
    .filter(([_, model]) => model.type === type)
    .map(([id, model]) => ({ id, ...model }));
}

/**
 * Get all models by provider
 */
export function getModelsByProvider(provider) {
  return Object.entries(MODEL_REGISTRY)
    .filter(([_, model]) => model.provider === provider)
    .map(([id, model]) => ({ id, ...model }));
}

/**
 * Get recommended alternatives for a model
 * Returns cheaper or better alternatives
 */
export function getAlternatives(modelId, preference = 'cheaper') {
  const model = MODEL_REGISTRY[modelId];
  if (!model) return [];

  const sameType = getModelsByType(model.type);
  const currentCost = (model.pricing.input + model.pricing.output) / 2;

  if (preference === 'cheaper') {
    return sameType
      .filter(m => {
        const cost = (m.pricing.input + m.pricing.output) / 2;
        return cost < currentCost && !m.deprecated;
      })
      .sort((a, b) => (a.pricing.input + a.pricing.output) - (b.pricing.input + b.pricing.output));
  } else if (preference === 'better') {
    return sameType
      .filter(m => {
        const qualityOrder = { premium: 4, quality: 3, balanced: 2, fast: 1 };
        return qualityOrder[m.quality] > qualityOrder[model.quality] && !m.deprecated;
      })
      .sort((a, b) => {
        const qualityOrder = { premium: 4, quality: 3, balanced: 2, fast: 1 };
        return qualityOrder[b.quality] - qualityOrder[a.quality];
      });
  }

  return [];
}

/**
 * Get cost optimization recommendations based on usage patterns
 */
export function getCostRecommendations(usageByModel) {
  const recommendations = [];

  for (const [modelId, usage] of Object.entries(usageByModel)) {
    const model = MODEL_REGISTRY[modelId];
    if (!model) continue;

    // Check for deprecated models
    if (model.deprecated) {
      const alternatives = getAlternatives(modelId, 'cheaper');
      if (alternatives.length > 0) {
        recommendations.push({
          type: 'deprecated',
          priority: 'high',
          currentModel: modelId,
          suggestedModel: alternatives[0].id,
          reason: `${model.name} is deprecated. Switch to ${alternatives[0].name} for better price/performance.`,
          potentialSavings: calculateSavings(usage, model, alternatives[0])
        });
      }
    }

    // Check for expensive models with high volume
    if (usage.calls > 100 && model.pricing.output > 0.01) {
      const cheaper = getAlternatives(modelId, 'cheaper');
      const cheaperNonLocal = cheaper.filter(m => !m.local);
      if (cheaperNonLocal.length > 0) {
        recommendations.push({
          type: 'cost_optimization',
          priority: 'medium',
          currentModel: modelId,
          suggestedModel: cheaperNonLocal[0].id,
          reason: `High volume usage. Consider ${cheaperNonLocal[0].name} for ${Math.round((1 - cheaperNonLocal[0].pricing.output / model.pricing.output) * 100)}% cost reduction.`,
          potentialSavings: calculateSavings(usage, model, cheaperNonLocal[0])
        });
      }
    }

    // Check for local model opportunities
    if (!model.local && usage.cost > 1) {
      const localAlternatives = getModelsByProvider('ollama').filter(m => m.type === model.type);
      if (localAlternatives.length > 0) {
        recommendations.push({
          type: 'local_alternative',
          priority: 'low',
          currentModel: modelId,
          suggestedModel: localAlternatives[0].id,
          reason: `Consider local model ${localAlternatives[0].name} for zero API costs. Requires local GPU.`,
          potentialSavings: usage.cost
        });
      }
    }
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

function calculateSavings(usage, currentModel, newModel) {
  const currentCost = (usage.promptTokens * currentModel.pricing.input +
                       usage.completionTokens * currentModel.pricing.output) / 1000;
  const newCost = (usage.promptTokens * newModel.pricing.input +
                   usage.completionTokens * newModel.pricing.output) / 1000;
  return Math.max(0, currentCost - newCost);
}

/**
 * Export all model IDs for reference
 */
export const MODEL_IDS = Object.keys(MODEL_REGISTRY);

export default MODEL_REGISTRY;
