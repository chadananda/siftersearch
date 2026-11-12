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
    { element: 'search.shelf', params: { in_named: true, k: 6 } },   // inside the work the question names (free none when none)
    { element: 'search.shelf', params: { by_person: true, k: 6 } },   // the author the question names (free none when none)
    { element: 'search.shelf', params: { quoted: true, k: 4 } },   // the words the reader quotes, literal + phrase layers (free none when none)
    { element: 'search.shelf', params: { authority: 'scripture', k: 6 } }, { element: 'search.shelf', params: { authority: 'interpretation', k: 4 } },
    { element: 'search.shelf', params: { about_person: true, authority: ['history', 'scholarship'], k: 4 } },   // the histories about the person or subject named (11-11: Siyyid Káẓim, Quddús got only scripture)
    { element: 'search.hype', params: { k: 6 } }, { element: 'search.originals', params: { k: 4 } }] }, 'tool', ['topic', 'question_frame', 'religions_specified', 'authority_floor', 'named_sources', 'named_work', 'named_person'], ['found_passages', 'missing'],
    { one: 'inside', several: 'inside', thin: 'widen', none: 'widen', error: '$fallback' }],
  // the books found, searched inside with the whole question (one call): a book's deepest passage on this is often not its top hit library-wide
  ['inside', 'search.shelf', { inside: true, books: 3, k: 6 }, 'tool', ['found_passages', 'current_user_question'], ['found_passages'], { one: 'rank', several: 'rank', thin: 'rank', none: 'rank', error: 'rank' }],
  // the filtered pass was thin: once more with no hard filter (tradition, work, author); free skip when nothing was filtered
  ['widen', 'search.together', { list: [{ element: 'search.shelf', params: { wide: true, scope: 'rank', k: 6 } }, { element: 'search.hype', params: { wide: true, scope: 'rank', k: 6 } }] }, 'tool', ['topic', 'religions_specified', 'named_work', 'named_person'], ['found_passages', 'missing'],
    { one: 'rank', several: 'rank', thin: 'rank', none: 'rank', error: 'rank' }],
  ['rank', 'rank', { by: ['named', 'authority'], k: { default: 4, research: 8 }, most: { by: 'authority', k: { default: 3, research: 6 } }, pin: 'anchor', skip: 'given', dedupe: true }, 'process', ['found_passages', 'state.given'], ['found_passages'], { done: 'stage', empty: '$absence' }],
  ['stage', 'ui.stage', { stage: 'Reading the passages in context…' }, 'process', ['channel'], [], { emitted: 'around' }],
  ['around', 'read.around', {}, 'tool', ['found_passages'], ['found_passages'], { done: 'trace' }],
  ['trace', 'read.source', {}, 'tool', ['found_passages'], ['found_passages'], { traced: 'judge', kept: 'judge' }],
  ['judge', 'judge.passages', {}, 'decide', ['current_user_question', 'found_passages'], ['found_passages'], { answers: 's_answer', mentions_only: 's_nodirect', conflict: 's_conflict', empty: '$absence' }],
  ['s_answer', 'shape', { template: 'understanding.answer', shared: 'tpl.passages', format: 'understanding', theme_by: 'authority', offers: ['the argument, the context or the original'] }, 'synthesize', ['found_passages', 'channel', 'question_frame', 'scope_clause'], ['offers'], { done: END }],
  ['s_nodirect', 'shape', { template: 'understanding.no_direct', shared: 'tpl.passages', format: 'understanding', theme_by: 'authority', offers: ['a wider search or a research report'] }, 'synthesize', ['found_passages', 'missing'], ['offers', 'missing'], { done: END }],
  ['s_conflict', 'shape', { template: 'understanding.conflict', shared: 'tpl.passages', format: 'understanding', theme_by: 'authority' }, 'synthesize', ['found_passages'], [], { done: END }],
], { needs: ['topic', 'question_frame', 'quoted_words', 'named_work', 'named_person', 'named_subjects', 'audience'] });

// ── comparison (review 11-09 c0–c4): the sides are the ones named, else EVERY tradition the library holds (never the biggest by corpus size);
// ONE compare_search (k 3 per side, each side in its own texts), ONE judge over all passages, sides with no answer named in `missing`.
// Cost per run path (Jev = one cheap typed call per passage, all inside the one judge node; tools = code):
//   sides → stage → cmp → judge → chk → rank → s_sides : 1 compare_search (N sides) + N·3 Jev max + 1 writer
//   … → cmp → $absence (all_none) / judge → $absence (empty) / chk → $absence (none answered): 1 compare_search (+ judge Jev) + the shared absence writer
//   … → cmp → $fallback (error): 1 compare_search + the shared fallback
const comparison = tree('comparison', 'sides', [
  ['sides', 'fill.sides', {}, 'process', ['compare_sides', 'religions_specified'], ['compare_sides'], { given: 'stage', library: 'stage' }],
  ['stage', 'ui.stage', { stage: 'Reading each side in its own scripture…' }, 'process', ['channel'], [], { emitted: 'cmp' }],
  ['cmp', 'search.compare', { by: 'compare_sides', k: 3 }, 'tool', ['compare_sides', 'topic', 'quoted_words'], ['found_passages', 'missing'],
    { all: 'judge', some_thin: 'judge', all_none: '$absence', error: '$fallback' }],   // ONE compare_search call for all sides; each side filtered to its own tradition
  ['judge', 'judge.passages', {}, 'decide', ['current_user_question', 'found_passages'], ['found_passages'], { answers: 'chk', mentions_only: 'chk', conflict: 'chk', empty: '$absence' }],   // ONE judge over every side's passages
  ['chk', 'fill.missing_sides', {}, 'process', ['found_passages', 'compare_sides'], ['found_passages', 'missing'], { answered: 'rank', none: '$absence' }],   // a side that only mentions the topic → missing, named
  ['rank', 'rank', { by: ['standing'], per: 'side', k: 3 }, 'process', ['found_passages', 'compare_sides'], ['found_passages'], { done: 's_sides', empty: '$absence' }],   // each side by its own tradition's tiers
  ['s_sides', 'shape', { template: 'comparison.sides', shared: 'tpl.sides', format: 'comparison', theme_by: 'side', plan: { comparative: true }, offers: ['go deeper on one side'] }, 'synthesize', ['found_passages', 'compare_sides', 'missing', 'topic', 'quoted_words'], ['offers'], { done: END }],
], { needs: ['compare_sides', 'topic', 'quoted_words'] });

// ── prayer (review 11-09 REDESIGN): prayer-ness is a property of the PASSAGE, not of a book's headings; the tradition is a unit, never a Bahá'í default ──
// t0 resolves the path by structure (code): a name or opening words given → p1 named; else p2 need. The tradition (rule 1) is the units' religions_specified
// (Jev this turn / conversation / host default) → the named work's tradition (prayer_lookup) → none = each tradition, kept only with real hits.
// Cost per run path (code = free; Jev = ONE cheap-tier typed choice; no Opus; every path ends in the one writer call of its shape):
//   t0 → p1 → p5 → p6|p6m                  named, one hit        : code + writer
//   t0 → p1 → p4 → p5 → p6|p6m             named, several        : code + 1 Jev + writer
//   t0 → p1 → p2 → …                       named, none           : falls to the need path below (no extra model call)
//   t0 → p2 → p4 → p5 → p6|p6m             need                  : code + 1 Jev + writer
//   t0 → p2 → p4 → p3 → p5 → p6|p6m        need, Jev unanswered  : code (+1 Jev attempt) + writer
//   … → p2|p4|p3|p5 → $absence (p7)        absence               : code (+1 Jev when p4 said none) + the shared end's writer with prayer.absence
//                                                                  (absence_template): per tradition, what was searched (the found_records p1/p2 write)
const prayer = tree('prayer', 't0', [
  ['t0', 'switch', { on: { first_filled: ['incipit', 'quoted_words', 'named_work'] }, cases: { incipit: 'named', quoted_words: 'named', named_work: 'named', none: 'need' }, default: 'need' }, 'decide', ['incipit', 'quoted_words', 'named_work'], [], { named: 'p1', need: 'p2' }],
  ['p1', 'fetch.prayer', { mode: 'named' }, 'tool', ['religions_specified', 'named_work', 'incipit', 'quoted_words'], ['found_passages', 'found_records'], { one: 'p5', several: 'p4', none: 'p2', error: 'p2' }],
  ['p2', 'fetch.prayer', { mode: 'need' }, 'tool', ['religions_specified', 'named_work', 'occasion', 'current_user_question'], ['found_passages', 'found_records'], { one: 'p4', several: 'p4', thin: 'p4', none: '$absence', error: '$fallback' }],
  ['p4', 'judge.prayer', {}, 'decide', ['occasion', 'found_passages', 'current_user_question'], ['found_passages'], { picked: 'p5', none: '$absence', unjudged: 'p3' }],
  ['p3', 'rank', { by: ['named'], k: 3 }, 'process', ['found_passages', 'named_work'], ['found_passages'], { done: 'p5', empty: '$absence' }],
  ['p5', 'read.whole', { offers: 2 }, 'tool', ['found_passages'], ['found_passages'], { one: 'p6', several: 'p6m', none: '$absence' }],
  ['p6', 'shape', { template: 'prayer.one', shared: 'tpl.one_passage', format: 'prayer', direct: true, offers: ['two other prayers'] }, 'synthesize', ['found_passages', 'occasion'], ['offers'], { done: END }],
  ['p6m', 'shape', { template: 'prayer.many', shared: 'tpl.one_passage', format: 'prayer', direct: true, offers: ['more prayers from one of these traditions'] }, 'synthesize', ['found_passages', 'occasion'], ['offers'], { done: END }],
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
  ['p', 'fetch.phrase', { mode: 'close', words: '{{incipit}}', scope: 'rank' }, 'tool', ['incipit', 'named_work'], ['found_passages'], { one: 'ph', several: 'ph', thin: 'w', none: 'w', error: 'w' }],
  ['ph', 'judge.holds', { quotation: '{{incipit}}' }, 'decide', ['found_passages', 'incipit'], ['found_passages'], { holds: 'rk', partial: 'w', none: 'w' }],   // candidates are scored only; ONE judge over them all
  ['w', 'fetch.work', { title: '{{named_work}}', scope: 'rank' }, 'tool', ['named_work'], ['found_records'], { one: 'o_w', several: 'o_w', none: '$absence', error: '$fallback' }],
  ['ra', 'read.around', {}, 'tool', ['found_passages'], ['found_passages'], { done: 'o' }],
  ['o', 'shape', { template: 'reference.passage', shared: 'tpl.one_passage', format: 'reference', direct: true, offers: ['the rest of the chapter by email'] }, 'synthesize', ['found_passages', 'scripture_reference'], ['offers'], { done: END }],
  ['o_w', 'shape', { template: 'reference.work', shared: 'tpl.one_passage', format: 'reference', direct: true }, 'synthesize', ['found_records', 'scripture_reference'], [], { done: END }],
], { needs: ['scripture_reference', 'named_work', 'incipit', 'translation_wanted'] });

// ── compilation (review 11-09 F1): sub-themes planned, one search per sub-theme (passages tagged with it), ONE judge, then grouped by sub-theme in the
// planned order with each group in its tradition's own tier order; never by author. Scope = religions_specified (no tradition named = the host's default,
// resolved by siteLayer). Passages from several traditions (an interfaith host) → grouped by tradition, then by sub-theme.
// Cost per run path (S sub-themes, P passages; Jev = one cheap typed call per passage inside the one judge node):
//   c5 → c6 → c7 → cj → sp → rk|rt → o|ot : 1 planner call + S×(shelf+hype) searches + P Jev + 1 writer
//   c7 → sw → $absence / $fallback, cj → $absence : 1 planner + S×2 searches (+ P Jev) + the shared end
const compilation = tree('compilation', 'c5', [
  ['c5', 'plan.subthemes', { n: 4 }, 'process', ['topic', 'named_sources'], ['sub_themes'], { done: 'c6', fail: 'c6' }],
  ['c6', 'ui.stage', { stage: 'Planning the compilation…' }, 'process', ['sub_themes'], [], { emitted: 'c7' }],
  ['c7', 'search.fanout', { by: 'sub_themes', tag: 'sub_theme', inner: { element: 'search.together', params: { list: [
    { element: 'search.shelf', params: { query: '{{value}}', k: 4, doctrinal: true } }, { element: 'search.hype', params: { query: '{{value}}', k: 4, doctrinal: true } }] } } }, 'tool', ['sub_themes', 'religions_specified'], ['found_passages', 'missing'],
    { all: 'cj', some_thin: 'cj', all_none: 'sw', error: 'sw' }],
  ['sw', 'switch', { on: { evidence: true }, cases: { have: 'have', errored: 'errored', nothing: 'nothing' }, default: 'nothing' }, 'decide', ['found_passages', 'found_outcome'], [], { have: 'cj', errored: '$fallback', nothing: '$absence' }],
  ['cj', 'judge.passages', {}, 'decide', ['current_user_question', 'found_passages'], ['found_passages'], { answers: 'sp', mentions_only: 'sp', conflict: 'sp', empty: '$absence' }],
  ['sp', 'switch', { on: { spread: true }, cases: { one: 'one', several: 'several' }, default: 'one' }, 'decide', ['found_passages'], [], { one: 'rk', several: 'rt' }],
  ['rk', 'rank', { by: ['named', 'standing'], dedupe: 'text', per: 'sub_theme', group: 'sub_theme', order: 'sub_themes', k: { default: 3, research: 5 } }, 'process', ['found_passages', 'sub_themes'], ['found_passages'], { done: 'o', empty: '$absence' }],
  ['rt', 'rank', { by: ['named', 'standing'], dedupe: 'text', per: ['religion', 'sub_theme'], group: ['religion', 'sub_theme'], order: 'sub_themes', k: { default: 3, research: 5 } }, 'process', ['found_passages', 'sub_themes'], ['found_passages'], { done: 'ot', empty: '$absence' }],
  ['o', 'shape', { template: 'compilation.grouped', shared: 'tpl.passages', format: 'compilation', theme_by: 'sub_theme', offers: ['the full compilation by email'] }, 'synthesize', ['found_passages', 'sub_themes', 'missing', 'scope_source', 'reader_card'], ['offers'], { done: END }],
  ['ot', 'shape', { template: 'compilation.traditions', shared: 'tpl.passages', format: 'compilation', theme_by: ['religion', 'sub_theme'], offers: ['the full compilation by email'] }, 'synthesize', ['found_passages', 'sub_themes', 'missing', 'scope_source', 'reader_card'], ['offers'], { done: END }],
], { needs: ['topic', 'amount_wanted', 'output_form', 'named_sources'], units: { absence_template: 'compilation.absence' } });

// ── claim_check (rev B 11-09): the claim's criteria planned, each searched in the tradition's own texts → scholarship → web (labelled), each weighed ──
// Queries are the criterion itself ({{value}}), never stuffed; no criterion is stored anywhere — plan.criteria generates them per claim (default: the claim itself).
// Cost per run path (code = free; gen = one cheap-tier generator call when wired, free default otherwise; Jev = one cheap-tier call; writer = one synthesis):
//   k1 → k3 → k4 → k5 → k6            : gen + n criteria × (2 library searches + 1 web search) + n Jev (one per criterion, parallel, tree level) + writer
//   k1 → k3 → k4 → k7                 : gen + searches + n Jev + writer (every criterion silent)
//   k1 → k3 → k4 → k5 → k6 (web only) : as the first; rank empty (web only) still shapes — the web finds reach the writer labelled
//   k1 → k3 → $absence                : gen + searches (nothing anywhere) · k3 error → $fallback (the agent)
const claim_check = tree('claim_check', 'k1', [
  ['k1', 'plan.criteria', { n: 4 }, 'process', ['challenged_claim', 'topic'], ['criteria'], { done: 'k3', fail: 'k3' }],
  ['k3', 'search.fanout', { by: 'criteria', inner: { element: 'search.together', params: { list: [
    { element: 'search.shelf', params: { query: '{{value}}', doctrinal: true, k: 4 } },   // the tradition's own texts
    { element: 'search.shelf', params: { query: '{{value}}', authority: ['history', 'scholarship'], k: 3 } },   // scholarship and histories
    { element: 'search.web', params: { query: '{{value}}' } }] } }, stage: 'Weighing the claim point by point…' }, 'tool', ['criteria', 'religions_specified'], ['found_passages', 'web_found', 'missing'],   // outside evidence, labelled
    { all: 'k4', some_thin: 'k4', all_none: '$absence', error: '$fallback' }],
  ['k4', 'judge.criteria', {}, 'decide', ['criteria', 'challenged_claim', 'found_passages', 'web_found'], ['found_passages', 'criterion_verdicts'], { weighed: 'k5', silent: 'k7', empty: '$absence' }],
  ['k5', 'rank', { by: ['authority'], per: 'side', k: { default: 3, research: 6 }, dedupe: true }, 'process', ['found_passages', 'criteria'], ['found_passages'], { done: 'k6', empty: 'k6' }],
  ['k6', 'shape', { template: 'claim_check.weighed', shared: 'tpl.passages', format: 'claim_check', theme_by: 'side', offers: ['the evidence for one criterion in full'] }, 'synthesize', ['challenged_claim', 'criteria', 'criterion_verdicts', 'found_passages', 'web_found', 'missing'], ['offers'], { done: END }],
  ['k7', 'shape', { template: 'claim_check.silent', shared: 'tpl.passages', format: 'claim_check', theme_by: 'side' }, 'synthesize', ['challenged_claim', 'criteria', 'found_passages', 'web_found'], [], { done: END }],
], { needs: ['topic', 'challenged_claim', 'audience'] });

// ── timeline (rev B 11-09): entries planned, each searched for dated evidence, ONE dated-claims judge, oldest first, a table; undated entries apart ──
// Any subject (an event, a work, a person, a movement): nothing assumes a "ministry" or one tradition.
// Cost per run path (gen / Jev as above; judge.timeline = one DeepSeek call per 12 items, in parallel):
//   l1 → l2 → l3 → l4 → l5   : gen + n entries × 2 library searches + the dated judge + writer
//   l1 → l2 → l3 → l6        : gen + searches + the dated judge + writer (nothing dated: the entries and passages listed as undated)
//   l1 → l2 → l3(unjudged) → l4 → l5 : gen + searches + a failed judge (free fallback: dates the passages carry) + writer
//   l1 → l2 → $absence       : gen + searches · l2 error → $fallback
const timeline = tree('timeline', 'l1', [
  ['l1', 'plan.entries', { n: 8 }, 'process', ['topic', 'named_person'], ['entries'], { done: 'l2', fail: 'l2' }],
  ['l2', 'search.fanout', { by: 'entries', inner: { element: 'search.together', params: { list: [
    { element: 'search.shelf', params: { query: '{{value}}', k: 4 } }, { element: 'search.hype', params: { query: '{{value}}', k: 3 } }] } }, stage: 'Finding the dates…' }, 'tool', ['entries', 'religions_specified'], ['found_passages', 'missing'],
    { all: 'l3', some_thin: 'l3', all_none: '$absence', error: '$fallback' }],
  ['l3', 'judge.timeline', { query: '{{topic}}' }, 'decide', ['found_passages', 'entries', 'topic'], ['found_passages', 'undated_entries'], { matched: 'l4', none: 'l6', unjudged: 'l4' }],
  ['l4', 'rank', { by: ['history'], k: { default: 12, research: 30 }, spread: 'side', dedupe: true }, 'process', ['found_passages'], ['found_passages'], { done: 'l5', empty: '$absence' }],
  ['l5', 'shape', { template: 'timeline.table', shared: 'tpl.passages', format: 'timeline', theme_by: 'date', offers: ['the timeline with every source in full by email'] }, 'synthesize', ['topic', 'found_passages', 'undated_entries'], ['offers'], { done: END }],
  ['l6', 'shape', { template: 'timeline.undated', shared: 'tpl.passages', format: 'timeline', theme_by: 'side' }, 'synthesize', ['topic', 'entries', 'found_passages'], [], { done: END }],
], { needs: ['topic', 'named_person', 'audience'] });

// ── history_fact (rev B 11-09): the histories of the tradition ∥ the web (labelled), weighed in historical precedence; the fact with its date and sources ──
// Cost per run path (Jev = judge.passages, one cheap-tier call per passage, in parallel):
//   h0 → h0b → h1 → h2 → h3 → h4 → h5 : 2 light gens (phrasings, the standard histories) + up to 9 library searches (each history searched inside ∥ each phrasing ∥ histories ∥ the Guardian ∥ scripture) + 1 web search + Jev per passage + writer
//   h1 → h2 → h3 → h4c → h6  : the same; the sources disagree
//   h1 → h2 → h7 → h8        : 2 searches + writer (no library history: the web finds, labelled)
//   h1 → h2 → h7 → $absence  : 2 searches (nothing anywhere) · h1 error → $fallback
// the histories' tree, shared by history_fact (one fact) and history_event (what happened): the same searches, precedence and rank; the judge's
// question, the shelf the writer reads and the writer differ
const historyRows = (name, o) => [
  // the question as asked ("How was the Báb martyred?") ranked Nabíl's account 14th behind pilgrim notes and periodicals; the texts' own wording
  // ("the martyrdom of the Báb") ranked it 3rd. One light generator call names the subject that way; the histories are searched on each phrasing too (11-10)
  ['h0', 'plan.phrasings', { n: 2 }, 'process', ['topic'], ['phrasings'], { done: 'h0b', fail: 'h0b' }],
  ['h0b', 'plan.histories', { n: 2 }, 'process', ['topic'], ['histories'], { done: 'h1', fail: 'h1' }],
  ['h1', 'search.together', { list: [
    // each named history searched on each phrasing: inside The Dawn-Breakers "How was the Báb martyred?" (the topic) found Vaḥíd's martyrdom and
    // Townshend; "the martyrdom of the Báb" finds "The martyrdom of the Báb took place at noon…" first (11-10). No phrasing → the topic.
    { element: 'search.fanout', params: { by: 'histories', as: 'work', tag: 'history_work', inner: { element: 'search.fanout', params: { by: 'phrasings', tag: 'phrasing', inner: { element: 'search.shelf', params: { query: '{{value}}', work: '{{work}}', k: o.inWork } } } } } },
    { element: 'search.fanout', params: { by: 'histories', tag: 'history_work', inner: { element: 'search.shelf', params: { query: '{{topic}}', work: '{{value}}', k: 2 } } } },
    { element: 'search.fanout', params: { by: 'phrasings', tag: 'phrasing', inner: { element: 'search.shelf', params: { query: '{{value}}', authority: ['history', 'scholarship'], k: 6 } } } },
    // the narrative histories (The Dawn-Breakers, Momen, Balyuzi) on their own: with the Guardian in the same search his short summaries took every slot
    // and "how was the Báb martyred?" never reached Nabíl's account (11-10); the Writings and the Guardian are excluded in the engine (tools.js notAuthor)
    // k 12: the question as asked ("How was the Báb martyred?") ranked Nabíl's account 10th behind pilgrim notes and periodicals; Jev's per-passage
    // verdict (h3) then puts the passage that states the fact first, so a wider shelf costs cheap judge calls, never the answer
    { element: 'search.shelf', params: { query: '{{topic}}', authority: ['history', 'scholarship'], k: 12 } },
    { element: 'search.shelf', params: { query: '{{topic}}', authority: ['interpretation'], k: 3 } },   // God Passes By is the Guardian's history
    { element: 'search.shelf', params: { query: '{{topic}}', authority: ['scripture'], k: 3 } },   // the primary record: the founder's own words (Guru Nanak's hymns, the Báb's Writings) — a separate search so scripture never crowds out the histories
    { element: 'search.web', params: { query: '{{topic}}' } }] }, 'tool', ['topic', 'religions_specified'], ['found_passages', 'web_found', 'missing'],
    { one: 'h2', several: 'h2', thin: 'h2', none: '$absence', error: '$fallback' }],
  ['h2', 'switch', { on: { unit: 'found_passages' }, cases: { filled: 'library', empty: 'web' }, default: 'web' }, 'decide', ['found_passages'], [], { library: 'h3', web: 'h7' }],
  ['h3', 'judge.passages', { precedence: ['primary record', 'contemporary account', 'scholarship'], question: `Does this passage ${o.asks}? A primary record outweighs a contemporary account, which outweighs later scholarship.`, mentions: 'keep' }, 'decide', ['found_passages', 'topic'], ['found_passages'],
    { answers: 'h4', mentions_only: 'h4', conflict: 'h4c', empty: 'h7' }],
  ['h4', 'rank', { by: ['verdict', 'authority', 'standard', 'precedence', 'phrased', 'history'], k: o.k, spread: 'authority', dedupe: true }, 'process', ['found_passages'], ['found_passages'], { done: 'h5', empty: 'h7' }],
  ['h4c', 'rank', { by: ['verdict', 'authority', 'standard', 'precedence', 'phrased', 'history'], k: o.kc, spread: 'authority', dedupe: true }, 'process', ['found_passages'], ['found_passages'], { done: 'h6', empty: 'h7' }],
  ['h5', 'shape', { template: `${name}.${o.write}`, shared: 'tpl.passages', format: 'history_fact', theme_by: 'authority' }, 'synthesize', o.reads, [], { done: END }],
  ['h6', 'shape', { template: `${name}.disagree`, shared: 'tpl.passages', format: 'history_fact', theme_by: 'authority' }, 'synthesize', ['topic', 'found_passages', 'web_found'], [], { done: END }],
  ['h7', 'switch', { on: { unit: 'web_found' }, cases: { filled: 'web', empty: 'nothing' }, default: 'nothing' }, 'decide', ['web_found'], [], { web: 'h8', nothing: '$absence' }],
  ['h8', 'shape', { template: `${name}.web`, shared: 'tpl.passages', format: 'history_fact' }, 'synthesize', ['topic', 'web_found'], [], { done: END }],
];
const history_fact = tree('history_fact', 'h0', historyRows('history_fact', { inWork: 6, asks: 'state {{topic}}', k: { default: 7, research: 9 }, kc: { default: 8, research: 10 }, write: 'fact', reads: ['topic', 'fact_asked', 'found_passages', 'web_found'] }),
  { needs: ['topic', 'fact_asked', 'audience'] });
// ── history_event (11-10 manual Dawn-Breakers round): WHAT HAPPENED in one event (how the Báb was martyred, Badasht, the siege of Ṭabarsí). history_fact and
// person_profile both exclude "the story of how Quddús was martyred", so these turns went Unmatched → a live plan (110 s, failed) → general_research,
// which never searched inside Nabíl. Same histories tree; the judge asks for the narration, the writer tells the story from a wider shelf.
const history_event = tree('history_event', 'h0', historyRows('history_event', { inWork: 5, asks: 'narrate {{topic}} or a moment of it', k: { default: 10, research: 14 }, kc: { default: 10, research: 14 }, write: 'story', reads: ['topic', 'found_passages', 'web_found'] }),
  { needs: ['topic', 'audience'] });

// ── person_profile (11-11 manual Dawn-Breakers round): WHO one named person was. The live planner's tree (person_profile@1) searched once on
// "{{topic}} life history biography martyrdom": scripture and a Sours essay came back, The Dawn-Breakers never, and "Tell me about Quddús" lost the
// Letters of the Living, the pilgrimage and Ṭabarsí. Same histories tree; the judge asks for the person's life, the writer tells it from the histories.
// p0 first: the person's pre-researched report (biography_lookup: portrait, dates, life timeline, each fact with its cited paragraph) → found_records the writer reads beside the passages
const person_profile = tree('person_profile', 'p0', [
  ['p0', 'fetch.person_report', { name: '{{topic}}' }, 'tool', ['topic'], ['found_records'], { one: 'h0', none: 'h0', error: 'h0' }],
  ...historyRows('person_profile', { inWork: 5, asks: 'tell who {{topic}} was or recount part of their life', k: { default: 10, research: 14 }, kc: { default: 10, research: 14 }, write: 'life', reads: ['topic', 'found_passages', 'found_records', 'web_found'] })],
  { needs: ['topic', 'audience'] });
const T = { understanding, comparison, prayer, guidance, reference, compilation, claim_check, timeline, history_fact, history_event, person_profile };

// ── the three tradition-general lookups (planning/anis-strategy-review-20261109.md): v2 candidates above their v1 lookup graphs. Tradition first
// (religions_specified, none = every tradition), each tradition's own core and editions; the Bahá'í pairing / CTAI are one provider each. Never translate. ──
// quote_trace — cost per run path:
//   q1 → q2 → q3 → q4 → q5 : code + ≤1 Jev (judge.holds; wording alone holds with no model) + writer
//   q1 none → qw → qx      : code + 1 web call + writer         · qw none/error → $absence : code + web call
//   q2 none → qw → qx      : code + ≤1 Jev + web call + writer   · q1 error → $fallback
const quote_trace = tree('quote_trace', 'q1', [
  ['q1', 'fetch.phrase', { mode: 'close' }, 'tool', ['quoted_words', 'quoted_clean', 'religions_specified'], ['found_passages'], { one: 'q2', several: 'q2', thin: 'q2', none: 'qw', error: '$fallback' }],
  ['q2', 'judge.holds', {}, 'decide', ['found_passages', 'quoted_clean', 'quoted_words'], ['found_passages'], { holds: 'q3', partial: 'q3', none: 'qw' }],
  ['q3', 'read.source', {}, 'tool', ['found_passages'], ['found_passages'], { traced: 'q4', kept: 'q4' }],
  ['q4', 'fetch.edition', { want: 'original' }, 'tool', ['found_passages'], ['found_passages', 'found_records'], { one: 'q5', several: 'q5', none: 'q5', error: 'q5' }],
  ['q5', 'shape', { template: 'quote_trace.source', shared: 'tpl.passages', format: 'quote_trace', offers: ['the passage in its context'] }, 'synthesize', ['found_passages', 'found_records', 'quoted_words', 'religions_specified'], ['offers'], { done: END }],
  ['qw', 'search.web', { query: '{{quoted_words}}' }, 'tool', ['quoted_words', 'religions_specified'], ['web_found'], { one: 'qx', none: '$absence', error: '$absence' }],
  ['qx', 'shape', { template: 'quote_trace.web', shared: 'tpl.passages', format: 'quote_trace' }, 'synthesize', ['web_found', 'quoted_words'], [], { done: END }],
], { needs: ['quoted_words', 'quoted_clean'], units: { absence_template: 'quote_trace.absence' } });

// term — cost per run path:
//   t1 → t2 → t3 → sw → rk → t4 → t5 → t6|t7           : code + 1 Jev (t5) + writer
//   Bahá'í: t1 → t1b → t1c → t2 …                      : + ≤1 Jev (t1b; an Arabic-script or remembered term is free) + the CTAI call (code)
//   no tradition: t1 → t1c (CTAI gated to Arabic script, free otherwise) → t2 …
//   sw nothing → $absence : code · sw errored → $fallback
const term = tree('term', 't1', [
  ['t1', 'switch', { on: { value: 'religions_specified' }, cases: { "Baha'i": 'bahai', "Bahá'í": 'bahai', Bahai: 'bahai', none: 'any' }, default: 'other' }, 'decide', ['religions_specified'], [], { bahai: 't1b', any: 't1c', other: 't2' }],
  ['t1b', 'fill.term_script', {}, 'decide', ['term'], ['term_arabic'], { filled: 't1c', none: 't2' }],
  ['t1c', 'fetch.renderings', {}, 'tool', ['term'], ['found_passages', 'found_records'], { one: 't2', several: 't2', none: 't2', error: 't2' }],   // CTAI: the Bahá'í provider, labelled Bahá'í-only
  // definitions: the tradition's authoritative interpretation, and its glossaries and dictionaries (no doc-class filter yet: they sit in scholarship, labelled)
  ['t2', 'search.together', { list: [{ element: 'search.shelf', params: { authority: 'interpretation', query: '{{term}}', k: 4 } }, { element: 'search.shelf', params: { authority: 'scholarship', query: '{{term}}', k: 3 } }] },
    'tool', ['term', 'religions_specified'], ['found_passages', 'missing'], { one: 't3', several: 't3', thin: 't3', none: 't3', error: 't3' }],
  // usage: the term's own occurrences in the tradition's core (literal + phrase)
  ['t3', 'search.shelf', { authority: 'scripture', query: '{{term}}', layers: ['literal', 'phrase'], k: 6 }, 'tool', ['term', 'religions_specified'], ['found_passages'], { one: 'sw', several: 'sw', thin: 'sw', none: 'sw', error: 'sw' }],
  ['sw', 'switch', { on: { evidence: true }, cases: { have: 'have', errored: 'errored', nothing: 'nothing' }, default: 'nothing' }, 'decide', ['found_passages', 'found_outcome'], [], { have: 'rk', errored: '$fallback', nothing: '$absence' }],
  ['rk', 'rank', { by: ['authority'], k: { default: 6, research: 10 }, dedupe: true }, 'process', ['found_passages'], ['found_passages'], { done: 't4', empty: '$absence' }],
  // renderings: the top core passage in the parallel translations of its work, aligned by verse/section, else by meaning
  ['t4', 'fetch.edition', { want: 'translations' }, 'tool', ['found_passages'], ['found_passages', 'found_records'], { one: 't5', several: 't5', none: 't5', error: 't5' }],
  ['t5', 'judge', { question: 'Do the passages found DEFINE or explain {{term}}, or do they only use it?', default: 'uses', options: [
    { edge: 'defines', when: 'at least one passage defines or explains what the term means' }, { edge: 'uses', when: 'the passages only use the term without explaining it' }] },
    'decide', ['term', 'found_passages'], ['path'], { defines: 't6', uses: 't7' }],
  ['t6', 'shape', { template: 'term.meaning', shared: 'tpl.passages', format: 'term', offers: ['more passages that use it'] }, 'synthesize', ['term', 'found_passages', 'found_records', 'religions_specified'], ['offers'], { done: END }],
  ['t7', 'shape', { template: 'term.usage', shared: 'tpl.passages', format: 'term', offers: ['more passages that use it'] }, 'synthesize', ['term', 'found_passages', 'found_records', 'religions_specified'], ['offers'], { done: END }],
], { needs: ['term'], units: { absence_template: 'term.absence' } });

// original — cost per run path:
//   o1 one → o3 → o4 → o5                    : code + writer
//   o1 none → o1r → o3 → o4 → o5             : code + writer (a numbered / ordinal / named scripture chapter)
//   o1 thin/error → o2 → o2j → o3 → o4 → o5  : code + ≤1 Jev (judge.holds) + writer
//   o3 none → o6 (names the missing language) : code + writer · o1 none / o2 none / o2j none → $absence : code
const original = tree('original', 'o1', [
  ['o1', 'fetch.anchor', {}, 'tool', ['referent', 'reader_position', 'previous_evidence', 'quoted_words'], ['found_passages'], { one: 'o3', thin: 'o2', none: 'o1r', error: 'o2' }],
  // a scripture chapter named by number, order or name ("Qur'an 1", "the opening chapter of the Qur'an", "al-Fatiha"): its verses, read by the verse
  // table, are the anchors (round 5: o1w searched "the opening chapter" inside one Qur'an edition and anchored on a translator's footnote)
  ['o1r', 'fetch.reference', {}, 'tool', ['scripture_reference'], ['found_passages'], { one: 'o3', several: 'o3', none: 'o1o', error: 'o1o' }],
  // a work named (or in focus) with NO topic: the passage asked for is its opening (11-12 "first couple paragraphs" after a title card)
  ['o1o', 'fetch.opening', { untopiced: true, n: 3 }, 'tool', ['named_work', 'topic'], ['found_passages'], { one: 'o3', several: 'o3', none: 'o1w', error: 'o1w' }],
  // no anchor, no quoted words, but a named work ("the Arabic of the opening chapter of the Qur'an"): the passage asked for, searched INSIDE that work,
  // is the anchor whose original edition o3 fetches (round 4: o1 none went straight to absence while the library holds the Arabic Qur'an)
  ['o1w', 'search.shelf', { in_named: true, query: '{{topic}}', k: 3 }, 'tool', ['named_work', 'topic'], ['found_passages'], { one: 'o3', several: 'o3', thin: 'o3', none: '$absence', error: '$fallback' }],
  ['o2', 'fetch.phrase', { mode: 'close' }, 'tool', ['quoted_words', 'quoted_clean', 'religions_specified'], ['found_passages'], { one: 'o2j', several: 'o2j', thin: 'o2j', none: '$absence', error: '$fallback' }],
  ['o2j', 'judge.holds', {}, 'decide', ['found_passages', 'quoted_clean', 'quoted_words'], ['found_passages'], { holds: 'o3', partial: 'o3', none: '$absence' }],
  // its work → the work family's original-language edition, aligned by reference, else by meaning (recorded Bahá'í links first)
  ['o3', 'fetch.edition', { want: 'original' }, 'tool', ['found_passages'], ['found_passages', 'found_records'], { one: 'o4', several: 'o4', none: 'o6', error: '$fallback' }],
  ['o4', 'fetch.edition', { want: 'translations' }, 'tool', ['found_passages'], ['found_passages', 'found_records'], { one: 'o5', several: 'o5', none: 'o5', error: 'o5' }],
  ['o5', 'shape', { template: 'original.side_by_side', shared: 'tpl.one_passage', format: 'original' }, 'synthesize', ['found_passages', 'found_records'], [], { done: END }],
  ['o6', 'shape', { template: 'original.none', shared: 'tpl.one_passage', format: 'original' }, 'synthesize', ['found_passages', 'found_records'], [], { done: END }],
], { needs: ['quoted_words', 'referent', 'scripture_reference', 'named_work', 'topic', 'work_place', 'amount_wanted'], units: { absence_template: 'original.absence' } });

// the lookup trees: seeded as v2 CANDIDATES above their v1 lookup graphs (strategy-seed.js LOOKUP_GRAPHS)
const L = { quote_trace, term, original };

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
  t('prayer.one', "First line: what the prayer is for and who revealed or wrote it (\"A prayer for {{occasion}}, revealed by …\"). {{scope_clause}} Then the FIRST prayer passage IN FULL, verbatim, as one block quotation, every paragraph, nothing shortened, linked, translator named. Then at most two alternatives as linked italic titles with their first words. No commentary.\n{{#voice}}The prayer in full, then: \"I can send you two others.\"{{/voice}}\n{{#widget}}The prayer and one alternative.{{/widget}}\n{{#email}}The prayer in full with the original beside it where held; two alternatives in full.{{/email}}"),
  t('prayer.many', "No tradition was named, so these are prayers from several traditions of the library for {{occasion}}; say so in one line. {{scope_clause}} Then, one tradition at a time (a passage header's religion names it), its prayer IN FULL, verbatim, as one block quotation, every paragraph, linked, with the work it comes from as a linked italic title. No tradition ranked above another. Offer more from any one of them. Never compose a prayer."),
  t('prayer.near', "\"I didn't find a prayer written for {{occasion}}; this one, for its own occasion, is close:\" then the first passage in full, linked. Nothing else."),
  t('prayer.absence', "\"I can't find a prayer for {{occasion}} in the library.\" {{scope_clause}} Then the prayer books given, each as a linked italic title, and the nearest prayer by title if any. Never compose a prayer."),
  // 11-09 redesign: a prayer of any tradition, scripture included; the absence names what was searched per tradition, never "prayer books"
  { id: 'prayer.one', version: 2, text: "First line: what the prayer is for and whose it is ({{occasion}}; the revealer, author or scripture it comes from, as the passage header gives it). {{scope_clause}} Then the passage themed prayer IN FULL, verbatim, as one block quotation, every paragraph, nothing shortened, linked, translator named. Then the passages themed alternative (at most two) as linked italic titles with their first words. No commentary. Never compose a prayer.\n{{#voice}}The prayer in full, then: \"I can send you two others.\"{{/voice}}\n{{#widget}}The prayer and one alternative.{{/widget}}" },
  { id: 'prayer.many', version: 2, text: "No single tradition was named, so these are prayers from several traditions of the library ({{occasion}}); say so in one line. {{scope_clause}} Then, one tradition at a time (a passage header's theme names it), its prayer IN FULL, verbatim, as one block quotation, every paragraph, linked, with the work it comes from as a linked italic title. No tradition ranked above another. Offer more from any one of them. Never compose a prayer." },
  { id: 'prayer.absence', version: 2, text: "Say plainly that no prayer fitting the request ({{occasion}}) was found in the library. {{scope_clause}} Then, per tradition, what was searched, from the search records given with this reply (\"searched …\"), in one short line each. If a passage came close, offer it labelled as the nearest, never as the answer. Never compose a prayer." },
  t('guidance.current', "First line: the current guidance on {{topic}} in one sentence, the issuing body and date. {{scope_clause}} Then two to five points, each with its dated passage linked. If a later message replaces an earlier one: \"This replaces the guidance of <earlier date>.\" Then \"The texts behind it:\" one or two passages. Never present guidance as scripture; letters written on behalf of an institution are labelled.\n{{#voice}}The first line, one passage of at most two sentences, then: \"Shall I send you the guidance and the texts behind it?\"{{/voice}}\n{{#site}}The points as a short list.{{/site}}\n{{#email}}The passages in full, each dated and linked.{{/email}}"),
  t('guidance.writings', "First line: \"I couldn't find guidance from the institution specifically on {{topic}};\" or, where the tradition has no single body issuing guidance, \"{{religions_specified}} has no single body issuing current guidance;\" then \"its texts say:\" and the passages in authority order; passing mentions of guidance last, dated."),
  t('reference.passage', "The text of {{scripture_reference}} first, with no preamble: whole verses or paragraphs, linked, the translation named in one short line after it. A unit longer than about 600 words: the opening verses whole, then the full unit linked; never stop mid-verse. If editions number it differently, one line saying so. A found reference is not filtered: no scope clause.\n{{#voice}}Name the reference and the translation, read up to two whole sentences, offer to send the rest.{{/voice}}\n{{#email}}The whole unit regardless of length; the original beside it where held.{{/email}}"),
  t('reference.work', "\"I can't open {{scripture_reference}} directly yet; here is\" the work as an italic linked title, with where in it to look (chapter or section) if known."),
  t('compilation.grouped', "A compilation on {{topic}}. One sentence: what it gathers and from which sources. {{scope_clause}} One heading per theme named in the passage headers; under each, the passages in authority order (the Writings, the Guardian, the House of Justice, then others labelled: pilgrim note, scholarship). Quote every passage in full, never clipped; the citation text is the link. At most one framing line per section. Conflicting passages sit together, attributed, not reconciled. {{missing_line}}\n{{#voice}}Say how many passages in how many groups; read the strongest (two whole sentences at most) with a spoken citation; offer the email.{{/voice}}\n{{#widget}}Headings as a list; only the first passage quoted, the rest as linked titles; the email offer.{{/widget}}\n{{#email}}A greeting; every passage in full; a sources list; a close.{{/email}}"),
  { id: 'compilation.grouped', version: 2, text: "A compilation on {{topic}}. One sentence: what it gathers and from which sources. {{scope_clause}} One heading per theme named in the passage headers; under each, the passages in the authority order of their own tradition — {{authority_order}} — never one tradition's ladder applied to another's; passages of lesser standing labelled (recollection, institutional guidance, scholarship). Quote every passage in full, never clipped; the citation text is the link. At most one framing line per section. Conflicting passages sit together, attributed, not reconciled. {{missing_line}}\n{{#voice}}Say how many passages in how many groups; read the strongest (two whole sentences at most) with a spoken citation; offer the email.{{/voice}}\n{{#widget}}Headings as a list; only the first passage quoted, the rest as linked titles; the email offer.{{/widget}}\n{{#email}}A greeting; every passage in full; a sources list; a close.{{/email}}" },   // v2 11-09: the tradition's own tiers, not the Bahá’í ladder
  t('compilation.traditions', "A compilation on {{topic}} across the traditions the library holds. One sentence: what it gathers and from which traditions. {{scope_clause}} One section per tradition, in the order of the passage headers; inside it one heading per theme (a passage header's theme reads \"tradition — theme\"), the passages in that tradition's own authority order — {{authority_order}} — never one tradition's ladder applied to another's, never one tradition ranked above another. Quote every passage in full, never clipped; the citation text is the link. {{missing_line}}\n{{#voice}}Say how many traditions and themes; read the strongest passage (two whole sentences at most) with a spoken citation; offer the email.{{/voice}}\n{{#widget}}Traditions and themes as a list; only the first passage quoted, the rest as linked titles; the email offer.{{/widget}}\n{{#email}}A greeting; every passage in full; a sources list; a close.{{/email}}"),
  t('compilation.absence', "Nothing gathers on {{topic}} within {{religions_specified}}. {{scope_clause}} Give the nearest passages, labelled nearest, and offer a research report by email."),
  { id: 'claim_check.weighed', version: 2, text: "The reader asks whether a claim holds: {{challenged_claim}}. Weigh it criterion by criterion: {{criteria}}. A passage header's theme names its criterion. The verdict per criterion: {{criterion_verdicts}}. For each criterion, one short section: its verdict in plain words, then the evidence in this order: the tradition's own texts quoted and linked; scholarship labelled (\"a scholar, X, writes…\"); web sources labelled as outside the library, never as library evidence. A criterion the evidence is silent on is called silent, never filled from memory. Close with one summary sentence in your own words that names the criteria on which the claim holds, those on which it fails, and those on which the evidence is silent — never a bare list of those three phrases. Section headings are short labels of the criterion (a few words), never the criterion written as a question. Neutral; never argue past the evidence. {{scope_clause}}\n{{#missing}}{{missing_line}}{{/missing}}\n{{#voice}}One sentence per criterion with its verdict and one spoken citation, then offer to send the evidence.{{/voice}}\n{{#widget}}One line per criterion with its verdict and one linked source.{{/widget}}\n{{#email}}A section per criterion with the passages in full.{{/email}}" },   // v2 11-10: v1's "End with one line: where the claim holds…" was echoed verbatim; criteria as question headings
  t('claim_check.silent', "The sources searched are silent on the claim {{challenged_claim}} at every criterion weighed ({{criteria}}): say so plainly in the first line. Then the nearest passages, labelled nearest, each under its criterion; web sources labelled as outside the library. Never weigh the claim from memory. {{scope_clause}}"),
  t('timeline.table', "A TIMELINE of {{topic}}. One table, Date · Event · Source, oldest first: one row per passage below; a passage header's theme gives its date and event (as its source states them); the source is the passage's linked italic title. Never add a date or an event the passages do not give. {{scope_clause}}\n{{#undated_entries}}Then, apart from the table, under \"Not dated in the sources found\": {{undated_entries}}. Name them; never give them a date from memory.{{/undated_entries}}\n{{#voice}}No table: say the dates in order, the first few, each with its spoken source, then offer to send the whole timeline.{{/voice}}\n{{#email}}The table, then each source passage in full.{{/email}}"),
  t('timeline.undated', "None of the sources found states a date for {{topic}} (the entries looked for: {{entries}}): say so plainly in the first line. Then the passages found, under the entry each belongs to (a passage header's theme names it), labelled undated. Never supply a date from memory. {{scope_clause}}"),
  t('history_fact.fact', "First sentence: the answer about {{topic}} — the date, place or founder — with its source linked. {{#fact_asked}}The reader asks for the {{fact_asked}}.{{/fact_asked}} Weigh the sources in historical precedence: a primary record, then a contemporary account, then later scholarship, each labelled. Where sources disagree, say so and give each with its source. After the passages that state it come those that only set it (the founder's life, his own words in the tradition's scripture): draw on them for the date, place and setting, quoting the founder's own words where one is given — each for what it actually says, never as stating the fact itself. {{scope_clause}}\n{{#web_found}}Web sources are given too: cite them only as outside the library, labelled with their site.{{/web_found}}\n{{#voice}}One sentence with the date and its spoken source; offer to send the sources.{{/voice}}"),
  t('history_fact.disagree', "The sources disagree on {{topic}}: say so in the first sentence. Then each account with its date and source, in historical precedence (primary record, contemporary account, later scholarship), attributed and linked; say which carries the most weight and why; never reconcile them yourself. {{scope_clause}}\n{{#web_found}}Web sources are given too: labelled as outside the library.{{/web_found}}"),
  t('history_fact.web', "The library holds no history of {{topic}}: say so in one line. Then the answer from the web sources below, each labelled as outside the library with its site linked; never present them as library evidence. If they disagree, give each. {{scope_clause}}"),
  t('history_event.story', "What happened in {{topic}}, as the histories record it. First sentence: the answer to the question in plain words. Then the account in the order it happened, from the passages below: the primary record (an eyewitness or contemporary narrative, such as Nabíl's) first, quoted whole at its key moments and linked; later histories and scholarship after it, labelled, for what they add. Where sources disagree, say so and give each with its source. Tell only what the passages say: never fill a gap from memory, and never say the library lacks a detail a passage below gives. {{scope_clause}}\n{{#web_found}}Web sources are given too: use them only for what the library's passages do not give, labelled as outside the library with their site.{{/web_found}}\n{{#voice}}Two or three sentences of the story with one spoken source; offer to send the account.{{/voice}}\n{{#email}}The account in full, its key passages quoted whole.{{/email}}"),
  t('history_event.disagree', "The sources tell {{topic}} differently: say so in the first sentence. Then each account in historical precedence (primary record, contemporary account, later scholarship), attributed, quoted at its key moment and linked; say which carries the most weight and why; never reconcile them yourself. {{scope_clause}}\n{{#web_found}}Web sources are given too: labelled as outside the library.{{/web_found}}"),
  t('history_event.web', "The library holds no account of {{topic}}: say so in one line. Then what the web sources below say happened, each labelled as outside the library with its site linked; never present them as library evidence. If they disagree, give each. {{scope_clause}}"),
  // v2: the live planner's person_profile@1 templates hold v1 (seed templates are INSERT OR IGNORE by id+version)
  { id: 'person_profile.life', version: 2, text: "Who {{topic}} was, as the histories record it. First sentence: who they were in plain words (their identity and why they are remembered). Then their life in the order it happened, from the passages below: how they came to the Faith or to their role, the turning points, and how their life ended; the primary record (an eyewitness or contemporary narrative, such as Nabíl's) first, quoted whole at its key moments and linked; the Guardian's history and later scholarship after it, labelled, for what they add. A passage from the Writings about them is quoted and attributed to its revealer. Where sources disagree, say so and give each with its source. Tell only what the passages say: never fill a gap from memory, and never say the library lacks a detail a passage below gives. {{scope_clause}}\n{{#web_found}}Web sources are given too: use them only for what the library's passages do not give, labelled as outside the library with their site.{{/web_found}}\n{{#voice}}Two or three sentences on who they were with one spoken source; offer to send the account.{{/voice}}\n{{#email}}The life in full, its key passages quoted whole.{{/email}}" },
  { id: 'person_profile.disagree', version: 2, text: "The sources tell the life of {{topic}} differently: say so in the first sentence. Then each account in historical precedence (primary record, contemporary account, later scholarship), attributed, quoted at its key moment and linked; say which carries the most weight and why; never reconcile them yourself. {{scope_clause}}\n{{#web_found}}Web sources are given too: labelled as outside the library.{{/web_found}}" },
  { id: 'person_profile.web', version: 2, text: "The library holds no account of {{topic}}: say so in one line. Then what the web sources below say about them, each labelled as outside the library with its site linked; never present them as library evidence. If they disagree, give each. {{scope_clause}}" },


  t('quote_trace.source', "Where the quotation comes from. First line: the source — work and author as a linked italic title — with the passage quoted whole and linked. The source is the best published edition holding it; if it was found first in a book quoting it, name that book after the source (\"quoted in …\"). Then the other works that quote it, by linked italic title. The earliest and most authoritative occurrence comes first, by the source tradition's own authority. If the attribution the reader gave differs from the source found, say so plainly in one line. If an original-language edition is given, show it beside the passage, aligned, never translated by you; if a record names a missing language, one line: the library holds no edition in that language. {{scope_clause}}"),
  t('quote_trace.web', "Say plainly: these words are not in the library. Then, labelled as from the open web, what the web attributes them to, with the site linked; never quote a web page as a library source. One line offering to search with other wording."),
  t('quote_trace.absence', "Say plainly that the library does not hold these words ({{widened_clause}}), and the web search found no attribution either. Never guess an author. Offer to search with other wording."),
  t('term.meaning', "What {{term}} means in its own tradition. First sentence: the meaning, from the passages that define or explain it (the tradition's authoritative interpretation first). Then how the tradition's own core texts use it: one or two passages quoted and linked. Then its renderings: the same passage in the parallel translations given, each translator named; a rendering record from the authorized Bahá'í translator is labelled as such and applies to the Bahá'í texts only. Glossaries and scholarship last, labelled (\"a glossary in …\", \"a scholar, X, writes…\"). Never translate it yourself. {{scope_clause}}"),
  t('term.usage', "Say the library's texts use {{term}} without defining it. Then how its own core texts use it: two or three passages quoted and linked, from which the sense can be seen — let the passages show it, labelled as usage, not a definition. Then its renderings in the parallel translations given, each translator named. Scholarship labelled. Never invent a definition or translate it yourself. {{scope_clause}}"),
  t('term.absence', "Say plainly that the library's texts do not use or define {{term}} ({{widened_clause}}). Never define it from your own knowledge as if it were the library's. Offer a wider search."),
  t('original.side_by_side', "The original-language text first, verbatim and whole, linked, with its work and language named. Then the existing translation beside it, linked, translator named; if several translations are given, each after it, named. If an edition was aligned approximately (by meaning, or by position in the chapter), say so in one line. Never translate anything yourself."),
  t('original.none', "Say plainly that the library holds no original-language edition of this work — name the language the record gives (e.g. \"no Arabic edition of this book is in the library\"). Then the passage as the library holds it, linked, translator named. Never translate it into the original yourself."),
  t('original.absence', "Say plainly that the passage could not be found in the library ({{widened_clause}}), so its original cannot be shown. Ask for a few more words of it or the book it is from."),
];

// Jev's option text for the rev-B trees (no STRATEGY_DESCRIPTIONS row): production's current descriptions, verbatim (claim_check@3, timeline@2, history_fact@4)
export const TREE_DESCRIPTIONS = {
  claim_check: "Asks whether a contested, critical or loaded claim or label about a religion, its community or its institutions is true or fair. Examples: is it a cult or sect, is it really a religion, is it authoritarian, is it an offshoot of another faith, is a criticism justified. The reader wants the claim weighed against the tradition's own texts and outside evidence, not a general explanation of a teaching.",
  timeline: "Asks for a TIMELINE or CHRONOLOGY: an ordered list of dated periods or events across several figures, ministries, eras or stages, such as the ministries of successive leaders, the stages of a movement or the key dates of a period. The reader wants many dated entries in time order with sources. This card does not cover one single date or founder, a narrated story of an event, a biography of one person, or an explanation of a teaching.",
  history_fact: "Asks ONE short historical fact: when or where a religion or movement began, who founded it, the date of a named event, or who belonged to a named group (who were the Letters of the Living, who were the Hands of the Cause named by Bahá'u'lláh). The reader wants a date, place, founder or list of names with its source. Not for: Tell me the story of how Quddús was martyred; Who was Mullá Ḥusayn; Give me a chronology of the Heroic Age; Explain what the Bahá'í teaching on progressive revelation means.",
  history_event: "Asks WHAT HAPPENED in one named historical event or episode: how it unfolded, who took part, how it ended. Examples: how was the Báb martyred, what happened at the Conference of Badasht, tell me about the siege of Fort Ṭabarsí, how did the Báb declare His mission to Mullá Ḥusayn, the story of how Quddús was martyred. The reader wants the event told from the histories, the primary record first. Not for: When did the Báb declare His mission (one date or place); Who was Mullá Ḥusayn (one person's life); Give me a chronology of the Heroic Age; Explain what Bahá'u'lláh taught about martyrdom.",
  // the live planner's card (person_profile@1), verbatim
  person_profile: "Asks WHO a single named person was, or to be told about one person: their identity, role, life and death, drawn from histories and records. This is one person's profile. It does not cover a single date or founder, a step-by-step story of one event, a timeline across several figures, finding a book or quote by that person, or explaining a teaching. Not for: Tell me the story of how Quddús was martyred; Give me a chronology of the Heroic Age; When was the Báb's declaration; Find a book written by Vaḥíd; Who said 'The earth is but one country'; Explain what Bahá'u'lláh taught about martyrdom.",
};
// the exemplars Jev reads beside a card (seed-trees rows otherwise carry none; the planner's person_profile@1 had these)
export const TREE_EXEMPLARS = { person_profile: ['Tell me about Vaḥíd', 'Who was Mullá Ḥusayn?', 'Who was Ṭáhirih and why is she remembered?', "Tell me about the life of Rabi'a of Basra", 'Who was Thomas Breakwell?'] };
export const TREE_STEPS = Object.values(T).flatMap((x) => x.steps);
// v2 of each executor strategy: a CANDIDATE (the promotion gate on tower decides); v1 (one node) stays active for rollback
export const TREE_GRAPHS = Object.fromEntries(Object.entries(T).map(([id, x]) => [id, x.graph]));
export const TREE_IDS = Object.keys(T);
// the lookup trees (quote_trace, term, original): v2 candidates of the LOOKUP strategies
export const LOOKUP_TREE_STEPS = Object.values(L).flatMap((x) => x.steps);
export const LOOKUP_TREE_GRAPHS = Object.fromEntries(Object.entries(L).map(([id, x]) => [id, x.graph]));
export const LOOKUP_TREE_IDS = Object.keys(L);
