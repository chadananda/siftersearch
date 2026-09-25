// Infer a search scope from the CONVERSATION, not just the latest turn.
//
// "If the context of the conversation is buddhism, why search the entire library?" — today nothing infers a
// tradition at all: `religion` only arrives in the model's tool args, and internal search calls often pass
// none, so every turn pays the unconstrained cost (7.35s and the wrong tradition) unless the model remembers.
//
// Jev (TypeSafe System One) is the right instrument: a typed CHOICE in ~150ms with a calibrated confidence,
// no prose, output tokens free. Measured on 124 real questions from the logs: 124/124 classified, median
// 150ms, p95 347ms, zero errors.
//
// TWO RULES, both learned the hard way in this codebase:
//  1. FAIL OPEN. Low confidence → no constraint. A wrong narrow silently hides most of the corpus and reads
//     as "the corpus does not have it"; a missing narrow only costs latency.
//  2. A COMPARATIVE QUESTION IS NEVER NARROWED. "How does the concept of the self differ across Buddhism and
//     Hinduism?" (5% of real traffic) must see both traditions. Constraining it would answer a different
//     question while looking correct.
//
// Deps: fetch, TYPESAFE_API_KEY. Relaxation policy lives in search-scope.js.
import { logger } from './logger.js';

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
// Below this, treat the signal as absent rather than acting on a coin-flip.
export const MIN_CONFIDENCE = 0.6;

export const TRADITIONS = {
  "Baha'i": 'Bahá’í writings — Bahá’u’lláh, the Báb, ‘Abdu’l-Bahá, Shoghi Effendi, Bahá’í history',
  Islam: 'Qur’án, hadith, Islamic tradition',
  Christian: 'Bible, Gospels, Christian tradition',
  Judaism: 'Torah, Talmud, Jewish tradition',
  Buddhist: 'Sutras, Pali Canon, Buddhist tradition',
  Hindu: 'Vedas, Upanishads, Bhagavad Gita, Hindu tradition',
  Zoroastrian: 'Gathas, Avesta, Zoroastrian tradition',
  Sikh: 'Guru Granth Sahib, Sikh tradition',
  Tao: 'Tao Te Ching, Taoist tradition',
  Confucian: 'Analects, Confucian tradition',
  none: 'No single tradition — the question spans traditions, compares them, or names none',
};

/**
 * @param {Array<{role,content}>} messages  the thread; the last few turns carry the context
 * @returns {Promise<{religion?: string, comparative: boolean, confidence: number, ms: number}>}
 */
export async function extractScope(messages, { apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = 2000 } = {}) {
  const empty = { comparative: false, confidence: 0, ms: 0 };
  if (!apiKey) return empty;
  // The CONVERSATION is the state — a follow-up like "and what about compassion?" carries no tradition of
  // its own, which is the whole reason this reads more than the last turn.
  const state = (messages || []).slice(-6)
    .map((m) => `${m.role}: ${String(m.content || '').slice(0, 600)}`).join('\n');
  if (!state.trim()) return empty;

  const t0 = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions: {
          tradition: {
            type: 'choice',
            instructions: 'Which single tradition should a library search be limited to, given this conversation? Answer "none" if it spans or compares traditions, or names none.',
            criteria: TRADITIONS,
          },
          comparative: {
            type: 'noul',
            instructions: 'Is this asking to COMPARE or CONTRAST two or more traditions, authors or works? A question answerable from one tradition alone is not comparative.',
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (!res.ok) { logger.warn({ status: res.status }, 'scope-extract: jev non-ok'); return { ...empty, ms }; }
    const j = await res.json();
    const t = j.answers?.tradition;
    const choice = t?.choice ?? t?.value ?? null;
    const confidence = t?.confidence ?? (t?.distribution?.[choice] ?? 0);
    const comparative = (j.answers?.comparative?.noul ?? 0) > 0.5;

    // Fail open on every uncertain path.
    if (comparative || !choice || choice === 'none' || confidence < MIN_CONFIDENCE) {
      return { comparative, confidence, ms };
    }
    return { religion: choice, comparative: false, confidence, ms };
  } catch (err) {
    // A scope hint is an optimisation; never let it break a search.
    logger.warn({ err: err.message }, 'scope-extract failed — searching unconstrained');
    return { ...empty, ms: Date.now() - t0 };
  }
}
