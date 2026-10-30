// siftersearch-media — the MEDIA LIBRARY service (planning/media-library-plan.md): runs only media-scan / media-item /
// media-vocab, and watches Dewey's media drop folder. Its own entry with a SMALL import graph (not the whole ops registry),
// so other services' deploys do not drain an hour-long transcription; when it does drain, the running stage stops at once
// and resumes after the restart (api/lib/media/item.js). Shared machinery: api/lib/ops/service-worker.js.
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { isDraining, nap } from '../lib/drain.js';
import { runService } from '../lib/ops/service-worker.js';
import { mediaScanJob, mediaArchiveImportJob, mediaItemJob, mediaVocabJob, mediaDropPass, mediaSpeakersJob, mediaSpeakerSketchJob, mediaSpeakerSketchSweepJob, mediaPlaybackJob, mediaGradeJob, mediaShortJob, mediaShortsMomentsJob, mediaPortraitsExtendJob, mediaFetchJob, mediaRankJob, mediaLanesFeedPass, mediaComputeJob, mediaAsrJob, mediaDiarJob, mediaLlmJob, mediaMetaFixJob, mediaIdentityJob, mediaRelinkJob, mediaSafeListeningJob, mediaSpeakerMergeJob, mediaTalkIdentitiesJob, mediaRemasterJob, mediaRemasterRevertJob, mediaCloudRemasterJob, mediaRemasterQualityJob, mediaCloudOrderJob, mediaQuietRepairJob, mediaLightBackfillJob, mediaPreviewJob, mediaRemasterReviewPackJob, mediaRemasterDecideJob, mediaTrimAuditJob, mediaStagesSyncJob, mediaQuoteAuditJob } from '../lib/ops/media-jobs.js';
import { mediaParallel, asrHosts } from '../lib/media/tools.js';
import { mediaGalleryJob, mediaPortraitInventoryJob } from '../lib/ops/media-gallery-jobs.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });

export const MEDIA_REGISTRY = { 'media-archive-import': mediaArchiveImportJob, 'media-speaker-sketch': mediaSpeakerSketchJob, 'media-short': mediaShortJob, 'media-shorts-moments': mediaShortsMomentsJob, 'media-portraits-extend': mediaPortraitsExtendJob, 'media-fetch': mediaFetchJob, 'media-compute': mediaComputeJob, 'media-asr': mediaAsrJob, 'media-diar': mediaDiarJob, 'media-meta-fix': mediaMetaFixJob, 'media-identity': mediaIdentityJob, 'media-relink': mediaRelinkJob, 'media-safe-listening': mediaSafeListeningJob, 'media-speaker-merge': mediaSpeakerMergeJob, 'media-talk-identities': mediaTalkIdentitiesJob, 'media-remaster': mediaRemasterJob, 'media-remaster-revert': mediaRemasterRevertJob, 'media-cloud-remaster': mediaCloudRemasterJob, 'media-cloud-order': mediaCloudOrderJob, 'media-quiet-repair': mediaQuietRepairJob, 'media-light-backfill': mediaLightBackfillJob, 'media-preview': mediaPreviewJob, 'media-remaster-quality': mediaRemasterQualityJob, 'media-remaster-review-pack': mediaRemasterReviewPackJob, 'media-remaster-decide': mediaRemasterDecideJob, 'media-trim-audit': mediaTrimAuditJob, 'media-llm': mediaLlmJob, 'media-rank': mediaRankJob, 'media-stages-sync': mediaStagesSyncJob, 'media-quote-audit': mediaQuoteAuditJob, 'media-scan': mediaScanJob, 'media-item': mediaItemJob, 'media-vocab': mediaVocabJob, 'media-speakers': mediaSpeakersJob, 'media-playback': mediaPlaybackJob, 'media-grade': mediaGradeJob };

// a file dropped in DEWEY_MEDIA_DIR starts the pipeline with no other step
async function mediaDropLoop() {
  while (!isDraining()) {
    try { const r = await mediaDropPass(); if (r.queued) logger.info(r, 'media drop folder: new files — media-scan queued'); }
    catch (err) { logger.warn({ err: err.message }, 'media drop folder pass failed'); }
    await nap(5 * 60_000);
  }
}

// two lanes: the pipeline (one job at a time: hours of transcription) and SHORTS (seconds each, rendered on boss) — a person
// asking for a short must not wait behind the whole archive
// …and PORTRAITS (an image call per speaker; minutes, never behind hours of transcription)
// …and DOWNLOADS (YouTube into the archive, paced, independent of processing). The pipeline lane runs N items at once.
export const MEDIA_LANES = { pipeline: Object.keys(MEDIA_REGISTRY).filter((j) => !['media-short', 'media-archive-import', 'media-speaker-sketch', 'media-portraits-extend', 'media-speakers', 'media-fetch', 'media-rank',
  'media-stages-sync', 'media-quote-audit', 'media-compute', 'media-asr', 'media-diar', 'media-llm', 'media-meta-fix', 'media-identity', 'media-relink', 'media-safe-listening', 'media-speaker-merge', 'media-talk-identities', 'media-trim-audit', 'media-remaster', 'media-cloud-remaster', 'media-quiet-repair', 'media-remaster-review-pack', 'media-remaster-decide'].includes(j)),
  compute: ['media-compute'], asr: ['media-asr'], diar: ['media-diar'], llm: ['media-llm'], remaster: ['media-remaster'], /* saturated by the backfill: nothing else waits behind it (10-24: the work orders sat behind 209 queued runs) */ cloud: ['media-cloud-remaster'], quiet: ['media-quiet-repair'],
  shorts: ['media-short'], portraits: ['media-speaker-sketch', 'media-portraits-extend', 'media-speakers', 'media-rank', 'media-stages-sync', 'media-quote-audit', 'media-meta-fix', 'media-identity', 'media-relink', 'media-safe-listening', 'media-speaker-merge', 'media-talk-identities', 'media-trim-audit'], downloads: ['media-fetch', 'media-archive-import'] };
// speaker galleries (Chad 10-23): the portraits lane (an image call each at most; never behind transcription)
Object.assign(MEDIA_REGISTRY, { 'media-gallery': mediaGalleryJob, 'media-portrait-inventory': mediaPortraitInventoryJob });
MEDIA_LANES.portraits.push('media-gallery', 'media-portrait-inventory', 'media-cloud-order', 'media-light-backfill', 'media-preview', 'media-remaster-quality', 'media-remaster-review-pack', 'media-remaster-decide');
// compute: one per ASR slot on boss (4 × 6 threads measured best); llm: API-bound, wide; pipeline: re-runs of published talks
// asr: + 4 because a run also waits on its diarization; the SLOTS (acquireAsrHost) cap transcriptions
// compute (prep): 16 — prep mostly waits on the GPU host and boss (its tower CPU work stays capped by towerLight, 4 × 2 threads)
// asr: the transcription slots + 4 — the extra workers do a talk's language ID and upload while the slots are busy, so a
// freed aorus slot is taken within seconds (06:50: 3-min clips finish in 12 s and the GPU sat idle between them)
// llm: API-bound — 12 workers; the per-provider adaptive gates in media/llm.js pace the actual calls
export const MEDIA_LANE_WORKERS = { compute: Number(process.env.MEDIA_PREP_WORKERS) || 16, asr: (asrHosts().reduce((n, h) => n + h.slots, 0) || mediaParallel()) + 4,
  diar: Number(process.env.MEDIA_DIAR_WORKERS) || 14,   // boss 6 + aorus 1 started; the rest re-attach (old aorus jobs) or wait
  llm: Number(process.env.MEDIA_LLM_WORKERS) || 12, pipeline: 3, downloads: Number(process.env.MEDIA_FETCH_RUNS) || 2, remaster: Number(process.env.MEDIA_REMASTER_WORKERS) || 6, cloud: 1, quiet: 1 };

// the FEED: N new items in processing by rank, one download run queued (30 s)
async function mediaFeedLoop() {
  while (!isDraining()) {
    try {
      const r = await mediaLanesFeedPass();
      if (r.compute.length || r.llm.length || r.fetch) logger.info(r, 'media feed');
      // the per-provider LLM gates (limit · in flight · waiting · rate-limited so far): the adaptive backoff, visible
      const { gateStats } = await import('../lib/media/llm.js');
      const g = gateStats();
      if (Object.keys(g).length) logger.info({ gates: g }, 'llm gates');
    }
    catch (err) { logger.warn({ err: err.message }, 'media feed pass failed'); }
    await nap(30_000);
  }
}
// GPU spend ∝ work done (Chad 10-24): the reaper is its OWN loop (not the cloud lane's), and the backfill's state file is written HERE
async function podReaperLoop() {
  const { reapPass } = await import('../lib/media/pod-reaper.js');
  while (!isDraining()) {
    try { const r = await reapPass(); if (r.reaped.length || r.errors.length) logger.warn(r, 'pod reaper'); }
    catch (err) { logger.warn({ err: err.message }, 'pod reaper pass failed'); }
    await nap(180_000);
  }
}
// the public /media readout and the verdicts: the quality summary refreshed every 5 min (reads meta.json files, never writes while a run is on the talk)
async function qualityLoop() {
  const { mediaRemasterQualityJob } = await import('../lib/ops/media-jobs.js');
  while (!isDraining()) {
    try { await mediaRemasterQualityJob({ write: true }); } catch (err) { logger.warn({ err: err.message }, 'remaster quality pass failed'); }
    await nap(300_000);
  }
}
// the LIGHT tier (raw original beside the playing copy), LOW priority: a talk or two every 3 min, on boss, and only while tower is not loaded
async function lightBackfillLoop() {
  const { mediaLightBackfillJob } = await import('../lib/ops/media-jobs.js');
  const { loadavg } = await import('os');
  while (!isDraining()) {
    try { if (loadavg()[0] < Number(process.env.MEDIA_LIGHT_MAX_LOAD || 45)) { const r = await mediaLightBackfillJob({ limit: 2 }); if (r.done.length) logger.info(r, 'light tier backfill'); } }
    catch (err) { logger.warn({ err: err.message }, 'light backfill pass failed'); }
    await nap(180_000);
  }
}
// the LANE KEEPER: a cloud lane that is not running while talks wait for it is started again (restart, crash, a run that ended on a money stop that has cleared)
async function laneKeeperLoop() {
  const { laneKeeperPass } = await import('../lib/ops/media-jobs.js');
  while (!isDraining()) {
    try { const r = await laneKeeperPass(); if (r.action === 'queued') logger.warn(r, 'lane keeper: cloud lane restarted'); }
    catch (err) { logger.warn({ err: err.message }, 'lane keeper pass failed'); }
    await nap(60_000);
  }
}
// host memory (boss is TWO pools — system RAM + a 96 GB GPU carve-out): read live from the gates every minute, labelled, for /ops/services and system-checks
async function hostMemoryLoop() {
  const T = await import('../lib/media/tools.js');
  const { writeFile, mkdir } = await import('fs/promises');
  const { STATE_FILE } = await import('../lib/media/cloud.js');
  const { dirname, join } = await import('path');
  while (!isDraining()) {
    try { const snap = await T.hostMemorySnapshot(['aorus', 'boss']); await mkdir(dirname(STATE_FILE), { recursive: true }); await writeFile(join(dirname(STATE_FILE), 'host-memory.json'), JSON.stringify({ at: Date.now(), hosts: snap })); }
    catch (err) { logger.warn({ err: err.message }, 'host memory pass failed'); }
    await nap(60_000);
  }
}
async function backfillStatusLoop() {
  const { pullLocal, render } = await import('../../scripts/media/remaster-backfill-status.mjs');
  const { writeFile, mkdir } = await import('fs/promises');
  const { STATE_FILE } = await import('../lib/media/cloud.js');
  const { dirname, join } = await import('path');
  while (!isDraining()) {
    try { await mkdir(dirname(STATE_FILE), { recursive: true }); await writeFile(join(dirname(STATE_FILE), 'remaster-backfill-state.md'), render(pullLocal(dirname(STATE_FILE)))); }
    catch (err) { logger.warn({ err: err.message }, 'backfill status write failed'); }
    await nap(300_000);
  }
}
async function speakerSketchLoop() { while (!isDraining()) { try { await mediaSpeakerSketchSweepJob(); } catch (err) { logger.warn({ err: err.message }, 'speaker sketch sweep failed'); } await nap(10 * 60_000); } }
await runService({ name: process.env.name || 'siftersearch-media', registry: MEDIA_REGISTRY, lanes: MEDIA_LANES, laneWorkers: MEDIA_LANE_WORKERS, loops: [speakerSketchLoop, mediaDropLoop, mediaFeedLoop, podReaperLoop, backfillStatusLoop, qualityLoop, lightBackfillLoop, laneKeeperLoop, hostMemoryLoop] });
