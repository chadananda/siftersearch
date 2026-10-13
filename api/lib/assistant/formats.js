// Anis answer-format catalog (PRD F4). Each entry: `when` (Jev reads it against question + data + channel), `how` (the
// formatter follows it), `needs` (channel capabilities) and `fits(profile)` (code removes the impossible: no timeline
// without dates, no comparison without two traditions, no table where the channel can't show one). Code filters, Jev
// chooses among what remains, a shape default covers Jev being down. Grow the catalog from the logs. Deps: channels.
import { ENDPOINT } from '../scope-extract.js';
import { supports } from './channels.js';
import { describeProfile } from './findings.js';
import { jevFetch } from '../systemone.js';   // logs the call per task (Laya training) + Clef shadow comparison

export const FORMATS = [
  { id: 'direct_answer', needs: [], fits: (p) => p.passages > 0,
    when: 'a question with a clear answer in one or two passages',
    how: 'Answer in two or three sentences, then give the key words of the passage that settles it.' },
  { id: 'yes_no_with_proof', needs: [], fits: (p) => p.passages > 0 || p.people > 0,
    when: 'a yes/no or single-fact question the evidence decides',
    how: 'Say yes or no (or the fact) in the first sentence, then the one proof, quoted.' },
  { id: 'decisive_passage', needs: ['quotes'], fits: (p) => p.passages > 0,
    when: 'one passage answers the question so well it should be read whole',
    how: 'Lead with that passage as a blockquote, then one or two sentences on what it shows.' },
  { id: 'range_of_voices', needs: [], fits: (p) => p.authors >= 3,
    when: 'several authors speak to the theme and the range itself is the answer',
    how: 'Give three to five short quotations from different authors, one line each, highest authority first; close with one sentence on what they share.' },
  { id: 'authority_layers', needs: [], fits: (p) => p.authorityKinds >= 2,
    when: 'the passages mix scripture, interpretation, guidance, history or scholarship and the question could confuse them',
    how: 'Separate the answer by kind of source — what scripture says, what the authorized interpretation says, what history or scholarship adds — each labelled plainly.' },
  { id: 'popular_vs_literature', needs: [], fits: (p) => p.passages > 0,
    when: 'the question rests on a common belief or assumption that the texts themselves complicate or do not support',
    how: 'Name what is commonly believed in one line, then what the literature itself says, quoted, then what that changes — gently, once.' },
  { id: 'term_with_original', needs: [], fits: (p) => p.shape === 'define' || p.hasOriginal,
    when: 'asks what a word, name or concept means',
    how: 'Give the term, its original-language form with transliteration when a passage has it, and its meaning as the passages use it.' },
  { id: 'find_passage', needs: ['quotes'], fits: (p) => p.shape === 'quote' && p.passages > 0,
    when: 'the person half-remembers a passage and wants to find it',
    how: 'Give the passage found, in its exact words, with the work it comes from; if several candidates, list the best two.' },
  { id: 'people_record', needs: [], fits: (p) => p.people > 0,
    when: 'asks who met, knew, accompanied or was present with whom',
    how: 'Answer from the people record only: who met, who the sources say did not, what is contested — each with its source.' },
  { id: 'list_enumerate', needs: ['lists'], fits: (p) => p.shape === 'enumerate' && (p.passages > 1 || p.people > 1),
    when: 'asks for a list: members, instances, occasions',
    how: 'A short bullet list, each item with its source; say plainly if the list may be incomplete.' },
  { id: 'timeline', needs: ['lists'], fits: (p) => p.dates >= 3,
    when: 'asks what happened when, or the order of events',
    how: 'A chronological list — year, what happened, source — then one sentence on the arc.' },
  { id: 'comparison', needs: [], fits: (p) => p.comparative && p.traditions >= 2,
    when: 'compares two or more traditions, authors or works',
    how: 'Let each tradition speak in its own words, side by side, then say what is genuinely shared and what differs — never use one as a foil for another, and look beneath surface likeness.' },
  { id: 'comparison_table', needs: ['tables'], fits: (p) => p.comparative && p.traditions >= 2,
    when: 'a comparison across several points that reads best as a table',
    how: 'A compact table (one row per point, one column per tradition, short quoted phrases), then one sentence of synthesis marked as yours.' },
  { id: 'reading_suggestion', needs: [], fits: (p) => p.passages > 0,
    when: 'the person is exploring a theme and would be served by reading one text more fully',
    how: 'Answer briefly, then point to the one passage or work worth reading in full, and why.' },
  { id: 'study_question', needs: [], fits: (p) => p.passages > 0,
    when: 'a reflective or open question where thinking further is the point',
    how: 'Answer from the passages, then close with one question back that helps them think further — not a quiz.' },
  { id: 'honest_absence', needs: [], fits: (p) => p.absence || p.passages === 0,
    when: 'nothing found answers the question',
    how: 'Say plainly that the library does not speak to it, mention the nearest thing it does contain, and suggest how to ask differently.' },
  { id: 'letter', needs: ['headings', 'charts'], fits: (p) => p.passages > 0,
    when: 'a considered written reply, quoting fully, for a reader who has time',
    how: 'A letter: greet, answer, quote the passages fully with their sources, reflect briefly, close warmly.' },
];

/** Formats possible for this data and channel. Absence forces the honest-absence reply. */
export function feasibleFormats(profile, channel) {
  if (profile.absence || profile.passages + profile.people === 0) return FORMATS.filter((f) => f.id === 'honest_absence');
  return FORMATS.filter((f) => f.id !== 'honest_absence' && f.fits(profile) && supports(channel, f.needs));
}

// When Jev is unreachable: a sensible format per question shape (fail open to the plain path).
const SHAPE_DEFAULT = { quote: 'find_passage', define: 'term_with_original', enumerate: 'list_enumerate', fact: 'yes_no_with_proof', topic: 'range_of_voices', lookup: 'direct_answer' };
export function defaultFormat(feasible, profile) {
  const want = profile.people > 0 ? 'people_record' : SHAPE_DEFAULT[profile.shape];
  return feasible.find((f) => f.id === want) || feasible.find((f) => f.id === 'direct_answer') || feasible[0] || FORMATS[0];
}

/** Choose a format: code filters, Jev chooses (one typed call), default on failure. → { id, how, by } */
export async function chooseFormat({ question, profile, channel, apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = jevFetch('anis-format'), timeoutMs = 600 }) {
  const feasible = feasibleFormats(profile, channel);
  if (feasible.length === 1 || !apiKey) { const f = feasible.length === 1 ? feasible[0] : defaultFormat(feasible, profile); return { id: f.id, how: f.how, by: 'code' }; }
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest',
        state: `question: ${String(question).slice(0, 600)}\nevidence found: ${describeProfile(profile)}\nchannel: ${channel.description}`,
        questions: { format: { type: 'choice', instructions: 'Which reply shape best serves this question, given the evidence actually found and the channel? The person did not ask for a format; choose what they would find clearest.',
          criteria: Object.fromEntries(feasible.map((f) => [f.id, f.when])) } } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const a = (await res.json()).answers?.format;
      const f = feasible.find((x) => x.id === (a?.choice ?? a?.value));
      if (f) return { id: f.id, how: f.how, by: 'jev', confidence: a?.confidence ?? null };
    }
  } catch { /* fail open */ }
  const f = defaultFormat(feasible, profile);
  return { id: f.id, how: f.how, by: 'default' };
}
