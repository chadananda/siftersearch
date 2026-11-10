// Showcase questions for the chat's "Try a sample" menu: one per answering strategy, chosen to route there and show it at its best. No answers baked in.
// `before` = earlier turns of a thread, sent first. Also the source of the battery's sample-<strategy> cases.
export const SAMPLES_FOR_EVERYONE = false; // admins only for now; flip to show the menu to every reader
export const ANIS_SAMPLES = [
  { strategy: 'understanding', label: 'Understand a teaching', q: 'What does the Buddhist teaching of dependent origination mean, and how do the texts explain it?' },
  { strategy: 'comparison', label: 'Compare traditions', q: "How do the Bible and the Qur'an each teach forgiveness?" },
  { strategy: 'prayer', label: 'Find a prayer', q: 'I need a prayer for a friend who is seriously ill.' },
  { strategy: 'guidance', label: 'Universal House of Justice guidance', q: 'What has the Universal House of Justice said about the role of youth in the community?' },
  { strategy: 'reference', label: 'Scripture reference', q: "Qur'an 2:255" },
  { strategy: 'compilation', label: 'Compile passages', q: 'Compile passages on justice, organized under headings.' },
  { strategy: 'claim_check', label: 'Weigh a claim', q: "Is the Bahá'í Faith a cult?" },
  { strategy: 'timeline', label: 'Timeline', q: "Give me a timeline of the ministries of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá." },
  { strategy: 'history_fact', label: 'Quick historical fact', q: 'Who founded Sikhism?' },
  { strategy: 'quote_trace', label: 'Trace a quotation', q: 'Where does the saying "Let your vision be world-embracing" come from?' },
  { strategy: 'term', label: 'Meaning of a word', q: 'What does the Arabic word irfán mean?' },
  { strategy: 'original', label: 'Original language', q: "Show me the Arabic of the opening chapter of the Qur'an beside an English translation." },
  { strategy: 'phrase_usage_trace', label: 'Trace a phrase', q: 'How is the phrase "kingdom of heaven" used across the sacred texts?' },
  { strategy: 'book', label: 'Find a book', q: 'Do you have the Dhammapada?' },
  { strategy: 'about', label: 'About Anís', q: 'What can you do, and which religions does the library cover?' },
  { strategy: 'general_research', label: 'Open research question', q: "What do the sacred texts say about the purpose of suffering in a person's life?" },
  { strategy: 'find_in_book', label: 'Search inside a book', before: ['God Passes By'], q: 'can you search it for "private property"?' },
];
