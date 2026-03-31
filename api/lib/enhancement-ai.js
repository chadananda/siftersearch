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
export function buildDisambiguationPrompt(doc, entities, paragraphs, targetIndex) {
  const { title, author, religion, collection, year } = doc;
  // Build entity lines
  const entityLines = [];
  if (entities?.people?.length) entityLines.push(`People: ${entities.people.join(', ')}`);
  if (entities?.organizations?.length) entityLines.push(`Organizations: ${entities.organizations.join(', ')}`);
  if (entities?.concepts?.length) entityLines.push(`Concepts: ${entities.concepts.join(', ')}`);
  if (entities?.time_periods?.length) entityLines.push(`Time periods: ${entities.time_periods.join(', ')}`);
  const entitySection = entityLines.length
    ? `\n\nKey entities in this document:\n${entityLines.join('\n')}`
    : '';
  // Collect preceding paragraphs sorted by index, up to WINDOW_SIZE
  const preceding = paragraphs
    .filter(p => p.paragraph_index < targetIndex)
    .sort((a, b) => a.paragraph_index - b.paragraph_index)
    .slice(-WINDOW_SIZE);
  const targetParagraph = paragraphs.find(p => p.paragraph_index === targetIndex)
    || { text: '' };
  // Build window lines
  const windowLines = preceding.map((p, i) => `[P${i + 1}] ${p.text}`).join('\n');
  const targetLine = `[TARGET] ${targetParagraph.text}`;
  const systemPrompt = `Disambiguate references in sacred texts. Output ONLY key→value pairs.

Doc: "${title}" by ${author} | ${religion} / ${collection} | ${year}${entitySection}

FORMAT: ref→resolved | ref→resolved | ref→resolved
EXAMPLE: He→Mullá Husayn | the city→Shíráz, Iran | dawn→May 23, 1844

Resolve: pronouns, conceptual refs (this teaching, that station), temporal, spatial, textual refs.
Use ONLY document text. No general knowledge. No prose. No explanation. Just key→value pairs.
If nothing needs disambiguation, output: NONE

${windowLines}

${targetLine}`;
  const userPrompt = `Disambiguate [TARGET]:`;
  return { systemPrompt, userPrompt };
}

/**
 * Parse a disambiguation response from the LLM.
 * Accepts both terse key→value format and prose. Truncates verbose responses.
 * Returns null for empty/missing/NONE input.
 */
export function parseDisambiguationResponse(response) {
  if (!response) return null;
  const trimmed = response.trim();
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
  const systemPrompt = `Generate exactly 5 questions this passage answers. One per line. No numbering. No preamble.

Types needed:
- 2 factual (what does it say?)
- 1 definitional (what concept does it define/explain?)
- 2 implication (what are the philosophical/spiritual implications?)

Max 15 words per question. ${doc?.religion ? `Domain: ${doc.religion}` : ''}`;
  const userPrompt = `${passage.text}${context ? '\nContext: ' + context : ''}`;
  return { systemPrompt, userPrompt };
}

/**
 * Build prompt for entity extraction. JSON output, terse.
 */
export function buildEntityPrompt(docText, doc) {
  const systemPrompt = `Extract key entities from this ${doc?.religion || ''} text. Return ONLY JSON:
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
      logger.warn({ status: response.status, endpoint }, 'Local LLM request failed');
      return null;
    }
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    // Strip Qwen3 <think>...</think> reasoning tags if present
    if (content && content.includes('<think>')) {
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }
    // Log usage for tracking (cost = 0 for local)
    const usage = data.usage || {};
    logger.debug({
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cacheHit: usage.prompt_tokens_details?.cached_tokens > 0
    }, 'Local LLM call');
    return content || null;
  } catch (err) {
    logger.warn({ err: err.message, endpoint }, 'Local LLM call error');
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
