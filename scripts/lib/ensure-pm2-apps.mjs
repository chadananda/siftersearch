// Self-registering cron apps. A newly-added PM2 app has a bootstrap problem: the updater applies deploys but
// never restarts ITSELF, so logic added to the updater can never run, and nothing else on the box notices a
// new entry in ecosystem.config.cjs. pipeline-snapshot IS the exception — autorestart:false + cron_restart
// every 5 min means a FRESH process with CURRENT code, always. So it hosts this check.
// Deliberately narrow: an explicit allowlist, and only apps PM2 has NEVER heard of — a deliberately stopped
// process must stay stopped, which is why this tests KNOWN, not RUNNING.
import { execFile } from 'node:child_process';

// Only these. Not "everything in the ecosystem file": that would revive the retired enrichment/graph workers.
export const SELF_REGISTERING = ['siftersearch-converter', 'siftersearch-book-ingest', 'siftersearch-digest', 'siftersearch-relabel'];

const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 60000, maxBuffer: 8 * 1024 * 1024, ...opts },
    (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || err?.message || '') }));
});

/**
 * Register any allowlisted cron app PM2 does not know about yet.
 * @param {string} cwd project root (pm2 must read ecosystem.config.cjs from there)
 * @param {object} deps injectable runner, for tests
 * @returns {Promise<{registered: string[], skipped: string[], error?: string}>}
 */
export async function ensurePm2Apps(cwd = process.cwd(), deps = {}) {
  const exec = deps.run || run;
  const list = await exec('pm2', ['jlist'], { cwd });
  if (!list.ok) return { registered: [], skipped: [...SELF_REGISTERING], error: 'pm2 jlist unavailable' };
  let known;
  try { known = new Set(JSON.parse(list.stdout).map((p) => p.name)); }
  catch { return { registered: [], skipped: [...SELF_REGISTERING], error: 'pm2 jlist unparseable' }; }

  const registered = [], skipped = [];
  for (const name of SELF_REGISTERING) {
    if (known.has(name)) { skipped.push(name); continue; }
    const res = await exec('pm2', ['startOrReload', 'ecosystem.config.cjs', '--only', name], { cwd });
    if (res.ok) registered.push(name);
    else skipped.push(`${name} (failed: ${res.stderr.slice(-120)})`);
  }
  if (registered.length) await exec('pm2', ['save'], { cwd });   // survive a pm2 resurrect
  return { registered, skipped };
}
