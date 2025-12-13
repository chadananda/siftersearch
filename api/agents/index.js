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
 * - Memory: Semantic memory for user conversations and context recall
 * - Librarian: Library management, document ingestion, and curation
 */

import { BaseAgent } from './base-agent.js';
import { SifterAgent } from './agent-sifter.js';
import { ResearcherAgent } from './agent-researcher.js';
import { AnalyzerAgent } from './agent-analyzer.js';
import { TranslatorAgent } from './agent-translator.js';
import { NarratorAgent } from './agent-narrator.js';
import { MemoryAgent } from './agent-memory.js';
import { LibrarianAgent } from './agent-librarian.js';

export { BaseAgent, SifterAgent, ResearcherAgent, AnalyzerAgent, TranslatorAgent, NarratorAgent, MemoryAgent, LibrarianAgent };

/**
 * Create a fully wired agent system
 */
export function createAgentSystem(options = {}) {
  const sifter = new SifterAgent(options.sifter);
  const researcher = new ResearcherAgent(options.researcher);
  const analyzer = new AnalyzerAgent(options.analyzer);
  const translator = new TranslatorAgent(options.translator);
  const narrator = new NarratorAgent(options.narrator);
  const memory = new MemoryAgent(options.memory);
  const librarian = new LibrarianAgent(options.librarian);

  // Wire up the orchestrator with sub-agents
  sifter.registerAgents({ researcher, analyzer, translator, narrator, memory, librarian });

  return {
    sifter,
    researcher,
    analyzer,
    translator,
    narrator,
    memory,
    librarian,

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
  MemoryAgent,
  LibrarianAgent,
  createAgentSystem
};
