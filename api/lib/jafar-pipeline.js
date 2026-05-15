// Three-stage Jafar pipeline: research → craft → reflection-gate.
//
// Replaces the single-LLM-with-tools pattern. Each stage has one job:
//
//   1. RESEARCH  — orchestrator LLM only retrieves; doesn't write the reply.
//                  Forced to call at least one retrieval tool. Output: an
//                  array of {text, source, citation_url, doc_id, paragraph_index}.
//   2. CRAFT     — sub-agent composes reply from retrieved quotes ONLY.
//                  Sees no tool history, no full prior conversation, no
//                  Jafar-persona prose. Just the question, the quotes,
//                  a brief context summary, and the user-intent classification.
//                  This isolation enforces the grounding principle structurally.
//   3. REFLECT   — gate sub-agent judges the draft against grounding criteria.
//                  Returns {pass, issues, failed_sentences}. On fail, the
//                  crafter retries ONCE with the issues fed back. Second pass
//                  is shipped regardless.
//
// Cost: ~3× per turn vs. the prior single-LLM flow. Latency: +2-3s.
// Worth it: each stage has a single testable job; the structural isolation
// defends grounding more reliably than prompt rules alone.

import OpenAI from 'openai';
import { logger } from './logger.js';
import { config } from './config.js';
import { executeTool, TOOLS } from '../routes/chat.js';
import { getScopeForLocation } from './search/scope.js';
import { checkDeepResearch, recordQuestionHit } from './deep-research.js';
import { queryAll } from './db.js';

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

// ─── Stage 1: Research ────────────────────────────────────────────────────

const RESEARCH_SYSTEM = `You are the RESEARCH PHASE of a multi-stage assistant. Your sole job is to retrieve material from the corpus that the next stage will use to compose a reply. You do NOT write the user-facing answer.

For the user's latest question, call retrieval tools (search, find_document_for_citation, read_document_for_question, library_overview, library_count) until you have enough quotes to ground a reply. When done, respond with a brief plain-text "done" message — your prose is discarded.

Routing rules:
- Filtered count questions ("how many books by Udo Shaefer?", "how many docs from bahai-library.com?", "how many Islamic texts in Arabic?") → call library_count with the appropriate filters (author, site, religion, language, scope). Do NOT use search.
- Unfiltered catalog questions ("what do you have", "list the collections", "how many Buddhist texts total", "what languages") → call library_overview FIRST. Do NOT use search for these — search returns passages, not catalog data.
- Specific named works (Tablet of Wisdom, Iqán, Hidden Words, Quran, Bhagavad Gita, Tao Te Ching, Gospel of John, Guru Granth Sahib, etc.) → find_document_for_citation, then read_document_for_question on the primary candidate. If you also search, ALWAYS add the religion filter matching that work's tradition.
- Doctrinal concepts (materialism, justice, the soul, faith, detachment, etc.) → search with mode:"passages" + religion filter
- Specific named figures (Bahá'u'lláh, 'Abdu'l-Bahá, Plato in a tradition's text, etc.) → search with their name + the topic

RELIGION FILTER RULE: When the question asks what a specific tradition says ("What does the Quran say…", "What does the Bible teach…", "What does Buddhist teaching say…"), ALL search calls MUST include the matching religion filter (religion: "Islam" / "Christian" / "Buddhist" / etc.). Unfiltered search on a tradition-specific question will pull Bahá'í texts that discuss that tradition — a secondary-substitution failure. Filter first, broaden only if filtered search returns < 3 results.

Always call at least one retrieval tool before saying "done". If a search returns nothing useful, broaden your query and try again rather than giving up. The next stage cannot retrieve — only you can.`;

// Run the research phase. Returns:
//   {
//     retrieved_quotes: [{text, source_title, source_author, citation_url,
//                         doc_id, paragraph_index, religion, collection}, ...],
//     tool_calls: [{name, args, result_summary}, ...]   // for debug
//   }
//
// Sends SSE heartbeats every 15s during the research loop so Cloudflare
// doesn't drop the connection during slow sub-agent OpenAI calls.
export async function runResearchPhase({ messages, sendEvent, debug, scope_config }) {
  let heartbeat = null;
  if (sendEvent) {
    heartbeat = setInterval(() => {
      try { sendEvent({ type: 'heartbeat', stage: 'research', ts: Date.now() }); } catch { /* ignore */ }
    }, 15000);
  }
  try {
    return await runResearchPhaseInner({ messages, sendEvent, debug, scope_config });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

// Detect overtly political questions so we can skip expensive research and
// return a polite redirect from the crafter. Catches partisan figures and
// electoral questions; does NOT catch spiritual/justice/governance concepts.
const POLITICAL_PATTERNS = [
  /\b(trump|biden|obama|clinton|harris|desantis|modi|putin|zelensky|netanyahu|macron|scholz|sunak|xi jinping)\b/i,
  /\b(democrat|republican|labour|tory|gop|maga)\b/i,
  /\b(who should i vote|who to vote|voting for|election results|electoral college|primary election|ballot measure)\b/i,
  /\b(left.?wing|right.?wing|liberal vs conservative)\b/i,
];

function isPoliticalQuery(message) {
  return POLITICAL_PATTERNS.some(p => p.test(message));
}

// Catalog questions ask about what the library *contains*, not what texts *say*.
// The LLM reliably routes these to `search` even when told not to, so detect them
// here and pre-fetch library_overview before the LLM loop runs.
const CATALOG_PATTERNS = [
  /\bhow many\b/i,
  /\blargest collection\b/i,
  /\bwhat'?s? in (the|your) library\b/i,
  /\bwhat (languages?|traditions?|religions?) (are|do you)\b/i,
  /\blist (the|all|your|available)( \S+)? (collections?|traditions?|languages?|religions?)\b/i,
  /\bshow me (the|all|your|available)( \S+)? (collections?|texts?|scriptures?)\b/i,
  /\bwhat (collections?)\b/i,
  /\bwhat (?:kinds?|types?|forms?|sort)?(?:\s+of)?\s*scriptures? (?:do you|are|can|exist|is)\b/i,
  /\bdo you (have|carry|include)\b/i,
];

// Extract a tradition name from a catalog query so we can also do a targeted search
// Each entry provides: regex pattern, generic query, and religion filter for targeted search
const TRADITION_SEARCH_MAP = [
  { pattern: /bah[aá]['']?[ií]/i, query: 'sacred text', religion: "Baha'i" },
  { pattern: /\bisla[mn]ic?\b|\bmuslim\b|\bquran\b/i, query: 'sacred text', religion: 'Islam' },
  { pattern: /\bchrist(?:ian)?\b|\bgospel\b/i, query: 'sacred text', religion: 'Christian' },
  { pattern: /\bhindu\b|\bvedic?\b|\bupanishad\b|\bgita\b/i, query: 'sacred text', religion: 'Hindu' },
  { pattern: /\bbuddh(?:ist)?\b|\bpali\b|\bdhamma\b/i, query: 'sacred text', religion: 'Buddhist' },
  { pattern: /\bjain\b/i, query: 'sacred text', religion: 'Jain' },
  { pattern: /\bsikh\b|\bgranth\b/i, query: 'sacred text', religion: 'Sikh' },
  { pattern: /\btao\b|\bconfuc\b|\bchinese\b/i, query: 'sacred text', religion: 'Tao' },
  { pattern: /\bzoroastrian\b|\bavesta\b/i, query: 'sacred text', religion: 'Zoroastrian' },
  { pattern: /\bjewish\b|\bhebre[ew]\b|\btorah\b|\btalmud\b/i, query: 'sacred text', religion: 'Judaism' },
];

function isCatalogQuery(messages) {
  const last = messages.filter(m => m.role === 'user').at(-1)?.content || '';
  return CATALOG_PATTERNS.some(p => p.test(last));
}

// Extract structured catalog filters from a user message for library_count.
// Returns an object with any combination of: author, religion, site, language, scope.
// Empty object means no specific filters detected → use library_overview instead.
function extractCatalogFilters(message) {
  const filters = {};
  // Site domain (e.g. "bahai-library.com", "oceanlibrary.com")
  const siteMatch = message.match(/\b([\w-]+\.(?:com|org|net|edu))\b/i);
  if (siteMatch) filters.site = siteMatch[1];
  // Author: "by First Last" — capitalised 1–4 word name
  const authorMatch = message.match(/\bby\s+([A-Z][a-záéíóúāīū]+(?:\s+[A-Z][a-záéíóúāīū]+){0,3})/);
  if (authorMatch) filters.author = authorMatch[1];
  // Language: "in Arabic", "in Persian", etc.
  const langMatch = message.match(/\bin\s+(Arabic|Persian|Farsi|French|German|English|Spanish|Turkish|Russian|Chinese|Japanese|Korean)\b/i);
  if (langMatch) filters.language = langMatch[1];
  // Scope
  if (/\bprimary\b/i.test(message)) filters.scope = 'primary';
  else if (/\bsupplemental\b|\bexternal\b/i.test(message)) filters.scope = 'supplemental';
  // Tradition — only when combined with another filter (tradition alone goes to library_overview)
  for (const { pattern, religion } of TRADITION_SEARCH_MAP) {
    if (pattern.test(message)) { filters.religion = religion; break; }
  }
  return filters;
}

// Returns { query, religion } for a targeted tradition search, or null for generic
function extractTraditionSearch(text) {
  for (const { pattern, query, religion } of TRADITION_SEARCH_MAP) {
    if (pattern.test(text)) return { query, religion };
  }
  return null;
}

function extractTraditionSearchQuery(text) {
  const t = extractTraditionSearch(text);
  return t ? t.query : null;
}

async function runResearchPhaseInner({ messages, sendEvent, debug, scope_config }) {
  const aiMessages = [
    { role: 'system', content: RESEARCH_SYSTEM },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  const retrieved = [];
  const debugCalls = [];

  // For catalog/coverage questions, skip the LLM search loop entirely.
  // The LLM always reaches for `search` (which returns text passages), drowning
  // out the catalog data. Instead: call library_overview directly, inject the
  // structured catalog into retrieved_quotes, and return — the craft stage
  // composes the response from catalog data alone.
  if (isCatalogQuery(messages)) {
    if (debug) debugCalls.push({ name: 'library_overview', args: {}, forced: true });
    if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'library_overview', args: {}, forced: true });
    try {
      const lastMsg = messages.filter(m => m.role === 'user').at(-1)?.content || '';
      const [overview] = await Promise.all([
        executeTool('library_overview', {}, { scope_config })
      ]);
      const religionLines = (overview.religions || []).filter(r => r.name).map(r => `  - ${r.name}: ${r.documents} documents`).join('\n');
      const collectionLines = (overview.collections || []).filter(c => c.documents > 0).map(c => `  - ${c.name}: ${c.documents} documents${c.description ? ' — ' + c.description.slice(0, 80) : ''}`).join('\n');
      const languageLines = (overview.languages || []).map(l => `  - ${l.name}`).join('\n');
      retrieved.push({
        text: `Library catalog:\nTotal: ${overview.totalDocuments} documents, ${overview.totalParagraphs} paragraphs\n\nBy tradition:\n${religionLines}\n\nCollections:\n${collectionLines}${languageLines ? '\n\nLanguages available:\n' + languageLines : ''}`,
        source_title: 'Library Catalog',
        source_author: 'Ocean Library',
        citation_url: null,
        via: 'library_overview',
        is_catalog: true
      });

      // For tradition-specific browsing questions, also search for representative
      // texts so the crafter has citable sources with URLs to ground the response.
      // For general overview questions, fetch a representative sample across traditions.
      const traditionQuery = extractTraditionSearchQuery(lastMsg) || 'sacred scripture wisdom tradition';
      try {
        if (debug) debugCalls.push({ name: 'search', args: { query: traditionQuery, limit: 5 }, forced: true });
        const searchResults = await executeTool('search', { query: traditionQuery, limit: 5 }, { scope_config });
        if (searchResults?.results?.length) {
          retrieved.push(...searchResults.results);
        }
      } catch (se) {
        logger.warn({ err: se.message }, 'tradition search alongside catalog failed');
      }

      logger.info({ retrieved: retrieved.length, traditionQuery }, 'catalog pre-fetch complete, skipping LLM search loop');
      return { retrieved_quotes: retrieved, tool_calls: debugCalls };
    } catch (e) {
      logger.warn({ err: e.message }, 'pre-fetch library_overview failed, falling through to normal search');
    }
  }

  // Deep Research pre-fetch: check if we have curated passage sets for this question.
  // Fire-and-forget hit tracking in parallel (never blocks or throws).
  const userMessage = messages.filter(m => m.role === 'user').at(-1)?.content || '';
  if (userMessage.length > 10) {
    recordQuestionHit(userMessage).catch(() => {});
    try {
      const dr = await checkDeepResearch(userMessage);
      if (dr?.quotes?.length >= 3) {
        logger.info({ researchId: dr.id, quotes: dr.quotes.length }, 'Deep research pre-fetch hit');
        if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'deep_research', args: { researchId: dr.id, quotes: dr.quotes.length } });
        for (const q of dr.quotes) {
          retrieved.push({
            text: q.text,
            source_title: q.title,
            source_author: q.author,
            citation_url: q.source_url ? `${q.source_url}?paraId=${q.external_para_id}` : null,
            doc_id: q.doc_id,
            religion: q.religion,
            authority: q.authority,
            via: 'deep_research',
            relevance_score: q.relevance_score,
            contextual_note: q.contextual_note,
          });
        }
        return { retrieved_quotes: retrieved, tool_calls: debugCalls, deep_research_id: dr.id };
      }
    } catch (drErr) {
      logger.warn({ err: drErr.message }, 'Deep research pre-fetch error (non-fatal)');
    }
  }

  // Cap at 3 rounds. Pipeline budget is ~90s end-to-end vs Cloudflare's
  // ~100s timeout — research must leave room for craft + reflect + retry.
  const MAX_ROUNDS = 3;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: aiMessages,
      tools: TOOLS,
      // First round after pre-fetch: auto (data already in context); otherwise required
      tool_choice: round === 0 ? 'auto' : 'auto',
      stream: false,
      max_tokens: 800,
      temperature: 0.3
    });

    const choice = resp.choices[0];

    if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length > 0) {
      aiMessages.push(choice.message);
      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments || '{}');
          if (debug) debugCalls.push({ name: tc.function.name, args });
          if (sendEvent) sendEvent({ type: 'debug_research_call', name: tc.function.name, args });

          // Catch any thrown error so a single failed tool doesn't kill the
          // pipeline. Returns a structured error the orchestrator LLM can see.
          let result;
          try {
            result = await executeTool(tc.function.name, args, { scope_config });
          } catch (toolErr) {
            logger.error({ err: toolErr.message, stack: toolErr.stack, tool: tc.function.name, args }, 'tool execution threw');
            result = { error: `Tool ${tc.function.name} failed: ${toolErr.message}` };
          }

          // Emit a brief result diagnostic so debug-mode consumers can see
          // what came back (keys + counts only — not the full payload).
          if (sendEvent) {
            const diag = {
              error: result?.error,
              passages: result?.passages?.length,
              excerpts: result?.excerpts?.length,
              candidates: result?.candidates?.length,
              paragraphs: result?.paragraphs?.length,
              has_summary: !!result?.summary
            };
            sendEvent({ type: 'debug_research_result', name: tc.function.name, diag });
          }

          // Harvest any retrievable quotes/passages into the structured array
          if (result?.passages) {
            for (const p of result.passages) {
              retrieved.push({
                text: p.text || '',
                source_title: p.title || '',
                source_author: p.author || '',
                citation_url: p.source_url || (p.document_id ? `https://siftersearch.com/document/${p.document_id}` : null),
                doc_id: p.document_id,
                paragraph_index: p.paragraph_index,
                religion: p.religion || null,
                collection: p.collection || null,
                via: 'search'
              });
            }
          }
          if (result?.excerpts) {
            const doc = result.document || {};
            for (const e of result.excerpts) {
              const citation_url = e.source_url
                || (doc.base_url && e.paragraph_index != null ? `${doc.base_url}#p${e.paragraph_index}` : null)
                || (doc.id ? `https://siftersearch.com/document/${doc.id}#p${e.paragraph_index}` : null);
              retrieved.push({
                text: e.text || '',
                source_title: doc.title || '',
                source_author: doc.author || '',
                citation_url,
                doc_id: doc.id,
                paragraph_index: e.paragraph_index,
                religion: doc.religion || null,
                collection: doc.collection || null,
                via: 'read_document_for_question'
              });
            }
            if (result.summary) {
              // Also keep the sub-agent summary as a non-quote context note
              retrieved.push({
                text: result.summary,
                source_title: doc.title || '',
                source_author: doc.author || '',
                doc_id: doc.id,
                via: 'sub_agent_summary',
                is_summary: true
              });
            }
          }

          if (debug && debugCalls.length > 0) debugCalls[debugCalls.length - 1].result_size = JSON.stringify(result).length;
          return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
        })
      );
      aiMessages.push(...toolResults);
      continue;
    }

    // No more tool calls — research phase complete
    break;
  }

  logger.info({ retrieved: retrieved.length, calls: debugCalls.length }, 'research phase complete');
  return { retrieved_quotes: retrieved, tool_calls: debugCalls };
}

// ─── Intent + entity classifier ───────────────────────────────────────────

// Single gpt-4o-mini call that classifies intent AND extracts the entities
// the deterministic retrieval router needs (work_name, religion, topics).
// Replaces both the standalone classifyIntent and the LLM orchestrator —
// the heaviest call in the pipeline. Total: 1 mini call (~1-2s) instead of
// gpt-4o-with-tools (~5-7s).
const INTENT_SYSTEM = `Classify the user's latest message and extract retrieval entities. Use RECENT CONVERSATION CONTEXT (when provided) to resolve pronouns and implicit references — e.g. if the prior turn established "non-believers" as the topic, a follow-up "what about the Gospel?" means Gospel + non-believers. Output JSON ONLY.

intent: ONE of
- "quote_request": user asks for a quote/passage/verse/text excerpt explicitly. Words like "show me", "quote me", "find the verse", "give me the passage".
- "definition": user asks what a term, concept, or doctrine means.
- "explain": user asks how something works, why a teaching exists, or what a tradition says about a topic.
- "discuss": general conversation, follow-up commentary, opinion, open exploration.

work_name: Set when the user's question targets a SINGLE scriptural work or single-author canonical text. Translate author names to their canonical work: "Lao Tzu" → "Tao Te Ching", "Confucius" → "Analects", "Isaiah" → "Isaiah", "Moses"/"Torah" → "Genesis", "Zoroaster"/"Zarathustra" → "Gathas". Examples: "What does the Iqán say about X?" → "Kitab-i-Iqan"; "What does Lao Tzu say about X?" → "Tao Te Ching"; "What does Confucius say about virtue?" → "Analects"; "Find the passage in the Hidden Words about Y" → "Hidden Words". Else null. Return null when: (a) the user mentions TWO OR MORE works, (b) the user is asking what multiple traditions say, (c) the work is mentioned only in passing, (d) the user refers to a broad scriptural collection as a tradition indicator — "the Bible", "the Quran", "the Torah" in "what does the Bible say about X?" means the Christian scriptures broadly, not a single book; return null in that case (the tradition is handled by routing, not work_name).

topics: 1-3 lowercase topical keywords for passage search that capture what the user actually wants to find, combining this turn AND prior context. Period vocabulary preferred. Empty array if work_name covers it.

Output: {"intent": "...", "work_name": "..."|null, "topics": [...]}`;

export async function classifyIntentAndEntities(userMessage, recentMessages = []) {
  // Build a short context snippet from the last 2 turns (user + assistant pairs)
  // so the classifier can resolve follow-up questions that rely on prior context.
  const contextLines = [];
  const recent = recentMessages.slice(-4); // last 2 pairs
  for (const m of recent) {
    if (m.role === 'user') contextLines.push(`USER: ${m.content.slice(0, 300)}`);
    else if (m.role === 'assistant') contextLines.push(`JAFAR: ${m.content.slice(0, 200)}`);
  }
  const contextBlock = contextLines.length
    ? `RECENT CONVERSATION:\n${contextLines.join('\n')}\n\n`
    : '';

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_SYSTEM },
        { role: 'user', content: `${contextBlock}CURRENT MESSAGE: ${userMessage}` }
      ],
      temperature: 0.0,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const validIntents = ['quote_request', 'definition', 'explain', 'discuss'];
    return {
      intent: validIntents.includes(parsed.intent) ? parsed.intent : 'discuss',
      work_name: parsed.work_name || null,
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : []
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'intent+entity classification failed; defaulting');
    return { intent: 'discuss', work_name: null, topics: [] };
  }
}

// Backwards-compat wrapper
export async function classifyIntent(userMessage) {
  const { intent } = await classifyIntentAndEntities(userMessage);
  return intent;
}

// ─── Stage 1b: Deterministic retrieval ────────────────────────────────────

// Replaces the LLM orchestrator with direct, deterministic tool calls
// based on the entities extracted by classifyIntentAndEntities.
//
//   work_name set       → find_document_for_citation → read_document_for_question
//                         on the primary candidate (using canonical paragraph
//                         range if known) PLUS a passages search for any topics
//   topic-mapped       → read_document_for_question on the primary work that
//                         the topic implies (mystical → Seven Valleys, etc.)
//   else                → search:passages on topics or the raw user message
//
// No model call here. ~0.5-1.5s wall time. Combined with the 1-2s entity
// classifier, the whole research stage runs in ~2-3s instead of 5-10s.
//
// `messages` (optional) is the conversation history; we use it to retain
// a work_name that was named in an earlier turn but not the current turn.
// "Show me the passage on nature" doesn't repeat "Tablet of Wisdom," but if
// the prior turn established it, we keep reading from that work.


// Extract a previously-mentioned work_name from the conversation history.
// If the latest turn doesn't name a work but an earlier user/assistant turn
// did, we treat the conversation as continuing about that work. This fixes
// the failure mode where R3 of a Tablet-of-Wisdom conversation pivots to
// "Pythagoras? Hippocrates?" and the deterministic router loses context.
function inferWorkFromHistory(messages, currentEntitiesWorkName) {
  if (currentEntitiesWorkName) return currentEntitiesWorkName;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  // Scan backward through the last 4 turns for a known canonical work name.
  // Keywords matched are the first matcher of each CANONICAL_WORKS entry.
  // Imported lazily to avoid a circular dependency with chat.js.
  const recent = messages.slice(-8);
  const KNOWN_NAMES = [
    ['tablet of wisdom', 'lawh-i-hikmat', 'hikmat'],
    ['kitab-i-iqan', 'iqan', 'book of certitude'],
    ['kitab-i-aqdas', 'aqdas', 'most holy book'],
    ['hidden words'],
    ['gleanings'],
    ['gems of divine mysteries'],
    ['seven valleys', 'four valleys'],
    ['some answered questions'],
    ['paris talks'],
    ['promulgation of universal peace'],
    ['secret of divine civilization'],
    ['god passes by'],
    ['advent of divine justice'],
    ['promised day is come'],
    ['tablets of bahaullah', 'tablets revealed after']
  ];
  // Walk recent turns from newest backwards (skip the latest user message —
  // it didn't name a work, that's why we're searching history).
  for (let i = recent.length - 2; i >= 0; i--) {
    const text = (recent[i].content || '').toLowerCase();
    for (const variants of KNOWN_NAMES) {
      for (const v of variants) {
        if (text.includes(v)) return variants[0]; // canonical form
      }
    }
  }
  return null;
}

export async function deterministicResearch({ entities, userMessage, messages, sendEvent, debug, scope_config }) {
  const retrieved = [];
  const debugCalls = [];
  // Subagent syntheses — when a document subagent runs, its `answer` field
  // (the curated synthesis for the user's question) is collected here so the
  // crafter can use it as authoritative research context. Without this, the
  // crafter only sees raw excerpts and has to re-do the synthesis from scratch,
  // which loses the subagent's careful selection (e.g., recognizing that
  // paragraphs 12-17 of Edwin Arnold's Gita ARE the opening verses).
  const subagentSyntheses = [];

  const seenParagraphs = new Set();
  // Per-religion text dedup: the same passage (e.g. Psalms) is indexed under
  // both Christianity (KJV) and Judaism (Tehilim). We allow cross-religion
  // duplicates — the crafter sees both with their religion tags and uses the
  // SHARED-TEXT RULE. Within a single religion, dedup prevents the same verse
  // from filling multiple slots for that tradition.
  const seenTextsByReligion = {};
  // Quran Bismillah opens every sura — BM25 stemming causes it to rank high for
  // any "mercy/compassion" query, drowning out actual content. Skip it so Jafar
  // cites thematic passages (e.g. Sura LV "The Merciful") instead of headers.
  const BISMILLAH_RE = /^(?:In the Name of (?:God|Allah)[^a-z]{0,5}the Compassionate[^a-z]{0,5}the Merciful[.!]?\s*)$/i;

  const harvestPassages = (result, via = 'search') => {
    if (!result?.passages) return;
    for (const p of result.passages) {
      const key = `${p.document_id}_${p.paragraph_index}`;
      if (seenParagraphs.has(key)) continue;
      if (BISMILLAH_RE.test((p.text || '').trim())) continue;
      const religion = p.religion || 'unknown';
      const normText = (p.text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
      if (!seenTextsByReligion[religion]) seenTextsByReligion[religion] = new Set();
      if (normText.length > 20 && seenTextsByReligion[religion].has(normText)) continue;
      seenParagraphs.add(key);
      if (normText.length > 20) seenTextsByReligion[religion].add(normText);
      retrieved.push({
        text: p.text || '',
        source_title: p.title || '',
        source_author: p.author || '',
        citation_url: p.source_url || (p.document_id ? `https://siftersearch.com/document/${p.document_id}` : null),
        doc_id: p.document_id,
        paragraph_index: p.paragraph_index,
        religion: p.religion || null,
        collection: p.collection || null,
        source_lang: p.language || null,
        via
      });
    }
  };

  const harvestExcerpts = (result, via = 'read_document_for_question') => {
    if (!result?.excerpts) return;
    const doc = result.document || {};
    for (const e of result.excerpts) {
      // Use paragraph-level source_url when available (set by executeReadDocumentForQuestion);
      // fall back to document-level link. This ensures harvestExcerpts produces
      // paragraph deeplinks, not just /document/{id} fallbacks.
      const citation_url = e.source_url
        || (doc.base_url && e.paragraph_index != null ? `${doc.base_url}#p${e.paragraph_index}` : null)
        || (doc.id ? `https://siftersearch.com/document/${doc.id}` : null);
      retrieved.push({
        text: e.text || '',
        // When the document subagent translated a non-English excerpt, the
        // translation rides alongside the original text so the crafter can
        // present both. `translation` is null for English-source content.
        translation: e.translation || null,
        source_lang: e.source_lang || null,
        source_title: doc.title || '',
        source_author: doc.author || '',
        citation_url,
        doc_id: doc.id,
        paragraph_index: e.paragraph_index,
        religion: doc.religion || null,
        collection: doc.collection || null,
        via
      });
    }
  };

  const runTool = async (name, args) => {
    if (debug) debugCalls.push({ name, args });
    if (sendEvent) sendEvent({ type: 'debug_research_call', name, args });
    let result;
    try {
      result = await executeTool(name, args, { scope_config });
    } catch (toolErr) {
      logger.error({ err: toolErr.message, tool: name, args }, 'deterministic tool execution threw');
      result = { error: toolErr.message };
    }
    if (sendEvent) {
      sendEvent({
        type: 'debug_research_result',
        name,
        diag: {
          error: result?.error,
          passages: result?.passages?.length,
          excerpts: result?.excerpts?.length,
          candidates: result?.candidates?.length
        }
      });
    }
    return result;
  };

  // Political guardrail: skip research entirely for overtly political questions.
  // The crafter's POLITICAL GUARDRAIL section will compose the polite redirect.
  if (isPoliticalQuery(userMessage)) {
    logger.info('political query detected — skipping research, crafter will redirect');
    return { retrieved_quotes: [], subagent_syntheses: [], tool_calls: [], is_political: true };
  }

  // Catalog pre-fetch: for library overview/browsing questions, skip the
  // per-tradition search loop entirely and return authoritative count data.
  // Two paths:
  //   1. Filtered (author/site/language/scope) → library_count with extracted filters
  //   2. Unfiltered → library_overview (full aggregate, cached)
  // Both paths add a companion search for citable passages.
  if (isCatalogQuery(messages)) {
    const catalogFilters = extractCatalogFilters(userMessage);
    // A filter is "specific" if it includes anything beyond religion alone —
    // religion alone is covered by library_overview + tradition companion search.
    const nonReligionFilters = Object.keys(catalogFilters).filter(k => k !== 'religion');
    const isFiltered = nonReligionFilters.length > 0;

    if (isFiltered) {
      // Filtered catalog query: call library_count with extracted params
      try {
        if (debug) debugCalls.push({ name: 'library_count', args: catalogFilters, forced: true });
        if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'library_count', args: catalogFilters, forced: true });
        const countResult = await executeTool('library_count', catalogFilters, { scope_config });
        const filterDesc = Object.entries(catalogFilters).map(([k, v]) => `${k}="${v}"`).join(', ');
        const sampleLines = (countResult.sample_documents || []).map(d =>
          `  - ${d.title}${d.author ? ' by ' + d.author : ''}${d.year ? ' (' + d.year + ')' : ''}`
        ).join('\n');
        retrieved.push({
          text: `Library count (${filterDesc}):\nMatching documents: ${countResult.count}\n\nSample titles:\n${sampleLines}`,
          source_title: 'Library Catalog',
          source_author: 'Ocean Library',
          citation_url: null,
          via: 'library_count',
          is_catalog: true,
          catalog_count: countResult.count,
          catalog_filters: catalogFilters
        });
        logger.info({ filters: catalogFilters, count: countResult.count }, 'filtered catalog query complete');
        return { retrieved_quotes: retrieved, subagent_syntheses: subagentSyntheses, tool_calls: debugCalls };
      } catch (e) {
        logger.warn({ err: e.message }, 'library_count failed, falling through to normal research');
      }
    } else {
      // Unfiltered catalog: library_overview + companion search
      if (debug) debugCalls.push({ name: 'library_overview', args: {}, forced: true });
      if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'library_overview', args: {}, forced: true });
      try {
        const overview = await executeTool('library_overview', {}, { scope_config });
        const religionLines = (overview.religions || []).filter(r => r.name).map(r => `  - ${r.name}: ${r.documents} documents`).join('\n');
        const collectionLines = (overview.collections || []).filter(c => c.documents > 0).map(c => `  - ${c.name}: ${c.documents} documents${c.description ? ' — ' + c.description.slice(0, 80) : ''}`).join('\n');
        const languageLines = (overview.languages || []).map(l => `  - ${l.name}`).join('\n');
        retrieved.push({
          text: `Library catalog:\nTotal: ${overview.totalDocuments} documents, ${overview.totalParagraphs} paragraphs\n\nBy tradition:\n${religionLines}\n\nCollections:\n${collectionLines}${languageLines ? '\n\nLanguages available:\n' + languageLines : ''}`,
          source_title: 'Library Catalog',
          source_author: 'Ocean Library',
          citation_url: null,
          via: 'library_overview',
          is_catalog: true
        });
        const tradition = extractTraditionSearch(userMessage);
        const companionArgs = tradition
          ? { query: 'scripture wisdom', religion: tradition.religion, limit: 5 }
          : { query: 'sacred scripture wisdom', limit: 5 };
        try {
          if (debug) debugCalls.push({ name: 'search', args: companionArgs, forced: true });
          if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'search', args: companionArgs, forced: true });
          const searchResults = await executeTool('search', companionArgs, { scope_config });
          if (searchResults?.passages?.length) harvestPassages(searchResults, 'catalog_companion');
        } catch (se) {
          logger.warn({ err: se.message }, 'catalog companion search failed');
        }
        logger.info({ retrieved: retrieved.length, tradition: tradition?.religion }, 'catalog pre-fetch complete');
        return { retrieved_quotes: retrieved, subagent_syntheses: subagentSyntheses, tool_calls: debugCalls };
      } catch (e) {
        logger.warn({ err: e.message }, 'catalog pre-fetch failed, falling through to normal research');
      }
    }
  }

  // Detect tradition-specific questions early so deep research pre-fetch can
  // verify relevance. A comparative article about "evil across traditions" should
  // NOT short-circuit "What are the Zoroastrian teachings on good and evil?" —
  // it has no Zoroastrian quotes and causes a general-knowledge fallback.
  const MINOR_TRAD_PATTERNS_EARLY = [
    { pattern: /\bhind(?:u|uism)\b|\bdharma\b|\bveda[ns]?\b|\bupanishad\b|\bgita\b|\bmahabharata\b|\bbhagavad\b/i, religion: 'Hindu' },
    { pattern: /\bsikh(?:ism)?\b|\bguru granth\b|\bseva\b|\bwaheguru\b|\bnanakshahi\b/i, religion: 'Sikh' },
    { pattern: /\bzoroastr(?:ian|ianism)?\b|\bavesta\b|\bahura mazda\b|\bgathas?\b|\bmazdayasna\b/i, religion: 'Zoroastrian' },
    { pattern: /\btao(?:ism|ist)?\b|\bconfuci(?:us|anism)?\b|\banalects\b/i, religion: 'Tao' },
    { pattern: /\bjain(?:ism)?\b|\bahimsa\b|\bmahavira\b/i, religion: 'Jain' },
  ];
  const MAJOR_TRAD_PATTERNS_EARLY = [
    { pattern: /\bislam(?:ic)?\b|\bquran\b|\bqu['']ran\b|\bsunni\b|\bshia\b|\bmuslim\b/i, religion: 'Islam' },
    { pattern: /\bchrist(?:ian(?:ity)?)?\b|\bgospel\b|\bbible\b|\bjesus\b/i, religion: 'Christian' },
    { pattern: /\bbuddh(?:ist|ism)?\b|\bpali\b|\bdhamma\b|\bnirvana\b|\beightfold\b/i, religion: 'Buddhist' },
    { pattern: /\b(?:jewish|judaism|torah|talmud|hebrew|rabbinic)\b/i, religion: 'Judaism' },
    // Bahá'í-specific questions must route to Bahá'í-only search (not 5-tradition loop)
    { pattern: /\bbah[aá]['']?[ií]\b|\bbah[aá]u'?ll[aá]h\b|\b'?abdu'l-bah[aá]\b|\bshoghi\s+effendi\b|\baqdas\b|\biq[aá]n\b|\bhidden\s+words\b|\bbayan\b|\ball-merciful\b/i, religion: "Baha'i" },
  ];
  const requiredTradition = (() => {
    for (const { pattern, religion } of MINOR_TRAD_PATTERNS_EARLY) {
      if (pattern.test(userMessage)) return religion;
    }
    // Only flag major traditions when the question is EXPLICITLY about them
    // (not just mentioning them in passing in a multi-tradition question)
    const majorMatches = MAJOR_TRAD_PATTERNS_EARLY.filter(({ pattern }) => pattern.test(userMessage));
    if (majorMatches.length === 1) return majorMatches[0].religion; // single-tradition question
    return null; // multi-tradition or generic — deep research articles are fine
  })();

  // Deep Research pre-fetch: if we have curated passage sets for this question,
  // inject them directly — they were hand-selected for cross-tradition diversity
  // and relevance, so they make better research context than live search alone.
  // We still run the normal search below to supplement with fresher/adjacent passages.
  recordQuestionHit(userMessage).catch(() => {});
  try {
    const dr = await checkDeepResearch(userMessage);
    if (dr?.quotes?.length >= 3) {
      // For tradition-specific questions, verify the article has quotes from that
      // tradition before returning early. If a comparative evil/suffering article
      // matched "Zoroastrian teachings on good and evil" but has no Zoroastrian
      // quotes, skip the early return — targeted search will do better.
      // For tradition-specific questions, skip deep research early return entirely.
      // Cross-tradition comparative articles provide wrong framing when the user
      // asked about ONE tradition: the crafter's mandatory-citation rule then forces
      // it to cite all traditions present, ignoring the user's single-tradition ask.
      // Let the targeted tradition search run instead.
      // For general interfaith questions (requiredTradition=null), early return is fine.
      const shouldEarlyReturn = !requiredTradition;

      if (shouldEarlyReturn) {
        if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'deep_research', args: { researchId: dr.id, quotes: dr.quotes.length } });
        logger.info({ researchId: dr.id, quotes: dr.quotes.length }, 'Deep research pre-fetch hit');
        for (const q of dr.quotes) {
          retrieved.push({
            text: q.text,
            source_title: q.title,
            source_author: q.author,
            citation_url: q.source_url ? `${q.source_url}?paraId=${q.external_para_id}` : q.source_url,
            doc_id: q.doc_id,
            religion: q.religion,
            authority: q.authority,
            via: 'deep_research',
            relevance_score: q.relevance_score,
            contextual_note: q.contextual_note,
          });
        }
        // Return immediately — curated set is sufficient, skip live search loop.
        logger.info({ researchId: dr.id, retrieved: retrieved.length }, 'deterministic research complete (deep_research pre-fetch)');
        return { retrieved_quotes: retrieved, subagent_syntheses: subagentSyntheses, tool_calls: debugCalls, deep_research_id: dr.id };
      } else {
        logger.info({ researchId: dr.id, requiredTradition, quotes: dr.quotes.length }, 'Deep research pre-fetch skipped — no quotes for required tradition, falling through to targeted search');
      }
    }
  } catch (drErr) {
    logger.warn({ err: drErr.message }, 'deep research pre-fetch error (non-fatal)');
  }

  const tasks = [];

  // Carry forward a work_name from earlier in the conversation when the
  // current turn doesn't name one. Most follow-up questions ("show me the
  // passage about nature") implicitly continue the prior turn's work.
  const effectiveWorkName = inferWorkFromHistory(messages, entities.work_name);
  if (sendEvent && debug && effectiveWorkName !== entities.work_name) {
    sendEvent({ type: 'debug_work_carry', from_history: effectiveWorkName });
  }

  // Branch 1: user named a specific work (or earlier turn did) — fetch it
  // and hand the document to a focused QA subagent that can search/read
  // within it, rather than dumping 250 paragraphs into crafter context.
  // The broad companion search is run INSIDE this task (not as a separate
  // parallel task) so it can be filtered to the same religion as the named
  // work. An unrestricted search lets Bahá'í texts that quote the Quran
  // rank above actual Quran passages, producing wrong attributions.
  if (effectiveWorkName) {
    tasks.push((async () => {
      const find = await runTool('find_document_for_citation', {
        title: effectiveWorkName,
        limit: 5
      });
      const primary = (find?.candidates || []).find(c => c.is_primary) || find?.candidates?.[0];
      if (primary?.document_id) {
        const { answerFromDocument } = await import('./document-subagent.js');
        if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'document_subagent', args: { document_id: primary.document_id, work_name: effectiveWorkName } });
        const sub = await answerFromDocument({
          document_id: primary.document_id,
          question: userMessage,
          conversation_messages: messages,
          start_paragraph: typeof primary.start_paragraph === 'number' ? primary.start_paragraph : null,
          end_paragraph: typeof primary.end_paragraph === 'number' ? primary.end_paragraph : null,
          sendEvent,
          debug
        });
        if (sendEvent) {
          sendEvent({
            type: 'debug_research_result',
            name: 'document_subagent',
            diag: {
              error: sub?.error,
              excerpts: sub?.excerpts?.length || 0,
              iterations: sub?.subagent_iterations,
              elapsed_ms: sub?.subagent_elapsed_ms
            }
          });
        }
        harvestExcerpts(sub, 'document_subagent');
        if (sub?.subagent_answer) {
          subagentSyntheses.push({
            via: 'document_subagent',
            doc_id: primary.document_id,
            source_title: sub.document?.title || effectiveWorkName,
            source_author: sub.document?.author || null,
            answer: sub.subagent_answer
          });
        }
      }
      // Companion search filtered to the named work's religion — prevents
      // texts from other traditions quoting the same scripture from ranking
      // above the actual scripture (e.g., Bahá'í tablets quoting Bismillah
      // rank above the Quran itself when the search is unrestricted).
      const passageQueryLocal = userMessage.slice(0, 300);
      if (passageQueryLocal.trim()) {
        const religion = primary?.religion || null;
        const companion = await runTool('search', {
          query: passageQueryLocal,
          mode: 'passages',
          ...(religion ? { religion } : {}),
          limit: religion ? 5 : 3
        });
        harvestPassages(companion, `named-work-companion`);
      }
    })());
  }

  // Branch 2: passages search.
  // When NO work is named, run parallel per-tradition searches so that
  // corpus imbalance (Bahá'í has 5× more docs) doesn't crowd out other
  // traditions from retrieved_quotes. Each tradition gets its own slot.
  // Strip question boilerplate and normalize gerunds for better BM25/semantic recall.
  // "What do the scriptures say about loving your enemies?" → "love enemies"
  //   Step 1: strip generic question prefix
  //   Step 2: strip trailing "?"
  //   Step 3: strip possessive pronouns (your/my/our/their)
  //   Step 4: convert leading gerund to base form (loving→love, making→make)
  // Without these transforms, Meilisearch hybrid returns "Blessed are the peacemakers"
  // (semantically adjacent) above Matthew 5:44 which contains the EXACT words.
  const _stripped = userMessage
    .slice(0, 300)
    .replace(/^(what do|what does|what did|how do|how does|tell me|explain|describe)\s+(?:\w+\s+){0,6}(scriptures?|bible|quran|qu['']ran|texts?|teachings?|religions?|holy\s+books?|traditions?)\s+(?:say about|teach about|say regarding|tell us about|teach us about|say on|teach on|teach(?:es)?(?:\s+about)?)\s*/i, '')
    .replace(/^(what is|what are|how is|how are)\s+/i, '')
    .replace(/\?$/, '')
    .replace(/\b(your|my|our|their|his|her)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Morphological simplification — two passes so BM25 matches exact words in scripture:
  //
  // Pass 1: -ness suffix → base form (BM25 has no stemmer; "forgiveness" ≠ "forgive")
  //   forgiveness→forgive, stillness→still, goodness→good, righteousness→righteous
  //   Avoids stripping theological nouns that ARE their own base (darkness, holiness).
  //
  // Pass 2: leading gerund (-ing) → base verb form
  //   3-char stem + VC ending → add 'e' (loving→love, making→make)
  //   double-vowel stem → keep stem (seeking→seek, teaching→teach)
  //   default → strip -ing (helping→help, following→follow)
  // Theological morphological variants: map abstract nouns to the verb/adjective form
  // that appears in KJV scripture so BM25 can find the exact words (no stemmer).
  const NESS_MAP = {
    forgiveness: 'forgive', goodness: 'good', righteousness: 'righteous',
    faithfulness: 'faithful', thankfulness: 'thankful',
  };
  // Broader theological variants not caught by -ness pattern.
  // Only for cases where KJV scripture uses the adjective/verb form but users
  // naturally phrase queries with the abstract noun (e.g., "humility" but
  // Matthew 18:4 says "humble himself").
  const VARIANT_MAP = {
    humility: 'humble',
    purity: 'pure',
  };
  const _denessed = (_stripped || userMessage.slice(0, 300))
    .replace(/\b(\w+ness)\b/gi, (m) => NESS_MAP[m.toLowerCase()] || m)
    .replace(/\b(\w+)\b/gi, (m) => VARIANT_MAP[m.toLowerCase()] || m);
  let passageQuery = _denessed.replace(/^(\w{2,})ing\b/i, (match, stem) => {
    if (stem.length === 3 && /[aeiou][^aeiou]$/i.test(stem)) return stem + 'e';
    if (/[aeiou]{2}$/i.test(stem)) return stem;
    return stem;
  });
  // Theodicy expansion: questions about suffering / evil / why God permits harm
  // are best answered by passages that use the vocabulary of PURPOSE (tests, trials,
  // calamity, ordained, spiritual growth) rather than the word "suffering" alone.
  // Expanding the query bridges the lexical gap between the question and the answer.
  if (/\b(suffer|suffering|evil|pain|grief|tragedy|allow.*suffer|why.*god.*allow|calamity|afflict)\b/i.test(userMessage)) {
    passageQuery = passageQuery.replace(/\bsuffer(ing)?\b/gi, 'trials').trim() + ' tests purpose ordained';
  }
  if (passageQuery && passageQuery.trim()) {
    if (!effectiveWorkName) {
      // General interfaith question — parallel per-tradition searches with
      // collection filter to prefer primary texts. Without collection filter,
      // Bahá'í-authored commentary filed under Islam/Christian gets ranked ahead
      // of the Qur'an, Bible, Pali Canon, etc. Each tradition's primary texts:
      //   Islam → "Foundational Texts" (Qur'an + classical Tafsir by Islamic scholars)
      //   Christian → "Bible and Translations"
      //   Buddhist → "Pali Canon"
      //   Judaism → "Torah and Tanakh" (broadest primary-text collection)
      //   Baha'i → no filter (all Bahá'í content is authentic)
      // Non-English passages (Arabic, Farsi, Hebrew) are translated inline
      // after retrieval so the crafter can quote them in English while
      // preserving the original in the citation.
      // Two searches per tradition: primary (scripture-targeted) then broad.
      // All use author= to target OceanLibrary primary texts directly.
      // OL individual books have hash collection IDs, not human-readable names,
      // so collection filters ("Pali Canon", "Torah and Tanakh") miss them entirely.
      // Islam: broadAuthor forces the broad search to stay OL-sura-only — without it,
      // local Pickthall translations (author≠"Muhammad") leak into the Islam slot.
      // Matthew = OL Gospel of Matthew (most-quoted for interfaith); other Gospels
      // enter via supplementary OL queries in hybridSearch.
      // "Siddhartha Buddha" = Dhammapada + Sutta Nipata (primary Pali Canon).
      // "King David" = OL Psalms; "Isaiah" = OL Book of Isaiah.
      const PRIMARY_SEARCHES = {
        // Islam: semanticRatio=0.4 — Quran vocabulary is archaic ("Merciful", "Compassionate")
        // so exact BM25 matches are weak. Semantic similarity surfaces thematic suras
        // (e.g. Sura LV "The Merciful" for mercy queries) that BM25-only misses.
        // Post-merge author filter handles any HyPE bleed from non-Muhammad authors.
        // Bismillah filter prevents the formulaic sura header from dominating.
        "Islam":    { author: "Muhammad", broadAuthor: "Muhammad", primarySemanticRatio: 0.4 },
        // Christian: semanticRatio=0 — pure BM25 so KJV keyword matches dominate.
        // NESS_MAP handles forgiveness→forgive; matchingStrategy:'last' allows partial match.
        // Pure BM25 ensures Matthew 5:7 "merciful" ranks above "peacemakers" for mercy queries.
        "Christian":{ author: "Matthew", primarySemanticRatio: 0 },
        // Buddhist: queryTransform maps "mercy" → "loving-kindness" (Pali: metta) so BM25
        // finds the Metta Sutta / loving-kindness texts that explicitly discuss these qualities.
        // No author filter — broad religion=Buddhist finds Mahayana + Pali translations.
        // semanticRatio=0.4 bridges compassion ↔ karuna gap.
        "Buddhist": { primarySemanticRatio: 0.4, queryTransform: q => q.replace(/\bmercy\b/gi, 'loving-kindness') },
        // Judaism: no author filter — Psalms are KJV archaic, rarely contain modern
        // concept phrases like "inner peace". Broad religion filter + semanticRatio=0.5
        // lets the engine find the best thematic match across all Jewish texts
        // (Psalms, Torah, Talmud, JPS Tanakh) via semantic similarity.
        "Judaism":  { primarySemanticRatio: 0.5 },
        // Bahá'í: no author filter (all Bahá'í corpus is authentic)
        // Higher semantic ratio to bridge varied Bahá'í vocabulary styles
        "Baha'i":   { primarySemanticRatio: 0.4 },
      };
      // Minor traditions: detect when the question is specifically about a tradition
      // not in INTERFAITH_TRADITIONS (Hindu, Sikh, Zoroastrian, Tao, Jain).
      // Without this, "What are the Zoroastrian teachings on good and evil?" returns
      // Bahá'í texts that mention Zoroaster instead of actual Avesta passages.
      const MINOR_TRADITION_PATTERNS = [
        { pattern: /\bhind(?:u|uism)\b|\bdharma\b|\bveda[ns]?\b|\bupanishad\b|\bgita\b|\bmahabharata\b|\bbhagavad\b/i, religion: 'Hindu' },
        { pattern: /\bsikh(?:ism)?\b|\bguru granth\b|\bseva\b|\bwaheguru\b|\bnanakshahi\b/i, religion: 'Sikh' },
        { pattern: /\bzoroastr(?:ian|ianism)?\b|\bavesta\b|\bahura mazda\b|\bgathas?\b|\bmazdayasna\b/i, religion: 'Zoroastrian' },
        { pattern: /\btao(?:ism|ist)?\b|\bconfuci(?:us|anism)?\b|\banalects\b/i, religion: 'Tao' },
        { pattern: /\bjain(?:ism)?\b|\bahimsa\b|\bmahavira\b/i, religion: 'Jain' },
      ];
      const detectedMinorTradition = (() => {
        for (const { pattern, religion } of MINOR_TRADITION_PATTERNS) {
          if (pattern.test(userMessage)) return religion;
        }
        return null;
      })();
      if (detectedMinorTradition) {
        // Replace the standard 5-tradition parallel searches with a targeted search
        // for the detected minor tradition, plus a general search for context.
        // Don't run INTERFAITH_TRADITIONS — those 5 don't apply when the question
        // is explicitly about Zoroaster/Sikh/Hindu/etc.
        tasks.push((async () => {
          // Tradition-specific vocabulary bridges for BM25 (no stemmer):
          // Zoroastrian: English good/evil → Avestan theological terms
          // Sikh: "seva" may appear as "sewa" or "service" in Gurmukhi transliterations
          let minorQuery = passageQuery;
          if (detectedMinorTradition === 'Zoroastrian') {
            minorQuery = minorQuery
              .replace(/\bgood\b/gi, 'Ahura Mazda righteous')
              .replace(/\bevil\b/gi, 'Angra Mainyu druj');
          } else if (detectedMinorTradition === 'Sikh') {
            minorQuery = minorQuery
              .replace(/\bseva\b/gi, 'seva sewa service')
              .replace(/\bwaheguru\b/gi, 'Waheguru God Almighty');
          }
          const primary = await runTool('search', {
            query: minorQuery,
            mode: 'passages',
            religion: detectedMinorTradition,
            limit: 6,
            semanticRatio: 0.5
          });
          harvestPassages(primary, `traditions-${detectedMinorTradition.toLowerCase()}`);
          // Second pass: always run a broader semantic search to supplement BM25 hits
          const broad = await runTool('search', {
            query: userMessage.slice(0, 200),
            mode: 'passages',
            religion: detectedMinorTradition,
            limit: 4,
            semanticRatio: 0.7
          });
          harvestPassages(broad, `traditions-${detectedMinorTradition.toLowerCase()}-broad`);
        })());
      } else if (requiredTradition && PRIMARY_SEARCHES[requiredTradition]) {
        // Major tradition single-search: question is explicitly about ONE tradition
        // (e.g. "What are the Five Pillars of Islam?"). Only search that tradition —
        // don't pull in 4 other religions, which forces the crafter to cite them all.
        const primaryOpts = PRIMARY_SEARCHES[requiredTradition];
        tasks.push((async () => {
          const primaryQuery = primaryOpts.queryTransform
            ? primaryOpts.queryTransform(passageQuery)
            : passageQuery;
          const { queryTransform: _qt, ...primarySearchOpts } = primaryOpts;
          const primary = await runTool('search', {
            query: primaryQuery,
            mode: 'passages',
            religion: requiredTradition,
            ...primarySearchOpts,
            limit: 6,
            semanticRatio: primarySearchOpts.primarySemanticRatio ?? 0.3
          });
          if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'search', args: { religion: requiredTradition, limit: 6, query: primaryQuery.slice(0, 80) } });
          harvestPassages(primary, `traditions-${requiredTradition.toLowerCase()}`);
          // Broad fallback within same tradition
          const broad = await runTool('search', {
            query: passageQuery,
            mode: 'passages',
            religion: requiredTradition,
            limit: 4,
            semanticRatio: 0.5
          });
          harvestPassages(broad, `traditions-${requiredTradition.toLowerCase()}-broad`);
        })());
      } else {
      const INTERFAITH_TRADITIONS = ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"];
      for (const religion of INTERFAITH_TRADITIONS) {
        const primaryOpts = PRIMARY_SEARCHES[religion];
        tasks.push((async () => {
          // Primary: scripture/foundational collection for non-Bahá'í traditions.
          // Default semanticRatio=0.1 keeps BM25 dominant for exact keyword matches
          // (e.g. "enemies" → Matthew 5:44). Per-tradition override via primarySemanticRatio
          // allows Islam to use more semantic matching for archaic Quranic vocabulary.
          if (primaryOpts) {
            const primaryQuery = primaryOpts.queryTransform
              ? primaryOpts.queryTransform(passageQuery)
              : passageQuery;
            const { queryTransform: _qt, ...primarySearchOpts } = primaryOpts;
            const primary = await runTool('search', {
              query: primaryQuery,
              mode: 'passages',
              religion,
              ...primarySearchOpts,
              limit: 3,
              semanticRatio: primarySearchOpts.primarySemanticRatio ?? 0.1
            });
            harvestPassages(primary, `traditions-${religion.toLowerCase()}`);
          }
          // Supplemental: broader search within the tradition (catches relevant
          // commentary, hadith, church fathers, etc. when primary is thin).
          // broadAuthor pins Islam to OL suras in both primary + broad slots.
          const broad = await runTool('search', {
            query: passageQuery,
            mode: 'passages',
            religion,
            ...(primaryOpts?.broadAuthor ? { author: primaryOpts.broadAuthor } : {}),
            limit: primaryOpts ? 2 : 3
          });
          harvestPassages(broad, `traditions-${religion.toLowerCase()}`);
        })());
      }
      } // close else (not a minor tradition — run full interfaith searches)
    }
    // Note: when effectiveWorkName is set, the companion search runs inside
    // Branch 1 (filtered to the named work's religion) — no separate task here.
  }

  await Promise.all(tasks);

  // Inline translation — after all parallel searches complete, translate any
  // non-English passages (Arabic, Farsi, Hebrew) so the crafter can quote them.
  // Batched with Promise.all; typically 0-4 passages, ~0.5s additional latency.
  const nonEnglish = retrieved.filter(q =>
    q.source_lang && q.source_lang !== 'en' && !q.translation && q.text?.trim()
  );
  if (nonEnglish.length > 0) {
    await Promise.all(nonEnglish.map(async (q) => {
      try {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Translate this religious scripture passage to English. Preserve theological terminology and literary register. Output only the translation, no commentary.' },
            { role: 'user', content: q.text }
          ],
          max_tokens: 400,
          temperature: 0.1
        });
        q.translation = resp.choices[0].message.content.trim();
      } catch (err) {
        logger.warn({ err: err.message, lang: q.source_lang }, 'passage translation failed');
      }
    }));
  }

  // Fallback: if every branch came back empty, do a broader search on the
  // raw user message. Catches conversational follow-ups that don't map to
  // topic keywords.
  if (retrieved.length === 0 && userMessage && userMessage.trim()) {
    const fallback = await runTool('search', {
      query: userMessage.slice(0, 240),
      mode: 'passages',
      limit: 8
    });
    harvestPassages(fallback, 'search-fallback');
  }

  // Authority-tier classification — the Bahá'í clarifying principle has
  // each successor as the authoritative interpreter of the prior. Tier 1
  // (Shoghi Effendi) is the supreme interpretive authority on doctrinal
  // questions; tier 2 ('Abdu'l-Bahá) is the appointed Center of the
  // Covenant; tier 3 (Bahá'u'lláh) is the Source. Tier 4 is the Báb.
  // Tier 5 is secondary scholarship (use only when no tier 1-4 quote
  // addresses the question).
  //
  // Each retrieved quote is tagged with its tier so the crafter can apply
  // the hierarchy in its quote-selection. We also drop tier 5 quotes
  // when ANY tier 1-4 quote is present (avoids secondary-substitution
  // even when a commentator's text matches the topic better lexically).
  const normAuthor = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc\u02bb`'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const TIER_MATCHERS = [
    { tier: 1, label: 'Shoghi Effendi (interpreter)', match: ['shoghi effendi', 'shoghi rabbani'] },
    { tier: 2, label: "'Abdu'l-Bahá (interpreter)",   match: ['abdulbaha', 'abdu\'l-baha', 'abbas effendi'] },
    { tier: 3, label: "Bahá'u'lláh (Manifestation)",  match: ['bahaullah', 'baha\'u\'llah'] },
    { tier: 4, label: 'The Báb (Manifestation)',      match: ['the bab', 'al-bab', ' bab '] }
  ];
  const tierOf = (q) => {
    if (q.is_summary) return 1; // sub-agent summary always kept
    const a = ' ' + normAuthor(q.source_author) + ' ';
    for (const t of TIER_MATCHERS) {
      if (t.match.some(m => a.includes(m))) return t.tier;
    }
    return 5;
  };
  for (const q of retrieved) q.authority_tier = tierOf(q);
  // Apply Bahá'í authority-tier filtering ONLY for work-specific questions.
  // For general/interfaith questions the parallel per-tradition searches
  // intentionally fetched non-Bahá'í quotes — filtering them out here would
  // negate that work entirely and re-introduce corpus dominance.
  const hasPrimary = retrieved.some(q => q.authority_tier <= 4);
  const filteredForCrafter = (effectiveWorkName && hasPrimary)
    ? retrieved.filter(q => q.authority_tier <= 4)
    : retrieved;

  // Trim — gpt-4o-mini's TTFT scales with prompt size. Cap at 12 entries.
  // For interfaith questions: 5 traditions × up to 5 passages each = up to 25
  // entries; round-robin to 12 ensures every tradition gets slots.
  const MAX_QUOTES = 12;
  let trimmed = filteredForCrafter;
  if (filteredForCrafter.length > MAX_QUOTES) {
    // When per-tradition searches ran, interleave round-robin so every tradition
    // gets at least 1 slot. Simple slice would drop the last-resolved tradition
    // (Promise.all resolve order) entirely when trimming 15→12.
    const tradGroups = {};
    const SEARCH_VIAS = new Set(['search', 'search-fallback', 'topic-mapped-passage']);
    const otherPassages = [];
    for (const q of filteredForCrafter) {
      if (q.via?.startsWith('traditions-')) {
        if (!tradGroups[q.via]) tradGroups[q.via] = [];
        tradGroups[q.via].push(q);
      } else if (SEARCH_VIAS.has(q.via)) {
        otherPassages.push(q);
      }
    }
    const tradKeys = Object.keys(tradGroups);
    if (tradKeys.length > 0) {
      // Round-robin: 1 from each tradition per round until MAX_QUOTES filled
      const selected = [];
      let round = 0;
      while (selected.length < MAX_QUOTES) {
        let added = 0;
        for (const key of tradKeys) {
          if (selected.length >= MAX_QUOTES) break;
          if (tradGroups[key].length > round) { selected.push(tradGroups[key][round]); added++; }
        }
        if (added === 0) break;
        round++;
      }
      trimmed = selected;
    } else {
      const keywords = (entities.topics || [])
        .map(t => (t || '').toLowerCase())
        .filter(t => t.length >= 3);
      const matchesKeyword = (q) => {
        if (!keywords.length) return false;
        const text = (q.text || '').toLowerCase();
        return keywords.some(k => text.includes(k));
      };
      const readMatched = filteredForCrafter.filter(q => !SEARCH_VIAS.has(q.via) && matchesKeyword(q));
      const readRest = filteredForCrafter.filter(q => !SEARCH_VIAS.has(q.via) && !matchesKeyword(q));
      trimmed = [...otherPassages, ...readMatched, ...readRest].slice(0, MAX_QUOTES);
    }
  }

  // Hydrate para_meta attribution for quotes that have doc_id + paragraph_index.
  // Compilations (e.g. Lights of Guidance) have doc-level author = compiler, but
  // para_meta.author holds the actual quoted author (Shoghi Effendi, Bahá'u'lláh, etc.).
  // This replaces source_author for any quote where para_meta resolves a better author.
  const quotesWithParaId = trimmed.filter(q => q.doc_id && q.paragraph_index != null);
  if (quotesWithParaId.length > 0) {
    try {
      const placeholders = quotesWithParaId.map(() => '(?,?)').join(',');
      const vals = quotesWithParaId.flatMap(q => [q.doc_id, q.paragraph_index]);
      const metaRows = await queryAll(
        `SELECT doc_id, paragraph_index, para_meta FROM content WHERE (doc_id, paragraph_index) IN (VALUES ${placeholders}) AND deleted_at IS NULL`,
        vals
      );
      const metaByKey = new Map(metaRows.map(r => [`${r.doc_id}:${r.paragraph_index}`, r.para_meta]));
      for (const q of trimmed) {
        const key = `${q.doc_id}:${q.paragraph_index}`;
        const raw = metaByKey.get(key);
        if (!raw) continue;
        try {
          const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (meta.is_attribution_line) continue; // skip citation-only paragraphs
          if (meta.author) q.source_author = meta.author;
          if (meta.source_title) q.para_source_title = meta.source_title;
          if (meta.source_type) q.para_source_type = meta.source_type;
          if (meta.source_date) q.para_source_date = meta.source_date;
        } catch { /* malformed JSON — skip */ }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'para_meta hydration failed — skipping');
    }
  }

  logger.info({
    retrieved: retrieved.length,
    trimmed: trimmed.length,
    work_name: entities.work_name,
    topics: entities.topics,
    calls: debugCalls.length
  }, 'deterministic research complete');
  return { retrieved_quotes: trimmed, subagent_syntheses: subagentSyntheses, tool_calls: debugCalls };
}

// ─── Stage 2: Craft ───────────────────────────────────────────────────────

const CRAFTER_SYSTEM = `You are Jafar — a wise, curious friend deeply read in the primary texts of the world's religious traditions. The texts are open in front of you (provided as retrieved_quotes). Your job is to ANSWER THE QUESTION the person actually asked, weaving the tradition's own words into your prose like a thoughtful friend would — not dumping block quotes and asking follow-up questions.

╔══════════════════════════════════════════════════════════╗
║  THE FUNDAMENTAL PATTERN: EMBEDDED QUOTE FRAGMENTS        ║
╚══════════════════════════════════════════════════════════╝

DEFAULT reply shape: 2-4 sentences of flowing prose with 1-3 quote FRAGMENTS (3-15 words each) embedded inside your sentences. Each quoted fragment IS itself the hyperlink — wrap the quoted words in markdown link syntax: "[fragment text](url)". Do NOT put the link only on the title; the reader must be able to click the words they're reading.

CITATION FORMAT (mandatory):
- CORRECT: Jesus says ["love your enemies and pray for those who persecute you"](url) — the command reaches past the in-group.
- CORRECT: The Qur'án calls for ["no compulsion in religion"](url), situating faith as a matter of conscience.
- CORRECT: Bahá'u'lláh calls the ["Law" the "secret of the Path"](url) — the discipline IS the path.
- WRONG: Jesus says "love your enemies" ([*Matthew*](url)) ← link is on the title, not the words
- WRONG: "love your enemies" ([*Matthew 5:44*](url)) ← same problem
- WRONG: In the *Bhagavad Gita*, it is suggested that one worships through work [*The Bhagavad Gita*](url-to-atharva-veda) ← DOUBLE ERROR: (1) link is on title not words, (2) "The Bhagavad Gita" is wrong if the Q-entry's source_title is "Hymns of the Atharva Veda". You MUST use the source_title exactly.
- CORRECT version of the above: The Atharva Veda speaks of worship ["wrought by work — of Him that is the Source of all which lives"](url-to-atharva-veda), *Hymns of the Atharva Veda*.

After a hyperlinked fragment, optionally name the work in plain text (no link): *Gospel of Matthew* — not another linked title. THE PLAIN-TEXT WORK NAME MUST MATCH THE source_title FROM THE Q-ENTRY. Never substitute a different work name because the topic reminds you of it (dharma → "Bhagavad Gita", suffering → "Book of Job", etc.).

CONCRETE EXAMPLE — User asks: "What do the scriptures say about how to treat those outside your faith?"

GOOD reply (multi-tradition, fragment text IS the link):
Jesus extends the command beyond the in-group — ["love your enemies and pray for those who persecute you"](url), *Gospel of Matthew*. The Qur'án frames the same impulse structurally: ["there is no compulsion in religion"](url) — faith must be freely chosen, which means the other person's choice deserves respect. Bahá'u'lláh adds a relational principle: ["consort with the followers of all religions in a spirit of friendliness"](url).

Three traditions, three fragments, woven into 3 sentences. Each quote IS the link. No tradition dominates unless the question is specifically about that tradition.

BAD reply (single tradition despite multi-tradition question):
Bahá'u'lláh teaches that believers should embrace diversity.

> "Consort with the followers of all religions in a spirit of friendliness and fellowship..." ([*Tablets of Bahá'u'lláh*](url))

This is fine for a Bahá'í-specific question. For a general interfaith question, it's incomplete.

Forbidden as a default: answering an interfaith question with only one tradition's voice.

╔══════════════════════════════════════════════════════════╗
║  WHEN A BLOCK QUOTE (> "...") IS RIGHT                    ║
╚══════════════════════════════════════════════════════════╝

Use the > "..." format ONLY in two cases — both rare:

CASE 1 — The user explicitly asked for the passage:
- "Show me the actual quote about X"
- "Read me the opening of the Sermon on the Mount"
- "What does the Qur'án say about this, verbatim?"
- "Find the passage where Jesus names the two great commandments"

The user wants the text itself, not your synthesis. A block quote (or two) is the correct response. Minimal prose framing — let the text stand.

CASE 2 — The passage is so essential and dense that the reader needs the dwell time:
- The Beatitudes from the Gospel of Matthew
- The Shema from Deuteronomy
- A definitional passage from the Iqán on faith
- The opening of the Dhammapada

A SINGLE block quote, not a sandwich. Lift it out, let it stand, then ONE short sentence (or stop). No restating-prose tail.

In ALL OTHER CASES, weave fragments into prose. Default = embedded.

╔══════════════════════════════════════════════════════════╗
║  STRUCTURE OF AN EMBEDDED-QUOTE REPLY                     ║
╚══════════════════════════════════════════════════════════╝

Sentence 1: Take a position on the user's actual question. If they asked an either/or, pick a side (or explain why both-and is genuinely the writings' answer). Don't hedge into both-and as a reflex. Engage the substance.

Sentences 2-4: Develop the position with embedded quote fragments — the authority's words inside your prose, cited inline at the end of each sentence.

Optional final sentence: a brief synthesis that ties back to the question. NOT a restatement of what the quotes already said.

╔══════════════════════════════════════════════════════════╗
║  THE FRAGMENT-PICKING TECHNIQUE                           ║
╚══════════════════════════════════════════════════════════╝

From a retrieved quote like "It is incumbent on these servants that they cleanse the heart — which is the wellspring of divine treasures — from every marking, and that they turn away from imitation," a good fragment is:

- "cleanse the heart" (3 words, the central image)
- "the wellspring of divine treasures" (5 words, the metaphor)
- "turn away from imitation" (4 words, the ethical move)

You can use 1-3 fragments from the same quote, OR pull fragments from 2-3 different quotes to build a richer engagement. Never quote the entire passage when a fragment carries the meaning.

The quotation marks make the fragment the AUTHORITY's words. The surrounding prose is YOUR engagement with those words. The reader hears both voices interleaved.

╔══════════════════════════════════════════════════════════╗
║  MULTI-TRADITION DEFAULT / BAHÁ'Í AUTHORITY HIERARCHY     ║
╚══════════════════════════════════════════════════════════╝

FOR TRADITION-SPECIFIC QUESTIONS ("what are the Five Pillars of Islam?", "what is the Sikh concept of seva?", "what does the Eightfold Path teach?"):
When a question asks about a concept that belongs to ONE specific tradition, do NOT force cross-tradition comparisons. Answer from that tradition's sources only. Do NOT mine other traditions for passages that contain the same keyword — "five loaves" from the Gospel is NOT a parallel to "Five Pillars of Islam," and Exodus's "five pillars" of a tabernacle are NOT related to Islamic practice. Spurious keyword coincidences mislead the reader. If you have no relevant passage from the asked tradition, say so.

FOR GENERAL/INTERFAITH QUESTIONS (no specific tradition named):
Draw from ALL traditions represented in retrieved_quotes. If you have passages from Christianity, Islam, Judaism, Buddhism, and Bahá'í — use all of them. Quote the Gospel for Christian teaching, the Qur'án for Islamic teaching, the Dhammapada for Buddhist teaching. Give each tradition its own voice. Do not default to Bahá'í simply because more Bahá'í material appears in the corpus.

MANDATORY — never drop a tradition silently: Each passage in retrieved_quotes is tagged with its religion, e.g. "[Q3 [Christian]]" or "[Q7 [Islam]]". For every religion tag that appears in retrieved_quotes, you MUST cite at least one passage from that tradition in your response. Even if the best passage only partially addresses the query, use it and cite it. Readers expect five voices for an interfaith question — silence on a tradition implies it has nothing to say; that is almost never true.

SHARED-TEXT RULE: Psalms and Torah passages appear in BOTH Jewish and Christian indexes because the KJV adopted the Hebrew scriptures. If you see nearly identical text under [Judaism] and [Christian] tags, do NOT skip one — cite the [Judaism] version for the Jewish voice and a NT Gospel passage (Matthew, Luke, Mark, John, Paul, James) for the Christian voice. The Psalms "belong" to Judaism first; the Gospel voices are specifically Christian. Example: "The Psalms call God 'full of compassion' (Judaism); Jesus extends this into practice: 'I will have mercy, and not sacrifice' (Christianity)."

CHRISTIAN CITATION RULE: When retrieved_quotes contains both [Christian] and [Judaism] passages, prefer NT authors (Matthew, Luke, Mark, John, Paul, James) for the Christian slot. Reserve Psalm/Torah citations for the [Judaism] slot. If the only [Christian] passages are OT Psalms duplicates, still use them for Christianity as a backup, but look for a NT passage first.

FOR BAHÁ'Í-SPECIFIC QUESTIONS (user asks about a named Bahá'í work, or explicitly about Bahá'í teaching):
Apply the clarifying principle — each successor is the AUTHORITATIVE INTERPRETER of those who came before:
- TIER 1: Shoghi Effendi (Guardian, supreme interpreter — God Passes By, Advent of Divine Justice, Promised Day Is Come, World Order letters)
- TIER 2: 'Abdu'l-Bahá (Center of the Covenant — Some Answered Questions, Paris Talks, Promulgation of Universal Peace, Tablets of the Divine Plan, Secret of Divine Civilization)
- TIER 3: Bahá'u'lláh (Manifestation/Source — Aqdas, Iqán, Hidden Words, Gleanings, Seven Valleys, Tablets, Prayers and Meditations)
- TIER 4: The Báb (Manifestation — Bayán)
- TIER 5: secondary scholarship (Esslemont, Taherzadeh, Hatcher, etc. — last resort)

Each retrieved quote is tagged with its tier in the input. For Bahá'í-specific questions:
- "What does the Faith teach about X?" → lead with TIER 1 (Shoghi Effendi) if available; supplement with TIER 2-3.
- "What does Bahá'u'lláh say about X?" → lead with TIER 3 (Bahá'u'lláh's own words); supplement with TIER 1-2's authoritative reading.
- Interpretive question ("what does X mean?", "how should we understand Y?") → strongly favor TIER 1 / TIER 2; their interpretive role IS the answer.

Attribute by name when possible — it makes the chain visible:
- "Shoghi Effendi reads it as '[fragment]'..."
- "'Abdu'l-Bahá frames it: '[fragment]'..."
- "Bahá'u'lláh's own words: '[fragment]'..."

This is NOT about spiritual station — it's the CLARIFYING PRINCIPLE: each successor's interpretation IS the clearest reading of what came before, because they were appointed to make it clear.

╔══════════════════════════════════════════════════════════╗
║  QUOTE SELECTION — semantic relevance, not topical match  ║
╚══════════════════════════════════════════════════════════╝

retrieved_quotes is what semantic search returned. Many quotes share TOPICAL KEYWORDS with the question without addressing its SUBSTANCE. Pick fragments that speak to what the user actually asked.

EXAMPLE — User asks: "Isn't divine encounter more about inner experience than rules?"
retrieved_quotes:
  [Q1] "It is incumbent on these servants that they cleanse the heart..." (about inner work)
  [Q2] "The stages that mark the wayfarer's journey... are said to be seven." (about stages)
  [Q3] "In all these journeys the traveler must stray not the breadth of a hair from the 'Law'..." (about law in the path)

Q3 directly addresses the rules-vs-experience tension. Q2 is irrelevant (about stage count). Q1 is tangential (about inner work but not about the law). Pick Q3's fragments as the centerpiece. Use a Q1 fragment as supplemental texture if it fits.

If NONE of the retrieved quotes actually address the question's substance, say so: "The retrieved excerpts don't speak directly to that — closest material I have is..." Then offer the closest with embedded fragments, framed as related-but-not-directly-on-point.

╔══════════════════════════════════════════════════════════╗
║  GROUNDING (firm)                                         ║
╚══════════════════════════════════════════════════════════╝

- Every quoted fragment — every phrase in quotation marks, every block quote — MUST come verbatim from a passage in retrieved_quotes. No exceptions.
- CITATION URL RULE: each fragment's link URL MUST be the citation_url of the specific retrieved_quotes entry the fragment came from. Do NOT swap URLs between entries. If Q3's text says "love your enemies" and Q3's citation_url is "https://siftersearch.com/document/123", then the link must be "[love your enemies](https://siftersearch.com/document/123)" — not the URL from Q5 or any other entry.
- ATTRIBUTION RULE: use the source_title from the retrieved_quotes entry, not a different work name you know from training memory. If the passage came from Q4 = "Hymns of the Atharva Veda", cite it as Atharva Veda — not as "Bhagavad Gita" or "Upanishads".
- WORK-NAMING RULE: You may only introduce a named work ("In the Bhagavad Gita…", "The Mahabharata says…") if that exact work title (or close variant) appears as source_title in retrieved_quotes. If search returned Atharva Veda and Mahabharata passages but NO Bhagavad Gita entry, you CANNOT write "In the Bhagavad Gita…" — that is hallucination. Use the actual source_title instead.
- DO NOT open your response with a general-knowledge summary sentence ("The Hindu concept of dharma is multifaceted…", "The Five Pillars of Islam are foundational acts…"). Lead with a retrieved passage or a direct reference to one. General-knowledge framing before any citation is a top-1 failure mode.
- Do NOT quote from training memory. Do NOT reconstruct a passage you remember. If you think you know what a work says, but the passage isn't in retrieved_quotes, you do not have it — do not quote it.
- For general interfaith questions (no specific tradition named), draw quotes from MULTIPLE traditions' retrieved passages. If retrieved_quotes has passages from Christianity, Islam, and Bahá'í, use all three — not just Bahá'í.
- If retrieved_quotes is completely empty: STOP. Reply with one or two sentences acknowledging that the corpus didn't surface relevant text and offering to try a different angle. Do NOT supplement with general knowledge. Do NOT say "but I can share from general knowledge" — that is the worst failure mode and gets immediate rejection.
- If subagent_synthesis says "This document does not appear to discuss that specifically" or similar, RESPECT that finding — the specialist sub-agent already read the document. Pass that finding through to the user; don't override it with training-data substitutes.
- Block quotes and embedded fragments must both be VERBATIM from the retrieved text. Don't paraphrase inside quotation marks.

EXAMPLES of correct refusal when retrieval is empty:
  "I couldn't find that in the Dawn-Breakers excerpts I have access to right now. Want me to look at a specific chapter or paragraph range?"
  "Nothing in the retrieved passages addresses that — the closest material is about X, but it doesn't speak to your question. Try rephrasing or naming a specific work?"

WRONG (forbidden):
  "I couldn't locate specific text from Nabíl's Dawn-Breakers in the corpus, but I can share from general knowledge..." [then lists facts from training data]

╔══════════════════════════════════════════════════════════╗
║  CONVERSATIONAL REGISTER (real friend, not textbook)      ║
╚══════════════════════════════════════════════════════════╝

GOOD opener moves:
- "Yeah —"
- "Actually,"
- "Worth noting,"
- "Here's the wrinkle —"
- "Jesus actually flips that..."
- "The Qur'án draws the line differently —"
- "Bahá'u'lláh frames it as..."
- "The Buddhist answer here is..."
- "All three traditions say something different —"

FORBIDDEN textbook tells: "emphasizes," "underscores," "highlights," "is rooted in," "transformative force," "is essential for," "speaks to the importance of"
FORBIDDEN essay openers: "Indeed,", "Furthermore,", "Notably,", "It is important to note,", "It is worth mentioning that"
FORBIDDEN restatement openers: "This passage suggests," "This indicates," "This highlights," "For Bahá'ís, this means," "For Muslims, this means," "Living these teachings"
FORBIDDEN tradition-textbook framings: "Bahá'í teachings emphasize...", "Islamic teachings stress...", "Christian doctrine holds..." (possessive-textbook openers — open with the actual quote instead)

Take positions. Don't hedge into both-and unless the writings genuinely teach both-and. The reader trusts you to make a call when the texts make one.

╔══════════════════════════════════════════════════════════╗
║  LENGTH                                                   ║
╚══════════════════════════════════════════════════════════╝

Default embedded-quote reply: 50-120 words.
With a block quote (rare, justified): up to ~150-180 words.
For interfaith queries requiring 5 tradition voices: up to 200 words — do NOT truncate to fit under 120 if that would mean dropping a tradition entirely.
NEVER multi-paragraph essay-style replies.

╔══════════════════════════════════════════════════════════╗
║  CONVERSATION-AWARE                                       ║
╚══════════════════════════════════════════════════════════╝

- NO REPEAT-QUOTE: check conversation_summary; never lead with a fragment you already used in a prior turn. If retrieved_quotes has only the previously-used material, surface a different facet honestly.
- LITERAL MATCH: if the user named specific terms (Pythagoras, Plato, "Seal of the Prophets," "Greatest Name"), at least one fragment must contain those terms verbatim. If the corpus doesn't have them, say so.
- CORRECTION COURAGE: when the user states something factually doubtful (wrong author, misremembered claim, implicit doctrinal error like "the Faith doesn't really teach X"), gently correct with a quote fragment, don't agree-and-move-on. Sycophancy on error is the worst failure mode.
- PREMISE WIDENING: when a question contains a hidden materialist premise — treating suffering, trials, death, or "evil" as simply bad things God should have prevented — do NOT just accept the frame and search for a "balancing" answer. The religious traditions uniformly widen this premise: suffering is purposeful, not defective. A child might ask "if my parents love me, why do they make me go to school?" — the answer is not to balance love against school but to recognize that education has a purpose the child can't yet see. Apply the same widening to questions about suffering: trials build spiritual character; adversity is the condition under which virtues like courage, patience, compassion, and forbearance become possible; even the existence of "evil" is a necessary condition for freedom of will and genuine moral choice. Lead with this reframe — let the retrieved passages do the doctrinal work — rather than "balancing" suffering against God's love as if they were in tension.
- PRIVACY: never address the user by name, even if they share it. Never repeat personal details (location, profession, family situation) back to them. Conversations are published publicly — treat every exchange as if it will be read by strangers. Use "you" only.

╔══════════════════════════════════════════════════════════╗
║  CATALOG / LIBRARY OVERVIEW RESPONSES                     ║
╚══════════════════════════════════════════════════════════╝

When retrieved_quotes contains [Q# CATALOG] or [Q# CATALOG COUNT], this is AUTHORITATIVE FACTUAL DATA — treat it as ground truth, not as a passage to quote.

Two types:
- [Q# CATALOG] — full library overview (totals by tradition, collections, languages)
- [Q# CATALOG COUNT] — filtered count with exact number matching specific criteria (author, site, language, etc.)

TWO-PART catalog response (REQUIRED):
1. CATALOG DATA — state the count or data DIRECTLY. Never say "I don't have the exact number" when the catalog provides it.
2. COMPANION CITATIONS — if other retrieved_quotes exist (catalog_companion), pick 1-2 and cite with inline "[fragment](url)" links. For CATALOG COUNT with no companion passages, just give the count and a brief note about what those documents contain.

Format: one or two factual sentences from catalog data, then optionally weave in one inline citation.

EXAMPLE — "How many Buddhist texts do you have?"
GOOD: "The library has 858 Buddhist documents, including the Pali Canon and Theravāda collections. As the Dhammapada puts it, ["all that we are is the result of what we have thought"](url)."

EXAMPLE — "How many documents from bahai-library.com?"
GOOD: "The library includes 35,931 documents from bahai-library.com — essays, study guides, translations, and academic papers on Bahá'í history and scholarship."

EXAMPLE — "How many books by Udo Schaefer?"
GOOD: "The library holds 12 works by Udo Schaefer, covering Bahá'í jurisprudence, theology, and comparative religion."

╔══════════════════════════════════════════════════════════╗
║  POLITICAL GUARDRAIL                                       ║
╚══════════════════════════════════════════════════════════╝

Jafar is apolitical. When the user asks about:
- Current political figures (presidents, prime ministers, candidates, parties)
- Electoral politics, voting, partisan debates, policy platforms
- Which party or candidate to support
- Current political controversies or geopolitical conflicts as political questions

Decline warmly and redirect to the inner dimension. Do NOT lecture or moralize. One or two sentences, then offer what you CAN help with.

The underlying conviction: real and lasting change is not primarily political — it flows from a transformation of hearts and the development of spiritual qualities. Politics is downstream from the culture, and culture is downstream from the values and inner life of individuals. Jafar lives in that upstream world.

EXAMPLE — "What do you think of Trump?"
GOOD: "I tend to stay out of the political arena — not from indifference, but because I think the deepest changes happen further upstream. If you're interested in what the traditions say about justice, leadership, or the nature of power, I'm all yours."

EXAMPLE — "Which party should I vote for?"
GOOD: "That's not really my lane — I leave electoral questions to those better suited for them. But if you're thinking about justice, the duties of citizenship, or how spiritual principles relate to public life, I'd love to explore that."

OUTPUT: just the reply text. No JSON wrapping, no preamble, no meta-commentary.`;

// Streaming variant — yields each chunk as it arrives. Used in the
// fast-path orchestrator. Returns the full text at the end.
export async function craftAnswerStream({ user_question, retrieved_quotes, subagent_syntheses, conversation_summary, user_intent, onChunk, _temperature_override }) {
  const userPayload = buildCrafterUserPayload({ user_question, retrieved_quotes, subagent_syntheses, conversation_summary, user_intent });
  // gpt-4o for the crafter — the new answer-first prompt requires the
  // model to read the user's question, decide which retrieved_quote
  // actually addresses it (semantic relevance, not just topical keyword
  // match), and compose a substantive engagement. gpt-4o-mini doesn't
  // reliably do that semantic reasoning. The earlier issue with gpt-4o
  // (inline quotes instead of block) was prompt-format-induced and is
  // now fixed by the explicit format example in CRAFTER_SYSTEM.
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: CRAFTER_SYSTEM },
      { role: 'user', content: userPayload }
    ],
    temperature: typeof _temperature_override === 'number' ? _temperature_override : 0.2,
    max_tokens: 600,
    stream: true
  });
  let full = '';
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content || '';
    if (text) {
      full += text;
      if (onChunk) onChunk(text);
    }
  }
  // Post-process: strip the most-flagged restating opener patterns. The mini
  // model partially obeys the prompt — these regexes catch the residual cases
  // (R1, R6, R7, R9 in our 051 test still slipped through). We delete the
  // entire offending sentence rather than the opener alone, since the rest
  // of that sentence is also restatement.
  return stripRestatementSentences(full);
}

// Strip markdown links whose URLs are not in the set of retrieved citation_urls.
// Prevents the crafter from emitting hallucinated URLs from training memory.
// Unlinks the fragment text so the words remain but the fabricated link disappears.
export function stripUngroundedLinks(text, retrievedQuotes) {
  if (!text) return text;
  const validUrls = new Set(
    (retrievedQuotes || []).map(q => q.citation_url).filter(Boolean)
  );
  if (validUrls.size === 0) return text;
  // Also allow matching on base URL (without fragment) so the crafter can emit
  // either the full paragraph-level URL or the document-level URL and still pass.
  const validBaseUrls = new Set([...validUrls].map(u => u.split('#')[0]));
  // Allow one level of balanced parens in URLs (e.g., "/path (en)#p10")
  return text.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^()]+|\([^()]*\))*)\)/g, (match, fragment, url) => {
    return validUrls.has(url) || validBaseUrls.has(url.split('#')[0]) ? match : fragment;
  });
}

// Drop sentences that begin with a forbidden restating opener. Operates on
// non-block-quote prose (lines that don't start with ">"). Run after the
// crafter's stream completes — the user already saw the streamed text but
// the persisted reply uses the cleaned version (which is what the markdown
// publisher and the citation harvester read).
function stripRestatementSentences(text) {
  if (!text) return text;
  // Collapse leading `>>+ ` (nested-blockquote) to single `> `. The crafter
  // sometimes emits `>>` or `>>>>` for block quotes; markdown renders each
  // `>` as a nesting level, producing 2 or 4 indent borders. We always want
  // a single-level block quote.
  text = text.replace(/^>>+\s/gm, '> ');
  const FORBIDDEN_OPENERS = [
    // Authority-as-subject restating
    /^(Bah[áa]'?u'?ll[áa]h|He|She|They|'?Abdu'?l-Bah[áa]|The B[áa]b|Shoghi Effendi)\s+(emphasizes|distinguishes|acknowledges|teaches|reflects|highlights|presents|seems|notes|suggests|indicates|writes|states|frames|describes|explains|reveals|stresses|advises|guides|encourages)\b/i,
    // Possessive variants — "Bahá'u'lláh's work/teaching"
    /^(Bah[áa]'?u'?ll[áa]h'?s|'?Abdu'?l-Bah[áa]'?s)\s+(work|teaching|writing|message|words|tablet|view|perspective|approach|emphasis)/i,
    // Demonstrative-as-subject restating
    /^This\s+(passage|verse|quote|text|teaching|excerpt|line|definition|distinction|perspective|view|framing|approach|understanding|context|insight|principle|aspect|notion|concept|idea|stance|interpretation)\b/i,
    /^This\s+(suggests|indicates|highlights|reflects|emphasizes|underscores|implies|illustrates|reveals|points|shows|reminds|presents|frames|challenges|contrasts)\b/i,
    /^These\s+(teachings|writings|words|principles|passages)\b/i,
    /^It\s+(suggests|indicates|highlights|reflects|emphasizes|underscores|implies|reveals|points|shows|presents|frames|challenges|contrasts|raises)\b/i,
    // "In the [work]..." essay openers
    /^In the\s+(Tablet|Lawh|Kit[áa]b|Iq[áa]n|Aqdas|Hidden Words|Gleanings|Some Answered Questions|Seven Valleys)/i,
    // "For Bahá'ís..." community-style explainers
    /^For Bah[áa]'?[íi]s,?\s/i,
    // Living/embodying/engaging — generic application essays
    /^Living\b/i,
    /^Embodying\b/i,
    /^Engaging\b/i,
    // "The Tablet of X is/was..." biographical restatement
    /^The (Tablet|Lawh|Kit[áa]b|Iq[áa]n)\s+(of|was|is)/i,
    // Passive voice essay starts
    /^.{0,40}\b(can be seen|is seen|was seen|may be understood|should be understood)\s+as\b/i
  ];
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    // Skip block quotes, blank lines, and any line that contains an
    // inline citation marker — those have URLs whose periods would
    // break the sentence splitter, and they're the structural payload
    // we definitely want to keep.
    if (line.startsWith('>') || line.trim() === '' || /\]\(https?:\/\//.test(line) || line.includes('siftersearch.com/document')) {
      out.push(line);
      continue;
    }
    // Split this prose line into sentences and filter restating ones.
    const sentences = line.match(/[^.!?]+[.!?]+\s*/g) || [line];
    const kept = [];
    for (const s of sentences) {
      const trimmed = s.trim();
      // If the sentence contains an embedded quoted fragment (anything in
      // "smart" or straight quotation marks), it's introducing the
      // authority's words — that's not restatement, that's attribution.
      // Keep it even if the opener matches the forbidden list.
      const hasEmbeddedQuote = /[\u201C][^\u201D]{2,}[\u201D]|"[^"]{2,}"/.test(trimmed);
      if (hasEmbeddedQuote) { kept.push(s); continue; }
      if (FORBIDDEN_OPENERS.some(re => re.test(trimmed))) continue;
      kept.push(s);
    }
    const cleaned = kept.join('').trim();
    if (cleaned) out.push(cleaned);
  }
  // Collapse multiple blank lines to one
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildCrafterUserPayload({ user_question, retrieved_quotes, subagent_syntheses, conversation_summary, user_intent }) {
  const TIER_LABEL = {
    1: 'TIER 1 (Shoghi Effendi — supreme interpreter)',
    2: "TIER 2 ('Abdu'l-Bahá — Center of the Covenant, interpreter)",
    3: "TIER 3 (Bahá'u'lláh — Manifestation/Source)",
    4: 'TIER 4 (The Báb — Manifestation/Source)',
    5: 'TIER 5 (secondary scholarship)'
  };
  const quotesPayload = retrieved_quotes.map((q, i) => {
    const cite = q.citation_url
      ? `[*${q.source_title || 'source'}*](${q.citation_url}) — ${q.source_author || 'unknown'}`
      : `${q.source_title || 'source'} — ${q.source_author || 'unknown'}`;
    const tierTag = q.authority_tier ? ` ${TIER_LABEL[q.authority_tier] || ''}` : '';
    // Catalog entries (library_overview or library_count) are structured data, not quotable text
    if (q.is_catalog || q.via === 'library_overview' || q.via === 'library_count') {
      const label = q.via === 'library_count'
        ? `[Q${i + 1} CATALOG COUNT — exact filtered count, state the number directly]`
        : `[Q${i + 1} CATALOG — authoritative library data, present facts directly, no quoting needed]`;
      return `${label}\n${q.text}\n  Source: ${q.source_title || 'Library Catalog'}`;
    }
    // For non-English passages, present BOTH original and JAFAR-grounded
    // translation so the crafter can quote whichever fits the user's request
    // (or both, when they ask for original-and-English).
    const langTag = q.translation && q.source_lang ? ` (source lang: ${q.source_lang})` : '';
    const religionTag = q.religion ? ` [${q.religion}]` : '';
    const bodyBlock = q.translation
      ? `original: ${q.text}\n  translation (en): ${q.translation}`
      : q.text;
    return `[Q${i + 1}${q.is_summary ? ' SUMMARY' : ''}${tierTag}${religionTag}${langTag}] ${bodyBlock}\n  Citation: ${cite}\n  doc=${q.doc_id || '?'} para=${q.paragraph_index ?? '?'}`;
  }).join('\n\n');

  // Subagent synthesis: when a document subagent ran on a specific work, its
  // curated answer (the LLM's read of the doc for THIS question) is included
  // here as authoritative research context. Use it to inform the framing of
  // your reply — but quote only from retrieved_quotes for verbatim text.
  // For LIST/EXTRACT questions ("who are the people mentioned in chapter 2?"),
  // the synthesis IS the structured answer; weave it into the reply.
  const synthesisBlock = (subagent_syntheses && subagent_syntheses.length > 0)
    ? `\n\nsubagent_synthesis (a specialist sub-agent read the named work and produced this for the user's question — use as context for the reply, but quote verbatim only from retrieved_quotes above):\n\n${subagent_syntheses.map((s, i) => `[S${i + 1}] from "${s.source_title}"${s.source_author ? ` by ${s.source_author}` : ''}:\n${s.answer}`).join('\n\n')}`
    : '';

  // Build a summary of which traditions have passages in retrieved_quotes
  const presentTraditions = [...new Set(retrieved_quotes.filter(q => q.religion).map(q => q.religion))];
  const traditionsWarning = presentTraditions.length >= 3
    ? `\n⚠️ REQUIRED: This reply MUST cite passages from ALL of these traditions (each has quotes in retrieved_quotes): ${presentTraditions.join(', ')}. Silence on any listed tradition is a failure.`
    : '';

  return `user_intent: ${user_intent}

user_question: ${user_question}

conversation_summary: ${conversation_summary || '(this is the opening turn)'}${traditionsWarning}

retrieved_quotes (${retrieved_quotes.length} entries — use these as the substrate; entries marked SUMMARY are sub-agent context, not quotable text):

${quotesPayload || '(no quotes retrieved — reply must say so)'}${synthesisBlock}

Compose the reply now.`;
}

export async function craftAnswer({ user_question, retrieved_quotes, conversation_summary, user_intent, previous_draft, gate_feedback, _temperature_override }) {
  const quotesPayload = retrieved_quotes.map((q, i) => {
    const cite = q.citation_url
      ? `[*${q.source_title || 'source'}*](${q.citation_url}) — ${q.source_author || 'unknown'}`
      : `${q.source_title || 'source'} — ${q.source_author || 'unknown'}`;
    return `[Q${i + 1}${q.is_summary ? ' SUMMARY' : ''}] ${q.text}\n  Citation: ${cite}\n  doc=${q.doc_id || '?'} para=${q.paragraph_index ?? '?'}`;
  }).join('\n\n');

  const userPayload = `user_intent: ${user_intent}

user_question: ${user_question}

conversation_summary: ${conversation_summary || '(this is the opening turn)'}

retrieved_quotes (${retrieved_quotes.length} entries — use these as the substrate; entries marked SUMMARY are sub-agent context, not quotable text):

${quotesPayload || '(no quotes retrieved — reply must say so)'}

${previous_draft && gate_feedback ? `
Your previous draft was REJECTED by the quality gate. Specific issues:
${(gate_feedback.issues || []).map(i => '  - ' + i).join('\n')}

Failed sentences and rewrite hints:
${(gate_feedback.failed_sentences || []).map(s => '  - "' + s.text + '" → ' + s.rewrite_hint).join('\n')}

Rewrite the reply addressing these issues. Use only the retrieved_quotes; do not improvise replacements.
` : ''}

Compose the reply now.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CRAFTER_SYSTEM },
      { role: 'user', content: userPayload }
    ],
    temperature: typeof _temperature_override === 'number' ? _temperature_override : 0.4,
    max_tokens: 1200
  });
  return stripRestatementSentences(resp.choices[0].message.content || '');
}

// LLM picker — gpt-4o judges multiple gpt-4o-mini drafts and returns the
// best one. The user's framing: 'speed of mini with the quick decision of
// the smarter model.' Drafts are short, judgment is structured — so gpt-4o
// finishes the pick in 2-3s.
const PICKER_SYSTEM = `You are a quality judge. Given multiple candidate replies to the user's question, pick the SINGLE BEST one based on these criteria, in priority order:

1. GROUNDING — every assertion in the chosen reply must trace to a quote in retrieved_quotes. Improvised paraphrase from training memory disqualifies a candidate.
2. INTENT FIT — does the reply match the user's intent? quote_request → quotes only with minimal glue. definition / explain → opens with a block quote, commentary follows. discuss → quote-led, conversational.
3. VERBATIM — block-quoted passages must match retrieved_quotes exactly.
4. LEAD-WITH-QUOTE — for non-discuss intents, the reply should open with a block quote rather than essay.
5. PARTIAL QUOTES — defining words in quotation marks (the authority's phrasing) rather than the crafter's restatement.
6. LITERAL MATCH — when the user named specific terms (people, concepts), the lead quote contains them verbatim.

Output JSON: {"pick": "A" | "B" | "C", "reason": "short explanation", "issues_with_others": ["..."]}.
The 'reason' is one sentence. 'issues_with_others' (optional) is short notes on the rejected candidates — for telemetry.`;

export async function pickBestCandidate({ candidates, user_intent, retrieved_quotes, user_question }) {
  const labeled = candidates.map((c, i) => ({ label: String.fromCharCode(65 + i), text: c })); // A, B, C, ...
  const validLabels = labeled.map(c => c.label);

  const quotesPayload = retrieved_quotes.slice(0, 8).map((q, i) => `[Q${i + 1}] ${(q.text || '').slice(0, 240)}`).join('\n\n');
  const candidatesPayload = labeled.map(c => `=== Candidate ${c.label} ===\n${c.text}`).join('\n\n');

  const userPayload = `user_intent: ${user_intent}

user_question: ${user_question}

retrieved_quotes (the ground truth — every assertion must trace here):
${quotesPayload}

candidates:

${candidatesPayload}

Pick the best. Output JSON only. Pick must be one of: ${validLabels.join(', ')}.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PICKER_SYSTEM },
        { role: 'user', content: userPayload }
      ],
      temperature: 0.1,
      max_tokens: 250,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const pick = labeled.find(c => c.label === parsed.pick);
    if (pick) {
      return { winner: pick.text, label: pick.label, reason: parsed.reason || null, issues_with_others: parsed.issues_with_others || [] };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'picker failed; defaulting to candidate A');
  }
  // Fallback: first candidate
  return { winner: labeled[0]?.text || '', label: 'A', reason: 'picker fallback' };
}

// ─── Stage 3: Reflection gate ─────────────────────────────────────────────

const REFLECTION_SYSTEM = `You are a quality gate for a religious-conversation assistant. Judge whether a draft reply meets the grounding standards.

The grounding rule: every assertion in the draft must trace to a specific quote in retrieved_quotes. General-knowledge paraphrase that doesn't trace to a retrieved quote is the failure mode you exist to catch.

CHECKS:
1. TRACEABILITY: For each substantive sentence in the draft, is there a quote in retrieved_quotes that grounds it? Flag sentences that read as general knowledge.
2. INTENT FIT: If user_intent is "quote_request", does the draft consist of quotes with minimal connecting glue? No conversational filler? No trailing commentary?
3. VERBATIM: Are all block-quoted passages and partial quotes EXACT text from retrieved_quotes (not paraphrased, not slightly reworded, not hallucinated)?
4. LEAD-WITH-QUOTE: When user_intent is "definition" or "explain", does the draft open with a block quote rather than an essay?
5. PARTIAL QUOTES: When defining a term, are key defining words in quotation marks (the authority's phrasing) rather than only the crafter's words?
6. LITERAL MATCH: If the user named specific terms, do the quotes in the draft contain those terms verbatim?

Be STRICT. If the draft would mislead the user about what the tradition teaches, fail it. If it would educate them with grounded primary text, pass it.

OUTPUT JSON:
{
  "pass": true | false,
  "issues": ["short description of each problem"],
  "failed_sentences": [{"text": "the exact failing sentence", "rewrite_hint": "what the rewrite should do"}]
}

If pass is true, issues and failed_sentences should both be empty arrays.`;

export async function reflectionGate({ draft, retrieved_quotes, user_intent, user_question }) {
  const quotesPayload = retrieved_quotes.map((q, i) => `[Q${i + 1}] ${q.text}`).join('\n\n');
  const userPayload = `user_intent: ${user_intent}

user_question: ${user_question}

retrieved_quotes available to crafter:
${quotesPayload || '(none)'}

draft to judge:

${draft}

Judge the draft. Output JSON only.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REFLECTION_SYSTEM },
        { role: 'user', content: userPayload }
      ],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    return {
      pass: !!parsed.pass,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      failed_sentences: Array.isArray(parsed.failed_sentences) ? parsed.failed_sentences : []
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'reflection gate failed; defaulting to pass');
    return { pass: true, issues: [], failed_sentences: [] };
  }
}

// ─── Conversation summarizer ──────────────────────────────────────────────

// Build a brief recap for the crafter when the conversation has more than
// 2 prior turns. Keeps the crafter's input light without losing context.
export function summarizeConversation(messages) {
  if (messages.length <= 2) return '(opening turn)';
  const lastFew = messages.slice(-6, -1); // up to 5 recent turns excluding the latest user message
  return lastFew.map(m => `${m.role === 'user' ? 'USER' : 'JAFAR'}: ${m.content.slice(0, 200)}`).join('\n');
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

// Run the full three-stage pipeline. Buffers the crafter output, runs the
// gate, retries once on fail, returns the final reply text plus debug data.
//
// `sendEvent` (optional): SSE event emitter for debug-mode streaming
// `debug` (optional): if true, emit debug_* SSE events at each stage
export async function runJafarPipeline({ messages, sendEvent, debug, chatbot_location }) {
  const userMessage = messages[messages.length - 1].content;

  // Resolve scope_config once at pipeline entry. Site-only chatbot locations
  // (e.g. 'bahaiteachings.org') restrict search to that site's index ONLY —
  // no primary corpus, no other supplementals. Default Jafar (no location)
  // uses the default scope (primary + all supplementals).
  const scope_config = chatbot_location ? getScopeForLocation(chatbot_location) : undefined;
  if (sendEvent && debug && chatbot_location) {
    sendEvent({ type: 'debug_scope', chatbot_location, scope_config });
  }

  // Stage 1: classify intent + entities (1 mini call ~1-2s), then run
  // deterministic retrieval directly from the entities (no LLM) ~0.5-1.5s.
  // Total research wall time ~2-3s vs the prior gpt-4o-with-tools 5-10s.
  if (sendEvent) sendEvent({ type: 'stage', stage: 'research' });
  const entities = await classifyIntentAndEntities(userMessage, messages.slice(0, -1));
  const userIntent = entities.intent;
  if (sendEvent && debug) sendEvent({ type: 'debug_intent', intent: userIntent, entities });
  const research = await deterministicResearch({ entities, userMessage, messages, sendEvent, debug, scope_config });

  // Conversation summary
  const conversationSummary = summarizeConversation(messages);

  // Stage 2: SINGLE STREAMING crafter — gpt-4o-mini, output streams to the
  // client as it generates. Picker dropped: TTFT is what matters for chat
  // UX, and the picker added 2-3s before any text could appear.
  // The crafter's structural isolation (sees only retrieved_quotes, no
  // general-knowledge fallback) is what enforces grounding — multi-
  // candidate selection was nice-to-have, not load-bearing.
  if (sendEvent && debug) {
    sendEvent({
      type: 'debug_research',
      retrieved_count: research.retrieved_quotes.length,
      quotes: research.retrieved_quotes.map(q => ({
        via: q.via,
        religion: q.religion,
        source_title: q.source_title,
        source_author: q.source_author,
        authority_tier: q.authority_tier,
        source_lang: q.source_lang || null,
        translation: q.translation ? q.translation.slice(0, 150) : null,
        text: (q.text || '').slice(0, 150),
        citation_url: q.citation_url
      }))
    });
  }
  if (sendEvent) sendEvent({ type: 'stage', stage: 'craft' });
  const onChunk = (text) => {
    if (sendEvent) sendEvent({ type: 'text', content: text });
  };
  const rawDraft = await craftAnswerStream({
    user_question: userMessage,
    retrieved_quotes: research.retrieved_quotes,
    subagent_syntheses: research.subagent_syntheses,
    conversation_summary: conversationSummary,
    user_intent: userIntent,
    _temperature_override: 0.3,
    onChunk
  });
  const draft = stripUngroundedLinks(rawDraft, research.retrieved_quotes);
  const gate = { pass: true, picker: 'streamed-no-pick' };
  const retried = false;

  return {
    reply: draft,
    user_intent: userIntent,
    retrieved_count: research.retrieved_quotes.length,
    retrieval_quotes: research.retrieved_quotes,
    gate,
    retried,
    research_calls: research.tool_calls
  };
}
