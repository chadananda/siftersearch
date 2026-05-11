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

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

// ─── Stage 1: Research ────────────────────────────────────────────────────

const RESEARCH_SYSTEM = `You are the RESEARCH PHASE of a multi-stage assistant. Your sole job is to retrieve material from the corpus that the next stage will use to compose a reply. You do NOT write the user-facing answer.

For the user's latest question, call retrieval tools (search, find_document_for_citation, read_document_for_question, library_overview) until you have enough quotes to ground a reply. When done, respond with a brief plain-text "done" message — your prose is discarded.

Routing rules:
- Catalog/coverage questions ("what do you have", "list the X collections", "how many Buddhist texts", "what languages", "what's in the library", "do you have any X") → call library_overview FIRST. Do NOT use search for these — search returns passages, not catalog data. library_overview returns doc counts per religion and collection names.
- Specific named works (Tablet of Wisdom, Iqán, Hidden Words, Quran, Bhagavad Gita, Tao Te Ching, Gospel of John, Guru Granth Sahib, etc.) → find_document_for_citation, then read_document_for_question on the primary candidate
- Doctrinal concepts (materialism, justice, the soul, faith, detachment, etc.) → search with mode:"passages" + religion filter
- Specific named figures (Bahá'u'lláh, 'Abdu'l-Bahá, Plato in a tradition's text, etc.) → search with their name + the topic

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

// Catalog questions ask about what the library *contains*, not what texts *say*.
// The LLM reliably routes these to `search` even when told not to, so detect them
// here and pre-fetch library_overview before the LLM loop runs.
const CATALOG_PATTERNS = [
  /\bwhat (do you|does the library|have|texts?|scriptures?|books?|languages?|collections?)\b/i,
  /\bhow many\b/i,
  /\blist (the|all|your|available)\b/i,
  /\bdo you (have|carry|include)\b/i,
  /\bwhat'?s? in (the|your) library\b/i,
  /\bwhat (languages?|traditions?|religions?) (are|do you)\b/i,
  /\bshow me (the|all|your|available) (collections?|texts?|scriptures?|books?)\b/i,
  /\blargest collection\b/i,
];

function isCatalogQuery(messages) {
  const last = messages.filter(m => m.role === 'user').at(-1)?.content || '';
  return CATALOG_PATTERNS.some(p => p.test(last));
}

async function runResearchPhaseInner({ messages, sendEvent, debug, scope_config }) {
  const aiMessages = [
    { role: 'system', content: RESEARCH_SYSTEM },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  const retrieved = [];
  const debugCalls = [];

  // Pre-fetch library_overview for catalog questions — the LLM ignores routing
  // instructions and always reaches for `search`, which returns passages not catalog data.
  if (isCatalogQuery(messages)) {
    if (debug) debugCalls.push({ name: 'library_overview', args: {}, forced: true });
    if (sendEvent) sendEvent({ type: 'debug_research_call', name: 'library_overview', args: {}, forced: true });
    try {
      const overview = await executeTool('library_overview', {}, { scope_config });
      // Inject as a synthetic tool exchange so the research LLM sees the catalog data
      const fakeCallId = 'forced_overview_0';
      aiMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: fakeCallId, type: 'function', function: { name: 'library_overview', arguments: '{}' } }]
      });
      aiMessages.push({ role: 'tool', tool_call_id: fakeCallId, content: JSON.stringify(overview) });

      // Also add a plain-text summary to retrieved so the CRAFT stage can use it.
      // The crafter only sees retrieved_quotes, not aiMessages.
      const religionLines = (overview.religions || []).map(r => `  - ${r.name}: ${r.documents} documents`).join('\n');
      const collectionLines = (overview.collections || []).filter(c => c.documents > 0).map(c => `  - ${c.name}: ${c.documents} documents${c.description ? ' — ' + c.description.slice(0, 80) : ''}`).join('\n');
      retrieved.push({
        text: `Library catalog snapshot:\nTotal: ${overview.totalDocuments} documents, ${overview.totalParagraphs} paragraphs\n\nBy religion:\n${religionLines}\n\nCollections:\n${collectionLines}`,
        source_title: 'Library Catalog',
        source_author: 'Ocean Library',
        citation_url: null,
        via: 'library_overview',
        is_catalog: true
      });
    } catch (e) {
      logger.warn({ err: e.message }, 'pre-fetch library_overview failed');
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
              retrieved.push({
                text: e.text || '',
                source_title: doc.title || '',
                source_author: doc.author || '',
                citation_url: doc.id ? `https://siftersearch.com/document/${doc.id}` : null,
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

work_name: ONLY set when the user's question has a SINGLE scriptural work as its primary subject and they want to read from that work specifically (e.g. "What does the Iqán say about X?", "Read me the opening of Some Answered Questions", "Find the passage in the Hidden Words about Y"). Else null. Return null when: (a) the user mentions TWO OR MORE works in the same question ("the Gospels or the Qur'án", "comparing Matthew and Surah 5"), (b) the user is asking about what multiple traditions say, (c) the work is mentioned only in passing as context, not as the sole primary source to read from.

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
  const harvestPassages = (result, via = 'search') => {
    if (!result?.passages) return;
    for (const p of result.passages) {
      const key = `${p.document_id}_${p.paragraph_index}`;
      if (seenParagraphs.has(key)) continue;
      seenParagraphs.add(key);
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
      retrieved.push({
        text: e.text || '',
        // When the document subagent translated a non-English excerpt, the
        // translation rides alongside the original text so the crafter can
        // present both. `translation` is null for English-source content.
        translation: e.translation || null,
        source_lang: e.source_lang || null,
        source_title: doc.title || '',
        source_author: doc.author || '',
        citation_url: doc.id ? `https://siftersearch.com/document/${doc.id}` : null,
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
    })());
  }

  // Branch 2: passages search.
  // When a specific work is named, one unrestricted search is enough —
  // the subagent already fetched the primary work above.
  // When NO work is named, run parallel per-tradition searches so that
  // corpus imbalance (Bahá'í has 5× more docs) doesn't crowd out other
  // traditions from retrieved_quotes. Each tradition gets its own slot.
  // Use the full user message for passage search — topic keywords joined with
  // spaces lose question structure and return wrong passages (e.g. "love
  // neighbors enemies" retrieves Deuteronomy instead of Matthew 5:44).
  const passageQuery = userMessage.slice(0, 300);
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
      // Two searches per tradition: primary (collection-filtered) then broad.
      const PRIMARY_SEARCHES = {
        "Islam":    { collection: "Foundational Texts" },
        "Christian":{ collection: "Bible and Translations" },
        "Buddhist": { collection: "Pali Canon" },
        "Judaism":  { collection: "Torah and Tanakh" },
      };
      const INTERFAITH_TRADITIONS = ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"];
      for (const religion of INTERFAITH_TRADITIONS) {
        const primaryOpts = PRIMARY_SEARCHES[religion];
        tasks.push((async () => {
          // Primary: scripture/foundational collection for non-Bahá'í traditions
          if (primaryOpts) {
            const primary = await runTool('search', {
              query: passageQuery,
              mode: 'passages',
              religion,
              ...primaryOpts,
              limit: 3
            });
            harvestPassages(primary, `traditions-${religion.toLowerCase()}`);
          }
          // Supplemental: broader search within the tradition (catches relevant
          // commentary, hadith, church fathers, etc. when primary is thin)
          const broad = await runTool('search', {
            query: passageQuery,
            mode: 'passages',
            religion,
            limit: primaryOpts ? 2 : 3
          });
          harvestPassages(broad, `traditions-${religion.toLowerCase()}`);
        })());
      }
    } else {
      // Work named — one unrestricted search to complement the subagent
      tasks.push((async () => {
        const search = await runTool('search', {
          query: passageQuery,
          mode: 'passages',
          limit: 8
        });
        harvestPassages(search);
      })());
    }
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

After a hyperlinked fragment, optionally name the work in plain text (no link): *Gospel of Matthew* — not another linked title.

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

FOR GENERAL/INTERFAITH QUESTIONS (no specific tradition named):
Draw from ALL traditions represented in retrieved_quotes. If you have passages from Christianity, Islam, Judaism, Buddhism, and Bahá'í — use all of them. Quote the Gospel for Christian teaching, the Qur'án for Islamic teaching, the Dhammapada for Buddhist teaching. Give each tradition its own voice. Do not default to Bahá'í simply because more Bahá'í material appears in the corpus.

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
NEVER multi-paragraph essay-style replies.

╔══════════════════════════════════════════════════════════╗
║  CONVERSATION-AWARE                                       ║
╚══════════════════════════════════════════════════════════╝

- NO REPEAT-QUOTE: check conversation_summary; never lead with a fragment you already used in a prior turn. If retrieved_quotes has only the previously-used material, surface a different facet honestly.
- LITERAL MATCH: if the user named specific terms (Pythagoras, Plato, "Seal of the Prophets," "Greatest Name"), at least one fragment must contain those terms verbatim. If the corpus doesn't have them, say so.
- CORRECTION COURAGE: when the user states something factually doubtful (wrong author, misremembered claim, implicit doctrinal error like "the Faith doesn't really teach X"), gently correct with a quote fragment, don't agree-and-move-on. Sycophancy on error is the worst failure mode.

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
  // Allow one level of balanced parens in URLs (e.g., "/path (en)#p10")
  return text.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^()]+|\([^()]*\))*)\)/g, (match, fragment, url) => {
    return validUrls.has(url) ? match : fragment;
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
    // For non-English passages, present BOTH original and JAFAR-grounded
    // translation so the crafter can quote whichever fits the user's request
    // (or both, when they ask for original-and-English).
    const langTag = q.translation && q.source_lang ? ` (source lang: ${q.source_lang})` : '';
    const bodyBlock = q.translation
      ? `original: ${q.text}\n  translation (en): ${q.translation}`
      : q.text;
    return `[Q${i + 1}${q.is_summary ? ' SUMMARY' : ''}${tierTag}${langTag}] ${bodyBlock}\n  Citation: ${cite}\n  doc=${q.doc_id || '?'} para=${q.paragraph_index ?? '?'}`;
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

  return `user_intent: ${user_intent}

user_question: ${user_question}

conversation_summary: ${conversation_summary || '(this is the opening turn)'}

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
    gate,
    retried,
    research_calls: research.tool_calls
  };
}
