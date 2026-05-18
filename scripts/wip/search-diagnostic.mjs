#!/usr/bin/env node
// Search quality diagnostic — tests cross-religion queries, authority, link correctness.

import { setTimeout as delay } from 'timers/promises';
import { writeFileSync } from 'fs';

const API_BASE = process.env.API_BASE || 'https://api.siftersearch.com';
const API_KEY = 'a9b228276d355e3a053223bfd64cd5546792c65053905606fef5dfe68fab7a31';
const WAIT_SECS = parseInt(process.argv[2] || '0', 10);

if (WAIT_SECS > 0) {
  console.log(`Waiting ${WAIT_SECS}s for server to update...`);
  await delay(WAIT_SECS * 1000);
}

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

async function checkUrl(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return r.status;
  } catch (e) {
    return `ERR: ${e.message}`;
  }
}

const QUERIES = [
  { q: 'love your enemies forgiveness', label: 'Love/Forgiveness (cross-tradition)' },
  { q: 'pray without ceasing meditation contemplation', label: 'Prayer/Meditation (cross-tradition)' },
  { q: 'the straight path righteousness virtue', label: 'Righteousness/Virtue (cross-tradition)' },
  { q: 'God is merciful compassionate Rahman Rahim', label: 'Mercy of God — Quran terms' },
  { q: 'paradise heaven reward afterlife', label: 'Afterlife/Paradise (cross-tradition)' },
  { q: 'Praise be to God Lord of the worlds the compassionate merciful guide us straight path', label: 'Sura Al-Fatihah content (Quran)', religion: 'Islam' },
  { q: 'Say He is God alone God the Eternal He begetteth not and He is not begotten', label: 'Sura Al-Ikhlas (Quran)', religion: 'Islam' },
  { q: 'In the beginning God created the heavens and the earth', label: 'Genesis opening (Bible)', religion: 'Christian' },
  { q: 'beatitudes sermon on the mount blessed poor in spirit', label: 'Beatitudes (Christian)', religion: 'Christian' },
  { q: 'O Son of Man I loved thy creation hence I created thee', label: "Hidden Words Arabic #4 (Bahá'í actual text)" },
  { q: 'Noble Eightfold Path right view intention speech', label: 'Eightfold Path (Buddhist)', religion: 'Buddhist' },
  { q: 'four noble truths dukkha suffering cessation nirvana', label: 'Four Noble Truths (Buddhist)', religion: 'Buddhist' },
];

const results = [];
let totalLinks = 0, goodLinks = 0, olLinks = 0;

console.log('\n=== SEARCH QUALITY DIAGNOSTIC ===\n');
console.log(`API: ${API_BASE}`);
console.log(`Time: ${new Date().toISOString()}\n`);

for (const testCase of QUERIES) {
  console.log(`\n--- ${testCase.label} ---`);
  console.log(`Query: "${testCase.q}"${testCase.religion ? ` [${testCase.religion}]` : ''}`);

  const opts = testCase.religion ? { religion: testCase.religion } : {};

  let data;
  try {
    data = await search(testCase.q, opts);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    results.push({ query: testCase.q, label: testCase.label, error: e.message });
    continue;
  }

  const hits = data.passages || data.results || [];
  const topHits = hits.slice(0, 5);
  const religions = topHits.map(h => h.religion || '?');
  // authority not in API response — infer from site/source
  const inferAuth = h => {
    if (h.source_site) return '(OL)';
    const a = h.author || '';
    if (['Bahá\'u\'lláh','The Báb','Muhammad'].includes(a)) return 10;
    if (["'Abdu'l-Bahá",'Shoghi Effendi'].includes(a)) return 9;
    if (h.religion === 'Islam' && h.collection?.includes('Quran')) return 10;
    if (h.religion === 'Christianity' && h.collection?.includes('Bible')) return 10;
    return '?';
  };

  const isOLHit = h => !!(h.source_site || (h.source_url || '').includes('oceanlibrary'));
  const olCount = topHits.filter(isOLHit).length;

  console.log(`  Hits: ${hits.length} | Top-5 religions: ${religions.join(', ')}`);
  console.log(`  OceanLibrary in top 5: ${olCount}`);

  const linkChecks = [];
  for (let i = 0; i < Math.min(3, topHits.length); i++) {
    const h = topHits[i];
    const url = h.source_url;
    const auth = inferAuth(h);
    const title = (h.title || '').slice(0, 55);
    const author = h.author || '?';
    const hasParaId = url && (url.includes('paraId=') || url.includes('#p'));

    let linkStatus = 'no-url';
    let isOL = false;
    if (url) {
      totalLinks++;
      linkStatus = await checkUrl(url);
      if (String(linkStatus) === '200') goodLinks++;
      isOL = url.includes('oceanlibrary.com');
      if (isOL) olLinks++;
    }

    const linkTag = !url ? '❌no-url' :
      String(linkStatus) === '200' ? (isOL ? (hasParaId ? '✅OL+deeplink' : '✅OL') : (hasParaId ? '✅+anchor' : '✅')) :
      String(linkStatus).startsWith('3') ? '↩️redir' : `❌${linkStatus}`;

    console.log(`  [${i+1}] ${h.religion||'?'} | auth≈${auth} | "${title}" (${author})`);
    console.log(`       ${linkTag} ${url ? url.slice(0, 90) : ''}`);
    linkChecks.push({ url, status: linkStatus, isOL, hasParaId, title, author, religion: h.religion, collection: h.collection });
  }

  results.push({
    label: testCase.label,
    query: testCase.q,
    religion: testCase.religion,
    hitCount: hits.length,
    topReligions: religions,
    olCount,
    linkChecks,
  });
}

console.log('\n\n=== SUMMARY ===\n');
console.log(`Links: ${totalLinks} checked | ${goodLinks} OK (${totalLinks ? Math.round(goodLinks/totalLinks*100) : 0}%) | ${olLinks} OceanLibrary deeplinks`);

console.log('\nTop-hit OceanLibrary rate:');
for (const r of results) {
  if (r.error) continue;
  const ol = r.olCount || 0;
  const status = ol >= 3 ? '✅' : ol >= 1 ? '🟡' : '🔴';
  console.log(`  ${status} [${r.label}]: ${ol}/5 OL | top religion: ${r.topReligions[0]||'?'}`);
}

console.log('\nLink problems:');
let anyBad = false;
for (const r of results) {
  if (r.error || !r.linkChecks?.length) continue;
  const bad = r.linkChecks.filter(l => l.url && String(l.status) !== '200' && !String(l.status).startsWith('3'));
  if (bad.length) {
    anyBad = true;
    console.log(`  ❌ ${r.label}: ${bad.map(l => `${l.status} ${l.url}`).join('\n       ')}`);
  }
}
if (!anyBad) console.log('  None found');

writeFileSync('scripts/wip/diag-results.json', JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
console.log('\nFull results: scripts/wip/diag-results.json');
