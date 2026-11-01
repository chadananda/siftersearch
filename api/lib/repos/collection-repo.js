// collection-repo — one SQLite file per donor collection: <ARCHIVES_DIR|/tank/archives>/<drive>.data/collection.db (+ md/<id>.md converted text, sample/<id>.txt pre-OCR sample, slp/<id>/ OCR output).
// ONE row per file (fingerprints, metadata from every source, cluster + best copy, holdings evidence, our decision) + FTS5 over the Markdown body. WRITTEN only by archive jobs in the reports
// service (one writer per file); everything else reads through the `archive-search` ops report. Cross-collection reads open every other *.collection.db read-only. Deps: better-sqlite3.
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const archivesDir = () => process.env.ARCHIVES_DIR || '/tank/archives';
export const dataDir = (drive) => join(archivesDir(), `${String(drive).replace(/[^\w.-]/g, '_')}.data`);
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS collection (drive TEXT PRIMARY KEY, donor TEXT, label TEXT, source TEXT, copied_at TEXT, files INTEGER, bytes INTEGER, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, item_id INTEGER, size INTEGER, mtime TEXT, sha256 TEXT, fmt TEXT, mime TEXT, pages INTEGER, words INTEGER,
    text_layer INTEGER, scan INTEGER, cls TEXT, title TEXT, title_norm TEXT, author TEXT, year TEXT, language TEXT, isbn TEXT, meta TEXT, norm_sha TEXT, minhash TEXT, md_path TEXT, sample_path TEXT,
    slp_path TEXT, converter TEXT, converted_at TEXT, cluster_id TEXT, best INTEGER, dup_step TEXT, dup_score REAL, dup_of TEXT, holdings TEXT, decision TEXT, decided_by TEXT, decided_at TEXT,
    imported_doc_id INTEGER, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS i_sha ON files(sha256)`, `CREATE INDEX IF NOT EXISTS i_norm ON files(norm_sha)`, `CREATE INDEX IF NOT EXISTS i_title ON files(title_norm)`, `CREATE INDEX IF NOT EXISTS i_cluster ON files(cluster_id)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS body USING fts5(title, text, tokenize='unicode61 remove_diacritics 2')`,   // rowid = files.id
];
const COLS = ['item_id', 'size', 'mtime', 'sha256', 'fmt', 'mime', 'pages', 'words', 'text_layer', 'scan', 'cls', 'title', 'title_norm', 'author', 'year', 'language', 'isbn', 'meta', 'norm_sha', 'minhash',
  'md_path', 'sample_path', 'slp_path', 'converter', 'converted_at', 'cluster_id', 'best', 'dup_step', 'dup_score', 'dup_of', 'holdings', 'decision', 'decided_by', 'decided_at', 'imported_doc_id',
  'verdict', 'verdict_by', 'verdict_at', 'verdict_why', 'imported_at'];
// columns added after the first release: ensured on every open (decision* = Chad's approval; verdict* = what the import did with it: import | skip | leave)
const LATER = ['verdict', 'verdict_by', 'verdict_at', 'verdict_why', 'imported_at'];
const enc = (v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? +v : v);

/** Open a collection's db (created with its folders unless readonly). The caller closes it. */
export function openCollection(drive, { readonly = false } = {}) {
  const dir = dataDir(drive), file = join(dir, 'collection.db');
  if (readonly) return existsSync(file) ? new Database(file, { readonly: true, fileMustExist: true }) : null;
  mkdirSync(join(dir, 'md'), { recursive: true }); mkdirSync(join(dir, 'sample'), { recursive: true }); mkdirSync(join(dir, 'slp'), { recursive: true });
  const db = new Database(file); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
  for (const s of SCHEMA) db.exec(s);
  const have = new Set(db.prepare('PRAGMA table_info(files)').all().map((c) => c.name));
  for (const c of LATER) if (!have.has(c)) db.exec(`ALTER TABLE files ADD COLUMN ${c} TEXT`);
  return db;
}
const using = (drive, fn, opts) => { const db = openCollection(drive, opts); if (!db) return null; try { return fn(db); } finally { db.close(); } };

/** Insert/refresh one file's row by path (only the fields given change) → its id. */
export function upsertFile(drive, r) {
  return using(drive, (db) => {
    const now = new Date().toISOString(), given = COLS.filter((c) => r[c] !== undefined);
    const has = db.prepare('SELECT id FROM files WHERE path = ?').get(r.path);
    if (!has) return db.prepare(`INSERT INTO files (path, updated_at${given.map((c) => `, ${c}`).join('')}) VALUES (?, ?${given.map(() => ', ?').join('')})`).run(r.path, now, ...given.map((c) => enc(r[c]))).lastInsertRowid;
    if (given.length) db.prepare(`UPDATE files SET updated_at = ?${given.map((c) => `, ${c} = ?`).join('')} WHERE id = ?`).run(now, ...given.map((c) => enc(r[c])), has.id);
    return has.id;
  });
}

/** Write the converted Markdown (frontmatter: source path, sha256, format, converter, date) to md/<id>.md and index it; or a scan's pre-OCR sample to sample/<id>.txt. */
export function saveBody(drive, path, { md = null, sample = null, converter = null, title = null } = {}) {
  const id = upsertFile(drive, { path }), dir = dataDir(drive), at = new Date().toISOString();
  return using(drive, (db) => {
    const f = db.prepare('SELECT sha256, fmt FROM files WHERE id = ?').get(id), patch = {};
    if (md != null) {
      const front = `---\nsource: ${JSON.stringify(path)}\nsha256: ${f.sha256 || ''}\nformat: ${f.fmt || ''}\nconverter: ${JSON.stringify(converter || '')}\nconverted: ${at}\n---\n\n`;
      writeFileSync(join(dir, 'md', `${id}.md`), front + md);
      db.prepare('DELETE FROM body WHERE rowid = ?').run(id); db.prepare('INSERT INTO body (rowid, title, text) VALUES (?, ?, ?)').run(id, title || path, md);
      patch.md_path = `md/${id}.md`; patch.converter = converter; patch.converted_at = at;
    }
    if (sample != null) { writeFileSync(join(dir, 'sample', `${id}.txt`), sample); patch.sample_path = `sample/${id}.txt`; }
    const keys = Object.keys(patch);
    if (keys.length) db.prepare(`UPDATE files SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k]), id);
    return id;
  });
}

/** Mirror a drive's catalogue items into its collection (rows by path; the catalogue's title/author/year/language + sizes). Idempotent. → count */
export function syncItems(drive, d, items) {
  return using(drive, (db) => {
    db.prepare('INSERT INTO collection (drive, donor, label, source, copied_at, files, bytes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(drive) DO UPDATE SET donor = excluded.donor, label = excluded.label, source = excluded.source, files = excluded.files, bytes = excluded.bytes, updated_at = excluded.updated_at')
      .run(drive, d?.donor_id ?? null, d?.label ?? null, d?.source ?? null, d?.copied_at ?? null, d?.files ?? null, d?.bytes ?? null, new Date().toISOString());
    return items.length;
  }) && items.reduce((n, it) => {
    const cat = it.metadata?.catalog || {}, pr = it.metadata?.probe || {}, fp = pr.fp || {}, rec = it.sample?.rec || {};
    upsertFile(drive, { path: it.primary_rel, item_id: it.id, size: it.bytes ?? null, fmt: it.primary_rel.split('.').pop().toLowerCase(), pages: pr.pages ?? null, words: fp.words ?? null,
      text_layer: pr.class ? +(pr.class !== 'scan') : null, scan: pr.class ? +(pr.class === 'scan') : null, cls: pr.class ?? null, sha256: fp.sha256 ?? pr.sha256 ?? null, norm_sha: fp.norm_sha ?? null,
      title: cat.title || rec.title || it.title || null, author: cat.author || rec.creator || it.creator || null, year: String(cat.year || rec.year || it.year || '') || null, language: it.lang || null,
      meta: { catalog: cat || null, rec: rec.title || rec.creator ? { title: rec.title, creator: rec.creator } : null, pdf: pr.meta_text ? String(pr.meta_text).slice(0, 2000) : null },
      decision: it.decision ?? null, decided_by: it.decided_by ?? null, decided_at: it.decided_at ?? null,
      ...(it.imported_at ? { imported_at: it.imported_at } : {}), ...(/^\/document\/(\d+)$/.test(it.imported_ref || '') ? { imported_doc_id: +it.imported_ref.split('/')[2] } : {}) });
    return n + 1;
  }, 0);
}

/** Every fingerprint in EVERY collection (read-only), in the shape archives/dedup.js registryRow takes. */
export function allFingerprints() {
  const out = [];
  if (!existsSync(archivesDir())) return out;
  for (const n of readdirSync(archivesDir())) {
    if (!n.endsWith('.data')) continue;
    const drive = n.slice(0, -5), db = openCollection(drive, { readonly: true });
    if (!db) continue;
    try { for (const r of db.prepare('SELECT item_id, path, sha256, norm_sha, minhash, title, words, pages, size AS bytes, cls FROM files WHERE sha256 IS NOT NULL').iterate()) out.push({ drive_id: drive, ...r }); }
    finally { db.close(); }
  }
  return out;
}

/** Record a clustering run's result on this collection's rows: dups = Map(key 'drive:path' → { of, step, score }), clusters = [{ keep, members:[{key}] }]. */
export function applyClusters(drive, dups, clusters) {
  return using(drive, (db) => {
    const set = db.prepare('UPDATE files SET cluster_id = ?, best = ?, dup_step = ?, dup_score = ?, dup_of = ? WHERE path = ?'), pre = `${drive}:`;
    db.transaction(() => {
      db.prepare('UPDATE files SET cluster_id = NULL, best = NULL, dup_step = NULL, dup_score = NULL, dup_of = NULL').run();
      for (const c of clusters) for (const m of [c.keep, ...c.members.map((x) => x.key)]) {
        const k = typeof m === 'string' ? m : m?.key; if (!k?.startsWith(pre)) continue;
        const d = dups.get(k); set.run(c.keep.key || c.keep, d ? 0 : 1, d?.step ?? null, d?.score ?? null, d?.of ?? null, k.slice(pre.length));
      }
      for (const [k, d] of dups) if (k.startsWith(pre) && !d.of) db.prepare('UPDATE files SET dup_step = ?, dup_score = ?, dup_of = ? WHERE path = ?').run(d.step, d.score, d.of_rel, k.slice(pre.length));
    })();
    return clusters.length;
  });
}

/** Keep the holdings evidence (relation, overlaps, top 3 candidates) of one file (its row is created if the backfill has not yet). */
export const setHoldings = (drive, path, holdings) => upsertFile(drive, { path, holdings });

/** Paths whose fingerprint is complete (a MinHash; a scan has only its sha256 + pre-OCR sample) — what the re-probe skips. Read-only. */
export function fingerprintedPaths(drive) {
  const db = openCollection(drive, { readonly: true }), out = new Set();
  if (!db) return out;
  try { for (const r of db.prepare("SELECT path FROM files WHERE minhash IS NOT NULL OR (cls = 'scan' AND sha256 IS NOT NULL AND sample_path IS NOT NULL)").iterate()) out.add(r.path); } finally { db.close(); }
  return out;
}

/** The converted Markdown of a file, if its collection holds one → { id, md_path, file } (file = absolute path of md/<id>.md). Read-only. */
export function mdFor(drive, path) {
  const db = openCollection(drive, { readonly: true });
  if (!db) return null;
  try { const r = db.prepare('SELECT id, md_path FROM files WHERE path = ? AND md_path IS NOT NULL').get(path); return r && existsSync(join(dataDir(drive), r.md_path)) ? { ...r, file: join(dataDir(drive), r.md_path) } : null; } finally { db.close(); }
}

/** SearchLayerPDF's output for a file: slp/<id>/slp.md (+ receipt.json), and its Markdown becomes the file's md/<id>.md (the import staging copy). → row id */
export function recordSlp(drive, path, { markdown, receipt = null, title = null }) {
  const id = saveBody(drive, path, { md: markdown, converter: 'SearchLayerPDF', title }), dir = join(dataDir(drive), 'slp', String(id));
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'slp.md'), markdown);
  if (receipt) writeFileSync(join(dir, 'receipt.json'), JSON.stringify(receipt, null, 1));
  upsertFile(drive, { path, slp_path: `slp/${id}/slp.md` });
  return id;
}

/** The archive-sifter's own per-archive catalogue (<ARCHIVE_SIFTER_DATA|~/archive-sifter>/<drive>.db, read-only) → its book/document rows, or [] when there is none. */
export function sifterRows(drive) {
  const file = join(process.env.ARCHIVE_SIFTER_DATA || join(homedir(), 'archive-sifter'), `${String(drive).replace(/[^\w.-]/g, '_')}.db`);
  if (!existsSync(file)) return [];
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try { return db.prepare("SELECT rel, cls, size, mtime, fp, title, artist, year, sug, why, near, dec, dec_by, dec_at, imported, import_note FROM files WHERE cls IN ('pdf', 'docx', 'doc', 'epub', 'txt')").all(); } finally { db.close(); }
}

/** Fold the sifter's rows into the collection: existing rows gain size/mtime/title/author/year where empty and meta.sifter (fp, suggestion, decision); missing document rows are added. → { updated, added } */
export function mergeSifter(drive, rows) {
  return using(drive, (db) => {
    const get = db.prepare('SELECT id, size, title, author, year, meta FROM files WHERE path = ?'), now = new Date().toISOString(), out = { updated: 0, added: 0 };
    const put = db.transaction((chunk) => {
      for (const r of chunk) {
        const known = get.get(r.rel), sifter = { fp: r.fp, sug: r.sug, why: r.why, near: r.near, dec: r.dec, dec_by: r.dec_by, dec_at: r.dec_at, imported: r.imported, import_note: r.import_note };
        let meta = {}; try { meta = JSON.parse(known?.meta || '{}') || {}; } catch { /* keep {} */ }
        const f = { meta: JSON.stringify({ ...meta, sifter }), ...(known?.size == null && r.size != null ? { size: r.size } : {}), ...(!known && r.mtime ? { mtime: new Date(r.mtime * (r.mtime < 1e11 ? 1000 : 1)).toISOString() } : {}),
          ...(!known?.title && r.title ? { title: r.title } : {}), ...(!known?.author && r.artist ? { author: r.artist } : {}), ...(!known?.year && r.year ? { year: String(r.year) } : {}) }, keys = Object.keys(f);
        if (known) { db.prepare(`UPDATE files SET updated_at = ?${keys.map((k) => `, ${k} = ?`).join('')} WHERE id = ?`).run(now, ...keys.map((k) => f[k]), known.id); out.updated++; }
        else { db.prepare(`INSERT INTO files (path, updated_at, fmt${keys.map((k) => `, ${k}`).join('')}) VALUES (?, ?, ?${keys.map(() => ', ?').join('')})`).run(r.rel, now, r.rel.split('.').pop().toLowerCase(), ...keys.map((k) => f[k])); out.added++; }
      }
    });
    for (let i = 0; i < rows.length; i += 1000) put(rows.slice(i, i + 1000));
    return out;
  });
}

/** Search ACROSS collections (read-only): by text (FTS5), title, sha256 or cluster. → rows with drive, path, title, cluster, best, snippet. */
export function searchCollections({ q = null, title = null, sha = null, cluster = null, drive = null, limit = 50 } = {}) {
  const out = [];
  if (!existsSync(archivesDir())) return out;
  for (const n of readdirSync(archivesDir())) {
    if (!n.endsWith('.data') || (drive && n !== `${drive}.data`)) continue;
    const dr = n.slice(0, -5), db = openCollection(dr, { readonly: true });
    if (!db) continue;
    try {
      const cols = 'f.id, f.path, f.title, f.author, f.cls, f.pages, f.words, f.cluster_id, f.best, f.dup_step, f.dup_score, f.dup_of, f.sha256, f.md_path';
      const rows = q ? db.prepare(`SELECT ${cols}, snippet(body, 1, '[', ']', ' … ', 24) AS snippet FROM body JOIN files f ON f.id = body.rowid WHERE body MATCH ? ORDER BY rank LIMIT ?`).all(String(q).replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean).map((w) => `"${w}"`).join(' ') || '""', limit)
        : sha ? db.prepare(`SELECT ${cols} FROM files f WHERE sha256 = ? OR norm_sha = ? LIMIT ?`).all(sha, sha, limit)
        : cluster ? db.prepare(`SELECT ${cols} FROM files f WHERE cluster_id = ? LIMIT ?`).all(cluster, limit)
        : title ? db.prepare(`SELECT ${cols} FROM files f WHERE title LIKE ? OR path LIKE ? LIMIT ?`).all(`%${title}%`, `%${title}%`, limit) : [];
      for (const r of rows) out.push({ drive: dr, ...r });
    } finally { db.close(); }
  }
  return out.slice(0, limit);
}

/** Read one body's Markdown (for archive-import and tests). */
export const readMd = (drive, mdPath) => readFileSync(join(dataDir(drive), mdPath), 'utf8');
