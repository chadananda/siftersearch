// pipeline/lock — the GRAPH-BAND MUTEX. At most one grounding run may be inside the graph-mutating band
// (project→dedup) at a time; everything else (disambiguate…research, hype, verify) runs fully concurrently.
// This replaces book-level serialization: a run holds the lock ONLY for its band stages, so a book's long
// reconcile no longer blocks other books' graph-integration.
//
// Correctness rests on the single writer: every claim is a WRITE, so db.query routes it through the one writer
// process, which serializes the UPDATEs — the "claim if free" check is therefore atomic ACROSS processes (the
// detached per-book CLIs all contend through the same writer). A crashed holder can't wedge the band forever:
// a claim also succeeds against a holder older than STALE_MS (steal), so the band self-heals.
import { query } from '../db.js';
import { logger } from '../logger.js';

const STALE_MS = Number(process.env.GROUNDING_BAND_STALE_MS || 30 * 60 * 1000); // > any real band transit
const POLL_MS = 5000;
const changesOf = (res) => res?.rows?.[0]?.changes ?? 0;

/**
 * Try to claim the band for `docId` in ONE atomic write. Succeeds (returns true) when the band is free, already
 * held by this docId (re-entrant), or held by a STALE holder (steal). Fails (false) when another live run holds it.
 */
export async function tryClaimGraphBand(docId, { name = 'graph_band', staleMs = STALE_MS, query: q = query } = {}) {
  const res = await q(
    `UPDATE grounding_locks SET holder = ?, acquired_at = unixepoch()
     WHERE name = ? AND (holder IS NULL OR holder = ? OR acquired_at <= unixepoch() - ?)`,
    [Number(docId), name, Number(docId), Math.round(staleMs / 1000)]);
  return changesOf(res) > 0;
}

/**
 * Block until this run holds the band. Polls the atomic claim; waits indefinitely by design (a band transit is
 * short and always completes, and stale-steal reclaims a crashed holder) so a run never proceeds into project
 * without the mutex. `onWait` fires once when it actually has to queue behind another holder.
 */
export async function acquireGraphBand(docId, { name = 'graph_band', pollMs = POLL_MS, onWait } = {}) {
  if (await tryClaimGraphBand(docId, { name })) return;
  onWait?.();
  logger.info({ docId, name }, 'graph-band: waiting for holder to release');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (;;) {
    await sleep(pollMs);
    if (await tryClaimGraphBand(docId, { name })) {
      logger.info({ docId, name }, 'graph-band: acquired');
      return;
    }
  }
}

/** Release the band iff this docId holds it (never steals a release from a newer holder). */
export async function releaseGraphBand(docId, { name = 'graph_band' } = {}) {
  await query(`UPDATE grounding_locks SET holder = NULL, acquired_at = NULL WHERE name = ? AND holder = ?`,
    [name, Number(docId)]);
}

/** Who currently holds the band (docId) or null — for the monitor. */
export async function graphBandHolder({ name = 'graph_band' } = {}) {
  const [row] = (await query(`SELECT holder FROM grounding_locks WHERE name = ?`, [name])).rows;
  return row?.holder ?? null;
}
