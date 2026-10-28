// Deploy attempt log: data/run/deploy-status.json written by scripts/update-server.js, read by GET /api/admin/ops/deploy.
// Lets the pushing agent learn refused/deployed itself. Keeps last 20; lastGood = newest deployed commit.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';

export const KEEP = 20;
export const emptyStatus = () => ({ lastGood: null, lastAttempt: null, status: null, reason: null, attempts: [] });

export function readDeployStatus(file) {
  try { return { ...emptyStatus(), ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { return emptyStatus(); }
}

/** Record an attempt. Same commit already pending/refused → updated in place. status: pending|deployed|refused. */
export function recordDeploy(file, { commit, status, reason = null, now = new Date().toISOString() }) {
  const s = readDeployStatus(file);
  const cur = s.attempts.find((a) => a.commit === commit);
  if (cur) Object.assign(cur, { status, reason, updated: now });
  else s.attempts.push({ commit, status, reason, started: now, updated: now });
  s.attempts = s.attempts.slice(-KEEP);
  if (status === 'deployed') s.lastGood = commit;
  Object.assign(s, { lastAttempt: commit, status, reason });
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 1)); renameSync(`${file}.tmp`, file);
  } catch { /* never block a deploy on bookkeeping */ }
  return s;
}

/** Does a commit (full or abbreviated sha) match an attempt? */
export const findAttempt = (s, commit) => s.attempts.slice().reverse().find((a) => a.commit.startsWith(commit) || commit.startsWith(a.commit));
