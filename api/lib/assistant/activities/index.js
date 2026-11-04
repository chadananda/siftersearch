// The ACTIVITY REGISTRY (strategy graph, Phase 1): name → { kind: tool|decision|transform|writer|check, cls: code|jev|llm,
// run(s, params) → edge | Promise<edge>, edges }. Each wraps existing code; predicates are unchanged. Steps (strategies-repo)
// name an activity; graph.js runs them. Adding an activity = one entry here (and a test).
import { RESPOND_ACTIVITIES } from './respond-steps.js';
import { run as runTool } from '../tools.js';

// a W3 strategy executor (tools.js REGISTRY kind 'strategy'): s.choice = Jev's choice, s.ctx = the turn's ctx; out → s.out
const executor = (name) => ({
  kind: 'tool', cls: 'code', edges: ['found', 'empty'],
  run: (s) => runTool(name, s.choice, s.ctx).then((out) => { s.out = out; return out ? 'found' : 'empty'; }),
});

// built on first use: respond-steps ↔ respond.js ↔ graph.js form an import cycle, so nothing reads the steps at load time
let registry = null;
export const activities = () => registry ||= ({
  ...RESPOND_ACTIVITIES,
  'strategy.comparison': executor('comparison'),
  'strategy.understanding': executor('understanding'),
  'strategy.prayer': executor('prayer'),
  'strategy.guidance': executor('guidance'),
  'strategy.reference': executor('reference'),
});

/** The registry as data (admin view): name, kind, class, edges. */
export const activityList = () => Object.entries(activities()).map(([name, a]) => ({ name, kind: a.kind, cls: a.cls, edges: a.edges }));
