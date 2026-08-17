// EXPLAIN, for search.
//
// Chad, 2026-08-17: "We need to automatically log our search logic going forward, like an 'explain' query in
// SQL. So that we can automatically dissect each search and determine if it was flawed."
//
// The case that forced this: `Abdu'l-Baha defines "justice" as every man receiving his due. Where?` retrieved
// Some Answered Questions at RANK 1, and the answer told him the library did not have it. Every fact needed
// to see why was computed and thrown away — the extracted span, the ladder rung that hit, the top score, the
// confidence bucket, the containment test, the miss verdict, the web-fallback trigger. Reconstructing it took
// hours of reading code and re-running queries by hand. With a trace it is one record.
//
// Design rules, learned from the slow-query log which took three attempts to become useful:
//   1. Record the DECISION and its INPUTS, not just the outcome. "quoteMiss=true" is useless; "quoteMiss=true
//      because containment failed and confidence was likely" is the bug report.
//   2. Never let tracing break the request. Every method swallows its own errors.
//   3. One record per question, ordered, with timings — so a slow stage and a wrong stage look different.
//   4. Cheap enough to leave on always. An instrument you have to enable is off when you need it.

/** @typedef {{stage:string, ms:number, data:object}} ExplainStep */

export function createSearchExplain(question, { intent = null } = {}) {
  const t0 = Date.now();
  const steps = [];
  const decisions = [];
  const api = {
    /** A stage ran: what it was given, what it produced. */
    step(stage, data = {}) {
      try { steps.push({ stage, ms: Date.now() - t0, data: compact(data) }); } catch { /* never break the request */ }
      return api;
    },
    /**
     * A branch was taken. `why` is mandatory in spirit: a verdict without its reason is what made the
     * justice miss unreadable from the outside.
     */
    decide(name, verdict, why, inputs = {}) {
      try { decisions.push({ name, verdict, why, inputs: compact(inputs), ms: Date.now() - t0 }); } catch { /* ditto */ }
      return api;
    },
    /** Retrieval results, trimmed to what a diagnosis needs: rank, score, work, and a text head. */
    candidates(list = [], { limit = 5 } = {}) {
      try {
        api.step('candidates', {
          count: list.length,
          top: list.slice(0, limit).map((c, i) => ({
            rank: i + 1,
            score: round(c._score),
            title: str(c.title || c.doc_title, 60),
            author: str(c.author, 40),
            head: str(c.text || c.content || c.statement, 90),
          })),
        });
      } catch { /* ditto */ }
      return api;
    },
    toJSON() {
      return { question: str(question, 300), intent, total_ms: Date.now() - t0, steps, decisions };
    },
    /**
     * One structured line, greppable as `search-explain`. Deliberately logged even on success: a trace you
     * only keep for failures cannot tell you what a GOOD search looks like, and without that baseline
     * "is this flawed?" has no answer.
     */
    log(logger, extra = {}) {
      try { logger?.info?.({ explain: api.toJSON(), ...extra }, 'search-explain'); } catch { /* ditto */ }
      return api;
    },
  };
  return api;
}

/** A no-op with the same shape, so callers never need a null check. */
export function nullExplain() {
  const api = { step: () => api, decide: () => api, candidates: () => api, toJSON: () => null, log: () => api };
  return api;
}

const str = (v, n) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n));
const round = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v ?? null);
const compact = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? str(v, 200) : typeof v === 'number' ? round(v) : v;
  }
  return out;
};
