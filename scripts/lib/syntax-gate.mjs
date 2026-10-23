// Pre-reload SYNTAX GATE for the updater (10-23 outage: a pushed SyntaxError in api/workers/media-worker.js stopped the
// media service for 20 min — the smoke test exercised the API only). Every changed .js/.mjs/.cjs is `node --check`ed
// before any process is touched; a failure blocks the deploy and the old processes keep running.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const pexec = promisify(execFile);
export const CODE = /\.(?:m?js|cjs)$/;

/** The code files a diff touched that still exist (a deleted file has nothing to check). */
export const codeFiles = (files = [], root = process.cwd()) => files.filter((f) => CODE.test(f) && existsSync(join(root, f)));

/** node --check each file → [{ file, error }] (empty = all parse). check(file) is injectable for tests. */
export async function syntaxProblems(files = [], { root = process.cwd(), check } = {}) {
  const run = check || (async (f) => { await pexec(process.execPath, ['--check', join(root, f)], { timeout: 30_000 }); });
  const out = [];
  for (const f of codeFiles(files, root)) {
    try { await run(f); } catch (err) {
      const msg = String(err.stderr || err.message || err).split('\n').filter((l) => /SyntaxError|Error:|^\s*\S.*:\d+$/.test(l)).slice(0, 3).join(' | ');
      out.push({ file: f, error: msg.slice(0, 400) || 'node --check failed' });
    }
  }
  return out;
}
