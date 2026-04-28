#!/usr/bin/env node
// Inject tiny ### round-summary headers above each user-turn in dialog markdown.
// Uses gpt-4o to generate a 4-7 word title that captures the round's substance.
// TOC then auto-builds from these headings (Astro's render() exposes them).
//
// Usage:
//   node scripts/inject-round-headers.js                # all dialogs
//   node scripts/inject-round-headers.js --slug 051-…   # single dialog

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });

const OpenAI = (await import('openai')).default;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o';

const DIALOG_DIR = join(PROJECT_ROOT, 'src/content/dialogs');

const args = process.argv.slice(2);
const slugFilter = args.find((a, i) => args[i - 1] === '--slug');
const force = args.includes('--force');

// Pull all rounds from a dialog body — each round is a user-turn + jafar-turn pair.
function extractRounds(body) {
  const userRe = /<div class="user-turn"(?:\s+id="[^"]*")?>([\s\S]*?)<\/div>/g;
  const jafarRe = /<div class="jafar-turn">([\s\S]*?)<\/div>/g;
  const userTurns = [];
  const jafarTurns = [];
  let m;
  while ((m = userRe.exec(body)) !== null) userTurns.push(m[1].trim());
  while ((m = jafarRe.exec(body)) !== null) jafarTurns.push(m[1].trim());
  const rounds = [];
  for (let i = 0; i < userTurns.length; i++) {
    rounds.push({ user: userTurns[i], jafar: jafarTurns[i] || '' });
  }
  return rounds;
}

async function generateTitles(rounds) {
  const prompt = `For each round of this conversation, write TWO tiny descriptive titles:
- A question-form title for the user's turn (4-8 words, ending in "?", capturing the substance of what they're asking — not just the topic). Example: "Does anatta refute personal identity?"
- An answer-form title for Jafar's reply (4-8 words, declarative, capturing the substance of his response). Example: "It addresses ego, not the soul."

Avoid generic phrasings like "Exploring unity in religion." Be specific. Use sentence case for both.

Return JSON: { "rounds": [{ "question": "...", "answer": "..." }, ...] } with exactly ${rounds.length} entries in order.

Rounds:

${rounds.map((r, i) => `Round ${i + 1}:\nUSER: ${r.user.slice(0, 500)}\nJAFAR: ${r.jafar.slice(0, 500)}`).join('\n\n')}`;

  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });
  const parsed = JSON.parse(r.choices[0].message.content);
  return parsed.rounds || [];
}

const files = readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md'));

for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  if (slugFilter && !slug.startsWith(slugFilter)) continue;

  const path = join(DIALOG_DIR, f);
  const text = readFileSync(path, 'utf-8');
  const m = text.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!m) continue;
  const fm = m[1];
  let body = m[2];

  // Skip if already has round headers (idempotent unless --force)
  if (!force && /<h3[^>]*class="round-h"|^### /m.test(body)) {
    console.log(`SKIP ${f} (already has round headers)`);
    continue;
  }

  const rounds = extractRounds(body);
  if (rounds.length === 0) {
    console.log(`SKIP ${f} (no rounds extracted)`);
    continue;
  }

  console.log(`GEN  ${f} (${rounds.length} rounds)...`);
  let titles;
  try {
    titles = await generateTitles(rounds);
  } catch (err) {
    console.error(`FAIL ${f}: ${err.message}`);
    continue;
  }
  if (titles.length !== rounds.length) {
    console.warn(`WARN ${f}: title count ${titles.length} != rounds ${rounds.length}`);
  }

  // Strip any prior round headers (### or ####) so we can inject fresh ones.
  body = body.replace(/^###{1,2} .+\n\n/gm, '');

  // Inject ### {question} before each user-turn AND #### {answer} before each jafar-turn
  let userI = 0;
  body = body.replace(/<div class="user-turn"(?:\s+id="(round-\d+)")?>/g, (match) => {
    const t = titles[userI];
    const q = (t && t.question) ? t.question : `Round ${userI + 1}`;
    userI++;
    return `### ${q}\n\n${match}`;
  });

  let jafarI = 0;
  body = body.replace(/<div class="jafar-turn">/g, (match) => {
    const t = titles[jafarI];
    const a = (t && t.answer) ? t.answer : '';
    jafarI++;
    return a ? `#### ${a}\n\n${match}` : match;
  });

  writeFileSync(path, fm + body);
  console.log(`OK   ${f}`);
}

console.log('\nDone.');
