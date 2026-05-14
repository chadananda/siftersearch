// upgrade-to-ol-sources.mjs — Replace non-OL quotes in sections_json with OL equivalents.
// Run on tower-nas: node scripts/wip/upgrade-to-ol-sources.mjs [--dry-run] [--article=N]
// Skips Sikh tradition (no OL content). For all others, keyword-searches OL paragraphs
// filtered by source_site + religion and replaces if score ≥ 0.65.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

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

const db = (await import('better-sqlite3')).default(join(ROOT, 'data/sifter.db'));

const MEILI_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_KEY || '';
const OL_DOMAIN = 'oceanlibrary.com';
// Minimum keyword ranking score to accept as OL replacement
const MIN_SCORE = 0.65;
// Traditions with no OL content — skip entirely
const NO_OL_TRADITIONS = new Set(['Sikh']);

async function searchOL(text, religion, limit = 3) {
  const filter = religion
    ? `source_site = "${OL_DOMAIN}" AND religion = "${religion}"`
    : `source_site = "${OL_DOMAIN}"`;

  const body = {
    q: text.slice(0, 200), // keyword query from quote text
    filter,
    limit,
    matchingStrategy: 'last',
    showRankingScore: true,
    attributesToRetrieve: ['id', 'doc_id', 'text', 'title', 'author', 'source_site', 'source_url', 'external_para_id', 'authority', 'religion'],
  };

  const res = await fetch(`${MEILI_HOST}/indexes/paragraphs/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.hits || [];
}

function textSimilarity(a, b) {
  // Simple token overlap ratio for basic sanity check
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

const articles = db.prepare(
  onlyArticle
    ? 'SELECT id, canonical_question, sections_json FROM deep_research WHERE id = ? AND sections_json IS NOT NULL'
    : 'SELECT id, canonical_question, sections_json FROM deep_research WHERE sections_json IS NOT NULL'
).all(...(onlyArticle ? [onlyArticle] : []));

console.log(`Processing ${articles.length} articles${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

let totalChecked = 0, totalReplaced = 0, totalSkipped = 0, totalNoMatch = 0;
const log = [];

for (const article of articles) {
  const sections = JSON.parse(article.sections_json);
  let articleModified = false;

  for (const section of sections) {
    const quotes = section.quotes || [];
    for (let qi = 0; qi < quotes.length; qi++) {
      const q = quotes[qi];
      if (q.source_site === OL_DOMAIN) continue; // already OL
      if (NO_OL_TRADITIONS.has(q.tradition)) { totalSkipped++; continue; }

      totalChecked++;
      const religion = q.tradition; // tradition names match religion values in Meili
      const hits = await searchOL(q.excerpt || '', religion);

      if (!hits.length) { totalNoMatch++; continue; }

      const best = hits[0];
      const score = best._rankingScore || 0;
      const sim = textSimilarity(q.excerpt || '', best.text || '');

      // Accept if keyword score is high, OR if moderate score + text overlap
      const accept = score >= MIN_SCORE && (score >= 0.75 || sim >= 0.2);

      if (!accept) { totalNoMatch++; continue; }

      // Build replacement quote
      const replacement = {
        ...q,
        para_id: best.id,
        excerpt: best.text,
        source_title: best.title,
        source_author: best.author,
        source_site: best.source_site,
        source_url: best.source_url,
        external_para_id: best.external_para_id || null,
        authority: best.authority || 10,
      };

      log.push({
        article_id: article.id,
        tradition: q.tradition,
        old_site: q.source_site || '(none)',
        old_title: q.source_title,
        new_title: best.title,
        score: score.toFixed(3),
        old_excerpt: (q.excerpt || '').slice(0, 80),
        new_excerpt: (best.text || '').slice(0, 80),
      });

      if (!DRY_RUN) {
        quotes[qi] = replacement;
        articleModified = true;
      }

      totalReplaced++;
      process.stdout.write(`  ✅ [${article.id}] ${q.tradition}: "${(q.excerpt||'').slice(0,50)}" → OL "${(best.title||'').slice(0,40)}" (${score.toFixed(3)})\n`);
    }
  }

  if (articleModified) {
    db.prepare('UPDATE deep_research SET sections_json = ? WHERE id = ?')
      .run(JSON.stringify(sections), article.id);
  }
}

// Write log
const logPath = join(ROOT, 'scripts/wip/ol-upgrade-log.json');
writeFileSync(logPath, JSON.stringify(log, null, 2));

console.log(`\n${'─'.repeat(60)}`);
console.log(`Checked: ${totalChecked}, Replaced: ${totalReplaced}, No match: ${totalNoMatch}, Skipped (no OL): ${totalSkipped}`);
console.log(`Log written to scripts/wip/ol-upgrade-log.json`);
