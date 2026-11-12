// Shared helpers for the Implication browser: formatting, tradition colours, proof highlight, count-up action.
const PAL = ['#38bdf8', '#a78bfa', '#2dd4bf', '#fbbf24', '#f472b6', '#fb923c', '#4ade80', '#f87171', '#94a3b8'];
const known = { "Baha'i": 0, Christian: 1, Islam: 2, Buddhist: 3, Judaism: 4, Hindu: 5, Sikh: 6, Jain: 7 };
const NAMES = { "Baha'i": 'Bahá\u2019í', Bahai: 'Bahá\u2019í', Islam: 'Islam' };
export const tradName = (r) => NAMES[r] || r || '';
export const colorOf = (r) => PAL[known[r] ?? (([...(r || '?')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PAL.length)];
export const usd = (n, d) => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? (n < 1 ? 4 : n < 100 ? 2 : 0), maximumFractionDigits: d ?? (n < 1 ? 4 : n < 100 ? 2 : 0) });
export const num = (n) => n == null ? '—' : Math.round(n).toLocaleString('en-US');
export const compact = (n) => n == null ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const STATUSES = ['unreviewed', 'approved', 'edited', 'rejected', 'proposed'];
export const statusTone = { unreviewed: 'text-muted', approved: 'text-success', edited: 'text-info', rejected: 'text-error', proposed: 'text-warning' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Passage text with the proof span wrapped in <mark> (whitespace/case tolerant); safe HTML.
export function highlight(text, proof) {
  const t = String(text ?? ''); const p = String(proof ?? '').trim();
  if (!p) return esc(t);
  const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
  const m = re.exec(t);
  return m ? esc(t.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>' + esc(t.slice(m.index + m[0].length)) : esc(t);
}
// Svelte action: animate a number from 0 to the value. use:countUp={{ value, format }}
export function countUp(node, opts) {
  let raf; const run = ({ value, format = num, ms = 1400 }) => {
    cancelAnimationFrame(raf); if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = format(value); return; }
    const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / ms); node.textContent = format(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step);
  };
  run(opts);
  return { update: run, destroy: () => cancelAnimationFrame(raf) };
}
export const asOfText = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
