// Search scope — narrow hard, relax honestly.
//
// WHY NARROW (measured 2026-09-24). The same query unfiltered returns Sutra Collection and Tao Te Ching in
// 7.35s; with religion="Baha'i" it returns The Dawn-Breakers in 0.95s. 7.7× faster AND correct. Nothing in
// the pipeline infers a tradition today: `religion` only ever arrives in the model's tool args
// (routes/chat.js:481), and at least two internal search calls pass none (jafar-pipeline.js:244, :3066), so
// a Buddhism thread searches all 4.2M paragraphs across 12 traditions and drowns in cross-tradition noise.
//
// WHY RELAX. A constraint that cannot widen reports absence as fact — the exact failure this codebase keeps
// paying for. If someone asks for a quote in Some Answered Questions and it is not there, the answer is
// "you are probably thinking of this passage in Paris Talks": not silence, and not a silent swap that cites
// the wrong book as if it were the one asked for. So: try the narrowest scope FIRST, widen one constraint at
// a time, and record every relaxation so the answer can disclose it.
//
// Deps: none (pure). The Jev-backed extraction of a scope from a conversation lives in scope-extract.js;
// this module is the policy, kept pure so it is testable without a network or a model.

// Narrowest first. Dropping order matters: a named WORK is the strongest signal the user gave, so it is the
// first thing relaxed (they may have misremembered which book); tradition is the weakest claim about intent
// and the last to go.
const DROP_ORDER = ['documentId', 'author', 'collection', 'religion'];

/** Every scope from the given one down to unconstrained, narrowest first. */
export function scopeLadder(scope) {
  const rungs = [{ ...scope }];
  let cur = { ...scope };
  for (const key of DROP_ORDER) {
    if (cur[key] === undefined) continue;
    cur = { ...cur };
    delete cur[key];
    rungs.push(cur);
  }
  return rungs;
}

/** Too thin to answer from? Then widen rather than report absence. */
export function shouldWiden(results, { min = 3 } = {}) {
  return (results?.length ?? 0) < min;
}

/**
 * Run `search(scope)` down the ladder until it answers.
 * @returns {{results, scope, widened, relaxed: string[], narrowResults}}
 *   `narrowResults` is what the ORIGINAL scope found — kept so the answer can say
 *   "only this much is in the book you named, but here is the passage you likely mean".
 */
export async function relaxScope(scope, search, { min = 3 } = {}) {
  const rungs = scopeLadder(scope);
  let narrowResults = null;
  let best = [];
  let bestScope = rungs[0];
  const relaxed = [];

  for (const rung of rungs) {
    const results = (await search(rung)) || [];
    if (narrowResults === null) narrowResults = results;
    if (results.length > best.length) { best = results; bestScope = rung; }
    if (!shouldWiden(results, { min })) break;
    // Name what the NEXT rung will drop, so the disclosure is precise.
    const next = rungs[rungs.indexOf(rung) + 1];
    if (next) for (const k of Object.keys(rung)) if (next[k] === undefined) relaxed.push(k);
  }

  return {
    results: best,
    scope: bestScope,
    widened: relaxed.length > 0,
    relaxed,
    narrowResults: narrowResults || [],
  };
}

/**
 * The facts a disclosure needs — what was dropped and what it was. Returns '' when nothing was relaxed, so
 * a caller never invents a caveat it does not need. Prose is the crafter's job; this supplies the substance.
 */
export function describeRelaxation(originalScope, relaxed, titlesById = {}) {
  if (!relaxed?.length) return '';
  const parts = [];
  for (const key of relaxed) {
    if (key === 'documentId') {
      const t = titlesById[originalScope.documentId];
      parts.push(t ? `not found in ${t}` : 'not found in the work named');
    } else if (key === 'author') parts.push(`not found in works by ${originalScope.author}`);
    else if (key === 'collection') parts.push(`not found in the ${originalScope.collection} collection`);
    else if (key === 'religion') parts.push(`not found in ${originalScope.religion} texts`);
  }
  return parts.join('; ');
}
