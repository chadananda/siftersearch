// A line → its sentences, abbreviations kept inside them (11-14 tz4: "1281 A.H. (1865)" split at "A." read as a sentence ending on the
// article "a", and dropCutOff took "Revealed in 1281 A." away). Initials (A.H., B.E., J. E.), e.g., i.e., Mr./Mrs./Dr./St., and vol./ch./p./pp./no.
// before a number never end a sentence. Pure; no deps.
const ABBR = String.raw`\b(?:[A-Z]\.(?:\s?[A-Z]\.)*|[Ee]\.\s?g\.|[Ii]\.\s?e\.|(?:Mrs?|Dr|St)\.|(?:[Vv]ols?|[Cc]h|pp?|[Nn]o)\.(?=\s*(?:\d|[IVXLC]+\b)))`;
export const SENTENCE = new RegExp(String.raw`(?:${ABBR}|[^.!?])+(?:[.!?…]+["”’)*_]*|$)\s*|[.!?…]+["”’)*_]*\s*`, 'g');
/** The sentences of one line, each with its trailing space; joined they give the line back. */
export const sentencesOf = (line) => String(line ?? '').match(SENTENCE) || [String(line ?? '')];
