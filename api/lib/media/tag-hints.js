// Audio container tags (ID3/MP4/Vorbis via ffprobe) as HINTS only: clean junk/mojibake, then compare with what the filename,
// folder and transcript said. Tags never overwrite a title/speaker; disagreements are recorded (hint_conflicts) for review.
// Precedence (strongest first): Chad's decisions (title_was/identity_decision) > transcript > folder/filename > tags.
import { basename, extname } from 'node:path';
import { resolveSpeaker } from './identity.js';

const JUNK = /^(?:track|audio ?track|audio|title|untitled|unknown(?: (?:artist|album|title))?|various(?: artists)?|no (?:title|artist|album)|new recording|recording|artist|album|cd|disc|side [ab12]|<unknown>|n\/a|none|null|\(?blank\)?)[\s._-]*\d{0,3}$/i;
const NOISE = /^(?:\d{1,3}|[a-z]{0,3}\d{1,3}[-_. ]\d{1,3}|www\..+|https?:.+|.*\.(?:com|org|net)\b.*|-+|_+)$/i;
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

/** Latin-1-decoded UTF-8 ("BahÃ¡'Ã­") → repaired; a string that is already fine is returned unchanged. */
export function fixMojibake(s) {
  const t = String(s ?? '');
  if (!/[ÂÃÅâ][\u0080-¿‘-›ŒœŠšŸŽžƒˆ˜]|â€/.test(t)) return t;
  try {
    // windows-1252 punctuation that got in place of C1 bytes maps back to its byte
    const cp = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
      0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
    const bytes = Buffer.from([...t].map((c) => { const n = c.codePointAt(0); return cp[n] ?? n; }));
    if ([...t].some((c) => c.codePointAt(0) > 0xff && !(c.codePointAt(0) in cp))) return t;
    const u = bytes.toString('utf8');
    return u.includes('�') ? t : u;
  } catch { return t; }
}

/** A tag value → clean string, or null when empty / a placeholder / the file name again / junk. */
export function cleanTag(v, { filename = '' } = {}) {
  let s = fixMojibake(String(v ?? '')).replace(/[\u0000-\u001f\u007f�]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || JUNK.test(s) || NOISE.test(s)) return null;
  const stem = fold(basename(filename, extname(filename)));
  if (stem && fold(s) === stem) return null;
  return s.slice(0, 300);
}

/** "3/8" | "3" | "03 of 8" → { n, of } (null when unreadable or absurd). */
export function parseOrdinal(v) {
  const m = /^\s*(\d{1,3})\s*(?:\/|of)?\s*(\d{1,3})?\s*$/i.exec(String(v ?? ''));
  if (!m) return { n: null, of: null };
  const n = Number(m[1]), of = m[2] ? Number(m[2]) : null;
  return { n: n > 0 ? n : null, of: of && of >= n ? of : null };
}

const yearOf = (v) => { const y = /\b(1[89]\d\d|20[0-3]\d)\b/.exec(String(v ?? ''))?.[1]; return y ? Number(y) : null; };

/** ffprobe tags (+ duration/bitrate) → tag_hints, or null when the file carries nothing usable. */
export function tagHints(tags = {}, { filename = '', duration_s = null, bit_rate = null } = {}) {
  const t = Object.fromEntries(Object.entries(tags || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
  const c = (k) => cleanTag(t[k], { filename });
  const artist = c('artist') || c('album_artist') || c('albumartist') || c('composer');
  const albumArtist = c('album_artist') || c('albumartist');
  const trk = parseOrdinal(t.track), dsc = parseOrdinal(t.disc);
  const h = { title: c('title'), artist, album_artist: albumArtist && albumArtist !== artist ? albumArtist : null, composer: c('composer'), album: c('album'),
    track: trk.n, track_of: trk.of, disc: dsc.n, disc_of: dsc.of, year: yearOf(t.date ?? t.year ?? t.tyer ?? t.tdrc ?? t.creation_time), genre: c('genre'),
    comment: c('comment') || c('description'), duration_s: duration_s ?? null, bit_rate: bit_rate ?? null };
  const raw = Object.fromEntries(Object.entries(t).filter(([k, v]) => v != null && String(v).trim() && !/^(?:encoder|major_brand|minor_version|compatible_brands|handler_name)$/.test(k)).slice(0, 24).map(([k, v]) => [k, fixMojibake(String(v)).slice(0, 200)]));
  const useful = h.title || h.artist || h.album || h.track || h.year || h.comment;
  return useful ? { ...h, raw, source: 'id3' } : null;
}

/** A title that is a placeholder or a CD-rip name ("Track 12", "12", "Disc 2 - 03", "01 Audio"). */
export const isPlaceholderTitle = (t) => { const s = String(t ?? '').trim(); return !s || JUNK.test(s) || NOISE.test(s) || /^(?:cd|disc|track|audio)\s*\d+\b.*\b(?:track|audio)?\s*\d+$/i.test(s); };

let peopleCache = null;
async function loadPeople() {
  if (peopleCache) return peopleCache;
  try { const { readFile } = await import('node:fs/promises'); const { join } = await import('node:path');
    peopleCache = JSON.parse(await readFile(join(process.cwd(), 'data', 'media-speaker-people.json'), 'utf8')); } catch { peopleCache = { people: [], notSpeakers: [] }; }
  return peopleCache;
}
export const resetPeopleCache = () => { peopleCache = null; };

const partFromText = (s) => { const m = /\b(?:part|pt\.?|talk|lecture|session|tape|cassette)\s*(?:no\.?\s*)?(\d{1,2})\b(?:\s*(?:of|\/)\s*(\d{1,2}))?/i.exec(String(s || '')); return m ? { n: Number(m[1]), of: m[2] ? Number(m[2]) : null } : null; };

/**
 * Compare the tag hints with what the item already says. Never changes the item.
 *  ctx: { people, notSpeakers (default: data file), opening (first words of the transcript), siblings: [{track, album}] }
 *  → { conflicts: [{field, tag, item, note}], proposals: {title?, speaker?, series?}, sequence: {part, of, album, confidence, basis[]} | null }
 */
export async function compareHints(hints, meta = {}, ctx = {}) {
  const out = { conflicts: [], proposals: {}, sequence: null };
  if (!hints) return out;
  const data = ctx.people ? { people: ctx.people, notSpeakers: ctx.notSpeakers || [] } : await loadPeople();
  const resolve = (name) => (name ? resolveSpeaker(name, data.people || [], { title: meta.title || '', collection: meta.collection || '', series: meta.series || '', recorded_year: meta.year || null }, { notSpeakers: data.notSpeakers || [] }) : null);

  // (a) speaker: one more piece of evidence, below the transcript and the folder/file name
  for (const [field, name] of [['artist', hints.artist], ['album_artist', hints.album_artist]]) {
    if (!name) continue;
    const tagR = resolve(name), itemR = meta.speaker_key ? { key: meta.speaker_key } : resolve(meta.speaker);
    if (itemR?.key && tagR?.key && itemR.key !== tagR.key) out.conflicts.push({ field: 'speaker', tag: name, item: meta.speaker, note: `${field} resolves to ${tagR.display}, the talk to ${itemR.display || meta.speaker} (the talk's own evidence stands)` });
    else if (!itemR?.key && !meta.speaker && tagR?.key) out.proposals.speaker = { value: tagR.display, key: tagR.key, from: field, basis: tagR.basis };
    else if (!meta.speaker && !tagR?.key && field === 'artist') out.proposals.speaker_unresolved = name;
  }

  // (b) title: only offered when the item's title is a placeholder / rip name, never over Chad's retitle or identity decision
  const chadSet = !!(meta.title_was || meta.identity_decision);
  if (hints.title) {
    if (!chadSet && isPlaceholderTitle(meta.title)) out.proposals.title = { value: hints.title, from: 'title' };
    else if (fold(hints.title) !== fold(meta.title) && !isPlaceholderTitle(meta.title) && !fold(meta.title).includes(fold(hints.title)) && !fold(hints.title).includes(fold(meta.title)))
      out.conflicts.push({ field: 'title', tag: hints.title, item: meta.title, note: chadSet ? 'Chad set the title; tag differs' : 'tag title differs from the title' });
  }

  // (c) sequence / series: a track number is a hint to be VALIDATED, it may be the CD track
  if (hints.track) {
    const basis = [], seq = { part: hints.track, of: hints.track_of, album: hints.album || null, confidence: 0.25, basis };
    const fileOrTitle = partFromText(meta.part) || partFromText(meta.title) || (meta.part && /^\d+$/.test(String(meta.part)) ? { n: Number(meta.part), of: null } : null);
    const opened = partFromText(String(ctx.opening || '').slice(0, 600));
    for (const [label, p] of [['filename/title', fileOrTitle], ['opening of the talk', opened]]) {
      if (!p) continue;
      if (p.n === hints.track) { seq.confidence += 0.3; basis.push(`${label} also says part ${p.n}`); }
      else { seq.confidence -= 0.25; basis.push(`${label} says part ${p.n}, the tag says track ${hints.track}`); out.conflicts.push({ field: 'sequence', tag: `track ${hints.track}`, item: `part ${p.n}`, note: `${label} says part ${p.n}` }); }
    }
    if (hints.album && [meta.series, meta.collection].filter(Boolean).some((x) => fold(x) === fold(hints.album) || fold(x).includes(fold(hints.album)))) { seq.confidence += 0.2; basis.push('album matches the series/collection'); }
    if (hints.track_of && hints.track_of > 40) { seq.confidence -= 0.1; basis.push('track total looks like a CD/playlist, not a course'); }
    if (hints.duration_s && hints.duration_s < 120) { seq.confidence -= 0.15; basis.push('under 2 minutes: probably not a whole talk part'); }
    const sib = (ctx.siblings || []).filter((s) => s.album && fold(s.album) === fold(hints.album)).map((s) => s.track).filter(Boolean);
    if (sib.length >= 2) {
      const all = [...sib, hints.track].sort((a, b) => a - b);
      if (new Set(all).size === all.length && all.at(-1) - all[0] < all.length + 2) { seq.confidence += 0.2; basis.push(`continuous with ${sib.length} neighbours on the album`); }
      else { seq.confidence -= 0.1; basis.push('track numbers repeat or leave gaps among the album neighbours'); }
    }
    seq.confidence = Math.max(0, Math.min(0.95, Math.round(seq.confidence * 100) / 100));
    out.sequence = seq;
    if (hints.album && !meta.series && seq.confidence >= 0.4) out.proposals.series = { value: hints.album, part: hints.track, of: hints.track_of, confidence: seq.confidence };
  }
  return out;
}

/** Dedupe: tags are ONE weak signal (same title + artist + duration within 2 s) — never a verdict on their own. */
export function weakDuplicateSignal(a, b) {
  if (!a?.title || !b?.title || !a.artist || !b.artist || a.duration_s == null || b.duration_s == null) return { weak: false };
  const same = fold(a.title) === fold(b.title) && fold(a.artist) === fold(b.artist) && Math.abs(a.duration_s - b.duration_s) <= 2;
  return same ? { weak: true, verdict: false, note: 'identical tag title+artist+duration; needs audio-window evidence' } : { weak: false };
}

/** Fill meta.tag_hints / meta.hint_conflicts / meta.hint_proposals from probe output. Changes no title or speaker. → meta */
export async function applyTagHints(meta, probe, { filename = '', ctx = {} } = {}) {
  try {
    const h = tagHints(probe?.tags, { filename, duration_s: probe?.duration_s, bit_rate: probe?.bit_rate });
    if (!h) { meta.tag_hints = null; return meta; }
    meta.tag_hints = h;
    const cmp = await compareHints(h, meta, ctx);
    meta.hint_conflicts = cmp.conflicts;
    meta.hint_proposals = { ...cmp.proposals, ...(cmp.sequence ? { sequence: cmp.sequence } : {}) };
  } catch (err) { meta.tag_hints_error = String(err.message).slice(0, 160); }
  return meta;
}
