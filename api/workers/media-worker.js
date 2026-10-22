// siftersearch-media — the MEDIA LIBRARY service (planning/media-library-plan.md): runs only media-scan / media-item /
// media-vocab, and watches Dewey's media drop folder. Its own entry with a SMALL import graph (not the whole ops registry),
// so other services' deploys do not drain an hour-long transcription; when it does drain, the running stage stops at once
// and resumes after the restart (api/lib/media/item.js). Shared machinery: api/lib/ops/service-worker.js.
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { isDraining, nap } from '../lib/drain.js';
import { runService } from '../lib/ops/service-worker.js';
import { mediaScanJob, mediaItemJob, mediaVocabJob, mediaDropPass, mediaSpeakersJob, mediaPlaybackJob } from '../lib/ops/media-jobs.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });

export const MEDIA_REGISTRY = { 'media-scan': mediaScanJob, 'media-item': mediaItemJob, 'media-vocab': mediaVocabJob, 'media-speakers': mediaSpeakersJob, 'media-playback': mediaPlaybackJob };

// a file dropped in DEWEY_MEDIA_DIR starts the pipeline with no other step
async function mediaDropLoop() {
  while (!isDraining()) {
    try { const r = await mediaDropPass(); if (r.queued) logger.info(r, 'media drop folder: new files — media-scan queued'); }
    catch (err) { logger.warn({ err: err.message }, 'media drop folder pass failed'); }
    await nap(5 * 60_000);
  }
}

await runService({ name: process.env.name || 'siftersearch-media', registry: MEDIA_REGISTRY, only: Object.keys(MEDIA_REGISTRY), loops: [mediaDropLoop] });
