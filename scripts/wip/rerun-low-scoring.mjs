// Re-runs articles whose tmp-scores/<slug>.json shows overall < THRESHOLD.
// Lists slugs needing re-run, then invokes the batch runner with --rerun
// targeting only those questions.
//
// Usage: node scripts/wip/rerun-low-scoring.mjs [threshold=70]

import { readFileSync, readdirSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCORES_DIR = join(ROOT, 'tmp-scores');
const DIALOGS_DIR = join(ROOT, 'src/content/dialogs');
const SEED_PATH = join(ROOT, 'scripts/seed-questions-common.json');

const THRESHOLD = parseInt(process.argv[2] || '70', 10);

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
const slugToIndex = new Map();
seed.forEach((q, i) => slugToIndex.set(q.slug, i));

// Gather slugs with score < threshold
const lowScoring = [];
for (const f of readdirSync(SCORES_DIR)) {
  if (!f.endsWith('.json')) continue;
  const slug = f.slice(0, -5);
  if (!slugToIndex.has(slug)) continue;
  let data;
  try { data = JSON.parse(readFileSync(join(SCORES_DIR, f), 'utf-8')); }
  catch { continue; }
  const overall = Math.round(data.overall || 0);
  if (overall < THRESHOLD) {
    lowScoring.push({ slug, score: overall, index: slugToIndex.get(slug), title: seed[slugToIndex.get(slug)].title });
  }
}

lowScoring.sort((a, b) => a.index - b.index);
console.log(`\nLow-scoring articles (< ${THRESHOLD}%):`);
for (const item of lowScoring) {
  console.log(`  [${item.index}] ${item.score}% — ${item.slug}`);
}
console.log(`\nTotal: ${lowScoring.length} articles to re-run.\n`);

if (lowScoring.length === 0) {
  console.log('Nothing to re-run.');
  process.exit(0);
}

// Delete the existing markdown + score files so the runner re-generates
for (const item of lowScoring) {
  const md = join(DIALOGS_DIR, `${item.slug}.md`);
  const sc = join(SCORES_DIR, `${item.slug}.json`);
  if (existsSync(md)) unlinkSync(md);
  if (existsSync(sc)) unlinkSync(sc);
}

// Run each article one at a time (the batch-runner doesn't support running
// non-contiguous indices). Iterate.
for (const item of lowScoring) {
  console.log(`\n========================================`);
  console.log(`Re-running [${item.index}] ${item.title}`);
  console.log(`========================================`);
  try {
    execSync(
      `node scripts/jafar-batch-runner.js --questions scripts/seed-questions-common.json --start ${item.index} --limit 1 --out-dir src/content/dialogs --score-dir tmp-scores --min-score 80 --max-retries 1 --rerun`,
      { cwd: ROOT, stdio: 'inherit', timeout: 600000 }
    );
  } catch (err) {
    console.error(`Failed re-running [${item.index}]: ${err.message}`);
  }
}
