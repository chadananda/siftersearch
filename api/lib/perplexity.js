// Perplexity web-search fallback for Jafar. When library retrieval comes back EMPTY
// (including quote-source lookups that miss), the pipeline may consult the web via
// Perplexity's sonar model so the user still gets a real answer — clearly attributed
// as web information, never dressed up as library citations.
// Fail-closed: no PERPLEXITY_API_KEY → returns null → behavior unchanged.
import { logger } from './logger.js';

const PPLX_URL = 'https://api.perplexity.ai/chat/completions';
const TIMEOUT_MS = 20000;

export function perplexityAvailable() {
  return !!process.env.PERPLEXITY_API_KEY;
}

/**
 * Ask Perplexity (sonar) the user's question. Returns { text, citations } or null
 * on any failure — the fallback must never break the chat pipeline.
 */
export async function perplexityFallback(question) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(PPLX_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'Answer concisely and factually. When identifying the source of a quotation, name the work, author, and where it appears.' },
          { role: 'user', content: String(question).slice(0, 2000) }
        ],
        max_tokens: 600,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!r.ok) {
      logger.warn({ status: r.status }, 'perplexity fallback: non-OK response');
      return null;
    }
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || '';
    // API surfaces sources as `citations` (URL list) and/or `search_results` (objects).
    const citations = (j.search_results || []).map((s) => ({ title: s.title || s.url, url: s.url }))
      .concat((j.citations || []).filter((u) => typeof u === 'string').map((u) => ({ title: u, url: u })))
      .filter((c, i, a) => c.url && a.findIndex((x) => x.url === c.url) === i)
      .slice(0, 6);
    if (!text.trim()) return null;
    logger.info({ chars: text.length, sources: citations.length }, 'perplexity fallback answered');
    return { text, citations };
  } catch (err) {
    logger.warn({ err: err.message }, 'perplexity fallback failed');
    return null;
  }
}
