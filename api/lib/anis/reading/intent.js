// Reading guide (Chad 10-12) — what a reader's message asks for. Pure.
//   start    "help me study The Dawn-Breakers", "read X with me", "be my reading companion for X"
//   next     "continue", "next", "go on", "ok" (the default reply to a page)
//   again    "again", "try again" — the research was not deep enough: redo the page deeper
//   back     "back", "previous", "go back"
//   jump     "skip to chapter 5", "go to the preface", "jump to the introduction"
//   where    "where are we?"
//   stop     "stop reading", "pause the book"
//   question anything else — answered in-thread; the bookmark does not move

const START = /\b(?:help me (?:study|read|go through)|(?:study|read|go through)\s+(.+?)\s+with me|(?:be|act as) my (?:reading|study) (?:companion|guide)(?: for)?|reading (?:companion|guide) for|let'?s (?:study|read))\b\s*(.*)/i;

/** The book a start message names: "help me study the Dawn-Breakers. Let's start from the introduction" → "Dawn-Breakers". */
export function bookFrom(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(START);
  if (!m) return null;
  const raw = (m[1] || m[2] || '').split(/[.!?;\n]| starting | start(?:ing)? (?:at|from|with)\b| from the | beginning /i)[0];
  const book = raw.split(/,\s*(?:and\s+)?(?:let'?s|starting|start|begin|beginning|from)\b/i)[0]
    .replace(/^(?:the book|book)\s+/i, '').replace(/^["“'‘]|["”'’]$/g, '').replace(/^(?:the\s+)(?=\S)/i, '').replace(/[\s,;:]+$/, '').trim();
  return book || null;
}

/** Where a start message asks to begin ("start from the introduction", "begin with chapter 3"). */
export function startFrom(text) {
  const t = String(text || '');
  const m = t.match(/\b(?:start|begin|starting|beginning)\b[^.?!]*?\b(?:from|with|at)\s+(?:the\s+)?([^.?!,;]+)/i);
  return m ? m[1].trim() : null;
}

/** → { kind, book?, from?, target? }. `active` = the reader has a book open in this thread. */
export function readingIntent(text, { active = false } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const book = bookFrom(t);
  if (book) return { kind: 'start', book, from: startFrom(t) };
  if (!active) return { kind: 'none' };
  const low = t.toLowerCase().replace(/[.!…]+$/, '').trim();
  if (!low || /^(continue|next|next page|go on|keep going|more|ok(ay)?|yes|onward|proceed|carry on|please continue|continue please|next please)$/.test(low)) return { kind: 'next' };
  if (/^(please )?(try )?again( please)?$|^(dig|go) deeper$|^not deep enough$/.test(low)) return { kind: 'again' };
  if (/^(go )?back$|^previous( page)?$|^last page$/.test(low)) return { kind: 'back' };
  if (/^where (are|were) we\b|^what page\b|^bookmark$/.test(low)) return { kind: 'where' };
  if (/^(stop|pause|end) (reading|the book|the reading)\b/.test(low)) return { kind: 'stop' };
  const jump = low.match(/^(?:skip|jump|go|move|turn)\s+(?:ahead\s+)?to\s+(.+)$/);
  if (jump) return { kind: 'jump', target: jump[1] };
  return { kind: 'question' };
}
