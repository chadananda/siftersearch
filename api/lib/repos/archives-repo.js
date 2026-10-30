// archives-repo — donors, drives (custody) and intake_items (migration 189). Re-cataloguing refreshes catalogue fields but NEVER Chad's decisions/imports.
// Callers: ops/archive-adopt-job.js, routes/imports.js (/admin/imports). Deps: db.js.
import { query, queryOne, queryAll, transaction } from '../db.js';

const now = () => new Date().toISOString();
const DRIVE_ID = /^[a-z0-9-]{2,40}$/;
const STATUSES = ['received', 'copying', 'cataloged', 'reviewing', 'importing', 'imported', 'returned'];
const DECISIONS = ['approve', 'deny', 'more_info'];
const json = (v) => (v == null ? null : JSON.stringify(v));
const parseItem = (r) => (r ? { ...r, rel_paths: r.rel_paths ? JSON.parse(r.rel_paths) : [], metadata: r.metadata ? JSON.parse(r.metadata) : null } : null);

export async function upsertDonor({ id, name, contact = null, mail_address = null, notes = null }) {
  if (!id || !name) throw new Error('donor needs id and name');
  const t = now();
  await query(`INSERT INTO donors (id, name, contact, mail_address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, contact = COALESCE(excluded.contact, donors.contact), mail_address = COALESCE(excluded.mail_address, donors.mail_address),
      notes = COALESCE(excluded.notes, donors.notes), updated_at = excluded.updated_at`, [id, name, contact, mail_address, notes, t, t], 'archives:donor-upsert');
  return getDonor(id);
}
export const getDonor = (id) => queryOne('SELECT * FROM donors WHERE id = ?', [id], 'archives:donor-get');
export const listDonors = () => queryAll('SELECT * FROM donors ORDER BY name', [], 'archives:donor-list');

export async function upsertDrive({ id, donor_id, label = null, source = null, root = null, status = null, files = null, bytes = null, notes = null }) {
  if (!DRIVE_ID.test(id || '')) throw new Error(`bad drive id: ${id}`);
  if (!donor_id) throw new Error('drive needs donor_id');
  if (status && !STATUSES.includes(status)) throw new Error(`bad status: ${status}`);
  const t = now();
  await query(`INSERT INTO drives (id, donor_id, label, source, root, status, files, bytes, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET donor_id = excluded.donor_id, label = COALESCE(excluded.label, drives.label), source = COALESCE(excluded.source, drives.source),
      root = COALESCE(excluded.root, drives.root), status = COALESCE(excluded.status, drives.status), files = COALESCE(excluded.files, drives.files),
      bytes = COALESCE(excluded.bytes, drives.bytes), notes = COALESCE(excluded.notes, drives.notes), updated_at = excluded.updated_at`,
  [id, donor_id, label, source, root, status || 'received', files, bytes, notes, t, t], 'archives:drive-upsert');
  return getDrive(id);
}
export const getDrive = (id) => queryOne('SELECT * FROM drives WHERE id = ?', [id], 'archives:drive-get');
export const listDrives = ({ donorId } = {}) => donorId
  ? queryAll('SELECT * FROM drives WHERE donor_id = ? ORDER BY created_at', [donorId], 'archives:drive-list')
  : queryAll('SELECT * FROM drives ORDER BY created_at', [], 'archives:drive-list');

export async function setCustody(id, f = {}) {
  if (f.status && !STATUSES.includes(f.status)) throw new Error(`bad status: ${f.status}`);
  const cols = ['status', 'received_at', 'copied_at', 'verified_at', 'returned_at'].filter((c) => f[c] != null);
  if (cols.length) await query(`UPDATE drives SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => f[c]), now(), id], 'archives:drive-custody');
  return getDrive(id);
}

export async function upsertItems(driveId, items, { batch = 500 } = {}) {
  const t = now();
  let n = 0;
  for (let i = 0; i < items.length; i += batch) {
    const sts = items.slice(i, i + batch).map((x) => ({ sql: `INSERT INTO intake_items (drive_id, kind, section, title, creator, year, lang, primary_rel, rel_paths, files, bytes, duration_s,
        match, match_ref, score, why, destination, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(drive_id, primary_rel) DO UPDATE SET kind = excluded.kind, section = excluded.section, title = excluded.title, creator = excluded.creator, year = excluded.year,
        lang = excluded.lang, rel_paths = excluded.rel_paths, files = excluded.files, bytes = excluded.bytes, duration_s = excluded.duration_s, match = excluded.match,
        match_ref = excluded.match_ref, score = excluded.score, why = excluded.why, destination = excluded.destination, metadata = excluded.metadata, updated_at = excluded.updated_at`,
    args: [driveId, x.kind ?? null, x.section ?? null, x.title ?? null, x.creator ?? null, x.year ?? null, x.lang ?? null, x.primary_rel, json(x.rel_paths), x.files ?? null, x.bytes ?? null,
      x.duration_s ?? null, x.match ?? null, x.match_ref ?? null, x.score ?? null, x.why ?? null, x.destination ?? null, json(x.metadata), t, t] }));
    await transaction(sts, 'archives:items-upsert');
    n += sts.length;
  }
  return n;
}

/** Undecided, unimported items a re-catalogue no longer produced (its upsert stamped everything else at or after `before`). Decisions are never deleted. */
export async function pruneStale(driveId, before) {
  const r = await query('DELETE FROM intake_items WHERE drive_id = ? AND updated_at < ? AND decision IS NULL AND imported_at IS NULL', [driveId, before], 'archives:items-prune');
  return r?.changes ?? r?.rows?.[0]?.changes ?? 0;
}

/** Filters: section, kind, match (one or a comma list), decision ('undecided' = none yet), q (title/creator/path substring). Sorted score desc. */
export async function listItems(driveId, { section, kind, match, decision, q, limit = 200, offset = 0 } = {}) {
  const w = ['drive_id = ?'], p = [driveId];
  if (section) { w.push('section = ?'); p.push(section); }
  if (kind) { w.push('kind = ?'); p.push(kind); }
  const matches = (Array.isArray(match) ? match : String(match ?? '').split(',')).map((m) => m.trim()).filter(Boolean);
  if (matches.length) { w.push(`match IN (${matches.map(() => '?').join(', ')})`); p.push(...matches); }
  if (decision === 'undecided') w.push('decision IS NULL'); else if (decision) { w.push('decision = ?'); p.push(decision); }
  const needle = String(q ?? '').trim();
  if (needle) { w.push("(title LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\' OR primary_rel LIKE ? ESCAPE '\\')"); const l = `%${needle.replace(/[\\%_]/g, (c) => '\\' + c)}%`; p.push(l, l, l); }
  const rows = await queryAll(`SELECT * FROM intake_items WHERE ${w.join(' AND ')} ORDER BY score DESC, id LIMIT ? OFFSET ?`, [...p, Math.min(Number(limit) || 200, 1000), Number(offset) || 0], 'archives:items-list');
  return rows.map(parseItem);
}

export const itemCounts = (driveId) => queryAll(`SELECT section, kind, match, decision, COUNT(*) AS n, SUM(files) AS files, SUM(bytes) AS bytes FROM intake_items WHERE drive_id = ?
  GROUP BY section, kind, match, decision`, [driveId], 'archives:item-counts');

export async function decideItem(id, { decision, note = null, by = null }) {
  if (decision != null && !DECISIONS.includes(decision)) throw new Error(`bad decision: ${decision}`);
  await query('UPDATE intake_items SET decision = ?, decision_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?', [decision ?? null, note, by, decision ? now() : null, now(), id], 'archives:item-decide');
  return getItem(id);
}
export const getItem = async (id) => parseItem(await queryOne('SELECT * FROM intake_items WHERE id = ?', [id], 'archives:item-get'));

/** One decision for many items in one transaction (bulk approve/deny of a page). Returns the distinct ids sent. */
export async function decideItems(ids, { decision, note = null, by = null }) {
  if (decision != null && !DECISIONS.includes(decision)) throw new Error(`bad decision: ${decision}`);
  const clean = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) return 0;
  const t = now(), sts = [];
  for (let i = 0; i < clean.length; i += 500) {
    const chunk = clean.slice(i, i + 500);
    sts.push({ sql: `UPDATE intake_items SET decision = ?, decision_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      args: [decision ?? null, note, by, decision ? t : null, t, ...chunk] });
  }
  await transaction(sts, 'archives:items-decide-bulk');
  return clean.length;
}

export async function driveReport(driveId) {
  const drive = await getDrive(driveId);
  if (!drive) return null;
  const [donor, imported, counts] = await Promise.all([getDonor(drive.donor_id),
    queryAll('SELECT * FROM intake_items WHERE drive_id = ? AND imported_at IS NOT NULL ORDER BY kind, title', [driveId], 'archives:report-imported'), itemCounts(driveId)]);
  return { drive, donor, imported: imported.map(parseItem), counts };
}
