// SifterSearch adapter for CorpusRAG — the ONLY place the app's infrastructure meets the library. It builds
// the injected ports (llm · models · store · profiler · log) from the application's own modules and hands
// them to createCorpusRAG. The library core imports NONE of this; a different host would write its own
// adapter. Use `rag` (a ready instance) or `createSifterRAG()` for a custom config.
import { createCorpusRAG } from '../rag/index.js';
import { makeStore } from './store.js';                       // Store port over the SifterSearch schema
import { chatCompletion } from '../ai.js';                    // the app's LLM client
import { getModel } from '../model-registry.js';              // price/provider/local catalog (incl. local models)
import { detectProfile } from '../pipeline/profile.js';       // the app's routing policy (language/genre → models)
import { logger } from '../logger.js';

// LLM port: translate the library's INTENT (json, thinking) into this client's provider-specific options.
// Provider quirks (which providers honour response_format) live HERE, never in the library.
const JSON_CAPABLE = new Set(['deepseek', 'openai']);
const llm = {
  chat: (messages, { model, provider, maxTokens, temperature = 0, json, thinking }) =>
    chatCompletion(messages, {
      provider, model, temperature, maxTokens,
      ...(json && JSON_CAPABLE.has(provider) ? { responseFormat: { type: 'json_object' } } : {}),
      ...(thinking ? { thinking: true } : {}),
    }),
};

// ModelCatalog port: the registry is already the authoritative catalog (provider · price · capabilities · local).
const models = { get: (id) => getModel(id) };

// Profiler port: the app's detectProfile IS the routing policy the library asks for per document.
const profiler = (meta, sample) => detectProfile(meta, sample);

// Host config that names concrete values the library must not hard-code — the method-version tags stamped on
// enriched rows. Kept equal to the existing corpus tags so re-runs are idempotent against current data.
const config = {
  versions: { disambig: 'deepseek-disambig-v1', hype: 'deepseek-hype-v1', extract: 'extract-v2' },
  models: { merge: 'deepseek-v4-flash', mergeFallback: 'claude-haiku-4-5-20251001' }, // dedup adjudication (not doc-scoped → no profile)
};

// Assemble the full dependency set. Any field can be overridden by a caller (e.g. tests inject fakes).
export function sifterDeps(overrides = {}) {
  return { llm, models, store: makeStore(), profiler, log: logger, config, ...overrides };
}

// A ready, app-wired CorpusRAG. Import this from application code and the pipeline orchestrator.
export function createSifterRAG(overrides = {}) {
  return createCorpusRAG(sifterDeps(overrides));
}

export const rag = createSifterRAG();
export default rag;
