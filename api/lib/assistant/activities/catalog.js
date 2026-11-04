// The activity CATALOG (strategy graph Phase 2): what each registry activity is for, the state it reads and writes, and the
// tools.js tools it calls — merged with index.js's {kind, cls, edges} for the public /docs/anis-activities page and the admin
// view. Descriptions are plain words for readers; a new activity adds one entry here (tests/api/strategy-docs.test.js checks).
import { activities } from './index.js';
import { AGENT_TOOL_NAMES } from '../agent.js';
import { RESEARCH_TOOL_NAMES } from '../researcher.js';
import { TIERS, tierOf, ACTIVITY_GATES, activitiesForGate } from '../../jev-tuning/gates.js';

const strategyExec = (tool, what) => ({ description: `Runs the ${what} strategy executor (the ${tool} tool) on Jev's choice and gathers its passages.`,
  input: 'choice, turn context', output: 'passages + plan (→ found | empty)', tools: [tool] });

export const ACTIVITY_META = {
  'respond.fast': { description: 'Takes the exact-lookup answer (a book, a quotation, a reference) when the question asks for one and nothing needs research.', input: 'direction, question', output: 'fast lookup', tools: [] },
  'respond.agent': { description: 'Hands the turn to the tool-using agent, which researches and writes the whole reply itself.', input: 'messages', output: 'a finished reply', tools: AGENT_TOOL_NAMES },
  'respond.plan': { description: "Reads the search plan for the question (Jev's call: its shape, what it names, where to draw from).", input: 'messages', output: 'plan', tools: [] },
  'respond.conversational': { description: 'Decides whether the turn is conversation rather than a request for texts.', input: 'plan, last message', output: 'conversational flag', tools: [] },
  'respond.religions': { description: 'Answers questions about which religions and traditions the library holds, from the library facts.', input: 'plan', output: 'a finished reply', tools: [] },
  'respond.work': { description: 'Finds the book or work the question names.', input: 'question, plan', output: 'work', tools: ['document_search'] },
  'ui.stage': { description: 'Tells the reader which stage the answer is in (a progress line).', input: 'stage name (step params)', output: 'a stage event', tools: [] },
  'respond.phrases_start': { description: 'Starts extracting the phrases worth searching for, in the background.', input: 'question, plan', output: 'phrases (pending)', tools: [] },
  'respond.research': { description: 'Runs the research loop: several searches from different angles, read, then search again where the best source is still missing.', input: 'messages, plan', output: 'researched passages + brief', tools: RESEARCH_TOOL_NAMES },
  'respond.read_question': { description: 'Reads the question for an original-language request or a quotation inside it.', input: 'question', output: 'wants original / quoted text', tools: [] },
  'respond.original_start': { description: 'Starts finding the original-language wording of the passage asked about, in the background.', input: 'question, messages', output: 'original (pending)', tools: [] },
  'respond.hunt_start': { description: 'Starts tracing where a quotation comes from, in the background, when the question quotes or asks for a source.', input: 'question, quoted text, plan', output: 'source hunt (pending)', tools: ['quotation_trace'] },
  'respond.hunt_await': { description: 'Waits for the source hunt when its result is the answer.', input: 'source hunt', output: 'sourced quotation', tools: [] },
  'respond.original_await': { description: 'Waits for the original-language wording.', input: 'original (pending)', output: 'original passage', tools: [] },
  'respond.source_reply': { description: 'Writes the sourced-quotation reply: where the words come from, with links.', input: 'sourced quotation', output: 'a finished reply', tools: [] },
  'respond.term_study': { description: 'Studies a term: how the authorized translations render it, with passages.', input: 'question', output: 'term study', tools: ['rendering_lookup'] },
  'respond.strategy': { description: "Runs the response strategy Jev chose for the question (comparison, understanding, prayer, guidance, reference).", input: 'direction, plan, messages', output: 'strategy passages + plan', tools: [] },
  'respond.position': { description: 'Researches what the texts say on a question of position or stance, by theme.', input: 'question', output: 'passages by theme', tools: [] },
  'respond.language': { description: 'Decides whether the question is about language itself (a word, a translation).', input: 'question', output: 'language flag', tools: [] },
  'respond.evidence': { description: 'Collects the evidence the writer gets, from the first branch that holds; otherwise searches the library.', input: 'everything gathered so far', output: 'passages + plan (the edge names the branch)', tools: [] },
  'respond.own_source': { description: "Prefers a passage's own published work over a copy quoted elsewhere.", input: 'passages', output: 'passages (swapped / kept)', tools: [] },
  'strategy.comparison': strategyExec('comparison', 'comparison'),
  'strategy.understanding': strategyExec('understanding', 'understanding'),
  'strategy.prayer': strategyExec('prayer', 'prayer'),
  'strategy.guidance': strategyExec('guidance', 'guidance'),
  'strategy.reference': strategyExec('reference', 'reference'),
};

/** Every registered activity with its catalog entry: name, kind, cls, edges, description, input, output, tools. */
// The COST LADDER (north star): tier per activity + the Jev gates it asks live in jev-tuning/gates.js (re-exported).
export { TIERS, tierOf, ACTIVITY_GATES, activitiesForGate };

export const activityCatalog = () => Object.entries(activities()).map(([name, a]) => {
  const m = ACTIVITY_META[name] || {};
  return { name, kind: a.kind, cls: a.cls, tier: tierOf(a.cls), gates: ACTIVITY_GATES[name] || [], edges: a.edges, description: m.description ?? null,
    input: m.input ?? null, output: m.output ?? null, tools: m.tools || [] };
});
