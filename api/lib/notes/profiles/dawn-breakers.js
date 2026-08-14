// Dawn-Breakers research profile — the HISTORICAL lens.
//
// A profile declares three things and nothing else: what counts as a useful addition (categories), which
// research channels are authoritative, and any extra gate. The engine is constant; this is the part that
// changes per book, so the Kitáb-i-Íqán (revealed text, Islamic research, original-language reference) is a
// sibling file rather than a fork of the runner. See planning/dawn-breakers-notes-plan.md §1.1.
//
// The prompt is Chad's research protocol almost verbatim, because it IS the specification. Where it says
// "be selective", the prompt says be selective AND gates.js enforces a cap — prompt first, determinism as
// the backstop ([[feedback_prompt_tuning_over_determinism]]).

export const CATEGORIES = [
  { key: 'name', label: 'Name', asks: 'meaning/translation of a Persian or Arabic name, title, honorific or term — when interesting or relevant' },
  { key: 'person', label: 'Person', asks: 'who they are, why they matter HERE, and notable appearances elsewhere in Bahá\'í, Persian or Islamic history' },
  { key: 'place', label: 'Historical context', asks: 'brief period-appropriate context for a place: social, economic, political or religious significance' },
  { key: 'connection', label: 'Connection', asks: 'relevant parallels or connections to the writings and teachings of the Báb, Bahá\'u\'lláh and ‘Abdu\'l-Bahá' },
  { key: 'islamic', label: 'Islamic background', asks: 'Qur\'ánic, Shí‘ah, historical or cultural references a modern reader might otherwise miss' },
  { key: 'detail', label: 'Interesting note', asks: 'an occasional memorable fact that illuminates the story or stimulates class discussion' },
];

export const profile = {
  id: 'dawn-breakers',
  docId: 21308,
  categories: CATEGORIES,
  // A connection note must declare whether it is an explicit teaching, a strong parallel, or an interpretive
  // link — an unlabelled parallel reads as doctrine, which is the failure this rule exists to prevent.
  labelledCategories: ['connection'],
  // "Be selective. Many paragraphs may need only one note or no note."
  maxNotesPerParagraph: 3,
  // Corpus first, highest authority available, no citation laundering. Shoghi Effendi's Dawn-Breakers
  // footnotes are doc 40108; GPB characterisations outrank scholarship for what a figure IS.
  sourcePreference: [
    { kind: 'guardian', docIds: [40108], why: "Shoghi Effendi's own footnotes — the authoritative cross-reference" },
    { kind: 'gpb', why: 'God Passes By: characterisation of any figure or event it treats is primary' },
    { kind: 'scholarship', why: 'Balyuzi, Momen, Saiedi, Rabbani, Ahdieh — fill gaps GPB leaves' },
    { kind: 'web', why: 'only when the corpus is genuinely thin; mark UNVERIFIED' },
  ],
};

/** The system prompt. Chad's protocol, stated as rules the model must follow — not a paraphrase of it. */
export function systemPrompt() {
  return `You are building INSTRUCTOR NOTES for The Dawn-Breakers: concise research notes a teacher would
actually use, turning the book into a jumping-off point for deeper historical, religious and intellectual
exploration — without burying the reader in trivia.

You are given ONE paragraph, the chapter it sits in for context, and NOTES ALREADY WRITTEN for this book.

Look ONLY for genuinely useful additions in these areas:
${CATEGORIES.map((c) => `• ${c.label} — ${c.asks}`).join('\n')}

RULES — these override any instinct to be thorough:
1. BE SELECTIVE. Many paragraphs need only one note, or none at all. Returning no notes is a correct and
   common answer. Do not manufacture a note to fill a category.
2. DO NOT SUMMARIZE THE PARAGRAPH. The reader has just read it. A note that restates it is worthless.
3. DO NOT BE COMPREHENSIVE. Find the most interesting or illuminating point, not every available point.
4. AVOID REPETITION. You are shown what has already been covered for this book. If something is already
   explained, mention it again ONLY when this paragraph adds a genuinely NEW DIMENSION — and then say what
   the new dimension is.
5. DISTINGUISH clearly between an EXPLICIT TEACHING (the writings state this), a STRONG PARALLEL (the
   passages genuinely correspond), and an INTERESTING INTERPRETIVE CONNECTION (your reading). Never let an
   interpretation read as doctrine.
6. PROVIDE SOURCES for factual claims and quotations. Prefer the corpus; cite the strongest source, never a
   secondary page that merely repeats it.
7. PREFER CONCISE notes that would actually be useful while teaching.

Return ONLY JSON: {"notes":[{"category":"name|person|place|connection|islamic|detail","subject":"<the
person, place, term or theme this teaches>","body":"<the note>","claimKind":"explicit_teaching|strong_parallel|interpretive|fact|null","newDimension":"<what this adds, if the subject was already covered; else null>","sources":[{"docId":<n>,"paraId":"para_N","quote":"<short>"}]}]}
An empty list is a valid and expected answer.`;
}

/** The per-paragraph user message: the paragraph, its chapter frame, and what is already taught. */
export function buildUser({ paragraph, chapterFrame, taught = [] }) {
  const prior = taught.length
    ? `\nALREADY COVERED in this book (do not repeat; add only a new dimension):\n`
      + taught.map((t) => `• [¶${t.paragraph_index}] ${t.subject_key}: ${String(t.note).slice(0, 160)}`).join('\n')
    : '\nALREADY COVERED: nothing yet for the subjects in this paragraph.';
  return `CHAPTER CONTEXT:\n${chapterFrame}\n${prior}\n\nPARAGRAPH ¶${paragraph.paragraph_index}:\n${paragraph.text}`;
}

/** The chapter context pass — read the whole chapter first, as the protocol requires. */
export function chapterFramePrompt(chapterTitle, text) {
  return `Read this entire chapter of The Dawn-Breakers and produce a SHORT orientation for an instructor
annotating it paragraph by paragraph: the narrative arc, the principal figures and how they relate, the
places and the period, and any running theme a reader needs to hold. 200 words maximum. This is context for
later annotation, not a summary for publication.

CHAPTER: ${chapterTitle}\n\n${text}`;
}
