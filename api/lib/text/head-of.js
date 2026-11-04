// headOf: a long text's head, cut at a sentence end (else a word break), marked " …". Pure; no deps.
// Shared by search results (routes/chat.js executeSearch) and Anís' prompts (assistant/prompt.js, researcher.js).

/** The head of a long text, cut at its last sentence end in the final 40% of `max` (else the last word break), marked " …"
 *  so the reader knows the paragraph goes on (11-04: a cut mid-word read as the whole passage; the writer reported "the
 *  passage breaks off there" and guessed the rest). Pure. */
export function headOf(t, max) {
  const s = String(t || '');
  if (s.length <= max) return s;
  const head = s.slice(0, max), ends = [...head.matchAll(/[.!?…][”"’)\]]*(?=\s)/g)].map((m) => m.index + m[0].length);
  const end = ends.filter((e) => e >= max * 0.6).at(-1) ?? (head.lastIndexOf(' ') > max * 0.5 ? head.lastIndexOf(' ') : max);
  return `${s.slice(0, end).trimEnd()} …`;
}
