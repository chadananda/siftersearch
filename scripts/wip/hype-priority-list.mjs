#!/usr/bin/env node
// Build the HyPE regeneration priority list using exact author names from
// the library API. No guessing — every entry is a confirmed author string.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = process.env.PUBLIC_API_URL || 'http://tower-nas:7839';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY;

async function fetchAuthors(religion) {
  const url = `${API_BASE}/api/v1/library/authors?religion=${encodeURIComponent(religion)}&limit=500`;
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.authors || [];
}

// Tier 1-7 — explicit author names (covering known transliteration variants).
// Variant matching is exact-string only; no regex/LIKE fuzziness.
const PRIORITY_AUTHORS = {
  'tier1_shoghi': ['Shoghi Effendi'],
  'tier2_compilations_uhj': [
    'Universal House of Justice',
    'Research Department of the Universal House of Justice',
    'Bahá\u2019\u00ed International Archives, Universal House of Justice',
    'Bahá\u2019\u00ed International Community',
    'Bahá\u2019\u00ed International Community United Nations Office',
    'Bahá\u2019\u00ed International Community\u2019s Office of Public Information',
    'Bahá\u2019\u00ed World Centre',
    'Bahá\u2019\u00ed World Centre, Research Department of the Universal House of Justice',
  ],
  'tier3_abdulbaha': [
    "'Abdu'l-Bahá",
    '\u2019Abdu\u2019l-Bahá',
  ],
  'tier4_bahaullah': [
    "Bahá'u'lláh",
    'Bahá\u2019u\u2019lláh',
    'Baha\u2019u\u2019llah',
  ],
  'tier5_bab': [
    'The Báb',
    'The Bab',
  ],
  'tier6_esslemont': [],  // populate after seeing actual list
  'tier7_nabil': [],
};

const bahaiAuthors = await fetchAuthors("Baha'i");
console.log(`Total Bahá'í authors in library: ${bahaiAuthors.length}`);

// Find Esslemont and Nabíl by substring match in actual API list
const esslemontMatches = bahaiAuthors.filter(a => /esslemont/i.test(a.name));
const nabilMatches = bahaiAuthors.filter(a => /^nab[ií]l(\b|-|\s|[^a-z])/i.test(a.name) && !/Khanum|Nakhjavani/i.test(a.name));
PRIORITY_AUTHORS.tier6_esslemont = esslemontMatches.map(a => a.name);
PRIORITY_AUTHORS.tier7_nabil = nabilMatches.map(a => a.name);

console.log('\n=== Priority list (Bahá\'í primary tiers) ===\n');
const byName = new Map(bahaiAuthors.map(a => [a.name, a]));
let totalDocs = 0;
let totalAuthors = 0;
for (const [tier, names] of Object.entries(PRIORITY_AUTHORS)) {
  console.log(`── ${tier} ──`);
  let tierDocs = 0;
  for (const n of names) {
    const a = byName.get(n);
    if (!a) {
      console.log(`  [missing] ${n}`);
      continue;
    }
    console.log(`  ${a.documentCount.toString().padStart(4)} docs   ${n}`);
    tierDocs += a.documentCount;
    totalAuthors++;
  }
  console.log(`  ──── tier subtotal: ${tierDocs} docs\n`);
  totalDocs += tierDocs;
}
console.log(`Bahá'í primary tiers (1-7) total: ${totalDocs} docs across ${totalAuthors} author entries`);
console.log(`Bahá'í secondary (everything else under religion=Baha'i): ${bahaiAuthors.length - totalAuthors} authors\n`);

// Other religions' doctrinal — list top authors per religion
const RELIGIONS = ['Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Sikh', 'Zoroastrian', 'Tao', 'Confucian', 'Jain'];
console.log('=== Other religions: top authors by doc count ===');
for (const r of RELIGIONS) {
  try {
    const authors = await fetchAuthors(r);
    const top = authors.sort((a, b) => b.documentCount - a.documentCount).slice(0, 5);
    console.log(`\n${r} (${authors.length} authors):`);
    for (const a of top) {
      console.log(`  ${a.documentCount.toString().padStart(5)} docs   ${a.name}`);
    }
  } catch (err) { console.log(`  ${r}: ${err.message}`); }
}
