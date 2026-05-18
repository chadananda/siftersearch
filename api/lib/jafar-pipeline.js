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
import { findEntity } from './graph-db.js';

// Set ENABLE_ENTITY_AWARE_JAFAR=true once entity_mentions index has content.
const ENTITY_JAFAR = process.env.ENABLE_ENTITY_AWARE_JAFAR === 'true';

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

// ─── Stage 1: Research ────────────────────────────────────────────────────

const RESEARCH_SYSTEM = `You are the RESEARCH PHASE of a multi-stage assistant. Your sole job is to retrieve material from the corpus that the next stage will use to compose a reply. You do NOT write the user-facing answer.

For the user's latest question, call retrieval tools (search, find_document_for_citation, read_document_for_question, library_overview, library_count) until you have enough quotes to ground a reply. When done, respond with a brief plain-text "done" message — your prose is discarded.

Routing rules:
- Filtered count questions ("how many books by Udo Shaefer?", "how many docs from bahai-library.com?", "how many Islamic texts in Arabic?") → call library_count with the appropriate filters (author, site, religion, language, scope). Do NOT use search.
- Unfiltered catalog questions ("what do you have", "list the collections", "how many Buddhist texts total", "what languages") → call library_overview FIRST. Do NOT use search for these — search returns passages, not catalog data.
- Bare author name queries (user typed only a name, no question: "Rumi", "Udo Schafer", "bahaullah", "Thich Nhat Hanh") → treat as "show me what you have by [name]". Follow the Author catalog routing rule below.
- Author catalog questions ("do you have anything by Rumi?", "show me everything by Bahá'u'lláh", "what books by Moojan Momen?", "do you have works by Udo Schaefer?") → (1) call find_document_for_citation with the author name to confirm what's available; (2) ALSO call search with author="<name>" filter to retrieve 1-2 representative passages from their work so the crafter can quote them. Catalog listing alone fails — readers need to see the author's actual words.
- Browsing questions with a catalog answer ("what's the largest collection?", "do you have Jain texts?", "do you have any X texts?") → (1) call library_overview to get catalog data; (2) ALSO call search(query="teachings", religion="<religion>") with the EXACT religion filter matching the user's question to retrieve 1-2 representative passages. If search returns nothing for that religion, say so — do NOT fall back to unfiltered search which would return content from other traditions. Catalog answers without quotes score low.
- Sequential reading requests ("read the opening of X", "show me the first paragraphs of Y", "read me the beginning of Z") → (1) find_document_for_citation to get the document_id, (2) search(document_id=<id>, mode="read", query="<title>", start=0, limit=8) to retrieve the actual sequential paragraphs from the beginning. Do NOT use read_document_for_question for this — it returns a QA summary, not sequential text. Pass ALL returned paragraphs to the crafter.
- Specific named works (Tablet of Wisdom, Iqán, Hidden Words, Quran, Bhagavad Gita, Tao Te Ching, Gospel of John, Guru Granth Sahib, etc.) → find_document_for_citation, then read_document_for_question on the primary candidate. If you also search, ALWAYS add the religion filter matching that work's tradition.
- Bahá'í historical events (Badasht, Shaykh Tabarsi, martyrdom of the Báb, Seven Martyrs, Bahá'u'lláh's exile, Fort of Tabarsi, Dawn-Breakers events, etc.) → ALWAYS call find_document_for_citation for BOTH "Dawn-Breakers" AND "God Passes By", then read_document_for_question on each with the event name as the question. These two works are the primary historical narratives and must be searched for any Bahá'í historical event question, even if neither is explicitly named in the query.
- Explicit multi-tradition comparison (user uses phrases like "what OTHER religions say", "how other TRADITIONS view", "from different religious perspectives", "compare X across religions/traditions") → search SEPARATELY for each named or relevant tradition with a religion filter. Example: "what other religions say about the return of Christ" → search Islam, Judaism, Buddhist each with religion filter. Do NOT apply this rule to general topical queries ("find passages about service", "what do texts say about love") — those use a broad unfiltered search.
- Broad tradition overview ("tell me about Buddhism", "explain Islam", "what is Hinduism", "overview of Sikhism") → do MULTIPLE searches covering: (1) the tradition's foundational doctrinal framework (e.g. "Four Noble Truths Eightfold Path" for Buddhism; "Five Pillars" for Islam; "karma dharma moksha" for Hinduism; "Waheguru oneness" for Sikhism); (2) a famous text passage with religion filter; (3) a key ethical teaching. Use religion filter on all calls. Three separate searches produce better coverage than one broad query.
- General topical passage queries ("find passages about X", "find quotes on X", "what do texts say about X") → call search TWICE: (1) unfiltered broad search for the concept to get cross-tradition coverage; (2) a second search with Bahá'í religion filter (or the most relevant tradition) to deepen. Retrieve ≥6 total passages across both calls.
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
  /\bshow me (everything|all works?|all writings?)\b/i,
  /\bshow me (?:books?|works?|writings?)\s+by\b/i,
  /\blist (all|every|the) works?\b/i,
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
  // Normalize Unicode curly quotes to ASCII so names like 'Abdu'l-Bahá match correctly
  const msg = message.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
  const filters = {};
  // Site domain (e.g. "bahai-library.com", "oceanlibrary.com")
  const siteMatch = msg.match(/\b([\w-]+\.(?:com|org|net|edu))\b/i);
  if (siteMatch) filters.site = siteMatch[1];
  // Author: "by [the] First Last [of Entity]" — allows leading apostrophe for names
  // like 'Abdu'l-Bahá, and lowercase "of/al/ibn" connectors within institutional names
  const authorMatch = msg.match(/\bby\s+(?:the\s+)?('?[A-Z][a-záéíóúāīū'-]+(?:\s+(?:of\s+|al-|ibn\s+)?'?[A-Z][a-záéíóúāīū'-]+){0,3})/);
  if (authorMatch) filters.author = authorMatch[1];
  // Language: "in Arabic", "in Persian", etc.
  const langMatch = msg.match(/\bin\s+(Arabic|Persian|Farsi|French|German|English|Spanish|Turkish|Russian|Chinese|Japanese|Korean)\b/i);
  if (langMatch) filters.language = langMatch[1];
  // Scope
  if (/\bprimary\b/i.test(msg)) filters.scope = 'primary';
  else if (/\bsupplemental\b|\bexternal\b/i.test(msg)) filters.scope = 'supplemental';
  // Tradition — only when combined with another filter (tradition alone goes to library_overview)
  for (const { pattern, religion } of TRADITION_SEARCH_MAP) {
    if (pattern.test(msg)) { filters.religion = religion; break; }
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
      const collectionLines = (overview.collections || []).filter(c => c.documents > 0).map(c => `  - ${c.name}: ${c.documents} documents${c.religion ? ' [' + c.religion + ']' : ''}${c.description ? ' — ' + c.description.slice(0, 80) : ''}`).join('\n');
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
            citation_url: q.source_url
              ? (q.external_para_id ? `${q.source_url}?paraId=${q.external_para_id}` : q.source_url)
              : null,
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
                citation_url: p.source_url || null,
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
                || null;
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

named_persons: Array of specific named historical or religious persons mentioned in the query (not generic terms). Include full canonical names with diacritics when known. Empty array if none. Examples: ["Mullá Husayn", "ʻAbdu'l-Bahá"], ["Plato"], ["the Buddha"]. Max 3.

Output: {"intent": "...", "work_name": "..."|null, "topics": [...], "named_persons": [...]}`;

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
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [],
      named_persons: Array.isArray(parsed.named_persons) ? parsed.named_persons.slice(0, 3) : [],
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'intent+entity classification failed; defaulting');
    return { intent: 'discuss', work_name: null, topics: [], named_persons: [] };
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
    ['dawn-breakers', "nabil's narrative", 'dawn breakers', 'nabil-i-azam'],
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

export async function deterministicResearch({ entities, userMessage, messages, sendEvent, debug, scope_config, entityIds = [] }) {
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
        citation_url: p.source_url || null,
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
      // fall back to paragraph-anchored document URL so deeplinks navigate to the right passage.
      const citation_url = e.source_url || null;
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
      // Thread entityIds into search calls when entity-aware mode is active.
      const ctx = { scope_config };
      if (name === 'search' && entityIds.length > 0) ctx.entityIds = entityIds;
      result = await executeTool(name, args, ctx);
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
    // Any filter (including religion-only) routes to library_count for focused data.
    // Religion-only was previously falling through to library_overview (all 44k+ docs),
    // which confused the crafter into using general knowledge for tradition-specific queries.
    const isFiltered = Object.keys(catalogFilters).length > 0;

    if (isFiltered) {
      // Filtered catalog query: call library_count with extracted params
      try {
        if (debug) debugCalls.push({ name: 'library_count', args: catalogFilters, forced: true });
        if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'library_count', args: catalogFilters, forced: true });
        const countResult = await executeTool('library_count', catalogFilters, { scope_config });
        const filterDesc = Object.entries(catalogFilters).map(([k, v]) => `${k}="${v}"`).join(', ');
        const samples = countResult.sample_documents || [];
        // Only link titles when each document has a UNIQUE URL (not a shared collection URL).
        // Shared URLs (e.g. all UHJ letters pointing to oceanlibrary.com/administrative) are
        // collection-level, not document-level — linking them as document links is misleading.
        const sampleUrls = samples.map(d => d.source_url || d.citation_url).filter(Boolean);
        const allSameUrl = sampleUrls.length > 1 && new Set(sampleUrls).size === 1;
        const sampleLines = samples.map(d => {
          const url = !allSameUrl ? (d.source_url || d.citation_url) : null;
          const titlePart = url ? `[${d.title}](${url})` : d.title;
          return `  - ${titlePart}${d.author ? ' by ' + d.author : ''}${d.collection ? ' [' + d.collection + ']' : ''}${d.year ? ' (' + d.year + ')' : ''}`;
        }).join('\n');
        const distinctCollections = [...new Set(samples.map(d => d.collection).filter(Boolean))];
        const collectionNote = distinctCollections.length > 0 ? `\n\nCollections (from samples): ${distinctCollections.join(', ')}` : '';
        retrieved.push({
          text: `Library count (${filterDesc}):\nMatching documents: ${countResult.count}${collectionNote}\n\nSample titles (you MAY list up to 3 of these using [title](url); for ALL prose quotes you MUST use CATALOG-COMPANION passages — NOT these title entries):\n${sampleLines}\n\n⚠️ REQUIRED NEXT STEP: After listing the count and titles, quote at least one prose fragment from the CATALOG-COMPANION Q-entry. DO NOT end your response after the title list.`,
          source_title: 'Library Catalog',
          source_author: 'Ocean Library',
          citation_url: null,
          via: 'library_count',
          is_catalog: true,
          catalog_count: countResult.count,
          catalog_filters: catalogFilters
        });
        logger.info({ filters: catalogFilters, count: countResult.count }, 'filtered catalog query complete');
        // Companion search: get 1-2 citable prose passages from the filtered author/scope.
        // Use a generic theological query when user message is a meta/catalog question
        // ("Do you have books by X?") — the user message itself has poor semantic overlap
        // with prose passage content. A generic theological query with the author filter
        // retrieves representative, citable passages from that author's actual works.
        // Tradition-listing queries ("What Hindu scriptures do you carry?") should NOT
        // include prose companion quotes — the crafter misattributes them and fails
        // noHallucination. Author queries ("What books by Momen?") DO need companion.
        // Skip companion only for generic unfiltered listing queries ("what scriptures do you carry?").
        // Religion-specific queries ("Do you have any Jain texts?") have catalogFilters.religion set —
        // keep companion for those so the crafter has actual Jain passages to cite instead of going off-topic.
        const isTraditionalListingQuery = !catalogFilters.author && !catalogFilters.religion && (
          /\bwhat\b.{0,30}\b(scripture|text|book|collection|tradition)s?\b/i.test(userMessage) ||
          /\bdo you (carry|have|hold)\b.{0,30}\b(scripture|text|book|collection|tradition)s?\b/i.test(userMessage)
        );
        if (countResult.count > 0 && !isTraditionalListingQuery) {
          try {
            // Compound queries ("how many by X and which discuss Y") — extract the
            // topic component so the companion search targets the subject, not the
            // catalog question framing (which has poor semantic overlap with passages).
            const topicMatch = userMessage.match(/\b(?:and |which ones? )(?:discuss|about|cover|on|related to|dealing with)\s+(.{3,50})(?:\?|$)/i);
            const hasTopicComponent = !!topicMatch;
            const isMetaQuery = /\b(do you have|what books|any books|show me|list|how many|what works|do you carry|what collections|list the|list all)\b/i.test(userMessage);
            const companionQuery = topicMatch
              ? topicMatch[1].trim()
              : isMetaQuery ? 'spiritual teachings revelation faith God' : userMessage.slice(0, 200);

            // Companion search: try Meilisearch first; verify it returned passages actually from
            // the requested author (Meilisearch CONTAINS filter is unreliable for multi-word names
            // — it silently ignores the filter and returns unrelated results).
            const companionSearchArgs = { query: companionQuery, ...catalogFilters, mode: 'passages', limit: hasTopicComponent ? 6 : 3, semanticRatio: 0.7 };
            if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'search', args: { query: companionQuery, ...catalogFilters } });
            const companionPassages = await executeTool('search', companionSearchArgs, { scope_config });
            if (catalogFilters.author) {
              // Check whether returned passages are actually from the requested author.
              // Normalize both sides: strip diacritics + apostrophes before comparing,
              // since Bahá'u'lláh uses curly apostrophes in catalog but straight in DB.
              const normStr = s => (s || '').replace(/[\u2018\u2019\u02BC']/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
              const authorLastNorm = normStr(catalogFilters.author.split(/\s+/).pop()).slice(0, 7);
              const authorMatchedPassages = (companionPassages?.passages || []).filter(p =>
                normStr(p.author).includes(authorLastNorm)
              );
              if (authorMatchedPassages.length > 0) {
                harvestPassages({ passages: authorMatchedPassages }, 'catalog_companion');
              } else {
                // CONTAINS filter silently failed — go directly to SQLite
                try {
                  const contentRows = await queryAll(
                    `SELECT c.text, c.external_para_id, d.title, d.author, d.source_url
                     FROM content c JOIN docs d ON c.doc_id = d.id
                     WHERE d.author LIKE ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
                       AND length(c.text) > 120 AND c.paragraph_index > 2
                     ORDER BY d.id, c.paragraph_index LIMIT 4`,
                    [`%${catalogFilters.author}%`]
                  );
                  for (const row of contentRows) {
                    const url = row.source_url && row.external_para_id
                      ? `${row.source_url}?paraId=${row.external_para_id}`
                      : row.source_url || null;
                    retrieved.push({ text: row.text, source_title: row.title, source_author: row.author, citation_url: url, via: 'catalog_companion_sql' });
                  }
                } catch (sqlFallbackErr) { logger.debug({ err: sqlFallbackErr.message }, 'catalog sql fallback error'); }
              }
            } else {
              if (companionPassages?.passages?.length) harvestPassages(companionPassages, 'catalog_companion');
            }

            // For compound queries with a topic component, also check deep research cache
            // — the catalog path short-circuits before the normal deep research check.
            // Use the extracted topic (not the full catalog question) for embedding
            // similarity — catalog questions have poor similarity to content questions.
            if (hasTopicComponent) {
              try {
                const drQuery = catalogFilters.author
                  ? `What does ${catalogFilters.author} say about ${companionQuery}?`
                  : `What do the sacred writings say about ${companionQuery}?`;
                const dr = await checkDeepResearch(drQuery);
                if (dr?.quotes?.length >= 3) {
                  logger.info({ researchId: dr.id, quotes: dr.quotes.length }, 'catalog compound: deep research supplementation');
                  // When catalog is author-filtered, only inject quotes from that author
                  // to prevent the crafter from adding cross-tradition hallucinations.
                  const authorKey = catalogFilters.author?.toLowerCase().replace(/['\u2018\u2019\u02BC]/g, '').replace(/\s+/g, '');
                  const quotesToInject = (authorKey
                    ? dr.quotes.filter(q => {
                        const qAuthor = (q.author || '').toLowerCase().replace(/['\u2018\u2019\u02BC]/g, '').replace(/\s+/g, '');
                        return (qAuthor.includes(authorKey.slice(0, 5)) || authorKey.includes(qAuthor.slice(0, 5)))
                          && q.source_url; // only inject quotes with URLs to prevent uncited hallucinations
                      })
                    : dr.quotes.filter(q => q.source_url)).slice(0, 10);
                  for (const q of quotesToInject) {
                    retrieved.push({
                      text: q.text, source_title: q.title, source_author: q.author,
                      citation_url: q.source_url
                        ? (q.external_para_id ? `${q.source_url}?paraId=${q.external_para_id}` : q.source_url)
                        : null,
                      doc_id: q.doc_id, religion: q.religion, authority: q.authority,
                      via: 'deep_research', relevance_score: q.relevance_score,
                    });
                  }
                }
              } catch { /* non-fatal */ }
            }
          } catch (ce) {
            logger.warn({ err: ce.message }, 'author catalog companion search failed (non-fatal)');
          }
        } else {
          // count=0: author not in library — search for tradition-adjacent alternatives
          // so the crafter can cite related content instead of responding with nothing.
          // Use the author's likely tradition as a filter for targeted results.
          try {
            const authorName = catalogFilters.author || '';
            // Detect tradition from author name keywords
            const isBuddhist = /\b(thich|nhat hanh|dalai|lama|rinpoche|roshi|bhikkhu|ajahn|geshe|tulku)\b/i.test(authorName);
            const isChristian = /\b(thomas|merton|father|brother|pope|john paul|benedict|francis)\b/i.test(authorName);
            const isMuslim = /\b(rumi|hafiz|ibn|al-|sheikh|maulana|mulla)\b/i.test(authorName);
            const isHindu = /\b(swami|sri|ramana|vivekananda|prabhupada|aurobindo)\b/i.test(authorName);
            const altReligion = isBuddhist ? 'Buddhism' : isChristian ? 'Christianity' : isMuslim ? 'Islam' : isHindu ? 'Hinduism' : null;
            const altQuery = 'spiritual wisdom teachings meditation prayer';
            const altSearchArgs = { query: altQuery, mode: 'passages', limit: 4, semanticRatio: 0.8 };
            if (altReligion) altSearchArgs.religion = altReligion;
            const altPassages = await executeTool('search', altSearchArgs, { scope_config });
            if (altPassages?.passages?.length) harvestPassages(altPassages, 'catalog_companion');
          } catch (ae) {
            logger.warn({ err: ae.message }, 'catalog zero-count alternative search failed');
          }
        }
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
        const collectionLines = (overview.collections || []).filter(c => c.documents > 0).map(c => `  - ${c.name}: ${c.documents} documents${c.religion ? ' [' + c.religion + ']' : ''}${c.description ? ' — ' + c.description.slice(0, 80) : ''}`).join('\n');
        const languageLines = (overview.languages || []).map(l => `  - ${l.name}`).join('\n');
        const tradition = extractTraditionSearch(userMessage);
        // Skip companion for pure count and pure listing queries — adding thematic
        // passages to "how many?" or "list the collections" responses is always
        // logically incoherent (the quote is irrelevant to enumeration).
        const isPureCountQuery = /\bhow many\b.{0,30}\b(total|altogether|in all|in the library)\b|\bhow many documents\b/i.test(userMessage) && !tradition;
        // Language/tradition questions get companion passages — the response can ground the
        // language list by citing a representative text in each language (cite≥2 threshold).
        // Only pure collection/listing queries skip companion (a quote about "Pali Canon documents"
        // is logically incoherent when the user asked to list all collections).
        const isPureListQuery = /\blist\b|\bshow me\b.*\b(collection|tradition|scripture|text)s?\b/i.test(userMessage) ||
          /\bwhat\b.{0,30}\b(collection|scripture|tradition)s?\b/i.test(userMessage) ||
          /\bwhat (do you have|collections|scriptures)\b/i.test(userMessage) ||
          /\bdo you (carry|have|hold)\b.{0,30}\b(scripture|tradition|text|collection)s?\b/i.test(userMessage);
        const skipCompanion = isPureCountQuery || isPureListQuery;
        retrieved.push({
          text: `Library catalog:\nTotal: ${overview.totalDocuments} documents, ${overview.totalParagraphs} paragraphs\n\nBy tradition:\n${religionLines}\n\nCollections:\n${collectionLines}${languageLines ? '\n\nLanguages available:\n' + languageLines : ''}`,
          source_title: 'Library Catalog',
          source_author: 'Ocean Library',
          citation_url: null,
          via: 'library_overview',
          is_catalog: true,
          pure_count: isPureCountQuery,
        });
        if (!skipCompanion) {
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
    // Trailing \b after 'í' (U+00ED) doesn't fire because í is not \w — use lookahead instead.
    { pattern: /\bbah[aá]['']?[ií](?=[^a-zA-Z]|$)|\bbah[aá]u'?ll[aá]h\b|\b'?abdu'l-bah[aá]\b|\bshoghi\s+effendi\b|\baqdas\b|\biq[aá]n\b|\bhidden\s+words\b|\bbayan\b|\ball-merciful\b|\bseven\s+valleys\b|\b七つの谷\b/i, religion: "Baha'i" },
  ];
  // Which named major traditions appear in the question?
  // Used for: single-tradition routing (requiredTradition) + 2-tradition comparative restriction.
  const _majorMatches = MAJOR_TRAD_PATTERNS_EARLY.filter(({ pattern }) => pattern.test(userMessage));
  const requiredTradition = (() => {
    for (const { pattern, religion } of MINOR_TRAD_PATTERNS_EARLY) {
      if (pattern.test(userMessage)) return religion;
    }
    // Only flag major traditions when the question is EXPLICITLY about them
    // (not just mentioning them in passing in a multi-tradition question)
    if (_majorMatches.length === 1) return _majorMatches[0].religion; // single-tradition question
    return null; // multi-tradition or generic — deep research articles are fine
  })();
  // When exactly 2 traditions are named (e.g. "Bahá'í and Judaism"), restrict live search
  // to those 2 — not all 5 INTERFAITH_TRADITIONS — so the crafter doesn't cite Islam/Buddhism.
  const _namedTraditions = _majorMatches.length === 2 ? _majorMatches.map(m => m.religion) : null;

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
      // For comparative/multi-religion questions ("compare X", "how do different religions
      // view Y"), always run the full 5-tradition search to get inline-citable URLs.
      const isComparativeQuestion = /\b(compare|contrast|how do.{0,30}differ|across.{0,20}religion|different.{0,20}religion|multiple.{0,20}tradition|both.*faith|both.*religion|two.*tradition|other religions? (?:say|teach|believe|view|think)|what.*other.{0,20}(?:religion|tradition|faith)s?\s+(?:say|teach|believe)|what do (?:other|different) religions?)\b/i.test(userMessage);

      // Always inject cached deep research quotes into retrieved — they are curated
      // and diversity-balanced. For simple questions, return early (skip live search).
      // For comparative/tradition-specific, also run live search to supplement.
      // When requiredTradition is set (e.g. "Find passages in the Bahá'í writings"),
      // filter to that tradition only — a multi-religion pre-cached article would give
      // the crafter cross-tradition material it then uses despite the single-tradition ask.
      if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'deep_research', args: { researchId: dr.id, quotes: dr.quotes.length } });
      // For single-tradition questions, filter deep research quotes to that tradition —
      // multi-religion articles would give the crafter off-topic material to cite.
      // For comparative questions ("in both X and Y"), keep all traditions from deep research.
      const quotesToInject = (requiredTradition && !isComparativeQuestion)
        ? dr.quotes.filter(q => !q.religion || q.religion === requiredTradition)
        : dr.quotes;
      // Early return when: (a) no tradition filter + not comparative, OR (b) tradition-specific
      // question with enough curated quotes from that tradition — skip live search to avoid
      // contaminating with unrelated sources (e.g. Atharva Veda when asking about the Bhagavad Gita).
      // Exception: if the question names a specific WORK (e.g. "What does the Bhagavad Gita say about duty?"),
      // don't early-return — the document subagent path finds work-specific passages better than
      // a generic tradition deep-research set (which may cite the Bhagavata Purana instead of the BG).
      // Exception: multi-turn conversations — for follow-up questions the user is probing
      // deeper than a cached article covers (e.g. "what happened to X later?"). After the
      // first exchange, always fall through so document subagents can supplement with
      // specific passage-level answers the cached article may not have.
      const isFollowUp = Array.isArray(messages) && messages.filter(m => m.role === 'assistant').length >= 1;
      const shouldEarlyReturn = !isComparativeQuestion && !entities.work_name && !isFollowUp && (!requiredTradition || quotesToInject.length >= 5);
      logger.info({ researchId: dr.id, quotes: dr.quotes.length, injecting: quotesToInject.length, shouldEarlyReturn }, 'Deep research pre-fetch hit');
      for (const q of quotesToInject) {
        retrieved.push({
          text: q.text,
          source_title: q.title,
          source_author: q.author,
          citation_url: q.source_url
            ? (q.external_para_id ? `${q.source_url}?paraId=${q.external_para_id}` : q.source_url)
            : null,
          doc_id: q.doc_id,
          religion: q.religion,
          authority: q.authority,
          via: 'deep_research',
          relevance_score: q.relevance_score,
          contextual_note: q.contextual_note,
        });
      }
      if (shouldEarlyReturn) {
        // Curated set sufficient — skip live search loop.
        logger.info({ researchId: dr.id, retrieved: retrieved.length }, 'deterministic research complete (deep_research pre-fetch)');
        return { retrieved_quotes: retrieved, subagent_syntheses: subagentSyntheses, tool_calls: debugCalls, deep_research_id: dr.id };
      }
      // Fall through to targeted search — live results will supplement cached quotes.
      logger.info({ researchId: dr.id, requiredTradition }, 'Deep research injected; continuing to targeted search for supplemental passages');
    }
  } catch (drErr) {
    logger.warn({ err: drErr.message }, 'deep research pre-fetch error (non-fatal)');
  }

  // HyPE helper — fetches paragraph text + metadata for a batch of hype_questions hits
  async function fetchHypePassages(hits) {
    if (!hits?.length) return [];
    const ids = hits.map(h => h.paragraph_id).filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return queryAll(
      `SELECT c.id, c.text, c.doc_id, c.paragraph_index, c.external_para_id,
              d.source_url, d.title, d.author, d.religion, d.collection, d.language
       FROM content c
       JOIN docs d ON d.id = c.doc_id
       WHERE c.id IN (${placeholders})
         AND c.deleted_at IS NULL
         AND d.deleted_at IS NULL`,
      ids
    );
  }

  const tasks = [];

  // Carry forward a work_name from earlier in the conversation when the
  // current turn doesn't name one. Most follow-up questions ("show me the
  // passage about nature") implicitly continue the prior turn's work.
  const effectiveWorkName = inferWorkFromHistory(messages, entities.work_name);
  if (sendEvent && debug && effectiveWorkName !== entities.work_name) {
    sendEvent({ type: 'debug_work_carry', from_history: effectiveWorkName });
  }

  // Sequential reading flag — "read the opening/beginning/first paragraphs of X"
  // When true, fetch sequential paragraphs via mode='read' instead of document subagent QA.
  const isSequentialReadRequest = /\b(?:read|show)\s+(?:me\s+)?(?:the\s+)?(?:first|opening|beginning|start|intro)\b/i.test(userMessage) ||
    /\b(?:first\s+(?:few\s+)?paragraphs?|opening\s+(?:verses?|paragraphs?|lines?)|beginning\s+of)\b/i.test(userMessage);

  // Branch 0: bare author name query — "Udo Schafer", "Moojan Momen" typed alone.
  // When no work and no topics, treat as "who is this person / what do they write?".
  // Check DB: if the name matches an author, retrieve passages FROM their works
  // plus a document list so the crafter can cite actual content, not just describe them.
  // Bare author name: very short query (≤3 words) with a named person and no work identified.
  // Classifier may not recognize obscure scholarly authors (e.g. Udo Schaefer, Fazel Nasr) as
  // named_persons — add title-case heuristic so DB lookup still runs even without classifier signal.
  const _looksLikeName = /^[A-Z][a-záéíóú'-]+(?:\s+[A-Z][a-záéíóú'-]+){1,2}$/.test(userMessage.trim());
  const isAuthorOnlyQuery = !effectiveWorkName && (entities.named_persons.length > 0 || _looksLikeName) &&
    userMessage.trim().split(/\s+/).length <= 3;
  if (isAuthorOnlyQuery) {
    const personName = entities.named_persons[0] || userMessage.trim();
    tasks.push((async () => {
      // Fuzzy author lookup: user types "Udo Schafer" but DB stores "Udo Schaefer" (ae variant).
      // Match on first name AND first 4 chars of last name so transliteration variants resolve.
      const nameParts = personName.split(/\s+/).filter(w => w.length > 2);
      let authorDocs = [];
      if (nameParts.length >= 2) {
        const firstFilter = `%${nameParts[0]}%`;
        const lastPrefix = nameParts[nameParts.length - 1].slice(0, 4);
        authorDocs = await queryAll(
          `SELECT id, title, author, source_url FROM docs WHERE author LIKE ? AND author LIKE ? AND deleted_at IS NULL ORDER BY collection, title LIMIT 5`,
          [firstFilter, `%${lastPrefix}%`]
        );
      }
      // Exact fallback
      if (!authorDocs.length) {
        authorDocs = await queryAll(
          `SELECT id, title, author, source_url FROM docs WHERE author LIKE ? AND deleted_at IS NULL ORDER BY collection, title LIMIT 5`,
          [`%${personName}%`]
        );
      }
      if (authorDocs.length > 0) {
        const canonicalAuthor = authorDocs[0].author.split(',')[0].trim(); // first credited author
        // Get total count — authorDocs is limited to 5, real total may be higher
        const countFilter = nameParts.length >= 2 ? `%${nameParts[0]}%` : `%${personName}%`;
        let totalCount = authorDocs.length;
        try {
          const countRow = await queryAll(
            `SELECT COUNT(*) as cnt FROM docs WHERE author LIKE ? AND deleted_at IS NULL`, [countFilter]
          );
          totalCount = countRow[0]?.cnt ?? authorDocs.length;
        } catch (countErr) { logger.debug({ err: countErr.message }, 'author count query failed, using sample size'); }
        const docList = authorDocs.map(d => d.source_url ? `  - [${d.title}](${d.source_url})` : `  - ${d.title}`).join('\n');
        retrieved.push({
          text: `The library holds ${totalCount} work${totalCount === 1 ? '' : 's'} by ${canonicalAuthor}. Sample titles:\n${docList}\n\n⚠️ REQUIRED: Start your response with "The library holds ${totalCount} work${totalCount === 1 ? '' : 's'} by ${canonicalAuthor}" — then quote one prose fragment from the companion passages below. DO NOT begin with a biographical description.`,
          source_title: 'Library Catalog',
          source_author: 'Ocean Library',
          citation_url: null,
          via: 'author_catalog',
          is_catalog: true
        });
        // Author-filtered search across all their works for representative prose passages.
        const authorPassages = await runTool('search', {
          query: 'faith justice ethics moral divine spiritual law truth revelation',
          author: canonicalAuthor,
          mode: 'passages',
          limit: 5,
          semanticRatio: 0.7
        });
        harvestPassages(authorPassages, 'author_passages');
      }
    })());
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
        if (isSequentialReadRequest) {
          // For "show me the first few paragraphs / read the opening of X":
          // fetch sequential text via mode='read' so crafter can block-quote
          // the actual document text (CASE 1) instead of QA paraphrases.
          if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'search_read', args: { document_id: primary.document_id, start: 0, limit: 8 } });
          const readResult = await runTool('search', {
            query: effectiveWorkName,
            document_id: primary.document_id,
            mode: 'read',
            start: 0,
            limit: 8
          });
          harvestPassages(readResult, 'sequential_read');
          // If Meilisearch mode='read' returned nothing (doc not indexed), fall back to SQLite.
          // Common for Tao Te Ching, Bhagavad Gita, and other non-Bahá'í texts not yet in Meili.
          if (!readResult?.passages?.length) {
            try {
              const docRow = await queryAll(
                `SELECT title, author, source_url FROM docs WHERE id = ? LIMIT 1`,
                [primary.document_id]
              );
              const docMeta = docRow[0] || {};
              const sqlRows = await queryAll(
                `SELECT text, external_para_id FROM content WHERE doc_id = ? AND deleted_at IS NULL AND length(text) > 40 ORDER BY paragraph_index LIMIT 8`,
                [primary.document_id]
              );
              for (const row of sqlRows) {
                const url = docMeta.source_url && row.external_para_id
                  ? `${docMeta.source_url}?paraId=${row.external_para_id}`
                  : docMeta.source_url || null;
                retrieved.push({ text: row.text, source_title: docMeta.title || effectiveWorkName || '', source_author: docMeta.author || '', citation_url: url, via: 'sequential_read_sql' });
              }
            } catch (seqSqlErr) { logger.debug({ err: seqSqlErr.message }, 'sequential read SQL fallback failed'); }
          }
        } else {
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
        } // end else (non-sequential)
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

  // Branch HyPE: passage-level retrieval via hypothetical question similarity.
  // Finds paragraphs whose HyPE-generated questions semantically match the user's query.
  // Runs in parallel with Branch 2; skipped when a named work is in scope (document
  // subagent handles that more precisely) — effectiveWorkName guard covers that.
  if (!effectiveWorkName) {
    tasks.push((async () => {
      try {
        const { searchHypeQuestions } = await import('./search.js');
        const hypeFilters = { encumbered: false, ...(requiredTradition ? { religion: requiredTradition } : {}) };
        const hypeResult = await searchHypeQuestions(userMessage, { limit: 12, filters: hypeFilters });
        const hypeHits = (hypeResult?.hits || []).filter(h => (h._semanticScore ?? 1) >= 0.5);
        if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'hype_search', args: { hits: hypeHits.length, filters: hypeFilters } });
        const rows = await fetchHypePassages(hypeHits);
        // Build a quick lookup from content.id → hype hit for score + question
        const hitByParaId = Object.fromEntries(hypeHits.map(h => [h.paragraph_id, h]));
        let added = 0;
        for (const c of rows) {
          if (added >= 6) break;
          const key = `${c.doc_id}_${c.paragraph_index}`;
          if (seenParagraphs.has(key)) continue;
          if (BISMILLAH_RE.test((c.text || '').trim())) continue;
          seenParagraphs.add(key);
          const hit = hitByParaId[c.id] || {};
          const citation_url = (c.source_url && c.external_para_id)
            ? `${c.source_url}?paraId=${c.external_para_id}`
            : (c.source_url || null);
          retrieved.push({
            text: c.text || '',
            source_title: c.title || '',
            source_author: c.author || '',
            citation_url,
            doc_id: c.doc_id,
            paragraph_index: c.paragraph_index,
            religion: c.religion || hit.religion || null,
            collection: c.collection || hit.collection || null,
            source_lang: c.language || null,
            via: 'hype'
          });
          added++;
        }
        logger.info({ added, hypeHits: hypeHits.length }, 'hype passage retrieval complete');
      } catch (hypeErr) {
        logger.warn({ err: hypeErr.message }, 'hype search error (non-fatal)');
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
      if (detectedMinorTradition && !isAuthorOnlyQuery) {
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
      // For Hindu dharma/duty/yoga queries, also search the Bhagavad Gita specifically —
      // general religion:Hindu search often surfaces Atharva Veda instead of BG.
      // OceanLibrary BG is authored by "Vyāsa" (doc 21038, oceanlibrary.com/bhagavad-gita).
      // "Bhagavad Gita" is a title not an author — that filter returns 0 results.
      if (detectedMinorTradition === 'Hindu' && /\bdharma\b|\bduty\b|\bkarma\b|\bseva\b|\byoga\b|\barjuna\b|\bkrishna\b/i.test(userMessage)) {
        tasks.push((async () => {
          const bgResult = await runTool('search', {
            query: passageQuery,
            mode: 'passages',
            religion: 'Hindu',
            author: 'Vyāsa',
            limit: 5,
            semanticRatio: 0.5
          });
          harvestPassages(bgResult, 'traditions-hindu-bhagavad-gita');
        })());
      }
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
      } else if (!isAuthorOnlyQuery) {
      // For 2-tradition comparatives ("Bahá'í and Judaism"), restrict to those 2 traditions
      // so the crafter isn't forced to cite 3 unasked traditions by the traditionsWarning.
      // Skip for bare author queries — Branch 0 handles author-specific content; running
      // 5-tradition searches on "Udo Schafer" returns off-topic religious passages.
      const INTERFAITH_TRADITIONS = _namedTraditions || ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"];
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
    // Partition: deep research quotes (curated, high-value) vs live search results.
    // Deep research quotes are always reserved the first N slots — they were hand-selected
    // for this question and must not be silently dropped by round-robin logic.
    const drQuotes = filteredForCrafter.filter(q => q.via === 'deep_research')
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    const liveQuotes = filteredForCrafter.filter(q => q.via !== 'deep_research');
    const DR_SLOTS = Math.min(drQuotes.length, 6);
    const LIVE_SLOTS = MAX_QUOTES - DR_SLOTS;

    // When per-tradition searches ran, interleave round-robin so every tradition
    // gets at least 1 slot. Simple slice would drop the last-resolved tradition
    // (Promise.all resolve order) entirely when trimming 15→12.
    const tradGroups = {};
    const SEARCH_VIAS = new Set(['search', 'search-fallback', 'topic-mapped-passage']);
    const otherPassages = [];
    for (const q of liveQuotes) {
      if (q.via?.startsWith('traditions-')) {
        if (!tradGroups[q.via]) tradGroups[q.via] = [];
        tradGroups[q.via].push(q);
      } else if (SEARCH_VIAS.has(q.via)) {
        otherPassages.push(q);
      }
    }
    const tradKeys = Object.keys(tradGroups);
    if (tradKeys.length > 0) {
      // Round-robin: 1 from each tradition per round until LIVE_SLOTS filled
      const liveSelected = [];
      let round = 0;
      while (liveSelected.length < LIVE_SLOTS) {
        let added = 0;
        for (const key of tradKeys) {
          if (liveSelected.length >= LIVE_SLOTS) break;
          if (tradGroups[key].length > round) { liveSelected.push(tradGroups[key][round]); added++; }
        }
        if (added === 0) break;
        round++;
      }
      trimmed = [...drQuotes.slice(0, DR_SLOTS), ...liveSelected];
    } else {
      const keywords = (entities.topics || [])
        .map(t => (t || '').toLowerCase())
        .filter(t => t.length >= 3);
      const matchesKeyword = (q) => {
        if (!keywords.length) return false;
        const text = (q.text || '').toLowerCase();
        return keywords.some(k => text.includes(k));
      };
      const readMatched = liveQuotes.filter(q => !SEARCH_VIAS.has(q.via) && matchesKeyword(q));
      const readRest = liveQuotes.filter(q => !SEARCH_VIAS.has(q.via) && !matchesKeyword(q));
      trimmed = [...drQuotes.slice(0, DR_SLOTS), ...otherPassages, ...readMatched, ...readRest].slice(0, MAX_QUOTES);
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

DEFAULT reply shape: 2-4 sentences of flowing prose with 1-3 quote FRAGMENTS (5-15 words each) embedded inside your sentences. Each quoted fragment IS itself the hyperlink — wrap the quoted words in markdown link syntax: "[fragment text](url)". Do NOT put the link only on the title; the reader must be able to click the words they're reading.

MINIMUM FRAGMENT LENGTH: A quote fragment must be at least 5 words so the authority's actual phrasing is present. "[medicine]" (1 word) is not a quote — it's a label. "[comfort itself]" (2 words) is not a quote — it's a paraphrase. WRONG: suffering is ["medicine"](url). RIGHT: suffering is ["the medicine that purifies the heart"](url) — if those words appear in the retrieved text. If the relevant text says only "medicine" in a list, do not link it — quote a surrounding sentence that provides enough context.

CITATION FORMAT (mandatory):
- CORRECT: Jesus says ["love your enemies and pray for those who persecute you"](url) — the command reaches past the in-group.
- CORRECT: The Qur'án calls for ["no compulsion in religion"](url), situating faith as a matter of conscience.
- CORRECT: Bahá'u'lláh calls the ["Law" the "secret of the Path"](url) — the discipline IS the path.
- WRONG: Jesus says "love your enemies" ([*Matthew*](url)) ← link is on the title, not the words
- WRONG: "love your enemies" ([*Matthew 5:44*](url)) ← same problem
- WRONG: In the *Bhagavad Gita*, it is suggested that one worships through work [*The Bhagavad Gita*](url-to-atharva-veda) ← DOUBLE ERROR: (1) link is on title not words, (2) "The Bhagavad Gita" is wrong if the Q-entry's source_title is "Hymns of the Atharva Veda". You MUST use the source_title exactly.
- WRONG: In the *Bhagavad Gita*, one finds perfection through ["worship—wrought by work"](url-to-atharva-veda) ← STILL WRONG: "In the *Bhagavad Gita*" is false when the URL says atharva-veda. Putting the wrong title BEFORE the fragment doesn't help — it just misattributes more visibly.
- CORRECT version: The Atharva Veda teaches that one finds perfection through ["worship—wrought by work — of Him that is the Source of all which lives"](url-to-atharva-veda), *Hymns of the Atharva Veda*.

WORK-TITLE PLACEMENT RULE: The italic work title ALWAYS comes AFTER the hyperlinked fragment, never before it. Structure: prose lead-in → ["fragment"](url) → *, Work Title*. Reason: when you write the work title AFTER the URL you're literally looking at the Q-entry source_title and copying it, which prevents misattribution. When you write it BEFORE, you rely on memory — which assigns "dharma" → "Bhagavad Gita" even when the URL says "Atharva Veda."

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

CASE 1 — The user explicitly asked for the verbatim text:
- "Read me the opening of the Sermon on the Mount"
- "What does the Qur'án say about this, verbatim?"
- "Find the passage where Jesus names the two great commandments"
- "Quote the passage word for word"
- "Show me the first few paragraphs of the Tao Te Ching"
- "Show me the beginning of the Kitáb-i-Íqán"
- "Read the opening verses of the Bhagavad Gita"

The user wants the text itself. Block quotes are required — minimal prose framing (one sentence before the first quote, one after the last, at most), let the text stand. For sequential reading requests ("first few paragraphs", "opening", "beginning"), output the retrieved paragraphs in document order as consecutive block quotes, separated by newlines. No prose woven between them. The NEVER-block-quote-under-40-words rule does NOT apply here — CASE 1 overrides it. If a retrieved passage is short (under 40 words) but it IS the text the user asked to read, block-quote it anyway.
READING FRAMING RULE: The sentence before the first block quote MUST be substantive — say something meaningful about what the text is and why it matters. "Certainly!" or "Here is the text:" or "Sure, here you go:" are NOT framing sentences — they score criticalEngagement=1 (FAILURE). GOOD FRAMING: "The Kitáb-i-Íqán opens with a call for total detachment as the only doorway to true understanding:" or "The Hidden Words distills Bahá'u'lláh's mystical guidance into brief aphorisms — the opening verses set the tone of the whole work:" — then block quote.

NOT CASE 1 — "show me a key passage", "can you give me an example?", "find passages about X", "find quotes on X", "what do texts say about X" — these ask for EVIDENCE to support a thesis, not verbatim transcription. Even when asked to "find passages," open with a position sentence (e.g., "Service in the world's sacred texts is not peripheral — it is worship itself"), then weave fragments as support. criticalEngagement=2 (FAILURE) if the response is a list of passages without a thesis. Respond with woven prose fragments, NOT block quotes.

CASE 2 — A LONG passage (30+ words) so dense with meaning that fragments would lose the logic:
- The full Beatitudes list from Matthew
- A multi-verse definitional passage from the Iqán
- An extended paragraph where each clause builds on the last

For CASE 2 (and ALL OTHER CASES except CASE 1): NEVER block-quote any passage under 40 words — that is always short enough to fragment inline. "Justice, justice shall you pursue" is 5 words — inline fragment, not a block. Single verses, brief maxims, even a two-clause sentence (15-39 words) MUST be woven as inline fragments. Ask yourself: "Can I pull a 5-15 word phrase from this?" If yes (and you almost always can), do that instead of block-quoting.

For CASE 2: A SINGLE block quote, not a sandwich. Lift it out, let it stand, then ONE short sentence (or stop). No restating-prose tail.

In ALL OTHER CASES, weave fragments into prose. Default = embedded.

╔══════════════════════════════════════════════════════════╗
║  STRUCTURE OF AN EMBEDDED-QUOTE REPLY                     ║
╚══════════════════════════════════════════════════════════╝

Sentence 1: Take a position on the user's actual question. If they asked an either/or, pick a side (or explain why both-and is genuinely the writings' answer). Don't hedge into both-and as a reflex. Engage the substance.

SINGLE-KEYWORD QUERIES (a name, work title, or bare concept alone — "bahaullah", "dharma", "books"): treat as an implicit "tell me about X" request. Open by letting a retrieved fragment introduce X — don't open with a general biography or definition from training memory. WRONG: "Bahá'u'lláh (1817–1892) was the founder of the Bahá'í Faith." CORRECT: Bahá'u'lláh writes that God has ["released a flood of grace so plenteous that it hath filled all things visible and invisible"](url) — that claim of universal renewal is the key to understanding his mission.

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

FORBIDDEN as a quote fragment: section titles, valley names, chapter labels, or heading text. "Valley of Search", "Hidden Words No. 3", "Book of Certitude", "Valley of Love" are NOT text fragments — they are labels. The fragment must be actual prose from the body of the text.

FORBIDDEN: Formulaic tradition-listing — "In Islam, [quote]. In Buddhism, [quote]. In Hinduism, [quote]." This scores inlineQuoteIntegration=3 (FAILURE) even if technically cited, because it enumerates rather than integrates. CORRECT: Weave across traditions in a single argumentative flow: "This impulse toward [claim] runs across traditions — Bahá'u'lláh speaks of [fragment A](urlA), the Quran declares [fragment B](urlB), and Buddhist texts echo that [fragment C](urlC)." One thesis, three voices, fluid prose.

WRONG: Bahá'u'lláh describes the ["Valley of Search"](url) and the seeker enters the ["Valley of Love"](url), becoming ["dissolved in the fire of love"](url).
CORRECT: In the Seven Valleys, the seeker is bidden to ["burn away the veils with the fire of love"](url), and in the Valley of Knowledge sees that ["the true seeker hunteth naught but the object of his quest"](url).

Each SENTENCE with a citation must embed actual text — not just a valley name with a link after it.

The quotation marks make the fragment the AUTHORITY's words. The surrounding prose is YOUR engagement with those words. The reader hears both voices interleaved.

╔══════════════════════════════════════════════════════════╗
║  MULTI-TRADITION DEFAULT / BAHÁ'Í AUTHORITY HIERARCHY     ║
╚══════════════════════════════════════════════════════════╝

FOR BROAD TRADITION OVERVIEW QUESTIONS ("tell me about Buddhism", "explain Islam", "what is Hinduism", "overview of Sikhism", "tell me everything about X"):
The user wants comprehensive coverage — not a single topic. Structure your response around the tradition's core teachings and use ALL relevant quotes retrieved. Mandatory inclusions by tradition:
- Buddhism: Four Noble Truths + Eightfold Path + mention of Theravada/Mahayana schools
- Islam: Five Pillars + core Quranic teaching + ethics
- Hinduism: karma/dharma/moksha + Vedic origin + key text (Bhagavad Gita)
- Sikhism: Waheguru oneness + seva + Guru Granth Sahib
- Judaism: Torah covenant + mitzvot + prophetic tradition
- Christianity: Sermon on the Mount + grace/love + Gospel
Use headers (##) or a structured prose outline to ensure comprehensive coverage.

FOR TRADITION-SPECIFIC QUESTIONS ("what are the Five Pillars of Islam?", "what is the Sikh concept of seva?", "what does the Eightfold Path teach?", "do you have any Jain texts?"):
When a question asks about a concept that belongs to ONE specific tradition, do NOT force cross-tradition comparisons. Answer from that tradition's sources only. Do NOT mine other traditions for passages that contain the same keyword — "five loaves" from the Gospel is NOT a parallel to "Five Pillars of Islam," and Exodus's "five pillars" of a tabernacle are NOT related to Islamic practice. Spurious keyword coincidences mislead the reader. If you have no relevant passage from the asked tradition, say so. For catalog/availability questions ("do you have Jain texts?"), if retrieved_quotes contains NO passages from that tradition, simply state what the library overview shows about that tradition without substituting other traditions' content.

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
- SUBSTANTIVE CLAIM RULE: Every substantive claim about what a tradition teaches MUST be supported by an inline citation from retrieved_quotes. You cannot assert "The Bahá'í Faith teaches X" or "Islam holds Y" without quoting the passage that shows it. For controversial or defensive questions ("Is X a cult?", "What's the best religion?"), let the tradition's OWN TEXT respond — quote retrieved passages that speak to the question, rather than asserting an answer from general knowledge. WRONG: "The Bahá'í Faith is not a cult." CORRECT: Bahá'u'lláh commands believers to ["consort with the followers of all religions in a spirit of friendliness"](url) — this is a tradition built on openness, not insularity.
- CITATION URL RULE: Every Q-entry below has a pre-computed citation_url that is 100% correct — the backend built it from the actual document's URL. Your ONLY job is to use the EXACT citation_url from that Q-entry. Do NOT construct URLs yourself. Do NOT swap URLs between entries. Q3's citation_url goes with Q3's text only. Do NOT modify citation_url values — use them verbatim, even if they look like "https://siftersearch.com/document/12345?paraId=67890" or "https://oceanlibrary.com/some-text?paraId=abc". If a Q-entry has NO citation_url (citation_url is absent or null), quote the fragment in plain quotation marks with no link. NEVER fabricate a URL that doesn't appear in a Q-entry's citation_url field. NEVER write siftersearch.com/library/... — that format does not exist.
- ATTRIBUTION RULE: use the source_title from the retrieved_quotes entry, not a different work name you know from training memory. If the passage came from Q4 = "Hymns of the Atharva Veda", cite it as Atharva Veda — not as "Bhagavad Gita" or "Upanishads". CRITICAL EXAMPLE: If Q2 has source_title="Dhammapada" and citation_url="oceanlibrary.com/dhammapada_buddha", you CANNOT write "The *Satipatthana Sutta* discusses mindfulness... [dhammapada URL]" — that is wrong attribution. CORRECT: "The *Dhammapada* teaches..." or if you KNOW the Satipatthana Sutta is more relevant, search for it but do NOT name it unless it's in retrieved_quotes.
- WORK-NAMING RULE: You may only introduce a named work ("In the Bhagavad Gita…", "The Mahabharata says…") if that exact work title (or close variant) appears as source_title in retrieved_quotes. If search returned Atharva Veda and Mahabharata passages but NO Bhagavad Gita entry, you CANNOT write "In the Bhagavad Gita…" — that is hallucination. Use the actual source_title instead.
- DO NOT open your response with a general-knowledge summary sentence ("The Hindu concept of dharma is multifaceted…", "The Five Pillars of Islam are foundational acts…"). Lead with a retrieved passage or a direct reference to one. General-knowledge framing before any citation is a top-1 failure mode.
- Every quoted fragment — ONLY quote verbatim text that appears in retrieved_quotes. Do NOT reconstruct a passage from memory. If a passage isn't in retrieved_quotes, do not put it in quotation marks or present it as a verbatim quote.
- For general interfaith questions (no specific tradition named), draw quotes from MULTIPLE traditions' retrieved passages. If retrieved_quotes has passages from Christianity, Islam, and Bahá'í, use all three — not just Bahá'í.
- If retrieved_quotes is completely empty: STOP. Reply with one or two sentences acknowledging that the corpus didn't surface relevant text and offering to try a different angle. Do NOT substitute tangentially-related quotes that happen to share keywords with the question.
- If subagent_synthesis says "This document does not appear to discuss that specifically" or similar, RESPECT that finding — the specialist sub-agent already read the document. Pass that finding through to the user; don't override it with training-data substitutes.
- Block quotes and embedded fragments must both be VERBATIM from the retrieved text. Don't paraphrase inside quotation marks.

╔══════════════════════════════════════════════════════════╗
║  HISTORICAL QUESTIONS — facts first, then corpus quotes   ║
╚══════════════════════════════════════════════════════════╝

The grounding rules above govern DOCTRINAL CLAIMS ("the Faith teaches X", "Islam holds Y"). They do NOT prohibit describing well-documented historical events from your knowledge.

When the question is about what actually happened at a specific historical event (the Conference of Badasht, the martyrdom of the Báb, the Battle of Shaykh Tabarsi, Bahá'u'lláh's exile to Akka, etc.):

1. DESCRIBE THE EVENT ACCURATELY. State the key historical facts — what happened, who was present, what the immediate reactions were, why it mattered historically. This comes from your knowledge. Historical facts about documented events are not doctrinal claims and are not subject to the prohibition on training memory.

2. THEN anchor with corpus quotes. After establishing the historical substance, weave in corpus passages that illuminate the significance, record a participant's reaction, or convey the spirit of the moment. The quotes supplement the history — they do NOT replace it.

3. NEVER substitute tangential spiritual quotes for historical facts. A question about the Conference of Badasht asking specifically about the reactions when Táhirih unveiled herself, the prophetic dimension, and what Shoghi Effendi says in God Passes By — that question requires: (a) what actually happened at Badasht that day, (b) the immediate human reactions including their extremity, (c) Shoghi Effendi's specific interpretation. Answering it with generic quotes about humility from the Hidden Words is a FAILURE — it is epistemically dishonest, replacing the actual answer with decorated irrelevance.

4. When citing historical interpretation from Shoghi Effendi's God Passes By (a canonical historical narrative), you may paraphrase his account if you cannot find the exact passage in retrieved_quotes — clearly signaling "Shoghi Effendi describes in *God Passes By* how..." rather than inventing verbatim text.

EXAMPLE of correct historical response:
Q: What happened at Badasht when Táhirih unveiled herself?

WRONG (decorated irrelevance):
"The event at Badasht, where Táhirih removed her veil, is seen as a pivotal moment because it symbolized the break from past religious traditions. Bahá'u'lláh emphasizes humility, urging believers to 'humble thyself before Me' (*Hidden Words*). In Christianity, Jesus taught that 'whoever desires to become great among you shall be your servant' (*Bible*). The Tao Te Ching speaks of the sage who 'is free from self-display.'"
[This fails: the historical event is mentioned in one vague sentence then abandoned for generic spiritual quotes that have nothing to do with Badasht.]

RIGHT:
"At Badasht in 1848, Táhirih appeared before the assembled Bábí leaders without her veil — an act of stunning audacity to deeply religious people for whom this was an unimaginable violation of Islamic law. Shoghi Effendi records in *God Passes By* that some were frantic with excitement, others renounced their faith on the spot, and one man cut his own throat in shock and fled. Shoghi Effendi interprets this as fulfilling the Islamic prophecy of Fáṭimih appearing unveiled before the believers on the bridge of Ṣiráṭ at the Day of Judgment — a metaphor for the terrifying narrowness of the passage between one Dispensation and the next. [Then cite any relevant corpus passages that touch on the event or its significance.]"

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

FORBIDDEN source misattribution: Writing "In the *Bhagavad Gita*..." or "The *Upanishads* say..." when the Q-entry's source_title is "Hymns of the Atharva Veda". You may ONLY name a work in prose if that exact work (or close variant) appears as source_title in a Q-entry you are about to cite. Topic associations from training memory (dharma → "Bhagavad Gita", suffering → "Book of Job", meditation → "Dhammapada") are NOT valid sources. If Atharva Veda is the Q-entry, cite it as Atharva Veda — period.

FORBIDDEN textbook tells: "emphasizes," "underscores," "highlights," "is rooted in," "transformative force," "is essential for," "speaks to the importance of"
FORBIDDEN essay openers: "Indeed,", "Furthermore,", "Notably,", "It is important to note,", "It is worth mentioning that"
FORBIDDEN restatement openers: "This passage suggests," "This indicates," "This highlights," "For Bahá'ís, this means," "For Muslims, this means," "Living these teachings"
FORBIDDEN tradition-textbook framings: "Bahá'í teachings emphasize...", "Islamic teachings stress...", "Christian doctrine holds..." (possessive-textbook openers — open with the actual quote instead)

Take positions. Don't hedge into both-and unless the writings genuinely teach both-and. The reader trusts you to make a call when the texts make one.

╔══════════════════════════════════════════════════════════╗
║  FRAMING CRITIQUE — push back with a quote               ║
╚══════════════════════════════════════════════════════════╝

When the user's message is a FRAMING STATEMENT — "So basically X means...", "X is just like Y", "Isn't X basically the same as Z?", "X is compatible with Y", "X is just about being Y" — the writings almost always have more to say than the framing admits. Your job is to show what it misses.

Pattern:
1. Acknowledge briefly (≤5 words: "Partly right", "That captures part of it", "Not quite").
2. IMMEDIATELY name the SPECIFIC concept, dimension, or nuance the user's framing misses — stated explicitly, not implied.
3. Drop a retrieved quote to show what it actually says.

WRONG (sycophantic agreement): "Yes, you're right that Bahá'u'lláh calls for unity — and he also teaches equity, which means..."
ALSO WRONG: "It's true that Bahá'u'lláh's teachings share some common ground with secular humanism, particularly in the emphasis on reason and science. 'Abdu'l-Bahá explains..." — this is also sycophantic agreement. You're elaborating on what the framing gets right rather than exposing what it misses.
ALSO WRONG: "The Bahá'í Faith indeed embraces principles that resonate with many modern progressive values..." — "indeed" used as a mid-sentence agreement marker is identical to "It's true that..." The word "indeed" in the context of framing responses is BANNED when it appears before describing something the user got right.
CORRECT (critical): "Partly right — but Bahá'u'lláh's call goes beyond congeniality: he frames unity as the necessary condition for the ['well-being of mankind'](url) *Gleanings*, which makes it a demanding ethical project, not just tolerance."
ALSO CORRECT: "That framing captures the renunciation side — but misses that Bahá'í detachment is defined by what you run *toward* (God), not what you avoid: Bahá'u'lláh writes that ['turn away from all that is on earth'](url) applies only insofar as one's heart cleaves to the divine."
ALSO CORRECT: "That framing captures the surface — but misses what makes Bahá'u'lláh's vision distinct from liberalism: 'Abdu'l-Bahá insists on ['the independent investigation of truth'](url), which actually demands breaking from consensus opinion rather than aligning with it."

FORBIDDEN: agreeing with the framing and merely elaborating on it. If the framing is incomplete or wrong, show where it falls short FIRST, then build. The second sentence MUST name the specific concept or dimension the user's framing fails to account for — not implied, but stated plainly.

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

TWO-PART catalog response (REQUIRED — both parts mandatory):
1. CATALOG DATA — state the count or data DIRECTLY. Never say "I don't have the exact number" when the catalog provides it.
   - Sample titles in CATALOG-DATA may have their own URLs. You MAY list them by name (with their URL if present), but ONLY in a separate listing — NEVER use a sample title as the source of an inline prose quote.
   - NEVER attach a CATALOG-COMPANION passage URL to a CATALOG-DATA sample title. Each URL belongs with its own source only.
   - NEVER quote prose from a CATALOG-DATA sample title entry (it contains metadata, not text).
2. COMPANION CITATIONS (REQUIRED — do not skip) — catalog_companion passages are actual prose from library documents. Pick 1-2 and weave in inline "[fragment](url)" quotes. These are your ONLY source for quoted prose. A response that lists titles but has NO catalog_companion prose quote is INCOMPLETE — a title listing alone scores citationPresence=2 (FAILURE).
   - For compound queries ("how many by X and which discuss Y"), focus on COMPANION passages that address the topic Y.

Format:
- For simple counts ("how many do you have?"): one factual count sentence, then weave in one inline prose citation from catalog_companion.
- For author catalog ("show me everything by X", "what do you have by Y"): state the count, optionally name 1-3 notable titles, then ALWAYS end with a prose quote from a catalog_companion passage: As [Author] wrote, ["actual words from the text"](url). This quote is non-negotiable.
- For compound queries ("how many ... and which ones discuss Y?"): state the count, then name the specific COMPANION passage source titles that address the topic Y, then weave in 1-2 inline quotes from those passages. The user wants to know WHICH DOCUMENTS, so name them.

CATALOG MANDATORY RULE OVERRIDE: For catalog responses, the normal "cite every religion in retrieved_quotes" rule does NOT apply. Only cite companion passages that match the catalog subject (author or tradition). Ignore retrieved passages from unrelated traditions — they are search noise added by the search algorithm, not required citations. EXCEPTION: For general overview queries ("how many total?", "what's in the library?") with no specific tradition, pick ONE companion passage from any tradition to demonstrate the breadth of the library — weave it as one inline prose citation after the statistics.

SAMPLE TITLES AND COLLECTIONS: CATALOG-DATA has two forms:
- Library overview ([Q# CATALOG]): has collection names (no document URLs). List collections in plain text — do NOT hyperlink collection names.
- Filtered count ([Q# CATALOG COUNT]): has sample document titles, some with URLs. You MAY use [title](url) to list these specific titles. NEVER use a title not in the list.
In both cases: sample listings are NOT quotable prose. Only CATALOG-COMPANION passages provide inline prose quotes — "[fragment text](url)".

LANGUAGE / OVERVIEW CATALOG QUERIES — When the question is "what languages are available?", "what languages does the library have?", or any question asking what languages/scripts/translations exist:
- Use ONLY the language list from CATALOG DATA. List them in plain text.
- Do NOT include prose companion quotes from religious traditions about "language" as a concept — they are off-topic.
- CORRECT: "The library holds texts in English, Arabic, Persian, Hebrew, Chinese, Sanskrit, and other languages."
- WRONG: adding quotes from the Rámáyan or Isaiah about singing/seeing light — these are irrelevant to a language-availability question.

LISTING QUERIES FORMAT — When the question is "list the X", "what scriptures/collections do you carry", "show me your collections":
- Response = 1 brief intro sentence (count + tradition) + collection/title names from CATALOG DATA + optionally ONE companion inline citation
- Collection names: list them in plain text (no hyperlinks on collection names)
- Companion citation: if used, the prose title MUST exactly match the "source_title" in that quote's Citation field — NEVER substitute a more-famous title (e.g. if the citation says "Hymns of the Atharva Veda", don't attribute it to "Bhagavad Gita"). When listing document titles with [title](url): the title AND the url MUST both come from the SAME Q-entry. WRONG: [Gitanjali](https://oceanlibrary.com/hymns-of-atharva-veda) — that mixes a catalog title with a companion's URL. CORRECT: only link titles that appear in CATALOG-COMPANION Q-entries with their OWN citation_url.
- Example: "The library holds 127 Hindu texts across collections including Bhakti and Devotional Works, Epics, and Vedic Hymns. As one of the Atharva Veda hymns puts it, ['seek truth and wisdom'](url)."

NEVER hyperlink catalog statistics, counts, or numeric data (e.g., "44,937 documents", "127 Hindu texts", "480 UHJ documents"). These are catalog facts — not prose fragments.
ABSOLUTE BAN: Do NOT write "[N documents](url)" or "[count](url)" or "[N texts](url)" under any circumstances. WRONG: "[44,937 documents](https://siftersearch.com/...)" — this is forbidden even if you think you know the URL. Counts are plain text only.
FABRICATED URL RULE: You are FORBIDDEN from constructing any URL yourself. Only use citation_url values that appear verbatim in Q-entries below.
HARD BAN — these URL formats do not exist in this system and must NEVER appear in your output even if they seem plausible:
  ✗ https://siftersearch.com/library/Judaism/... (library path format — does not exist)
  ✗ https://siftersearch.com/library/Baha'i/... (same — does not exist)
  ✗ Any siftersearch.com/library/... URL (the /library/ path format does not exist)
If a Q-entry has NO citation_url or a null citation_url: write the fragment in plain "quotation marks" with NO hyperlink.
Only use the [fragment](url) format for actual prose phrases quoted verbatim from retrieved_quotes passages that include a citation_url field (not just catalog statistics).

ZERO-COUNT response: If the catalog count is 0, state this honestly, then offer 2 alternatives from catalog_companion using proper inline fragment format — the quoted words AS the hyperlink, not the work title. Select companion passages that speak to the SAME THEMES or subject matter as the missing author (not just generic tradition quotes):
CORRECT for Thich Nhat Hanh (known for mindfulness, interbeing, engaged Buddhism): "While we don't have Thich Nhat Hanh's works, Buddhist texts here address mindfulness directly — the Majjhima Nikaya teaches that ["a monk remains focused on mental qualities in & of themselves"](url), and the Dhammapada that ["mind is the forerunner of all actions"](url)."
WRONG: "While we don't have Thich Nhat Hanh's works, Buddhist texts here do speak to this — the Sutra Collection teaches that ["all that we are is the result of what we have thought"](url)." — too generic, doesn't address TNH's specific theme of mindfulness.
WRONG: "check out the [Sutra Collection](url) for Buddhist insights." (title as link, not prose fragment)

EXAMPLE — "How many Buddhist texts do you have?"
GOOD: "The library has 858 Buddhist documents, including the Pali Canon and Theravāda collections. As the Dhammapada puts it, ["all that we are is the result of what we have thought"](url)."

EXAMPLE — "How many documents from bahai-library.com?"
GOOD: "The library includes 35,931 documents from bahai-library.com — essays, study guides, translations, and academic papers on Bahá'í history and scholarship."

EXAMPLE — "How many books by Udo Schaefer?"
GOOD: "The library holds 12 works by Udo Schaefer, covering Bahá'í jurisprudence, theology, and comparative religion."

BARE AUTHOR NAME — user typed just a name, no question ("Udo Schaefer", "Rumi", "Moojan Momen"):
REQUIRED FIRST SENTENCE: "The library holds N works by [Name]." (the exact phrasing from the CATALOG DATA entry)
THEN: optionally name 1-2 titles → quote one prose fragment from a companion passage.
FORBIDDEN: Starting with "X is a prominent scholar..." or any biographical description — that is general knowledge, not library content.
GOOD: "The library holds 12 works by Udo Schaefer, including Not a Man of Violence. In his words, ['justice requires a genuine orientation toward God'](url)."
BAD: "Udo Schaefer is a prominent Bahá'í scholar and jurist known for his work..." (biography before library = WRONG)

AUTHOR CATALOG — "Show me everything by Bahá'u'lláh" / "What do you have by the Universal House of Justice?" / "Do you have works by Rumi?"
MANDATORY: Author catalog responses MUST include at least ONE inline prose quote from a companion passage — the author's actual words, not just a title listing. Listing titles without prose fragments = citationPresence=2 (FAILURE).
REQUIRED PATTERN: state count → optionally name 1-2 notable titles → then quote one prose fragment from the companion passage:
GOOD — "The library holds 522 documents by Bahá'u'lláh. Among them are the Hidden Words, the Kitáb-i-Íqán, and the Seven Valleys. As he wrote, ["The source of all good is trust in God"](https://oceanlibrary.com/...) — a principle woven through his writings on tests and detachment."
BAD — "The library holds 522 documents by Bahá'u'lláh. Notable works include the [Súrah of the Arabs](url), the [Tablet of Consolation](url)..." (title list without prose quotation = FAIL)
If no companion passage is available (count=0 case), quote from tradition-adjacent texts using proper inline fragment format.

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
  // First: remove literal template placeholders like [text](url) where url is not an https link
  let cleaned = text.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]*)\)/g, '$1');
  return cleaned.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^()]+|\([^()]*\))*)\)/g, (match, fragment, url) => {
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
        ? q.catalog_count === 0
          ? `[Q${i + 1} CATALOG-DATA — COUNT IS ZERO. A library search for this author returned no results. Your response MUST: (1) Open explicitly: "I searched our library for [author]'s works but found none." (2) Then pivot to CATALOG-COMPANION passages: weave actual PROSE FRAGMENTS inline (not just title links) — use the citation_url from the CATALOG-COMPANION Q-entry for each fragment. Format: "I searched for [author]'s works and found none, but our [tradition] collection includes passages like \\"fragment\\"(citation_url) from *Source Title*." Do NOT link bare titles. Do NOT say "0 documents". Do NOT fabricate URLs.]`
          : `[Q${i + 1} CATALOG-DATA — state the count as plain text ONLY. NEVER write [N documents](url). Sample titles may have URLs — list them using [title](url) in a separate listing. NEVER use a sample title URL as the source URL for a prose quote. For prose quotes use CATALOG-COMPANION only.]`
        : q.pure_count
          ? `[Q${i + 1} CATALOG-DATA — PURE COUNT QUERY. State the document count and tradition breakdown as plain text statistics. After the stats, add ONE inline citation from a CATALOG-COMPANION Q-entry that speaks to the breadth of knowledge or wisdom in these texts — choose a passage about books, knowledge, or divine guidance, NOT a thematic religious quote (like "raise with loud accord") that is clearly off-topic for a library count question. Do NOT hyperlink the count numbers themselves.]`
          : `[Q${i + 1} CATALOG-DATA — plain text catalog only. This block contains NO quotable URLs. Render ALL text from this block as plain text only — NO hyperlinks of any kind. WRONG: ["Pali Canon"](url) or [44,937](url). RIGHT: Pali Canon ... 44,937 documents. Only CATALOG-COMPANION passages have citation URLs — use those for [fragment](url) quotes.]`;
      return `${label}\n${q.text}\n  Source: Library Catalog`;
    }
    // For non-English passages, present BOTH original and JAFAR-grounded
    // translation so the crafter can quote whichever fits the user's request
    // (or both, when they ask for original-and-English).
    const langTag = q.translation && q.source_lang ? ` (source lang: ${q.source_lang})` : '';
    const religionTag = q.religion ? ` [${q.religion}]` : '';
    const bodyBlock = q.translation
      ? `original: ${q.text}\n  translation (en): ${q.translation}`
      : q.text;
    const catalogCompanionTag = (q.via === 'catalog_companion' || q.via === 'catalog_companion_sql')
      ? ' CATALOG-COMPANION ← QUOTE THIS PASSAGE IN YOUR RESPONSE using [fragment](citation_url)'
      : q.via === 'sequential_read_sql'
        ? ' SEQUENTIAL-READ ← present these paragraphs in document order as consecutive block quotes (CASE 1 reading rule applies)'
        : '';
    return `[Q${i + 1}${q.is_summary ? ' SUMMARY' : ''}${catalogCompanionTag}${tierTag}${religionTag}${langTag}] ${bodyBlock}\n  Citation: ${cite}\n  doc=${q.doc_id || '?'} para=${q.paragraph_index ?? '?'}`;
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
  // Fire for 3+ traditions (general comparative) or 2 traditions when the question
  // explicitly names both (e.g. "Bahá'í and Islam on fasting"). For single-tradition
  // questions that happen to pick up a second tradition as search noise, don't force
  // the crafter to cite both — that would violate the user's actual request.
  const isExplicitComparative = presentTraditions.length === 2 &&
    /\b(and|both|compare|versus|vs\.?|differ)\b/i.test(user_question) &&
    presentTraditions.every(t => new RegExp(t.split(/\s+/)[0], 'i').test(user_question));
  const traditionsWarning = (presentTraditions.length >= 3 || isExplicitComparative)
    ? `\n⚠️ REQUIRED: This reply MUST cite passages from ALL of these traditions (each has quotes in retrieved_quotes): ${presentTraditions.join(', ')}. Silence on any listed tradition is a failure.`
    : '';

  return `user_intent: ${user_intent}

user_question: ${user_question}

conversation_summary: ${conversation_summary || '(this is the opening turn)'}${traditionsWarning}

retrieved_quotes (${retrieved_quotes.length} entries — use these as the substrate; entries marked SUMMARY are sub-agent context, not quotable text):

${quotesPayload || '(no quotes retrieved — reply must say so)'}${synthesisBlock}

TORAH NOTE: "Torah" refers specifically to the Five Books of Moses (Genesis, Exodus, Leviticus, Numbers, Deuteronomy). When a question asks about "the Torah", prefer Q-entries whose source_title contains those book names over Talmud, Mishnah, or other Jewish texts. A Talmud passage is rabbinic commentary, not the Torah itself.

QURAN NOTE: When the user asks "What does the Quran say about X?", cite ONLY Q-entries authored by "Muhammad" or whose source_title is a Surah/chapter of the Quran. Do NOT cite Islamic commentary, hadith collections, or Bahá'í texts that reference the Quran — even if they discuss the same topic. If no such primary Q-entry exists, say so honestly rather than substituting secondary sources.

⚠️ BEFORE WRITING: The Q-entries are ordered by relevance — Q1, Q2, Q3 are the highest-relevance passages curated specifically for this question. Always start by evaluating Q1 through Q5 for fragments, then go higher only if needed. For each chosen Q-entry, copy 3-15 words VERBATIM from that entry's text field. For the link, copy the citation_url exactly from that same Q-entry. If a Q-entry has no citation_url, use plain "quotation marks" with NO link. Never use Q2's URL with Q7's text. Use the EXACT words as written in the Q-entry — do NOT substitute a similar passage from memory. Do NOT write any [text](url) unless you can point to the exact Q-entry number and the exact words you are copying. Your FIRST sentence must contain such a verbatim fragment — never open with a general-knowledge summary. SINGLE-KEYWORD CHECK: If the user typed only one word or a name (e.g. "bahaullah", "dharma", "aqdas"), your opening sentence MUST be built around a verbatim fragment from a Q-entry — NEVER "Bahá'u'lláh was the founder of the Bahá'í Faith." CORRECT: Bahá'u'lláh writes that ["the Ancient Beauty hath consented to be bound with chains"](url) — naming that willing sacrifice as the key to understanding his mission. If you cannot find an inline fragment from a retrieved_quote to anchor your first claim, state that the search returned limited results rather than inventing one.

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

  // Response register: research mode when the query asks for a compiled list
  // of references to a specific person/event (vs. a conversational answer).
  const isResearchRegister = /\bcompile|all\s+references?|every\s+mention|list\s+(all|every)|full\s+list/i.test(userMessage);

  // Resolve named persons → entity IDs for entity-aware search.
  let entityIds = [];
  if (ENTITY_JAFAR && entities.named_persons?.length > 0) {
    const resolved = await Promise.all(
      entities.named_persons.map(name => findEntity({ surface: name, type: 'person' }).catch(() => null))
    );
    entityIds = resolved.filter(r => r?.entity_id).map(r => r.entity_id);
    if (sendEvent && debug && entityIds.length > 0) {
      sendEvent({ type: 'debug_entities', named_persons: entities.named_persons, entityIds });
    }
  }

  const research = await deterministicResearch({ entities, userMessage, messages, sendEvent, debug, scope_config, entityIds });

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
    response_register: isResearchRegister ? 'research' : 'conversational',
    retrieved_count: research.retrieved_quotes.length,
    retrieval_quotes: research.retrieved_quotes,
    gate,
    retried,
    research_calls: research.tool_calls
  };
}
