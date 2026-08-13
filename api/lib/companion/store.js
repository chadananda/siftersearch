// Companion persistence (§2.2, §6, §7, §8, §10, §11) over the USER db — directly writable by the API,
// no single-writer bottleneck. Relationship stage + consent, consent-scoped memory, expiring premise
// hypotheses, global dial overrides, the exposure/outcome log, and course enrollment/progress.
// Every write here is per-user interaction data the user can inspect, correct, pause, export, and delete.
import { userQuery, userQueryOne, userQueryAll } from '../db.js';
import { logger } from '../logger.js';

const now = () => Math.floor(Date.now() / 1000);

// ── Relationship + consent ─────────────────────────────────────────────────────
export async function getRelationship(participantId) {
  if (!participantId) return null;
  let r = await userQueryOne('SELECT * FROM companion_relationship WHERE participant_id = ?', [participantId]).catch(() => null);
  if (!r) {
    await userQuery('INSERT OR IGNORE INTO companion_relationship (participant_id) VALUES (?)', [participantId]).catch(() => {});
    r = await userQueryOne('SELECT * FROM companion_relationship WHERE participant_id = ?', [participantId]).catch(() => null);
  }
  return r;
}

export async function setStage(participantId, stage) {
  await userQuery('UPDATE companion_relationship SET stage = ?, updated_at = ? WHERE participant_id = ?', [stage, now(), participantId]).catch(() => {});
}

export async function setConsent(participantId, { memory, contact } = {}) {
  const sets = []; const args = [];
  if (memory != null) { sets.push('consent_memory = ?'); args.push(memory ? 1 : 0); }
  if (contact != null) { sets.push('consent_contact = ?'); args.push(contact ? 1 : 0); }
  if (!sets.length) return;
  args.push(now(), participantId);
  await userQuery(`UPDATE companion_relationship SET ${sets.join(', ')}, updated_at = ? WHERE participant_id = ?`, args).catch(() => {});
}

// Per-participant dial overrides (the 'preference' precedence layer). Stored on the relationship row.
export async function setParticipantDials(participantId, dials) {
  await userQuery('UPDATE companion_relationship SET dials_json = ?, updated_at = ? WHERE participant_id = ?',
    [JSON.stringify(dials || {}), now(), participantId]).catch(() => {});
}
export function parseDials(rel) { try { return JSON.parse(rel?.dials_json || '{}'); } catch { return {}; } }

// ── Global dial overrides (admin, §10) ─────────────────────────────────────────
export async function getGlobalDials() {
  const rows = await userQueryAll('SELECT dial_key, value FROM companion_dials_global').catch(() => []);
  const out = {};
  for (const r of rows) { let v = r.value; if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v); out[r.dial_key] = v; }
  return out;
}
export async function setGlobalDial(key, value, by = 'admin') {
  await userQuery(`INSERT INTO companion_dials_global (dial_key, value, updated_by, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(dial_key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    [key, String(value), by, now()]).catch((e) => logger.warn({ err: e.message }, 'setGlobalDial failed'));
}

// ── Consent-scoped memory (§7.1) — only persists when consent_memory is on ──────
export async function addMemory(participantId, { kind, content, thread_id = null, source_ref = null, confidence = null, ttlHours = null }) {
  const expires = ttlHours ? now() + ttlHours * 3600 : null;
  await userQuery(`INSERT INTO companion_memory (participant_id, kind, content, thread_id, source_ref, confidence, expires_at)
    VALUES (?,?,?,?,?,?,?)`, [participantId, kind, String(content).slice(0, 2000), thread_id, source_ref, confidence, expires]).catch(() => {});
}
export async function getMemory(participantId, { includeExpired = false } = {}) {
  const rows = await userQueryAll('SELECT * FROM companion_memory WHERE participant_id = ? AND corrected = 0 ORDER BY created_at DESC LIMIT 200', [participantId]).catch(() => []);
  return includeExpired ? rows : rows.filter((r) => !r.expires_at || r.expires_at > now());
}
// Correction (§7.2) — invalidate memory/premises that conflict with an explicit user correction.
export async function applyCorrection(participantId, { memoryIds = [], premiseIds = [] }) {
  for (const id of memoryIds) await userQuery('UPDATE companion_memory SET corrected = 1 WHERE id = ? AND participant_id = ?', [id, participantId]).catch(() => {});
  for (const id of premiseIds) await userQuery('UPDATE companion_premise SET status = ? WHERE id = ? AND participant_id = ?', ['rejected', id, participantId]).catch(() => {});
}

// ── Premise hypotheses (§6) ─────────────────────────────────────────────────────
export async function addPremise(participantId, p) {
  const expires = p.expires_at_hours ? now() + p.expires_at_hours * 3600 : now() + 72 * 3600;
  await userQuery(`INSERT INTO companion_premise (participant_id, statement, category, status, confidence, context, expires_at)
    VALUES (?,?,?,?,?,?,?)`, [participantId, p.statement, p.category, p.status || 'hypothesis', p.confidence ?? 0.5, p.context || '', expires]).catch(() => {});
}
export async function getPremises(participantId) {
  return (await userQueryAll('SELECT * FROM companion_premise WHERE participant_id = ? AND status != ? ORDER BY created_at DESC LIMIT 50', [participantId, 'rejected']).catch(() => []))
    .filter((r) => !r.expires_at || r.expires_at > now());
}

// ── Exposure/outcome log (§11) — immutable append; the "why this response" record ──
export async function logExposure(e) {
  await userQuery(`INSERT INTO companion_exposure (participant_id, thread_id, mode, intervention, challenge_level, authority_classes, plan_json, policy_version)
    VALUES (?,?,?,?,?,?,?,?)`,
    [e.participant_id || null, e.thread_id || null, e.mode || null, e.intervention || null, e.challenge_level ?? null,
      JSON.stringify(e.authority_classes || []), JSON.stringify(e.plan || {}).slice(0, 20000), e.policy_version || null]).catch(() => {});
}
export async function lastExposure(participantId) {
  return userQueryOne('SELECT * FROM companion_exposure WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1', [participantId]).catch(() => null);
}
// How real is this inquiry? (turns already accompanied) — gates the offer to remember, so a first
// question is never met with a request to store anything.
export async function exposureCount(participantId) {
  if (!participantId) return 0;
  return (await userQueryOne('SELECT COUNT(*) AS n FROM companion_exposure WHERE participant_id = ?', [participantId]).catch(() => null))?.n ?? 0;
}
// Did we already ask "remember this?" recently? Asking again is pressure, so once per cooldown only.
// The plan is the record of what was offered, so the exposure log answers this without a new table.
export async function memoryOfferedRecently(participantId, withinHours = 168) {
  if (!participantId) return false;
  // created_at is an epoch INTEGER — a datetime('now',…) string comparison here silently matches
  // nothing, which would make the companion re-ask on every single turn.
  const r = await userQueryOne(
    `SELECT 1 AS hit FROM companion_exposure
      WHERE participant_id = ? AND plan_json LIKE '%S09_INQUIRY_MAP%'
        AND created_at > unixepoch() - ? LIMIT 1`,
    [participantId, Math.round(withinHours * 3600)]).catch(() => null);
  return !!r?.hit;
}

// ── Courses (§8) ────────────────────────────────────────────────────────────────
export async function enroll(participantId, trackId) {
  await userQuery('INSERT OR IGNORE INTO companion_enrollment (participant_id, track_id) VALUES (?,?)', [participantId, trackId]).catch(() => {});
  return userQueryOne('SELECT * FROM companion_enrollment WHERE participant_id = ? AND track_id = ?', [participantId, trackId]).catch(() => null);
}
export async function getEnrollments(participantId) {
  return userQueryAll('SELECT * FROM companion_enrollment WHERE participant_id = ? AND status = ?', [participantId, 'active']).catch(() => []);
}
export async function recordProgress(enrollmentId, { sectionId, understood = 0, note = null }) {
  await userQuery('INSERT INTO companion_progress (enrollment_id, section_id, understood, note) VALUES (?,?,?,?)', [enrollmentId, sectionId, understood ? 1 : 0, note]).catch(() => {});
}

// ── Transparency (§1, §7.4) — full inspectable view + hard delete (§14 Deletion) ──
export async function inquiryMap(participantId) {
  const [rel, memory, premises, enrollments, exposures] = await Promise.all([
    getRelationship(participantId), getMemory(participantId), getPremises(participantId), getEnrollments(participantId),
    userQueryAll('SELECT mode, intervention, challenge_level, created_at FROM companion_exposure WHERE participant_id = ? ORDER BY created_at DESC LIMIT 25', [participantId]).catch(() => []),
  ]);
  return { relationship: rel, memory, premises, enrollments, recent_exposures: exposures };
}
export async function deleteParticipant(participantId) {
  for (const t of ['companion_memory', 'companion_premise', 'companion_exposure', 'companion_progress', 'companion_enrollment', 'companion_relationship']) {
    await userQuery(`DELETE FROM ${t} WHERE participant_id = ?`, [participantId]).catch(() => {});
  }
  // progress rows are keyed by enrollment; a defensive sweep of orphans
  await userQuery('DELETE FROM companion_progress WHERE enrollment_id NOT IN (SELECT id FROM companion_enrollment)', []).catch(() => {});
}
