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
    name: 'Claude 3 Haiku',
    type: 'chat',
    pricing: { input: 0.00025, output: 0.00125 },
    contextWindow: 200000,
    maxOutput: 4096,
    capabilities: ['reasoning', 'coding', 'analysis'],
    quality: 'fast',
    speed: 'very_fast',
    recommended: ['quick_tasks', 'classification', 'simple_generation'],
    notes: 'Fastest Claude. Great for high-volume, simpler tasks.'
  },

  // =========================================================================
  // Ollama / Local Models (Free)
  // Server: AMD 365+ Framework Desktop with 128GB shared RAM
  // All local models have zero API cost
  // =========================================================================

  // --- Qwen 2.5 Series (Excellent multilingual, coding) ---
  'qwen2.5:72b': {
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

  // --- DeepSeek Series (Strong coding and reasoning) ---
  'deepseek-r1:32b': {
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
  }
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

/**
 * Calculate cost for a request
 */
export function calculateCost(modelId, promptTokens, completionTokens) {
  const pricing = getModelPricing(modelId);
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
