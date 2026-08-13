// ONE hourly digest that reports whichever job the box is actually doing: entity/grounding progress in
// DeepSeek's cheap off-peak window, book ingestion during peak when grounding is paused. Run from PM2
// cron every hour; each half is quiet when nothing happened, so the email always means something.
//   node scripts/hourly-digest.mjs [--force] [--since-hours N]
import { nowInPeak } from '../api/lib/pipeline/peak.js';

const FORCE = process.argv.includes('--force');
const i = process.argv.indexOf('--since-hours');
const SINCE_HOURS = i >= 0 ? Number(process.argv[i + 1]) : 1;
const since = Math.floor(Date.now() / 1000) - Math.round(SINCE_HOURS * 3600);

const peak = nowInPeak();
try {
  if (peak) {
    const { sendIngestDigest } = await import('../api/lib/pipeline/ingest-digest.js');
    const r = await sendIngestDigest(since, { force: FORCE });
    console.log(`peak → ingest digest: ${r.count} docs, sent to ${r.sentTo || '(nothing to report)'}`);
  } else {
    const { sendDigest } = await import('../api/lib/pipeline/digest.js');
    const r = await sendDigest(since, { force: FORCE });
    console.log(`off-peak → grounding digest: ${r.count} books, sent to ${r.sentTo || '(nothing to report)'}`);
  }
} catch (e) {
  console.error(`hourly digest failed (${peak ? 'ingest' : 'grounding'}):`, e.message);
  process.exit(1);
}
