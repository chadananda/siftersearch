// Anis canned replies — the gate's answers to messages that need no research: attacks, questions about Anís, thanks,
// feedback, off-topic, unclear, cut off. Written in the soul's voice (soul.md), zero LLM tokens. Each kind is a POOL,
// varied by a hash of the message, so refusals don't read as a fixed wall. The tarpit draws from these same pools and
// from NOTHING_FOUND (what research says when it finds nothing) — never from text of its own. Pure. Deps: none.
import { createHash } from 'node:crypto';

export const CANNED = {
  refuse: [
    "That's not something I can do. But if there's a passage, a person or a question from the sacred texts you're curious about, I'd be glad to look into it with you.",
    "I'll pass on that one. I'm here for the texts and the questions they raise — what would you like to explore?",
    "I can't help with that. What I love is reading the scriptures and histories with people — is there something there you've been wondering about?",
    "Not something I'll do, I'm afraid. Ask me about a teaching, a figure, or a passage, and I'll gladly go looking.",
  ],
  about_anis: [
    "I'm {name}, an AI companion for studying the world's sacred traditions. I can find a passage you half-remember, show what a text actually says beside what's commonly believed about it, trace a term or a person through the writings, and point you to the original. What are you curious about?",
    "I'm {name} — an AI, and a companion for anyone studying the scriptures and histories of the world's religions. I read with you from the library's own texts and always show my sources. Where would you like to start?",
  ],
  thanks: [
    "You're very welcome. Come back whenever a question is on your mind.",
    "Glad it helped. I'm here whenever you'd like to go further.",
    "My pleasure — it was a good question to think about.",
  ],
  feedback: [
    "Thank you for telling me — that helps me do better. If something I said was wrong, show me where and I'll look again.",
    "Thank you, I appreciate it. If there's anything you'd like me to look at again, just say so.",
  ],
  off_topic: [
    "That's outside what I can help with — I'm a companion for the world's sacred texts and their history. If a question there is on your mind, I'd love to explore it.",
    "I'm not the right one for that, I'm afraid. But if you're wondering about a teaching, a passage, or a figure from religious history, ask away.",
  ],
  unclear: [
    "I want to be sure I understand — could you say a little more about what you're looking for?",
    "Could you tell me a bit more? A name, a phrase you remember, or the question behind it would help me find the right texts.",
  ],
  cut_off: [
    "It looks like your message was cut off — could you send the rest?",
    "I think part of your message went missing. What were you going to ask?",
  ],
};

// What the research path says when nothing is found — the tarpit's other voice.
export const NOTHING_FOUND = [
  "I couldn't find anything in the library that speaks to that. Could you put it another way, or tell me where you came across it?",
  "I looked, but nothing in the texts I can search addresses that directly. If you have a phrase or a name, I'll try again.",
];

const pick = (pool, seed) => pool[parseInt(createHash('sha1').update(String(seed)).digest('hex').slice(0, 8), 16) % pool.length];

/** A canned reply for a gate kind, in the persona's name; seed varies the choice (message + day). */
export function cannedReply(kind, { name = 'Anís', seed = '' } = {}) {
  const pool = CANNED[kind] || CANNED.unclear;
  return pick(pool, `${kind}:${seed}`).replace(/\{name\}/g, name);
}

export const nothingFound = (seed = '') => pick(NOTHING_FOUND, seed);
