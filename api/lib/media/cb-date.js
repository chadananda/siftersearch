// COVENANT-BREAKERS BY DATE (Chad 10-23: "We do not exclude Covenant-breakers until AFTER they broke the covenant"): a
// person with `cb_from` ('YYYY-MM', data/media-speaker-people.json — Charles Mason Remey: 1960-04, his Ridván 1960 claim)
// is included for talks recorded BEFORE it, excluded on or after it, and an undated talk (or one dated only to that year
// when the month decides) is HELD for Chad — never auto-published. Inclusion only; transcript linking is separate. Pure.
import { compatible } from './identity.js';

/** The person with a cb_from date this speaker label is (a full name form, initials allowed), or null. */
export function cbPerson(speaker, people = []) {
  if (!speaker) return null;
  const m = /^\s*([^,]+),\s*([^,]+)$/.exec(String(speaker));
  const forms = m ? [speaker, `${m[2]} ${m[1]}`] : [speaker];
  const hit = people.filter((p) => p.cb_from && [p.name, ...(p.aliases || [])].some((f) => forms.some((n) => compatible(n, f))));
  return hit.length === 1 ? hit[0] : null;
}

/** → 'include' | 'exclude' | 'hold'. recorded: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' | number | null. */
export function cbVerdict(cbFrom, recorded) {
  const r = recorded == null || recorded === '' ? null : String(recorded).trim();
  if (!r || !/^\d{4}/.test(r)) return 'hold';
  const [fy, fm] = String(cbFrom).split('-').map(Number);
  const [ry, rm] = r.split('-').map(Number);
  if (ry < fy) return 'include';
  if (ry > fy) return 'exclude';
  if (!rm) return 'hold';   // the same year, no month: the month decides
  return rm < (fm || 1) ? 'include' : 'exclude';
}
