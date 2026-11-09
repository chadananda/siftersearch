// Presentation copy + pure helpers for /docs/response-strategies (titles, one-line taglines, mode copy, step list from a graph).
// Copy lives here for now; move it into strategy_specs later. MODES must match api/lib/assistant/channels.js (tests/api/strategy-docs-ui.test.js).
const TITLES = { comparison: 'Comparison', understanding: 'Understanding', prayer: 'Prayer', guidance: 'House of Justice guidance', reference: 'Scripture reference', compilation: 'Compilation', unmatched: 'Unmatched' };
const TAGLINES = {
  comparison: 'How two or more religions treat the same topic, side by side',
  understanding: 'A teaching, concept or passage explained in depth, within one tradition',
  prayer: 'A prayer to say, for an occasion, a need or a person',
  guidance: 'What the Universal House of Justice has said or decided on a matter',
  reference: 'The passage at a chapter-and-verse reference',
  compilation: 'A gathered selection of passages on a theme, under headings',
  unmatched: 'Everything else: answered in full, and a new strategy designed from it',
};
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export const titleOf = (s) => TITLES[s.name === 'other' ? 'unmatched' : s.name] || cap(s.name);
/** { text, quote }: quote = the first example question (planned and shared-reply rows), otherwise a fixed sentence. */
export function taglineOf(s) {
  const t = TAGLINES[s.name === 'other' ? 'unmatched' : s.name];
  if (t) return { text: t, quote: false };
  const q = s.patterns?.[0]?.sounds_like?.[0];
  return q ? { text: `“${q}”`, quote: true } : { text: '', quote: false };
}
export const GROUPS = [
  { key: 'live', label: 'Live', test: (s) => s.name !== 'unmatched' && s.where !== 'shared-reply' && s.status === 'built' },
  { key: 'shared', label: 'Inside Unmatched for now', test: (s) => s.where === 'shared-reply' },
  { key: 'planned', label: 'Planned', test: (s) => s.status === 'planned' },
  { key: 'unmatched', label: 'When nothing fits', test: (s) => s.name === 'unmatched' },
];
export const groupOf = (s) => (GROUPS.find((g) => g.test(s)) || GROUPS[2]).key;

/** "respond.read_question" → "Read question". */
export const humanStep = (activity) => cap(String(activity || '').split('.').pop().replace(/[_-]+/g, ' ').trim());
/** Chip for a graph node: Jev / LLM by speed class, else tool by kind, else code. */
export const stepKind = (n) => (n.cls === 'jev' ? 'Jev' : n.cls === 'llm' ? 'LLM' : n.kind === 'tool' ? 'tool' : 'code');
/** Graph → numbered steps in flow order (breadth first from the entry; unreachable ones last), each with its exits. */
export function orderedSteps(graph) {
  const nodes = graph?.nodes || [], edges = graph?.edges || [];
  const seen = [graph?.entry].filter((id) => nodes.some((n) => n.id === id));
  for (let i = 0; i < seen.length; i++) for (const e of edges) if (e.from === seen[i] && e.to !== '$end' && !seen.includes(e.to) && nodes.some((n) => n.id === e.to)) seen.push(e.to);
  for (const n of nodes) if (!seen.includes(n.id)) seen.push(n.id);
  const num = new Map(seen.map((id, i) => [id, i + 1]));
  const by = new Map(nodes.map((n) => [n.id, n]));
  return seen.map((id) => {
    const n = by.get(id);
    return { n: num.get(id), id, activity: n.activity, label: humanStep(n.activity), kind: stepKind(n), step: `${n.step}@${n.step_version}`,
      exits: edges.filter((e) => e.from === id).map((e) => ({ on: e.on === '*' ? 'then' : e.on, end: e.to === '$end', to: num.get(e.to) ?? null, toLabel: by.get(e.to) ? humanStep(by.get(e.to).activity) : 'end' })) };
  });
}
/** A candidate version's outcome in the reader's words (replay.failed verbatim). */
export function outcomeOf(c) {
  const r = c.replay;
  if (c.status === 'active' || r?.promote) return 'promoted';
  if (r?.failed?.length) return r.failed.join('; ');
  return r?.summary || 'under replay';
}
/** "A1 + E2" → ['A1','E2'] (a near miss may go to a combination). */
export const targetsOf = (goesTo) => String(goesTo || '').split(/\s*\+\s*/).filter(Boolean);

/** One set of copy for every strategy; the numbers below are checked against channels.js by a test. */
export const MODES = {
  sameEverywhere: 'The same strategy and the same evidence serve every mode; only the length and shape of the reply change.',
  audio: { name: 'Audio', live: false, lines: ['No voice channel exists yet.', 'It will be the shortest, spoken form.'] },
  chat: { name: 'Chat', live: true, widgetWords: 150, siteWords: '150–250', deepWords: '500–900',
    lines: ['Works live: progress is narrated while a longer step runs.', 'About 150 words in the widget on other sites; 150–250 in the chat on the library site, with tables and headings.', 'Full length (often 500–900 words) when Jev judges the question needs depth.'] },
  email: { name: 'Email', live: true, emailWords: 600,
    lines: ['A considered letter of up to about 600 words.', 'Passages are quoted in full; an Arabic or Persian original sits beside the English, line by line, as a table.', 'No progress messages: the letter arrives when it is ready.'] },
};
export const MODE_NOTES = { compilation: 'Headings become bold theme labels in any mode that cannot show headings.' };
