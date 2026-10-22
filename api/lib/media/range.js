// Media time ranges: ?t=754 · ?t=754-812 · ?t=12:34-13:32 · ?t=1h2m3s · #t=754,812 (W3C media fragment). Shared by the API
// (clip cuts), the standalone page.html and the /media/<slug> player. Pure, no deps.

/** "754" · "754.5" · "12:34" · "1:02:03" · "1h2m3s" · "2m" → seconds, or null. */
export function parseTime(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(s)) return s.split(':').reduce((a, p) => a * 60 + Number(p), 0);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return null;
}

/** "754-812" | "754,812" | "754" | "t=754,812" → { start, end|null } or null when unreadable / empty / end ≤ start. */
export function parseRange(v) {
  const s = String(v ?? '').trim().replace(/^#?t=/, '');
  if (!s) return null;
  const [a, b] = s.split(/[-,~]/, 2);
  const start = a === '' ? 0 : parseTime(a);
  if (start == null || start < 0) return null;
  if (b == null || b === '') return { start, end: null };
  const end = parseTime(b);
  if (end == null || end <= start) return { start, end: null };
  return { start, end };
}

/** The range a request asks for: ?t= wins over #t= (the fragment never reaches a server, so the page passes it in). */
export function rangeFrom({ search = '', hash = '' } = {}) {
  const q = new URLSearchParams(String(search).replace(/^\?/, '')).get('t');
  const h = String(hash).replace(/^#/, '').split('&').find((p) => p.startsWith('t='));
  return parseRange(q) || parseRange(h) || null;
}

/** A clip inside the item: start clamped to [0, duration), end to the duration and at most `cap` seconds after start. */
export function clampClip({ start, end }, duration, cap = 180) {
  const d = Number(duration) || Infinity;
  const s = Math.max(0, Math.min(Number(start) || 0, d - 1));
  const e = Math.min(end == null ? s + cap : Number(end), d, s + cap);
  return { start: Math.round(s * 1000) / 1000, end: Math.round(Math.max(e, s + 1) * 1000) / 1000 };
}

/** 754 → "12:34"; 3723 → "1:02:03". */
export function formatTime(sec) {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** The ?t= value for a range (whole seconds, 1 decimal when needed). */
export const rangeParam = (start, end = null) => {
  const f = (x) => String(Math.round(x * 10) / 10);
  return end != null && end > start ? `${f(start)}-${f(end)}` : f(start);
};
