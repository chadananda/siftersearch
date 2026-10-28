#!/usr/bin/env node
// Pre-push guard: node --check every .js/.mjs/.cjs changed in origin/main..HEAD (+ uncommitted), then the updater's static import gate.
// Exit 1 on any problem. Run before `git push`: node scripts/ops/precheck.mjs
import { execFileSync } from 'child_process';
import { syntaxProblems } from '../lib/syntax-gate.mjs';
import { importProblems } from '../lib/import-gate.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).split('\n').map((x) => x.trim()).filter(Boolean); } catch { return []; } };
const root = process.cwd();
const changed = [...new Set([...git('diff', '--name-only', 'origin/main..HEAD'), ...git('diff', '--name-only', 'HEAD')])];
const bad = await syntaxProblems(changed, { root });
const imp = bad.length ? [] : importProblems(changed, { root }).filter((x) => !x.warn);   // import graph needs parseable files
for (const b of bad) console.log(`SYNTAX ${b.file}: ${b.error}`);
for (const b of imp) console.log(`IMPORT ${b.file}:${b.line} ${b.error}`);
console.log(bad.length || imp.length ? `precheck FAILED (${bad.length + imp.length} problem(s))` : `precheck ok: ${changed.length} changed file(s) parse, imports resolve`);
process.exit(bad.length || imp.length ? 1 : 0);
