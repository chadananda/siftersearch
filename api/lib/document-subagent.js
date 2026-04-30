// Document QA subagent. Reads ONE document carefully on the orchestrator's
// behalf so the main pipeline doesn't have to dump 250 paragraphs into
// crafter context. Has scoped tools (outline / search-in-doc / read-range)
// and runs a small tool-calling loop until it can answer.
// Deps: openai, executeSearch (passages+read modes), queryOne, queryAll

import OpenAI from 'openai';
import { logger } from './logger.js';
import { config } from './config.js';
import { queryOne, queryAll } from './db.js';
import { executeSearch } from '../routes/chat.js';

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

const SUBAGENT_MODEL = process.env.DOC_SUBAGENT_MODEL || 'gpt-4o-mini';
const MAX_ITERATIONS = 8;

const SUBAGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_outline',
      description: 'Get a structural outline of the document: title, author, total paragraphs, headings, and the first few paragraphs as preview. Always call this first to orient yourself.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_in_document',
      description: 'Semantic + keyword search restricted to this document. Returns the top matching paragraphs ranked by relevance. Use this to find passages that address a specific concept or phrase.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Concept or phrase to search for' },
          limit: { type: 'integer', description: 'Max results (default 8, cap 20)', default: 8 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_paragraph_range',
      description: 'Read a contiguous range of paragraphs from the document by paragraph_index. Use to read the opening, follow context around a search hit, or read short docs end-to-end. Cap is 150 paragraphs per call — for a tiny doc, one call is usually enough; for medium docs, call twice covering halves.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'integer', description: 'Inclusive start paragraph_index' },
          count: { type: 'integer', description: 'How many paragraphs to read (cap 150)', default: 30 }
        },
        required: ['start', 'count']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Call this when you have enough material to answer. Provide your answer and the most relevant excerpts.',
      parameters: {
        type: 'object',
        properties: {
          answer: { type: 'string', description: 'Concise answer (1-3 sentences) grounded in the document. If the document does not address the question, say so plainly.' },
          excerpts: {
            type: 'array',
            description: '3-5 most relevant verbatim excerpts',
            items: {
              type: 'object',
              properties: {
                paragraph_index: { type: 'integer' },
                text: { type: 'string' }
              },
              required: ['paragraph_index', 'text']
            }
          }
        },
        required: ['answer', 'excerpts']
      }
    }
  }
];

async function buildOutline(document_id, paragraphRange) {
  const doc = await queryOne(
    'SELECT id, title, author, religion, collection, year, description FROM docs WHERE id = ? AND deleted_at IS NULL',
    [document_id]
  );
  if (!doc) return { error: 'Document not found' };

  const where = paragraphRange
    ? 'doc_id = ? AND paragraph_index >= ? AND paragraph_index <= ? AND deleted_at IS NULL'
    : 'doc_id = ? AND deleted_at IS NULL';
  const params = paragraphRange
    ? [document_id, paragraphRange.start, paragraphRange.end]
    : [document_id];

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS n, MIN(paragraph_index) AS lo, MAX(paragraph_index) AS hi, COALESCE(SUM(LENGTH(text)), 0) AS chars FROM content WHERE ${where}`,
    params
  );
  const total = totalRow?.n || 0;
  if (total === 0) return { error: 'Document is empty or unreadable' };
  // ~4 chars per token. Conservative for English, slight over-estimate for
  // dense scripture (Iqán averages ~3.5). Good enough for budget decisions.
  const estimatedTokens = Math.ceil((totalRow.chars || 0) / 4);

  // Headings (limit 30 — enough to navigate, doesn't blow context)
  const headings = await queryAll(
    `SELECT paragraph_index, heading FROM content WHERE ${where} AND heading IS NOT NULL AND heading != '' ORDER BY paragraph_index LIMIT 30`,
    params
  );

  // Preview: first 3 paragraphs
  const previewRows = await queryAll(
    `SELECT paragraph_index, text, heading FROM content WHERE ${where} ORDER BY paragraph_index LIMIT 3`,
    params
  );

  return {
    document: { id: doc.id, title: doc.title, author: doc.author, religion: doc.religion, collection: doc.collection, year: doc.year },
    total_paragraphs: total,
    estimated_tokens: estimatedTokens,
    paragraph_range: { start: totalRow.lo, end: totalRow.hi },
    headings: headings.map(h => ({ paragraph_index: h.paragraph_index, heading: h.heading })),
    preview: previewRows.map(p => ({
      paragraph_index: p.paragraph_index,
      heading: p.heading || null,
      text: (p.text || '').slice(0, 600)
    }))
  };
}

async function searchInDocument(document_id, query, limit) {
  const safeLimit = Math.min(Math.max(limit || 8, 1), 20);
  const result = await executeSearch({ query, mode: 'passages', document_id, limit: safeLimit });
  if (result?.error) return { error: result.error };
  return {
    hits: (result.passages || []).map(p => ({
      paragraph_index: p.paragraph_index,
      heading: p.heading || null,
      text: (p.text || '').slice(0, 800)
    }))
  };
}

async function readParagraphRange(document_id, start, count, paragraphRange) {
  const safeCount = Math.min(Math.max(count || 30, 1), 150);
  let lo = start;
  let hi = start + safeCount - 1;
  if (paragraphRange) {
    lo = Math.max(lo, paragraphRange.start);
    hi = Math.min(hi, paragraphRange.end);
  }
  const rows = await queryAll(
    `SELECT paragraph_index, text, heading FROM content
     WHERE doc_id = ? AND paragraph_index >= ? AND paragraph_index <= ?
       AND deleted_at IS NULL ORDER BY paragraph_index`,
    [document_id, lo, hi]
  );
  return {
    paragraphs: rows.map(p => ({
      paragraph_index: p.paragraph_index,
      heading: p.heading || null,
      text: (p.text || '').slice(0, 1200)
    }))
  };
}

function buildSystemPrompt(doc, paragraphRange) {
  const rangeNote = paragraphRange
    ? `\nIMPORTANT: This is a SUB-SECTION of a larger compilation, paragraphs ${paragraphRange.start}-${paragraphRange.end}. Stay within that range.`
    : '';
  return `You are a research assistant reading a single document to answer the user's question.

Document: "${doc.title}"${doc.author ? ` by ${doc.author}` : ''}${doc.year ? ` (${doc.year})` : ''}${rangeNote}

You have three tools:
- get_outline: ALWAYS call first. Tells you total paragraphs, headings, and a preview.
- search_in_document: semantic search inside this document. Use to find relevant passages.
- read_paragraph_range: read a contiguous slice. Use for "read the opening", short docs (≤40 paragraphs read whole), or expanding around a search hit.

Strategy:
1. Call get_outline first to orient yourself. The outline returns estimated_tokens for the document (or sub-range).
2. If estimated_tokens ≤ 25000 (a small document), just read the whole thing — call read_paragraph_range once or twice covering the full range. Cheaper and more accurate than searching, because you can see context.
3. Otherwise, search_in_document semantically (embeddings, not keyword). One well-phrased conceptual query usually finds the relevant section. If the first search misses, try a re-phrasing of the same concept rather than the same words.
4. Read_paragraph_range around the best hits to get surrounding context (the paragraphs immediately before/after).
5. Call finish with a concise answer (1-3 sentences) and 3-5 verbatim excerpts.

Critical:
- Use ONLY this document. Do NOT use general knowledge.
- Verify your excerpts actually answer the user's specific question — not just thematically adjacent material. If the best hits don't address the concept, search again with a different phrasing of the same idea.
- If after several searches you cannot find passages addressing the question, plainly say in your answer "This document does not appear to discuss that specifically." — do not pretend related material is the answer.
- Quote VERBATIM. Paragraph_index in excerpts must match what the tools returned.
- You have up to ${MAX_ITERATIONS} tool calls.`;
}

function buildContextSummary(conversationMessages, currentQuestion) {
  // The pipeline passes the full message history including the latest user turn.
  // Strip system msgs and drop the trailing user message (it's `currentQuestion`).
  const filtered = conversationMessages.filter(m => m.role !== 'system');
  const earlier = filtered.length > 0 && filtered[filtered.length - 1].role === 'user'
    ? filtered.slice(0, -1)
    : filtered;
  const recent = earlier.slice(-4);
  const contextLines = recent
    .map(m => `${m.role.toUpperCase()}: ${(m.content || '').slice(0, 400)}`)
    .join('\n');
  return `${contextLines ? `Conversation so far:\n${contextLines}\n\n` : ''}Current question: ${currentQuestion}`;
}

export async function answerFromDocument({
  document_id,
  question,
  conversation_messages = [],
  start_paragraph = null,
  end_paragraph = null,
  sendEvent = null,
  debug = false
} = {}) {
  const t0 = Date.now();
  const paragraphRange = (typeof start_paragraph === 'number' && typeof end_paragraph === 'number')
    ? { start: start_paragraph, end: end_paragraph }
    : null;

  // Pre-fetch metadata so the system prompt can name the doc up front
  const meta = await queryOne(
    'SELECT id, title, author, religion, collection, year FROM docs WHERE id = ? AND deleted_at IS NULL',
    [document_id]
  );
  if (!meta) {
    return { error: 'Document not found', document: null, paragraphs_read: 0, excerpts: [] };
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(meta, paragraphRange) },
    { role: 'user', content: buildContextSummary(conversation_messages, question) }
  ];

  let finalAnswer = null;
  let finalExcerpts = [];
  let toolCallsLog = [];
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    let resp;
    try {
      resp = await openai.chat.completions.create({
        model: SUBAGENT_MODEL,
        messages,
        tools: SUBAGENT_TOOLS,
        tool_choice: 'required',
        temperature: 0.1
      });
    } catch (err) {
      logger.error({ err: err.message, document_id }, 'document subagent OpenAI call failed');
      break;
    }

    const choice = resp.choices?.[0];
    const calls = choice?.message?.tool_calls || [];
    if (calls.length === 0) break;

    messages.push(choice.message);

    let finished = false;
    for (const call of calls) {
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* ignore */ }
      if (debug) toolCallsLog.push({ name, args });
      if (sendEvent) sendEvent({ type: 'debug_subagent_call', document_id, name, args });

      let result;
      try {
        if (name === 'get_outline') {
          result = await buildOutline(document_id, paragraphRange);
        } else if (name === 'search_in_document') {
          result = await searchInDocument(document_id, args.query, args.limit);
          if (sendEvent) sendEvent({
            type: 'debug_subagent_search_result',
            query: args.query,
            hits: (result?.hits || []).slice(0, 5).map(h => ({
              paragraph_index: h.paragraph_index,
              text: (h.text || '').slice(0, 120)
            }))
          });
        } else if (name === 'read_paragraph_range') {
          result = await readParagraphRange(document_id, args.start, args.count, paragraphRange);
        } else if (name === 'finish') {
          finalAnswer = typeof args.answer === 'string' ? args.answer : '';
          finalExcerpts = Array.isArray(args.excerpts) ? args.excerpts : [];
          finished = true;
          result = { ok: true };
        } else {
          result = { error: `Unknown tool: ${name}` };
        }
      } catch (err) {
        result = { error: err.message };
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 12000)
      });
    }

    if (finished) break;
  }

  const elapsedMs = Date.now() - t0;
  if (sendEvent) {
    sendEvent({
      type: 'debug_subagent_done',
      document_id,
      iterations,
      excerpts: finalExcerpts.length,
      elapsedMs
    });
  }

  // Backfill heading metadata on the returned excerpts
  const indices = finalExcerpts.map(e => e.paragraph_index).filter(n => typeof n === 'number');
  let headingsByIndex = new Map();
  if (indices.length > 0) {
    const placeholders = indices.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT paragraph_index, heading FROM content WHERE doc_id = ? AND paragraph_index IN (${placeholders})`,
      [document_id, ...indices]
    );
    headingsByIndex = new Map(rows.map(r => [r.paragraph_index, r.heading || null]));
  }

  return {
    document: meta,
    paragraphs_read: finalExcerpts.length,
    excerpts: finalExcerpts.map(e => ({
      paragraph_index: e.paragraph_index,
      text: e.text || '',
      heading: headingsByIndex.get(e.paragraph_index) || null
    })),
    subagent_answer: finalAnswer,
    subagent_iterations: iterations,
    subagent_elapsed_ms: elapsedMs
  };
}
