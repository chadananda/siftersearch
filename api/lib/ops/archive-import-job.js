// archive-import ops job (planning/donor-intake-plan-20261030.md step 8): a drive's APPROVED items into the library, each labelled "Donated by
// <donor>" (a `.source.json` beside the file). Talks → hard link under DEWEY_MEDIA_DIR/donors/<drive>/<rel>, then media-scan (sha dedup; the
// media feed processes them on workers). Books → hard link under <ingest>/_approved/donors/<drive>/<rel>, then dewey-ingest-folder: _approved
// is Chad's yes ONLY — the held check, the twin check, the appraisal and Dewey's QUALITY GATE still apply (never _add-anyway, which bypasses the held check). The archive is never written (a hard link shares the bytes; copy only across
// filesystems). Idempotent: imported_at marks an item, an existing link is reused. Each run also fills the public link of earlier imports once the
// library holds them (talk → /media/<slug>, book → /document/<id>). Lane 'archive'.
// PDFs need their worker probe (archive-sample) first: a scan or image PDF (page images under a hidden OCR layer) is PRE-OCR checked against the library — held → skipped,
// probably held → needs_person (neither is paid for by SLP) — and an image PDF's sidecar says image_pdf so Dewey sends it to SLP like a scan (our layer is better).
// Duplicates ACROSS drives (archives/dedup.js cascade: hash · normalised body · title+length · MinHash fingerprint) import only their best copy; the rest are listed (duplicates).
// A CHAPTER FILE of a multi-file book is skipped and listed (chapter_sets): Dewey's ingest takes one file = one document, with no ordered-parts import.
import { join, dirname, extname } from 'path';
import { createReadStream } from 'fs';
import { mkdir, link, copyFile, writeFile, lstat } from 'fs/promises';
import { createHash } from 'crypto';
import { getDrive, getDonor, itemsToImport, itemsForDedup, markImported, itemsImportedUnlinked, setCustody } from '../repos/archives-repo.js';
import { itemPath } from './archive-sample-job.js';
import { deweyMediaDir } from './media-jobs.js';
import { ingestDir } from './dewey-ingest-folder-job.js';
import { preOcrCheck, slpBound, chapterFile } from '../archives/pre-ocr.js';
import { clusterDuplicates, itemRow, registryRow } from '../archives/dedup.js';
import { registryRows } from '../repos/dedup-repo.js';
import { checkHoldings } from '../dewey/holdings.js';
import { docsByIsbn } from '../docs-repo.js';

const TALK = new Set(['talk', 'video']);
// what Dewey's ingest folder reads (dewey-ingest-folder-job EASE); a folder of page images has no single document to hand it
const DOC = new Set(['pdf', 'epub', 'docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'html', 'htm', 'xhtml', 'wpd', 'wps']);
const sha256Of = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const exists = (p) => lstat(p).then(() => true, () => false);

/** Where an approved item goes → { kind: 'talk'|'book', src, dest } or { skip: why }. Pure apart from nothing (paths only). */
export function importPlan(drive, it, { mediaDir = deweyMediaDir(), bookDir = ingestDir() } = {}) {
  const src = itemPath(drive.root, it.primary_rel);
  if (!src) return { skip: 'path outside the drive' };
  const rel = it.primary_rel.replace(/^\/+/, '');
  if (TALK.has(it.kind)) return { kind: 'talk', src, dest: join(mediaDir, 'donors', drive.id, rel) };
  if (['book', 'scan'].includes(it.kind)) {
    if (!DOC.has(extname(rel).slice(1).toLowerCase())) return { skip: 'no single document file (a folder of page images): Dewey takes a PDF or text — make one first' };
    const chapter = chapterFile(rel);
    if (chapter) return { skip: 'a chapter file of a multi-file book — Dewey takes one file per document, so it is listed, not imported', chapter: chapter.set };
    return { kind: 'book', src, dest: join(bookDir, '_approved', 'donors', drive.id, rel) };
  }
  return { skip: `${it.kind || 'this kind'} is not imported (talks and books only)` };
}

/** The provenance sidecar: who gave it, from which drive and path, and who approved it. */
export const provenance = (drive, donor, it, plan, at) => ({
  provider: 'donor', label: `Donated by ${donor?.name || drive.donor_id}`, donor: drive.donor_id, donor_name: donor?.name || null,
  drive: drive.id, drive_label: drive.label || null, archive: drive.root, original_path: plan.src, rel_path: it.primary_rel, kind: plan.kind,
  title: it.metadata?.catalog?.title || it.sample?.rec?.title || it.title || null, creator: it.metadata?.catalog?.author || it.sample?.rec?.creator || it.creator || null,
  catalog: it.metadata?.catalog || null, year: it.sample?.rec?.year || it.year || null,
  duration: it.duration_s || null, bytes: it.bytes || null, approval: `approved by ${it.decided_by || 'Chad'} on /admin/imports`, approved_at: it.decided_at || null,
  imported_at: at, recommendation: it.sample?.rec?.why || it.why || null,
  ...(it.metadata?.probe?.class ? { pdf_class: it.metadata.probe.class, pdf_pages: it.metadata.probe.pages ?? null, image_pdf: it.metadata.probe.class === 'image_pdf' } : {}),
});

async function place(src, dest) {
  if (await exists(dest)) return 'existed';
  await mkdir(dirname(dest), { recursive: true });
  try { await link(src, dest); return 'linked'; } catch (e) { if (e.code !== 'EXDEV') throw e; }
  await copyFile(src, dest);
  return 'copied';
}

/**
 * The cross-collection dedup of a drive (archives/dedup.js): the registry of every drive's fingerprints plus this drive's items not fingerprinted yet, clustered, and files the library
 * already holds (Dewey sha256) marked. → { dups: Map(key → {of, step, score…}), clusters, by_step }. Never reads a file: fingerprints come from the worker probe.
 */
export async function driveDedup(driveId, { registry = registryRows, view = itemsForDedup, bySha = null, rows = null } = {}) {
  const reg = rows ? [] : (await registry()).map(registryRow), have = new Set(reg.map((r) => r.key));
  const all = rows || [...reg, ...(await view(driveId)).map((v) => itemRow(driveId, v)).filter((r) => !have.has(r.key))];
  const find = bySha || (await import('../repos/dewey-repo.js')).findBySha, libShas = new Set();
  for (const r of all) if (r.sha && r.drive === driveId) { const d = await find(r.sha).catch(() => null); if (d?.doc_id && d.state === 'ingested') libShas.add(r.sha); }
  return clusterDuplicates(all, { libShas });
}

/** Earlier imports the library now holds → their public path. */
async function fillLinks(driveId, { media, dewey }) {
  let linked = 0;
  for (const it of await itemsImportedUnlinked(driveId)) {
    const [kind, ref] = [it.imported_ref.slice(0, it.imported_ref.indexOf(':')), it.imported_ref.slice(it.imported_ref.indexOf(':') + 1)];
    let path = null;
    if (kind === 'media') { const m = await media.findMediaBySource(ref); if (m?.slug && m.state === 'done') path = `/media/${m.slug}`; }
    else { const d = await dewey.findBySha(ref); if (d?.doc_id && d.state === 'ingested') path = `/document/${d.doc_id}`; }
    if (path) { await markImported(it.id, path); linked++; }
  }
  return linked;
}

export async function archiveImportJob({ drive: driveId, limit = 200 } = {}, deps = {}) {
  const { queue = (await import('../repos/ops-report-repo.js')).enqueue, sha = sha256Of, now = () => new Date().toISOString(), check = checkHoldings, byIsbn = docsByIsbn,
    media = deps.media || await import('../repos/media-repo.js'), dewey = deps.dewey || await import('../repos/dewey-repo.js'), dirs = {} } = deps;
  const drive = await getDrive(driveId);
  if (!drive) throw new Error(`no drive ${driveId}`);
  const donor = await getDonor(drive.donor_id);
  const out = { drive: drive.id, talks: [], books: [], skipped: [], held: [], needs_person: [], duplicates: [], chapter_sets: {}, failed: [], linked: 0 };
  const { dups } = deps.dedup || await driveDedup(drive.id);   // ONE copy per work across all drives: only the best of each is imported
  // a skipped item stays "approved, not imported", so each page starts after the ones passed over
  let off = 0, done = 0;
  for (;;) {
    const batch = await itemsToImport(drive.id, { limit: 200, offset: off });
    let moved = 0;
    for (const it of batch) {
      if (done >= limit) break;
      const plan = importPlan(drive, it, dirs);
      if (plan.chapter) { (out.chapter_sets[plan.chapter] ||= []).push({ id: it.id, rel: it.primary_rel }); continue; }
      const dup = dups.get(`${drive.id}:${it.primary_rel}`);
      if (dup && !plan.chapter) { out.duplicates.push({ id: it.id, rel: it.primary_rel, ...dup }); continue; }
      if (plan.skip) { out.skipped.push({ id: it.id, why: plan.skip }); continue; }
      try {
        if (plan.kind === 'book' && /\.pdf$/i.test(plan.src)) {
          const probe = it.metadata?.probe;
          if (!probe?.class) { out.skipped.push({ id: it.id, why: probe?.error ? `the worker probe failed: ${probe.error}` : 'not probed yet — run archive-sample (a worker reads its class and sample pages) before importing a PDF' }); continue; }
          if (slpBound(probe.class)) {   // BEFORE any SLP spend
            const cat = it.metadata?.catalog || { title: it.sample?.rec?.title || it.title || null, author: it.sample?.rec?.creator || it.creator || null };
            const r = await preOcrCheck({ probe, cat, name: plan.src.split('/').pop() }, { check, byIsbn });
            if (r.verdict !== 'clear') { out[r.verdict === 'held' ? 'held' : 'needs_person'].push({ id: it.id, class: probe.class, by: r.by, candidate: r.candidate, evidence: r.evidence }); continue; }
          }
        }
        const at = now(), how = await place(plan.src, plan.dest);
        await writeFile(`${plan.dest}.source.json`, JSON.stringify(provenance(drive, donor, it, plan, at), null, 1));
        // a book is found again by its bytes (Dewey keys items by sha256); a talk by its path (media items keep source_ref)
        await markImported(it.id, plan.kind === 'talk' ? `media:${plan.dest}` : `dewey:${await sha(plan.dest)}`);
        (plan.kind === 'talk' ? out.talks : out.books).push({ id: it.id, dest: plan.dest, how }); moved++; done++;
      } catch (e) { out.failed.push({ id: it.id, error: String(e.message).slice(0, 200) }); }
    }
    off += batch.length - moved;
    if (batch.length < 200 || done >= limit) break;
  }
  if (out.talks.length) await queue('media-scan', { roots: [], paths: out.talks.map((t) => t.dest) }, 'archive-import');
  if (out.books.length) await queue('dewey-ingest-folder', { batch: 5 }, 'archive-import');
  if (out.talks.length + out.books.length && !['imported', 'returned'].includes(drive.status)) await setCustody(drive.id, { status: 'importing' });
  out.linked = await fillLinks(drive.id, { media, dewey });
  return out;
}
