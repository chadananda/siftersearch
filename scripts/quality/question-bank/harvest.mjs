#!/usr/bin/env node
// Question-bank harvest: Google (+Bing) autocomplete per tradition × name × stem (+a-z) → tmp/question-bank/raw cache → ranked top-N → tests/quality/question-bank/<tradition>.json. No LLM, no key.
//   node harvest.mjs [--tradition sikhism,islam] [--top 100] [--rank-only] [--no-bing]   ≤2 req/s, every response cached (resumable)
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import net from 'net';
import { TRADITIONS, STEMS, ALPHA } from './traditions.mjs';
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const flag = (k) => process.argv.includes(`--${k}`);
const RAW = 'tmp/question-bank/raw', OUT = 'tests/quality/question-bank', TOP = Number(arg('top') || 100);
const SRC = { google: { w: 1, url: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}` }, bing: { w: 0.8, url: (q) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}` } };
// optional DataForSEO enrichment (enrich.mjs): real monthly volumes + People-Also-Ask questions, merged into the score
const jread = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const VOL = jread('tmp/question-bank/volumes.json', {}), PAA = jread('tmp/question-bank/paa.json', {});
const sources = flag('no-bing') ? ['google'] : ['google', 'bing'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cachePath = (s, p) => `${RAW}/${s}/${createHash('sha1').update(p).digest('hex').slice(0, 16)}.json`;
let last = 0, fetched = 0;
// a cache file torn by two concurrent writers is treated as missing (refetched), never fatal
const cached = (s, p) => { try { return JSON.parse(readFileSync(cachePath(s, p), 'utf8')).list; } catch { return null; } };
async function suggest(s, prefix) {
  const f = cachePath(s, prefix);
  const hit = cached(s, prefix); if (hit) return hit;
  for (let a = 0; a < 4; a++) {
    await sleep(Math.max(0, 500 - (Date.now() - last))); last = Date.now();
    try {
      const r = await fetch(SRC[s].url(prefix), { signal: AbortSignal.timeout(10000) });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; }
      if (!r.ok) throw new Error(`http ${r.status}`);
      const list = (await r.json())[1] || []; fetched++;
      mkdirSync(`${RAW}/${s}`, { recursive: true }); writeFileSync(f, JSON.stringify({ prefix, list }));
      return list;
    } catch (e) { if (a === 3) { console.error(`  ! ${s} "${prefix}": ${e.message}`); return null; } await sleep(2000); }
  }
  return null;
}
// prefixes for one tradition: stems × names, plus a-z on the strongest stems
function prefixes(t) {
  const out = new Set();
  for (const [k, stems] of Object.entries(STEMS)) for (const x of t[k]) for (const s of stems) out.add(s.replace('{x}', x));
  for (const [k, s] of ALPHA) for (const x of t[k]) for (const c of 'abcdefghijklmnopqrstuvwxyz') out.add(`${s.replace('{x}', x)} ${c}`);
  return [...out];
}
// ---- filters: a question about the tradition (not a team/place/product); loaded/hateful premises are left out of the minimum bar
const QWORD = /^(what|why|how|do|does|did|is|are|was|were|can|could|should|will|would|when|who|whom|whose|where|which|has|have|if)\b/;
const OFFTOPIC = /\b(football|basketball|baseball|soccer|nfl|nba|ncaa|team|stats|roster|score|schedule|university|college|high school|school district|near me|hotel|jobs?|salary|lyrics|movie|film|episode|song|game|menu|hours|tickets?|stock|price|weather|map|zip code|address|phone number|app|amazon|netflix|youtube|tiktok|reddit|wiki|pdf|download|free|coupon|discount|store|shop|church of christ near|christian bale|jesus christ superstar|taoist priest dies)\b/;
const LOADED = /\b(control|controls|own the|owns|run the|runs the|banks?|media|big nose|greedy|cheap|hate|hates|terroris|kill|killing|bomb|nazi|stupid|evil|inferior|cult|cults|rape|slave|slaves|pedophil|brainwash|fake|devil|satan|sin|sinners?|burn in hell|go to hell|hell)\b/;
const norm = (s) => s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9'\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an the of in on to for and or is are do does did it its their they that this be as at by with from'.split(' '));
const toks = (q) => new Set(norm(q).split(' ').filter((w) => w && !STOP.has(w)).map((w) => w.replace(/s$/, '')));
const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
function keep(t, q) {
  if (q.split(' ').length < 3 && !/ vs\b/.test(q)) return false;
  if (!(QWORD.test(q) || / vs /.test(q))) return false;
  if (OFFTOPIC.test(q) || LOADED.test(q)) return false;
  return t.terms.some((x) => new RegExp(`(^|[^a-z])${x.replace(/^=/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${x[0] === '=' ? '(?![a-z])' : ''}`).test(q));   // word-start match: 'the bab' must not hit 'babylonians'
}
async function build(id, t) {
  const hits = new Map();   // q → { score, sources:Set, prefixes:Set }
  const pre = prefixes(t); let n = 0;
  for (const p of pre) {
    n++; if (n % 100 === 0) console.log(`  ${id} ${n}/${pre.length} (fetched ${fetched})`);
    for (const s of sources) {
      // bing: base stems only (no a-z) to stay polite
      if (s === 'bing' && /\s[a-z]$/.test(p) && !pre.includes(p.slice(0, -2))) continue;
      if (s === 'bing' && /\s[a-z]$/.test(p)) continue;
      const list = flag('rank-only') ? (cached(s, p) || []) : await suggest(s, p);
      (list || []).forEach((raw, i) => {
        const q = norm(raw); if (!keep(t, q)) return;
        const h = hits.get(q) || { score: 0, sources: new Set(), prefixes: new Set() };
        h.score += SRC[s].w * (10 - Math.min(i, 9)) / 10; h.sources.add(s); h.prefixes.add(p); hits.set(q, h);
      });
    }
  }
  // People Also Ask questions for this tradition's seeds: real Google questions, a base score of 2
  for (const raw of PAA[id] || []) { const q = norm(raw); if (!keep(t, q)) continue; const h = hits.get(q) || { score: 0, sources: new Set(), prefixes: new Set() }; h.score += 2; h.sources.add('paa'); hits.set(q, h); }
  // recurrence bonus, then merge near-duplicates (keep the highest-scoring wording, list the rest as variants)
  const all = [...hits].map(([q, h]) => ({ q, volume: VOL[q] ?? null, score: +(h.score + 0.5 * (h.prefixes.size - 1) + (h.sources.size > 1 ? 1 : 0) + 4 * Math.log10(1 + (VOL[q] || 0))).toFixed(2), sources: [...h.sources], variants: [], tk: toks(q) })).sort((a, b) => b.score - a.score);
  const kept = [];
  for (const c of all) { const m = kept.find((k) => jac(k.tk, c.tk) >= 0.75); if (m) { m.variants.push(c.q); m.score = +(m.score + c.score * 0.1).toFixed(2); } else kept.push(c); }
  kept.sort((a, b) => b.score - a.score);
  mkdirSync('tmp/question-bank/candidates', { recursive: true }); writeFileSync(`tmp/question-bank/candidates/${id}.json`, JSON.stringify(kept.slice(0, 600).map((k) => k.q)));
  const top = kept.slice(0, TOP).map(({ q, score, sources, variants, volume }, i) => ({ id: `${id}-${String(i + 1).padStart(3, '0')}`, q, variants: variants.slice(0, 8), score, volume, sources, held_out: i % 5 === 4 }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify({ tradition: id, label: t.label, harvested: new Date().toISOString().slice(0, 10), candidates: kept.length, questions: top }, null, 1) + '\n');
  console.log(`${id}: ${hits.size} raw → ${kept.length} distinct → top ${top.length}; e.g. ${top.slice(0, 3).map((x) => x.q).join(' | ')}`);
}
const only = arg('tradition')?.split(',');
for (const [id, t] of Object.entries(TRADITIONS)) if (!only || only.includes(id)) await build(id, t);
console.log(`done; ${fetched} new requests`);
