// THE SCOUT (planning/dewey-scouts-plan.md): for each work on a list — held already? → search EVERY channel for a copy →
// a copy found is downloaded, its TEXT checked against the library (another title for the same book is caught here),
// appraised, and OFFERED to Chad with where it came from; a copy readable only elsewhere (borrow/view) is a LEAD; nothing
// anywhere and important → TO BUY, with every channel searched, used prices and who to ask. A work handled once is never
// handled again (its title key or page is on an item). Deps injectable; one site request at a time.
import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { createItem, updateItem, listItems } from '../../repos/dewey-repo.js';
import { workKey } from '../../ops/dewey-ingest-folder-job.js';
import { CHANNELS, purchaseLeads, isShadow, sameWork } from './channels.js';
import { UA } from './ris.js';
import { toMarkdownText } from '../convert.js';
import { wholeWork, estimatedWords, tocCheck } from '../whole.js';

export const scoutDir = () => process.env.DEWEY_SCOUT_DIR || '/tank/dewey-ingest/scout';
const BY = 'dewey-scout';
const DOWNLOADABLE = ['pdf', 'text', 'epub', 'html', 'docx', 'doc', 'rtf'];
const pause = (ms) => new Promise((z) => setTimeout(z, ms));
// the file's type: its URL's extension, the channel's kind, then the server's content type
const extOf = (c, type = '') => {
  const fromUrl = String(c.url || '').split('?')[0].match(/\.(pdf|docx?|rtf|epub|txt|html?)$/i)?.[1]?.toLowerCase();
  if (fromUrl) return fromUrl === 'htm' ? 'html' : fromUrl;
  if (['docx', 'doc', 'rtf'].includes(c.kind)) return c.kind;
  return c.kind === 'pdf' || /pdf/.test(type) ? 'pdf' : c.kind === 'epub' || /epub/.test(type) ? 'epub' : c.kind === 'text' || /text\/plain/.test(type) ? 'txt'
    : /wordprocessingml/.test(type) ? 'docx' : /msword/.test(type) ? 'doc' : 'html';
};

/** Download a found copy (≤ 150 MB) to the scout folder → path, or null. */
export async function download(c, { fetchImpl = fetch, dir = scoutDir() } = {}) {
  if (isShadow(c.url)) return null;
  if (c.parts?.length > 1) {   // a work in volumes: every volume, in order, one file
    const texts = [];
    for (const u of c.parts) { const r = await fetchImpl(u, { signal: AbortSignal.timeout(300000), headers: { 'User-Agent': UA } }).catch(() => null); if (!r?.ok) return null; texts.push(await r.text()); }
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${Date.now()}-${String(c.title || 'copy').replace(/[^\w]+/g, '_').slice(0, 60)}.txt`);
    await writeFile(path, texts.join('\n\n'));
    return path;
  }
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
  // the linked file's OWN type (10-19: a .docx saved as .html was read as a web page — "not usable text")
  return [...docs.map((u) => ({ url: u, kind: (u.match(/\.(pdf|docx?|rtf)(?:\?|$)/i)?.[1] || 'html').toLowerCase(), site, title: work.title, note: 'linked from the list\'s page' })),
    { url: work.page, kind: 'html', site, title: work.title, note: 'the list\'s own page' }];
}

/** One work → its outcome. deps: check (holdings by title), checkFile (identifyAndCheck), appraise, archive, channels, … */
export async function scoutWork(work, deps = {}) {
  const { check, checkFile, appraise, archive, channels = CHANNELS, purchase = purchaseLeads, get = download, politeMs = 1500,
    create = createItem, update = updateItem, read = async (p) => (await toMarkdownText(null, p.split('/').pop(), { path: p, full: false })).markdown } = deps;
  // the title it was SOUGHT under is kept (a copy's appraised title can differ — a re-scout must look for the work, not the copy)
  const scout = { list: work.list, sought: work.sought || work.title, author: work.author || null, why: work.why, importance: work.importance, page: work.page || null, channels: [] };
  // 1. HELD? by title first (cheap); a copy's text decides later
  let h = await check({ title: work.title, author: work.author, from: 'scout' }).catch(() => null);
  // …and by the MAIN title: a list's long subtitle ("The Dawn-Breakers: Nabíl's Narrative of the Early Days…") missed the
  // library's "The Dawn-Breakers" (10-19: held, scouted as a lead)
  const mainTitle = String(work.title).split(/\s*[:;(]\s*/)[0];
  if (h?.verdict !== 'held' && mainTitle.length >= 4 && mainTitle !== work.title) h = (await check({ title: mainTitle, author: work.author, from: 'scout' }).catch(() => null)) || h;
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
  // the OTHER title a list gives in brackets ("The New History of the Báb (Táríkh-i-Jadíd)" is catalogued as "The
  // Táríkh-i-Jadíd, or New History…", 10-19): searched too when nothing downloadable turned up — every channel but the web
  const alt = (String(work.title).match(/\(([^)]{4,})\)/) || [])[1];
  if (alt && !found.some((f) => DOWNLOADABLE.includes(f.kind))) {
    for (const [name, fn] of Object.entries(channels)) {
      if (name === 'web') continue;
      const hits = await fn({ ...work, title: alt }).catch(() => null);
      if (hits) { scout.channels.push({ channel: `${name} (as “${alt}”)`, searched: true, found: hits.length }); found.push(...hits.filter((x) => !isShadow(x.url))); }
      await pause(politeMs);
    }
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
    // ONLY A WHOLE COPY IS OFFERED (Chad 10-19: "please do not propose books that are incomplete. That is a trap"): a
    // contents/index/excerpt file, a preview, a book of a few pages — noted, and the search goes on for a whole copy
    const kind = a?.kind || work.kind || '';
    const pdfPages = /\.pdf$/i.test(path) ? (doc.identified?.sample?.of || await (deps.pdfPages || (await import('../convert.js')).pdfPageCount)(path).catch(() => null)) : null;
    const published = /book/i.test(kind) ? (work.publishedPages ??= Number((await (deps.research || (await import('../research.js')).researchWork)({ title: work.sought || work.title, author: work.author }).catch(() => null))?.pages) || 0) : 0;
    const toc = await (deps.tocCheck || tocCheck)(path).catch(() => null);
    const w = wholeWork({ url: c.url, name: path.split('/').pop(), kind, words: estimatedWords(doc), pdfPages, text: doc.identified?._text || doc.excerpt || '', published, toc });
    if (!w.whole) {
      (scout.incomplete ||= []).push({ url: c.url, site: c.site, why: w.why });
      await unlink(path).catch(() => {});
      continue;
    }
    const item = await create({ title: a?.title || work.title, author: a?.author || work.author, kind: a?.kind || work.kind,
      identified: { ...doc.identified, _text: undefined, file_name: path.split('/').pop(), shelf: work.shelfHint?.collection ? work.shelfHint : (work.shelfHint && a?.shelf?.religion !== work.shelfHint.religion ? null : a?.shelf || null), appraisal: a, scout, source: c, verdict: doc.result?.verdict }, by: BY, state: 'offered',
      why: `scout found a copy at ${c.site} (${c.kind}${c.note ? `, ${c.note}` : ''}) — ${doc.result?.verdict}; ${scout.channels.filter((x) => x.searched).length} places searched${a?.title && !sameWork(work.title, a.title) && !sameWork(a.title, work.title) ? ` — ⚠ it reads as “${a.title}”, perhaps not the work sought` : ''}` });
    const arc = await archive(path, { itemId: item.id, title: item.title, kind: item.kind });
    await update(item.id, { source_url: c.url, original_path: arc.path, sha256: arc.sha256 });
    await unlink(path).catch(() => {});
    // THE DAILY PULSE ADDS the most important finds itself (Chad 10-18: "adding to the library, the most important first"):
    // important (≥ 4), not held by its text, judged in scope and worth adding — straight to intake, where every guard
    // (whole work, fragments, previews, published length) still applies. The rest wait under Found for a yes.
    // …and only when the copy IS the work sought — its appraised title the sought title (10-19: two wrong works imported)
    if (deps.autoAdd?.(work, a, doc) && (sameWork(work.title, a?.title) || sameWork(a?.title, work.title))) {
      await update(item.id, { state: 'source' }, `added by the daily pulse (importance ${work.importance}; ${doc.result?.verdict}; appraisal: ${a?.recommendation})`);
      await (deps.queue || (await import('../../repos/ops-report-repo.js')).enqueue)('dewey-intake', { id: item.id }, BY);
      return { state: 'added', item: item.id, from: c.url };
    }
    return { state: 'offered', item: item.id, from: c.url };
  }
  // 4. READABLE ELSEWHERE ONLY (borrow / view): a lead for a person
  const leads = found.filter((f) => ['borrow', 'view'].includes(f.kind) || (f.kind === 'html' && f.site !== new URL(work.page || 'http://x').hostname));
  if (leads.length) {
    await create({ title: work.title, author: work.author, kind: work.kind, identified: { title: work.title, author: work.author, scout }, by: BY, state: 'lead',
      why: `scout: no whole downloadable copy; readable at ${leads.slice(0, 3).map((l) => `${l.site} (${l.kind})`).join(', ')}${scout.incomplete?.length ? ` — ${scout.incomplete.length} incomplete cop${scout.incomplete.length === 1 ? 'y' : 'ies'} passed over` : ''}` });
    return { state: 'lead', leads: leads.length };
  }
  // 5. NOTHING WHOLE ANYWHERE → to acquire (important works — or any work an incomplete copy proved exists: Chad 10-19, "such
  // books might inform us of the existence of the actual book so we can find it or keep it on the list of books we need
  // to acquire"), with prices and who to ask
  const acquire = (work.importance ?? 3) >= 3 || !!scout.incomplete?.length;
  const p = acquire ? await purchase(work).catch(() => null) : null;
  await create({ title: work.title, author: work.author, kind: work.kind, identified: { title: work.title, author: work.author, scout, purchase: p }, by: BY, state: acquire ? 'to-buy' : 'declined',
    why: `scout: no whole copy found in ${scout.channels.filter((x) => x.searched).length} places${scout.incomplete?.length ? ` (incomplete: ${scout.incomplete.map((x) => x.site).join(', ')})` : ''}${acquire ? ' — to acquire' : ' (not important enough to buy)'}` });
  return { state: acquire ? 'to-buy' : 'skipped' };
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
