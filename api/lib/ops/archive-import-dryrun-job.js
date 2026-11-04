// archive-import-dryrun ops report: BEFORE a drive's approved books are imported (and OCR is paid for) — how many are held / probably held / need OCR / go straight in?
// Same checks as the real import, nothing linked, queued or OCR'd: a text-layer file is read (ocr:false) and checked against the library by its text; a scan is
// checked by its catalogue title/author (metadata.catalog, set via POST /imports/drives/:id/catalogue) or file name. params { drive, limit?, offset?, list?, scope? } — scope 'undecided' checks the books/scans nobody has decided yet (dedup + library first, value review after) instead of the approved ones.
// PDFs are classed by the worker probe (metadata.probe, set by archive-sample): born_digital (text read directly, as above) · image_pdf (page images under a hidden OCR layer) ·
// scan. Image PDFs and scans get the PRE-OCR dedup (archives/pre-ocr.js: ISBN, title+author, sampled-page text through checkHoldings) and survivors are the SLP-bound set
// (bucket needs_ocr, row.class) — `slp` totals its pages and estimated $ (measured per-page rate from earlier SLP jobs when there are any). ONE copy per work across ALL drives first (archives/dedup.js cascade over the dedup registry: hash · normalised body · title+length · MinHash fingerprint): the best copy is checked, the rest go to `duplicates` with the step + score, `dedup.clusters` lists members. A PDF with no probe yet lands in
// `unprobed` (run archive-sample first). Chapter files of a multi-file book are listed in `chapter_sets`, not checked. Runs in slices and checks the drain between items: on a drain it yields { resume: {...params, offset, limit, partial} } (tallies + capped lists so far);
// the ops service saves that into the requeued run's params, so the next run continues at `offset` with the tallies in `partial`.
import { itemsToImport, itemsUndecided, getDrive } from '../repos/archives-repo.js';
import { importPlan, driveDedup } from './archive-import-job.js';
import { itemRow } from '../archives/dedup.js';
import { toMarkdownText } from '../dewey/convert.js';
import { sampleLines, titleFromLines, withText } from '../dewey/identify.js';
import { checkHoldings, plausibleHolding } from '../dewey/holdings.js';
import { preOcrCheck, slpBound, slpSpent, verdictOf } from '../archives/pre-ocr.js';
import { docsByIsbn } from '../docs-repo.js';
import { slpMaxPages } from '../dewey/searchlayer.js';
import { setHoldings } from '../repos/collection-repo.js';

const KEYS = ['held', 'probably_held', 'needs_ocr', 'straight_in', 'duplicates', 'unprobed', 'chapter_files', 'skipped', 'failed'];
const CLASSES = ['born_digital', 'image_pdf', 'scan'];
const HOLD = new Set(['held', 'probably_held', 'needs_ocr', 'straight_in', 'duplicates']);
/** The measured evidence of one item's verdict (kept on its collection row and carried on its list entry): the top candidate's numbers + the top 3 candidates with titles. Pure. */
export const holdingsOf = (bucket, row) => { const e = (row.evidence || []).slice(0, 3), t = e[0] || {};
  return { verdict: bucket, class: row.class || null, by: row.by || null, candidate: row.candidate || null, relation: t.relation ?? null, ours_in_theirs: t.ours_in_theirs ?? null, theirs_in_ours: t.theirs_in_ours ?? null,
    length_ratio: t.length_ratio ?? null, candidates: e, ...(row.step ? { dup: { of: row.of || null, of_rel: row.of_rel || null, step: row.step, score: row.score } } : {}) }; };

export async function archiveImportDryrunJob(params = {}, deps = {}) {
  const { drive: driveId, limit = 2000, offset = 0, list = 40, partial, scope } = params;
  const { draining = (await import('../drain.js')).isDraining, saveHoldings = setHoldings, read = (path, name) => toMarkdownText(null, name, { path, full: false, ocr: false }), check = checkHoldings, byIsbn = docsByIsbn } = deps;
  const drive = deps.drive || await getDrive(driveId);
  if (!drive) throw new Error(`no drive ${driveId}`);
  // slices of 200 (deps.items = the whole window starting at `offset`, for tests)
  const slice = async (at, n) => deps.items ? deps.items.slice(at - offset, at - offset + n) : (scope === 'undecided' ? itemsUndecided : itemsToImport)(drive.id, { limit: n, offset: at });
  // list entries are capped at `list`; counts and uncat carry the true totals across a yield
  const buckets = Object.fromEntries(KEYS.map((k) => [k, [...(partial?.lists?.[k] || [])]]));
  const counts = Object.fromEntries(KEYS.map((k) => [k, partial?.counts?.[k] || 0]));
  const classes = Object.fromEntries(CLASSES.map((k) => [k, partial?.classes?.[k] || 0]));
  const slp = { items: partial?.slp?.items || 0, pages: partial?.slp?.pages || 0, over_page_limit: partial?.slp?.over_page_limit || 0, by_class: { image_pdf: { items: 0, pages: 0 }, scan: { items: 0, pages: 0 }, ...(partial?.slp?.by_class || {}) } };
  const sets = { ...(partial?.chapter_sets || {}) };
  // ONE copy per work across ALL drives (archives/dedup.js, over the registry — not just this window): the best copy of each is checked, the rest are listed with the step + score
  const dedup = deps.dedup || await driveDedup(drive.id, deps.items ? { rows: deps.items.map((i) => itemRow(drive.id, i)), bySha: deps.bySha || (async () => null) } : {}), dups = dedup.dups;
  const spent = deps.spent || slpSpent(await Promise.resolve(deps.deweyItems ? deps.deweyItems() : import('../repos/dewey-repo.js').then((m) => m.listItems({ limit: 1000 }))).catch(() => []));
  let uncat = partial?.uncat || 0, checked = partial?.checked || 0, at = offset;
  const saves = [];   // the evidence of each verdict is kept on the item's collection row (best effort: a missing data folder never stops a run)
  const put = (k, row) => {
    if (HOLD.has(k)) { row.holdings = holdingsOf(k, row); saves.push(Promise.resolve().then(() => saveHoldings(drive.id, row.rel, row.holdings)).catch(() => {})); }
    counts[k]++; if (k === 'needs_ocr' && !row.catalogued) uncat++; if (buckets[k].length < list) buckets[k].push(row);
  };
  const slpBoundRow = (row, cls, probe) => {
    const pages = Number(probe.pages) || 0;
    put('needs_ocr', { ...row, class: cls, pages });
    slp.items++; slp.pages += pages; slp.by_class[cls].items++; slp.by_class[cls].pages += pages;
    if (pages > slpMaxPages()) slp.over_page_limit++;
  };
  const one = async (it) => {
    const plan = importPlan(drive, it, {});
    const row = { id: it.id, rel: it.primary_rel, title: it.metadata?.catalog?.title || it.sample?.rec?.title || it.title || null, catalogued: !!it.metadata?.catalog?.title };
    const dup = dups.get(`${drive.id}:${it.primary_rel}`);
    if (!plan.chapter && !plan.skip && dup) return put('duplicates', { ...row, ...dup });
    if (plan.chapter) { (sets[plan.chapter] ||= []).length < 50 && sets[plan.chapter].push(it.id); return put('chapter_files', { ...row, set: plan.chapter }); }
    if (plan.skip || plan.kind !== 'book') return put('skipped', { ...row, why: plan.skip || 'not a book' });
    const name = it.primary_rel.split('/').pop();
    const cat = it.metadata?.catalog || { title: it.sample?.rec?.title || it.title || null, author: it.sample?.rec?.creator || it.creator || null };
    const isPdf = /\.pdf$/i.test(name), probe = it.metadata?.probe;
    try {
      if (isPdf && !probe?.class) return put('unprobed', { ...row, why: probe?.error ? `probe failed: ${probe.error}` : 'no worker probe yet — run archive-sample' });
      // the worker's sample pages are checked (ISBN, title+author, text) and what survives is SLP-bound — an image PDF's or scan's file is never read on tower
      const viaProbe = async (cls) => {
        const r = await preOcrCheck({ probe, cat, name }, { check, byIsbn });
        if (r.verdict === 'held') return put('held', { ...row, class: cls, by: r.by, candidate: r.candidate, evidence: r.evidence });
        if (r.verdict === 'probably_held') return put('probably_held', { ...row, class: cls, by: r.by, candidate: r.candidate, evidence: r.evidence });
        return slpBoundRow({ ...row, ...(r.evidence?.length ? { evidence: r.evidence } : {}) }, cls, probe);
      };
      if (isPdf && slpBound(probe.class)) { classes[probe.class]++; return viaProbe(probe.class); }
      classes.born_digital++;
      const conv = await read(plan.src, name).catch(() => null);
      const text = conv?.markdown || '';
      const readable = conv && !conv.scan && text.replace(/\s|\[page \d+\]/g, '').length >= 200;
      if (readable) {
        const first = text.split('\n').map((l) => l.replace(/^#+\s*|\*+/g, '').trim()).filter((l) => l && !/^\[page \d+\]$/i.test(l));
        const t = await titleFromLines(first).catch(() => ({}));
        const id = withText({ title: cat.title || t.title || null, author: cat.author || t.author || null, file_name: name, printed_lines: sampleLines(text), ...(conv.sample ? { sample: conv.sample } : {}) }, text);
        const r = await check(id);
        const v = verdictOf(r), ev = v.evidence, cand = v.candidate && `#${v.candidate.id} ${v.candidate.title}`;
        if (v.verdict === 'held') put('held', { ...row, class: 'born_digital', by: 'text', candidate: cand, evidence: ev });
        else if (v.verdict === 'probably_held') put('probably_held', { ...row, class: 'born_digital', by: 'text', verdict: r.verdict, candidate: cand, evidence: ev });
        else put('straight_in', { ...row, class: 'born_digital', ...(ev.length ? { evidence: ev } : {}) });
      } else if (isPdf) {   // the probe saw a text layer but the file would not read: judged by the probe's sample like an image PDF
        classes.born_digital--; classes.image_pdf++; await viaProbe('image_pdf');
      } else {   // a non-PDF document with no readable text (an old .doc): by catalogue title/file name, then it waits for a person's look at OCR
        const asked = { title: cat.title || null, author: cat.author || null, file_name: name };
        const near = plausibleHolding(asked, await check(cat.title ? asked : { file_name: name }).catch(() => null));
        if (near) put('probably_held', { ...row, by: 'title', candidate: `#${near.id} ${near.title}` });
        else put('needs_ocr', row);
      }
    } catch (e) { put('failed', { ...row, error: String(e.message).slice(0, 160) }); }
  };
  const end = offset + limit;
  while (at < end) {
    const items = await slice(at, Math.min(200, end - at));
    if (!items.length) break;
    for (const it of items) {
      if (draining()) { await Promise.all(saves.splice(0)); return { drive: drive.id, yielded: true, resume: { ...params, offset: at, limit: end - at, partial: { counts, lists: buckets, uncat, checked, classes, slp, chapter_sets: sets } } }; }
      await one(it); await Promise.all(saves.splice(0));
      at++; checked++;
    }
  }
  return { drive: drive.id, checked, counts, classes, slp: { ...slp, files: slp.items, est_usd: 'not estimable (SLP bills cost-plus on the processing; Chad will add an estimate)', spent_so_far: spent, page_limit: slpMaxPages() },
    chapter_sets: { sets: Object.keys(sets).length, files: counts.chapter_files, examples: Object.entries(sets).slice(0, 20).map(([set, ids]) => ({ set, ids })) },
    dedup: { by_step: dedup.by_step, clusters_total: dedup.clusters.length, clusters: dedup.clusters.slice(0, list) },
    uncatalogued_scans: uncat, ...buckets, note: `lists cut to ${list} per bucket; params.list raises it. needs_ocr = the SLP-bound set (image PDFs + scans that survived the pre-OCR check)` };
}
