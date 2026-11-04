// behavior-trace — what one Anís turn DID, for the behaviour scenarios (tests/behavior/run.mjs via POST /api/v1/anis/draft {trace:true}):
// the strategy Jev chose, the plan shape, the tools the researcher called, the decision points, the cited passages with their
// source tier. Built from the turn's result after the reply exists (never on the reply path). Pure.
const uniq = (xs) => [...new Set(xs.filter(Boolean))];

/** anisTurn result + the cited list draftBody already built → { strategy, shape, format, tools, steps, decisions, cited } */
export function behaviorTrace(r = {}, cited = []) {
  const steps = (r.plan?.steps || []).map((s) => ({ tool: s.tool || null, found: s.found ?? null }));
  return {
    strategy: r.path?.strategy?.choice ?? null,
    shape: r.plan?.shape ?? null,
    format: r.format?.id ?? null,
    tools: uniq(steps.map((s) => s.tool)),
    steps,
    decisions: (r.path?.decisions || []).map((d) => ({ point: d.point, by: d.by, chosen: d.chosen ?? null })),
    cited,
  };
}
