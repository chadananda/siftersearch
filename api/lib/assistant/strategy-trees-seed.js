// The six executor strategies as real ELEMENT TREES (planning/strategy-trees/{A,BC,DE,FGH}.md): each v2 row is seeded as a CANDIDATE next to its one-node v1
// (rollback); the tower promotion gate decides. Node kinds: decide (Jev/code branch) · process (light, rank/stage/plan) · tool (fetch/search/read) · synthesize (writer).
// Pure data. Deps: none (strategy-seed.js merges it).

const END = '$end';
const SHARED = new Set(['$absence', '$fallback', '$unavailable']);

// a tree as rows: [node, activity, params, kind, reads, writes, routes]; routes {edge: target} ('*' = any other edge)
function tree(strategy, entry, rows, { needs, units } = {}) {
  const steps = [], nodes = {}, edges = [];
  const kinds = Object.fromEntries(rows.map((r) => [r[0], r[3]]));
  for (const [id, activity, params, kind, reads, writes, routes, impure] of rows) {
    const sid = `tree.${strategy}.${id}`;
    steps.push({ id: sid, version: 1, activity, params, template_id: null, template_version: null, budget_ms: null, budget_usd: null });
    nodes[id] = { step: sid, step_version: 1, kind, reads, writes, ...(impure ? { impure: true } : {}) };
    for (const [on, to] of Object.entries(routes)) {
      if (to !== END && !SHARED.has(to) && !kinds[to]) throw new Error(`tree ${strategy}: ${id} → unknown ${to}`);
      // an edge INTO a synthesis node says whether the writer is needed: a direct template (no synthesis) finishes the reply by itself
      edges.push({ from: id, on, to, ...(kinds[to] === 'synthesize' ? { synthesis: rows.find((r) => r[0] === to)[2].direct ? 'direct' : 'needed' } : {}) });
    }
  }
  return { steps, graph: { entry, nodes, edges, ...(needs ? { needs } : {}), ...(units ? { units } : {}) } };
}

// ── understanding (BC §1) ──
const understanding = tree('understanding', 'anchor', [
  ['anchor', 'fetch.anchor', {}, 'tool', ['referent', 'reader_position', 'state.given'], ['found_passages', 'named_work'], { '*': 'gather' }],
  ['gather', 'search.together', { list: [
    { element: 'search.shelf', params: { authority: 'scripture', k: 6 } }, { element: 'search.shelf', params: { authority: 'interpretation', k: 4 } },
    { element: 'search.hype', params: { k: 6 } }, { element: 'search.originals', params: { k: 4 } }] }, 'tool', ['topic', 'question_frame', 'religions_specified', 'authority_floor', 'named_sources'], ['found_passages', 'missing'],
    { one: 'rank', several: 'rank', thin: 'rank', none: 'rank', error: '$fallback' }],
  ['rank', 'rank', { by: ['authority'], k: { default: 4, research: 8 }, pin: 'anchor', skip: 'given', dedupe: true }, 'process', ['found_passages', 'state.given'], ['found_passages'], { done: 'stage', empty: '$absence' }],
  ['stage', 'ui.stage', { stage: 'Reading the passages in context…' }, 'process', ['channel'], [], { emitted: 'around' }],
  ['around', 'read.around', {}, 'tool', ['found_passages'], ['found_passages'], { done: 'trace' }],
  ['trace', 'read.source', {}, 'tool', ['found_passages'], ['found_passages'], { traced: 'judge', kept: 'judge' }],
  ['judge', 'judge.passages', {}, 'decide', ['current_user_question', 'found_passages'], ['found_passages'], { answers: 's_answer', mentions_only: 's_nodirect', conflict: 's_conflict', empty: '$absence' }],
  ['s_answer', 'shape', { template: 'understanding.answer', shared: 'tpl.passages', format: 'understanding', theme_by: 'authority', offers: ['the argument, the context or the original'] }, 'synthesize', ['found_passages', 'channel', 'question_frame', 'scope_clause'], ['offers'], { done: END }],
  ['s_nodirect', 'shape', { template: 'understanding.no_direct', shared: 'tpl.passages', format: 'understanding', theme_by: 'authority', offers: ['a wider search or a research report'] }, 'synthesize', ['found_passages', 'missing'], ['offers', 'missing'], { done: END }],
  ['s_conflict', 'shape', { template: 'understanding.conflict', shared: 'tpl.passages', format: 'understanding', theme_by: 'authority' }, 'synthesize', ['found_passages'], [], { done: END }],
], { needs: ['topic', 'question_frame', 'quoted_words', 'named_work', 'audience'] });

// ── comparison (BC §2): ONE compare_search for all sides, the understanding judge once, one rank, the sides shape ──
const comparison = tree('comparison', 'sides', [
  ['sides', 'switch', { on: { count: 'compare_sides' }, cases: { many: 'sides' }, default: 'wide' }, 'decide', ['compare_sides'], [], { sides: 'stage', wide: 'wide' }],
  ['stage', 'ui.stage', { stage: 'Reading each side in its own scripture…' }, 'process', ['channel'], [], { emitted: 'cmp' }],
  ['cmp', 'search.compare', { by: 'compare_sides', k: { default: 3, many: 1 } }, 'tool', ['compare_sides', 'topic', 'quoted_words'], ['found_passages', 'missing'],
    { all: 'judge', some_thin: 'judge', all_none: '$absence', error: '$fallback' }],   // ONE compare_search call for all sides — no per-side sub-strategy, no Jev inside a tool or a loop
  ['judge', 'judge.passages', {}, 'decide', ['current_user_question', 'found_passages'], ['found_passages'], { answers: 'rank', mentions_only: 'rank', conflict: 'rank', empty: '$absence' }],   // the understanding judge, once, at tree level
  ['rank', 'rank', { by: ['authority'], per: 'side', k: { default: 3, many: 1 } }, 'process', ['found_passages', 'compare_sides'], ['found_passages'], { done: 's_sides', empty: '$absence' }],
  ['s_sides', 'shape', { template: 'comparison.sides', shared: 'tpl.sides', format: 'comparison', theme_by: 'side', plan: { comparative: true }, offers: ['go deeper on one side'] }, 'synthesize', ['found_passages', 'compare_sides', 'topic', 'quoted_words'], ['offers'], { done: END }],
  // fewer than two sides named: the comparative is never narrowed — one wide search, the writer covers each tradition the passages come from
  ['wide', 'search.together', { list: [{ element: 'search.hype', params: { k: 8 } }, { element: 'search.shelf', params: { k: 8 } }] }, 'tool', ['topic'], ['found_passages', 'missing'], { one: 'rank_w', several: 'rank_w', thin: 'rank_w', none: 'rank_w', error: '$fallback' }],
  ['rank_w', 'rank', { by: ['authority'], k: 8, dedupe: true }, 'process', ['found_passages'], ['found_passages'], { done: 's_wide', empty: '$absence' }],
  ['s_wide', 'shape', { template: 'comparison.wide', shared: 'tpl.sides', format: 'comparison', theme_by: 'religion', plan: { comparative: true, wide: true } }, 'synthesize', ['found_passages'], [], { done: END }],
], { needs: ['compare_sides', 'topic', 'quoted_words'] });

// ── prayer (DE D2): the index, then the prayer shelf judged, then the prayer books ──
const prayer = tree('prayer', 'p1', [
  ['p1', 'fetch.prayer', {}, 'tool', ['named_work', 'quoted_words', 'occasion', 'incipit'], ['found_passages'], { one: 'p5', several: 'p4', none: 'p2', error: 'p2' }],
  ['p2', 'search.hype', { shelf: 'prayer', query: '{{occasion}}', k: 6 }, 'tool', ['occasion', 'current_user_question'], ['found_passages'], { several: 'p3', thin: 'p3', none: 'p6', error: '$fallback' }],
  ['p3', 'judge', { question: 'Does this prayer fit {{occasion}}?', default: 'fits', options: [
    { edge: 'fits', when: 'the prayer was written for this occasion or need' }, { edge: 'near', when: 'the prayer is on the same theme but not for this occasion' }, { edge: 'no', when: 'the prayer is unrelated' }] }, 'decide', ['occasion', 'found_passages'], ['found_passages'], { fits: 'p4', near: 'p7', no: 'p6' }],
  ['p4', 'rank', { by: ['occasion', 'audience', 'authority'], k: 3 }, 'process', ['found_passages', 'audience', 'channel'], ['found_passages'], { done: 'p5', empty: 'p6' }],
  ['p5', 'shape', { template: 'prayer.one', shared: 'tpl.one_passage', format: 'prayer', direct: true, offers: ['two other prayers'] }, 'synthesize', ['found_passages', 'occasion'], ['offers'], { done: END }],
  ['p6', 'fetch.collection', { id: 'prayer-books', key: 'religions_specified' }, 'tool', ['religions_specified'], ['found_records', 'missing'], { one: '$absence', thin: '$absence', none: '$absence', error: '$fallback' }],
  ['p7', 'shape', { template: 'prayer.near', shared: 'tpl.one_passage', format: 'prayer', direct: true }, 'synthesize', ['found_passages', 'occasion'], [], { done: END }],
], { needs: ['occasion', 'named_work', 'quoted_words', 'incipit', 'audience'], units: { absence_template: 'prayer.absence' } });

// ── guidance (DE D4): the House of Justice's messages by date, the texts behind them, one currency judgement ──
const guidance = tree('guidance', 'g1', [
  ['g1', 'fetch.guidance', {}, 'tool', ['topic', 'named_sources'], ['found_passages'], { one: 'g3', several: 'g2', none: 'g1b', error: 'g1b' }],
  ['g1b', 'search.shelf', { authority: 'guidance', k: 8 }, 'tool', ['topic'], ['found_passages'], { one: 'g2', several: 'g2', thin: 'g2', none: 'g3', error: 'g3' }],
  ['g2', 'rank', { by: ['date'], k: 6, dedupe: true }, 'process', ['found_passages'], ['found_passages'], { done: 'g3', empty: 'g3' }],
  ['g3', 'search.fanout', { facets: ['scripture', 'interpretation'], inner: { element: 'search.shelf', params: { authority: '{{value}}', k: 4 } }, stage: 'Finding the texts behind it…' }, 'tool', ['topic'], ['found_passages'],
    { all: 'g4', some_thin: 'g4', all_none: 'g4', error: 'g4' }],
  ['g4', 'switch', { on: { evidence: true, mix: true }, cases: { has_guidance: 'has_guidance', writings_only: 'writings_only', nothing: 'nothing', errored: 'errored' }, default: 'nothing' }, 'decide', ['found_passages', 'found_outcome'], [],
    { has_guidance: 'g5', writings_only: 'g7', nothing: '$absence', errored: '$fallback' }],
  ['g5', 'read.around', {}, 'tool', ['found_passages'], ['found_passages'], { done: 'g6' }],
  ['g6', 'judge', { question: 'Is the top message the current guidance on {{topic}}?', default: 'current', options: [
    { edge: 'current', when: 'the newest message is the current guidance on the matter' }, { edge: 'superseded', when: 'a later message in hand replaces an earlier one' },
    { edge: 'passing', when: 'the messages only touch the matter; lead with the texts' }] }, 'decide', ['topic', 'found_passages'], ['found_passages'], { current: 'g8', superseded: 'g8', passing: 'g9' }],
  ['g7', 'read.around', {}, 'tool', ['found_passages'], ['found_passages'], { done: 'g9' }],
  ['g8', 'shape', { template: 'guidance.current', shared: 'tpl.passages', format: 'guidance', theme_by: 'date', offers: ['the guidance and the texts behind it by email'] }, 'synthesize', ['topic', 'found_passages', 'audience'], ['offers'], { done: END }],
  ['g9', 'shape', { template: 'guidance.writings', shared: 'tpl.passages', format: 'guidance', theme_by: 'date' }, 'synthesize', ['topic', 'found_passages', 'religions_specified', 'named_sources'], [], { done: END }],
], { needs: ['topic', 'named_sources', 'audience'] });

// ── reference (A §A5): the numbered passage; never a Jev decision (the edition is code: rank.copy) ──
const reference = tree('reference', 'f', [
  ['f', 'fetch.reference', {}, 'tool', ['scripture_reference', 'translation_wanted'], ['found_passages'], { one: 'ra', several: 'rk', none: 'p', error: 'p' }],
  ['rk', 'rank', { by: ['copy'], best: 'translation' }, 'process', ['found_passages', 'translation_wanted', 'reply_language'], ['found_passages'], { done: 'ra', empty: 'w' }],   // empty → the work lookup (never back to p: no cycle through a process node)
  ['p', 'fetch.phrase', { mode: 'close', words: '{{incipit}}', scope: 'rank' }, 'tool', ['incipit', 'named_work'], ['found_passages'], { one: 'ra', several: 'rk', thin: 'w', none: 'w', error: 'w' }],
  ['w', 'fetch.work', { title: '{{named_work}}', scope: 'rank' }, 'tool', ['named_work'], ['found_records'], { one: 'o_w', several: 'o_w', none: '$absence', error: '$fallback' }],
  ['ra', 'read.around', {}, 'tool', ['found_passages'], ['found_passages'], { done: 'o' }],
  ['o', 'shape', { template: 'reference.passage', shared: 'tpl.one_passage', format: 'reference', direct: true, offers: ['the rest of the chapter by email'] }, 'synthesize', ['found_passages', 'scripture_reference'], ['offers'], { done: END }],
  ['o_w', 'shape', { template: 'reference.work', shared: 'tpl.one_passage', format: 'reference', direct: true }, 'synthesize', ['found_records', 'scripture_reference'], [], { done: END }],
], { needs: ['scripture_reference', 'named_work', 'incipit', 'translation_wanted'] });

// ── compilation (FGH F1): sub-themes planned, each searched, one grouped rank, one grouped shape. The job path (c1–c3) and the prepared collection (c4) are not built. ──
const compilation = tree('compilation', 'c5', [
  ['c5', 'plan.subthemes', { n: 4 }, 'process', ['topic', 'named_sources'], ['sub_themes'], { done: 'c6', fail: 'c6' }],
  ['c6', 'ui.stage', { stage: 'Planning the compilation…' }, 'process', ['sub_themes'], [], { emitted: 'c7' }],
  ['c7', 'search.fanout', { by: 'sub_themes', inner: { element: 'search.together', params: { list: [
    { element: 'search.shelf', params: { query: '{{value}}', k: 4 } }, { element: 'search.hype', params: { query: '{{value}}', k: 4 } }] } } }, 'tool', ['sub_themes', 'religions_specified'], ['found_passages', 'missing'],
    { all: 'rk', some_thin: 'rk', all_none: 'sw', error: 'sw' }],
  ['sw', 'switch', { on: { evidence: true }, cases: { have: 'have', errored: 'errored', nothing: 'nothing' }, default: 'nothing' }, 'decide', ['found_passages', 'found_outcome'], [], { have: 'rk', errored: '$fallback', nothing: '$absence' }],
  ['rk', 'rank', { by: ['authority'], group: 'side', dedupe: true, k: { default: 12, research: 20 } }, 'process', ['found_passages', 'sub_themes'], ['found_passages'], { done: 'o', empty: '$absence' }],
  ['o', 'shape', { template: 'compilation.grouped', shared: 'tpl.passages', format: 'compilation', theme_by: 'side', offers: ['the full compilation by email'] }, 'synthesize', ['found_passages', 'sub_themes', 'missing', 'scope_source', 'reader_card'], ['offers'], { done: END }],
], { needs: ['topic', 'amount_wanted', 'output_form', 'named_sources'], units: { absence_template: 'compilation.absence' } });

const T = { understanding, comparison, prayer, guidance, reference, compilation };

// ── Templates: shared tpl.<shape> wrap the strategy's own text as {{base}}; {{#voice}}…{{/voice}} blocks are kept for that mode only
// (voice | widget | site | email | pdf | research; why | anchor | thin; or any unit that is filled). ──
const t = (id, text) => ({ id, version: 1, text });
export const TREE_TEMPLATES = [
  t('tpl.passages', "{{base}}\n{{#voice}}Spoken reply: plain sentences, no markdown, no lists; say each citation the way a person would; read at most two whole sentences of any passage.{{/voice}}\n{{#widget}}Keep it short: the answer, one quoted passage linked; the others by linked title.{{/widget}}\n{{#email}}Write it as a letter: a greeting, the material in full, a close.{{/email}}\nEvery passage you quote is verbatim and whole, never clipped; the citation text is the link; name the translator unless it is Shoghi Effendi; never retranslate."),
  t('tpl.one_passage', "{{base}}\n{{#voice}}Spoken reply: no markdown; say the citation as a person would.{{/voice}}\n{{#email}}Write it as a letter; the whole text, the original beside it when held.{{/email}}\nThe passage is verbatim and whole, never shortened or paraphrased; the citation text is the link; name the translator."),
  t('tpl.sides', "{{base}}\n{{#voice}}Spoken reply: a framing sentence, one or two spoken sentences per side, one sentence on what is shared and what differs, then offer to send the passages.{{/voice}}\n{{#widget}}Frame, one quoted line per side linked, one line on shared and different.{{/widget}}\n{{#site}}A section per side; a table when two or more sides meet three or more points.{{/site}}\n{{#email}}Sections with the passages in full, then shared and different.{{/email}}\nEvery passage is quoted verbatim; the citation text is the link; never retranslate."),
  t('understanding.answer', "First sentence answers {{current_user_question}} in the tradition's own terms. Then the passages in authority order, each quoted (never clipped), linked, the translator named; scholarship only labelled (\"a scholar, X, writes…\"). {{scope_clause}}\n{{#why}}Build the reasoning one cited step per passage: \"because…\" comes from the text, not from you. Name where authoritative interpreters differ. End with the one passage most worth reading in full.{{/why}}\n{{#anchor}}Start from the reader's own passage (its key sentence at most; if the found wording differs from {{quoted_words}}, say so). Explain it with the same author's words elsewhere. Never replace the text with a paraphrase. End with one line offering more: the argument, the context or the original.{{/anchor}}\n{{#thin}}Coverage is thin: say what the few passages support and no more.{{/thin}}\n{{#missing}}{{missing_line}} Say in one line what the library does not hold on this.{{/missing}}\n{{#voice}}One sentence of answer, one quotation of at most two sentences, a spoken citation, then: \"Shall I send these passages to your email?\"{{/voice}}\n{{#email}}Passages in full, the original beside the English where held.{{/email}}"),
  t('understanding.no_direct', "Say plainly that the texts in the library do not state this directly. Then the closest passages that touch it, labelled as touching, not answering. {{scope_clause}} One line offering a wider search or a research report. Never fill the gap with your own reasoning.\n{{#voice}}One sentence, one short passage, the offer.{{/voice}}"),
  t('understanding.conflict', "First sentence: the texts give more than one view. Each passage attributed, in authority order (Writings, Guardian, House of Justice, pilgrim notes, scholarship; other traditions: their scripture, authoritative interpretation, scholarship). Say which carries authority and why; do not reconcile them yourself. {{scope_clause}}"),
  t('comparison.sides', "A COMPARISON of {{compare_sides}} on {{topic}}. First line frames it neutrally. One section per side, in the order named, built only from that side's own passages (a passage header's theme names its side), each in its own terms and its own scripture's words, quoted and linked; no side described in another's vocabulary. Equal treatment is the same structure per side, not equal word counts. {{missing_sides}} Then \"Shared\" and \"Different\", each point tied to a cited passage. Never rank the traditions. {{scope_clause}}\n{{#quoted_words}}Quote it on its side first, then the other side's closest teaching.{{/quoted_words}}"),
  t('comparison.wide', "This is a COMPARISON across the traditions the passages come from (a passage header's theme names its tradition). One short section per tradition, built only from that tradition's own passages; say plainly where a tradition is thin. Then what is shared and what differs. Never rank the traditions. {{scope_clause}}"),
  t('prayer.one', "First line: what the prayer is for and who revealed or wrote it (\"A prayer for {{occasion}}, revealed by …\"). {{scope_clause}} Then the FIRST prayer passage IN FULL, verbatim, as one block quotation, every paragraph, nothing shortened, linked, translator named. Then at most two alternatives as linked italic titles with their first words. No commentary.\n{{#voice}}The prayer in full, then: \"I can send you two others.\"{{/voice}}\n{{#widget}}The prayer and one alternative.{{/widget}}\n{{#email}}The prayer in full with the original beside it where held; two alternatives in full.{{/email}}"),
  t('prayer.near', "\"I didn't find a prayer written for {{occasion}}; this one, for its own occasion, is close:\" then the first passage in full, linked. Nothing else."),
  t('prayer.absence', "\"I can't find a prayer for {{occasion}} in the library.\" {{scope_clause}} Then the prayer books given, each as a linked italic title, and the nearest prayer by title if any. Never compose a prayer."),
  t('guidance.current', "First line: the current guidance on {{topic}} in one sentence, the issuing body and date. {{scope_clause}} Then two to five points, each with its dated passage linked. If a later message replaces an earlier one: \"This replaces the guidance of <earlier date>.\" Then \"The texts behind it:\" one or two passages. Never present guidance as scripture; letters written on behalf of an institution are labelled.\n{{#voice}}The first line, one passage of at most two sentences, then: \"Shall I send you the guidance and the texts behind it?\"{{/voice}}\n{{#site}}The points as a short list.{{/site}}\n{{#email}}The passages in full, each dated and linked.{{/email}}"),
  t('guidance.writings', "First line: \"I couldn't find guidance from the institution specifically on {{topic}};\" or, where the tradition has no single body issuing guidance, \"{{religions_specified}} has no single body issuing current guidance;\" then \"its texts say:\" and the passages in authority order; passing mentions of guidance last, dated."),
  t('reference.passage', "The text of {{scripture_reference}} first, with no preamble: whole verses or paragraphs, linked, the translation named in one short line after it. A unit longer than about 600 words: the opening verses whole, then the full unit linked; never stop mid-verse. If editions number it differently, one line saying so. A found reference is not filtered: no scope clause.\n{{#voice}}Name the reference and the translation, read up to two whole sentences, offer to send the rest.{{/voice}}\n{{#email}}The whole unit regardless of length; the original beside it where held.{{/email}}"),
  t('reference.work', "\"I can't open {{scripture_reference}} directly yet; here is\" the work as an italic linked title, with where in it to look (chapter or section) if known."),
  t('compilation.grouped', "A compilation on {{topic}}. One sentence: what it gathers and from which sources. {{scope_clause}} One heading per theme named in the passage headers; under each, the passages in authority order (the Writings, the Guardian, the House of Justice, then others labelled: pilgrim note, scholarship). Quote every passage in full, never clipped; the citation text is the link. At most one framing line per section. Conflicting passages sit together, attributed, not reconciled. {{missing_line}}\n{{#voice}}Say how many passages in how many groups; read the strongest (two whole sentences at most) with a spoken citation; offer the email.{{/voice}}\n{{#widget}}Headings as a list; only the first passage quoted, the rest as linked titles; the email offer.{{/widget}}\n{{#email}}A greeting; every passage in full; a sources list; a close.{{/email}}"),
  t('compilation.absence', "Nothing gathers on {{topic}} within {{religions_specified}}. {{scope_clause}} Give the nearest passages, labelled nearest, and offer a research report by email."),
];

export const TREE_STEPS = Object.values(T).flatMap((x) => x.steps);
// v2 of each executor strategy: a CANDIDATE (the promotion gate on tower decides); v1 (one node) stays active for rollback
export const TREE_GRAPHS = Object.fromEntries(Object.entries(T).map(([id, x]) => [id, x.graph]));
export const TREE_IDS = Object.keys(T);
