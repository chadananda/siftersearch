#!/usr/bin/env node
// After `git push`: poll GET /api/admin/ops/deploy until the commit is deployed (exit 0), refused (reason, exit 1) or ~8 min pass (exit 2).
//   node scripts/ops/deploy-check.mjs [commit]   Env: SIFTER_API (default http://127.0.0.1:7839), DEPLOY_SECRET; DEPLOY_CHECK_MS to shorten.
import dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { findAttempt } from '../../api/lib/ops/deploy-status.js';

/** Decide from a status document → { code, line } or null while still pending. A later deployed commit covers an earlier one (lastGood after it). */
export function verdict(st, commit, covered = () => false) {
  const a = findAttempt(st, commit);
  if (!a && st.lastGood && covered(commit, st.lastGood)) return { code: 0, line: `deployed ${commit.slice(0, 8)} (covered by ${st.lastGood.slice(0, 8)})` };
  if (a?.status === 'deployed') return { code: 0, line: `deployed ${commit.slice(0, 8)}` };
  if (a?.status === 'refused') return { code: 1, line: `REFUSED ${commit.slice(0, 8)}: ${a.reason || 'no reason recorded'}` };
  return null;
}

export async function check(commit, { fetchStatus, timeoutMs = 8 * 60_000, everyMs = 10_000, covered, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const end = now() + timeoutMs; let last = 'no attempt recorded yet';
  for (;;) {
    try { const st = await fetchStatus(); const v = verdict(st, commit, covered); if (v) return v; const a = findAttempt(st, commit); last = a ? `${a.status} (${a.reason || '-'})` : `not seen yet; tower last attempted ${st.lastAttempt?.slice(0, 8) || 'none'}`; }
    catch (e) { last = `status unreachable: ${e.message}`; }
    if (now() >= end) return { code: 2, line: `PENDING ${commit.slice(0, 8)} after ${Math.round(timeoutMs / 60000)} min: ${last}` };
    await sleep(everyMs);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
  const API = process.env.SIFTER_API || 'http://127.0.0.1:7839';
  const commit = process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  const fetchStatus = async () => {
    const r = await fetch(`${API}/api/admin/ops/deploy`, { headers: { 'X-Internal-Key': process.env.DEPLOY_SECRET || '' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const covered = (c, good) => { try { execFileSync('git', ['merge-base', '--is-ancestor', c, good], { stdio: 'ignore' }); return true; } catch { return false; } };   // an older push the updater folded into a later deploy
  const { code, line } = await check(commit, { covered, fetchStatus, timeoutMs: Number(process.env.DEPLOY_CHECK_MS) || 8 * 60_000 });
  console.log(line); process.exit(code);
}
