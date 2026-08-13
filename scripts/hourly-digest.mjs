// The PEAK-window half of the hourly digest: what got INGESTED while grounding is paused for DeepSeek's
// off-peak pricing. The off-peak half (entity/grounding progress) is ALREADY sent hourly by the existing
// system crontab on tower-nas, which POSTs /api/admin/grounding/digest — the same scheduler that runs
// system-checks.mjs and backup-daily.mjs. So this deliberately does NOTHING off-peak: sending there too
// would put two identical grounding emails in the inbox every hour.
//   node scripts/hourly-digest.mjs [--force] [--since-hours N]
import { nowInPeak } from '../api/lib/pipeline/peak.js';

const FORCE = process.argv.includes('--force');
const i = process.argv.indexOf('--since-hours');
const SINCE_HOURS = i >= 0 ? Number(process.argv[i + 1]) : 1;
const since = Math.floor(Date.now() / 1000) - Math.round(SINCE_HOURS * 3600);

if (!nowInPeak() && !FORCE) {
  console.log('off-peak → grounding digest is the crontab\'s job; nothing to do here');
  process.exit(0);
}

try {
  const { sendIngestDigest } = await import('../api/lib/pipeline/ingest-digest.js');
  const r = await sendIngestDigest(since, { force: FORCE });
  console.log(`ingest digest: ${r.count} docs → ${r.sentTo || '(nothing to report)'}`);
} catch (e) {
  console.error('hourly ingest digest failed:', e.message);
  process.exit(1);
}
