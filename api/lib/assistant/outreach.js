// What a letter Anís starts asks the research pipeline, by step (PRD F11/F12). Steps 0–1 show a capability the reader
// has not used, applied to THEIR subject (onboarding: "I neglected to mention, I can also…"); later steps are further
// research on their last question. The opening line is fixed text; the body comes from the evidence. Pure.
// 10-23 review (Liliane): two letters went out that said "I cannot find…" and quoted pilgrim notes about "words" for a
// question on knowledge, under the subject "Something more on “than let's use the english word knowledge”". Now the
// researcher writes them (routes/assistant-mail.js), a letter that declines or apologises is never sent (weakLetter), and
// the subject names the question the thread is about, not a two-word follow-up.

export const CAPABILITIES = [
  { id: 'original', opening: 'I neglected to mention that I can also show you the original words behind a translation.',
    question: (q) => `Thinking of this earlier question — "${q}" — find one key passage on it and show its original Arabic or Persian beside the English, with a word or two on what the original adds.` },
  { id: 'range', opening: 'One more thing I can do: gather what several writers say on a subject, side by side.',
    question: (q) => `Thinking of this earlier question — "${q}" — gather three or four short passages from different writers that bear on it, each with its source.` },
];

/** The question a thread is about: the last reader message that is a real question — a short follow-up ("than let's use
 *  the english word knowledge", "ok", "next") leans on an earlier one, which is joined to it. Pure. */
export function threadQuestion(messages = []) {
  const asked = messages.filter((m) => m.role === 'user').map((m) => String(m.content || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!asked.length) return null;
  const last = asked.at(-1);
  const leans = last.split(' ').length < 9 || /^(than|then|and|but|so|ok|okay|yes|no|what about|how about|please)\b/i.test(last);
  const earlier = leans ? [...asked.slice(0, -1)].reverse().find((q) => q.split(' ').length >= 4 && q !== last) : null;
  return earlier ? `${earlier} — then: ${last}` : last;
}

/** A letter Anís starts that declines, apologises or reports a gap is never sent (silence beats a weak letter). Pure. */
export const WEAK_LETTER = /\b(I (?:cannot|can(?:'|’)t|could not|couldn(?:'|’)t|was unable to|am unable to) (?:find|locate|show|confirm)|I am afraid|(?:do|does) not (?:settle|contain|mention)|(?:may|might) be incomplete|honest (?:answer|limitation)|not (?:present|available) in the (?:library|texts|records))/i;
export const weakLetter = (text) => WEAK_LETTER.test(String(text || ''));

/** A subject line: the theme in a few words, never a fragment of a follow-up. Pure. */
export function subjectTopic(q) {
  const s = String(q || '').replace(/\s+/g, ' ').trim();
  const first = s.split(' — then: ')[0];
  return first.length > 60 ? `${first.slice(0, 57).replace(/\s+\S*$/, '')}…` : first;
}

export function outreachPrompt(step, lastQuestion) {
  const q = String(lastQuestion).replace(/\s+/g, ' ').trim().slice(0, 300);
  const short = subjectTopic(q);
  if (step < CAPABILITIES.length) {
    const c = CAPABILITIES[step];
    return { capability: c.id, subject: `Something more on “${short}”`, opening: c.opening, question: c.question(q) };
  }
  return { capability: 'follow-up', subject: `Still thinking about “${short}”`,
    opening: 'I have been thinking further about your question, and found something we did not look at.',
    question: `Earlier the reader asked: "${q}". Find one passage on this that the conversation has not yet quoted, and offer it as a further reflection, briefly.` };
}
