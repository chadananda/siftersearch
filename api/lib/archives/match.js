// recommend(item) → {match, score 0-100, why, destination} (pure). Match comes from archive-sifter's suggestion (metadata.sug); score ranks what Chad should look at first.
const MATCH = { duplicate: 'held', version: 'version', new: 'new', unsure: 'unsure', excluded: 'junk' };
const BASE = { new: 60, version: 45, unsure: 35, held: 15, junk: 0 };
const DEST = { talk: 'media pipeline (remaster, /media)', video: 'media pipeline (remaster, /media)', book: 'Dewey book intake (library)', scan: 'OCR then Dewey book intake', 'photo-set': 'photo archive (not yet decided)', junk: 'not imported' };
const OPEN = { new: 'Not in the library', version: 'Another version of something the library holds', unsure: 'Could not be matched to the library with certainty', held: 'Already in the library', junk: 'System or unrecognised file' };

export function recommend(item) {
  const { kind, year, duration_s: dur, files } = item, md = item.metadata || {};
  const match = kind === 'junk' ? 'junk' : MATCH[md.sug] || 'unsure';
  const destination = DEST[kind] || 'not imported';
  if (match === 'junk') return { match, score: 0, why: `${OPEN.junk}; ${kind === 'junk' ? 'set aside' : 'excluded by the catalogue'}.`, destination };
  let score = BASE[match];
  const bits = [];
  const talk = kind === 'talk' || kind === 'video';
  if (talk) { score += kind === 'video' ? 3 : 5; if (dur >= 300) score += 5; if (dur >= 1800) score += 3; }
  else if (kind === 'book') score += 5;
  else if (kind === 'scan') score -= match === 'held' ? 10 : 5;
  else if (kind === 'photo-set') score -= 15;
  if (year && year < 1970) score += 25; else if (year && year < 1990) score += 10;
  const what = kind === 'talk' ? 'recording' : kind === 'photo-set' ? 'photo set' : kind;
  bits.push(year ? `${year} ${what}` : what);
  if (talk && dur) bits.push(`${Math.round(dur / 60)} min`);
  if (kind === 'scan' || kind === 'photo-set') bits.push(`${files} images`);
  const near = md.near ? ` (${String(md.near).slice(0, 80)})` : '';
  const why = `${OPEN[match]}${match === 'new' ? '' : near}; ${bits.join(', ')}.`;
  return { match, score: Math.max(0, Math.min(100, score)), why, destination };
}
