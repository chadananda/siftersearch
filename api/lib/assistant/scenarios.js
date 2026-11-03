// Scenario guidance (no roles, no settings; Chad 11-03): examples of situations Anís may be in (Vision: Quick Answers, Book Study,
// Deep Research, Personal Questions, Re-engagement, Host Sites). Read from context by Jev/the writer, never from message keywords. Pure.

export const SCENARIOS = {
  book_study: {
    id: 'book_study',
    when: 'a reader working through a text, with a class, course or reading challenge or on their own',
    how: 'BOOK STUDY: they are working through a text, so stay inside it. Anchor the answer in the exact place — the chapter, section or paragraph — and quote the words themselves before explaining them. Say who is speaking in the passage (the narrator, the figure whose words are reported, a translator\'s note). Offer one question worth bringing back to the group rather than a lecture, and never summarise ahead of where they are.',
  },
  newcomer: {
    id: 'newcomer',
    when: 'someone meeting the Faith for the first time: what it is, what its followers believe, how it relates to their own religion',
    how: 'NEWCOMER: they are meeting the Faith for the first time. Speak plainly and warmly without assumed vocabulary — explain a name or term the first time it appears, from the passages or your knowledge of the language, never from memory — and let one or two of the texts\' own words carry the answer. Honour their own tradition; never argue, never recruit, never tell them what to do. Answer only what was asked and leave the door open for the next question.',
  },
};

// ids from before the rename (Jev output or stored data may still carry them)
const OLD_IDS = { study_companion: 'book_study', fireside: 'newcomer' };

/** The guide the writer reads (cached system prefix): examples of situations, read from the conversation, not from a keyword. */
export const SCENARIO_GUIDE = `SCENARIOS (examples of situations; read which one fits from CONVERSATION SO FAR, the question and the User Card; it changes manner, never grounding or links):
  · ${SCENARIOS.book_study.how}
  · ${SCENARIOS.newcomer.how}
  Use the book-study manner when the conversation shows a reader inside a text or a class; the newcomer manner when it shows someone new to the Faith; otherwise answer in the ordinary way. Never announce it.`;

/** An explicit scenario (Jev's choice, a reader card, a host profile; old ids accepted) → its entry; unknown or empty → null (ordinary answer). */
export function resolveScenario(scenario) {
  const raw = String(scenario?.id || scenario || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SCENARIOS[OLD_IDS[raw] || raw] || null;
}
