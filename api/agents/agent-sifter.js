/**
 * Sifter Agent - The Orchestrator
 *
 * Sifter is the main orchestrator agent that:
 * 1. Receives user queries
 * 2. Routes to appropriate sub-agents (Researcher, Analyzer, Translator, Narrator)
 * 3. Maintains conversational context and persona
 * 4. Synthesizes responses from multiple agents
 */

import { BaseAgent } from './base-agent.js';

const SIFTER_SYSTEM_PROMPT = `You are Sifter, a scholarly assistant for SifterSearch, an interfaith library containing thousands of religious and philosophical texts from the Baha'i Faith, Christianity, Islam, Buddhism, Hinduism, Judaism, and other traditions.

Your role is to help users FIND and EXPLORE passages - you are a librarian and research assistant, not a teacher or preacher.

PERSONALITY:
- Warm, welcoming, and genuinely curious about what users want to discover
- Scholarly but approachable - you love sharing knowledge without being condescending
- Respectful of all traditions - you present teachings without judgment or comparison
- Brief and to-the-point - you introduce sources, you don't lecture

CAPABILITIES:
- Search: Find relevant passages across the interfaith library
- Analyze: Re-rank and summarize search results for relevance
- Translate: Render texts in the style of Shoghi Effendi's English translations
- Narrate: Generate audio readings of passages with proper pronunciation

ROUTING DECISIONS:
When a user asks a question, determine the best approach:

1. SIMPLE SEARCH: Direct factual queries about specific topics
   - "What does Baha'u'llah say about justice?"
   - "Find passages about the soul"
   - Route: Researcher (fast) -> Analyzer -> Return results

2. COMPLEX SEARCH: Multi-faceted questions requiring research strategy
   - "Compare teachings on the afterlife across traditions"
   - "What is the Baha'i perspective on science and religion?"
   - Route: Researcher (strategic) -> Multiple searches -> Analyzer -> Synthesize

3. TRANSLATION REQUEST: User wants text rendered in a specific style
   - "Translate this passage in Shoghi Effendi's style"
   - Route: Translator agent

4. NARRATION REQUEST: User wants audio of a passage
   - "Read this to me"
   - "Can you narrate this passage?"
   - Route: Narrator agent

5. CONVERSATIONAL: User is chatting, asking about the library, or seeking guidance
   - "What can you help me with?"
   - "How does this library work?"
   - Handle directly with your persona

RESPONSE FORMAT:
- Keep introductions brief (1-2 sentences)
- Let the sources speak for themselves
- Reference passages by citation numbers [1], [2], etc.
- Never make up quotes - only reference what's found in search results
- If no results found, acknowledge honestly and suggest alternatives

Remember: You are a guide pointing to treasures, not the treasure itself. Help users discover; don't preach or interpret beyond what the texts say.`;

export class SifterAgent extends BaseAgent {
  constructor(options = {}) {
    super('sifter', {
      model: options.model || 'gpt-4o',
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens || 1000,
      systemPrompt: SIFTER_SYSTEM_PROMPT,
      ...options
    });

    // Sub-agents will be injected
    this.researcher = null;
    this.analyzer = null;
    this.translator = null;
    this.narrator = null;
  }

  /**
   * Register sub-agents for orchestration
   */
  registerAgents({ researcher, analyzer, translator, narrator }) {
    this.researcher = researcher;
    this.analyzer = analyzer;
    this.translator = translator;
    this.narrator = narrator;
  }

  /**
   * Determine the routing strategy for a user query
   */
  async routeQuery(query, context = {}) {
    const routingPrompt = `Analyze this user query and determine the best routing strategy.

Query: "${query}"
${context.previousMessages ? `Context: User has been discussing ${context.topic || 'general topics'}` : ''}

Respond with JSON only:
{
  "strategy": "simple_search" | "complex_search" | "translation" | "narration" | "conversational",
  "reasoning": "brief explanation",
  "searchQueries": ["array of search queries to run, if applicable"],
  "requiresMultipleSearches": boolean,
  "targetTraditions": ["specific traditions to focus on, or empty for all"]
}`;

    const response = await this.chat([
      { role: 'user', content: routingPrompt }
    ], { temperature: 0.3, maxTokens: 500 });

    try {
      return this.parseJSON(response.content);
    } catch (error) {
      this.logger.warn({ error, query }, 'Failed to parse routing response, defaulting to simple search');
      return {
        strategy: 'simple_search',
        reasoning: 'Default fallback',
        searchQueries: [query],
        requiresMultipleSearches: false,
        targetTraditions: []
      };
    }
  }

  /**
   * Process a user query through the appropriate agents
   */
  async process(query, options = {}) {
    const { context = {}, stream = false } = options;

    // Step 1: Determine routing strategy
    const routing = await this.routeQuery(query, context);
    this.logger.info({ query, routing }, 'Query routed');

    // Step 2: Execute based on strategy
    switch (routing.strategy) {
      case 'simple_search':
      case 'complex_search':
        return this.handleSearch(query, routing, { stream });

      case 'translation':
        return this.handleTranslation(query, context);

      case 'narration':
        return this.handleNarration(query, context);

      case 'conversational':
      default:
        return this.handleConversation(query, context);
    }
  }

  /**
   * Handle search queries (simple or complex)
   */
  async handleSearch(query, routing, options = {}) {
    if (!this.researcher || !this.analyzer) {
      throw new Error('Researcher and Analyzer agents not registered');
    }

    // Get search results from Researcher
    const searchResults = await this.researcher.search(query, {
      strategy: routing.strategy,
      queries: routing.searchQueries,
      traditions: routing.targetTraditions
    });

    // Analyze and re-rank results
    const analysis = await this.analyzer.analyze(query, searchResults, {
      stream: options.stream
    });

    return {
      type: 'search',
      routing,
      ...analysis
    };
  }

  /**
   * Handle translation requests
   */
  async handleTranslation(query, context) {
    if (!this.translator) {
      throw new Error('Translator agent not registered');
    }

    // Extract the text to translate from query or context
    const textToTranslate = context.selectedText || query;

    const translation = await this.translator.translate(textToTranslate, {
      style: 'shoghi-effendi',
      sourceLanguage: context.sourceLanguage || 'auto'
    });

    return {
      type: 'translation',
      original: textToTranslate,
      ...translation
    };
  }

  /**
   * Handle narration requests
   */
  async handleNarration(query, context) {
    if (!this.narrator) {
      throw new Error('Narrator agent not registered');
    }

    // Extract the text to narrate from query or context
    const textToNarrate = context.selectedText || context.lastResult?.text || query;

    const narration = await this.narrator.narrate(textToNarrate, {
      emotion: context.emotion || 'reverent',
      speed: context.speed || 'normal'
    });

    return {
      type: 'narration',
      text: textToNarrate,
      ...narration
    };
  }

  /**
   * Handle conversational queries (direct response)
   */
  async handleConversation(query, context) {
    const messages = context.previousMessages || [];
    messages.push({ role: 'user', content: query });

    const response = await this.chat(messages);

    return {
      type: 'conversation',
      response: response.content,
      usage: response.usage
    };
  }

  /**
   * Generate a welcome message for new users
   */
  async generateWelcome() {
    const response = await this.chat([
      {
        role: 'user',
        content: 'A new user just opened SifterSearch for the first time. Give them a warm, brief welcome introducing yourself and what you can help them do. Be friendly and inviting. Keep it to 2-3 sentences.'
      }
    ], { temperature: 0.8, maxTokens: 200 });

    return response.content;
  }

  /**
   * Get Sifter's default welcome message (no API call)
   */
  getDefaultWelcome() {
    return "Welcome to SifterSearch! I'm Jafar, your guide to exploring thousands of sacred texts across world traditions. Ask me anything - whether you're searching for specific teachings, comparing perspectives, or just curious about what's in the library.";
  }
}

export default SifterAgent;
