# SifterSearch Agent System

A modular multi-agent architecture for intelligent interfaith library search.

## Overview

The agent system consists of five specialized agents coordinated by an orchestrator:

```
User Query
    │
    ▼
┌─────────────┐
│   SIFTER    │ ◄── Orchestrator
│ (Routing)   │
└─────────────┘
    │
    ├───────────────┬───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌────────────┐   ┌──────────┐
│RESEARCHER│   │ ANALYZER │   │ TRANSLATOR │   │ NARRATOR │
│(Search)  │   │(Re-rank) │   │  (Style)   │   │ (Audio)  │
└─────────┘   └──────────┘   └────────────┘   └──────────┘
```

## Agents

| Agent | Purpose | File |
|-------|---------|------|
| [Sifter](./agent-sifter.md) | Orchestrator, routes queries to sub-agents | `api/agents/agent-sifter.js` |
| [Researcher](./agent-researcher.md) | Search strategy, simple/complex queries | `api/agents/agent-researcher.js` |
| [Analyzer](./agent-analyzer.md) | Re-ranking, summarization, highlighting | `api/agents/agent-analyzer.js` |
| [Translator](./agent-translator.md) | Shoghi Effendi translation style | `api/agents/agent-translator.js` |
| [Narrator](./agent-narrator.md) | Audio narration via ElevenLabs | `api/agents/agent-narrator.js` |

## Usage

```javascript
import { createAgentSystem } from './api/agents/index.js';

// Create fully wired agent system
const agents = createAgentSystem();

// Process a query (Sifter routes to appropriate agents)
const result = await agents.process("What does Baha'u'llah say about justice?");

// Or use individual agents directly
const searchPlan = await agents.researcher.createSearchPlan(query);
const analysis = await agents.analyzer.analyze(query, results);
const translation = await agents.translator.translate(text);
const audio = await agents.narrator.narrate(text);
```

## Design Principles

1. **Single Responsibility**: Each agent does one thing well
2. **Loose Coupling**: Agents communicate through the orchestrator
3. **Tunable**: Each agent has its own system prompt that can be refined
4. **Extensible**: New agents can be added without changing existing ones
5. **Fallback Graceful**: Agents handle errors and provide sensible defaults

## Configuration

Each agent accepts options in its constructor:

```javascript
const analyzer = new AnalyzerAgent({
  model: 'gpt-4o',        // AI model to use
  temperature: 0.3,       // Creativity vs consistency
  maxTokens: 3000         // Response length limit
});
```

## Adding a New Agent

1. Create `api/agents/agent-[name].js` extending `BaseAgent`
2. Define system prompt with clear instructions
3. Implement agent-specific methods
4. Add to `api/agents/index.js` exports
5. Register with Sifter if needed for routing
6. Create documentation in `docs/agents/agent-[name].md`
