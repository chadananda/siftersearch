// For each existing dialog markdown (200-219), generate per-round
// question-form / answer-form headings via gpt-4o, and inject them above
// the user-turn / jafar-turn divs. Also blank-out the heroImage
// frontmatter line since those images haven't been generated.

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const DIALOGS_DIR = join(ROOT, 'src/content/dialogs');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function extractRounds(body) {
  const rounds = [];
  const re = /<div class="user-turn"[^>]*>\s*([\s\S]*?)\s*<\/div>\s*<div class="jafar-turn"[^>]*>\s*([\s\S]*?)\s*<\/div>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    rounds.push({ user: m[1].trim(), jafar: m[2].trim(), full: m[0] });
  }
  return rounds;
}

async function generateSummaries(rounds) {
  const sys = `For each round of a conversation, write TWO tiny descriptive titles:
- A QUESTION-form title for the user's turn (4-8 words, ending in "?", capturing the substance — not just the topic)
- An ANSWER-form title for Jafar's reply (4-8 words, declarative, capturing the substance)
Sentence case. Concrete and specific.
Return JSON: {"rounds":[{"question":"...","answer":"..."},...]} with EXACTLY ${rounds.length} entries.`;
  const user = rounds.map((r, i) =>
    `Round ${i + 1}:\nUSER: ${r.user.slice(0, 600)}\nJAFAR: ${r.jafar.slice(0, 600)}`
  ).join('\n\n');
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(r.choices[0].message.content).rounds || [];
}

function rebuildBody(rounds, summaries) {
  const out = [];
  for (let i = 0; i < rounds.length; i++) {
    const s = summaries[i] || {};
    if (s.question) out.push(`### ${s.question}`, '');
    out.push(`<div class="user-turn" id="round-${i + 1}">`, '', rounds[i].user, '', '</div>', '');
    if (s.answer) out.push(`#### ${s.answer}`, '');
    out.push('<div class="jafar-turn">', '', rounds[i].jafar, '', '</div>', '');
  }
  return out.join('\n');
}

const files = readdirSync(DIALOGS_DIR).filter(f => /^2\d\d-.*\.md$/.test(f));
files.sort();
console.log(`Adding round summaries to ${files.length} articles...`);

for (const file of files) {
  const path = join(DIALOGS_DIR, file);
  const txt = readFileSync(path, 'utf-8');

  // Skip if already has ### round headers (idempotent)
  const hasHeaders = /^### .+\?$/m.test(txt);
  if (hasHeaders) {
    console.log(`  ${file}: already has summaries, skipping`);
    continue;
  }

  // Split frontmatter and body
  const fmEnd = txt.indexOf('\n---\n', 4);
  if (fmEnd < 0) {
    console.log(`  ${file}: no frontmatter delimiter, skipping`);
    continue;
  }
  const fm = txt.slice(0, fmEnd + 5);
  const body = txt.slice(fmEnd + 5);

  // Strip the heroImage line (image not generated, currently broken).
  // Keep the frontmatter block tidy.
  const fmFixed = fm.replace(/^heroImage: .*\n/m, '');

  const rounds = extractRounds(body);
  if (rounds.length === 0) {
    console.log(`  ${file}: no rounds found`);
    continue;
  }

  let summaries;
  try { summaries = await generateSummaries(rounds); }
  catch (err) {
    console.log(`  ${file}: summary gen failed — ${err.message}`);
    continue;
  }
  if (summaries.length !== rounds.length) {
    console.log(`  ${file}: summary count mismatch (${summaries.length} vs ${rounds.length}); skipping`);
    continue;
  }

  const newBody = rebuildBody(rounds, summaries);
  writeFileSync(path, fmFixed + newBody);
  console.log(`  ${file}: wrote ${rounds.length} round headers`);
}

console.log('\nDone.');
