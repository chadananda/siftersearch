#!/usr/bin/env node
/**
 * Three-Pass Index-Only Segmentation for Arabic/Farsi Documents
 *
 * Takes an unpunctuated classical text and adds structure through three passes:
 *   Pass 1: Words → Phrases (hardest — needs deep contextual understanding)
 *   Pass 2: Phrases → Sentences
 *   Pass 3: Sentences → Paragraphs
 *
 * The AI NEVER returns text — only array indices marking where breaks occur.
 * This makes output tokens minimal, validation trivial, and text corruption impossible.
 *
 * Usage:
 *   node scripts/segment-document.js <file-path> [options]
 *
 * Options:
 *   --model <name>           Model to use (default: gpt-4o)
 *   --provider <name>        Provider: openai or anthropic (default: openai)
 *   --chunk-words <n>        Words per chunk in pass 1 (default: 300)
 *   --chunk-phrases <n>      Phrases per chunk in pass 2 (default: 80)
 *   --chunk-sentences <n>    Sentences per chunk in pass 3 (default: 150)
 *   --context-carry <n>      Completed items to carry as context (default: 3)
 *   --dry-run                Show what would be done without modifying files
 *   --output <path>          Write to a different file instead of overwriting
 *   --verbose                Verbose logging
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { aiService } from '../api/lib/ai-services.js';
import { getSegmentationStatus } from '../api/services/segmenter.js';
import { logger } from '../api/lib/logger.js';

// ============================================================
// Configuration
// ============================================================

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const CONFIG = {
  model: getArg('model', 'gpt-4o'),
  provider: getArg('provider', 'openai'),
  chunkWords: parseInt(getArg('chunk-words', '300')),
  chunkPhrases: parseInt(getArg('chunk-phrases', '80')),
  chunkSentences: parseInt(getArg('chunk-sentences', '150')),
  contextCarry: parseInt(getArg('context-carry', '3')),
  dryRun: getArg('dry-run', false),
  check: getArg('check', false),
  output: getArg('output', null),
  verbose: getArg('verbose', false)
};

if (!filePath) {
  console.error('Usage: node scripts/segment-document.js <file-path> [options]');
  console.error('  --model gpt-4o|claude-sonnet-4-20250514');
  console.error('  --provider openai|anthropic');
  console.error('  --chunk-words 300    (pass 1 chunk size)');
  console.error('  --chunk-phrases 80   (pass 2 chunk size)');
  console.error('  --chunk-sentences 150 (pass 3 chunk size)');
  console.error('  --context-carry 3    (preceding items for context)');
  console.error('  --check              (check segmentation status only)');
  console.error('  --dry-run            (preview without writing)');
  console.error('  --output <path>      (write to different file)');
  process.exit(1);
}

// ============================================================
// Cost tracking
// ============================================================

const costLog = {
  documentPath: filePath,
  model: CONFIG.model,
  provider: CONFIG.provider,
  passes: [],
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0,
  startTime: Date.now()
};

function logPassCost(passName, inputTokens, outputTokens, cost, calls, cacheStats = {}) {
  const entry = { pass: passName, inputTokens, outputTokens, cost, calls, ...cacheStats };
  costLog.passes.push(entry);
  costLog.totalInputTokens += inputTokens;
  costLog.totalOutputTokens += outputTokens;
  costLog.totalCost += cost;
  costLog.totalCacheCreated = (costLog.totalCacheCreated || 0) + (cacheStats.cacheCreated || 0);
  costLog.totalCacheRead = (costLog.totalCacheRead || 0) + (cacheStats.cacheRead || 0);

  let cacheInfo = '';
  if (cacheStats.cacheRead > 0) {
    const cacheHitRate = Math.round((cacheStats.cacheRead / (cacheStats.cacheRead + inputTokens)) * 100);
    cacheInfo = `, cache: ${cacheStats.cacheRead} tokens read (${cacheHitRate}% hit rate)`;
  }
  console.log(`  ${passName}: ${calls} calls, ${inputTokens} input + ${outputTokens} output tokens, ~$${cost.toFixed(4)}${cacheInfo}`);
}

// ============================================================
// AI Helper
// ============================================================

async function aiChat(messages, overrides = {}) {
  const service = aiService('quality', { forceRemote: true });
  const response = await service.chat(messages, {
    caller: 'segmentation',
    documentId: filePath,
    provider: CONFIG.provider,
    model: CONFIG.model,
    temperature: 0.1,
    // Keep maxTokens tight — response is just a JSON array of integers.
    // For a 300-word chunk with ~75 phrase breaks, that's ~300 output tokens max.
    maxTokens: 1000,
    // Enable Anthropic prefix caching — system prompt is identical across all
    // chunk calls within a pass, so subsequent calls reuse the KV cache at ~10% cost.
    // OpenAI does this automatically; for Anthropic we need to opt in explicitly.
    cacheSystemPrompt: CONFIG.provider === 'anthropic',
    ...overrides
  });
  return response;
}

/**
 * Estimate cost for a single API call from its token usage.
 */
function estimateCallCost(usage) {
  if (!usage) return 0;
  const input = usage.promptTokens || 0;
  const output = usage.completionTokens || 0;
  const cacheRead = usage.cacheReadInputTokens || 0;
  // Subtract cache-read tokens from full-price input (they're charged at ~10%)
  const fullPriceInput = Math.max(0, input - cacheRead);

  if (CONFIG.provider === 'anthropic') {
    // Claude Sonnet 4: $3/M input, $0.30/M cached input, $15/M output
    return (fullPriceInput * 3 / 1_000_000) + (cacheRead * 0.30 / 1_000_000) + (output * 15 / 1_000_000);
  }
  // GPT-4o: $2.50/M input, $10/M output (cached input is $1.25/M automatically)
  return (input * 2.50 / 1_000_000) + (output * 10 / 1_000_000);
}

/** Extract cache stats from response usage */
function getCacheStats(usage) {
  return {
    cacheCreated: usage?.cacheCreationInputTokens || 0,
    cacheRead: usage?.cacheReadInputTokens || 0
  };
}

/**
 * Estimate cost before running segmentation.
 * Based on chunk count × estimated tokens per call.
 */
function estimateCost(wordCount) {
  const pass1Chunks = Math.ceil(wordCount / CONFIG.chunkWords);
  const estPhraseCount = Math.floor(wordCount / 4); // ~4 words per phrase
  const pass2Chunks = Math.ceil(estPhraseCount / CONFIG.chunkPhrases);
  const estSentenceCount = Math.floor(estPhraseCount / 4); // ~4 phrases per sentence
  const pass3Chunks = Math.ceil(estSentenceCount / CONFIG.chunkSentences);

  // Verification doubles pass 1 calls
  const totalPass1Calls = pass1Chunks * 2; // identify + verify
  const totalCalls = totalPass1Calls + pass2Chunks + pass3Chunks;

  // Estimate tokens: system prompt ~300 tokens, words ~1.5 tokens each, output ~100 tokens
  const avgInputPerCall = 300 + (CONFIG.chunkWords * 1.5);
  const avgOutputPerCall = 100;
  const totalInput = totalCalls * avgInputPerCall;
  const totalOutput = totalCalls * avgOutputPerCall;

  // GPT-4o: ~$2.50/M input, ~$10/M output (with caching, input may be ~$1.25/M)
  // Claude Sonnet: ~$3/M input, ~$15/M output (with prefix caching, ~$0.30/M cached input)
  const inputRate = CONFIG.provider === 'anthropic' ? 0.30 / 1_000_000 : 2.50 / 1_000_000; // Assume cache hits
  const outputRate = CONFIG.provider === 'anthropic' ? 15 / 1_000_000 : 10 / 1_000_000;
  const estimatedCost = (totalInput * inputRate) + (totalOutput * outputRate);

  return {
    pass1Chunks,
    pass2Chunks,
    pass3Chunks,
    totalCalls,
    estimatedInputTokens: Math.round(totalInput),
    estimatedOutputTokens: Math.round(totalOutput),
    estimatedCost: estimatedCost,
    note: `With ${CONFIG.provider} prefix caching on system prompts`
  };
}

// ============================================================
// Pass 1: Words → Phrases (with verification)
// ============================================================

// System prompts are STATIC so they benefit from Anthropic prefix caching.
// Every chunk call in a pass sends the identical system prompt, so after the
// first call the prefix is cached and subsequent calls pay ~10% of input cost.
const PASS1_SYSTEM = `You are an expert in classical Arabic and Farsi manuscripts. You segment unpunctuated text into natural phrases.

You will receive a JSON array of words from a classical text that has NO punctuation whatsoever — no commas, periods, or any markers. Your job is to identify where natural phrase breaks occur.

A phrase is the smallest unit of text that carries a coherent piece of meaning. In classical Arabic and Farsi, phrase boundaries occur where a reader would naturally pause — at the end of a grammatical construction (iḍāfa chain, verb + objects, conditional clause), a rhetorical unit, or a shift in subject/address. Phrases vary widely in length: a vocative like "yā ayyuhā" is a complete phrase, while an extended iḍāfa chain may be many words. Let the grammar and meaning dictate the length, not any fixed word count.

Example with Arabic-like structure:
Input: ["In", "the", "name", "of", "God", "the", "merciful", "the", "compassionate", "praise", "be", "to", "God", "lord", "of", "the", "worlds"]
Natural phrases: "In the name of God" | "the merciful the compassionate" | "praise be to God" | "lord of the worlds"
Output: [5, 9, 13]

Return ONLY a JSON array of integers — the 0-based indices of words that START a new phrase. Index 0 always starts a phrase, so never include it.

Rules:
- Return ONLY a JSON array of integers. No text, no explanation.
- Let grammar, meaning, and rhetorical structure determine phrase boundaries — a pause that a skilled reciter would make marks a phrase boundary.
- Do NOT include index 0.
- The last few words may be an incomplete phrase (chunk boundary) — segment them as best you can.`;

async function pass1_wordsToPhrases(words) {
  console.log(`\nPass 1: Words → Phrases (${words.length} words, chunks of ${CONFIG.chunkWords})`);
  console.log('  Step 1/2: Identification...');

  const allBreaks = []; // Global indices where phrases start
  let passInputTokens = 0;
  let passOutputTokens = 0;
  let passCost = 0;
  let calls = 0;
  let cacheCreated = 0;
  let cacheRead = 0;

  // Per-chunk results for verification
  const chunkResults = [];

  let offset = 0;
  let carryWords = []; // Words from incomplete last phrase of previous chunk

  while (offset < words.length) {
    // Build chunk: carry-forward words + fresh words
    const freshEnd = Math.min(offset + CONFIG.chunkWords, words.length);
    const chunkWords = [...carryWords, ...words.slice(offset, freshEnd)];
    const carryCount = carryWords.length;

    // Build context: preceding completed phrases for orientation
    let contextMsg = '';
    if (CONFIG.contextCarry > 0 && allBreaks.length > 0) {
      const recentBreaks = allBreaks.slice(-CONFIG.contextCarry);
      const contextPhrases = [];
      for (let i = 0; i < recentBreaks.length; i++) {
        const start = recentBreaks[i];
        const end = i + 1 < recentBreaks.length ? recentBreaks[i + 1] : offset;
        contextPhrases.push(words.slice(start, end).join(' '));
      }
      contextMsg = `\n\nFor context, the preceding ${contextPhrases.length} phrases were:\n${contextPhrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nNow segment the following array:`;
    }

    // User message: context (varies) + static instruction + array
    // The system prompt is identical across all chunks → prefix caching benefit
    const userMsg = `${contextMsg}\n\nSegment this array of words into phrases:\n${JSON.stringify(chunkWords)}`;

    if (CONFIG.verbose) {
      console.log(`  Chunk at offset ${offset}: ${chunkWords.length} words (${carryCount} carried)`);
    }

    const response = await aiChat([
      { role: 'system', content: PASS1_SYSTEM },
      { role: 'user', content: userMsg }
    ]);

    calls++;
    passInputTokens += response.usage?.promptTokens || 0;
    passOutputTokens += response.usage?.completionTokens || 0;
    passCost += estimateCallCost(response.usage);
    const cs = getCacheStats(response.usage);
    cacheCreated += cs.cacheCreated;
    cacheRead += cs.cacheRead;

    // Parse response
    const indices = parseIndices(response.content, chunkWords.length);

    // Save chunk for verification
    chunkResults.push({ chunkWords, indices, offset, carryCount, freshEnd });

    // Map chunk-local indices to global indices, skipping carried items
    const isLastChunk = freshEnd >= words.length;
    const validIndices = isLastChunk ? indices : indices.slice(0, -1); // Discard last phrase boundary unless last chunk

    for (const localIdx of validIndices) {
      const globalIdx = (offset - carryCount) + localIdx;
      if (globalIdx > 0 && globalIdx < words.length && !allBreaks.includes(globalIdx)) {
        allBreaks.push(globalIdx);
      }
    }

    // Determine carry-forward: words after the last valid break in this chunk
    if (!isLastChunk && indices.length > 0) {
      const lastValidBreak = validIndices.length > 0 ? validIndices[validIndices.length - 1] : 0;
      const globalLastBreak = (offset - carryCount) + lastValidBreak;
      carryWords = words.slice(globalLastBreak, freshEnd);
    } else {
      carryWords = [];
    }

    offset = freshEnd;
    process.stdout.write(`  Progress: ${Math.min(offset, words.length)}/${words.length} words\r`);
  }

  console.log(`  Step 1 found ${allBreaks.length} phrase breaks`);

  // Step 2: Verification — re-send the SAME prompt for each chunk (maximizes cache hits).
  // Compare two independent responses: where they agree = high confidence,
  // where they disagree = take the intersection (conservative) or flag ambiguity.
  // Using the identical prompt means the second call gets a near-100% cache hit
  // on both the system prompt AND the user message (the word array is the same).
  console.log('  Step 2/2: Verification (same prompt, compare responses)...');
  const verifiedBreaks = [];
  let agreements = 0;
  let disagreements = 0;

  for (const chunk of chunkResults) {
    // Re-send the exact same messages as step 1 — maximizes prefix cache hit
    const userMsg = `\n\nSegment this array of words into phrases:\n${JSON.stringify(chunk.chunkWords)}`;

    const verifyResponse = await aiChat([
      { role: 'system', content: PASS1_SYSTEM },
      { role: 'user', content: userMsg }
    ]);

    calls++;
    passInputTokens += verifyResponse.usage?.promptTokens || 0;
    passOutputTokens += verifyResponse.usage?.completionTokens || 0;
    passCost += estimateCallCost(verifyResponse.usage);
    const vcs = getCacheStats(verifyResponse.usage);
    cacheCreated += vcs.cacheCreated;
    cacheRead += vcs.cacheRead;

    const secondIndices = parseIndices(verifyResponse.content, chunk.chunkWords.length);

    // Compare: take intersection (indices both calls agree on) for high confidence.
    // Indices only in one call are ambiguous — discard them (conservative approach).
    const firstSet = new Set(chunk.indices);
    const secondSet = new Set(secondIndices);
    const agreed = chunk.indices.filter(i => secondSet.has(i));
    const onlyFirst = chunk.indices.filter(i => !secondSet.has(i));
    const onlySecond = secondIndices.filter(i => !firstSet.has(i));

    if (onlyFirst.length > 0 || onlySecond.length > 0) {
      disagreements++;
      if (CONFIG.verbose) {
        console.log(`  Chunk at ${chunk.offset}: ${onlyFirst.length + onlySecond.length} disagreements, using ${agreed.length} agreed breaks`);
      }
    } else {
      agreements++;
    }

    // Use agreed (intersection) indices
    const isLastChunk = chunk.freshEnd >= words.length;
    const validIndices = isLastChunk ? agreed : agreed.slice(0, -1);

    for (const localIdx of validIndices) {
      const globalIdx = (chunk.offset - chunk.carryCount) + localIdx;
      if (globalIdx > 0 && globalIdx < words.length && !verifiedBreaks.includes(globalIdx)) {
        verifiedBreaks.push(globalIdx);
      }
    }
  }

  verifiedBreaks.sort((a, b) => a - b);
  console.log(`  Verification: ${agreements} chunks agreed, ${disagreements} had differences → ${verifiedBreaks.length} high-confidence phrase breaks`);
  logPassCost('Pass 1 (Words→Phrases, identify+verify)', passInputTokens, passOutputTokens, passCost, calls, { cacheCreated, cacheRead });

  return verifiedBreaks;
}

// ============================================================
// Pass 2: Phrases → Sentences
// ============================================================

const PASS2_SYSTEM = `You are an expert in classical Arabic and Farsi literature. You identify sentence boundaries from a list of phrases.

You will receive a JSON array of phrases (text segments already identified). Your job is to identify which phrases START a new sentence.

A sentence is a complete grammatical and rhetorical unit — a full thought that could stand on its own. In classical Arabic, this is often a complete jumlah (nominal or verbal sentence). In Farsi prose, look for where a verb completes its clause.

Be aware that classical texts frequently contain very long sentences where the predicate is far removed from its verb, with many dependent clauses, parenthetical remarks, and nested constructions in between. Do not artificially break these apart — follow the grammatical structure all the way through until the thought truly completes. A sentence that spans dozens of phrases is normal in this genre. If you cannot find a clear grammatical completion point, the sentence is not yet finished. Err on the side of longer sentences rather than breaking mid-construction.

Example:
Input: ["In the name of God the merciful", "the compassionate", "praise be to God", "lord of the worlds", "the merciful the compassionate", "master of the day of judgment"]
Sentences: "In the name of God the merciful the compassionate" | "praise be to God lord of the worlds the merciful the compassionate master of the day of judgment"
Output: [2]

Return ONLY a JSON array of integers — the 0-based indices of phrases that begin a new sentence. Index 0 always starts a sentence, so never include it.

Rules:
- Return ONLY a JSON array of integers. No text, no explanation.
- A sentence boundary falls where one complete thought ends and another begins — where a skilled reader would take a full stop.
- Do NOT include index 0.`;

async function pass2_phrasesToSentences(phrases) {
  console.log(`\nPass 2: Phrases → Sentences (${phrases.length} phrases, chunks of ${CONFIG.chunkPhrases})`);

  const allBreaks = [];
  let passInputTokens = 0;
  let passOutputTokens = 0;
  let passCost = 0;
  let calls = 0;
  let cacheCreated = 0;
  let cacheRead = 0;

  let offset = 0;
  let carryPhrases = [];

  while (offset < phrases.length) {
    const freshEnd = Math.min(offset + CONFIG.chunkPhrases, phrases.length);
    const chunk = [...carryPhrases, ...phrases.slice(offset, freshEnd)];
    const carryCount = carryPhrases.length;

    const response = await aiChat([
      { role: 'system', content: PASS2_SYSTEM },
      { role: 'user', content: JSON.stringify(chunk) }
    ]);

    calls++;
    passInputTokens += response.usage?.promptTokens || 0;
    passOutputTokens += response.usage?.completionTokens || 0;
    passCost += estimateCallCost(response.usage);
    const cs = getCacheStats(response.usage);
    cacheCreated += cs.cacheCreated;
    cacheRead += cs.cacheRead;

    const indices = parseIndices(response.content, chunk.length);
    const isLastChunk = freshEnd >= phrases.length;
    const validIndices = isLastChunk ? indices : indices.slice(0, -1);

    for (const localIdx of validIndices) {
      const globalIdx = (offset - carryCount) + localIdx;
      if (globalIdx > 0 && globalIdx < phrases.length && !allBreaks.includes(globalIdx)) {
        allBreaks.push(globalIdx);
      }
    }

    if (!isLastChunk && indices.length > 0) {
      const lastValidBreak = validIndices.length > 0 ? validIndices[validIndices.length - 1] : 0;
      const globalLastBreak = (offset - carryCount) + lastValidBreak;
      carryPhrases = phrases.slice(globalLastBreak, freshEnd);
    } else {
      carryPhrases = [];
    }

    offset = freshEnd;
    process.stdout.write(`  Progress: ${Math.min(offset, phrases.length)}/${phrases.length} phrases\r`);
  }

  allBreaks.sort((a, b) => a - b);
  console.log(`  Found ${allBreaks.length} sentence breaks → ${allBreaks.length + 1} sentences`);
  logPassCost('Pass 2 (Phrases→Sentences)', passInputTokens, passOutputTokens, passCost, calls, { cacheCreated, cacheRead });

  return allBreaks;
}

// ============================================================
// Pass 3: Sentences → Paragraphs
// ============================================================

const PASS3_SYSTEM = `You are an expert in classical Arabic and Farsi literature. You identify paragraph/topic boundaries from a list of sentences.

You will receive a JSON array of sentences. Your job is to identify which sentences START a new paragraph — a shift in topic, subject, argument, or narrative thread.

Classical texts don't have paragraphs in the modern sense, but they do have logical sections: a new argument, a change of topic, a shift from narration to commentary, a new ḥadīth or quotation, a transition from one subtopic to another. These are the boundaries you should identify. Some sections are brief (a single ḥadīth with its chain), others are extended (a long theological argument). Let the content determine the size.

It is entirely normal for a paragraph to consist of a single sentence. Classical authors often construct elaborate sentences where the verb and predicate are separated by extensive dependent material, making the entire construction one grammatical unit that also constitutes one complete topic. Do not force additional sentence breaks within a paragraph just to avoid single-sentence paragraphs — if the topic is one sentence, the paragraph is one sentence.

Example:
Input: ["Praise be to God lord of the worlds...", "He created the heavens and the earth...", "And among His signs is the creation of...", "O believers when you are called to prayer...", "Hasten to the remembrance of God...", "That is better for you if you but knew"]
Topic shift at index 3 (from creation to prayer): Output: [3]

Return ONLY a JSON array of integers — the 0-based indices of sentences that begin a new paragraph. Index 0 always starts a paragraph, so never include it.

Rules:
- Return ONLY a JSON array of integers. No text, no explanation.
- Look for topic shifts, transitions, new subjects, changes in addressee, or structural markers (new ḥadīth, new argument, new Quranic reference).
- Do NOT include index 0.`;

async function pass3_sentencesToParagraphs(sentences) {
  console.log(`\nPass 3: Sentences → Paragraphs (${sentences.length} sentences, chunks of ${CONFIG.chunkSentences})`);

  const allBreaks = [];
  let passInputTokens = 0;
  let passOutputTokens = 0;
  let passCost = 0;
  let calls = 0;
  let cacheCreated = 0;
  let cacheRead = 0;

  let offset = 0;
  let carrySentences = [];

  while (offset < sentences.length) {
    const freshEnd = Math.min(offset + CONFIG.chunkSentences, sentences.length);
    const chunk = [...carrySentences, ...sentences.slice(offset, freshEnd)];
    const carryCount = carrySentences.length;

    const response = await aiChat([
      { role: 'system', content: PASS3_SYSTEM },
      { role: 'user', content: JSON.stringify(chunk) }
    ]);

    calls++;
    passInputTokens += response.usage?.promptTokens || 0;
    passOutputTokens += response.usage?.completionTokens || 0;
    passCost += estimateCallCost(response.usage);
    const cs = getCacheStats(response.usage);
    cacheCreated += cs.cacheCreated;
    cacheRead += cs.cacheRead;

    const indices = parseIndices(response.content, chunk.length);
    const isLastChunk = freshEnd >= sentences.length;
    const validIndices = isLastChunk ? indices : indices.slice(0, -1);

    for (const localIdx of validIndices) {
      const globalIdx = (offset - carryCount) + localIdx;
      if (globalIdx > 0 && globalIdx < sentences.length && !allBreaks.includes(globalIdx)) {
        allBreaks.push(globalIdx);
      }
    }

    if (!isLastChunk && indices.length > 0) {
      const lastValidBreak = validIndices.length > 0 ? validIndices[validIndices.length - 1] : 0;
      const globalLastBreak = (offset - carryCount) + lastValidBreak;
      carrySentences = sentences.slice(globalLastBreak, freshEnd);
    } else {
      carrySentences = [];
    }

    offset = freshEnd;
    process.stdout.write(`  Progress: ${Math.min(offset, sentences.length)}/${sentences.length} sentences\r`);
  }

  allBreaks.sort((a, b) => a - b);
  console.log(`  Found ${allBreaks.length} paragraph breaks → ${allBreaks.length + 1} paragraphs`);
  logPassCost('Pass 3 (Sentences→Paragraphs)', passInputTokens, passOutputTokens, passCost, calls, { cacheCreated, cacheRead });

  return allBreaks;
}

// ============================================================
// Utilities
// ============================================================

/**
 * Parse AI response into array of integer indices.
 * Handles various response formats (markdown code blocks, extra text, etc.)
 */
function parseIndices(text, maxIndex) {
  // Extract JSON array from response (may have markdown code blocks or extra text)
  const match = text.match(/\[[\d\s,]*\]/);
  if (!match) {
    console.warn('  WARNING: Could not parse indices from response, returning empty');
    return [];
  }

  try {
    const arr = JSON.parse(match[0]);
    // Validate: must be array of positive integers less than maxIndex
    return arr.filter(n => Number.isInteger(n) && n > 0 && n < maxIndex);
  } catch {
    console.warn('  WARNING: JSON parse failed for indices, returning empty');
    return [];
  }
}

/**
 * Split text into words, preserving original whitespace positions for reconstruction.
 */
function textToWords(text) {
  // Split on whitespace but preserve the whitespace for reconstruction
  const words = [];
  const gaps = []; // whitespace before each word
  let remaining = text;
  let firstGap = true;

  while (remaining.length > 0) {
    const wsMatch = remaining.match(/^\s+/);
    if (wsMatch) {
      gaps.push(wsMatch[0]);
      remaining = remaining.slice(wsMatch[0].length);
      firstGap = false;
    } else if (firstGap) {
      gaps.push('');
      firstGap = false;
    }

    const wordMatch = remaining.match(/^\S+/);
    if (wordMatch) {
      words.push(wordMatch[0]);
      remaining = remaining.slice(wordMatch[0].length);
    }
  }

  return { words, gaps };
}

/**
 * Reconstruct text from words, inserting markers at phrase/sentence/paragraph breaks.
 */
function reconstructText(words, gaps, phraseBreaks, sentenceBreaks, paragraphBreaks) {
  const phraseSet = new Set(phraseBreaks);
  const sentenceSet = new Set(sentenceBreaks);
  const paragraphSet = new Set(paragraphBreaks);

  let result = '';
  for (let i = 0; i < words.length; i++) {
    if (i > 0) {
      if (paragraphSet.has(i)) {
        // Paragraph break: double newline
        result += '\n\n';
      } else if (sentenceSet.has(i)) {
        // Sentence marker
        result += ' ⁅s⁆ ';
      } else if (phraseSet.has(i)) {
        // Phrase marker (only if not already a sentence/paragraph break)
        result += ' ⁅ph⁆ ';
      } else {
        // Original whitespace
        result += gaps[i] || ' ';
      }
    } else {
      result += gaps[0] || '';
    }
    result += words[i];
  }

  return result;
}

/**
 * Validate that no original text was lost or modified.
 */
function validateIntegrity(originalWords, reconstructedText) {
  // Extract words from reconstructed text (stripping markers)
  const cleaned = reconstructedText
    .replace(/⁅ph⁆/g, '')
    .replace(/⁅s⁆/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const originalJoined = originalWords.join(' ');
  const cleanedWords = cleaned.split(/\s+/);

  if (cleanedWords.length !== originalWords.length) {
    console.error(`  VALIDATION FAILED: Word count mismatch (${cleanedWords.length} vs ${originalWords.length})`);
    return false;
  }

  for (let i = 0; i < originalWords.length; i++) {
    if (cleanedWords[i] !== originalWords[i]) {
      console.error(`  VALIDATION FAILED: Word ${i} differs: "${cleanedWords[i]}" vs "${originalWords[i]}"`);
      return false;
    }
  }

  console.log('  Validation passed: all original words preserved');
  return true;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const absolutePath = resolve(filePath);
  console.log(`Segmenting: ${absolutePath}`);
  console.log(`Model: ${CONFIG.provider}/${CONFIG.model}`);
  console.log(`Chunk sizes: words=${CONFIG.chunkWords}, phrases=${CONFIG.chunkPhrases}, sentences=${CONFIG.chunkSentences}`);
  console.log(`Context carry: ${CONFIG.contextCarry}`);
  if (CONFIG.dryRun) console.log('DRY RUN — no files will be modified\n');

  // Read file
  const raw = readFileSync(absolutePath, 'utf-8');

  // Check segmentation status before doing any work
  const fmCheckMatch = raw.match(/^---\n([\s\S]*?\n)---\n/);
  const bodyForCheck = fmCheckMatch ? raw.slice(fmCheckMatch[0].length) : raw;
  const langMatch = fmCheckMatch?.[1]?.match(/^language:\s*(.+)$/m);
  const checkMeta = langMatch ? { language: langMatch[1].trim() } : {};
  const segStatus = getSegmentationStatus(bodyForCheck, checkMeta);

  if (CONFIG.check) {
    console.log(`\nStatus: ${segStatus.status}`);
    if (segStatus.format) console.log(`Format: ${segStatus.format}`);
    if (segStatus.language) console.log(`Language: ${segStatus.language}`);
    if (segStatus.wordCount) console.log(`Words: ${segStatus.wordCount.toLocaleString()}`);
    console.log(`Reason: ${segStatus.reason}`);
    process.exit(0);
  }

  if (segStatus.status === 'segmented') {
    console.log(`\nSkipping: already segmented (${segStatus.reason})`);
    process.exit(0);
  }
  if (segStatus.status === 'no-segmentation-needed') {
    console.log(`\nSkipping: ${segStatus.reason}`);
    process.exit(0);
  }

  console.log(`Language: ${segStatus.language}, ${segStatus.wordCount?.toLocaleString()} words — needs segmentation`);

  // Separate frontmatter from body
  let frontmatter = '';
  let body = raw;
  const fmMatch = raw.match(/^---\n([\s\S]*?\n)---\n/);
  if (fmMatch) {
    frontmatter = fmMatch[0];
    body = raw.slice(fmMatch[0].length);
  }

  // Detect and clean OCR artifacts if present.
  // Not all documents come from OCR — some are clean digital text. We detect
  // the pattern first: OCR documents have hard line breaks every ~40-80 chars
  // with no semantic meaning, plus page breaks with page numbers.
  const originalBodyLength = body.length;
  const hiddenElements = [];

  body = body.replace(/\r\n/g, '\n');  // Normalize line endings

  // Detect OCR hard-wrapping: count lines and check if most are ~40-80 chars
  // (a telltale sign of hard-wrapped OCR output vs. natural paragraph text)
  const lines = body.split('\n').filter(l => l.trim().length > 0);
  const lineLengths = lines.map(l => l.trim().length);
  const medianLength = lineLengths.sort((a, b) => a - b)[Math.floor(lineLengths.length / 2)] || 0;
  const shortLineRatio = lineLengths.filter(l => l > 20 && l < 100).length / Math.max(lineLengths.length, 1);
  const hasOcrWrapping = lines.length > 20 && shortLineRatio > 0.6 && medianLength < 100;

  // Detect form feeds (PDF page breaks)
  const hasFormFeeds = /\f/.test(body);

  // Detect standalone page numbers between blank lines
  const hasPageNumbers = /\n\s*[\d٠-٩۰-۹]{1,5}\s*\n/.test(body);

  const hasOcrArtifacts = hasOcrWrapping || hasFormFeeds || hasPageNumbers;

  if (hasOcrArtifacts) {
    console.log('Detected OCR artifacts — cleaning before segmentation');

    body = body.replace(/\f/g, '\n\n\n');  // Form feeds → triple newline

    // Remove page numbers and short isolated lines at page boundaries
    // (headers/footers repeated on every page)
    body = body.replace(/\n{2,}\s*(.{1,60}?)\s*\n{2,}/g, (match, content) => {
      const trimmed = content.trim();
      if (/^[\d٠-٩۰-۹\-–—\s.]+$/.test(trimmed)) {
        hiddenElements.push(trimmed);
        return ' ';
      }
      if (trimmed.length < 40 && trimmed.length > 0) {
        hiddenElements.push(trimmed);
        return ' ';
      }
      return match;
    });

    body = body
      .replace(/([^\n])\n([^\n])/g, '$1 $2')  // Join hard-wrapped lines → space
      .replace(/\n{2,}/g, ' ')                // Collapse remaining multi-newlines (artificial page breaks)
      .replace(/\s{2,}/g, ' ')                // Collapse multiple spaces
      .trim();

    const stripped = originalBodyLength - body.length;
    console.log(`  Cleaned ${stripped.toLocaleString()} chars of OCR artifacts`);
    if (hiddenElements.length > 0) {
      console.log(`  Hidden ${hiddenElements.length} page headers/footers/numbers`);
      if (CONFIG.verbose) {
        hiddenElements.slice(0, 10).forEach(el => console.log(`    "${el}"`));
        if (hiddenElements.length > 10) console.log(`    ... and ${hiddenElements.length - 10} more`);
      }
    }
  }

  // Tokenize into words
  const { words, gaps } = textToWords(body);
  console.log(`\nDocument: ${words.length} words`);

  if (words.length < 10) {
    console.log('Document too short for segmentation. Exiting.');
    process.exit(0);
  }

  // Cost estimate
  const estimate = estimateCost(words.length);
  console.log(`\nEstimated cost: ~$${estimate.estimatedCost.toFixed(4)}`);
  console.log(`  Pass 1: ${estimate.pass1Chunks} chunks × 2 (identify+verify)`);
  console.log(`  Pass 2: ~${estimate.pass2Chunks} chunks`);
  console.log(`  Pass 3: ~${estimate.pass3Chunks} chunks`);
  console.log(`  Total calls: ~${estimate.totalCalls}`);
  console.log(`  ${estimate.note}`);

  // Pass 1: Words → Phrases
  const phraseBreaks = await pass1_wordsToPhrases(words);

  // Build phrases array for pass 2
  const phrases = [];
  const phraseGlobalIndices = [0, ...phraseBreaks]; // Each phrase starts at these word indices
  for (let i = 0; i < phraseGlobalIndices.length; i++) {
    const start = phraseGlobalIndices[i];
    const end = i + 1 < phraseGlobalIndices.length ? phraseGlobalIndices[i + 1] : words.length;
    phrases.push(words.slice(start, end).join(' '));
  }

  // Pass 2: Phrases → Sentences
  const sentenceBreaksPhraseIdx = await pass2_phrasesToSentences(phrases);
  // Convert phrase indices to word indices
  const sentenceBreaks = sentenceBreaksPhraseIdx.map(pi => phraseGlobalIndices[pi]);

  // Build sentences array for pass 3
  const sentenceStarts = [0, ...sentenceBreaks];
  const sentences = [];
  for (let i = 0; i < sentenceStarts.length; i++) {
    const start = sentenceStarts[i];
    const end = i + 1 < sentenceStarts.length ? sentenceStarts[i + 1] : words.length;
    sentences.push(words.slice(start, end).join(' '));
  }

  // Pass 3: Sentences → Paragraphs
  const paragraphBreaksSentenceIdx = await pass3_sentencesToParagraphs(sentences);
  // Convert sentence indices to word indices
  const paragraphBreaks = paragraphBreaksSentenceIdx.map(si => sentenceStarts[si]);

  // Reconstruct text with markers
  console.log('\nReconstructing text with markers...');
  const segmentedBody = reconstructText(words, gaps, phraseBreaks, sentenceBreaks, paragraphBreaks);

  // Validate integrity
  validateIntegrity(words, segmentedBody);

  // Write output
  const output = frontmatter + segmentedBody;
  const outputPath = CONFIG.output ? resolve(CONFIG.output) : absolutePath;

  if (CONFIG.dryRun) {
    console.log('\n--- DRY RUN OUTPUT (first 2000 chars) ---');
    console.log(output.substring(0, 2000));
    console.log('...');
  } else {
    writeFileSync(outputPath, output, 'utf-8');
    console.log(`\nWritten to: ${outputPath}`);
  }

  // Cost summary
  const elapsed = ((Date.now() - costLog.startTime) / 1000).toFixed(1);
  console.log(`\n=== Cost Summary ===`);
  console.log(`Document: ${filePath}`);
  console.log(`Model: ${CONFIG.provider}/${CONFIG.model}`);
  console.log(`Words: ${words.length} → ${phrases.length} phrases → ${sentences.length} sentences → ${paragraphBreaks.length + 1} paragraphs`);
  for (const p of costLog.passes) {
    console.log(`  ${p.pass}: ${p.calls} calls, ${p.inputTokens}+${p.outputTokens} tokens, ~$${p.cost.toFixed(4)}`);
  }
  console.log(`Total: ${costLog.totalInputTokens}+${costLog.totalOutputTokens} tokens, ~$${costLog.totalCost.toFixed(4)}`);
  if (costLog.totalCacheRead > 0) {
    const totalPossibleInput = costLog.totalCacheRead + costLog.totalInputTokens;
    const cacheHitRate = Math.round((costLog.totalCacheRead / totalPossibleInput) * 100);
    console.log(`Cache: ${costLog.totalCacheRead} tokens read from cache (${cacheHitRate}% hit rate), ${costLog.totalCacheCreated} tokens cached`);
  }
  console.log(`Time: ${elapsed}s`);
}

main().catch(err => {
  console.error('Segmentation failed:', err);
  process.exit(1);
});
