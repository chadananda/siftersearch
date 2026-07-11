// kernel/model — the ONE way stages talk to an LLM: routed calls with a self-healing escalation ladder
// and backoff retry. PURE: it is handed the `llm` client and the model `catalog` (ports) and names NO model
// and NO provider itself. Model ids come from the document's profile (host policy); provider + capabilities
// come from the catalog. Swapping a model — or pointing at a local one — is a host config change, never an
// edit here.
//
// WHY a ladder: some models are cheapest-and-reliable on one language yet fail on another; the ladder tries
// the primary model, then escalates to a fallback rather than dropping a hard passage — the pipeline
// self-heals. The "is this valid?" test is stage-supplied (a parser), because validity differs per stage.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build a model engine bound to the injected ports. Returned helpers carry no host knowledge.
export function makeModelEngine({ llm, catalog }) {
  const info = (id) => catalog.get(id) || null;
  // Provider is authoritative from the catalog — the library refuses to guess it. An unknown id is a host
  // configuration error, surfaced loudly (never silently defaulted to some provider).
  const resolveProvider = (id) => {
    const p = info(id)?.provider;
    if (!p) throw new Error(`CorpusRAG: model '${id}' is not in the catalog — add it to the host model config`);
    return p;
  };
  // A reasoning-capable model wants "thinking" on; read that from the catalog capability, not the id string.
  const wantsThinking = (id) => (info(id)?.capabilities || []).includes('reasoning');

  // Backoff retry around one transient-failure-prone call.
  const retry = async (fn, n = 5, base = 700) => {
    let err; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { err = e; await sleep(base * (i + 1)); } } throw err;
  };

  // One call through the injected llm port. Passes INTENT (json, thinking) — the adapter translates intent
  // to each provider's specifics, so provider quirks never live in the library.
  const callModel = ({ model, provider, system, user, maxTokens, json = true, temperature = 0 }) =>
    llm.chat([{ role: 'system', content: system }, { role: 'user', content: user }],
      { model, provider: provider || resolveProvider(model), maxTokens, temperature, json, thinking: json && wantsThinking(model) });

  // The escalation ladder. Primary model up to N tries, then the fallback — appending `denseHint` on retry
  // rungs (combats truncation on dense passages). Stops as soon as `parse(content)` returns non-null.
  //   route     — { model, fallback } (model ids from the profile)
  //   parse     — (content) => parsedValue | null   (the stage decides what "valid" means)
  //   maxTokens — number | (modelId) => number
  // Returns { parsed, escalated, finishReason, raw }.
  const runLadder = async ({ route, system, user, parse, maxTokens, denseHint = '', json = true, temperature = 0 }) => {
    const primary = route.model, fallback = route.fallback;
    const tok = (m) => (typeof maxTokens === 'function' ? maxTokens(m) : maxTokens);
    const rungs = primary === fallback ? [[primary, 4]] : [[primary, 3], [fallback, 2]];
    let parsed = null, raw = null, escalated = false;
    for (const [model, tries] of rungs) {
      for (let attempt = 0; attempt < tries && !parsed; attempt++) {
        const sys = attempt < 1 && model === primary ? system : system + (denseHint ? `\n\n${denseHint}` : '');
        try { raw = await retry(() => callModel({ model, system: sys, user, maxTokens: tok(model), json, temperature })); }
        catch { break; } // this rung exhausted its retries → fall through to the next rung
        parsed = parse(raw.content || '');
      }
      if (parsed) { escalated = model !== primary; break; }
    }
    return { parsed, escalated, finishReason: raw?.finishReason || null, raw };
  };

  return { callModel, runLadder, resolveProvider, retry };
}
