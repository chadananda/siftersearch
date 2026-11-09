// Seed for the strategy SPECS table (strategies-repo): the ordered list of every response strategy the docs show — built with their own
// graph, built inside the shared reply, planned, Unmatched last — plus the plan half (ladder, composition, decisions). Built ONCE from
// planning/anis-strategies.json when the store has no specs at SPEC_VERSION; after that nothing at runtime reads the file. Bump SPEC_VERSION
// to ship a changed plan (old rows stay). A spec is docs data only: it never makes a strategy runnable.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPEC_VERSION = 2;   // v2 (11-09): the five lookups (A2 A4 A6 A7 H1) are strategies of their own, no longer branches of the shared reply
export const PLAN_FILE = 'planning/anis-strategies.json';
const PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', PLAN_FILE);

// Plan tool id → the registry tool that now implements it (the plan predates the canonical _search/_lookup names).
export const PLAN_TO_REGISTRY = {
  find_work: 'document_search', about_work: 'work_notes_lookup', bm25: 'literal_search', phrase_semantic: 'phrase_search',
  hype: 'hype_search', library_search: 'combined_search', read_around: 'context_lookup', source_of: 'quotation_trace',
  trace_source: 'source_trace', find_original: 'original_lookup', find_translation: 'translation_lookup',
  word_study: 'rendering_lookup', people_search: 'biography_search', web: 'web_search',
};
// Seeded strategy id → the plan patterns (A1–H2) its graph serves.
export const SERVES = { comparison: ['C1', 'C2', 'C3'], understanding: ['B1', 'B2', 'B3'], prayer: ['D2'], guidance: ['D4'], reference: ['A5'], compilation: ['F1'],
  book: ['A2'], quote_trace: ['A4'], term: ['A6'], original: ['A7'], about: ['H1'] };
// Patterns the general reply (the Unmatched graph, id 'respond') serves through its own branches: pattern id → the graph nodes that do it.
// None since 11-09: Unmatched holds no pre-built lookups (they are SERVES strategies above). Kept so a branch can be shared again.
export const IN_REPLY = {};
export const GENERAL = 'respond';   // the Unmatched row's strategy id
const TOOLS_PAGE = '/docs/anis-tools', STRAT_PAGE = '/docs/response-strategies';
const toolHref = (id) => `${TOOLS_PAGE}#${PLAN_TO_REGISTRY[id] || id}`;
const classHref = (id) => `${STRAT_PAGE}#class-${id}`;
const total = (s) => (s.test_questions?.lead || 0) + (s.test_questions?.also || 0);
export const grounding = (n) => (n >= 100 ? 'strong' : n >= 20 ? 'moderate' : n >= 3 ? 'few' : 'thin');
const fallbackText = (f) => (f === 'deep_research' ? 'the deep-research job' : f === 'agent' ? 'the research agent' : f);
const firstSentence = (t) => { const x = String(t || '').split(/\.\s/)[0]; return x.length > 160 ? `${x.slice(0, 157)}…` : x; };

/** One plan pattern (A1–H2) in full: what it sounds like, test questions, route, ideal answer, steps by tier, how Jev tells it apart. */
export const patternOf = (s, { planned = false } = {}) => {
  const sc = s.scenario || {};
  const step = (st) => ({ kind: st.kind, id: st.id || null, label: st.label, href: !st.id ? null : st.kind === 'use' ? classHref(st.id) : toolHref(st.id) });
  return {
    id: s.id, family: s.family, name: s.name, types: s.types || [s.id], target_time: s.target_time ?? null,
    sounds_like: sc.sounds_like || [], sounds_like_note: sc.sounds_like_note ?? null, how_often: sc.how_often ?? null, often_with: sc.often_with ?? null,
    route: (sc.route || []).map((r) => ({ jev: !!r.jev, text: r.text })), ideal_answer: sc.ideal_answer ?? null,
    jev: s.jev || null, test_questions: s.test_questions || null, grounding: grounding(total(s)),
    tiers: (s.tiers || []).map((t) => ({ cost: t.cost, steps: (t.steps || []).map(step) })),
    llm_steps: (s.tiers || []).reduce((n, t) => n + (t.steps || []).filter((x) => x.kind === 'llm').length, 0),
    post: s.post ?? null, format: s.format ?? null, fallback: fallbackText(s.fallback), open_questions: s.open_questions || [], measure: s.measure ?? null,
    falls_back: planned ? `no strategy of its own yet: it goes to Unmatched, then ${fallbackText(s.fallback)}` : null,
  };
};

/** The plan half of the page: cost ladder, composition, follow-up moves, decisions. */
export const planHalf = (plan) => {
  const c = plan.composition || {};
  return {
    updated: plan.updated ?? null,
    ladder: plan.cost_ladder || [], grounding_scale: plan.grounding_scale || null,
    composition: { intro: c.intro ?? null, rules: c.rules || [], sets: c.sets || [], note: c.note ?? null, moves_note: c.moves_note || [], other_moves: c.other_moves || [] },
    decisions: plan.decisions || [], open_questions: plan.open_questions_for_chad || [],
  };
};

/**
 * plan (parsed planning/anis-strategies.json) + the seeded strategy ids in Jev's option order → [{ name, kind, sort, spec }]:
 * own-graph ones (their patterns merged), then built-in-the-reply, then planned (plan order), then unmatched, plus one 'plan' row.
 */
export function buildSpecs(plan, seededIds = Object.keys(SERVES)) {
  if (!plan?.strategies) return [];
  const pats = new Map(plan.strategies.map((s) => [s.id, s]));
  const out = [];
  const add = (name, kind, spec) => out.push({ name, kind, sort: out.length, spec: { id: name, name, ...spec } });
  const taken = new Set();
  for (const id of seededIds) {
    const ids = (SERVES[id] || []).filter((p) => pats.has(p));
    ids.forEach((p) => taken.add(p));
    add(id, 'own-graph', { strategy: id, status: 'built', where: 'own', patterns: ids.map((p) => patternOf(pats.get(p))) });
  }
  for (const [pid, nodes] of Object.entries(IN_REPLY)) {
    const p = pats.get(pid);
    if (!p || taken.has(pid)) continue;
    taken.add(pid);
    add(pid.toLowerCase(), 'in-reply', { name: p.name, status: 'built', where: 'shared-reply', description: firstSentence(p.scenario?.ideal_answer) || p.name, inside: { strategy: GENERAL, nodes }, patterns: [patternOf(p)] });
  }
  for (const p of plan.strategies) {
    if (taken.has(p.id)) continue;
    add(p.id.toLowerCase(), 'planned', { name: p.name, status: 'planned', where: null, description: firstSentence(p.scenario?.ideal_answer) || p.name, patterns: [patternOf(p, { planned: true })] });
  }
  add(GENERAL, 'unmatched', { name: 'unmatched', strategy: GENERAL, status: 'built', where: 'own', patterns: [] });
  out.push({ name: '_plan', kind: 'plan', sort: -1, spec: planHalf(plan) });
  return out;
}

let memo = null;
/** The seed specs (read from the plan file once per process); unreadable → none. */
export function seedSpecs() {
  if (memo) return memo;
  try { memo = buildSpecs(JSON.parse(readFileSync(PATH, 'utf8'))); } catch { memo = []; }
  return memo;
}
