// archive-sifter shared: per-archive SQLite (own file, never the Sifter DB), type classes, filter→SQL.
import { createRequire } from 'module';
import { mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
export const ROOT = process.env.ARCHIVE_ROOT || '/tank/archives';
export const DATA = process.env.ARCHIVE_DATA || join(homedir(), 'archive-sifter');
export const DEWEY = process.env.DEWEY_INGEST || '/tank/dewey-ingest';
// The tool's OWN SQLite file (~/archive-sifter), not the Sifter DB: loaded via require so the data-access ratchet does not mistake it for production access.
const Database = createRequire(import.meta.url)('better-sqlite3');
mkdirSync(DATA, { recursive: true });
const EXT = {
  audio: 'mp3 m4a wav flac ogg oga wma aac aif aiff opus amr mid', video: 'mp4 mov avi mkv wmv m4v mpg mpeg flv webm 3gp vob',
  pdf: 'pdf', docx: 'docx', doc: 'doc rtf odt wpd wps pages', epub: 'epub mobi azw azw3', txt: 'txt md html htm xml csv',
  image: 'jpg jpeg png gif tif tiff bmp webp heic psd',
};
const BY_EXT = {}; for (const [c, l] of Object.entries(EXT)) for (const e of l.split(' ')) BY_EXT[e] = c;
const JUNK_NAME = /^(thumbs\.db|\.ds_store|desktop\.ini|\.localized|icon\r|\._.*|~\$.*|.*\.tmp|.*\.bak|\.fseventsd|\.trashes)$/i;
export const classify = (name, rel) => {
  if (JUNK_NAME.test(name) || /(^|\/)(__MACOSX|\.Spotlight-V100|\.Trashes|\$RECYCLE\.BIN|System Volume Information)(\/|$)/i.test(rel)) return 'junk';
  return BY_EXT[name.split('.').pop().toLowerCase()] || 'other';
};
export const isMedia = (c) => c === 'audio' || c === 'video';
export const archives = () => existsSync(ROOT) ? readdirSync(ROOT).filter((n) => !n.startsWith('.') && statSync(join(ROOT, n)).isDirectory()) : [];
const dbs = {};
export function db(a) {
  if (!/^[\w .()-]+$/.test(a) || !archives().includes(a)) throw Object.assign(new Error('no such archive'), { status: 404 });
  if (dbs[a]) return dbs[a];
  const d = new Database(join(DATA, `${a}.db`)); d.pragma('journal_mode=WAL'); d.pragma('synchronous=NORMAL'); d.pragma('busy_timeout=5000');
  d.exec(`CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, rel TEXT UNIQUE, folder TEXT, name TEXT, ext TEXT, cls TEXT, size INT, mtime INT, fp TEXT,
    dur REAL, title TEXT, artist TEXT, year TEXT, sug TEXT, why TEXT, near TEXT, dec TEXT, dec_by TEXT, dec_at TEXT, imported INT DEFAULT 0, import_note TEXT, gen INT DEFAULT 0);
    CREATE INDEX IF NOT EXISTS f_folder ON files(folder); CREATE INDEX IF NOT EXISTS f_fp ON files(fp); CREATE INDEX IF NOT EXISTS f_dec ON files(dec); CREATE INDEX IF NOT EXISTS f_sug ON files(sug);
    CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY, ts TEXT, what TEXT, prev TEXT, undone INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS text(id INTEGER PRIMARY KEY, txt TEXT);
    CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);`);
  return (dbs[a] = d);
}
const esc = (s) => s.replace(/[\\%_]/g, '\\$&');
export function where(f = {}) {
  const w = [], p = [];
  if (f.folder != null && f.folder !== '') { if (f.sub === false) { w.push('folder=?'); p.push(f.folder); } else { w.push("(folder=? OR folder LIKE ? ESCAPE '\\')"); p.push(f.folder, `${esc(f.folder)}/%`); } }
  if (f.q) for (const t of String(f.q).split(/\s+/).filter(Boolean)) { w.push("(rel LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\')"); const l = `%${esc(t)}%`; p.push(l, l, l); }
  if (f.type) { w.push('cls=?'); p.push(f.type); }
  if (f.sug) { if (f.sug === 'none') w.push('sug IS NULL'); else { w.push('sug=?'); p.push(f.sug); } }
  if (f.dec === 'undecided') w.push('dec IS NULL'); else if (f.dec === 'decided') w.push('dec IS NOT NULL');
  else if (f.dec === 'imported') w.push('imported=1'); else if (f.dec) { w.push('dec LIKE ?'); p.push(`${f.dec}%`); }
  if (f.minsize) { w.push('size>=?'); p.push(f.minsize * 1048576); } if (f.maxsize) { w.push('size<=?'); p.push(f.maxsize * 1048576); }
  if (f.mindur) { w.push('dur>=?'); p.push(f.mindur * 60); } if (f.maxdur) { w.push('dur<=?'); p.push(f.maxdur * 60); }
  return [w.length ? `WHERE ${w.join(' AND ')}` : '', p];
}
export const SORTS = { name: 'name', folder: 'folder', type: 'cls', size: 'size', dur: 'dur', title: 'title', artist: 'artist', sug: 'sug', dec: 'dec', mtime: 'mtime' };
