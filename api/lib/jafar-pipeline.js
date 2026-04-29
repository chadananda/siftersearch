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

const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

// ─── Stage 1: Research ────────────────────────────────────────────────────

const RESEARCH_SYSTEM = `You are the RESEARCH PHASE of a multi-stage assistant. Your sole job is to retrieve material from the corpus that the next stage will use to compose a reply. You do NOT write the user-facing answer.

For the user's latest question, call retrieval tools (search, find_document_for_citation, read_document_for_question, library_overview) until you have enough quotes to ground a reply. When done, respond with a brief plain-text "done" message — your prose is discarded.

Routing rules:
- Doctrinal concepts (materialism, justice, the soul, faith, detachment, etc.) → search with mode:"passages" + religion filter
- Specific named works (Tablet of Wisdom, Iqán, Hidden Words, etc.) → find_document_for_citation, then read_document_for_question on the primary candidate
- Library-scope or coverage questions → library_overview
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
export async function runResearchPhase({ messages, sendEvent, debug }) {
  let heartbeat = null;
  if (sendEvent) {
    heartbeat = setInterval(() => {
      try { sendEvent({ type: 'heartbeat', stage: 'research', ts: Date.now() }); } catch { /* ignore */ }
    }, 15000);
  }
  try {
    return await runResearchPhaseInner({ messages, sendEvent, debug });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

async function runResearchPhaseInner({ messages, sendEvent, debug }) {
  const aiMessages = [
    { role: 'system', content: RESEARCH_SYSTEM },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  const retrieved = [];
  const debugCalls = [];
  // Cap at 3 rounds. Pipeline budget is ~90s end-to-end vs Cloudflare's
  // ~100s timeout — research must leave room for craft + reflect + retry.
  const MAX_ROUNDS = 3;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: aiMessages,
      tools: TOOLS,
      // Force at least one tool call on the first round; auto thereafter
      tool_choice: round === 0 ? 'required' : 'auto',
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
            result = await executeTool(tc.function.name, args);
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
                citation_url: p.document_id ? `https://siftersearch.com/document/${p.document_id}` : null,
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
const INTENT_SYSTEM = `Classify the user's message and extract retrieval entities. Output JSON ONLY.

intent: ONE of
- "quote_request": user asks for a quote/passage/verse/text excerpt explicitly. Words like "show me", "quote me", "find the verse", "give me the passage".
- "definition": user asks what a term, concept, or doctrine means.
- "explain": user asks how something works, why a teaching exists, or what a tradition says about a topic.
- "discuss": general conversation, follow-up commentary, opinion, open exploration.

work_name: if the user names a specific scriptural work (Tablet of Wisdom, Iqán, Hidden Words, Gospel of John, Bhagavad Gita, Some Answered Questions, etc.), extract that name as the user phrased it. Else null.

religion: ONE of "Baha'i", "Christian", "Islam", "Buddhist", "Hindu", "Judaism", "Sikh", "Jain", "Confucian", "Tao", "Zoroastrian" — based on context. Default to "Baha'i" if Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi, the Báb, or Bahá'í texts are referenced. Else "Baha'i" if no other tradition is signaled (this app's primary corpus). Null only if explicitly cross-tradition.

topics: 1-3 lowercase topical keywords for passage search (e.g. "materialism", "justice", "soul"). Period vocabulary preferred over modern phrasing. Empty array if work_name covers it.

Output: {"intent": "...", "work_name": "..."|null, "religion": "..."|null, "topics": [...]}`;

export async function classifyIntentAndEntities(userMessage) {
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_SYSTEM },
        { role: 'user', content: userMessage }
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
      religion: parsed.religion || 'Baha\'i',
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : []
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'intent+entity classification failed; defaulting');
    return { intent: 'discuss', work_name: null, religion: 'Baha\'i', topics: [] };
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

// Topic → primary-work mapping. When entities.religion is Bahá'í and one
// of the topics matches, we additionally read paragraphs from the named
// primary work. This guarantees primary scripture appears in retrieved_quotes
// even when the hybrid passages search would otherwise rank secondary
// commentary above primary scripture (which it often does on Bahá'í themes
// because secondary works use more search-friendly modern language).
//
// Each entry: keyword regex (matched against any topic) → array of
// canonical-work descriptors. start_paragraph / end_paragraph optional
// (used for sub-section works inside a compilation).
const BAHAI_TOPIC_TO_WORK = [
  { match: /myst|spiritual.path|seven.valley/, works: [{ doc_id: 8241 }, { doc_id: 8230 }] },                  // Seven Valleys, Hidden Words
  { match: /prayer|devotion|worship|obligatory|meditation/, works: [{ doc_id: 8301 }, { doc_id: 16712 }] },     // Prayers and Meditations, Aqdas
  { match: /death|afterlife|next.world|departed|soul/, works: [{ doc_id: 8312 }, { doc_id: 8346 }] },           // Gleanings, Some Answered Questions
  { match: /prophec|fulfill|manifestation|return|seal/, works: [{ doc_id: 8300 }] },                            // Iqán
  { match: /justice|ethic|virtue|conduct|moral/, works: [{ doc_id: 8230 }, { doc_id: 16712 }] },                // Hidden Words, Aqdas
  { match: /scien|material|philosoph|wisdom|hikmat|nature/, works: [{ doc_id: 8270, start_paragraph: 313, end_paragraph: 365 }] }, // Tablet of Wisdom
  { match: /protect|test|suffer|difficult|trial/, works: [{ doc_id: 8230 }] },                                  // Hidden Words
  { match: /heal|illness|sick/, works: [{ doc_id: 8301 }] },                                                    // Prayers and Meditations (Long Healing Prayer is in there)
  { match: /unity|oneness|universal|religion/, works: [{ doc_id: 8300 }, { doc_id: 8346 }] },                   // Iqán, Some Answered Questions
  { match: /greatest.name|allah|abha/, works: [{ doc_id: 16712 }, { doc_id: 8230 }] },                          // Aqdas, Hidden Words
  { match: /vision|dream|psychic|spirit|supernatural|reincarnation/, works: [{ doc_id: 8346 }] },               // Some Answered Questions
  { match: /covenant|center|shoghi|guardian|administration/, works: [{ doc_id: 8635 }, { doc_id: 8295 }] }      // God Passes By, Advent of Divine Justice
];

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

export async function deterministicResearch({ entities, userMessage, messages, sendEvent, debug }) {
  const retrieved = [];
  const debugCalls = [];

  const harvestPassages = (result, via = 'search') => {
    if (!result?.passages) return;
    for (const p of result.passages) {
      retrieved.push({
        text: p.text || '',
        source_title: p.title || '',
        source_author: p.author || '',
        citation_url: p.document_id ? `https://siftersearch.com/document/${p.document_id}` : null,
        doc_id: p.document_id,
        paragraph_index: p.paragraph_index,
        religion: p.religion || null,
        collection: p.collection || null,
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
      result = await executeTool(name, args);
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
  const isBahai = !entities.religion || /bah/i.test(entities.religion);

  // Carry forward a work_name from earlier in the conversation when the
  // current turn doesn't name one. Most follow-up questions ("show me the
  // passage about nature") implicitly continue the prior turn's work.
  const effectiveWorkName = inferWorkFromHistory(messages, entities.work_name);
  if (sendEvent && debug && effectiveWorkName !== entities.work_name) {
    sendEvent({ type: 'debug_work_carry', from_history: effectiveWorkName });
  }

  // Branch 1: user named a specific work (or earlier turn did) — fetch it
  if (effectiveWorkName) {
    tasks.push((async () => {
      const find = await runTool('find_document_for_citation', {
        title: effectiveWorkName,
        religion: entities.religion || undefined,
        limit: 5
      });
      const primary = (find?.candidates || []).find(c => c.is_primary) || find?.candidates?.[0];
      if (primary?.document_id) {
        const readArgs = { document_id: primary.document_id, question: userMessage };
        if (typeof primary.start_paragraph === 'number') readArgs.start_paragraph = primary.start_paragraph;
        if (typeof primary.end_paragraph === 'number') readArgs.end_paragraph = primary.end_paragraph;
        const read = await runTool('read_document_for_question', readArgs);
        harvestExcerpts(read);
      }
    })());
  }

  // Branch 1b: topic → primary-work mapping (Bahá'í only, when no
  // work_name path is already covering the topic). Reads paragraphs
  // from the canonical primary work directly so primary scripture is
  // GUARANTEED in retrieved_quotes — bypasses the search-rank problem
  // where secondary commentary out-ranks primary on theme queries.
  if (isBahai && !effectiveWorkName && Array.isArray(entities.topics) && entities.topics.length > 0) {
    const topicBlob = entities.topics.join(' ').toLowerCase();
    const matchedWorks = [];
    for (const entry of BAHAI_TOPIC_TO_WORK) {
      if (entry.match.test(topicBlob)) {
        for (const w of entry.works) {
          if (!matchedWorks.find(m => m.doc_id === w.doc_id && m.start_paragraph === w.start_paragraph)) {
            matchedWorks.push(w);
          }
        }
      }
    }
    // Cap at 2 work-reads to keep the prompt manageable; the trim step
    // later still caps total quotes at 12.
    for (const work of matchedWorks.slice(0, 2)) {
      tasks.push((async () => {
        const readArgs = { document_id: work.doc_id, question: userMessage };
        if (typeof work.start_paragraph === 'number') readArgs.start_paragraph = work.start_paragraph;
        if (typeof work.end_paragraph === 'number') readArgs.end_paragraph = work.end_paragraph;
        // For full primary works without a paragraph range, sample first 80
        // paragraphs (most are short tablets/short books; Iqán is ~290 paras
        // but we don't need them all — passages search supplements).
        if (typeof work.start_paragraph !== 'number') readArgs.max_paragraphs = 80;
        const read = await runTool('read_document_for_question', readArgs);
        harvestExcerpts(read, 'topic-mapped-read');
      })());
    }
  }

  // Branch 2: passages search on the extracted topics (or raw message
  // if no topics). Always runs — even alongside a work_name lookup —
  // because a topic match elsewhere in the corpus often complements
  // the named-work passage.
  const passageQuery = entities.topics?.length
    ? entities.topics.join(' ')
    : userMessage;
  if (passageQuery && passageQuery.trim()) {
    tasks.push((async () => {
      const search = await runTool('search', {
        query: passageQuery,
        mode: 'passages',
        religion: entities.religion || undefined,
        limit: 8
      });
      harvestPassages(search);
    })());
  }

  await Promise.all(tasks);

  // Fallback: if every branch came back empty (named work didn't yield
  // excerpts, topic search returned nothing), do a broader passages search
  // using the raw user message. This catches the conversational follow-up
  // case where the user's pushback ("show me the actual passage") doesn't
  // map cleanly to topical keywords. Without this, the crafter would refuse
  // with "I couldn't locate text on this in the corpus" — which is the
  // failure mode that derails follow-up turns.
  if (retrieved.length === 0 && userMessage && userMessage.trim()) {
    const fallback = await runTool('search', {
      query: userMessage.slice(0, 240),
      mode: 'passages',
      religion: entities.religion || undefined,
      limit: 8
    });
    harvestPassages(fallback, 'search-fallback');
  }

  // Primary-source filter — when ANY primary-tier passage exists, drop
  // secondary commentary entirely. Otherwise the crafter weaves Esslemont
  // / Taherzadeh / Milani into a question about Bahá'u'lláh's writings,
  // which the judge correctly flags as secondary-substitution. Match on
  // normalized author name (apostrophe + diacritic variants).
  const PRIMARY_AUTHORS_NORM = [
    'bahaullah', 'baha\'u\'llah', 'bahaullah', // Bahá'u'lláh
    'the bab', 'bab', 'al-bab',                 // The Báb
    'abdulbaha', 'abdu\'l-baha', 'abdulbaha',   // 'Abdu'l-Bahá
    'shoghi effendi', 'shoghi effendi rabbani'  // Shoghi Effendi
  ];
  const normAuthor = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc\u02bb`'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const isPrimary = (q) => {
    if (q.is_summary) return true; // sub-agent summary always kept
    const a = normAuthor(q.source_author);
    return PRIMARY_AUTHORS_NORM.some(p => a.includes(p));
  };
  const primaryRetrieved = retrieved.filter(isPrimary);
  const filteredForCrafter = primaryRetrieved.length > 0 ? primaryRetrieved : retrieved;

  // Trim — gpt-4o-mini's TTFT scales with prompt size. A whole tablet worth
  // of excerpts (50+ paragraphs, ~50k chars) makes the crafter slow to first
  // token. Cap at 12 entries with topic-keyword preference: passages-search
  // hits (already topic-ranked) first, then work-read excerpts that contain
  // a topic keyword, then any remaining work-read excerpts.
  const MAX_QUOTES = 12;
  let trimmed = filteredForCrafter;
  if (filteredForCrafter.length > MAX_QUOTES) {
    const keywords = (entities.topics || [])
      .map(t => (t || '').toLowerCase())
      .filter(t => t.length >= 3);
    const matchesKeyword = (q) => {
      if (!keywords.length) return false;
      const text = (q.text || '').toLowerCase();
      return keywords.some(k => text.includes(k));
    };
    const passages = filteredForCrafter.filter(q => q.via === 'search' || q.via === 'search-fallback');
    const readMatched = filteredForCrafter.filter(q => q.via !== 'search' && q.via !== 'search-fallback' && matchesKeyword(q));
    const readRest = filteredForCrafter.filter(q => q.via !== 'search' && q.via !== 'search-fallback' && !matchesKeyword(q));
    trimmed = [...passages, ...readMatched, ...readRest].slice(0, MAX_QUOTES);
  }

  logger.info({
    retrieved: retrieved.length,
    trimmed: trimmed.length,
    work_name: entities.work_name,
    topics: entities.topics,
    calls: debugCalls.length
  }, 'deterministic research complete');
  return { retrieved_quotes: trimmed, tool_calls: debugCalls };
}

// ─── Stage 2: Craft ───────────────────────────────────────────────────────

const CRAFTER_SYSTEM = `You compose a single reply for the user. The reply must be GROUNDED IN THE PROVIDED QUOTES — every assertion must trace to one of the entries in retrieved_quotes. You have NO general knowledge for content; only for syntax. The conversation is built on quotes; quotes are the substrate, not decoration.

You are NOT Jafar's full persona. You are the crafter. Your only job: compose a reply from the retrieved quotes that follows these rules.

GROUNDING — every assertion rides on a quote:
- Every sentence about the tradition must trace to a specific entry in retrieved_quotes
- If a sentence cannot be traced to a retrieved quote, REMOVE the sentence
- Do NOT improvise from training memory — even if you "know" the answer
- If retrieved_quotes is COMPLETELY EMPTY (zero entries), say so: "I couldn't locate text on this in the corpus" — do not paraphrase from general knowledge.
- If retrieved_quotes has ANY entries — even tangentially related — DO use them. Lead with the closest quote, then connect to the question with the authority's words. Never refuse to engage when material exists; the reader is better served by a partial answer grounded in what's there than by a refusal.

PARTIAL-QUOTE WEAVING — defining words must be the authority's:
- When defining a term or characterizing a concept, use the authority's exact phrasing in quotation marks, even if just 3-4 words
- Pattern: "For Bahá'ís, faith is not merely belief but 'first, conscious knowledge'..."
- The reader should hear the tradition's actual phrasing woven into your sentence

NO RESTATING THE QUOTE — this is the most common failure mode:
The reflexive instinct is to follow a quote with a sentence that says what the quote already said in slightly different words. NEVER do this. The reader can read the quote.

CONCRETE EXAMPLES:

Quote: "The essence and the fundamentals of philosophy have emanated from the Prophets."

BAD (restatement — DELETE this kind of sentence):
> Bahá'u'lláh emphasizes that true knowledge and wisdom originate from divine sources. He emphasizes that philosophy, including its fundamentals, originates from the Prophets.

GOOD (adds context, no restatement):
> This is from the opening of the Tablet of Wisdom, just before he names the Greek philosophers — Empedocles a contemporary of David, Pythagoras of Solomon. Want the passage where he lists them?

GOOD (period-sense flag, no restatement):
> "Philosophy" in 1880s Persian (ḥikmat) doesn't mean what the modern English word means — it covers the unified knowledge of God, nature, and ethics, not an academic discipline.

GOOD (just stop — bare quote):
> [no tail at all]

The acceptable moves after a quote are exactly four: (a) brief WHERE-IT-SITS context, (b) a partial-quote weave using words the surrounding paragraph adds (NOT restating the quote itself), (c) a short question back to the user about where to go next, (d) a period-sense flag for a 19th-century word that carries modern baggage. If none apply, end after the bare quote.

NEVER use these openers to a connecting sentence: "Bahá'u'lláh emphasizes that," "Bahá'u'lláh distinguishes," "Bahá'u'lláh teaches that," "This passage suggests," "This indicates," "This highlights," "This underscores." Each is a restatement tripwire. Quote him directly instead — the quote IS the emphasis.

BREVITY (hard cap):
- Default reply length: ONE block quote + 1 short connecting sentence (or zero — bare quote is fine). NEVER multi-paragraph essays.
- Maximum: 2 block quotes + 2 short sentences total. If you have more to say, the user will ask.
- Stock-phrase reflexes are forbidden: "emphasizes that," "highlights the importance of," "rooted in," "transformative force," "diversity within unity," "spirit of friendliness and fellowship," "thus, the [X] aspect is woven into the fabric of," "underscores," "is essential for." Treat each as a tripwire — delete the sentence containing it.
- Conversational register: write like a friend, not an essay. "Here's the key passage." / "Yeah — Bahá'u'lláh names them directly." / "Where this gets interesting is..."
- Avoid third-person essay framing. Don't say "Bahá'u'lláh emphasizes..." at all; quote him instead and let the quote do the emphasizing.

INTENT-ROUTED OUTPUT:
- user_intent="quote_request" → reply is JUST one or more block quotes with citations, MINIMAL connecting words, no commentary. Format:
    > "Exact quote." ([*Work*](url) — Author)
- user_intent="definition" or "explain" → ONE block quote leading, then 1-2 short sentences weaving partial quotes. NOT an essay.
- user_intent="discuss" → ONE block quote, then 1-2 conversational sentences. Match the user's brief register.

LITERAL-MATCH — if the user named specific terms (people, places, concepts):
- The lead quote MUST contain those terms verbatim
- If no retrieved quote contains them verbatim, say so directly: "The retrieved excerpts don't contain 'X' explicitly. Closest material I have:"

OUTPUT: just the reply text. No JSON wrapping, no preamble, no meta-commentary about the process.`;

// Streaming variant — yields each chunk as it arrives. Used in the
// fast-path orchestrator. Returns the full text at the end.
export async function craftAnswerStream({ user_question, retrieved_quotes, conversation_summary, user_intent, onChunk, _temperature_override }) {
  const userPayload = buildCrafterUserPayload({ user_question, retrieved_quotes, conversation_summary, user_intent });
  // gpt-4o-mini for the crafter. Tried gpt-4o briefly; it ignored the
  // block-quote format and produced inline quotes ("Here's the key
  // passage: 'Nature...'"), which broke our markdown structure and
  // ironically scored worse. Mini follows the structural format more
  // reliably; restate-prose is cleaned up by the post-process strip.
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CRAFTER_SYSTEM },
      { role: 'user', content: userPayload }
    ],
    temperature: typeof _temperature_override === 'number' ? _temperature_override : 0.1,
    max_tokens: 800,
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

// Drop sentences that begin with a forbidden restating opener. Operates on
// non-block-quote prose (lines that don't start with ">"). Run after the
// crafter's stream completes — the user already saw the streamed text but
// the persisted reply uses the cleaned version (which is what the markdown
// publisher and the citation harvester read).
function stripRestatementSentences(text) {
  if (!text) return text;
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
      if (FORBIDDEN_OPENERS.some(re => re.test(trimmed))) continue;
      kept.push(s);
    }
    const cleaned = kept.join('').trim();
    if (cleaned) out.push(cleaned);
  }
  // Collapse multiple blank lines to one
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildCrafterUserPayload({ user_question, retrieved_quotes, conversation_summary, user_intent }) {
  const quotesPayload = retrieved_quotes.map((q, i) => {
    const cite = q.citation_url
      ? `[*${q.source_title || 'source'}*](${q.citation_url}) — ${q.source_author || 'unknown'}`
      : `${q.source_title || 'source'} — ${q.source_author || 'unknown'}`;
    return `[Q${i + 1}${q.is_summary ? ' SUMMARY' : ''}] ${q.text}\n  Citation: ${cite}\n  doc=${q.doc_id || '?'} para=${q.paragraph_index ?? '?'}`;
  }).join('\n\n');
  return `user_intent: ${user_intent}

user_question: ${user_question}

conversation_summary: ${conversation_summary || '(this is the opening turn)'}

retrieved_quotes (${retrieved_quotes.length} entries — use these as the substrate; entries marked SUMMARY are sub-agent context, not quotable text):

${quotesPayload || '(no quotes retrieved — reply must say so)'}

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
export async function runJafarPipeline({ messages, sendEvent, debug }) {
  const userMessage = messages[messages.length - 1].content;

  // Stage 1: classify intent + entities (1 mini call ~1-2s), then run
  // deterministic retrieval directly from the entities (no LLM) ~0.5-1.5s.
  // Total research wall time ~2-3s vs the prior gpt-4o-with-tools 5-10s.
  if (sendEvent) sendEvent({ type: 'stage', stage: 'research' });
  const entities = await classifyIntentAndEntities(userMessage);
  const userIntent = entities.intent;
  if (sendEvent && debug) sendEvent({ type: 'debug_intent', intent: userIntent, entities });
  const research = await deterministicResearch({ entities, userMessage, messages, sendEvent, debug });

  // Conversation summary
  const conversationSummary = summarizeConversation(messages);

  // Stage 2: SINGLE STREAMING crafter — gpt-4o-mini, output streams to the
  // client as it generates. Picker dropped: TTFT is what matters for chat
  // UX, and the picker added 2-3s before any text could appear.
  // The crafter's structural isolation (sees only retrieved_quotes, no
  // general-knowledge fallback) is what enforces grounding — multi-
  // candidate selection was nice-to-have, not load-bearing.
  if (sendEvent) sendEvent({ type: 'stage', stage: 'craft' });
  const onChunk = (text) => {
    if (sendEvent) sendEvent({ type: 'text', content: text });
  };
  const draft = await craftAnswerStream({
    user_question: userMessage,
    retrieved_quotes: research.retrieved_quotes,
    conversation_summary: conversationSummary,
    user_intent: userIntent,
    _temperature_override: 0.3,
    onChunk
  });
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
