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
export async function runResearchPhase({ messages, sendEvent, debug }) {
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

          const result = await executeTool(tc.function.name, args);

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

// ─── User-intent classifier ───────────────────────────────────────────────

// Tiny gpt-4o-mini call to classify the user's most recent message into one
// of four intents. The crafter routes its output style by intent.
const INTENT_SYSTEM = `Classify the user's most recent message into ONE of these intents:
- "quote_request": the user explicitly asks for a quote, passage, verse, or text excerpt. Words like "show me", "quote me", "find the verse", "give me the passage".
- "definition": the user asks what a term, concept, or doctrine means.
- "explain": the user asks how something works, why a teaching exists, or what a tradition says about a topic.
- "discuss": general conversation, follow-up commentary, opinion, or open exploration.

Output JSON: {"intent": "quote_request" | "definition" | "explain" | "discuss"}`;

export async function classifyIntent(userMessage) {
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_SYSTEM },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.0,
      max_tokens: 50,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    const valid = ['quote_request', 'definition', 'explain', 'discuss'];
    return valid.includes(parsed.intent) ? parsed.intent : 'discuss';
  } catch (err) {
    logger.warn({ err: err.message }, 'intent classification failed; defaulting to discuss');
    return 'discuss';
  }
}

// ─── Stage 2: Craft ───────────────────────────────────────────────────────

const CRAFTER_SYSTEM = `You compose a single reply for the user. The reply must be GROUNDED IN THE PROVIDED QUOTES — every assertion must trace to one of the entries in retrieved_quotes. You have NO general knowledge for content; only for syntax. The conversation is built on quotes; quotes are the substrate, not decoration.

You are NOT Jafar's full persona. You are the crafter. Your only job: compose a reply from the retrieved quotes that follows these rules.

GROUNDING — every assertion rides on a quote:
- Every sentence about the tradition must trace to a specific entry in retrieved_quotes
- If a sentence cannot be traced to a retrieved quote, REMOVE the sentence
- Do NOT improvise from training memory — even if you "know" the answer
- If retrieved_quotes is empty or doesn't address the question, say so directly: "I couldn't locate text on this in the corpus" — do not paraphrase from general knowledge

PARTIAL-QUOTE WEAVING — defining words must be the authority's:
- When defining a term or characterizing a concept, use the authority's exact phrasing in quotation marks, even if just 3-4 words
- Pattern: "For Bahá'ís, faith is not merely belief but 'first, conscious knowledge'..."
- The reader should hear the tradition's actual phrasing woven into your sentence

INTENT-ROUTED OUTPUT:
- user_intent="quote_request" → reply is JUST one or more block quotes with citations, MINIMAL connecting words, no commentary. Format:
    > "Exact quote." ([*Work*](url) — Author)
- user_intent="definition" or "explain" → lead with a block quote (the most relevant excerpt), then commentary woven with partial quotes. Block quote format same as above.
- user_intent="discuss" → quote-led with commentary, conversational pacing, but every claim still traces to retrieved_quotes

LITERAL-MATCH — if the user named specific terms (people, places, concepts):
- The lead quote MUST contain those terms verbatim
- If no retrieved quote contains them verbatim, say so directly: "The retrieved excerpts don't contain 'X' explicitly. Closest material I have:"

OUTPUT: just the reply text. No JSON wrapping, no preamble, no meta-commentary about the process.`;

export async function craftAnswer({ user_question, retrieved_quotes, conversation_summary, user_intent, previous_draft, gate_feedback }) {
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
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: CRAFTER_SYSTEM },
      { role: 'user', content: userPayload }
    ],
    temperature: 0.4,
    max_tokens: 1200
  });
  return resp.choices[0].message.content || '';
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
      model: 'gpt-4o',
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

  // Stage 1: research
  if (sendEvent) sendEvent({ type: 'stage', stage: 'research' });
  const research = await runResearchPhase({ messages, sendEvent, debug });

  // Intent classification
  const userIntent = await classifyIntent(userMessage);
  if (sendEvent && debug) sendEvent({ type: 'debug_intent', intent: userIntent });

  // Conversation summary
  const conversationSummary = summarizeConversation(messages);

  // Stage 2: craft
  if (sendEvent) sendEvent({ type: 'stage', stage: 'craft' });
  let draft = await craftAnswer({
    user_question: userMessage,
    retrieved_quotes: research.retrieved_quotes,
    conversation_summary: conversationSummary,
    user_intent: userIntent
  });

  // Stage 3: reflect
  if (sendEvent) sendEvent({ type: 'stage', stage: 'reflect' });
  let gate = await reflectionGate({
    draft,
    retrieved_quotes: research.retrieved_quotes,
    user_intent: userIntent,
    user_question: userMessage
  });

  let retried = false;
  if (!gate.pass) {
    if (sendEvent && debug) sendEvent({ type: 'debug_gate_fail', issues: gate.issues, failed_sentences: gate.failed_sentences });
    if (sendEvent) sendEvent({ type: 'stage', stage: 'craft_retry' });
    draft = await craftAnswer({
      user_question: userMessage,
      retrieved_quotes: research.retrieved_quotes,
      conversation_summary: conversationSummary,
      user_intent: userIntent,
      previous_draft: draft,
      gate_feedback: gate
    });
    retried = true;
    // Skip the re-gate after retry. Saves one OpenAI call per failed-gate
    // turn (~3-5s) which is critical for staying under Cloudflare's stream
    // timeout. Trust the retry; if persistently bad we'll catch it in the
    // post-hoc dialog assessment.
    gate = { pass: false, retry_attempted: true, original_issues: gate.issues };
  }

  return {
    reply: draft,
    user_intent: userIntent,
    retrieved_count: research.retrieved_quotes.length,
    gate,
    retried,
    research_calls: research.tool_calls
  };
}
