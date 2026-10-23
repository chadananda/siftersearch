// SPEAKER GALLERY jobs (Chad 10-23: "numerous photos of each speaker so we can rotate them"). media-gallery syncs the curated
// data/media-speaker-gallery.json into media_speaker_photos (originals already in cdn-assets R2) and, with extend, makes the
// AI-extended 9:16 master ONCE for a photo whose tall crop needs canvas (outpaint.js; recorded as AI-extended, $ capped).
// media-portrait-inventory: every speaker of the catalogue (published + queued) as one person, with talks and photos.
// Deps injected for tests.
import { join } from 'path';
import { readFile } from 'fs/promises';
import { manifestRows, planGallerySync, coverage, photoUrl } from '../media/gallery.js';

const readManifest = async () => JSON.parse(await readFile(join(process.cwd(), 'data', 'media-speaker-gallery.json'), 'utf8'));

/** media-gallery { write = false, keys?, extend = false, maxUsd = 3 } → what changed (or would), problems, extensions, $ */
export async function mediaGalleryJob({ write = false, keys = null, extend = false, maxUsd = 3 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { rows, problems } = manifestRows(deps.manifest || await readManifest());
  const out = { people: 0, photos: 0, upserts: 0, deletes: 0, problems, extended: 0, ext_failed: [], usd: 0, write };
  const have = new Map();
  for (const r of await repo.galleryRows([...rows.keys()])) { if (!have.has(r.speaker_key)) have.set(r.speaker_key, []); have.get(r.speaker_key).push(r); }
  for (const [key, wanted] of rows) {
    if (keys && !keys.includes(key)) continue;
    out.people++; out.photos += wanted.length;
    const plan = planGallerySync(wanted, have.get(key) || []);
    out.upserts += plan.upserts.length; out.deletes += plan.deletes.length;
    if (write && (plan.upserts.length || plan.deletes.length)) await repo.applyGallery(key, plan);
  }
  if (!extend) return out;
  // ONE extended master per photo that needs canvas, made once (ext_file set → skipped), within the $ cap
  const op = deps.outpaint || await import('../media/outpaint.js');
  const tools = deps.tools || await import('../media/tools.js');
  const { putCdnPortrait } = deps.speakers || await import('../media/speakers.js');
  const model = deps.model || (await import('../model-roles.js')).modelFor('image-outpaint').model;
  const { createHash } = await import('crypto');
  const { tmpdir } = await import('os');
  const { writeFile: wf, rm } = await import('fs/promises');
  const fetchImpl = deps.fetchImpl || fetch;
  const todo = (await repo.galleryRows(keys)).filter((r) => r.needs_ext && !r.ext_file);
  for (const r of todo) {
    if (out.usd >= maxUsd) { out.stopped = `$${maxUsd} cap`; break; }
    try {
      const res = await fetchImpl(photoUrl(r.file, r.sha), { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`original HTTP ${res.status}`);
      const src = Buffer.from(await res.arrayBuffer());
      const tmp = join(tmpdir(), `gallery-${r.sha.slice(0, 12)}-${Date.now()}`);
      await wf(tmp, src);
      const dims = await tools.imageSize(tmp).finally(() => rm(tmp, { force: true }));
      const ext = await op.extendPortrait(src, dims, { model, ffmpeg: (args) => tools.ffmpeg(args, { timeoutMs: 120_000 }), outpaint: (png) => op.geminiOutpaint(png, { model, fetchImpl }) });
      const file = await putCdnPortrait(r.file.replace(/\.(jpe?g|png|webp)$/i, '-ext.jpg'), ext.bytes, 'image/jpeg', { fetchImpl });
      await repo.setGalleryExtension(r.speaker_key, r.sha, { ext_file: file, ext_sha: createHash('sha256').update(ext.bytes).digest('hex'), ext_model: model, ext_usd: ext.usd, ext_at: new Date().toISOString(), ext_error: '' });
      out.extended++; out.usd = Math.round((out.usd + ext.usd) * 10000) / 10000;
    } catch (err) {
      out.ext_failed.push({ key: r.speaker_key, sha: r.sha.slice(0, 12), error: String(err.message).slice(0, 160) });
      await repo.setGalleryExtension(r.speaker_key, r.sha, { ext_error: String(err.message).slice(0, 300) }).catch(() => {});
    }
  }
  return out;
}

/** media-portrait-inventory {} → every person speaking in the catalogue (all states), Hands and UHJ first, then by talks:
 *  { coverage, people: [{ key, name, role, talks, published, queued, photos, forms }] } */
export async function mediaPortraitInventoryJob(params = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { resolveSpeaker } = await import('../media/identity.js');
  const { speakerKey, cleanName } = await import('../media/speakers.js');
  const { speakerRole } = await import('../media/listing-index.js');
  const people = deps.people || await (await import('./media-jobs.js')).loadSpeakerPeople();
  const byKey = new Map();
  for (const r of await repo.speakerStateCounts()) {
    const res = resolveSpeaker(r.speaker, people, {});
    const key = res.key || r.speaker_key || speakerKey(r.speaker);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { key, name: res.display || cleanName(r.speaker), role: res.person?.role || null, talks: 0, published: 0, queued: 0, forms: new Set() });
    const p = byKey.get(key);
    if (r.state === 'duplicate') continue;
    p.talks += r.n; if (r.state === 'done') p.published += r.n; else p.queued += r.n;
    p.forms.add(r.speaker);
  }
  const gal = new Map();
  for (const r of await repo.galleryRows()) gal.set(r.speaker_key, (gal.get(r.speaker_key) || 0) + 1);
  const spk = new Map((await repo.listSpeakers()).map((s) => [s.key, s]));
  const rank = { hand: 0, uhj: 1 };
  const list = [...byKey.values()].filter((p) => p.talks).map((p) => {
    const s = spk.get(p.key);
    // the primary in media_speakers counts when the gallery does not hold it yet
    const photos = (gal.get(p.key) || 0) || (s?.file ? 1 : 0);
    return { key: p.key, name: p.name, role: p.role || speakerRole(p.name), talks: p.talks, published: p.published, queued: p.queued, photos, forms: [...p.forms].slice(0, 6) };
  }).sort((a, b) => (rank[a.role] ?? 2) - (rank[b.role] ?? 2) || b.talks - a.talks || a.name.localeCompare(b.name));
  return { coverage: coverage(list), talks: list.reduce((a, p) => a + p.talks, 0), people: list };
}
