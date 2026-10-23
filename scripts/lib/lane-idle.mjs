// Which media lanes are IDLE with work waiting — not counting backpressure (10-23: prep pauses on purpose once enough
// talks are prepped for ASR; 'compute idle, 327 waiting' was that pause, not a stall). Pure; used by system-checks.
/** health: /api/media/progress/live .health → { compute, llm } (true = idle while it should work). asrTarget: the prepped
 *  buffer prep fills before it pauses (the feed stops at 3 × the ASR slots, 18). */
export function idleLanes(h = {}, { asrTarget = Number(process.env.MEDIA_ASR_TARGET) || 12 } = {}) {
  const asrFed = (h.asr_backlog || 0) >= asrTarget && (h.asr_running || 0) > 0;   // enough prepped, and ASR is working
  return {
    compute: (h.compute_backlog || 0) > 0 && (h.compute_running || 0) === 0 && !asrFed,
    llm: (h.llm_backlog || 0) > 0 && (h.llm_running || 0) === 0,
  };
}
