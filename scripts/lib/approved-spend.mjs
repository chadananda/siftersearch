// APPROVED SPEND (Chad 10-20: "please do not send error reports on spending for which permission was given"). Each entry
// Chad approved is a daily allowance with an end date; the 24 h spend alert fires only above the base threshold PLUS the
// allowances active now. File: data/approved-spend.json [{ label, usd_per_day, until: 'YYYY-MM-DD', approved: '…' }]. Pure but fs.
import { readFileSync } from 'fs';

export function activeAllowance(entries, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return (entries || []).filter((e) => e && Number(e.usd_per_day) > 0 && (!e.until || e.until >= today))
    .reduce((s, e) => s + Number(e.usd_per_day), 0);
}
export function loadApproved(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}
/** Alert only when spend exceeds the base threshold plus what Chad approved. */
export const spendAlarming = (total, base, allowance) => total > base + allowance;
