// Anís's settings (roles): companion (default), study_companion, fireside. Which one a turn takes is decided from CONTEXT —
// by Jev or the writer from the conversation, the request and the reader — never from keywords in the message (Chad 11-03).
// This file only names the settings and what each asks of the reply; resolveRole() accepts an explicit choice. Pure.

export const ROLES = {
  companion: {
    id: 'companion',
    when: 'the ordinary reader or researcher — the default',
    how: null,
  },
  study_companion: {
    id: 'study_companion',
    when: 'a reader working through a text, with a class, course or reading challenge or on their own',
    how: 'STUDY COMPANION: they are working through a text, so stay inside it. Anchor the answer in the exact place — the chapter, section or paragraph — and quote the words themselves before explaining them. Say who is speaking in the passage (the narrator, the figure whose words are reported, a translator\'s note). Offer one question worth bringing back to the group rather than a lecture, and never summarise ahead of where they are.',
  },
  fireside: {
    id: 'fireside',
    when: 'someone meeting the Faith for the first time: what it is, what its followers believe, how it relates to their own religion',
    how: 'FIRESIDE: they are meeting the Faith for the first time. Speak plainly and warmly without assumed vocabulary — explain a name or term the first time it appears, from the passages or your knowledge of the language, never from memory — and let one or two of the texts\' own words carry the answer. Honour their own tradition; never argue, never recruit, never tell them what to do. Answer only what was asked and leave the door open for the next question.',
  },
};

/** The guide the writer reads (cached system prefix): choose the setting from the conversation, not from a keyword. */
export const ROLE_GUIDE = `SETTING (choose from CONVERSATION SO FAR, the question and any reader note; it changes manner, never grounding or links):
  · companion — ${ROLES.companion.when}.
  · ${ROLES.study_companion.how}
  · ${ROLES.fireside.how}
  Take the study setting when the conversation shows a reader inside a text or a class; the fireside setting when it shows a newcomer; otherwise stay the companion. Never announce the setting.`;

/** An explicit role (Jev's choice, a reader card, a host profile) → its entry; unknown or empty → null (writer decides). */
export function resolveRole(role) {
  const id = String(role?.id || role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROLES[id] && ROLES[id].how ? ROLES[id] : null;
}
