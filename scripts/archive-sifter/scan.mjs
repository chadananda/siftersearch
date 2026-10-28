// Incremental catalog scan of /tank/archives/<a> into its own SQLite; then (re)applies suggestions. Metadata by music-metadata (no ffprobe).
import { readdirSync, statSync, openSync, readSync, closeSync, existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { ROOT, DATA, db, classify, isMedia } from './lib.mjs';
let mm = null;
export const status = {};
const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function fingerprint(path, size) {
  const h = createHash('sha1'), fd = openSync(path, 'r'), n = Math.min(65536, size), b = Buffer.alloc(n);
  try { readSync(fd, b, 0, n, 0); h.update(b); if (size > 65536) { readSync(fd, b, 0, n, size - n); h.update(b); } } finally { closeSync(fd); }
  return `${size}:${h.digest('hex').slice(0, 24)}`;
}
async function meta(path, size) {
  mm ||= await import('music-metadata');
  const r = await Promise.race([mm.parseFile(path, { duration: size < 60e6 }), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 30000))]);
  const c = r.common || {};
  return { dur: r.format?.duration || null, title: c.title || null, artist: c.artist || null, year: c.year ? String(c.year) : (c.date || null) };
}
export async function scan(a) {
  const d = db(a); const st = (status[a] ||= {});
  if (st.running) return st;
  Object.assign(st, { running: true, started: Date.now(), seen: 0, added: 0, changed: 0, errors: 0, dir: '', done: false });
  try {
    const gen = (Number(d.prepare("SELECT v FROM meta WHERE k='gen'").pluck().get()) || 0) + 1;
    d.prepare("INSERT OR REPLACE INTO meta VALUES('gen',?)").run(String(gen));
    const known = new Map(); for (const r of d.prepare('SELECT id,rel,size,mtime FROM files').all()) known.set(r.rel, r);
    const ins = d.prepare('INSERT INTO files(rel,folder,name,ext,cls,size,mtime,fp,dur,title,artist,year,gen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const upd = d.prepare('UPDATE files SET size=?,mtime=?,fp=?,dur=?,title=?,artist=?,year=?,cls=?,gen=?,sug=NULL WHERE id=?');
    const touch = d.prepare('UPDATE files SET gen=? WHERE id=?');
    const root = join(ROOT, a), stack = [''];
    let batch = [];
    const flush = d.transaction((items) => { for (const f of items) f(); });
    while (stack.length) {
      const rd = stack.pop(); st.dir = rd;
      let ents; try { ents = readdirSync(join(root, rd), { withFileTypes: true }); } catch { st.errors++; continue; }
      for (const e of ents) {
        const rel = rd ? `${rd}/${e.name}` : e.name;
        if (e.isDirectory()) { stack.push(rel); continue; }
        if (!e.isFile()) continue;
        if (/^\..+\.[A-Za-z0-9]{6}$/.test(e.name)) continue; // rsync in-flight temp file
        let s; try { s = statSync(join(root, rel)); } catch { st.errors++; continue; }
        st.seen++;
        const k = known.get(rel), mt = Math.floor(s.mtimeMs / 1000);
        if (k && k.size === s.size && k.mtime === mt) { batch.push(() => touch.run(gen, k.id)); }
        else {
          const cls = classify(e.name, rel); let fp = null, m = {};
          try { fp = fingerprint(join(root, rel), s.size); } catch { st.errors++; }
          if (isMedia(cls)) { try { m = await meta(join(root, rel), s.size); } catch { st.errors++; } }
          const ext = e.name.includes('.') ? e.name.split('.').pop().toLowerCase() : '';
          if (k) { st.changed++; batch.push(() => upd.run(s.size, mt, fp, m.dur ?? null, m.title ?? null, m.artist ?? null, m.year ?? null, cls, gen, k.id)); }
          else { st.added++; batch.push(() => ins.run(rel, rd, e.name, ext, cls, s.size, mt, fp, m.dur ?? null, m.title ?? null, m.artist ?? null, m.year ?? null, gen)); }
        }
        if (batch.length >= 200) { flush(batch); batch = []; await new Promise((r) => setImmediate(r)); }
      }
    }
    flush(batch);
    await suggest(a);
    d.prepare("INSERT OR REPLACE INTO meta VALUES('last_scan',?)").run(new Date().toISOString());
    st.done = true;
  } catch (e) { st.error = String(e.message || e); }
  st.running = false; st.finished = Date.now();
  return st;
}
let mediaIdx = null, mediaAt = 0;
async function libraryIndex() {
  if (mediaIdx && Date.now() - mediaAt < 3600e3) return mediaIdx;
  try { const r = await fetch('https://api.siftersearch.com/api/media/index', { signal: AbortSignal.timeout(20000) }); mediaIdx = (await r.json()).items.map((i) => ({ s: i.s, t: i.t, d: i.d, n: norm(i.t) })).filter((i) => i.n.length >= 6); mediaAt = Date.now(); } catch { mediaIdx ||= []; }
  return mediaIdx;
}
// Suggestions: old classification file → fingerprint twins of decided/suggested files → library title/duration near-matches.
export async function suggest(a) {
  const d = db(a), cf = join(DATA, `${a}.classified.jsonl`), map = new Map();
  if (existsSync(cf)) for (const l of readFileSync(cf, 'utf8').split('\n')) { if (!l.trim()) continue; try { const j = JSON.parse(l); map.set(j.path.normalize('NFC'), j); } catch { /* skip */ } }
  const lib = await libraryIndex();
  const rows = d.prepare("SELECT id,rel,cls,fp,dur,title,name,dec FROM files").all();
  const byFp = new Map();
  const set = d.prepare('UPDATE files SET sug=?,why=?,near=? WHERE id=?');
  const SUG = { new: 'import', duplicate: 'skip', excluded: 'skip', version: 'look', unsure: 'look' };
  const res = new Map();
  for (const r of rows) {
    const j = map.get(r.rel.normalize('NFC'));
    if (!j) continue;
    const near = []; const l = j.dup?.lib; if (l) near.push({ kind: 'library', slug: l.slug, title: l.title, dur: l.dur, conf: l.conf }); else if (j.dup?.ref) near.push({ kind: 'drive', ref: j.dup.ref });
    res.set(r.id, { sug: SUG[j.cls] || 'look', why: `${j.cls}${j.note ? ': ' + j.note : ''}${j.bbvariant ? ' (bb variant)' : ''}`, near: near.length ? JSON.stringify(near) : null });
  }
  for (const r of rows) if (r.fp && res.has(r.id)) byFp.set(r.fp, r);
  for (const r of rows) if (r.fp && r.dec && !byFp.has(r.fp)) byFp.set(r.fp, r);
  const decSug = (x) => x.startsWith('import') ? 'import' : x === 'skip' ? 'skip' : 'look';
  for (const r of rows) {
    if (res.has(r.id)) continue;
    const twin = r.fp && r.cls !== 'junk' && rows.length && byFp.get(r.fp);
    if (twin && twin.id !== r.id) { const s = res.get(twin.id); res.set(r.id, { sug: r.dec ? null : (twin.dec ? decSug(twin.dec) : s.sug), why: `same bytes as ${twin.rel}${twin.dec ? ` (decided ${twin.dec})` : ` (${s.why})`}`, near: s?.near || null }); continue; }
    if (isMedia(r.cls) && lib.length) {
      const t = norm(r.title || r.name.replace(/\.[^.]+$/, '')); if (t.length < 6) continue;
      const hits = lib.filter((i) => i.n === t || (t.length >= 10 && (i.n.includes(t) || t.includes(i.n)) && Math.min(i.n.length, t.length) / Math.max(i.n.length, t.length) > 0.6));
      if (hits.length) {
        const near = hits.slice(0, 3).map((i) => ({ kind: 'library', slug: i.s, title: i.t, dur: i.d }));
        const close = r.dur && hits.some((i) => i.d && Math.abs(i.d - r.dur) / r.dur < 0.05);
        res.set(r.id, { sug: 'look', why: close ? 'library has same title and duration (likely duplicate)' : 'library has a similar title (duration differs or unknown)', near: JSON.stringify(near) });
      }
    }
  }
  d.transaction(() => { for (const r of rows) { const x = res.get(r.id); set.run(x?.sug ?? null, x?.why ?? null, x?.near ?? null, r.id); } })();
}
