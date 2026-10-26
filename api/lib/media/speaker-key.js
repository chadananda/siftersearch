// Pure speaker identity rules, shared with the offline audio worker.
import { slugify } from './names.js';

export const ascii = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`´']/g, '').replace(/\s+/g, ' ').trim();

/** Honorifics and titles that are not part of a name ("Mr. Hooper Dunbar", "Dr. Elsie Austin", "Hand of the Cause …"). */
const TITLES = /^(?:mr|mrs|ms|miss|dr|prof|professor|hand of the cause(?: of god)?|counsellor|amatul-baha|jinab-i|jenab|haji|mirza|sir|lady)\.?\s+/i;
export const cleanName = (name) => { let n = ascii(name).replace(/[‘’]/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim(); for (let i = 0; i < 3; i++) n = n.replace(TITLES, ''); return n.trim(); };

/** The person key: the folded name as a slug ("‘Alí Nakhjavání" → "ali-nakhjavani"). null for a surname alone. */
export function speakerKey(name) {
  let n = cleanName(name);
  // a middle initial is not part of the key ("Hooper C. Dunbar" = "Hooper Dunbar") while two full names remain
  const toks = n.split(/\s+/), full = toks.filter((t) => t.replace(/\./g, '').length > 1);
  if (full.length >= 2 && full.length < toks.length) n = full.join(' ');
  if (!n || n.split(/\s+/).length < 2 || /\b(?:audience|questioner|interpreter|narrator|chair|various|unknown|misc)\b/i.test(n)) return null;
  return slugify(n, 60) || null;
}

