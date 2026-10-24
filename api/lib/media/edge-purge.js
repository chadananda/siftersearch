// Drops a talk's edge-cached page + API entry (worker POST /_edge/purge) when its audio/data changes, so a newly restored
// talk shows its Original | Remastered switch within seconds. Fire-and-forget; never throws; off in tests.
export async function purgeTalk(slug, { version = null, fetchImpl = fetch, key = process.env.INTERNAL_API_KEY, origin = 'https://siftersearch.com' } = {}) {
  if (!slug || !key || process.env.VITEST || process.env.NODE_ENV === 'test') return false;
  try {
    const r = await fetchImpl(`${origin}/_edge/purge?slug=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'x-internal-key': key }, signal: AbortSignal.timeout(10_000) });
    // then warm both audio copies into R2 (idempotent; missing objects only: the one time the tower serves these bytes)
    if (r.ok && version) for (const fmt of ['ogg', 'm4a']) await fetchImpl(`${origin}/_media/warm?slug=${encodeURIComponent(slug)}&v=${version}&fmt=${fmt}&copy=both`, { method: 'POST', signal: AbortSignal.timeout(300_000) }).catch(() => {});
    return r.ok;
  } catch { return false; }
}
