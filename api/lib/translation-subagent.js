// Translation subagent — produces English translations of Persian/Arabic/
// Hebrew passages, grounded in the CTAI JAFAR concordance for the corpus.
//
// Architecture:
//   1. Take source text
//   2. Call CTAI JAFAR API → per-word root + Shoghi Effendi rendering +
//      rendering_spectrum (every translation in the corpus, with counts)
//   3. Build LLM prompt with those terms as translation hints — SE renderings
//      privileged, corpus consensus shown
//   4. LLM produces translation that follows the historical concordance
//   5. Cache by content hash so repeated requests don't re-pay
//
// Why grounded translation (not generic ML translation):
//   The Bahá'í corpus has terminology choices made by Shoghi Effendi over
//   decades — "Manifestation" vs "Prophet", "ancient Beauty" vs "Divine
//   Reality". A generic translator misses these. Grounding in JAFAR's SE
//   concordance produces translations that read like SE's voice for terms
//   he handled, and like the corpus consensus for terms he didn't.

import { createHash } from 'crypto';
import OpenAI from 'openai';
import { logger } from './logger.js';
import { config } from './config.js';
import { query, queryOne } from './db.js';

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });
const TRANSLATION_MODEL = process.env.TRANSLATION_MODEL || 'gpt-4o-mini';

// ─── CTAI JAFAR ───────────────────────────────────────────────────────────

async function fetchJafar(text) {
  if (!config.ctai?.enabled) return null;
  const url = config.ctai.apiUrl || 'https://ctai.info/api/v1';
  const key = config.ctai.apiKey || process.env.CTAI_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${url}/jafar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ text, filter: false }),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'CTAI JAFAR request failed');
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn({ err: err.message }, 'CTAI JAFAR request error');
    return null;
  }
}

// Format JAFAR output as translation hints. SE renderings privileged; corpus
// spectrum shown for context. Stop words and unrooted terms dropped.
function formatJafarHints(jafar) {
  if (!jafar?.enriched_terms) return '';
  const lines = [];
  for (const t of jafar.enriched_terms) {
    if (t.is_stop) continue;
    if (!t.root && !t.se_rendering && !(t.rendering_spectrum?.length)) continue;
    const root = t.transliteration ? `[${t.transliteration}]` : '';
    const lit = t.literal ? ` literal: ${t.literal}` : '';
    const se = t.se_rendering ? ` — Shoghi Effendi: "${t.se_rendering}"` : '';
    const spec = (t.rendering_spectrum || [])
      .slice(0, 4)
      .map(s => `"${s.rendering}"${s.count ? `×${s.count}` : ''}`)
      .join(', ');
    const specStr = spec ? ` — corpus uses: ${spec}` : '';
    lines.push(`${t.term} ${root}${lit}${se}${specStr}`);
  }
  return lines.join('\n');
}

// ─── Cache ────────────────────────────────────────────────────────────────

function hashText(text, srcLang, tgtLang) {
  return createHash('sha256').update(`${srcLang}|${tgtLang}|${text}`).digest('hex');
}

async function getCached(textHash) {
  const row = await queryOne(
    `SELECT translation, jafar_terms_json, model FROM translation_cache WHERE text_hash = ?`,
    [textHash]
  );
  return row;
}

async function setCache({ textHash, sourceLang, targetLang, sourceText, translation, jafarTermsJson, model }) {
  try {
    await query(
      `INSERT OR REPLACE INTO translation_cache
        (text_hash, source_lang, target_lang, source_text, translation, jafar_terms_json, model)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [textHash, sourceLang, targetLang, sourceText, translation, jafarTermsJson, model]
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'translation_cache insert failed');
  }
}

// ─── Source-language detection (cheap, no API call) ──────────────────────

function detectSourceLang(text) {
  if (!text) return 'unknown';
  const sample = text.slice(0, 500);
  // Hebrew first (more distinctive script range than Arabic)
  if (/[\u0590-\u05FF]/.test(sample)) return 'he';
  // Arabic script covers both Arabic and Persian — distinguish by Persian-only
  // characters گ چ پ ژ
  if (/[\u067E\u0686\u06AF\u0698]/.test(sample)) return 'fa';
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(sample)) return 'ar';
  return 'en';
}

// ─── Translation ─────────────────────────────────────────────────────────

const TRANSLATION_SYSTEM = `You are translating a passage from a Bahá'í, Islamic, or related religious text into ${'${target_language}'}.

You have access to the JAFAR concordance below — per-word root analysis with Shoghi Effendi's specific rendering when known, plus the spectrum of renderings used elsewhere in the corpus.

Rules:
- When Shoghi Effendi has a rendering for a term, use it. He is the authoritative translator for the Bahá'í corpus.
- When SE has no rendering but the corpus has clear preferred terms, follow the corpus consensus.
- Match register: dignified, devotional, classical English. Not modern colloquial.
- Transliterate proper names (Bahá'u'lláh, ʿAbdu'l-Bahá, Mullá Ḥusayn) — don't translate them.
- For Quranic/Biblical references, use the standard English form (peace be upon him, etc.).
- Output ONLY the English translation. No commentary, no notes, no header.`;

/**
 * Translate a passage with JAFAR-grounded prompting.
 *
 * @param {object} opts
 * @param {string} opts.text — source text (Persian/Arabic/Hebrew)
 * @param {string} [opts.target_lang='en']
 * @param {string} [opts.source_lang] — auto-detected if omitted
 * @param {string} [opts.work_context] — e.g. "from Bahá'u'lláh's Hidden Words" — helps the LLM match register
 * @param {boolean} [opts.use_cache=true]
 * @returns {Promise<{translation, source_text, source_lang, target_lang, jafar_terms, cached, model}>}
 */
export async function translatePassage({
  text,
  target_lang = 'en',
  source_lang,
  work_context,
  use_cache = true
} = {}) {
  if (!text || !text.trim()) {
    throw new Error('translatePassage: text is required');
  }
  const srcLang = source_lang || detectSourceLang(text);
  const textHash = hashText(text, srcLang, target_lang);

  // 1. Cache check
  if (use_cache) {
    const cached = await getCached(textHash);
    if (cached) {
      logger.info({ textHash, srcLang }, 'translation_cache: HIT');
      return {
        translation: cached.translation,
        source_text: text,
        source_lang: srcLang,
        target_lang,
        jafar_terms: cached.jafar_terms_json ? JSON.parse(cached.jafar_terms_json) : null,
        cached: true,
        model: cached.model
      };
    }
  }

  // 2. JAFAR (skip for English passages — JAFAR is for Arabic/Persian/Hebrew)
  const jafar = (srcLang === 'en' || srcLang === 'unknown') ? null : await fetchJafar(text);
  const jafarHints = jafar ? formatJafarHints(jafar) : '';

  // 3. LLM translation
  const systemPrompt = TRANSLATION_SYSTEM.replace('${target_language}', target_lang === 'en' ? 'English' : target_lang)
    + (jafarHints ? `\n\nJAFAR concordance for this passage:\n${jafarHints}` : '')
    + (work_context ? `\n\nWork context: ${work_context}` : '');

  const completion = await openai.chat.completions.create({
    model: TRANSLATION_MODEL,
    max_tokens: Math.max(1500, Math.ceil(text.length / 2)),
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ]
  });

  const translation = completion.choices?.[0]?.message?.content?.trim() || '';

  // 4. Cache
  if (use_cache && translation) {
    await setCache({
      textHash,
      sourceLang: srcLang,
      targetLang: target_lang,
      sourceText: text,
      translation,
      jafarTermsJson: jafar ? JSON.stringify(jafar.enriched_terms?.slice(0, 50) || []) : null,
      model: TRANSLATION_MODEL
    });
  }

  return {
    translation,
    source_text: text,
    source_lang: srcLang,
    target_lang,
    jafar_terms: jafar?.enriched_terms?.slice(0, 50) || null,
    cached: false,
    model: TRANSLATION_MODEL
  };
}

/**
 * For a list of passages, translate each (with caching). Used by the
 * document subagent when it has multiple non-English excerpts to return.
 */
export async function translateMany(passages, options = {}) {
  const results = [];
  for (const p of passages) {
    try {
      const r = await translatePassage({ text: p.text, ...options });
      results.push({ ...p, translation: r.translation, source_lang: r.source_lang });
    } catch (err) {
      logger.warn({ err: err.message, text: (p.text || '').slice(0, 60) }, 'translateMany: passage failed');
      results.push({ ...p, translation: null, translation_error: err.message });
    }
  }
  return results;
}
