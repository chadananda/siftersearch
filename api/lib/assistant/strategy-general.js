// Seed rows for the SAFETY-NET strategy general_research (Chad 11-09: no free agent answers a query - a stored, versioned tree does) and the
// Unmatched GATE's Jev option text ("is this a research query?" - tunable like any decide node). general_research has NO description, so it
// is never a Jev option: it runs only when planning fails, and that run is logged as a defect against the planner. Built from elements only.
export const GENERAL_RESEARCH = 'general_research';
const node = (step) => ({ step, step_version: 1 });
const stp = (id, activity, params = {}) => ({ id, version: 1, activity, params, template_id: null, template_version: null, budget_ms: null, budget_usd: null });
export const GENERAL_TEMPLATES = [
  { id: 'general_research.how', version: 1, text: 'Answer the question from the passages below only, in the reader\'s own terms. Quote the strongest passage, say plainly what the library does not hold, never answer from memory.\nvoice: two or three spoken sentences, one quotation at most.\nwidget: a short answer, one block quotation, a link to the source.\nsite: a fuller answer with the passages as block quotations and a source line under each.\nemail: the same as site, greeted and signed, links written out.\npdf: the same as site, with a numbered source list at the end.' },
  { id: 'unmatched.gate.question', version: 1, text: 'Does the LATEST message ask the assistant to look something up, find, explain, compare or research from the library, so that a new way of answering may have to be planned?' },
  { id: 'unmatched.gate.research', version: 1, text: 'research: the reader wants something found, explained, compared or answered from the library (any topic, any tradition)' },
  { id: 'unmatched.gate.conversational', version: 1, text: 'conversational: feedback, thanks, agreement or a remark that needs no research ("that is a good point", "thank you", "I see")' },
];
export const GENERAL_STEPS = [
  stp('general_research.hype', 'search.hype', { k: 8 }), stp('general_research.shelf', 'search.shelf', { k: 8 }),
  stp('general_research.rank', 'rank', { by: 'authority', k: 6 }), stp('general_research.shape', 'shape', { template: 'general_research.how' }),
];
const e = (from, on, to) => ({ from, on, to });
export const GENERAL_STRATEGY = { id: GENERAL_RESEARCH, version: 1, name: GENERAL_RESEARCH, description: null, exemplars: [], status: 'active', parent_version: null, created_by: 'seed',
  graph: { entry: 'hype', nodes: { hype: node('general_research.hype'), shelf: node('general_research.shelf'), rank: node('general_research.rank'), shape: node('general_research.shape') },
    edges: [e('hype', 'several', 'rank'), e('hype', 'thin', 'rank'), e('hype', 'none', 'shelf'), e('hype', 'error', '$unavailable'),
      e('shelf', 'one', 'rank'), e('shelf', 'several', 'rank'), e('shelf', 'thin', 'rank'), e('shelf', 'none', '$absence'), e('shelf', 'error', '$unavailable'),
      e('rank', 'done', 'shape'), e('rank', 'empty', '$absence'), e('shape', 'done', '$end')] } };
