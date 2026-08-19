// pipeline/spawn — the ONE way a grounding run is launched: detached CLI + a per-doc log. Shared by the HTTP
// /start route and the queue supervisor, so an operator-launched run and an auto-advanced one are identical.
// Deps: node:child_process (detached executor), node:fs (per-doc log fd).
import { spawn } from 'child_process';
import fs from 'fs';
import { logger } from '../logger.js';

/** Launch a detached grounding run. Returns the pid. Opts map 1:1 to the CLI flags. */
export function spawnGrounding(docId, { from, only, to, readjudicate, rehype, hypeModel, cc } = {}) {
  const args = [`${process.cwd()}/scripts/complete-book.mjs`, String(docId)];
  if (from) args.push(`--from=${from}`);
  if (only) args.push(`--only=${only}`);
  if (to) args.push(`--to=${to}`);
  if (readjudicate) args.push('--readjudicate');
  if (rehype) args.push('--rehype');   // regenerate HyPE (version-aware upgrade on the hype stage)
  if (hypeModel) args.push(`--hype-model=${hypeModel}`);   // model override for the hype stage (flagship runs)
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

/**
 * Launch a detached CONCEPT run. Same shape as spawnGrounding for the same reason: concepts/disambiguate is
 * sequential, so a whole book cannot finish inside an HTTP request (a 292-paragraph Íqán run died on a
 * Cloudflare 524). Returns the pid.
 */
export function spawnConcepts(docId, { only, from, limit, dry } = {}) {
  const args = [`${process.cwd()}/scripts/complete-concepts.mjs`, String(docId)];
  if (only) args.push(`--only=${only}`);
  if (from) args.push(`--from=${from}`);
  if (limit) args.push(`--limit=${limit}`);
  if (dry) args.push('--dry');
  const out = fs.openSync(`${process.cwd()}/logs/concepts-${docId}.log`, 'a');
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  logger.info({ docId, pid: child.pid, args: args.slice(1) }, 'concepts run launched');
  return child.pid;
}
