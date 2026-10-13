// What a letter Anís starts asks the research pipeline, by step (PRD F11/F12). Steps 0–1 show a capability the reader
// has not used, applied to THEIR subject (onboarding: "I neglected to mention, I can also…"); later steps are further
// research on their last question. The opening line is fixed text; the body comes from the evidence. Pure.

export const CAPABILITIES = [
  { id: 'original', opening: 'I neglected to mention that I can also show you the original words behind a translation.',
    question: (q) => `Thinking of this earlier question — "${q}" — find one key passage on it and show its original Arabic or Persian beside the English, with a word or two on what the original adds.` },
  { id: 'range', opening: 'One more thing I can do: gather what several writers say on a subject, side by side.',
    question: (q) => `Thinking of this earlier question — "${q}" — gather three or four short passages from different writers that bear on it, each with its source.` },
];

export function outreachPrompt(step, lastQuestion) {
  const q = String(lastQuestion).replace(/\s+/g, ' ').trim().slice(0, 300);
  const short = q.length > 60 ? `${q.slice(0, 57)}…` : q;
  if (step < CAPABILITIES.length) {
    const c = CAPABILITIES[step];
    return { capability: c.id, subject: `Something more on “${short}”`, opening: c.opening, question: c.question(q) };
  }
  return { capability: 'follow-up', subject: `Still thinking about “${short}”`,
    opening: 'I have been thinking further about your question, and found something we did not look at.',
    question: `Earlier the reader asked: "${q}". Find one passage on this that the conversation has not yet quoted, and offer it as a further reflection, briefly.` };
}
