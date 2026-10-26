// Drops a talk's edge-cached page + API entry (worker POST /_edge/purge) when its audio/data changes, so a newly restored
// talk shows its Original | Remastered switch within seconds. Fire-and-forget; never throws; off in tests.
export async function purgeTalk(slug, { version = null, fetchImpl = fetch, key = process.env.INTERNAL_API_KEY, origin = 'https://siftersearch.com' } = {}) {
  if (!slug || !key || process.env.VITEST || process.env.NODE_ENV === 'test') return false;
  try {
    const r = await fetchImpl(`${origin}/_edge/purge?slug=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'x-internal-key': key }, signal: AbortSignal.timeout(10_000) });
    // Metadata publication must not copy audio through the public tunnel. Playback requests warm only the selected file.
    return r.ok;
  } catch { return false; }
}
