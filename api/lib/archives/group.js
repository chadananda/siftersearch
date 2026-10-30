// groupFiles(catalogue rows) → intake items (pure). Needs WHOLE folders: callers pass every row. Never invents speakers; creator = artist tag only.
// Identical items (same fingerprints) kept in many folders — a drive of backups of backups: 82k book files, 27k distinct — become ONE item (collapseCopies).
import { createHash } from 'crypto';
import { covenantBreaker } from './covenant-breakers.js';
const BOOK = new Set(['pdf', 'epub', 'doc', 'docx', 'rtf', 'txt', 'mobi']);
const WEB_CRUFT = new Set(['html', 'htm', 'xml', 'csv', 'md']);
const HQ = new Set(['wav', 'flac', 'aif', 'aiff']);
const MID = new Set(['m4a', 'ogg', 'oga', 'opus', 'wma', 'aac', 'mov', 'mkv', 'mp4']);
const CAMERA = /^(img|dsc|dscn|dscf|pict|photo|p|mvi|pxl)[-_ ]?\d+/i;
const CB = /(^|\/)[^/]*covenant[-_ ]?breaker[^/]*(\/|$)/i;
const YEAR = /(?<!\d)(18|19|20)\d{2}(?!\d)/;
const nat = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const base = (n) => n.replace(/\.[^.]*$/, '');
const rank = (r) => (HQ.has(r.ext) ? 3 : MID.has(r.ext) ? 2 : r.ext === 'mp3' ? 1 : 0);
const clean = (s) => String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_ ]ocr'?d\b|\s*-\s*copy(?:\s*\(\d+\))?$/gi, '').replace(/_+/g, ' ').replace(/^\s*\d{1,3}[\s.\-_)]+(?=\S)/, '').replace(/\s+/g, ' ').trim();
const yearOf = (tag, ...txt) => {
  const t = String(tag || '').match(YEAR); if (t) return Number(t[0]);
  for (const s of txt) { const m = String(s || '').match(YEAR); if (m && Number(m[0]) <= new Date().getFullYear()) return Number(m[0]); }
  return null;
};
const ext = (r) => String(r.ext || r.name?.split('.').pop() || '').toLowerCase();
const isJunk = (r) => r.cls === 'junk' || r.cls === 'other' || WEB_CRUFT.has(ext(r)) || (!r.ext && (r.size || 0) < 4096);

function item(kind, section, rows, primary, title) {
  const p = primary;
  const fps = rows.map((r) => r.fp).filter(Boolean);
  const fp = fps.length !== rows.length ? null : fps.length === 1 ? fps[0] : createHash('sha1').update([...fps].sort().join('|')).digest('hex').slice(0, 24);
  const t = title || clean(p.title || p.name), creator = String(p.artist || '').trim() || null, year = yearOf(p.year, p.name, p.folder);
  const cb = kind === 'junk' ? null : covenantBreaker(year, creator, t, p.rel);   // kept apart; ones written before the break may be imported
  return { kind, section: cb ? 'covenant-breaker' : section, title: t, creator, year,
    lang: null, primary_rel: p.rel, rel_paths: rows.map((r) => r.rel), files: rows.length, bytes: rows.reduce((n, r) => n + (r.size || 0), 0),
    duration_s: p.dur || null, metadata: { fp, sug: p.sug || null, near: p.near || null, catalog_why: p.why || null, cls: p.cls, ext: ext(p), ...(cb ? { cb } : {}) } };
}

export function groupFiles(rows) {
  const out = [], byFolder = new Map();
  for (const r of rows) { const f = r.folder ?? ''; if (!byFolder.has(f)) byFolder.set(f, []); byFolder.get(f).push({ ...r, ext: ext(r) }); }
  const sec = (r) => (CB.test(r.rel) ? 'covenant-breaker' : 'main');
  for (const [folder, rs] of byFolder) {
    const live = rs.filter((r) => !isJunk(r));
    for (const r of rs.filter(isJunk)) { const it = item('junk', 'set-aside', [r], r); it.title = clean(r.name); out.push(it); }
    const images = live.filter((r) => r.cls === 'image');
    const seq = images.filter((r) => /\d{2,}/.test(base(r.name)) && !CAMERA.test(base(r.name)));
    const folderName = clean(folder.split('/').pop()) || 'Untitled';
    if (images.length >= 5 && images.length / live.length >= 0.6 && seq.length / images.length >= 0.6) {
      const s = [...images].sort((a, b) => nat(a.rel, b.rel));
      out.push(item('scan', sec(s[0]), s, s[0], folderName));
    } else if (images.length) {
      const s = [...images].sort((a, b) => nat(a.rel, b.rel));
      out.push(item('photo-set', sec(s[0]), s, s[0], folderName));
    }
    const media = new Map();
    for (const r of live) {
      if (r.cls === 'audio' || r.cls === 'video') { const k = `${r.cls}|${base(r.name).toLowerCase()}`; (media.get(k) || media.set(k, []).get(k)).push(r); }
      else if (BOOK.has(r.ext) || ['pdf', 'doc', 'docx', 'epub', 'txt'].includes(r.cls)) out.push(item('book', sec(r), [r], r));
    }
    for (const g of media.values()) {
      const best = [...g].sort((a, b) => rank(b) - rank(a) || (b.size || 0) - (a.size || 0))[0];
      out.push(item(best.cls === 'video' ? 'video' : 'talk', sec(best), g, best));
    }
  }
  return collapseCopies(out);
}

const BACKUP = /\b(?:copy|backup|bkup|clear|desktop|thumbdrives?|flash ?drives?|old|misc|unsorted|temp|downloads?)\b/gi;
const COPY_WHY = /^\s*(?:duplicate: (?!library)|same bytes as)/i;
const plainness = (rel) => [(String(rel).match(BACKUP) || []).length, String(rel).split('/').length, String(rel).length];
const lessPlain = (a, b) => { const x = plainness(a.primary_rel), y = plainness(b.primary_rel); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || (a.primary_rel < b.primary_rel ? -1 : 1); };

/** Items with the same fingerprint → one, filed under its plainest path (fewest backup-ish folder words, shallowest). Pure. Junk is left alone. */
export function collapseCopies(items) {
  const out = [], byFp = new Map();
  for (const it of items) {
    const fp = it.kind !== 'junk' && it.metadata?.fp;
    if (!fp) { out.push(it); continue; }
    const k = `${it.kind}|${fp}`;
    (byFp.get(k) || byFp.set(k, []).get(k)).push(it);
  }
  for (const g of byFp.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    const [keep, ...rest] = [...g].sort(lessPlain);
    const verdict = g.find((x) => x.metadata.catalog_why && !COPY_WHY.test(x.metadata.catalog_why))?.metadata || keep.metadata;   // the catalogue's own verdict, not its "copy of"
    out.push({ ...keep, section: g.some((x) => x.section === 'covenant-breaker') ? 'covenant-breaker' : keep.section, year: keep.year ?? rest.find((x) => x.year)?.year ?? null,
      metadata: { ...keep.metadata, ...(g.find((x) => x.metadata.cb) ? { cb: g.find((x) => x.metadata.cb).metadata.cb } : {}), sug: verdict.sug, near: verdict.near, catalog_why: verdict.catalog_why, copies: g.length, also: rest.slice(0, 5).map((x) => x.primary_rel) } });
  }
  return out;
}
