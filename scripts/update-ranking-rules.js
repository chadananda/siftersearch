#!/usr/bin/env node

/**
 * Update Meilisearch ranking rules with configurable authority position
 *
 * Usage:
 *   node scripts/update-ranking-rules.js           # Use default from config (position 4)
 *   node scripts/update-ranking-rules.js 4         # HIGH weight (after proximity)
 *   node scripts/update-ranking-rules.js 5         # MEDIUM weight (after attribute)
 *   node scripts/update-ranking-rules.js 6         # LOW weight (after sort)
 *   node scripts/update-ranking-rules.js 7         # TIEBREAKER only (after exactness)
 *
 * Position determines when authority:desc is evaluated in ranking:
 *   1 = Before words (authority dominates everything - not recommended)
 *   2 = After words, before typo
 *   3 = After typo, before proximity
 *   4 = After proximity, before attribute (HIGH weight - default)
 *   5 = After attribute, before sort (MEDIUM weight)
 *   6 = After sort, before exactness (LOW weight)
 *   7 = After exactness (TIEBREAKER only)
 */

import { getMeili, INDEXES } from '../api/lib/search.js';

const BASE_RULES = ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'];

function buildRankingRules(position) {
  const pos = Math.min(7, Math.max(1, position));
  const rules = [...BASE_RULES];
  rules.splice(pos - 1, 0, 'authority:desc');
  return rules;
}

function describePosition(pos) {
  const descriptions = {
    1: 'DOMINANT (before words) - Not recommended',
    2: 'VERY HIGH (after words)',
    3: 'HIGH (after typo)',
    4: 'HIGH (after proximity) - Recommended',
    5: 'MEDIUM (after attribute)',
    6: 'LOW (after sort)',
    7: 'TIEBREAKER (after exactness)'
  };
  return descriptions[pos] || 'Unknown';
}

async function updateRankingRules() {
  const position = parseInt(process.argv[2]) || 4;

  console.log('📊 Updating Meilisearch Ranking Rules\n');
  console.log(`Authority position: ${position} - ${describePosition(position)}\n`);

  const rules = buildRankingRules(position);
  console.log('New ranking rules:');
  rules.forEach((rule, i) => {
    const marker = rule === 'authority:desc' ? ' ← authority' : '';
    console.log(`  ${i + 1}. ${rule}${marker}`);
  });
  console.log();

  const meili = getMeili();

  // Update paragraphs index
  console.log('Updating paragraphs index...');
  const paragraphs = meili.index(INDEXES.PARAGRAPHS);
  await paragraphs.updateSettings({
    rankingRules: rules,
    sortableAttributes: ['year', 'created_at', 'paragraph_index', 'authority']
  });

  // Update documents index
  console.log('Updating documents index...');
  const documents = meili.index(INDEXES.DOCUMENTS);
  await documents.updateSettings({
    rankingRules: rules,
    sortableAttributes: ['year', 'title', 'created_at', 'authority']
  });

  // Wait for settings to be applied
  console.log('\nWaiting for settings to be applied...');
  await new Promise(r => setTimeout(r, 2000));

  // Verify settings
  const paraSettings = await paragraphs.getSettings();
  const docSettings = await documents.getSettings();

  console.log('\n✅ Settings updated successfully!\n');
  console.log('Paragraphs index ranking rules:');
  paraSettings.rankingRules.forEach((rule, i) => console.log(`  ${i + 1}. ${rule}`));
  console.log('\nDocuments index ranking rules:');
  docSettings.rankingRules.forEach((rule, i) => console.log(`  ${i + 1}. ${rule}`));

  console.log('\n💡 To change authority weight, run:');
  console.log('   node scripts/update-ranking-rules.js 4  # HIGH');
  console.log('   node scripts/update-ranking-rules.js 5  # MEDIUM');
  console.log('   node scripts/update-ranking-rules.js 7  # TIEBREAKER');
}

updateRankingRules().catch(err => {
  console.error('❌ Failed to update ranking rules:', err);
  process.exit(1);
});
