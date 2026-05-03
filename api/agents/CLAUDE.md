# api/agents — Specialized AI agents (legacy)

Agent classes built on top of `base-agent.js`. Most replaced by the
three-stage Jafar pipeline (`api/lib/jafar-pipeline.js`); kept for
specialized tasks where the pipeline isn't the right fit.

- `base-agent.js` — `BaseAgent` class. Common config, logging, retry.
- `index.js` — re-exports the agent set.
- `agent-sifter.js` — primary search-and-respond agent (legacy; Jafar replaces).
- `agent-researcher.js` — multi-step research agent.
- `agent-analyzer.js` — re-rank / analyze passages for relevance.
- `agent-librarian.js` — duplicate detection + ISBN lookup + cataloging. Used for ingestion validation.
- `agent-memory.js` — chat-memory persistence agent.
- `agent-narrator.js` — TTS narration with voice selection.
- `agent-transcriber.js` — STT transcription agent.
- `agent-translator.js` — translation agent (largely superseded by `api/lib/translation-subagent.js`).

Common pattern: each agent extends BaseAgent, registers its tool set, and
exposes a single async `run()` method. Runs against the configured
provider (default OpenAI; some use local Qwen via Ollama).
