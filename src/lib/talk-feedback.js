// Talk feedback helpers for TalkFeedback.svelte: the "best start" clock field (h:mm:ss | mm:ss | seconds ⇄ seconds). Pure.

/** "1:02:03" | "12:30" | "95" | "95.5" → seconds, or null when blank/invalid. Minutes/seconds parts after the first must be < 60. */
export function parseClock(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/** seconds → "m:ss" or "h:mm:ss" (whole seconds); '' for null. */
export function formatClock(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '';
  const t = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
