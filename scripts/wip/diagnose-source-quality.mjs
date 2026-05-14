// Diagnose search source quality — verifies OceanLibrary sources rank first
// for canonical passages and identifies secondary-source contamination.
// Run on tower-nas: node scripts/wip/diagnose-source-quality.mjs
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// Load env
for (const file of ['.env-secrets', '.env-public']) {
  try {
    for (const line of readFileSync(join(ROOT, file), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

const { hybridSearch } = await import('../../api/lib/search.js');

// Test cases: famous canonical quotes with known primary sources
const TESTS = [
  // Hidden Words — Bahá'í primary text, must come from OceanLibrary
  { q: 'I loved thy creation hence I created thee', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Hidden Words' },
  { q: 'O SON OF SPIRIT! My first counsel is this: Possess a pure, kindly and radiant heart', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Hidden Words' },
  { q: 'The best beloved of all things in My sight is Justice', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Hidden Words' },

  // Gleanings from the Writings of Bahá'u'lláh
  { q: 'The Purpose of God in creating man hath been and will ever be to enable him to know his Creator', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Gleanings' },
  { q: 'So powerful is the light of unity that it can illuminate the whole earth', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Gleanings' },

  // Kitáb-i-Íqán
  { q: 'No man shall attain the shores of the ocean of true understanding except he be detached', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Kitab-i-Iqan' },

  // Some Answered Questions
  { q: 'The spiritual world is like unto the phenomenal world', tradition: "Baha'i", expect: 'oceanlibrary.com', book: 'Some Answered Questions' },

  // Quran
  { q: 'In the name of God the Merciful the Compassionate', tradition: 'Islam', expect: null, book: 'Quran' },
  { q: 'Allah is the Light of the heavens and the earth', tradition: 'Islam', expect: null, book: 'Quran (Light verse)' },

  // Bible
  { q: 'For God so loved the world that he gave his only begotten Son', tradition: 'Christianity', expect: null, book: 'John 3:16' },
  { q: 'Blessed are the poor in spirit for theirs is the kingdom of heaven', tradition: 'Christianity', expect: null, book: 'Matthew 5:3' },

  // Buddhist
  { q: 'All conditioned things are impermanent when one sees this with wisdom one turns away from suffering', tradition: 'Buddhism', expect: null, book: 'Dhammapada' },
];

const LIMIT = 8;
const OL_DOMAIN = 'oceanlibrary.com';

let passed = 0, warned = 0, failed = 0;

for (const t of TESTS) {
  const hits = await hybridSearch(t.q, { limit: LIMIT, semanticRatio: 0.5, filters: t.tradition ? { religion: t.tradition } : {} });
  const results = hits.hits || hits || [];

  process.stdout.write(`\n[${t.tradition}] ${t.book}\n  query: "${t.q.slice(0, 60)}"\n`);

  if (!results.length) {
    console.log('  ⚠️  NO RESULTS');
    warned++;
    continue;
  }

  // Check source_site distribution across top results
  const sourceBreakdown = results.slice(0, 5).map((h, i) => {
    const site = h.source_site || '(none)';
    const isOL = h.source_site === OL_DOMAIN ||
      (!h.source_site && typeof h.source_url === 'string' && h.source_url.includes(OL_DOMAIN));
    const title = (h.title || '').slice(0, 50);
    return { rank: i + 1, site, isOL, title, text: (h.text || '').slice(0, 60), score: h._rankingScore || h.score };
  });

  for (const r of sourceBreakdown) {
    const marker = r.isOL ? '✅ OL' : (r.site === '(none)' ? '❓ ?' : `❌ ${r.site}`);
    console.log(`  #${r.rank} ${marker} [${r.title}] "${r.text}"`);
  }

  // Assess: for Bahá'í content, first result should be OceanLibrary
  if (t.expect === OL_DOMAIN) {
    const first = sourceBreakdown[0];
    const anyOL = sourceBreakdown.some(r => r.isOL);
    if (first.isOL) {
      console.log('  → ✅ PASS: OceanLibrary ranks first');
      passed++;
    } else if (anyOL) {
      console.log(`  → ⚠️  WARN: OceanLibrary present but not first (first: ${first.site} "${first.title}")`);
      warned++;
    } else {
      console.log(`  → ❌ FAIL: No OceanLibrary hit in top ${LIMIT}`);
      failed++;
    }
  } else {
    // Just report source distribution, no strict pass/fail
    const olCount = sourceBreakdown.filter(r => r.isOL).length;
    console.log(`  → ℹ️  ${olCount}/${sourceBreakdown.length} hits from OceanLibrary`);
    passed++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} pass, ${warned} warn, ${failed} fail out of ${TESTS.length} tests`);
if (failed > 0 || warned > 0) {
  console.log('\n⚠️  Issues detected — check source_site enrichment and indexing.');
  process.exit(1);
}
