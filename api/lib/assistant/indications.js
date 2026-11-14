// The reader's indications bio (Chad 11-14): what a reader has SAID about themselves (tradition, level, interest, language, role, a work or
// person they care about), noted by the agent's note_indication tool, rendered back into later turns to steer depth and direction.
// Also the per-turn TRADITION line (host → bio → none). PURE — bundles for the edge Worker; storage is worker/anis/bio.js.

export const KINDS = ['tradition', 'level', 'interest', 'language', 'role', 'work'];
export const EVIDENCE_MAX = 120, VALUE_MAX = 80, BIO_MAX = 400;

export const NOTE_INDICATION_TOOL = { type: 'function', function: { name: 'note_indication',
  description: 'Note one thing the reader has revealed about themselves in their own words, so later answers suit them. Cheap; returns at once. Call it in the same round as your other tool calls, once per fact. Only what the reader said or plainly showed — never from a name, never from the topic of one question (asking about Islam is an interest, not being Muslim).',
  parameters: { type: 'object', required: ['kind', 'value', 'evidence'], properties: {
    kind: { type: 'string', enum: KINDS, description: 'tradition = the faith the reader says is theirs; level = how much they know or read (newcomer, deep student, reads Persian); interest = a lasting topic; language = the language they write or want; role = study-class tutor, researcher, seeker, teacher…; work = a work or person they care about' },
    value: { type: 'string', description: 'short, e.g. "Catholic", "new to the Bahá\'í Faith", "the Báb\'s early life", "Spanish", "study-circle tutor", "Kitáb-i-Íqán"' },
    evidence: { type: 'string', description: `the reader's own words that show it, at most ${EVIDENCE_MAX} characters` } } } } };

const one = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Tool args → { kind, value, evidence } or { error } (the agent reads the error). */
export function validIndication(a) {
  const kind = String(a?.kind || '').toLowerCase().trim(), value = one(a?.value, VALUE_MAX), evidence = one(a?.evidence, EVIDENCE_MAX);
  if (!KINDS.includes(kind)) return { error: `kind must be one of ${KINDS.join(', ')}` };
  if (!value) return { error: 'value is required' };
  if (!evidence) return { error: "evidence is required: the reader's own words" };
  return { kind, value, evidence };
}

// what steers most comes first; within a kind the most often indicated, then the newest
const RANK = { tradition: 0, role: 1, level: 2, language: 3, work: 4, interest: 5 };
/** rows [{ kind, value, evidence, at }] (any order) → one per kind+value with its newest evidence and how often it was indicated, strongest first. */
export function mergeIndications(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!KINDS.includes(r?.kind) || !r.value) continue;
    const k = `${r.kind}|${String(r.value).toLowerCase()}`, at = Number(r.at) || 0, x = by.get(k);
    if (!x) by.set(k, { kind: r.kind, value: r.value, evidence: r.evidence, at, n: 1 });
    else { x.n++; if (at >= x.at) Object.assign(x, { value: r.value, evidence: r.evidence, at }); }
  }
  return [...by.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.n - a.n || b.at - a.at);
}

/** The block a turn carries: whole lines only, ≤ max chars of lines; '' when nothing is indicated. */
export function renderBio(rows, max = BIO_MAX) {
  const lines = [];
  let len = 0;
  for (const x of mergeIndications(rows)) {
    const line = `- ${x.kind}: ${x.value} ("${x.evidence}")`;
    if (len + line.length + 1 > max) continue;
    lines.push(line); len += line.length + 1;
  }
  return lines.length ? `WHAT THIS READER HAS INDICATED (their own words; let it steer depth, tradition and what you offer next; never recite or mention it; assume nothing beyond what they said):\n${lines.join('\n')}` : '';
}

/** The per-turn TRADITION line. The question itself decides first (the agent judges, no code); then what the reader said of
 *  themselves; then the deployment's own audience description, free text the agent reads (no code maps it to a tradition); else none. */
export function traditionLine({ audience = '', rows = [] } = {}) {
  const said = mergeIndications(rows).find((x) => x.kind === 'tradition');
  const desc = String(audience || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const parts = ['TRADITION: If the question itself names or plainly implies a tradition, that tradition is in play for it.'];
  if (said) parts.push(`Otherwise the reader has said theirs is ${said.value} ("${said.evidence}"): answer from it first, presuming nothing more than they said.`);
  if (desc) parts.push(`${said ? 'This' : 'Otherwise this'} deployment describes its audience as: "${desc}". Read it as a description of the site's readers, not of this reader: let it set what is natural to assume, and no more.`);
  if (!said && !desc) parts.push('Otherwise none is assumed: this is an interfaith library; answer a general question briefly from the traditions the library holds best for it, and offer to go deeper in one.');
  return parts.join(' ');
}
