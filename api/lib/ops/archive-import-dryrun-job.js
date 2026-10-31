// archive-import-dryrun ops report: BEFORE a drive's approved books are imported (and OCR is paid for) — how many are held / probably held / need OCR / go straight in?
// Same checks as the real import, nothing linked, queued or OCR'd: a text-layer file is read (ocr:false) and checked against the library by its text; a scan is
// checked by its catalogue title/author (metadata.catalog, set via POST /imports/drives/:id/catalogue) or file name. params { drive, limit?, offset?, list? }.
import { itemsToImport, getDrive } from '../repos/archives-repo.js';
import { importPlan } from './archive-import-job.js';
import { toMarkdownText } from '../dewey/convert.js';
import { sampleLines, titleFromLines, withText } from '../dewey/identify.js';
import { checkHoldings, plausibleHolding } from '../dewey/holdings.js';

export async function archiveImportDryrunJob({ drive: driveId, limit = 2000, offset = 0, list = 40 } = {}, deps = {}) {
  const { read = (path, name) => toMarkdownText(null, name, { path, full: false, ocr: false }), check = checkHoldings } = deps;
  const drive = deps.drive || await getDrive(driveId);
  if (!drive) throw new Error(`no drive ${driveId}`);
  const items = deps.items || [...await itemsToImport(drive.id, { limit: Math.min(limit, 1000), offset }), ...(limit > 1000 ? await itemsToImport(drive.id, { limit: limit - 1000, offset: offset + 1000 }) : [])];
  const buckets = { held: [], probably_held: [], needs_ocr: [], straight_in: [], skipped: [], failed: [] };
  for (const it of items) {
    const plan = importPlan(drive, it, {});
    const row = { id: it.id, rel: it.primary_rel, title: it.metadata?.catalog?.title || it.sample?.rec?.title || it.title || null, catalogued: !!it.metadata?.catalog?.title };
    if (plan.skip || plan.kind !== 'book') { buckets.skipped.push({ ...row, why: plan.skip || 'not a book' }); continue; }
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
        if (r.verdict === 'held') buckets.held.push({ ...row, by: 'text', candidate: near && `#${near.id} ${near.title}` });
        else if (near || r.verdict === 'possible') buckets.probably_held.push({ ...row, by: 'text', verdict: r.verdict, candidate: r.candidates?.[0] && `#${r.candidates[0].id} ${r.candidates[0].title}` });
        else buckets.straight_in.push(row);
      } else {
        const asked = { title: cat.title || null, author: cat.author || null, file_name: name };
        const near = plausibleHolding(asked, await check(cat.title ? asked : { file_name: name }).catch(() => null));
        if (near) buckets.probably_held.push({ ...row, by: 'title', candidate: `#${near.id} ${near.title}` });
        else buckets.needs_ocr.push(row);
      }
    } catch (e) { buckets.failed.push({ ...row, error: String(e.message).slice(0, 160) }); }
  }
  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
  return { drive: drive.id, checked: items.length, counts, uncatalogued_scans: buckets.needs_ocr.filter((r) => !r.catalogued).length,
    ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.slice(0, list)])), note: `lists cut to ${list} per bucket; params.list raises it` };
}
