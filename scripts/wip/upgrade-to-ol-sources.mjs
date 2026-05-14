// upgrade-to-ol-sources.mjs — Replace non-OL quotes in sections_json with OL equivalents.
// Run on tower-nas: node scripts/wip/upgrade-to-ol-sources.mjs [--dry-run] [--article=N]
//
// Strategy:
//   1. Keyword search (free, exact) — accepts score >= 0.9
//   2. Vector search using the existing embedding from content table (no API call)
//      — accepts semantic score >= 0.80 with text overlap >= 0.15
//
// Skips Sikh tradition (no OL content).

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

import Database from 'better-sqlite3';
const db = new Database(join(ROOT, 'data/sifter.db'));

const MEILI_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_KEY || '';
const OL_DOMAIN = 'oceanlibrary.com';
const NO_OL_TRADITIONS = new Set(['Sikh']);

// Convert SQLite embedding BLOB to Float32Array
function blobToFloatArray(blob) {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(arr);
}

function textOverlap(a, b) {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

const meiliHeaders = {
  'Content-Type': 'application/json',
  ...(MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {}),
};

async function searchOLKeyword(text, religion) {
  const filter = `source_site = "${OL_DOMAIN}"${religion ? ` AND religion = "${religion}"` : ''}`;
  const res = await fetch(`${MEILI_HOST}/indexes/paragraphs/search`, {
    method: 'POST', headers: meiliHeaders,
    body: JSON.stringify({
      q: text.slice(0, 200), filter, limit: 3,
      matchingStrategy: 'last', showRankingScore: true,
      attributesToRetrieve: ['id', 'doc_id', 'text', 'title', 'author', 'source_site', 'source_url', 'external_para_id', 'authority', 'religion'],
    }),
  });
  return (await res.json()).hits || [];
}

async function searchOLVector(vector, religion, excludeIds = []) {
  const filter = `source_site = "${OL_DOMAIN}"${religion ? ` AND religion = "${religion}"` : ''}`;
  const res = await fetch(`${MEILI_HOST}/indexes/paragraphs/search`, {
    method: 'POST', headers: meiliHeaders,
    body: JSON.stringify({
      q: '', filter, limit: 5,
      vector, hybrid: { semanticRatio: 1.0, embedder: 'default' },
      showRankingScore: true,
      attributesToRetrieve: ['id', 'doc_id', 'text', 'title', 'author', 'source_site', 'source_url', 'external_para_id', 'authority', 'religion'],
    }),
  });
  const hits = (await res.json()).hits || [];
  return hits.filter(h => !excludeIds.includes(h.id));
}

const getEmbedding = db.prepare('SELECT embedding FROM content WHERE id = ?');

const articles = db.prepare(
  onlyArticle
    ? 'SELECT id, canonical_question, sections_json FROM deep_research WHERE id = ? AND sections_json IS NOT NULL'
    : 'SELECT id, canonical_question, sections_json FROM deep_research WHERE sections_json IS NOT NULL'
).all(...(onlyArticle ? [onlyArticle] : []));

console.log(`Processing ${articles.length} articles${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

let totalChecked = 0, replaced = 0, noMatch = 0, skipped = 0;
const log = [];

for (const article of articles) {
  const sections = JSON.parse(article.sections_json);
  let articleModified = false;

  for (const section of sections) {
    const quotes = section.quotes || [];
    for (let qi = 0; qi < quotes.length; qi++) {
      const q = quotes[qi];
      if (q.source_site === OL_DOMAIN) continue;
      if (NO_OL_TRADITIONS.has(q.tradition)) { skipped++; continue; }

      totalChecked++;
      const religion = q.tradition;
      const excerpt = (q.excerpt || '').trim();
      let best = null;
      let method = '';

      // --- Pass 1: keyword search (matchingStrategy: 'last' — tolerates extra words) ---
      const kwHits = await searchOLKeyword(excerpt, religion);
      if (kwHits.length > 0) {
        const kw = kwHits[0];
        const score = kw._rankingScore || 0;
        const sim = textOverlap(excerpt, kw.text || '');
        // Require high score + meaningful word overlap to avoid false positives
        if (score >= 0.85 && sim >= 0.15) {
          best = kw;
          method = `kw:${score.toFixed(3)}/ol:${sim.toFixed(2)}`;
        }
      }

      // --- Pass 2: vector search using existing embedding ---
      if (!best && q.para_id) {
        const row = getEmbedding.get(q.para_id);
        if (row?.embedding) {
          const vector = blobToFloatArray(row.embedding);
          if (vector && vector.length > 0) {
            const vecHits = await searchOLVector(vector, religion);
            if (vecHits.length > 0) {
              const candidate = vecHits[0];
              const score = candidate._rankingScore || 0;
              const overlap = textOverlap(excerpt, candidate.text || '');
              // Accept high semantic match with minimal word overlap (same idea, different wording)
              // OR very high semantic with any overlap
              if (score >= 0.85 || (score >= 0.78 && overlap >= 0.10)) {
                best = candidate;
                method = `vec:${score.toFixed(3)}/ol:${overlap.toFixed(2)}`;
              }
            }
          }
        }
      }

      if (!best) { noMatch++; continue; }

      const replacement = {
        ...q,
        para_id: best.id,
        excerpt: best.text,
        source_title: best.title,
        source_author: best.author || q.source_author,
        source_site: OL_DOMAIN,
        source_url: best.source_url,
        external_para_id: best.external_para_id || null,
        authority: best.authority || 10,
      };

      log.push({
        article_id: article.id,
        tradition: q.tradition,
        method,
        old_title: q.source_title,
        new_title: best.title,
        old_excerpt: excerpt.slice(0, 100),
        new_excerpt: (best.text || '').slice(0, 100),
      });

      if (!DRY_RUN) {
        quotes[qi] = replacement;
        articleModified = true;
      }

      replaced++;
      process.stdout.write(`  ✅ [${article.id}/${qi}] ${q.tradition} (${method}): "${excerpt.slice(0,45)}" → "${(best.title||'').slice(0,35)}"\n`);
    }
  }

  if (articleModified) {
    db.prepare('UPDATE deep_research SET sections_json = ? WHERE id = ?')
      .run(JSON.stringify(sections), article.id);
  }
}

writeFileSync(join(ROOT, 'scripts/wip/ol-upgrade-log.json'), JSON.stringify(log, null, 2));
console.log(`\n${'─'.repeat(60)}`);
console.log(`Checked: ${totalChecked}, Replaced: ${replaced}, No match: ${noMatch}, Skipped: ${skipped}`);
console.log(`Log written to scripts/wip/ol-upgrade-log.json`);
