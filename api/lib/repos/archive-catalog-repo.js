// archive-catalog-repo — reads an archive-sifter catalogue (its OWN SQLite, e.g. ~/archive-sifter/golden-age.db) READ-ONLY, paged by id. Deps: better-sqlite3.
import Database from 'better-sqlite3';

const COLS = 'id, rel, folder, name, ext, cls, size, mtime, fp, dur, title, artist, year, sug, why, near';

export async function* readCatalog(path, { afterId = 0, limit = 5000 } = {}) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const st = db.prepare(`SELECT ${COLS} FROM files WHERE id > ? ORDER BY id LIMIT ?`);
    let last = afterId, rows;
    while ((rows = st.all(last, limit)).length) {
      for (const r of rows) yield r;
      last = rows[rows.length - 1].id;
    }
  } finally { db.close(); }
}
