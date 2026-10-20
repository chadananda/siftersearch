// The holdings-check MEMO (Chad 10-20: "keep a hash-table list of all duplicate checks so subsequent checks of the same book are
// instant"). A file is keyed by its CONTENT (sha256, streamed — a big PDF is never loaded), so the same book checked again —
// renamed, moved, in another folder — answers from the table instead of converting, identifying (an LLM call) and searching.
// Freshness: a HELD verdict stands while the document it matched is still live; any other verdict (not held, possible, …) is
// re-checked after 7 days, because the library grows. Errors are never stored. Deps: dewey-checks-repo, docs-repo.
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { getCheck, saveCheck, countHit } from '../repos/dewey-checks-repo.js';
import { getDoc } from '../docs-repo.js';

const HELD = new Set(['held', 'partly-held']);
const OPEN_TTL_MS = 7 * 24 * 3600 * 1000;

/** sha256 of an upload (base64) or a server file (streamed). */
export async function contentSha({ file = null, path = null }) {
  if (file?.data) return createHash('sha256').update(Buffer.from(file.data, 'base64')).digest('hex');
  return new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
}

/** Is a stored check still the answer? */
export async function stillValid(row, { now = Date.now(), live = async (id) => !!(await getDoc(id, { follow: true })) } = {}) {
  if (!row?.result || !row.verdict) return false;
  if (HELD.has(row.verdict)) {
    const id = row.result.candidates?.[0]?.id;
    return id != null && (await live(id));
  }
  return now - Date.parse(row.checked_at) < OPEN_TTL_MS;
}

/** The memoised check: { identified, result, memo: { sha256, cached, checked_at } }. run(input) does the real check and returns
 *  { identified, result }. fresh: true skips the table (the answer is still stored). */
export async function checkWithMemo(input, run, { fresh = false, deps = {} } = {}) {
  const { sha = contentSha, get = getCheck, save = saveCheck, hit = countHit, valid = stillValid } = deps;
  const sha256 = await sha(input);
  if (!fresh) {
    const row = await get(sha256);
    if (row && (await valid(row))) {
      await hit(sha256).catch(() => {});
      return { identified: row.identified, result: row.result, memo: { sha256, cached: true, checked_at: row.checked_at } };
    }
  }
  const out = await run(input);
  if (out?.result?.verdict && !/^error/.test(out.result.verdict)) {
    const name = input.path ? String(input.path).split('/').pop() : input.file?.name || null;
    await save(sha256, { verdict: out.result.verdict, identified: out.identified, result: out.result, bytes: out.bytes ?? null, fileName: name }).catch(() => {});
  }
  return { ...out, memo: { sha256, cached: false } };
}
