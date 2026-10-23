// siftersearch-media — the MEDIA LIBRARY service (planning/media-library-plan.md): runs only media-scan / media-item /
// media-vocab, and watches Dewey's media drop folder. Its own entry with a SMALL import graph (not the whole ops registry),
// so other services' deploys do not drain an hour-long transcription; when it does drain, the running stage stops at once
// and resumes after the restart (api/lib/media/item.js). Shared machinery: api/lib/ops/service-worker.js.
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { isDraining, nap } from '../lib/drain.js';
import { runService } from '../lib/ops/service-worker.js';
import { mediaScanJob, mediaItemJob, mediaVocabJob, mediaDropPass, mediaSpeakersJob, mediaPlaybackJob, mediaGradeJob, mediaShortJob, mediaShortsMomentsJob, mediaPortraitsExtendJob, mediaFetchJob, mediaRankJob, mediaLanesFeedPass, mediaComputeJob, mediaAsrJob, mediaDiarJob, mediaLlmJob, mediaMetaFixJob, mediaIdentityJob, mediaExcludeJob, mediaTrimAuditJob, mediaStagesSyncJob, mediaQuoteAuditJob } from '../lib/ops/media-jobs.js';
import { mediaParallel, asrHosts } from '../lib/media/tools.js';
import { mediaGalleryJob, mediaPortraitInventoryJob } from '../lib/ops/media-gallery-jobs.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });

export const MEDIA_REGISTRY = { 'media-short': mediaShortJob, 'media-shorts-moments': mediaShortsMomentsJob, 'media-portraits-extend': mediaPortraitsExtendJob, 'media-fetch': mediaFetchJob, 'media-compute': mediaComputeJob, 'media-asr': mediaAsrJob, 'media-diar': mediaDiarJob, 'media-meta-fix': mediaMetaFixJob, 'media-identity': mediaIdentityJob, 'media-exclude': mediaExcludeJob, 'media-trim-audit': mediaTrimAuditJob, 'media-llm': mediaLlmJob, 'media-rank': mediaRankJob, 'media-stages-sync': mediaStagesSyncJob, 'media-quote-audit': mediaQuoteAuditJob, 'media-scan': mediaScanJob, 'media-item': mediaItemJob, 'media-vocab': mediaVocabJob, 'media-speakers': mediaSpeakersJob, 'media-playback': mediaPlaybackJob, 'media-grade': mediaGradeJob };

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
export const MEDIA_LANES = { pipeline: Object.keys(MEDIA_REGISTRY).filter((j) => !['media-short', 'media-portraits-extend', 'media-speakers', 'media-fetch', 'media-rank',
  'media-stages-sync', 'media-quote-audit', 'media-compute', 'media-asr', 'media-diar', 'media-llm', 'media-meta-fix', 'media-identity', 'media-exclude', 'media-trim-audit'].includes(j)),
  compute: ['media-compute'], asr: ['media-asr'], diar: ['media-diar'], llm: ['media-llm'],
  shorts: ['media-short'], portraits: ['media-portraits-extend', 'media-speakers', 'media-rank', 'media-stages-sync', 'media-quote-audit', 'media-meta-fix', 'media-identity', 'media-exclude', 'media-trim-audit'], downloads: ['media-fetch'] };
// speaker galleries (Chad 10-23): the portraits lane (an image call each at most; never behind transcription)
Object.assign(MEDIA_REGISTRY, { 'media-gallery': mediaGalleryJob, 'media-portrait-inventory': mediaPortraitInventoryJob });
MEDIA_LANES.portraits.push('media-gallery', 'media-portrait-inventory');
// compute: one per ASR slot on boss (4 × 6 threads measured best); llm: API-bound, wide; pipeline: re-runs of published talks
// asr: + 4 because a run also waits on its diarization; the SLOTS (acquireAsrHost) cap transcriptions
// compute (prep): 16 — prep mostly waits on the GPU host and boss (its tower CPU work stays capped by towerLight, 4 × 2 threads)
// asr: the transcription slots + 4 — the extra workers do a talk's language ID and upload while the slots are busy, so a
// freed aorus slot is taken within seconds (06:50: 3-min clips finish in 12 s and the GPU sat idle between them)
// llm: API-bound — 12 workers; the per-provider adaptive gates in media/llm.js pace the actual calls
export const MEDIA_LANE_WORKERS = { compute: Number(process.env.MEDIA_PREP_WORKERS) || 16, asr: (asrHosts().reduce((n, h) => n + h.slots, 0) || mediaParallel()) + 4,
  diar: Number(process.env.MEDIA_DIAR_WORKERS) || 14,   // boss 6 + aorus 1 started; the rest re-attach (old aorus jobs) or wait
  llm: Number(process.env.MEDIA_LLM_WORKERS) || 12, pipeline: 3, downloads: Number(process.env.MEDIA_FETCH_RUNS) || 2 };

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
await runService({ name: process.env.name || 'siftersearch-media', registry: MEDIA_REGISTRY, lanes: MEDIA_LANES, laneWorkers: MEDIA_LANE_WORKERS, loops: [mediaDropLoop, mediaFeedLoop] });
