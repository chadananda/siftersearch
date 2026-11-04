// Behaviour scenario checks: one turn's trace (api/lib/assistant/behavior-trace.js + reply) × a scenario's `then` → pass/fail per check.
// Mechanical checks decide here; `judge` checks stay pending (null) for the improve judge (run.mjs → /api/admin/anis/behavior/judge). Pure.
export const CHECKS = ['strategy', 'shape', 'tool_called', 'tool_not_called', 'source_tier', 'cites_original', 'links_book', 'judge'];
export const TIERS = ['writings', 'guardian', 'house', 'reported', 'secondary'];
const ENGLISH = new Set(['en', 'eng', 'english']);
// an expect names options as "a | b", "a, b" or "a or b"
const options = (expect) => String(expect || '').toLowerCase().split(/\s*(?:\||,|\bor\b)\s*/).map((x) => x.trim()).filter(Boolean);
// tool names inside free text: snake_case identifiers ("quotation_trace on the quoted words" → quotation_trace)
const toolNames = (expect) => { const m = String(expect || '').match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g); return m?.length ? m : [String(expect || '').trim()]; };
const negated = (expect) => /^\s*(no|not|never|false|none)\b/i.test(String(expect || ''));
const BOOK_LINK = /\]\((?:https?:\/\/(?:www\.)?(?:oceanlibrary\.com|siftersearch\.com)\/[^)\s]+|\/library\/[^)\s]+)\)/i;

/** One check → { check, expect, pass: true|false|null, got } (null = pending: the judge decides). */
export function evaluateCheck(trace = {}, { check, expect }) {
  const t = trace || {};
  const tools = t.tools || [];
  const cited = t.cited || [];
  switch (check) {
    case 'strategy': return { check, expect, pass: options(expect).includes(String(t.strategy || '').toLowerCase()), got: t.strategy ?? null };
    case 'shape': return { check, expect, pass: options(expect).includes(String(t.shape || '').toLowerCase()), got: t.shape ?? null };
    case 'tool_called': { const n = toolNames(expect); return { check, expect, pass: n.some((x) => tools.includes(x)), got: tools }; }
    case 'tool_not_called': { const n = toolNames(expect); return { check, expect, pass: n.every((x) => !tools.includes(x)), got: tools }; }
    case 'source_tier': {
      const want = TIERS.filter((x) => String(expect || '').toLowerCase().includes(x));
      const got = [...new Set(cited.map((c) => c.tier).filter(Boolean))];
      return { check, expect, pass: want.length ? (negated(expect) ? want.every((w) => !got.includes(w)) : want.some((w) => got.includes(w))) : false, got };
    }
    case 'cites_original': {
      const has = cited.some((c) => c.language && !ENGLISH.has(String(c.language).toLowerCase()));
      return { check, expect, pass: negated(expect) ? !has : has, got: [...new Set(cited.map((c) => c.language).filter(Boolean))] };
    }
    case 'links_book': { const has = BOOK_LINK.test(String(t.reply || '')); return { check, expect, pass: negated(expect) ? !has : has, got: has }; }
    case 'judge': return { check, expect, pass: null, got: null };
    default: return { check, expect, pass: false, got: `unknown check ${check}` };
  }
}

/** All checks of a scenario's `then` on one trace. */
export const evaluateChecks = (trace, then = []) => then.map((c) => evaluateCheck(trace, c));

/** Fill pending judge checks with the judge's results (in order). */
export function applyJudge(results, judged = []) {
  let k = 0;
  return results.map((r) => (r.check === 'judge' && r.pass === null ? { ...r, pass: judged[k]?.pass ?? false, got: judged[k++]?.why ?? 'unjudged' } : r));
}

/** A scenario's examples → 'passing' only when every check of every example passed; a pending check counts as failing. */
export const scenarioState = (perExample) => (perExample.length && perExample.every((rs) => rs.length && rs.every((r) => r.pass === true)) ? 'passing' : 'failing');

/** given.history (earlier things the reader asked) + one example → the draft's messages (each earlier ask answered by a placeholder). */
export const scenarioMessages = (scenario, example) => [
  ...(scenario.given?.history || []).flatMap((h) => [{ role: 'user', content: h }, { role: 'assistant', content: '(earlier reply)' }]),
  { role: 'user', content: example },
];

/** The scenarios of a file: a bare scenario, an array, or { scenarios: [...] } (proposal files carry id/change too). */
export const scenariosIn = (j) => (Array.isArray(j) ? j : Array.isArray(j?.scenarios) ? j.scenarios : j?.then ? [j] : []);
