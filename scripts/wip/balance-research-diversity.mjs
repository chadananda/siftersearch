// balance-research-diversity.mjs — Trim excess quotes so no section has >3 from any tradition.
// Run on tower-nas: node scripts/wip/balance-research-diversity.mjs [--dry-run] [--article=N]
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

for (const file of ['.env-secrets', '.env-public']) {
  try {
    for (const line of readFileSync(join(ROOT, file), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

const DRY_RUN = process.argv.includes('--dry-run');
const articleArg = process.argv.find(a => a.startsWith('--article='));
const onlyArticle = articleArg ? parseInt(articleArg.split('=')[1]) : null;

import Database from 'better-sqlite3';
const db = new Database(join(ROOT, 'data/sifter.db'));

const MAX_PER_TRADITION = 3;

const articles = db.prepare(
  onlyArticle
    ? 'SELECT id, canonical_question, sections_json FROM deep_research WHERE id = ? AND sections_json IS NOT NULL'
    : 'SELECT id, canonical_question, sections_json FROM deep_research WHERE sections_json IS NOT NULL'
).all(...(onlyArticle ? [onlyArticle] : []));

console.log(`Processing ${articles.length} articles${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

let totalTrimmed = 0;
let articlesModified = 0;

for (const article of articles) {
  const sections = JSON.parse(article.sections_json);
  let articleChanged = false;

  for (const section of sections) {
    const byTrad = new Map();
    for (const q of (section.quotes || [])) {
      const t = q.tradition || '_unknown';
      if (!byTrad.has(t)) byTrad.set(t, []);
      byTrad.get(t).push(q);
    }

    let sectionTrimmed = 0;
    const trimmed = [];
    for (const [trad, qs] of byTrad) {
      qs.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
      const kept = qs.slice(0, MAX_PER_TRADITION);
      const dropped = qs.length - kept.length;
      if (dropped > 0) {
        console.log(`  [${article.id}] "${(section.label||'').slice(0,50)}" — dropped ${dropped} ${trad} quote(s) (had ${qs.length})`);
        sectionTrimmed += dropped;
      }
      trimmed.push(...kept);
    }

    if (sectionTrimmed > 0) {
      section.quotes = trimmed.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
      section.traditions = [...new Set(trimmed.map(q => q.tradition).filter(Boolean))];
      totalTrimmed += sectionTrimmed;
      articleChanged = true;
    }
  }

  if (articleChanged) {
    articlesModified++;
    if (!DRY_RUN) {
      db.prepare('UPDATE deep_research SET sections_json = ? WHERE id = ?')
        .run(JSON.stringify(sections), article.id);
    }
    console.log(`  ✅ Article ${article.id} updated\n`);
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Articles modified: ${articlesModified}, Quotes trimmed: ${totalTrimmed}`);
if (DRY_RUN) console.log('DRY RUN — no changes written');
