// The agent-visible job tools (chat + routes): fetch_url and the archive start used by upload finish. Each validates cheaply, enqueues a
// registry job and returns at once — long work is a job. Tower does no fetching here; a worker takes the order (jobs/worker.js).
import { registry } from './registry.js';
import { canonicalUrl, idemKey } from './registry.js';
import { parseTarget, isMediaPage, GuardError } from '../net-guard.js';
import { whoOf, isAdmin } from './policy.js';
import * as repo from '../../repos/dewey-jobs-repo.js';
import { wantsEmail } from './notify.js';

/** "Rights asserted" (Chad 10-28: nothing we handle is copyright-encumbered): explicit value wins, else on for operators. Caps and the quality gate still apply. */
export const rightsOf = (rights, by) => (rights === undefined || rights === null ? true : !!rights);
const swallow = async (p) => { try { return await p; } catch { return null; } };

/** Start fetching a web address (a file, an archive, or a media page handed to the media library). → { job_id, ... } | { error } */
export async function fetchUrl({ url, by, channel = 'chat', emailMe = false, rights }, { reg = registry, enqueue = null, rp = repo } = {}) {
  let u;
  try { u = parseTarget(url); } catch (e) { return { error: e instanceof GuardError ? `I will not fetch that address: ${e.message}.` : 'that does not look like a web address' }; }
  const pref = await swallow(rp.getFlag(`email-pref:${whoOf(by)}`));
  if (isMediaPage(u.toString())) {
    const q = enqueue || (await import('../../repos/ops-report-repo.js')).enqueue;
    const run = await q('media-scan', { urls: [u.toString()], paths: [], roots: [], batch: 1 }, by || 'dewey');
    const { trackMedia } = await import('./track.js');
    await trackMedia({ url: u.toString(), run: run?.id ?? null }, { by, channel });
    return { media: true, run: run?.id ?? null, note: 'that is a recording page — I sent it to the media library, which checks holdings, transcribes and publishes it at /media' };
  }
  const r = await reg.startJob({ kind: 'fetch', by, channel, key: idemKey('fetch', by, canonicalUrl(u.toString())), params: { url: canonicalUrl(u.toString()), rights: rightsOf(rights, by) }, notify: { chat: true, email: wantsEmail({ channel, emailMe, pref: pref === '1' }) } });
  if (r.refused) return { error: r.reason, refused: r.refused };
  return { job_id: r.job.id, already: !r.created, state: r.job.state, note: r.created ? 'queued; a worker machine downloads it (never the main server), then each file is checked against the library. Ask me for status any time.' : 'that link is already being handled' };
}

/** An uploaded ZIP (R2 key) → an archive job. Called from the upload finish route (internal). */
export async function startArchive({ key, name, size, by, channel = 'upload', emailMe = false, rights }, { reg = registry, rp = repo } = {}) {
  const pref = await swallow(rp.getFlag(`email-pref:${whoOf(by)}`));
  const r = await reg.startJob({ kind: 'archive', by, channel, key: idemKey('archive', by, key), params: { key, name, size, rights: rightsOf(rights, by) }, notify: { chat: true, email: wantsEmail({ channel, emailMe, pref: pref === '1' }) }, caps: { bytes: 0 } });
  return r;
}
