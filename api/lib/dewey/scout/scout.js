// THE SCOUT (planning/dewey-scouts-plan.md): for each work on a list — held already? → search EVERY channel for a copy →
// a copy found is downloaded, its TEXT checked against the library (another title for the same book is caught here),
// appraised, and OFFERED to Chad with where it came from; a copy readable only elsewhere (borrow/view) is a LEAD; nothing
// anywhere and important → TO BUY, with every channel searched, used prices and who to ask. A work handled once is never
// handled again (its title key or page is on an item). Deps injectable; one site request at a time.
import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { createItem, updateItem, listItems } from '../../repos/dewey-repo.js';
import { workKey } from '../../ops/dewey-ingest-folder-job.js';
import { CHANNELS, purchaseLeads, isShadow } from './channels.js';
import { UA } from './ris.js';
import { toMarkdownText } from '../convert.js';

export const scoutDir = () => process.env.DEWEY_SCOUT_DIR || '/tank/dewey-ingest/scout';
const BY = 'dewey-scout';
const DOWNLOADABLE = ['pdf', 'text', 'epub', 'html'];
const pause = (ms) => new Promise((z) => setTimeout(z, ms));
const extOf = (c, type = '') => (c.kind === 'pdf' || /pdf/.test(type) ? 'pdf' : c.kind === 'epub' || /epub/.test(type) ? 'epub' : c.kind === 'text' || /text\/plain/.test(type) ? 'txt' : 'html');

/** Download a found copy (≤ 150 MB) to the scout folder → path, or null. */
export async function download(c, { fetchImpl = fetch, dir = scoutDir() } = {}) {
  if (isShadow(c.url)) return null;
  const r = await fetchImpl(c.url, { redirect: 'follow', signal: AbortSignal.timeout(300000), headers: { 'User-Agent': UA } }).catch(() => null);
  if (!r?.ok) return null;
  const len = Number(r.headers.get('content-length') || 0);
  if (len > 150e6) return null;
  const type = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 800) return null;
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${Date.now()}-${String(c.title || 'copy').replace(/[^\w]+/g, '_').slice(0, 60)}.${extOf(c, type)}`);
  await writeFile(path, buf);
  return path;
}

/** A list's own page (bahai-library): the documents it links (PDF, Word) first, then the page itself — whose text, once
 *  downloaded, must be more than a catalogue card (the 150-word floor and the holdings read decide). */
export async function pageCopies(work, fetchImpl = fetch) {
  const r = await fetchImpl(work.page, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': UA } }).catch(() => null);
  const html = r?.ok ? await r.text() : '';
  const site = new URL(work.page).hostname;
  const docs = [...new Set([...html.matchAll(/href="([^"]+\.(?:pdf|docx?|rtf)(?:\?[^"]*)?)"/gi)].map((m) => new URL(m[1], work.page).href))]
    .filter((u) => !isShadow(u) && !/favicon|logo/i.test(u)).slice(0, 4);
  return [...docs.map((u) => ({ url: u, kind: /\.pdf/i.test(u) ? 'pdf' : 'html', site, title: work.title, note: 'linked from the list\'s page' })),
    { url: work.page, kind: 'html', site, title: work.title, note: 'the list\'s own page' }];
}

/** One work → its outcome. deps: check (holdings by title), checkFile (identifyAndCheck), appraise, archive, channels, … */
export async function scoutWork(work, deps = {}) {
  const { check, checkFile, appraise, archive, channels = CHANNELS, purchase = purchaseLeads, get = download, politeMs = 1500,
    create = createItem, update = updateItem, read = async (p) => (await toMarkdownText(null, p.split('/').pop(), { path: p, full: false })).markdown } = deps;
  const scout = { list: work.list, why: work.why, importance: work.importance, page: work.page || null, channels: [] };
  // 1. HELD? by title first (cheap); a copy's text decides later
  const h = await check({ title: work.title, author: work.author, from: 'scout' }).catch(() => null);
  if (h?.verdict === 'held') {
    const top = h.candidates?.[0];
    await create({ title: work.title, author: work.author, kind: work.kind, identified: { title: work.title, author: work.author, scout, held: top ? { id: top.id, title: top.title } : null }, by: BY, state: 'declined', why: `scout: already in the library${top ? ` — #${top.id} ${top.title}` : ''}` });
    return { state: 'held', held: top?.id };
  }
  // 2. EXHAUST THE CHANNELS — a known page first (bahai-library: the page is the work, or links its PDF), then every channel
  const found = [];
  if (work.page) found.push(...await pageCopies(work, deps.fetchImpl || fetch).catch(() => []));
  for (const [name, fn] of Object.entries(channels)) {
    const hits = await fn({ ...work, isbns: found.flatMap((f) => f.isbns || []) }).catch((e) => { scout.channels.push({ channel: name, searched: false, error: String(e.message).slice(0, 120) }); return null; });
    if (hits) { scout.channels.push({ channel: name, searched: true, found: hits.length }); found.push(...hits.filter((x) => !isShadow(x.url))); }
    await pause(politeMs);
    // a downloadable copy from a known channel is enough; the open web is searched only when none was
    if (name === 'bahai.works' && found.some((f) => DOWNLOADABLE.includes(f.kind) && f.site !== 'web')) break;
  }
  scout.found = found.map(({ context, ...f }) => f).slice(0, 20);
  // 3. A COPY: download → text checked against the library → appraised → offered
  for (const c of found.filter((f) => DOWNLOADABLE.includes(f.kind))) {
    const path = await get(c).catch(() => null);
    if (!path) continue;
    const doc = await checkFile({ path }).catch(() => null);
    const words = String(doc?.identified?._text || doc?.excerpt || '').split(/\s+/).length;
    if (!doc || words < 150) { await unlink(path).catch(() => {}); continue; }   // a sales page, a catalogue entry, an empty scan
    if (doc.result?.verdict === 'held') {
      const top = doc.result.candidates?.[0];
      await create({ title: work.title, author: work.author, kind: work.kind, identified: { ...doc.identified, scout, source: c }, by: BY, state: 'declined',
        why: `scout: a copy (${c.site}) reads as a work the library holds${top ? ` — #${top.id} ${top.title}` : ''}` });
      await unlink(path).catch(() => {});
      return { state: 'held-by-text', held: top?.id };
    }
    const a = await appraise(doc.identified, doc.excerpt, doc.result?.verdict).catch(() => null);
    const item = await create({ title: a?.title || work.title, author: a?.author || work.author, kind: a?.kind || work.kind,
      identified: { ...doc.identified, _text: undefined, file_name: path.split('/').pop(), shelf: a?.shelf || null, appraisal: a, scout, source: c, verdict: doc.result?.verdict }, by: BY, state: 'offered',
      why: `scout found a copy at ${c.site} (${c.kind}${c.note ? `, ${c.note}` : ''}) — ${doc.result?.verdict}; ${scout.channels.filter((x) => x.searched).length} places searched` });
    const arc = await archive(path, { itemId: item.id, title: item.title, kind: item.kind });
    await update(item.id, { source_url: c.url, original_path: arc.path, sha256: arc.sha256 });
    await unlink(path).catch(() => {});
    return { state: 'offered', item: item.id, from: c.url };
  }
  // 4. READABLE ELSEWHERE ONLY (borrow / view): a lead for a person
  const leads = found.filter((f) => ['borrow', 'view'].includes(f.kind) || (f.kind === 'html' && f.site !== new URL(work.page || 'http://x').hostname));
  if (leads.length) {
    await create({ title: work.title, author: work.author, kind: work.kind, identified: { title: work.title, author: work.author, scout }, by: BY, state: 'lead',
      why: `scout: no downloadable copy; readable at ${leads.slice(0, 3).map((l) => `${l.site} (${l.kind})`).join(', ')}` });
    return { state: 'lead', leads: leads.length };
  }
  // 5. NOTHING ANYWHERE → to buy (important works), with prices and who to ask
  const p = (work.importance ?? 3) >= 3 ? await purchase(work).catch(() => null) : null;
  await create({ title: work.title, author: work.author, kind: work.kind, identified: { title: work.title, author: work.author, scout, purchase: p }, by: BY, state: (work.importance ?? 3) >= 3 ? 'to-buy' : 'declined',
    why: `scout: no copy found in ${scout.channels.filter((x) => x.searched).length} places${(work.importance ?? 3) >= 3 ? ' — to buy and scan' : ' (not important enough to buy)'}` });
  return { state: (work.importance ?? 3) >= 3 ? 'to-buy' : 'skipped' };
}

/** A list → each work not handled before, up to `limit`. → { counts, outcomes } */
export async function scoutList(works, { limit = 20, deps = {} } = {}) {
  const seen = new Set();
  for (const i of await (deps.items || (() => listItems({ limit: 20000 })))()) { seen.add(workKey(i.title)); if (i.identified?.scout?.page) seen.add(i.identified.scout.page); if (i.identified?.title) seen.add(workKey(i.identified.title)); }
  const outcomes = [], counts = {};
  for (const w of works) {
    if (outcomes.length >= limit) break;
    if (seen.has(workKey(w.title)) || (w.page && seen.has(w.page))) continue;
    seen.add(workKey(w.title));
    const o = await scoutWork(w, deps).catch((e) => ({ state: 'error', error: String(e.message).slice(0, 200) }));
    outcomes.push({ title: w.title, ...o });
    counts[o.state] = (counts[o.state] || 0) + 1;
  }
  return { counts, outcomes, remaining: works.filter((w) => !seen.has(workKey(w.title))).length };
}
