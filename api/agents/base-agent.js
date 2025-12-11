/**
 * Base Agent Class
 *
 * Foundation for all SifterSearch agents. Provides common functionality
 * for AI interactions, logging, and configuration management.
 */

import { ai } from '../lib/ai.js';
import { logger } from '../lib/logger.js';

export class BaseAgent {
  constructor(name, options = {}) {
    this.name = name;
    this.model = options.model || 'gpt-4o';
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens || 2000;
    this.systemPrompt = options.systemPrompt || '';
    this.logger = logger.child({ agent: name });
  }

  /**
   * Execute a chat completion with the agent's configuration
   */
  async chat(messages, options = {}) {
    const startTime = Date.now();

    const fullMessages = this.systemPrompt
      ? [{ role: 'system', content: this.systemPrompt }, ...messages]
      : messages;

    try {
      const response = await ai.chat(fullMessages, {
        temperature: options.temperature ?? this.temperature,
        maxTokens: options.maxTokens ?? this.maxTokens,
        stream: options.stream ?? false
      });

      const duration = Date.now() - startTime;
      this.logger.info({ duration, tokens: response.usage?.totalTokens }, 'Chat completed');

      return response;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Chat failed');
      throw error;
    }
  }

  /**
   * Execute a streaming chat completion
   */
  async *chatStream(messages, options = {}) {
    const fullMessages = this.systemPrompt
      ? [{ role: 'system', content: this.systemPrompt }, ...messages]
      : messages;

    const stream = await ai.chat(fullMessages, {
      temperature: options.temperature ?? this.temperature,
      maxTokens: options.maxTokens ?? this.maxTokens,
      stream: true
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }

  /**
   * Parse JSON from AI response, handling markdown code blocks
   */
  parseJSON(content) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    // Try to find raw JSON object
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    // Try to find raw JSON array
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }

    throw new Error('No valid JSON found in response');
  }

  /**
   * Get agent info for debugging/monitoring
   */
  getInfo() {
    return {
      name: this.name,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens
    };
  }
}

export default BaseAgent;
