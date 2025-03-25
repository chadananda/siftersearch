/**
 * AI Services Configuration
 * 
 * This file centralizes all AI-related configuration.
 * It imports both PUBLIC and SECRETS from the central config module.
 */

import { PUBLIC, SECRETS } from './config.js';

// OpenAI configuration
const openaiConfig = {
  apiKey: SECRETS.OPENAI_API_KEY,
  // Models will be selected based on task
};

// Anthropic configuration
const anthropicConfig = {
  apiKey: SECRETS.ANTHROPIC_API_KEY,
  // Models will be selected based on task
};

// Groq configuration
const groqConfig = {
  apiKey: SECRETS.GROQ_API_KEY,
  orgId: SECRETS.GROQ_ORG_ID,
  // Models will be selected based on task
};

// DeepSeek configuration
const deepseekConfig = {
  apiKey: SECRETS.DEEPSEEK_API_KEY,
  // Models will be selected based on task
};

// Perplexity configuration
const perplexityConfig = {
  apiKey: SECRETS.PERPLEXITY_API_KEY,
  // Models will be selected based on task
};

// Ultravox configuration
const ultravoxConfig = {
  apiKey: SECRETS.ULTRAVOX_API_KEY,
  endpoint: PUBLIC.VOICE_LLM_ENDPOINT || 'https://api.ultravox.ai/api/calls',
  enableStreaming: PUBLIC.VOICE_ENABLE_STREAMING === 'true',
};

// Task-specific LLM configurations
const taskConfigs = {
  // Chat completion task
  chat: {
    provider: PUBLIC.CHAT_LLM_PROVIDER || 'openai',
    model: PUBLIC.CHAT_LLM_MODEL || 'gpt-4o',
    temperature: parseFloat(PUBLIC.CHAT_LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(PUBLIC.CHAT_LLM_MAX_TOKENS || '1000', 10),
  },
  
  // Search enhancement task
  search: {
    provider: PUBLIC.SEARCH_LLM_PROVIDER || 'openai',
    model: PUBLIC.SEARCH_LLM_MODEL || 'gpt-3.5-turbo',
    temperature: parseFloat(PUBLIC.SEARCH_LLM_TEMPERATURE || '0.2'),
    maxTokens: parseInt(PUBLIC.SEARCH_LLM_MAX_TOKENS || '500', 10),
  },
  
  // Document processing task
  document: {
    provider: PUBLIC.DOC_LLM_PROVIDER || 'anthropic',
    model: PUBLIC.DOC_LLM_MODEL || 'claude-3-haiku',
    temperature: parseFloat(PUBLIC.DOC_LLM_TEMPERATURE || '0.1'),
    maxTokens: parseInt(PUBLIC.DOC_LLM_MAX_TOKENS || '2000', 10),
  },
  
  // Voice chat task
  voice: {
    provider: PUBLIC.VOICE_LLM_PROVIDER || 'ultravox',
    endpoint: PUBLIC.VOICE_LLM_ENDPOINT || 'https://api.ultravox.ai/api/calls',
    enableStreaming: PUBLIC.VOICE_ENABLE_STREAMING === 'true',
  },
  
  // Embedding task
  embedding: {
    provider: 'openai',
    model: PUBLIC.EMBEDDING_MODEL || 'text-embedding-3-small',
  }
};

// Combined AI configuration
const aiConfig = {
  openai: openaiConfig,
  anthropic: anthropicConfig,
  groq: groqConfig,
  deepseek: deepseekConfig,
  perplexity: perplexityConfig,
  ultravox: ultravoxConfig,
  tasks: taskConfigs,
  
  // Get configuration for a specific provider
  getProvider(name) {
    const providerName = name?.toLowerCase();
    switch (providerName) {
      case 'openai':
        return this.openai;
      case 'anthropic':
        return this.anthropic;
      case 'groq':
        return this.groq;
      case 'deepseek':
        return this.deepseek;
      case 'perplexity':
        return this.perplexity;
      case 'ultravox':
        return this.ultravox;
      default:
        return this.openai;
    }
  },
  
  // Get configuration for a specific task
  getTaskConfig(taskName) {
    const task = taskName?.toLowerCase();
    return this.tasks[task] || this.tasks.chat;
  }
};

export default aiConfig;
