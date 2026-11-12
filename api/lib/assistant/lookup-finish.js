// Every code-built lookup answer (find in a work, find a passage, a selection from a work) passes the light writer before the reader
// sees it (Chad 11-12: "strategies only answer the question with data … the final answer should go through Haiku"): it either
// writes the reply for the question as asked from the found data, or says the data does not answer it → the turn goes to Unmatched.
// Deps: ai.js, model-roles.js. Large drafts (a table asked for) are checked, not rewritten — never truncated.
import { modelFor } from '../model-roles.js';

const REWRITE_MAX = 5000;
const PROMPT = ({ convo, did, draft, rewrite }) => `You are Anís, a research assistant over a library of sacred and historical texts. A quick search ran for the reader's LAST message and produced the data below. Decide whether it answers what the reader actually asked, read with the whole conversation (a "try again", "it", "that" refer to earlier turns).

CONVERSATION:
${convo}

WHAT WAS DONE: ${did}

DATA (markdown; its links are the only links allowed):
${draft}

${rewrite
    ? `If the data answers the question, write the reply: line 1 is exactly ANSWER, then the reply — the shortest complete answer to the question as asked, in Anís's warm plain voice, quoting the passage words exactly as given with their links exactly as given (never invent or change a URL), the format the question calls for. Never repeat the reader's sentence back as the words searched for.`
    : 'If the data answers the question, reply with exactly ANSWER on line 1 and nothing else.'}
If it does not answer it (wrong thing searched, wrong work or part, a literal search where the reader asked about a subject, nothing relevant found where it plainly could be), line 1 is MISS: then one sentence saying what should have been looked for instead. Nothing else.`;

const CARD = ({ convo, did }) => `You are Anís, a research assistant over a library of sacred and historical texts. ${did}. The reply would be ONLY that book's card: cover, author, a short description, a Read link — nothing from inside the book.

CONVERSATION:
${convo}

Is the card by itself a complete answer to the reader's LAST message? Yes when they want the book itself: asking for it, whether it is here, to read or open it, a bare title. No when they ask what it says, teaches or contains, about a passage, words or a subject inside it, or anything the card cannot answer.
Line 1: exactly ANSWER, or MISS: then one sentence saying what should be looked for in the book instead. Nothing else.`;

/** → { ok: true, reply } | { ok: false, why }. check: verdict only (a book card: does the card itself answer?). A writer failure keeps the code draft (never a lost answer). */
export async function finishLookup({ messages, draft, did, check = false, complete = null }) {
  const convo = (messages || []).slice(-6).map((m) => `${m.role === 'user' ? 'Reader' : 'Anís'}: ${String(m.content || '').slice(0, 900)}`).join('\n');
  const rewrite = !check && String(draft).length <= REWRITE_MAX;
  const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-light-writer'), temperature: 0.2, maxTokens: rewrite ? 1500 : 160, thinking: false, caller: 'anis-lookup-finish' }));
  let out;
  try { out = String((await call([{ role: 'user', content: check ? CARD({ convo, did }) : PROMPT({ convo, did, draft, rewrite }) }]))?.content ?? ''); } catch { return { ok: true, reply: draft, kept: 'writer-failed' }; }
  const [head, ...rest] = out.trim().split('\n');
  if (/^MISS\b/i.test(head)) return { ok: false, why: head.replace(/^MISS:?\s*/i, '').trim() || 'the data does not answer the question' };
  if (!/^ANSWER\b/i.test(head)) return { ok: true, reply: draft, kept: 'unparsed' };
  const body = rest.join('\n').trim();
  if (!rewrite || !body) return { ok: true, reply: draft };
  // links stay the data's own: any URL the draft does not hold → the draft (grounding beats wording)
  const allowed = new Set(String(draft).match(/https?:\/\/[^\s)\]]+/g) || []);
  const used = body.match(/https?:\/\/[^\s)\]]+/g) || [];
  return used.every((u) => allowed.has(u)) ? { ok: true, reply: body } : { ok: true, reply: draft, kept: 'foreign-link' };
}
