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

/** A notes LEVEL the reader asks for, anywhere in the message (Chad 10-13: "use the advanced level of notes"). Pure. */
export function levelFrom(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(advanced|scholarly|scholar|expert|academic|in[- ]depth|more detailed|deeper)\b[^.?!]{0,30}\b(notes?|level|research)\b|\b(notes?|level)\b[^.?!]{0,20}\b(advanced|scholarly|expert|academic)\b/.test(t)) return 'advanced';
  if (/\b(simpler|simple|basic|beginner|introductory|lighter|less detail(ed)?)\b[^.?!]{0,30}\b(notes?|level)\b|\b(notes?|level)\b[^.?!]{0,20}\b(simpler|basic|beginner|introductory)\b/.test(t)) return 'introductory';
  if (/\b(normal|standard|default|regular)\b[^.?!]{0,10}\b(notes?|level)\b/.test(t)) return 'serious';
  return null;
}

/** → { kind, book?, from?, target?, level? }. `active` = the reader has a book open. Inside a reading thread replies are
 *  conversational ("good. next please. and use the advanced level of notes" — 10-13 this fell through to an ordinary
 *  answer): a navigation word anywhere counts; a bare acknowledgement means "next"; a level request rides along. */
export function readingIntent(text, { active = false } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const book = bookFrom(t);
  if (book) return { kind: 'start', book, from: startFrom(t), level: levelFrom(t) };
  if (!active) return { kind: 'none' };
  const low = t.toLowerCase();
  const level = levelFrom(t);
  const withLevel = (o) => (level ? { ...o, level } : o);
  const asks = /\?/.test(low) || /^(who|what|why|how|when|where(?! are we)|which|is|was|were|did|does|do|can|could|tell me|explain)\b/.test(low);
  if (/\b(stop|pause|end) (reading|the book|the reading)\b/.test(low)) return { kind: 'stop' };
  if (/\bwhere (are|were) we\b|\bwhat page\b|\bbookmark\b/.test(low)) return { kind: 'where' };
  const jump = low.match(/\b(?:skip|jump|go|move|turn)\s+(?:ahead\s+)?to\s+([^.?!,;]+)/);
  if (jump && !/^the next\b/.test(jump[1])) return withLevel({ kind: 'jump', target: jump[1].trim() });
  if (/\b(try again|again|dig deeper|go deeper|not deep enough|redo)\b/.test(low) && !asks) return withLevel({ kind: 'again' });
  if (/\b(go back|previous page|last page)\b|^back\b/.test(low)) return withLevel({ kind: 'back' });
  if (/\b(next|continue|go on|keep going|carry on|proceed|onward|read on|more please)\b/.test(low)) return withLevel({ kind: 'next' });
  if (level && !asks) return { kind: 'again', level, relevel: true };   // "use simpler notes" alone → this page again at that level
  if (!low || /^(ok(ay)?|yes|good|great|thanks?|thank you|lovely|wonderful|beautiful|perfect|got it|nice)[\s.!,]*(thanks?|thank you)?[\s.!]*$/.test(low)) return { kind: 'next' };
  return { kind: 'question' };
}

// ── understanding a reply by MEANING (Chad 10-13: "you cannot control how a person responds and force them to use exactly
// one word") ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const UNDERSTAND_SYSTEM = `Someone is reading a book with a companion by email, one page at a time. They just replied to a page.
Decide what they want. Reply with JSON only:
{"kind":"next|again|back|jump|where|stop|question|start","level":"introductory|serious|advanced|null","target":"chapter/section/event to jump to, or null","book":"a different book to start, or null"}
- next: they want to keep reading (any wording: "carry on", "lovely, more", "ok", "thanks, onward", a comment with no request)
- again: the same page redone deeper or differently ("not enough detail", "dig deeper", "redo with more on X")
- back / where / stop: previous page / where are we / pause the reading
- jump: go to a named chapter, section or event
- question: they ask something about what they read (answer it; do not move on) — if they ALSO ask to continue, choose next
- start: they ask to read a different book
- level: only if they ask for simpler / more scholarly notes.`;

/** The reply's meaning, from a small model; falls back to the rules if the model is unavailable. Never throws. */
export async function understandReply(text, { active = false, page = '', llm } = {}) {
  const rules = readingIntent(text, { active });
  if (!active || rules.kind === 'start' || !llm) return rules;
  try {
    const r = await llm({ system: UNDERSTAND_SYSTEM, user: `PAGE THEY JUST READ: ${page || 'unknown'}\nTHEIR REPLY: ${String(text).slice(0, 1500)}` });
    const j = r?.json;
    const kinds = ['next', 'again', 'back', 'jump', 'where', 'stop', 'question', 'start'];
    if (!j || !kinds.includes(j.kind)) return rules;
    if (j.kind === 'start') return j.book ? { kind: 'start', book: j.book, from: startFrom(text) } : rules;
    const level = ['introductory', 'serious', 'advanced'].includes(j.level) ? j.level : rules.level || null;
    const out = { kind: j.kind, ...(level ? { level } : {}), ...(j.kind === 'jump' && j.target ? { target: j.target } : {}), by: 'model' };
    if (out.kind === 'jump' && !out.target) return rules;
    return out;
  } catch { return rules; }
}
