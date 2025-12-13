---
title: Agent Architecture
description: A modular multi-agent AI system for intelligent interfaith library search
---

# SifterSearch Agent System

SifterSearch uses a **multi-agent AI architecture** where specialized agents collaborate to understand, research, analyze, and present search results. Each agent has distinct expertise and personality, working together under Sifter's orchestration to deliver spiritually-grounded insights from the world's sacred texts.

## Why Multi-Agent?

Traditional search returns a list of keyword matches. SifterSearch goes deeper:

1. **Understanding** - Sifter analyzes your question to determine the best approach
2. **Research** - The Researcher designs comprehensive search strategies that challenge secular assumptions
3. **Analysis** - The Analyzer scores and re-ranks results by true relevance
4. **Presentation** - Results are highlighted, summarized, and optionally translated or narrated

This pipeline transforms a simple query into a scholarly research experience.

## Architecture

```
User Query                                      Admin
    │                                             │
    ▼                                             ▼
┌─────────────┐                           ┌────────────┐
│   SIFTER    │ ◄── Orchestrator          │ LIBRARIAN  │
│ (Routing)   │                           │ (Curation) │
└─────────────┘                           └────────────┘
    │
    ├───────────────┬───────────────┬───────────────┬───────────────┐
    ▼               ▼               ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌────────┐
│RESEARCHER│   │ ANALYZER │   │ TRANSLATOR │   │ NARRATOR │   │ MEMORY │
│(Search)  │   │(Re-rank) │   │  (Style)   │   │ (Audio)  │   │(Context)│
└─────────┘   └──────────┘   └────────────┘   └──────────┘   └────────┘
```

## The Agents

### Sifter - Orchestrator
The friendly face of SifterSearch. Sifter receives your questions, determines the best approach, coordinates the other agents, and presents results in a warm, scholarly manner. Think of Sifter as your personal research librarian.

[Read Sifter Documentation →](/docs/agents/sifter)

---

### Researcher - Search Strategy
Designs comprehensive search strategies that transcend secular assumptions. Where conventional search confirms what you expect, the Researcher actively seeks spiritual perspectives that reframe problems through transformation rather than coercion.

**Key capability:** Federated search with batch embeddings - executes 7+ queries in ~250ms (5x faster than sequential).

[Read Researcher Documentation →](/docs/agents/researcher)

---

### Analyzer - Re-ranking & Scoring
Scores each result (0-100) using weighted criteria: Direct Relevance (40%), Depth of Insight (30%), Research Plan Alignment (20%), and Unexpectedness (10%). Filters low-scoring results, extracts key sentences, and highlights core terms.

**Key capability:** Uses research plan context to identify passages that challenge stated assumptions.

[Read Analyzer Documentation →](/docs/agents/analyzer)

---

### Translator - Shoghi Effendi Style
Renders text in the distinctive English prose style of Shoghi Effendi, Guardian of the Bahá'í Faith. Features elevated Victorian vocabulary ("vouchsafe", "verily"), inverted syntax, and rich spiritual imagery of light, ocean, and garden metaphors.

**Key capability:** Specialized prayer translation with reverent Divine address and supplicatory language.

[Read Translator Documentation →](/docs/agents/translator)

---

### Narrator - Audio Narration
Generates high-quality audio narration via ElevenLabs TTS, featuring a pronunciation dictionary for 80+ sacred terms across Bahá'í, Islamic, Jewish, Hindu, Buddhist, and Christian traditions.

**Key capability:** Context-aware emotion detection (reverent, scholarly, inspiring) with appropriate voice settings.

[Read Narrator Documentation →](/docs/agents/narrator)

---

### Memory - User Context
Provides semantic memory for user conversations. Stores, indexes, and retrieves relevant context from past interactions, enabling Sifter to maintain continuity across sessions and personalize responses based on user history.

**Key capability:** Semantic search across conversation history with cosine similarity matching.

[Read Memory Documentation →](/docs/agents/memory)

---

### Librarian - Library Management
Manages the SifterSearch library collection. Handles document ingestion, metadata enrichment, duplicate detection, quality assessment, and book research to keep the collection organized and comprehensive.

**Key capability:** AI-powered document analysis with ISBN lookup, cover image discovery, and duplicate detection via semantic search.

[Read Librarian Documentation →](/docs/agents/librarian)

---

## Design Principles

1. **Single Responsibility** - Each agent does one thing well
2. **Loose Coupling** - Agents communicate through the orchestrator
3. **Spiritual Orientation** - Seeks insights that elevate beyond secular assumptions
4. **Tunable** - Each agent has its own system prompt that can be refined
5. **Extensible** - New agents can be added without changing existing ones
6. **Graceful Fallback** - Agents handle errors and provide sensible defaults

## Usage

```javascript
import { createAgentSystem } from './api/agents/index.js';

// Create fully wired agent system
const agents = createAgentSystem();

// Process a query (Sifter routes to appropriate agents)
const result = await agents.process("What does Bahá'u'lláh say about justice?");

// Or use individual agents directly
const searchPlan = await agents.researcher.createSearchPlan(query);
const analysis = await agents.analyzer.analyze(query, results);
const translation = await agents.translator.translate(text);
const audio = await agents.narrator.narrate(text);
```

## Adding a New Agent

1. Create `api/agents/agent-[name].js` extending `BaseAgent`
2. Define system prompt with clear instructions
3. Implement agent-specific methods
4. Add to `api/agents/index.js` exports
5. Register with Sifter if needed for routing
6. Create documentation in `docs/agents/agent-[name].md`
