/**
 * SifterSearch Agent System
 *
 * A multi-agent architecture for intelligent interfaith library search.
 *
 * AGENTS:
 * - Sifter: Orchestrator, routes queries to sub-agents
 * - Researcher: Search strategy specialist, plans simple/complex queries
 * - Analyzer: Re-ranking and summarization, highlights relevant content
 * - Translator: Shoghi Effendi style translation specialist
 * - Narrator: Audio narration with ElevenLabs and pronunciation dictionary
 */

import { BaseAgent } from './base-agent.js';
import { SifterAgent } from './agent-sifter.js';
import { ResearcherAgent } from './agent-researcher.js';
import { AnalyzerAgent } from './agent-analyzer.js';
import { TranslatorAgent } from './agent-translator.js';
import { NarratorAgent } from './agent-narrator.js';

export { BaseAgent, SifterAgent, ResearcherAgent, AnalyzerAgent, TranslatorAgent, NarratorAgent };

/**
 * Create a fully wired agent system
 */
export function createAgentSystem(options = {}) {
  const sifter = new SifterAgent(options.sifter);
  const researcher = new ResearcherAgent(options.researcher);
  const analyzer = new AnalyzerAgent(options.analyzer);
  const translator = new TranslatorAgent(options.translator);
  const narrator = new NarratorAgent(options.narrator);

  // Wire up the orchestrator with sub-agents
  sifter.registerAgents({ researcher, analyzer, translator, narrator });

  return {
    sifter,
    researcher,
    analyzer,
    translator,
    narrator,

    // Convenience method for processing queries
    async process(query, opts = {}) {
      return sifter.process(query, opts);
    }
  };
}

export default {
  BaseAgent,
  SifterAgent,
  ResearcherAgent,
  AnalyzerAgent,
  TranslatorAgent,
  NarratorAgent,
  createAgentSystem
};
