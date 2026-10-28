// Dewey caps, trust and the kill switch (Chad 10-28: looser caps, everyone at once, DEWEY_V2=0 as a safety valve only).
// Pure helpers + a flag-aware gate; the repo is injected so tests need no database.
export const CAPS = { jobs: 20, bytes: 4 * 1024 ** 3, pages: 200, research: 40, usd: 2.0 };
export const ADMIN_FACTOR = 5;
export const globalCeilingUsd = () => Number(process.env.DEWEY_GLOBAL_USD) || 50;
export const adminEmails = () => (process.env.DEWEY_ADMIN_EMAILS || 'chadananda@gmail.com').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
/** "a@b.c (email)" / "a@b.c (key 3)" → "a@b.c" */
export const whoOf = (by) => String(by || '').replace(/\s*\(.*$/, '').trim().toLowerCase();
export const isAdmin = (by) => adminEmails().includes(whoOf(by));
export const limitsFor = (by) => Object.fromEntries(Object.entries(CAPS).map(([k, v]) => [k, isAdmin(by) ? v * ADMIN_FACTOR : v]));
export const LIMITS = { fetchBytes: { doc: 500 * 1024 ** 2, archive: 2 * 1024 ** 3, media: 0 }, zipEntries: 500, zipBytes: 2 * 1024 ** 3, zipDepth: 2, ratio: 100, newContributorEntries: 50, crawlPages: 50 };

/** The operator valve: DEWEY_V2=0 or the 'paused' flag. → { on, why } */
export async function valve(repo) {
  if (process.env.DEWEY_V2 === '0') return { on: false, why: 'Dewey\'s new job system is switched off by the operator (DEWEY_V2=0).' };
  const p = await repo.getFlag('paused').catch(() => null);
  if (p && p !== '0') return { on: false, why: p === '1' ? 'Dewey\'s jobs are paused by the operator.' : String(p) };
  return { on: true };
}

const WORDS = { jobs: 'jobs', bytes: 'of downloads', pages: 'crawled pages', research: 'research calls', usd: 'of spend' };
/** Would adding `delta` to today's usage cross a cap? → { ok } | { ok:false, metric, reason } */
export async function checkCap(repo, by, delta = {}) {
  const lim = limitsFor(by), used = await repo.usageOf(whoOf(by));
  for (const [k, v] of Object.entries(delta)) {
    if (!(k in lim) || !v) continue;
    if (Number(used[k] || 0) + Number(v) > lim[k]) {
      const fmt = (n) => (k === 'bytes' ? `${(n / 1024 ** 3).toFixed(1)} GB` : k === 'usd' ? `$${Number(n).toFixed(2)}` : String(n));
      return { ok: false, metric: k, reason: `That would go past today's limit (${fmt(lim[k])} ${WORDS[k]}; ${fmt(used[k] || 0)} used). It resets at midnight UTC — or ask Chad to raise it.` };
    }
  }
  return { ok: true };
}

/** Global spend: { ceiling, spent, share, over, note80 } */
export async function globalState(repo, day) {
  const ceiling = globalCeilingUsd(), spent = await repo.usageTotal(day);
  return { ceiling, spent, share: ceiling ? spent / ceiling : 0, over: spent >= ceiling, note80: spent >= ceiling * 0.8 };
}

/** Trust 0 (new) | 1 (proven: 15 accepted items, or an admin). */
export const trustLevel = async (by, countAccepted) => (isAdmin(by) ? 1 : (await countAccepted(whoOf(by)).catch(() => 0)) >= 15 ? 1 : 0);
