// groupFiles(catalogue rows) → intake items (pure). Needs WHOLE folders: callers pass every row. Never invents speakers; creator = artist tag only.
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
const clean = (s) => String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').replace(/^\s*\d{1,3}[\s.\-_)]+(?=\S)/, '').replace(/\s+/g, ' ').trim();
const yearOf = (tag, ...txt) => {
  const t = String(tag || '').match(YEAR); if (t) return Number(t[0]);
  for (const s of txt) { const m = String(s || '').match(YEAR); if (m && Number(m[0]) <= new Date().getFullYear()) return Number(m[0]); }
  return null;
};
const ext = (r) => String(r.ext || r.name?.split('.').pop() || '').toLowerCase();
const isJunk = (r) => r.cls === 'junk' || r.cls === 'other' || WEB_CRUFT.has(ext(r)) || (!r.ext && (r.size || 0) < 4096);

function item(kind, section, rows, primary, title) {
  const p = primary;
  return { kind, section, title: title || clean(p.title || p.name), creator: String(p.artist || '').trim() || null, year: yearOf(p.year, p.name, p.folder),
    lang: null, primary_rel: p.rel, rel_paths: rows.map((r) => r.rel), files: rows.length, bytes: rows.reduce((n, r) => n + (r.size || 0), 0),
    duration_s: p.dur || null, metadata: { sug: p.sug || null, near: p.near || null, catalog_why: p.why || null, cls: p.cls, ext: ext(p) } };
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
  return out;
}
