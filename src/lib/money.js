// Dollar display for admin pages: never finer than a cent (Chad 10-10). Non-zero amounts under half a cent show "<$0.01".
export function usd(n, { compact = false } = {}) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v > 0 && v < 0.005) return '<$0.01';
  if (compact && v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
