#!/usr/bin/env node
// Diagnose the HyPE indexing/quality issue empirically.
// Usage: node scripts/wip/diagnose-hype-indexing.mjs
//
// What it does:
//  1. Loads paragraphs 200..289 of the Iqán (doc 8300) — the late-doc region
//     where quality is bad
//  2. Builds the SAME window the enrichment pipeline would build for the
//     window containing paragraph 248 (the "love or hate" passage)
//  3. Logs the actual prompt sent to the LLM (so we can see the indexing)
//  4. Calls the local LLM exactly as the pipeline does
//  5. Logs the LLM response, parses it, and confirms which DB paragraph
//     each set of questions WOULD be stored against
//  6. Compares: stored-against vs LLM-asked-about vs paragraph-content

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'sifter.db');
const LOCAL_LLM = process.env.LOCAL_LLM || 'http://boss:49804/v1';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'Qwen/Qwen3-32B-AWQ';

const TARGET_DOC = 8300;
const TARGET_PARA = 248;  // the "love or hate" passage

// ---- Mirror enrichment constants ----
const MAX_CONTEXT = 32768;
const RESERVED_DECODE = 2000;
const USER_PROMPT_TOKENS = 100;
const SAFETY_MARGIN = 500;

function detectLanguageFeatures(text) {
  // Stripped-down version of the original — Iqán is English so just return defaults
  return { isRTL: false, rtlRatio: 0 };
}

function estimateTokens(text) {
  if (!text) return 0;
  const features = detectLanguageFeatures(text);
  const cpt = features.isRTL ? 2 : (features.rtlRatio > 0.1 ? 2.5 : 4);
  return Math.ceil(text.length / cpt);
}

function computeN(paragraphs) {
  if (paragraphs.length === 0) return 20;
  const sample = paragraphs.slice(0, 20);
  const avgTokens = sample.reduce((s, p) => s + estimateTokens(p.text), 0) / sample.length;
  const tokensPerPara = avgTokens + 30;
  const available = MAX_CONTEXT - RESERVED_DECODE - USER_PROMPT_TOKENS - SAFETY_MARGIN;
  const metaTokens = 80;
  const twoN = Math.floor((available - metaTokens) / tokensPerPara);
  const N = Math.max(3, Math.floor(twoN / 2));
  return Math.min(N, 50);
}

function buildSystemPrompt(doc, windowParagraphs) {
  const metaLines = [`"${doc.title}" by ${doc.author}`, `${doc.religion} / ${doc.collection}`];
  if (doc.year) metaLines.push(`Year: ${doc.year}`);
  if (doc.description) metaLines.push(`About: ${doc.description.slice(0, 300)}`);
  let windowText = '';
  for (let i = 0; i < windowParagraphs.length; i++) {
    const line = `[P${i + 1}] ${windowParagraphs[i].text}\n`;
    windowText += line;
  }
  return `${metaLines.join('\n')}\n\n<window>\n${windowText}</window>`;
}

function buildBatchHyPEPrompt(targetIndices, religion) {
  const pList = targetIndices.map(i => `[P${i}]`).join(', ');
  return `/no_think\nGenerate search queries for each paragraph: ${pList}

For EACH paragraph, output:
[P#]
- 3-5 natural search queries someone would type to find this specific passage
- Each query should be a real question or search phrase (max 15 words)
- Include the specific names, concepts, and topics from the paragraph
- Make queries specific enough that THIS paragraph would be the best result

${religion ? `Domain: ${religion}.` : ''}`;
}

function parseBatchHyPE(response, targetIndices) {
  if (!response) return new Map();
  let text = response.trim().replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
  const results = new Map();
  for (let i = 0; i < targetIndices.length; i++) {
    const idx = targetIndices[i];
    const nextIdx = targetIndices[i + 1];
    const startPattern = new RegExp(`\\[P${idx}\\]`);
    const startMatch = text.match(startPattern);
    if (!startMatch) continue;
    const startPos = startMatch.index + startMatch[0].length;
    let endPos = text.length;
    if (nextIdx) {
      const endPattern = new RegExp(`\\[P${nextIdx}\\]`);
      const endMatch = text.slice(startPos).match(endPattern);
      if (endMatch) endPos = startPos + endMatch.index;
    }
    const section = text.slice(startPos, endPos).trim();
    const questions = section
      .split('\n')
      .map(l => l.replace(/^[\d]+\.\s*/, '').replace(/^[-•*]\s*/, '').trim())
      .filter(l => l.length > 5 && !l.startsWith('[P'));
    if (questions.length > 0) {
      results.set(idx, questions);
    }
  }
  return results;
}

async function callLLM(systemPrompt, userPrompt) {
  const t0 = Date.now();
  const response = await fetch(`${LOCAL_LLM}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.5,
      chat_template_kwargs: { enable_thinking: false }
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
  const data = await response.json();
  const elapsedMs = Date.now() - t0;
  return { content: data.choices?.[0]?.message?.content || '', elapsedMs };
}

// ---- Main ----
const db = new Database(DB_PATH, { readonly: true });
const doc = db.prepare('SELECT id, title, author, religion, collection, year, description FROM docs WHERE id = ?').get(TARGET_DOC);
if (!doc) { console.error('Doc not found'); process.exit(1); }
console.log(`=== Diagnosing HyPE for "${doc.title}" (doc ${TARGET_DOC}) ===\n`);

// Load all paragraphs of the doc
const paragraphs = db.prepare('SELECT id, paragraph_index, text, hyp_questions FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(TARGET_DOC);
console.log(`Total paragraphs in doc: ${paragraphs.length}`);

// What N would compute
const N = computeN(paragraphs);
console.log(`Computed N: ${N}`);

// Find which window paragraph 248 falls into
// Windows iterate windowStart += N: 0, N, 2N, 3N, ...
// Window covers windowStart .. windowStart + 2N - 1
// Paragraph 248 is in window where windowStart <= 248 AND windowStart + 2N > 248
const windows = [];
for (let ws = 0; ws < paragraphs.length; ws += N) {
  const we = Math.min(ws + 2 * N, paragraphs.length);
  windows.push({ start: ws, end: we });
  if (we >= paragraphs.length) break;
}
const targetWindow = windows.find(w => {
  const targets_start = w.start === 0 ? w.start : w.start + N;
  const targets_end = w.end;
  return TARGET_PARA >= targets_start && TARGET_PARA < targets_end;
});
console.log(`\nWindows: ${windows.length} total`);
console.log(`Target paragraph ${TARGET_PARA} falls in window: start=${targetWindow.start}, end=${targetWindow.end}`);
const isFirstWindow = targetWindow.start === 0;
console.log(`isFirstWindow: ${isFirstWindow}`);

// Build the actual window
const windowParas = paragraphs.slice(targetWindow.start, targetWindow.end);
console.log(`Window has ${windowParas.length} paragraphs (DB indices ${windowParas[0].paragraph_index}..${windowParas[windowParas.length - 1].paragraph_index})`);

// Determine targets and pIndices exactly as processWindow does
const adjN = Math.min(N, Math.floor(windowParas.length / 2) || 1);
const targets = isFirstWindow ? windowParas : windowParas.slice(adjN);
const targetMappings = [];
for (let i = 0; i < targets.length; i++) {
  const pIndex = adjN + i + 1;
  targetMappings.push({
    i,
    pIndex,
    storedAgainst: { db_paragraph_index: targets[i].paragraph_index, content_preview: targets[i].text.slice(0, 60) },
    windowLabelMatches: pIndex <= windowParas.length ? { db_paragraph_index: windowParas[pIndex - 1].paragraph_index, content_preview: windowParas[pIndex - 1].text.slice(0, 60) } : { error: `[P${pIndex}] does not exist in window (only ${windowParas.length} labels)` }
  });
}

console.log(`\nadjN: ${adjN}, targets: ${targets.length}, pIndex range: ${targetMappings[0].pIndex}..${targetMappings[targetMappings.length - 1].pIndex}`);

// Show 5 sample mappings — including the one for paragraph 248
const targetForPara248 = targetMappings.find(m => m.storedAgainst.db_paragraph_index === TARGET_PARA);
console.log(`\n=== Mapping for target paragraph ${TARGET_PARA} ===`);
console.log(JSON.stringify(targetForPara248, null, 2));

// Show first/last mappings to see boundary behavior
console.log(`\n=== First mapping ===`);
console.log(JSON.stringify(targetMappings[0], null, 2));
console.log(`\n=== Last mapping ===`);
console.log(JSON.stringify(targetMappings[targetMappings.length - 1], null, 2));

// Count how many targets have mismatch (stored != LLM-asked-about)
const mismatchCount = targetMappings.filter(m => {
  if (m.windowLabelMatches.error) return true;
  return m.storedAgainst.db_paragraph_index !== m.windowLabelMatches.db_paragraph_index;
}).length;
console.log(`\n=== Bug detection: ${mismatchCount} of ${targetMappings.length} targets have stored != asked-about mismatch ===`);

// Now actually call the LLM with this exact prompt and see what comes back
const systemPrompt = buildSystemPrompt(doc, windowParas);
const indices = targetMappings.map(m => m.pIndex);
const userPrompt = buildBatchHyPEPrompt(indices, doc.religion);

console.log(`\n=== Calling LLM with ${indices.length} targets ===`);
console.log(`System prompt length: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)`);
console.log(`User prompt: ${userPrompt.slice(0, 200)}...`);

try {
  const { content, elapsedMs } = await callLLM(systemPrompt, userPrompt);
  console.log(`\nLLM elapsed: ${elapsedMs}ms`);
  console.log(`Response length: ${content.length} chars`);
  console.log(`\n=== Raw LLM response (first 2000 chars) ===\n${content.slice(0, 2000)}\n...`);

  const parsed = parseBatchHyPE(content, indices);
  console.log(`\n=== Parsed: ${parsed.size} of ${indices.length} target slots got questions ===`);

  // Specifically check the target for paragraph 248
  if (targetForPara248) {
    const llmAnswerForThisIdx = parsed.get(targetForPara248.pIndex);
    console.log(`\n=== Target paragraph ${TARGET_PARA} (would be stored at DB para ${targetForPara248.storedAgainst.db_paragraph_index}, but LLM was asked about [P${targetForPara248.pIndex}] which is DB para ${targetForPara248.windowLabelMatches.db_paragraph_index || '???'}) ===`);
    console.log(`Asked-about-paragraph content: ${targetForPara248.windowLabelMatches.content_preview || '???'}`);
    console.log(`Stored-against-paragraph content: ${targetForPara248.storedAgainst.content_preview}`);
    console.log(`LLM questions for [P${targetForPara248.pIndex}]:`, llmAnswerForThisIdx);
  }
} catch (err) {
  console.error(`LLM call failed: ${err.message}`);
}

db.close();
