// Which media lanes are IDLE with work waiting — not counting backpressure (10-23: prep pauses on purpose once enough
// talks are prepped for ASR; 'compute idle, 327 waiting' was that pause, not a stall). Pure; used by system-checks.
import { mediaHosts } from './media-hosts.mjs';
/** The ASR slots (MEDIA_ASR_HOSTS "name:n,…" → sum), else 3 per registered host, as the feed reads them. */
const asrSlots = (env = process.env) => (env.MEDIA_ASR_HOSTS != null ? env.MEDIA_ASR_HOSTS.split(',').map((x) => Number(x.split(':')[1]) || 0).reduce((a, b) => a + b, 0) : mediaHosts(env).length * 3) || 4;
/** health: /api/media/progress/live .health → { compute, llm } (true = idle while it should work). The feed's OWN pause
 *  rule: prep stops once prepped + ASR work in hand (queued AND running) ≥ 3 × the ASR slots (18). 10-23 17:09: this check
 *  counted only asr_backlog (prepped + asr_queued = 10) against a fixed 12 and called the feed's correct pause (10 talks
 *  transcribing + 8 prepped + 2 queued = 20 ≥ 18) "COMPUTE IDLE". */
export function idleLanes(h = {}, { asrTarget = Number(process.env.MEDIA_ASR_TARGET) || 3 * asrSlots() } = {}) {
  const inHand = (h.asr_backlog || 0) + (h.asr_running || 0);
  const asrFed = inHand >= asrTarget && (h.asr_running || 0) > 0;   // the feed paused prep on purpose, and ASR is working
  return {
    compute: (h.compute_backlog || 0) > 0 && (h.compute_running || 0) === 0 && !asrFed,
    llm: (h.llm_backlog || 0) > 0 && (h.llm_running || 0) === 0,
  };
}
