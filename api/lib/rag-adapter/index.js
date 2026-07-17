// SifterSearch adapter for CorpusRAG — the ONLY place the app's infrastructure meets the library. It builds
// the injected ports (llm · models · store · profiler · log) from the application's own modules and hands
// them to createCorpusRAG. The library core imports NONE of this; a different host would write its own
// adapter. Use `rag` (a ready instance) or `createSifterRAG()` for a custom config.
import { createCorpusRAG } from '../rag/index.js';
import { makeStore } from './store.js';                       // Store port over the SifterSearch schema
import { makeWeb } from './web.js';                           // WebResearch port (keyless Wikipedia, sourced)
import { chatCompletion } from '../ai.js';                    // the app's LLM client
import { getModel } from '../model-registry.js';              // price/provider/local catalog (incl. local models)
import { detectProfile } from '../pipeline/profile.js';       // the app's routing policy (language/genre → models)
import { assertSpendAllowed, recordUsage, currentScope } from './usage.js'; // spend policy + cost metering
import { logger } from '../logger.js';

// LLM port: translate the library's INTENT (json, thinking) into this client's provider-specific options.
// Provider quirks (which providers honour response_format) live HERE, never in the library.
//
// This is also the ONE chokepoint every library model call crosses, so it carries the two host concerns the
// library must not know about:
//  1. SPEND POLICY — paid providers are Persian-only; refused (fatally) for any other language, fallbacks
//     included. Enforced here so no config default or new stage can quietly bill English.
//  2. METERING — every call is costed from the registry and written to the central `ai_usage` log against the
//     scoped doc+stage, so per-book spend is visible instead of invisible.
// PROMPT CACHING is on for Anthropic: the stages are built stable-prefix-heavy (a byte-identical SYSTEM prompt
// across a whole book — rules + book meta + cast), which only pays off if the cache is actually requested.
// Without it every call re-bills the full prefix; with a large cast that is the dominant cost of a Persian book.
const JSON_CAPABLE = new Set(['deepseek', 'openai']);
const llm = {
  chat: async (messages, { model, provider, maxTokens, temperature = 0, json, thinking }) => {
    const { lang, stage } = currentScope();
    assertSpendAllowed({ provider, model, lang, stage });
    try {
      const res = await chatCompletion(messages, {
        provider, model, temperature, maxTokens,
        ...(json && JSON_CAPABLE.has(provider) ? { responseFormat: { type: 'json_object' } } : {}),
        ...(thinking ? { thinking: true } : {}),
        ...(provider === 'anthropic' ? { usePromptCache: true } : {}),
      });
      recordUsage({ model, provider, usage: res.usage, ok: true });
      return res;
    } catch (e) {
      recordUsage({ model, provider, usage: e.usage || {}, ok: false, errorMessage: e.message });
      throw e;
    }
  },
};

// ModelCatalog port: the registry is already the authoritative catalog (provider · price · capabilities · local).
const models = { get: (id) => getModel(id) };

// Profiler port: the app's detectProfile IS the routing policy the library asks for per document.
const profiler = (meta, sample) => detectProfile(meta, sample);

// Host config that names concrete values the library must not hard-code — the method-version tags stamped on
// enriched rows. Kept equal to the existing corpus tags so re-runs are idempotent against current data.
const config = {
  versions: { disambig: 'deepseek-disambig-v1', hype: 'deepseek-hype-v1', extract: 'extract-v2' },
  // Dedup/merge/research adjudication is NOT doc-scoped, so it never sees the per-language routing — which made
  // a paid `mergeFallback` reachable from EVERY language, English included (the one path that could bill Anthropic
  // for an English book). These stages read English summaries/facts, so deepseek is correct for every language;
  // the fallback is the SAME model retried, matching LANG_ROUTING's "no cross-provider hop" rule.
  models: { merge: 'deepseek-v4-flash', mergeFallback: 'deepseek-v4-flash' },
};

// Assemble the full dependency set. Any field can be overridden by a caller (e.g. tests inject fakes).
export function sifterDeps(overrides = {}) {
  return { llm, models, store: makeStore(), profiler, log: logger, config, web: makeWeb(), ...overrides };
}

// A ready, app-wired CorpusRAG. Import this from application code and the pipeline orchestrator.
export function createSifterRAG(overrides = {}) {
  return createCorpusRAG(sifterDeps(overrides));
}

/**
 * The doc's language, for the spend policy + cost attribution. Resolved through the SAME routing policy the
 * stages use, so the gate can never disagree with the router about what a book is.
 */
export async function langOf(docId) {
  const store = makeStore();
  const [meta, sample] = await Promise.all([store.getDocMeta(docId), store.getSampleText(docId).catch(() => '')]);
  return detectProfile(meta || { id: docId }, sample || '').lang;
}

export { withUsageScope } from './usage.js';

export const rag = createSifterRAG();
export default rag;
