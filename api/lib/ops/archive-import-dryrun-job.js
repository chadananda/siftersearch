// archive-import-dryrun ops report: BEFORE a drive's approved books are imported (and OCR is paid for) — how many are held / probably held / need OCR / go straight in?
// Same checks as the real import, nothing linked, queued or OCR'd: a text-layer file is read (ocr:false) and checked against the library by its text; a scan is
// checked by its catalogue title/author (metadata.catalog, set via POST /imports/drives/:id/catalogue) or file name. params { drive, limit?, offset?, list? }.
// Runs in slices and checks the drain between items: on a drain it yields { resume: {...params, offset, limit, partial} } (tallies + capped lists so far);
// the ops service saves that into the requeued run's params, so the next run continues at `offset` with the tallies in `partial`.
import { itemsToImport, getDrive } from '../repos/archives-repo.js';
import { importPlan } from './archive-import-job.js';
import { toMarkdownText } from '../dewey/convert.js';
import { sampleLines, titleFromLines, withText } from '../dewey/identify.js';
import { checkHoldings, plausibleHolding } from '../dewey/holdings.js';

const KEYS = ['held', 'probably_held', 'needs_ocr', 'straight_in', 'skipped', 'failed'];

export async function archiveImportDryrunJob(params = {}, deps = {}) {
  const { drive: driveId, limit = 2000, offset = 0, list = 40, partial } = params;
  const { draining = (await import('../drain.js')).isDraining, read = (path, name) => toMarkdownText(null, name, { path, full: false, ocr: false }), check = checkHoldings } = deps;
  const drive = deps.drive || await getDrive(driveId);
  if (!drive) throw new Error(`no drive ${driveId}`);
  // slices of 200 (deps.items = the whole window starting at `offset`, for tests)
  const slice = async (at, n) => deps.items ? deps.items.slice(at - offset, at - offset + n) : itemsToImport(drive.id, { limit: n, offset: at });
  // list entries are capped at `list`; counts and uncat carry the true totals across a yield
  const buckets = Object.fromEntries(KEYS.map((k) => [k, [...(partial?.lists?.[k] || [])]]));
  const counts = Object.fromEntries(KEYS.map((k) => [k, partial?.counts?.[k] || 0]));
  let uncat = partial?.uncat || 0, checked = partial?.checked || 0, at = offset;
  const put = (k, row) => { counts[k]++; if (k === 'needs_ocr' && !row.catalogued) uncat++; if (buckets[k].length < list) buckets[k].push(row); };
  const one = async (it) => {
    const plan = importPlan(drive, it, {});
    const row = { id: it.id, rel: it.primary_rel, title: it.metadata?.catalog?.title || it.sample?.rec?.title || it.title || null, catalogued: !!it.metadata?.catalog?.title };
    if (plan.skip || plan.kind !== 'book') return put('skipped', { ...row, why: plan.skip || 'not a book' });
    const name = it.primary_rel.split('/').pop();
    const cat = it.metadata?.catalog || { title: it.sample?.rec?.title || it.title || null, author: it.sample?.rec?.creator || it.creator || null };
    try {
      const conv = await read(plan.src, name).catch(() => null);
      const text = conv?.markdown || '';
      const readable = conv && !conv.scan && text.replace(/\s|\[page \d+\]/g, '').length >= 200;
      if (readable) {
        const first = text.split('\n').map((l) => l.replace(/^#+\s*|\*+/g, '').trim()).filter((l) => l && !/^\[page \d+\]$/i.test(l));
        const t = await titleFromLines(first).catch(() => ({}));
        const id = withText({ title: cat.title || t.title || null, author: cat.author || t.author || null, file_name: name, printed_lines: sampleLines(text), ...(conv.sample ? { sample: conv.sample } : {}) }, text);
        const r = await check(id);
        const near = ['held', 'partly-held'].includes(r.verdict) ? r.candidates?.[0] : null;
        if (r.verdict === 'held') put('held', { ...row, by: 'text', candidate: near && `#${near.id} ${near.title}` });
        else if (near || r.verdict === 'possible') put('probably_held', { ...row, by: 'text', verdict: r.verdict, candidate: r.candidates?.[0] && `#${r.candidates[0].id} ${r.candidates[0].title}` });
        else put('straight_in', row);
      } else {
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
      if (draining()) return { drive: drive.id, yielded: true, resume: { ...params, offset: at, limit: end - at, partial: { counts, lists: buckets, uncat, checked } } };
      await one(it);
      at++; checked++;
    }
  }
  return { drive: drive.id, checked, counts, uncatalogued_scans: uncat, ...buckets, note: `lists cut to ${list} per bucket; params.list raises it` };
}
