#!/usr/bin/env node
// ALTERNATE SOURCES for the YouTube talk targets (Chad 10-22: "Where a direct legitimate download exists, use it"): for each
// target, search the Internet Archive for the same talk (speaker surname + title words, audio or video) and record the
// matches as `alternate_sources` in planning/media-targets/youtube-talks.json. An API client of archive.org only — no
// database. Paced (1 request/s). Re-runnable: targets already searched are skipped unless --all.
//   node scripts/media/alt-sources.mjs [--limit N] [--all]
import { readFileSync, writeFileSync } from 'fs';

const FILE = 'planning/media-targets/youtube-talks.json';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg('--limit', 1e9)), all = process.argv.includes('--all');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'`ʼ]/g, '').toLowerCase();
const STOP = new Set('the a an of and in on to for with by at from is are was be about bahai bahaullah faith talk talks hooper dunbar part session video audio lecture'.split(' '));
export const words = (s) => fold(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
/** Share of the target title's content words found in a candidate title. Pure. */
export function titleSimilarity(a, b) { const wa = [...new Set(words(a))], wb = new Set(words(b)); return wa.length ? wa.filter((w) => wb.has(w)).length / wa.length : 0; }
const surname = (n) => fold(n).replace(/\(.*?\)/g, '').trim().split(/\s+/).pop();

async function search(t) {
  const sn = surname(t.speaker);
  const kw = words(t.title).slice(0, 6);
  if (!sn || !kw.length) return [];
  const q = `(${kw.map((w) => `title:${w}`).join(' OR ')}) AND (creator:${sn} OR title:${sn} OR description:${sn}) AND (mediatype:audio OR mediatype:movies)`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=mediatype&rows=8&output=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'SifterSearch media library (chadananda@gmail.com)' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`archive.org ${r.status}`);
  const docs = (await r.json())?.response?.docs || [];
  return docs.map((d) => ({ host: 'archive.org', identifier: d.identifier, title: d.title, creator: [].concat(d.creator || []).join('; '), mediatype: d.mediatype,
    url: `https://archive.org/details/${d.identifier}`, similarity: Math.round(titleSimilarity(t.title, d.title) * 100) / 100 }))
    .filter((c) => c.similarity >= 0.6 && fold(`${c.title} ${c.creator}`).includes(sn));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  let done = 0, found = 0, total = 0;
  for (const sec of ['curated_sacred_traditions', 'hooper_dunbar', 'hands_uhj']) {
    for (const t of data[sec]) {
      total++;
      if (t.relation !== 'speaker' || t.is_short) continue;
      if (!all && t.alternate_sources_checked) { if (t.alternate_sources?.length) found++; continue; }
      if (done >= limit) continue;
      try { t.alternate_sources = await search(t); t.alternate_sources_checked = new Date().toISOString().slice(0, 10); } catch (e) { process.stderr.write(`  ! ${t.video_id}: ${e.message}\n`); }
      if (t.alternate_sources?.length) found++;
      done++;
      if (done % 25 === 0) { writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`); process.stderr.write(`  ${done} searched, ${found} with an alternate source\n`); }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  data.counts = { ...(data.counts || {}), with_alternate_source: found };
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
  console.log(JSON.stringify({ searched: done, with_alternate_source: found, targets: total }));
}
