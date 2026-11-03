// STRUCTURAL facts about the latest user turn — never what its words mean (Chad 11-03: "don't try to use deterministic
// parsing of words to gather intent. That is not going to work."). Intent comes from Jev, given these facts, the recent
// history and the reader card; this file only states what is true of the message's shape: position in the thread,
// length, quoted spans (punctuation), script. jevState() renders that context for every Jev decision. Pure.

/** True when no assistant reply precedes the latest user message: a first message can never be a follow-up. */
export function isFirstMessage(messages) {
  const ms = messages || [];
  const last = ms.length - 1 - [...ms].reverse().findIndex((m) => m.role === 'user');
  return !ms.slice(0, Math.max(0, last)).some((m) => m.role === 'assistant');
}

/** Text between quote marks (“…” "…" «…» ‘…’, 3+ chars). Quotation marks are structure; what the words mean is Jev's. */
export function quotedSpans(text) {
  const s = String(text || '');
  const out = [];
  for (const re of [/[“"]([^”"]{3,})[”"]/g, /«([^»]{3,})»/g, /(?:^|[\s(])[‘']([^’']{3,}?)[’'](?=[\s).,;:!?]|$)/g]) {
    for (const m of s.matchAll(re)) out.push(m[1].replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** The dominant non-Latin script of a text, by Unicode block (not by vocabulary). */
export function scriptOf(text) {
  const s = String(text || '');
  const n = (re) => (s.match(re) || []).length;
  const counts = { Arabic: n(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g), Hebrew: n(/[֐-׿]/g), Devanagari: n(/[ऀ-ॿ]/g),
    Greek: n(/[Ͱ-Ͽ]/g), Cyrillic: n(/[Ѐ-ӿ]/g), CJK: n(/[぀-ヿ一-鿿가-힯]/g) };
  const [name, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return c >= 2 && c >= n(/[A-Za-z]/g) / 2 ? name : null;
}

/** → { first, turn, words, chars, quoted, quotedBack, script, question, text } for the latest user message. */
export function turnFacts(messages) {
  const ms = messages || [];
  const text = String([...ms].reverse().find((m) => m.role === 'user')?.content || '');
  const words = (text.match(/\p{L}[\p{L}\p{M}'’-]*|\p{N}+/gu) || []).length;
  const quoted = quotedSpans(text);
  const norm = (t) => String(t || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
  const said = ms.slice(0, -1).filter((m) => m.role === 'assistant').map((m) => norm(m.content));
  const bare = (x) => x.replace(/^[\s.,;:!?'"—–-]+|[\s.,;:!?'"—–-]+$/g, '');   // the quoter's own punctuation at either end
  const pieces = (q) => norm(q).split(/\.{3}|…/).map(bare).filter((x) => x.length >= 3);   // an elided quotation: every piece must be there
  const quotedBack = quoted.filter((q) => said.some((a) => pieces(q).every((x) => a.includes(x)))).length;   // the assistant's own words, quoted back
  return { first: isFirstMessage(ms), turn: ms.filter((m) => m.role === 'user').length, words, chars: text.length, quoted, quotedBack, script: scriptOf(text), question: /[?؟]/.test(text), text };
}
export const requestFeatures = turnFacts;   // name kept for callers written against the 11-03 version

/** One line Jev reads before the conversation: the message's position and shape, in words. */
export function describeTurn(f) {
  const parts = [f.first ? 'the FIRST message of the conversation (no history — it cannot be a follow-up)' : `user message #${f.turn} of a thread (the history below is what it may continue)`];
  parts.push(f.words === 0 ? 'no words' : f.words === 1 ? 'a single word' : f.words <= 6 ? `${f.words} words (very short — read it against the history and the reader card)` : `${f.words} words${f.words >= 12 && !f.question ? ', no question mark' : ''}`);
  if (f.quoted.length) {
    const spans = f.quoted.map((q) => `«${q.slice(0, 120)}»`).join(' ');
    if (f.quotedBack === f.quoted.length) parts.push(`quotes these words: ${spans} — every span is the assistant's OWN words from its previous reply, quoted back (a challenge or question about them is about the passage under discussion; only asking for that passage itself, its source or its wording in the source language is a hunt for the words)`);
    else if (f.quotedBack) parts.push(`quotes these words: ${spans} — ${f.quotedBack} of the spans are the assistant's own words from its previous reply, quoted back; the rest are nearly always wording to find in the library (not when they are a term to explain or scare quotes)`);
    else parts.push(`quotes these words: ${spans} — quoted words are nearly always wording to find in the library (not when they are a term to explain or scare quotes)`);
  }
  if (f.script) parts.push(`written in ${f.script} script`);
  return `TURN: ${parts.join('; ')}.`;
}

/** The state every Jev decision reads: reader card, turn facts, then the recent conversation (last `turns`, `chars` each). */
export function jevState({ messages, card = null, turns = 4, chars = 800, clean = (s) => String(s || '') } = {}) {
  const f = turnFacts(messages);
  const history = (messages || []).slice(-turns).map((m) => `${m.role}: ${clean(m.content).slice(0, chars)}`).join('\n');
  return `READER: ${card || 'unknown — nothing is known about this person yet'}\n${describeTurn(f)}\nCONVERSATION:\n${history}`;
}
