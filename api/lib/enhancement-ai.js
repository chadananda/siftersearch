/**
 * Enhancement AI — prompt builders, response parsers, and local LLM client for RAG enhancement.
 * :arch: All enhancement runs on local vLLM (OpenAI-compatible) via LOCAL_LLM endpoint. $0 cost.
 * :why: Anthropic too expensive for 2.57M passages. Local prefix caching gives same speed benefit.
 * :deps: config.localLlm for endpoint/model | ai-services.logAIUsage for tracking
 */

import { config } from './config.js';
import { logger } from './logger.js';

// ~80 words ≈ 100 tokens; used to truncate verbose disambiguation responses
const MAX_DISAMBIGUATION_WORDS = 80;
// How many preceding paragraphs to include in the sliding window
const WINDOW_SIZE = 20;

/**
 * Build system + user prompts for paragraph disambiguation.
 * Includes ~20 preceding paragraphs as context window, document metadata, and entities.
 */
/**
 * Build a JUMPING WINDOW for disambiguation.
 *
 * Strategy: Load N paragraphs into the system prompt (cached by vLLM's KV cache).
 * Disambiguate the BACK HALF of the window (paragraphs that have full preceding context).
 * Then JUMP: next window starts from the midpoint of the current window.
 *
 * For a window of 20 paragraphs:
 *   Window 1: [P1-P20] → disambiguate P11-P20 (10 calls, same prefix)
 *   Window 2: [P11-P30] → disambiguate P21-P30 (10 calls, same prefix)
 *   Window 3: [P21-P40] → disambiguate P31-P40 ...
 *
 * The system prompt (instructions + metadata + entities + window text) is
 * IDENTICAL for all paragraphs in the same window → prefix cached.
 * Only the user prompt changes: "Disambiguate [P15]:" (~5 tokens).
 *
 * With 2TB NVMe KV cache, the full window stays cached across all calls.
 */

const JUMP_WINDOW_SIZE = 20;  // paragraphs per window
const JUMP_DISAMBIG_START = 10; // start disambiguating from this index in window (0-based)
const MAX_WINDOW_CHARS = 6000; // hard limit for token safety

/**
 * Build a jumping window: system prompt with the full window embedded (cached),
 * plus a tiny user prompt for each paragraph to disambiguate.
 */
export function buildJumpingWindow(doc, entities, windowParagraphs) {
  const { title, author, religion, collection, year, description, language } = doc;
  const metaLines = [`"${title}" by ${author}`, `${religion} / ${collection}`];
  if (year) metaLines.push(`Year: ${year}`);
  if (language && language !== 'en') metaLines.push(`Language: ${language}`);
  if (description) metaLines.push(`About: ${description.slice(0, 300)}`);
  const metaBlock = metaLines.join('\n');
  const entityLines = [];
  if (entities?.people?.length) entityLines.push(`People: ${entities.people.join(', ')}`);
  if (entities?.organizations?.length) entityLines.push(`Organizations: ${entities.organizations.join(', ')}`);
  if (entities?.concepts?.length) entityLines.push(`Concepts: ${entities.concepts.join(', ')}`);
  if (entities?.time_periods?.length) entityLines.push(`Time periods: ${entities.time_periods.join(', ')}`);
  const entitySection = entityLines.length ? `\nEntities:\n${entityLines.join('\n')}` : '';

  // Build window text — trim to stay under char budget
  let windowText = '';
  let includedCount = 0;
  for (const p of windowParagraphs) {
    const line = `[P${includedCount + 1}] ${p.text}\n`;
    if (windowText.length + line.length > MAX_WINDOW_CHARS && includedCount > 0) break;
    windowText += line;
    includedCount++;
  }

  // System prompt: metadata + window text. Instructions go in user prompt so
  // the SAME cached window serves both disambiguation AND HyPE tasks.
  const systemPrompt = `${metaBlock}${entitySection}

<window>
${windowText}</window>`;

  return { systemPrompt, includedCount };
}

/**
 * Build user prompts for disambiguation and HyPE. Instructions go HERE (not in system prompt)
 * so the window in the system prompt stays cached across both tasks.
 */
export function buildDisambiguationUserPrompt(paragraphIndex) {
  return `Disambiguate [P${paragraphIndex}]. Output ONLY key→value pairs.
FORMAT: ref→resolved | ref→resolved
Resolve: pronouns, conceptual refs, temporal, spatial, short names→full names.
Use ONLY the document text above. No general knowledge. NONE if nothing to resolve.`;
}

export function buildHyPEUserPrompt(paragraphIndex, religion) {
  return `Generate exactly 5 questions [P${paragraphIndex}] answers. One per line. No numbering.
2 factual (what does it say?), 1 definitional (what concept does it define?), 2 implication (philosophical/spiritual implications).
Max 15 words per question.${religion ? ` Domain: ${religion}` : ''}`;
}

/**
 * Legacy API — still used by tests. Builds a single prompt pair.
 */
export function buildDisambiguationSystemPrompt(doc, entities) {
  const { systemPrompt } = buildJumpingWindow(doc, entities, []);
  return systemPrompt;
}

export function buildDisambiguationPrompt(doc, entities, paragraphs, targetIndex) {
  const windowParas = paragraphs.filter(p => p.paragraph_index <= targetIndex).slice(-JUMP_WINDOW_SIZE);
  const targetPos = windowParas.findIndex(p => p.paragraph_index === targetIndex) + 1;
  const { systemPrompt } = buildJumpingWindow(doc, entities, windowParas);
  const userPrompt = `Disambiguate [P${targetPos}]:`;
  return { systemPrompt, userPrompt };
}

/**
 * Parse a disambiguation response from the LLM.
 * Accepts both terse key→value format and prose. Truncates verbose responses.
 * Returns null for empty/missing/NONE input.
 */
export function parseDisambiguationResponse(response) {
  if (!response) return null;
  let trimmed = response.trim();
  // Strip any remaining think tags
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
  if (!trimmed || trimmed === 'NONE') return null;
  // Truncate verbose responses
  const words = trimmed.split(/\s+/);
  if (words.length <= MAX_DISAMBIGUATION_WORDS) return trimmed;
  return words.slice(0, MAX_DISAMBIGUATION_WORDS).join(' ');
}

/**
 * Build prompt for HyPE question generation. Ultra-terse output format.
 * Generates 3 types: factual, definitional, philosophical implication.
 */
export function buildHyPEPrompt(passage, context, doc) {
  const bookContext = doc ? `Book: "${doc.title}" by ${doc.author} (${doc.religion}/${doc.collection})${doc.description ? '\nAbout: ' + doc.description.slice(0, 200) : ''}` : '';
  const systemPrompt = `Generate exactly 5 questions this passage answers. One per line. No numbering. No preamble.

Types needed:
- 2 factual (what does it say?)
- 1 definitional (what concept does it define/explain?)
- 2 implication (what are the philosophical/spiritual implications?)

Max 15 words per question.
${bookContext}`;
  const userPrompt = `${passage.text}${context ? '\nContext: ' + context : ''}`;
  return { systemPrompt, userPrompt };
}

/**
 * Build prompt for entity extraction. JSON output, terse.
 */
export function buildEntityPrompt(docText, doc) {
  const bookInfo = doc ? `"${doc.title}" by ${doc.author} (${doc.religion}/${doc.collection})${doc.description ? '. ' + doc.description.slice(0, 200) : ''}` : '';
  const systemPrompt = `Extract key entities from this text: ${bookInfo}
Return ONLY JSON:
{"people":["name (dates, role)"],"organizations":["name"],"concepts":["term (brief definition)"],"time_periods":["period"]}
Be terse. Max 5 per category. No prose.`;
  const userPrompt = docText.slice(0, 3000);
  return { systemPrompt, userPrompt };
}

/**
 * Parse a HyPE (hypothetical questions) response from the LLM.
 * Strips numbering/bullets and returns an array of question strings, or null if empty.
 */
export function parseHyPEResponse(response) {
  if (!response) return null;
  const trimmed = response.trim();
  if (!trimmed) return null;
  const questions = trimmed
    .split('\n')
    .map(line => line.replace(/^[\d]+\.\s*/, '').replace(/^[-•*]\s*/, '').trim())
    .filter(line => line.length > 0);
  return questions.length ? questions : null;
}

/**
 * Parse an entity extraction JSON response from the LLM.
 * Handles markdown code fences; returns null for unparseable input.
 */
export function parseEntityResponse(response) {
  if (!response) return null;
  const trimmed = response.trim();
  if (!trimmed) return null;
  // Strip markdown code fences
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      people: Array.isArray(parsed.people) ? parsed.people : [],
      organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
      concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
      time_periods: Array.isArray(parsed.time_periods) ? parsed.time_periods : []
    };
  } catch {
    return null;
  }
}

/**
 * Build an enhanced Meilisearch document from a content paragraph with enhancement fields.
 * hyp_questions is stored as the raw joined string, not JSON.
 */
/**
 * Call local LLM (OpenAI-compatible endpoint) for enhancement tasks.
 * Uses LOCAL_LLM env var. Prefix caching handled by vLLM's LMCache layer.
 * Returns the assistant message content string, or null on failure.
 */
export async function callLocalLLM(systemPrompt, userPrompt, options = {}) {
  const endpoint = config.localLlm?.endpoint || 'http://localhost:8000/v1';
  const model = options.model || config.localLlm?.model || 'Qwen/Qwen3-32B-AWQ';
  const maxTokens = options.maxTokens || 100; // Terse output — every token costs time on local LLM
  const temperature = options.temperature ?? 0.3;
  const callStart = Date.now();
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature,
        chat_template_kwargs: { enable_thinking: false } // Disable Qwen3 thinking mode for terse output
      }),
      signal: globalThis.AbortSignal?.timeout?.(options.timeout || 120000) // 2min — local LLM is slow
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.warn({ status: response.status, endpoint, error: errBody.slice(0, 200) }, 'Local LLM request failed');
      if (options.throwOnError) {
        const e = new Error(`Local LLM HTTP ${response.status}: ${errBody.slice(0, 200)}`);
        e.status = response.status;
        throw e;
      }
      return null;
    }
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    // Strip Qwen3 <think>...</think> reasoning tags — greedy and non-greedy
    if (content && content.includes('<think>')) {
      // First try to strip complete think blocks
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      // If unclosed <think> remains (truncated by max_tokens), strip everything from <think> onward
      if (content.includes('<think>')) {
        content = content.replace(/<think>[\s\S]*/g, '').trim();
      }
      // If content starts with thinking that was already stripped, it may be empty
      if (!content) return null;
    }
    // Log usage with timing for prefix/KV cache analysis
    const callMs = Date.now() - callStart;
    const usage = data.usage || {};
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;
    const totalPrompt = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const tokensPerSec = callMs > 0 ? Math.round((totalPrompt + completionTokens) / (callMs / 1000)) : 0;
    logger.debug({
      callMs,
      promptTokens: totalPrompt,
      cachedTokens,
      completionTokens,
      tokensPerSec,
      systemPromptLen: systemPrompt.length,
      userPromptLen: userPrompt.length
    }, 'Local LLM call');
    // Return content + usage metadata
    if (options.returnUsage) {
      return { content: content || null, usage: { callMs, promptTokens: totalPrompt, cachedTokens, completionTokens, tokensPerSec } };
    }
    return content || null;
  } catch (err) {
    logger.warn({ err: err.message, endpoint }, 'Local LLM call error');
    // Opt-in: surface network/timeout errors so callers can retry with backoff.
    // Default stays null to preserve legacy fire-and-forget callers.
    if (options.throwOnError) throw err;
    return null;
  }
}

/**
 * Health check for local LLM endpoint.
 */
export async function localLLMHealthCheck() {
  const endpoint = config.localLlm?.endpoint || 'http://localhost:8000/v1';
  try {
    const res = await fetch(`${endpoint}/models`, { signal: globalThis.AbortSignal?.timeout?.(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build an enhanced Meilisearch document from a content paragraph with enhancement fields.
 * hyp_questions is stored as the raw joined string, not JSON.
 */
export function buildEnhancedDocument(paragraph) {
  const {
    id, doc_id, paragraph_index, text, context, hyp_questions,
    heading, blocktype, title, author, religion, collection,
    language, year, authority, tier
  } = paragraph;
  // Normalize hyp_questions to a plain string for indexing
  let hypQuestionsStr = hyp_questions;
  if (hypQuestionsStr && hypQuestionsStr.startsWith('[')) {
    try {
      const arr = JSON.parse(hypQuestionsStr);
      if (Array.isArray(arr)) hypQuestionsStr = arr.join(' ');
    } catch { /* leave as-is */ }
  }
  return {
    id,
    doc_id,
    paragraph_index,
    text,
    context,
    hyp_questions: hypQuestionsStr,
    heading,
    blocktype,
    title,
    author,
    religion,
    collection,
    language,
    year,
    authority,
    tier
  };
}
