// The checked-in SEED of the strategy graph (Phase 1, planning/anis-strategy-graph-plan.md): the templates, steps and strategies
// that strategies-repo inserts when a (id, version) row is absent. Bump a row's version to ship a change; the old row stays for
// rollback. Pure data. Templates use {{slot}} (activities/templates.js fills them); a strategy's `name` is its Jev option key
// ('unmatched' = the default respond graph, called 'other' before 11-08). Activities named here are code (activities/index.js).

import { NARRATION_TEMPLATES } from './narration-seed.js';

export const SEED_VERSION = 1;
// The row that catches every message no other strategy names (Chad 11-08: 'unmatched' is clearer than 'general'). Logs and stats written
// before the rename say 'other': both names mean the same row.
export const UNMATCHED = 'unmatched';
export const isUnmatched = (name) => name === UNMATCHED || name === 'other';

// ── Templates: the writer instructions, verbatim from the code they replace (equivalence: tests/api/strategy-graph.test.js) ──
export const TEMPLATES = [
  { id: 'comparison.how', version: 1, text: "This is a COMPARISON across {{sides}}. Answer side by side: one short section per tradition, in the order named, built ONLY from that tradition's own passages (the passage header's theme names its tradition) and in its own terms; then two or three sentences on the common ground and the real differences — no false harmony.\n{{missing}}{{thin}}" },
  { id: 'comparison.sides_default', version: 1, text: 'the traditions the passages come from' },
  { id: 'comparison.missing', version: 1, text: 'The library returned NOTHING from {{side}} on this: say so plainly in that section ("the library has nothing from {{side}} on this") — never fill it from another tradition or from memory.' },
  { id: 'comparison.thin', version: 1, text: 'Only a passage or two came from {{side}}: say the coverage is thin there.' },
  { id: 'understanding.how', version: 1, text: "The reader wants to UNDERSTAND this{{within}}, not a list. Lead with what the scripture itself says (quote it), then how it has been explained or applied (the passages' authors and standing tell you which is which), then what the passages leave open. {{coverage}}" },
  { id: 'understanding.within', version: 1, text: ' within {{religion}}' },
  { id: 'understanding.missing', version: 1, text: 'The library returned nothing on this: say so plainly and do not answer from memory.' },
  { id: 'understanding.thin', version: 1, text: 'Coverage is thin — say what the one or two passages support and no more.' },
  { id: 'compilation.how', version: 1, text: "The reader asked for a short COMPILATION{{within}}. Organize it by THEME and SUB-THEME that the passages themselves suggest: {{headings}} Under each heading give the passages themselves, verbatim and whole, as block quotations, each followed by its author, work and link; the Writings of Bahá’u’lláh, the Báb and ‘Abdu’l-Bahá first in every section, then Shoghi Effendi, then others (the House of Justice only as guidance, labelled as such). Each passage once. At most one line of introduction; no commentary between passages beyond the headings; no conclusion. Short: about 8-15 passages across 2-5 themes. {{coverage}}" },
  { id: 'compilation.within', version: 1, text: ' within {{religion}}' },
  { id: 'compilation.missing', version: 1, text: 'The library returned nothing on this: say so plainly and do not compile from memory.' },
  { id: 'compilation.thin', version: 1, text: 'Coverage is thin — compile only what the few passages support, under one or two headings, and say the library holds little on this.' },
  { id: 'reference.how', version: 1, text: "The reader gave the reference {{label}}. Quote the passage VERBATIM from the passages (name the translation: the King James Bible, Pickthall's or Yusuf Ali's Qur’án, the Gita's translator), with its link; one line of context at most. {{approx}}{{whole}}" },
  { id: 'reference.approx', version: 1, text: 'This edition does not number the verses: say the chapter is given and the lines quoted are the APPROXIMATE place of the verse asked for.' },
  { id: 'reference.whole', version: 1, text: ' The whole chapter was asked for: quote the whole chapter, every line of the passages in order (a very long chapter: as much as the passages hold, then the link to read on).' },
  { id: 'lookup.reference.how', version: 1, text: 'The reader asked for a numbered passage ({{label}}). The reply IS that passage: give every passage below VERBATIM, in order, whole, in ONE markdown blockquote (paragraphs separated by a line holding only ">"; leave out page markers like "[pg 49]"), ending with the line "> — [{{label}}](URL of the first passage)". At most one short framing line before it.{{approx}} No interpretation, no summary, no opinion, no comment on what the library holds, nothing after the quotation. Never put your own words in a blockquote.' },
  { id: 'lookup.reference.approx', version: 1, text: ' This edition does not number its {{unit}}s: the place was counted within chapter {{chapter}}, so it is approximate — say so in the one framing line.' },
  { id: 'prayer.how', version: 1, text: 'The reader asked for a prayer{{occasion}}. Give the FIRST prayer passage IN FULL, verbatim, as one block quotation — every paragraph of it, nothing shortened — with its attribution and link; nothing before it but at most one short line. Then, under "Two more", offer the two alternative prayers by their opening words, each linked. No commentary on the prayer\'s meaning unless asked.' },
  { id: 'prayer.occasion', version: 1, text: ' ({{occasion}})' },
  { id: 'guidance.how', version: 1, text: "The reader asks for the Universal House of Justice's guidance. The passages are its letters, NEWEST FIRST (each header's theme is the letter's date{{dates}}). Lead with the most recent and say its date; where an earlier letter differs, say which is current and that the later one supersedes it. Quote the letters' own words. The House of Justice gives guidance and legislates — present these as its guidance on the matter, never as interpretation of the Writings; do not add views it has not stated." },
  { id: 'guidance.dates', version: 1, text: ': {{dates}}' },
  ...NARRATION_TEMPLATES,
];

// ── Steps: one use of an activity, with its params. Phase 1 params are empty except where an activity reads them. ──
const step = (id, activity, extra = {}) => ({ id, version: 1, activity, params: {}, template_id: null, template_version: null, budget_ms: null, budget_usd: null, ...extra });
export const STEPS = [
  step('respond.fast', 'respond.fast'),
  step('respond.agent', 'respond.agent'),
  step('respond.plan', 'respond.plan'),
  step('respond.conversational', 'respond.conversational'),
  step('respond.religions', 'respond.religions'),
  step('respond.work', 'respond.work'),
  step('respond.stage-search', 'ui.stage', { params: { stage: 'search' } }),
  step('respond.phrases-start', 'respond.phrases_start'),
  step('respond.research', 'respond.research'),
  step('respond.read-question', 'respond.read_question'),
  step('respond.original-start', 'respond.original_start'),
  step('respond.hunt-start', 'respond.hunt_start'),
  step('respond.hunt-await', 'respond.hunt_await'),
  step('respond.original-await', 'respond.original_await'),
  step('respond.source-reply', 'respond.source_reply'),
  step('respond.term-study', 'respond.term_study'),
  step('respond.strategy', 'respond.strategy'),
  step('respond.position', 'respond.position'),
  step('respond.language', 'respond.language'),
  step('respond.evidence', 'respond.evidence'),
  step('respond.own-source', 'respond.own_source'),
  step('strategy.comparison', 'strategy.comparison', { template_id: 'comparison.how', template_version: 1 }),
  step('strategy.understanding', 'strategy.understanding', { template_id: 'understanding.how', template_version: 1 }),
  step('strategy.prayer', 'strategy.prayer', { template_id: 'prayer.how', template_version: 1 }),
  step('strategy.guidance', 'strategy.guidance', { template_id: 'guidance.how', template_version: 1 }),
  step('strategy.reference', 'strategy.reference', { template_id: 'reference.how', template_version: 1 }),
  step('strategy.compilation', 'strategy.compilation', { template_id: 'compilation.how', template_version: 1 }),
];

// a linear graph: every node continues to the next whatever its edge, except the edges named in `stops` (→ the end)
const END = '$end';
function linear(order, stops = {}) {
  const nodes = Object.fromEntries(order.map(([node, s]) => [node, { step: s, step_version: 1 }]));
  const edges = [];
  order.forEach(([node], i) => {
    for (const on of stops[node] || []) edges.push({ from: node, on, to: END });
    edges.push({ from: node, on: '*', to: order[i + 1]?.[0] ?? END });
  });
  return { entry: order[0][0], nodes, edges };
}

// THE RESPOND GRAPH = respond.js's former cascade (l.598–762 at abab9e7d), in its order. Each node's activity keeps its predicate
// exactly; the edge it returns is recorded (path.steps) and, for 'answered', ends the gather with a finished reply.
export const RESPOND_GRAPH = linear([
  ['fast', 'respond.fast'], ['agent', 'respond.agent'], ['plan', 'respond.plan'], ['conversational', 'respond.conversational'],
  ['religions', 'respond.religions'], ['work', 'respond.work'], ['stage_search', 'respond.stage-search'], ['phrases', 'respond.phrases-start'],
  ['research', 'respond.research'], ['read_question', 'respond.read-question'], ['original', 'respond.original-start'], ['hunt', 'respond.hunt-start'],
  ['hunt_wait', 'respond.hunt-await'], ['original_wait', 'respond.original-await'], ['source_reply', 'respond.source-reply'],
  ['term', 'respond.term-study'], ['strategy', 'respond.strategy'], ['position', 'respond.position'], ['language', 'respond.language'],
  ['evidence', 'respond.evidence'], ['own_source', 'respond.own-source'],
], { agent: ['answered'], religions: ['answered'], source_reply: ['answered'] });

const STRATEGY_DESCRIPTIONS = {
  comparison: 'asks how TWO OR MORE religions, scriptures or traditions each treat, teach or differ on something — side by side ("Buddhism and Christianity on forgiveness", "does the Qur’án agree with the Gospels about…", "what do the world religions say about the soul")',
  understanding: 'wants to understand a teaching, concept, practice or passage in depth within ONE tradition — its meaning, the scripture behind it and how it has been explained; this includes a passage the person quotes and asks to have explained (what it means, asks, warns or teaches, or the occasion it belongs to), even when the question names the book it is from ("help me understand progressive revelation", "what the Bahá’í writings teach about the soul after death")',
  prayer: 'wants a PRAYER to say — for an occasion, need or person (healing, the departed, protection, children, marriage, unity, morning, evening, the Fast, tests) or a particular prayer by name or opening words',
  guidance: 'asks what the Universal House of Justice (the Bahá’í world body) has said, says now or has decided on a matter — present-day guidance, letters, messages, policy, elections, institutions',
  reference: 'gives a chapter-and-verse or numbered scripture reference and wants THAT passage: "John 3:16", "Qur’án 2:255", "Sura 24", "Bhagavad Gita chapter 2", "Psalm 23", "Matthew 5", "Isaiah 11:6"',
  compilation: 'asks for a COMPILATION — a gathered selection of passages on a theme, to read together, organized under headings ("compile passages on justice", "a short compilation on prayer and meditation", "gather quotations about the equality of women and men", "put together the writings on consultation")',
  unmatched: 'none of these: a quote to locate or trace with no further question about it, a book or person to look up, a fact or date, a word’s meaning, a greeting, conversation, or a general question',
};

const one = (id) => linear([['execute', `strategy.${id}`]]);
const strategy = (id, name, graph, version = 1) => ({ id, version, name, description: STRATEGY_DESCRIPTIONS[name], exemplars: [], graph, status: 'active', parent_version: version > 1 ? version - 1 : null, created_by: 'seed' });
// seeded in Jev's option order; 'unmatched' (the respond graph) is always offered last. respond@2 = the rename of respond@1 ('other'), same graph.
export const STRATEGIES = [
  strategy('comparison', 'comparison', one('comparison')),
  strategy('understanding', 'understanding', one('understanding')),
  strategy('prayer', 'prayer', one('prayer')),
  strategy('guidance', 'guidance', one('guidance')),
  strategy('reference', 'reference', one('reference')),
  strategy('compilation', 'compilation', one('compilation')),
  strategy('respond', UNMATCHED, RESPOND_GRAPH, 2),
];
export const END_NODE = END;
