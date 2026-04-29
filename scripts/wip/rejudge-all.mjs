// Re-judge all common-question dialogs (200-219) using the latest
// JUDGE_PROMPT from jafar-batch-runner.js. Reads the conversation from
// each markdown file (extracts user-turn / jafar-turn divs), calls the
// judge, and writes the new assessment block back into the markdown
// frontmatter. Also updates tmp-scores/<slug>.json for the dashboard.
//
// Fast path: ~5s per article. 20 articles in ~2 minutes. No conversation
// regeneration — the regen risk-and-cost is not warranted when only the
// scoring methodology changes.
//
// Usage: node scripts/wip/rejudge-all.mjs

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const DIALOGS_DIR = join(ROOT, 'src/content/dialogs');
const SCORES_DIR = join(ROOT, 'tmp-scores');
const SEED_PATH = join(ROOT, 'scripts/seed-questions-common.json');

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
const slugToQuestion = new Map();
for (const q of seed) slugToQuestion.set(q.slug, q.question);

// Pull the JUDGE_PROMPT verbatim from batch-runner.js
const batchRunner = readFileSync(join(ROOT, 'scripts/jafar-batch-runner.js'), 'utf-8');
const judgePromptMatch = batchRunner.match(/const JUDGE_PROMPT = `([\s\S]*?)`;/);
if (!judgePromptMatch) {
  console.error('Could not extract JUDGE_PROMPT from batch-runner.js');
  process.exit(1);
}
const JUDGE_PROMPT = judgePromptMatch[1];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function extractConversation(markdown) {
  const turns = [];
  const userBlocks = markdown.match(/<div class="user-turn"[^>]*>\s*([\s\S]*?)\s*<\/div>/g) || [];
  const jafarBlocks = markdown.match(/<div class="jafar-turn"[^>]*>\s*([\s\S]*?)\s*<\/div>/g) || [];
  for (let i = 0; i < Math.max(userBlocks.length, jafarBlocks.length); i++) {
    if (userBlocks[i]) {
      const u = userBlocks[i].replace(/<div[^>]*>/, '').replace(/<\/div>/, '').trim();
      turns.push({ role: 'user', content: u });
    }
    if (jafarBlocks[i]) {
      const j = jafarBlocks[i].replace(/<div[^>]*>/, '').replace(/<\/div>/, '').trim();
      turns.push({ role: 'assistant', content: j });
    }
  }
  return turns;
}

async function judgeOne(slug, conversation, seedQuestion) {
  const text = conversation.map(t => `${t.role === 'user' ? 'USER' : 'JAFAR'}: ${t.content}`).join('\n\n');
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: JUDGE_PROMPT },
      { role: 'user', content: `Seed question: "${seedQuestion}"\n\nConversation:\n\n${text}` }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(r.choices[0].message.content);
}

function buildAssessmentYaml(judgeResult) {
  const scores = judgeResult.scores || {};
  const flags = (judgeResult.flags || []).filter(f => typeof f === 'string');
  const narrative = (judgeResult.narrative || '').replace(/"/g, '\\"');
  const plan = (judgeResult.improvement_plan || '').replace(/"/g, '\\"');
  const lines = ['assessment:', '  scores:'];
  for (const [k, v] of Object.entries(scores)) lines.push(`    ${k}: ${v}`);
  lines.push(`  narrative: ${JSON.stringify(narrative)}`);
  if (flags.length === 0) {
    lines.push('  flags: []');
  } else {
    lines.push('  flags:');
    for (const f of flags) lines.push(`    - ${f}`);
  }
  lines.push(`  improvement_plan: ${JSON.stringify(plan)}`);
  return lines.join('\n');
}

const files = readdirSync(DIALOGS_DIR).filter(f => /^2\d\d-.*\.md$/.test(f));
files.sort();
console.log(`Re-judging ${files.length} articles...`);

const before = [];
const after = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const seedQ = slugToQuestion.get(slug);
  if (!seedQ) { console.log(`  ${slug}: skip (no seed match)`); continue; }

  const path = join(DIALOGS_DIR, file);
  const md = readFileSync(path, 'utf-8');
  const parsed = matter(md);
  const oldScore = parsed.data.qualityScore;
  before.push({ slug, score: oldScore });

  const conversation = extractConversation(parsed.content);
  if (conversation.length === 0) { console.log(`  ${slug}: skip (no conversation)`); continue; }

  let newJudge;
  try { newJudge = await judgeOne(slug, conversation, seedQ); }
  catch (err) { console.error(`  ${slug}: judge failed — ${err.message}`); continue; }

  const newScore = Math.round(newJudge.overall);
  after.push({ slug, score: newScore });

  // Rewrite the markdown frontmatter with the new assessment + score
  const fm = { ...parsed.data, qualityScore: newScore, featured: newScore >= 80, published: newScore >= 80 };
  // Strip old assessment if present (re-add fresh below)
  delete fm.assessment;

  const newFrontmatter = matter.stringify('', fm).replace(/\n---\n$/, '');

  // Reattach the assessment block on a separate yaml block (gray-matter
  // would re-serialize but we want to insert it as raw yaml under the
  // existing fields). Simplest: serialize via stringify, then inject the
  // assessment YAML before the closing ---.
  const baseFm = matter.stringify('', fm).split('\n');
  // baseFm = ['---', 'key: value', ..., '---', '']
  const closingIdx = baseFm.lastIndexOf('---');
  const assessmentLines = buildAssessmentYaml(newJudge).split('\n');
  baseFm.splice(closingIdx, 0, ...assessmentLines);
  const newMarkdown = baseFm.join('\n') + parsed.content;

  writeFileSync(path, newMarkdown);

  // Also write tmp-scores/<slug>.json for the dashboard
  writeFileSync(join(SCORES_DIR, `${slug}.json`), JSON.stringify({ slug, ...newJudge, overall: newScore }, null, 2));

  const delta = oldScore != null ? (newScore - oldScore) : null;
  const arrow = delta == null ? '?' : (delta > 0 ? `+${delta}` : `${delta}`);
  console.log(`  ${slug}: ${oldScore ?? '?'}% → ${newScore}% (${arrow})`);
}

// Summary
const beforeAvg = before.length ? (before.filter(b => typeof b.score === 'number').reduce((a, b) => a + b.score, 0) / before.filter(b => typeof b.score === 'number').length).toFixed(1) : 'n/a';
const afterAvg = after.length ? (after.reduce((a, b) => a + b.score, 0) / after.length).toFixed(1) : 'n/a';
console.log(`\n=== SUMMARY ===`);
console.log(`Before avg: ${beforeAvg}%`);
console.log(`After avg:  ${afterAvg}%`);
console.log(`Articles ≥80: ${after.filter(b => b.score >= 80).length}`);
console.log(`Articles ≥70: ${after.filter(b => b.score >= 70).length}`);
console.log(`Articles ≥60: ${after.filter(b => b.score >= 60).length}`);
