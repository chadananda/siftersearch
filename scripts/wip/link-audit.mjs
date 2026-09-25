// Link audit of RAW search (/v1/search analyze:false). Chad's order: core books → OceanLibrary.com, then
// BahaiLibrary.com, then OceanofLights.org, then SifterSearch.com. For every result: site tier + paragraph-level?
// For Bahá'í links below tier 1: search the passage's own opening words — did a HIGHER-tier copy exist?
// Finally GET a sample of links. Run: node scripts/wip/link-audit.mjs [out.json]
import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const KEY = process.env.PUBLIC_SIFTER_API_KEY;
const API = 'https://api.siftersearch.com/api/v1/search';
const { containsQuote, foldText } = await import('../../api/lib/quote-text.js');

const QUERIES = [
  // Core Bahá'í texts — should be OceanLibrary
  'The earth is but one country, and mankind its citizens', 'O Son of Spirit! My first counsel is this', 'the best beloved of all things in My sight is Justice',
  'Kitáb-i-Aqdas laws of prayer and fasting', 'Kitáb-i-Íqán progressive revelation', 'Seven Valleys valley of search', 'Bahá’u’lláh prayers for healing',
  'Epistle to the Son of the Wolf', 'Tablet of Ahmad', 'the Báb on the station of Him Whom God shall make manifest', 'Selections from the Writings of the Báb',
  'Abdu’l-Bahá on the equality of women and men', 'Some Answered Questions on evolution', 'Paris Talks two wings of religion and science', 'Promulgation of Universal Peace harmony of science and religion',
  'Will and Testament of Abdu’l-Bahá', 'Tablets of the Divine Plan', 'Memorials of the Faithful', 'Secret of Divine Civilization',
  'Shoghi Effendi on the Administrative Order', 'The Advent of Divine Justice chaste and holy life', 'God Passes By martyrdom of the Báb', 'The World Order of Bahá’u’lláh',
  'The Dawn-Breakers Mullá Ḥusayn at Shaykh Ṭabarsí', 'Universal House of Justice on the Nineteen Day Feast', 'Huqúqu’lláh', 'Mashriqu’l-Adhkár',
  // Bahá'í secondary / history — BahaiLibrary acceptable
  'Balyuzi biography of Bahá’u’lláh', 'Taherzadeh Revelation of Bahá’u’lláh', 'Star of the West Long Beach', 'pilgrim notes of Abdu’l-Bahá in Haifa',
  'Letters of the Living', 'Badasht conference Táhirih', 'Bahá’í Faith in Iran persecution', 'Nabíl-i-A’ẓam',
  // Questions
  'What does Bahá’u’lláh say about justice?', 'When was the Báb martyred?', 'What happens to the soul after death?', 'What is the purpose of life?',
  'How should Bahá’ís treat their parents?', 'What is the Covenant?',
  // Other traditions
  'The Lord is my shepherd', 'Blessed are the meek', 'There is no compulsion in religion', 'hatred does not cease by hatred',
  'Bhagavad Gita on duty and action', 'Tao Te Ching the Tao that can be told', 'Guru Granth Sahib on the name of God', 'Zoroaster good thoughts good words good deeds',
];

const TIERS = [['oceanlibrary.com', 1], ['bahai-library.com', 2], ['oceanoflights.org', 3], ['siftersearch.com', 4]];
const tierOf = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return (TIERS.find(([d]) => h === d || h.endsWith('.' + d)) || [h, 5]); } catch { return ['none', 9]; } };
const paraLevel = (u) => /paraId=|#p\d+|[?&]p=\d+/.test(u || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function search(q) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY }, body: JSON.stringify({ query: q, limit: 10, analyze: false }) });
    if (r.ok) return (await r.json()).results || [];
    await sleep(2000 * (a + 1));
  }
  throw new Error(`search failed: ${q}`);
}

const rows = [];
for (let i = 0; i < QUERIES.length; i += 3) {
  const batch = await Promise.all(QUERIES.slice(i, i + 3).map(async (q) => ({ q, res: await search(q).catch(() => []) })));
  for (const { q, res } of batch) res.forEach((h, rank) => {
    const [site, tier] = tierOf(h.url);
    rows.push({ q, rank: rank + 1, doc: h.documentId, title: h.title, author: h.author, religion: h.religion, url: h.url, docUrl: h.documentUrl, site, tier, para: paraLevel(h.url), text: h.text || '' });
  });
  process.stderr.write(`.`);
}

// Better copy available? For Bahá'í results below tier 1, search the passage's own opening words.
const probe = rows.filter((r) => /baha/i.test(r.religion || '') && r.tier > 1);
const byDoc = new Map();
for (const r of probe) if (!byDoc.has(r.doc)) byDoc.set(r.doc, r);
const better = [];
const docs = [...byDoc.values()];
for (let i = 0; i < docs.length; i += 3) {
  await Promise.all(docs.slice(i, i + 3).map(async (r) => {
    const words = foldText(r.text).split(' ').slice(0, 14).join(' ');
    if (words.split(' ').length < 8) return;
    const res = await search(words).catch(() => []);
    const same = res.filter((h) => h.documentId !== r.doc && containsQuote(h.text, words));
    const top = same.map((h) => ({ h, t: tierOf(h.url)[1] })).sort((a, b) => a.t - b.t)[0];
    if (top && top.t < r.tier) better.push({ doc: r.doc, title: r.title, author: r.author, site: r.site, url: r.url, betterSite: tierOf(top.h.url)[0], betterUrl: top.h.url, betterTitle: top.h.title });
  }));
  process.stderr.write(`+`);
}

// Do the links work? GET a sample of distinct URLs.
const urls = [...new Set(rows.map((r) => r.url).filter(Boolean))];
const sample = urls.filter((_, i) => i % Math.max(1, Math.floor(urls.length / 60)) === 0).slice(0, 60);
const status = {};
for (let i = 0; i < sample.length; i += 6) {
  await Promise.all(sample.slice(i, i + 6).map(async (u) => {
    try { const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15000) }); status[u] = r.status; }
    catch (e) { status[u] = `ERR ${e.message.slice(0, 40)}`; }
  }));
}

const out = { at: new Date().toISOString(), queries: QUERIES.length, rows, better, status };
fs.writeFileSync(process.argv[2] || 'link-audit.json', JSON.stringify(out, null, 1));
const n = rows.length;
const pct = (k) => `${k} (${Math.round((k / n) * 100)}%)`;
console.log(`\n${n} links from ${QUERIES.length} queries`);
for (const [site] of [...TIERS, ['other', 5]]) {
  const rs = rows.filter((r) => (site === 'other' ? r.tier === 5 : r.site === site));
  if (rs.length) console.log(`  ${site.padEnd(20)} ${pct(rs.length).padEnd(10)} paragraph-level ${rs.filter((r) => r.para).length}/${rs.length}`);
}
const baha = rows.filter((r) => /baha/i.test(r.religion || ''));
const core = baha.filter((r) => /baha.?u.?llah|the bab|abdu.?l.?baha|shoghi|universal house/i.test(foldText(r.author)));
console.log(`\nBahá'í core-author links: ${core.length}, of which OceanLibrary ${core.filter((r) => r.tier === 1).length}, SifterSearch ${core.filter((r) => r.tier === 4).length}`);
console.log(`Better-tier copy of the SAME passage existed for ${better.length} of ${docs.length} Bahá'í documents linked below OceanLibrary`);
const bad = Object.entries(status).filter(([, s]) => s !== 200);
console.log(`Link check: ${Object.keys(status).length - bad.length}/${Object.keys(status).length} returned 200`);
for (const [u, s] of bad.slice(0, 12)) console.log(`   ${s}  ${u}`);
