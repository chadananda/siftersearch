// recommend(item) → {match, score 0-100, why, destination} (pure). Match: the catalogue's verdict (metadata.catalog_why — archive-sifter writes
// sug import/look/skip, the reason says which), else a library title hit (metadata.lib, from the adopt job), else unsure. score ranks what Chad sees first.
const MATCH = { duplicate: 'held', version: 'version', new: 'new', unsure: 'unsure', excluded: 'junk', import: 'new', look: 'unsure' };
const BASE = { new: 60, version: 45, unsure: 35, held: 15, copy: 0, junk: 0 };
const DEST = { talk: 'media pipeline (remaster, /media)', video: 'media pipeline (remaster, /media)', book: 'Dewey book intake (library)', scan: 'OCR then Dewey book intake', 'photo-set': 'photo archive (not yet decided)', junk: 'not imported' };
const OPEN = { new: 'Not in the library', version: 'Another version of something the library holds', unsure: 'Could not be matched to the library with certainty', held: 'Already in the library', copy: 'Another copy of an item on this drive', junk: 'System or unrecognised file' };

/** The catalogue's reason text → a match ('new', 'held', 'copy', 'junk', 'version', 'unsure') or null. Pure. */
export function catalogMatch(why) {
  const w = String(why || '').trim().toLowerCase();
  if (!w) return null;
  if (/^new\b/.test(w)) return 'new';
  if (/^duplicate: library\b/.test(w)) return 'held';
  if (/^duplicate\b|^same bytes as\b/.test(w)) return 'copy';
  if (/^excluded\b/.test(w)) return 'junk';
  if (/^version\b/.test(w)) return 'version';
  if (/^unsure\b/.test(w)) return 'unsure';
  return null;
}

export function recommend(item) {
  const { kind, year, duration_s: dur, files } = item, md = item.metadata || {};
  const match = kind === 'junk' ? 'junk' : md.copy_of ? 'copy' : catalogMatch(md.catalog_why) || md.lib?.match || MATCH[md.sug] || 'unsure';
  const destination = match === 'copy' ? 'not imported' : DEST[kind] || 'not imported';
  if (match === 'junk') return { match, score: 0, why: `${OPEN.junk}; ${kind === 'junk' ? 'set aside' : String(md.catalog_why || 'excluded by the catalogue').slice(0, 100)}.`, destination };
  if (match === 'copy') return { match, score: 0, why: `${OPEN.copy}${md.copy_of || md.near ? ` (${String(md.copy_of || md.near).slice(0, 100)})` : ''}.`, destination };
  let score = BASE[match];
  const bits = [];
  const talk = kind === 'talk' || kind === 'video';
  if (talk) { score += kind === 'video' ? 3 : 5; if (dur >= 300) score += 5; if (dur >= 1800) score += 3; }
  else if (kind === 'book') score += 5;
  else if (kind === 'scan') score -= match === 'held' ? 10 : 5;
  else if (kind === 'photo-set') score -= 15;
  if (year && year < 1970) score += 25; else if (year && year < 1990) score += 10;
  if (md.copies > 1 && match !== 'held') score += Math.min(5, md.copies - 1);   // kept in several places on the drive: the donor valued it
  const what = kind === 'talk' ? 'recording' : kind === 'photo-set' ? 'photo set' : kind;
  bits.push(year ? `${year} ${what}` : what);
  if (talk && dur) bits.push(`${Math.round(dur / 60)} min`);
  if (kind === 'scan' || kind === 'photo-set') bits.push(`${files} images`);
  if (md.copies > 1) bits.push(`${md.copies} copies on the drive`);
  const ref = md.lib?.title ? `${md.lib.title}${md.lib.id ? ` #${md.lib.id}` : ''}` : md.near;
  const near = ref ? ` (${String(ref).slice(0, 80)})` : '';
  const cb = md.cb ? ` By ${md.cb.name}, who broke the Covenant c. ${md.cb.broke}: ${md.cb.before === true ? 'written before the break' : md.cb.before === false ? 'written after the break' : 'date unknown'}.` : '';
  const why = `${OPEN[match]}${match === 'new' ? '' : near}; ${bits.join(', ')}.${cb}`;
  return { match, score: Math.max(0, Math.min(100, score)), why, destination };
}
