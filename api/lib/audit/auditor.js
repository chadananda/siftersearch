// Strategy auditor (planning/strategy-audit-plan.md): one completed Anís exchange → TYPED verdicts on whether its search
// strategy was right and best, whether the evidence answered, whether the format fit, what went wrong in the reply, and
// whether it calls for a NEW strategy or reveals a library gap. Runs after the exchange (never inline). Pure: prompt,
// schema and cost; the caller sends it (scripts/audit/audit-exchanges.mjs).

export const STRATEGIES = {
  quote: 'find a passage from its wording, exact or half-remembered',
  source: 'where a quotation comes from: its book and original tablet (SourceHunt)',
  topic: 'what the texts say about a theme',
  fact: 'who, when, where, what happened',
  define: 'what a term or name means',
  lookup: 'a named work or person itself',
  enumerate: 'a complete list: members, attendees, every instance',
  compare: 'how traditions or authors treat a theme',
  original: 'the Arabic or Persian behind an English passage',
  'best-expression': 'the passage that best states an idea',
  'survey-subject': 'the main ideas within a subject, each with key passages (deep, many searches)',
  'examine-position': "the reader's position examined: evidence for and against (deep, many searches)",
  timeline: 'dated events for a person, subject or period',
  'writing-project': 'an article, blog post or study material written from evidence',
  converse: 'conversation, not a lookup',
  other: 'none of these',
};

export const FORMATS = ['direct answer', 'yes or no with proof', 'decisive passage', 'range of voices', 'authority layers',
  'popular belief beside the texts', 'term with its original', 'find a passage', 'people record', 'list', 'timeline',
  'comparison', 'comparison table', 'reading suggestion', 'study question', 'honest absence', 'letter', 'source answer'];

/** The tool the model must call: every field typed, so verdicts can be counted and trended. */
export const AUDIT_TOOL = {
  name: 'record_audit',
  description: 'Record the audit of one exchange.',
  input_schema: {
    type: 'object',
    required: ['strategy_used', 'strategy_verdict', 'best_strategy', 'evidence', 'format_verdict', 'problems', 'new_strategy', 'data_gap', 'summary'],
    properties: {
      strategy_used: { type: 'string', enum: Object.keys(STRATEGIES), description: 'the strategy the exchange actually followed' },
      strategy_verdict: { type: 'string', enum: ['right', 'acceptable', 'wrong'] },
      best_strategy: { type: 'string', enum: Object.keys(STRATEGIES), description: 'the strategy that would have served best (may equal strategy_used)' },
      evidence: { type: 'object', required: ['answered', 'cause'], properties: {
        answered: { type: 'string', enum: ['fully', 'partly', 'no', 'not-applicable'] },
        cause: { type: 'string', enum: ['none', 'routing', 'wrong-tradition-filter', 'ranking', 'missing-text', 'bad-text', 'too-few-passages', 'other'] },
      } },
      format_verdict: { type: 'object', required: ['fit'], properties: {
        fit: { type: 'string', enum: ['right', 'acceptable', 'wrong'] },
        better: { type: 'string', enum: [...FORMATS, 'none'] },
      } },
      problems: { type: 'array', description: 'every concrete mistake seen, WHEREVER it lies — not only Anís\'s', items: { type: 'object', required: ['where', 'kind', 'detail'], properties: {
        where: { type: 'string', enum: ['reply', 'library-data', 'source-text', 'reader-premise'],
          description: "reply = Anís's answer; library-data = our catalogue/metadata/links (wrong author, wrong original, a passage credited to the wrong writer); source-text = an error in the published source itself; reader-premise = the reader's assumption (e.g. a quote they attribute wrongly)" },
        kind: { type: 'string', enum: ['misquote', 'misattribution', 'wrong-authority-level', 'wrong-original', 'wrong-metadata', 'overreach', 'unsupported-claim', 'missed-key-passage', 'tone', 'other'] },
        detail: { type: 'string', description: 'name the passage, the work and what is wrong' },
      } } },
      new_strategy: { type: 'object', required: ['suggested'], properties: {
        suggested: { type: 'boolean', description: 'true only if no strategy in the catalogue fits this kind of request' },
        need: { type: 'string', description: 'the unmet need, in one sentence' },
        route: { type: 'string', description: 'how a strategy could serve it: which layers, steps, format' },
      } },
      data_gap: { type: 'object', required: ['found'], properties: {
        found: { type: 'boolean' },
        detail: { type: 'string', description: 'missing work, bad OCR, missing original, wrong metadata — name it' },
      } },
      summary: { type: 'string', description: 'one sentence: what most needs improving, or "fine"' },
    },
  },
};

const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** The audit request for one exchange: earlier turns (context), the question, the logged path, the evidence, the reply. */
export function buildAuditPrompt({ earlier = [], question, reply, path = {} }) {
  const p = path || {};
  const evidence = (p.evidence || []).map((e, i) => `[${i + 1}] ${e.title || '?'} — ${e.author || '?'}${e.religion ? ` (${e.religion})` : ''}\n${clip(e.text, 300)}`).join('\n\n');
  const route = {
    gate: p.gate, triage_kind: p.kind ?? p.triage?.kind, stance: p.triage?.stance, strategy: p.recipe, format: p.format?.id,
    passages: p.retrieved, timings_ms: p.timings, output_check: p.output_check, replaced: p.replaced,
  };
  const system = `You audit one exchange of Anís, a study companion that answers questions about the world's sacred texts from a library of primary texts, interpretation, history and scholarship. Judge the SEARCH STRATEGY and the use of evidence, not the prose style. Be strict and concrete: name the passage or the missing passage. Strategies available:\n${Object.entries(STRATEGIES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\nSuggest a new strategy only when none of these fits the kind of request — not when an existing one was merely executed badly. Report EVERY mistake you can see, wherever it lies — in the reply, in the library's own data (a passage credited to the wrong writer, a wrong original, wrong metadata), in a published source, or in the reader's premise (e.g. a saying attributed to Bahá'u'lláh that is not his). Catching mistakes of any source is the point of watching.`;
  const user = [
    earlier.length ? `EARLIER IN THE CONVERSATION:\n${earlier.map((m) => `${m.role === 'user' ? 'Reader' : 'Anís'}: ${clip(m.content, 400)}`).join('\n')}` : '',
    `QUESTION:\n${clip(question, 2000)}`,
    `WHAT THE SYSTEM DID:\n${JSON.stringify(route)}`,
    `EVIDENCE THE REPLY WAS WRITTEN FROM:\n${evidence || '(not logged for this exchange)'}`,
    `REPLY:\n${clip(reply, 4000)}`,
    'Audit this exchange with the record_audit tool.',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

/** USD for one call from token usage and a per-1k price ({ input, output } as in the model registry). */
export function costOf(usage = {}, pricing = { input: 0.003, output: 0.015 }) {
  return ((usage.input_tokens || 0) / 1000) * pricing.input + ((usage.output_tokens || 0) / 1000) * pricing.output;
}
