// pipeline/spawn — the ONE way a grounding run is launched: detached CLI + a per-doc log. Shared by the HTTP
// /start route and the queue supervisor, so an operator-launched run and an auto-advanced one are identical.
// Deps: node:child_process (detached executor), node:fs (per-doc log fd).
import { spawn } from 'child_process';
import fs from 'fs';
import { logger } from '../logger.js';

/** Launch a detached grounding run. Returns the pid. Opts map 1:1 to the CLI flags. */
export function spawnGrounding(docId, { from, only, to, readjudicate, cc } = {}) {
  const args = [`${process.cwd()}/scripts/complete-book.mjs`, String(docId)];
  if (from) args.push(`--from=${from}`);
  if (only) args.push(`--only=${only}`);
  if (to) args.push(`--to=${to}`);
  if (readjudicate) args.push('--readjudicate');
  if (cc) args.push(`--cc=${cc}`);
  // Send output to a per-doc log — stdio:'ignore' once hid a silent mid-stage exit and made it undiagnosable.
  let outFd = 'ignore';
  try { outFd = fs.openSync(`${process.cwd()}/logs/grounding-${Number(docId)}.log`, 'a'); } catch { outFd = 'ignore'; }
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(), detached: true, stdio: ['ignore', outFd, outFd],
    env: { ...process.env, SIFTER_WRITER_URL: process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849' },
  });
  child.unref();
  if (typeof outFd === 'number') { try { fs.closeSync(outFd); } catch { /* child keeps its copy */ } }
  logger.info({ docId: Number(docId), pid: child.pid, from, only, to, cc }, 'grounding spawned');
  return child.pid;
}
