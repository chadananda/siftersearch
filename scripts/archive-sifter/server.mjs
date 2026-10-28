// archive-sifter: browse/decide/import big copied drives. Tailscale-only, token login, own SQLite (~/archive-sifter). Imports hand files to Dewey intake dirs.
import { createServer } from 'http';
import { createReadStream, readFileSync, statSync, existsSync, mkdirSync, linkSync, symlinkSync, writeFileSync, lstatSync } from 'fs';
import { execFile } from 'child_process';
import { timingSafeEqual } from 'crypto';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setPriority } from 'os';
import { ROOT, DEWEY, archives, db, where, SORTS, isMedia } from './lib.mjs';
import { scan, status, suggest } from './scan.mjs';

try { setPriority(15); } catch { /* best effort: low CPU priority */ }
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = readFileSync(process.env.ARCHIVE_TOKEN_FILE || join(homedir(), '.archive-sifter-token'), 'utf8').trim();
const HOST = process.env.ARCHIVE_SIFTER_HOST || '100.77.148.41', PORT = Number(process.env.ARCHIVE_SIFTER_PORT || 7860);
const ok = (t) => { const a = Buffer.from(String(t || '')), b = Buffer.from(TOKEN); return a.length === b.length && timingSafeEqual(a, b); };
const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 5e7) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', aac: 'audio/aac', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', txt: 'text/plain; charset=utf-8' };
const absOf = (a, rel) => join(ROOT, a, rel);
const ROWCOLS = 'id,rel,folder,name,cls,size,dur,title,artist,year,sug,why,dec,dec_by,dec_at,imported';

function stream(req, res, path, ext) {
  const st = statSync(path), type = MIME[ext] || 'application/octet-stream', m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const s = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]); const e = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (s > e || s >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${s}-${e}/${st.size}`, 'content-length': e - s + 1 });
    return createReadStream(path, { start: s, end: e }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size });
  createReadStream(path).pipe(res);
}
const run = (cmd, args) => new Promise((r) => execFile(cmd, args, { timeout: 15000, maxBuffer: 2e6 }, (e, out) => r(e ? '' : out)));
const clean = (s) => s.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
async function preview(a, r) {
  const d = db(a), c = d.prepare('SELECT txt FROM text WHERE id=?').pluck().get(r.id); if (c != null) return c;
  const p = absOf(a, r.rel); let t = '';
  try {
    if (r.cls === 'pdf') t = clean(await run('pdftotext', ['-l', '2', '-q', p, '-']));
    else if (r.cls === 'txt') { t = readFileSync(p).subarray(0, 3072).toString('utf8'); if (/^x?html?$|^xml$/.test(r.ext)) t = t.replace(/<[^>]+>/g, ' '); }
    else if (r.cls === 'docx' && r.size < 150e6) { const m = (await import('mammoth')).default; t = clean((await m.extractRawText({ path: p })).value).slice(0, 1500); }
    else if (r.cls === 'epub' && r.ext === 'epub' && r.size < 150e6) {
      const Z = (await import('jszip')).default, z = await Z.loadAsync(readFileSync(p));
      for (const n of Object.keys(z.files).filter((n) => /\.(x?html?)$/i.test(n)).sort()) {
        const x = (await z.files[n].async('string')).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
        if (x.replace(/\s+/g, ' ').trim().length > 300) { t = clean(x.replace(/[ \t]+/g, ' ')).slice(0, 1500); break; }
      }
    }
  } catch { t = ''; }
  t = (t || '').slice(0, 4000) || '(no text extracted)'; d.prepare('INSERT OR REPLACE INTO text VALUES(?,?)').run(r.id, t); return t;
}
function decide(a, body) {
  const d = db(a), v = body.dec, now = new Date().toISOString();
  if (!['import', 'skip', 'hold', 'clear', 'accept'].includes(v)) throw Object.assign(new Error('bad decision'), { status: 400 });
  let rows;
  if (Array.isArray(body.ids)) rows = body.ids.length ? d.prepare(`SELECT id,dec,dec_by,dec_at,sug,cls FROM files WHERE id IN (${body.ids.map(() => '?').join(',')})`).all(...body.ids.map(Number)) : [];
  else { const [w, p] = where(body.filter); rows = d.prepare(`SELECT id,dec,dec_by,dec_at,sug,cls FROM files ${w}`).all(...p); }
  const up = d.prepare('UPDATE files SET dec=?,dec_by=?,dec_at=? WHERE id=?'), kind = (c) => (isMedia(c) ? 'import_media' : 'import_book');
  let n = 0;
  d.transaction(() => {
    d.prepare('INSERT INTO actions(ts,what,prev) VALUES(?,?,?)').run(now, `${v} x${rows.length}`, JSON.stringify(rows.map((r) => [r.id, r.dec, r.dec_by, r.dec_at])));
    for (const r of rows) {
      let nv = v === 'import' ? kind(r.cls) : v === 'clear' ? null : v;
      if (v === 'accept') { if (r.dec || !r.sug || r.sug === 'look') continue; nv = r.sug === 'import' ? kind(r.cls) : 'skip'; }
      up.run(nv, nv ? 'chad' : null, nv ? now : null, r.id); n++;
    }
  })();
  return { changed: n };
}
function undo(a) {
  const d = db(a), x = d.prepare('SELECT * FROM actions WHERE undone=0 ORDER BY id DESC LIMIT 1').get(); if (!x) return { undone: 0 };
  const prev = JSON.parse(x.prev), up = d.prepare('UPDATE files SET dec=?,dec_by=?,dec_at=? WHERE id=?');
  d.transaction(() => { for (const [id, dec, by, at] of prev) up.run(dec, by, at, id); d.prepare('UPDATE actions SET undone=1 WHERE id=?').run(x.id); })();
  return { undone: prev.length, what: x.what };
}
const exists = (p) => { try { lstatSync(p); return true; } catch { return false; } };
// Hard link (same ZFS pool, so Dewey's realpath root check passes and no space is used); symlink only as fallback.
function importNow(a, dry) {
  const d = db(a), rows = d.prepare("SELECT * FROM files WHERE dec LIKE 'import_%' AND imported=0").all();
  const out = { media: 0, books: 0, linked: 0, existed: 0, errors: 0, dry: !!dry, samples: [] };
  const done = d.prepare('UPDATE files SET imported=1,import_note=? WHERE id=?'), now = new Date().toISOString();
  for (const r of rows) {
    const media = r.dec === 'import_media', dest = media ? join(DEWEY, 'media', 'golden-age-approved', r.rel) : join(DEWEY, 'new', '_add-anyway', 'golden-age', r.rel);
    if (media) out.media++; else out.books++;
    if (out.samples.length < 5) out.samples.push(dest);
    if (dry) continue;
    try {
      if (exists(dest)) { out.existed++; done.run('already present', r.id); continue; }
      mkdirSync(dirname(dest), { recursive: true });
      let how = 'hardlink'; try { linkSync(absOf(a, r.rel), dest); } catch { symlinkSync(absOf(a, r.rel), dest); how = 'symlink'; }
      writeFileSync(`${dest}.source.json`, JSON.stringify({ provider: 'golden-age', origin: 'GOLDEN AGE portable drive', archive: a, original_path: absOf(a, r.rel), rel_path: r.rel, kind: media ? 'media' : 'book', title: r.title || null, artist: r.artist || null, year: r.year || null, duration: r.dur || null, bytes: r.size, approval: 'approved by Chad via archive-sifter', approved_at: r.dec_at || now, imported_at: now, suggestion: r.sug ? `${r.sug}: ${r.why}` : null }, null, 1));
      out.linked++; done.run(how, r.id);
    } catch (e) { out.errors++; d.prepare('UPDATE files SET imported=0,import_note=? WHERE id=?').run(`error: ${e.message}`, r.id); }
  }
  return out;
}
function progress(a, folder) {
  const [w, p] = where({ folder });
  return db(a).prepare(`SELECT COUNT(*) total, SUM(dec IS NOT NULL) decided, SUM(imported=1) imported, SUM(sug='import' AND dec IS NULL) s_import, SUM(sug='skip' AND dec IS NULL) s_skip, SUM(sug='look' AND dec IS NULL) s_look, SUM(size) bytes FROM files ${w}`).get(...p);
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const path = u.pathname;
  try {
    if (path === '/login' && req.method === 'POST') { const b = await readBody(req); if (!ok(b.token)) return send(res, 401, { error: 'bad token' }); res.setHeader('set-cookie', `as_tok=${encodeURIComponent(TOKEN)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`); return send(res, 200, { ok: true }); }
    if (path === '/' || path === '/index.html') return send(res, 200, readFileSync(join(HERE, 'public', 'index.html')), 'text/html; charset=utf-8');
    if (!(ok(cookie(req).as_tok) || ok(req.headers['x-token']))) return send(res, 401, { error: 'login required' });
    let m;
    if (path === '/api/archives') return send(res, 200, archives().map((a) => ({ name: a, ...progress(a), scan: status[a] || null, last_scan: db(a).prepare("SELECT v FROM meta WHERE k='last_scan'").pluck().get() })));
    if ((m = /^\/raw\/([^/]+)\/(\d+)$/.exec(path))) { const a = decodeURIComponent(m[1]), r = db(a).prepare('SELECT rel,ext FROM files WHERE id=?').get(m[2]); if (!r) return send(res, 404, { error: 'no file' }); return stream(req, res, absOf(a, r.rel), r.ext); }
    if ((m = /^\/api\/([^/]+)\/([a-z]+)(?:\/(\d+))?$/.exec(path))) {
      const a = decodeURIComponent(m[1]), act = m[2], id = m[3], d = db(a);
      if (act === 'tree') return send(res, 200, d.prepare("SELECT folder, COUNT(*) n, SUM(sug='import' AND dec IS NULL) si, SUM(sug='skip' AND dec IS NULL) ss, SUM(sug='look' AND dec IS NULL) sl, SUM(dec IS NOT NULL) d FROM files GROUP BY folder").all());
      if (act === 'progress') return send(res, 200, { all: progress(a), folder: u.searchParams.get('folder') ? progress(a, u.searchParams.get('folder')) : null, scan: status[a] || null });
      if (act === 'files' || act === 'ids') {
        const f = JSON.parse(u.searchParams.get('f') || '{}'), [w, p] = where(f);
        if (act === 'ids') return send(res, 200, d.prepare(`SELECT id FROM files ${w} LIMIT 300000`).pluck().all(...p));
        const sort = SORTS[f.sort] || 'folder', dir = f.desc ? 'DESC' : 'ASC', off = Math.max(0, Number(f.offset) || 0);
        return send(res, 200, { total: d.prepare(`SELECT COUNT(*) FROM files ${w}`).pluck().get(...p), rows: d.prepare(`SELECT ${ROWCOLS} FROM files ${w} ORDER BY ${sort} ${dir}, rel LIMIT 200 OFFSET ?`).all(...p, off) });
      }
      if (act === 'file' && id) { const r = d.prepare('SELECT * FROM files WHERE id=?').get(id); if (!r) return send(res, 404, { error: 'no file' }); r.near = r.near ? JSON.parse(r.near) : []; return send(res, 200, r); }
      if (act === 'preview' && id) { const r = d.prepare('SELECT id,rel,cls,ext,size FROM files WHERE id=?').get(id); return send(res, 200, { text: ['pdf', 'txt', 'docx', 'epub'].includes(r.cls) ? await preview(a, r) : null }); }
      if (act === 'decide' && req.method === 'POST') return send(res, 200, decide(a, await readBody(req)));
      if (act === 'undo' && req.method === 'POST') return send(res, 200, undo(a));
      if (act === 'scan' && req.method === 'POST') { scan(a); return send(res, 200, status[a]); }
      if (act === 'resuggest' && req.method === 'POST') { await suggest(a); return send(res, 200, { ok: true }); }
      if (act === 'import' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, importNow(a, !b.confirm)); }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: String(e.message || e) }); else res.end(); }
});
server.listen(PORT, HOST, () => console.log(`archive-sifter on http://${HOST}:${PORT}`));
// background incremental scan: now, then 10 min after each finish (the copy is still running)
const tick = async () => { for (const a of archives()) await scan(a).catch(() => {}); setTimeout(tick, 600e3); };
setTimeout(tick, 2000);
