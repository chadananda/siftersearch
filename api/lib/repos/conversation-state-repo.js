// conversation-state-repo — Anís conversation_state as append-only patches (anis_state_patches, migration 198). getConversationState folds a
// conversation's patches (units.js); appendStatePatch adds one, by 'jev' | 'code', with its turn and the next version. Deps: db.js, units.js.
import { query, queryAll } from '../db.js';
import { foldPatches, emptyState, sanitizePatch } from '../assistant/units.js';

const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };

/** Every patch of a conversation, oldest first (bounded by the conversation id and 500 rows). */
export async function listStatePatches(conversationId) {
  if (!conversationId) return [];
  return (await queryAll('SELECT turn, version, by, patch_json, created_at FROM anis_state_patches WHERE conversation_id = ? ORDER BY version LIMIT 500', [String(conversationId)], 'conv-state:list'))
    .map((r) => ({ turn: r.turn, version: r.version, by: r.by, created_at: r.created_at, patch: parse(r.patch_json) }));
}
/** The conversation's state: the fold of its patches (no rows or no id = the empty state, so old conversations keep working). */
export async function getConversationState(conversationId) {
  const rows = await listStatePatches(conversationId).catch(() => []);
  return rows.length ? foldPatches(rows) : emptyState();
}
/** Append one patch (re-validated by `by`; an empty patch is not stored). → the clean patch written, or null. */
export async function appendStatePatch({ conversationId, turn, by = 'code', patch }) {
  const clean = sanitizePatch(patch, by);
  if (!conversationId || !Object.keys(clean).length) return null;
  await query(`INSERT INTO anis_state_patches (conversation_id, turn, version, by, patch_json)
    SELECT ?, ?, COALESCE(MAX(version), 0) + 1, ?, ? FROM anis_state_patches WHERE conversation_id = ?`, [String(conversationId), Number(turn) || 0, by, JSON.stringify(clean), String(conversationId)], 'conv-state:append');
  return clean;
}
/** The patches stored for one turn (the trace: what changed this turn, and who changed it). */
export async function statePatchesForTurn(conversationId, turn) {
  return (await listStatePatches(conversationId)).filter((r) => r.turn === Number(turn));
}
