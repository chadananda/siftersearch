#!/usr/bin/env node
// Extended interfaith search quality test — goes beyond the standard diagnostic
// to assess diversity, authority, and relevance across themes and traditions.

import { setTimeout as delay } from 'timers/promises';

const API_BASE = process.env.API_BASE || 'https://api.siftersearch.com';
const API_KEY = 'a9b228276d355e3a053223bfd64cd5546792c65053905606fef5dfe68fab7a31';

async function search(query, options = {}) {
  const body = { query, mode: 'passages', limit: 8, ...options };
  const r = await fetch(`${API_BASE}/api/v1/tools/search`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// Test cases: [query, label, options, expectedTopReligion, minTraditions]
// minTraditions: minimum distinct religions expected in top 5 for cross-tradition queries
const TESTS = [
  // Cross-tradition universal themes
  { q: 'love your enemies forgiveness', label: 'Love/Forgiveness', minTraditions: 3 },
  { q: 'pray without ceasing meditation contemplation', label: 'Prayer/Meditation', minTraditions: 3 },
  { q: 'the straight path righteousness virtue', label: 'Righteousness/Virtue', minTraditions: 3 },
  { q: 'paradise heaven reward afterlife', label: 'Afterlife/Paradise', minTraditions: 3 },
  { q: 'the soul is immortal death resurrection', label: 'Soul/Resurrection', minTraditions: 3 },
  { q: 'God created the heavens and the earth in the beginning', label: 'Creation', minTraditions: 3 },
  { q: 'prophet messenger revelation word of God', label: 'Prophet/Revelation', minTraditions: 3 },
  { q: 'love thy neighbor golden rule do unto others', label: 'Golden Rule', minTraditions: 3 },
  { q: 'be grateful give thanks to God blessings', label: 'Gratitude/Thanks', minTraditions: 3 },
  { q: 'purify the heart detachment worldly things', label: 'Detachment/Purity', minTraditions: 3 },
  { q: 'seek knowledge wisdom understanding enlightenment', label: 'Knowledge/Wisdom', minTraditions: 3 },
  { q: 'service humanity unity brotherhood peace', label: 'Service/Unity', minTraditions: 3 },
  { q: 'fasting prayer charity pilgrimage worship', label: 'Pillars of Worship', minTraditions: 3 },
  { q: 'repentance turning back to God forgiveness of sins', label: 'Repentance', minTraditions: 3 },
  { q: 'divine names attributes of God omniscient omnipotent', label: 'Divine Attributes', minTraditions: 3 },

  // Single-tradition scripture spot-checks
  { q: 'In the beginning God created the heavens and the earth', label: 'Genesis (Bible)', religion: 'Christian', minOL: 3 },
  { q: 'blessed are the poor in spirit for theirs is the kingdom of heaven', label: 'Beatitudes (Bible)', religion: 'Christian', minOL: 3 },
  { q: 'The Lord is my shepherd I shall not want', label: 'Psalm 23 (Bible)', religion: 'Christian', minOL: 2 },
  { q: 'Love is patient love is kind bears all things hopes all things', label: '1 Cor 13 (Bible)', religion: 'Christian', minOL: 2 },
  { q: 'Praise be to God Lord of the worlds the compassionate merciful', label: 'Al-Fatihah (Quran)', religion: 'Islam', minOL: 3 },
  { q: 'Say He is God alone God the Eternal uncaused cause', label: 'Al-Ikhlas (Quran)', religion: 'Islam', minOL: 3 },
  { q: 'We have created you from a single soul male and female', label: 'Hujurat 49:13 (Quran)', religion: 'Islam', minOL: 1 },
  { q: 'O Son of Man I loved thy creation hence I created thee', label: 'Hidden Words Arabic (Bahá\'í)', religion: "Baha'i" },
  { q: 'Noble Eightfold Path right view right intention right speech', label: 'Eightfold Path (Buddhist)', religion: 'Buddhist' },
  { q: 'four noble truths suffering cessation nirvana', label: 'Four Noble Truths (Buddhist)', religion: 'Buddhist' },
  { q: 'Hear O Israel the Lord our God the Lord is one', label: 'Shema (Jewish)', religion: 'Jewish', minOL: 1 },
  { q: 'Om the sound of the universe Brahman Atman', label: 'Om/Brahman (Hindu)', religion: 'Hindu' },
];

const results = [];
let passed = 0, warned = 0, failed = 0;

console.log('\n=== EXTENDED INTERFAITH QUALITY TEST ===\n');
console.log(`API: ${API_BASE}`);
console.log(`Time: ${new Date().toISOString()}\n`);

for (const t of TESTS) {
  const opts = {};
  if (t.religion) opts.religion = t.religion;

  let data;
  try {
    data = await search(t.q, opts);
    await delay(200);
  } catch (e) {
    console.log(`❌ ERROR [${t.label}]: ${e.message}`);
    results.push({ ...t, error: e.message });
    failed++;
    continue;
  }

  const hits = data.passages || data.results || [];
  const top5 = hits.slice(0, 5);
  const religions = top5.map(h => h.religion || '?');
  const distinct = new Set(religions).size;
  const olCount = top5.filter(h => h.source_site || (h.source_url || '').includes('oceanlibrary')).length;

  const issues = [];
  if (t.minTraditions && distinct < t.minTraditions) {
    issues.push(`only ${distinct} traditions in top-5 (want ≥${t.minTraditions})`);
  }
  if (t.minOL && olCount < t.minOL) {
    issues.push(`only ${olCount}/5 OL hits (want ≥${t.minOL})`);
  }
  if (t.religion && religions[0] !== t.religion && religions[0] !== '?') {
    // Top hit isn't the right religion for filtered queries
    if (!hits.some(h => h.religion === t.religion)) {
      issues.push(`no ${t.religion} results returned`);
    }
  }

  const icon = issues.length === 0 ? '✅' : (t.minTraditions && distinct < 2) || (t.minOL && olCount === 0) ? '❌' : '⚠️';
  if (icon === '✅') passed++;
  else if (icon === '⚠️') warned++;
  else failed++;

  const detail = `traditions=${distinct} OL=${olCount}/5 top=[${religions.slice(0, 3).join(',')}]`;
  console.log(`${icon} [${t.label}] ${detail}`);
  if (issues.length) console.log(`   Issues: ${issues.join('; ')}`);

  results.push({ ...t, distinct, olCount, religions, issues });
}

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed} | Warned: ${warned} | Failed: ${failed} | Total: ${TESTS.length}`);
console.log(`\nPassed: ${Math.round(passed/TESTS.length*100)}%`);

if (warned > 0 || failed > 0) {
  console.log('\nIssues:');
  for (const r of results) {
    if (r.issues?.length) console.log(`  ${r.label}: ${r.issues.join('; ')}`);
  }
}
