// Dual-write from today's verbs (chat tools, mail verbs, uploads) into the job registry. The verbs behave exactly as before: these never throw,
// never count against caps, and the jobs are `quiet` (no extra notices) — they exist so status, the ops report and the audit see everything.
import { registry } from './registry.js';

const swallow = async (fn) => { try { return await fn(registry); } catch { return null; } };

/** A dewey_items row now being worked: follow it in the registry. */
export const trackItem = (item, { by = null, channel = 'chat' } = {}) => item?.id ? swallow((reg) => reg.startJob({ kind: 'intake', by, channel, params: { item_id: item.id, title: item.title || null },
  key: `intake:${item.id}`, itemId: item.id, notify: { quiet: true }, free: true })) : null;

/** A recording sent to the media pipeline (already queued by the verb): recorded as handed off. */
export const trackMedia = ({ url = null, path = null, run = null }, { by = null, channel = 'chat' } = {}) => swallow(async (reg) => {
  const r = await reg.startJob({ kind: 'media', by, channel, params: { url, path }, key: `media:${url || path}`, notify: { quiet: true }, free: true });
  if (r.job && r.created) await reg.advance(r.job.id, 'handed-off', { result: { outcome: 'media-queued', run, note: 'the media pipeline checks holdings, transcribes and publishes it at /media' } });
  return r;
});
