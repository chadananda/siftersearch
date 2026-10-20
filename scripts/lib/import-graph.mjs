// PARTIAL UPDATES (docs/architecture/continuous-deploy.md; Chad 10-19: "partial updates so we can tweak without stopping"):
// which files each pm2 app LOADS — its entry, followed through static imports, literal dynamic imports and
// new URL('…', import.meta.url) reads (soul.md) — so a deploy reloads or drains only the apps whose code changed.
// A changed runtime file no graph reaches (a computed import) falls back to "every app that loads api/ code". Pure but fs.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, normalize } from 'node:path';
import { touchesRuntime } from './runtime-files.js';

const SPEC = [
  /\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g,                          // import … from './x' · export … from './x'
  /\bimport\s+['"](\.\.?\/[^'"]+)['"]/g,                        // import './x'
  /\bimport\(\s*['"`](\.\.?\/[^'"`$]+)['"`]\s*\)/g,            // import('./x') — literal only
  /new URL\(\s*['"](\.\.?\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,   // new URL('./soul.md', import.meta.url)
];
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
function resolveSpec(fromAbs, spec) {
  const base = normalize(join(dirname(fromAbs), spec));
  for (const c of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]) if (isFile(c)) return c;
  return null;
}

// one graph per entry per coordinator run (10-19: recomputing every service's graph for every lagging service pushed the
// updater past pm2's memory limit — it was restarted every 30 s); resetGraphCache() at the start of each run
const CACHE = new Map();
export const resetGraphCache = () => CACHE.clear();

/** → Set of repo-relative paths the entry loads (itself included). Cached per run. */
export function importGraph(entry, { root }) {
  const key = `${root}::${entry}`;
  if (!CACHE.has(key)) CACHE.set(key, computeGraph(entry, { root }));
  return CACHE.get(key);
}

function computeGraph(entry, { root }) {
  const seen = new Set();
  const stack = [join(root, entry)];
  while (stack.length) {
    const abs = stack.pop();
    const rel = relative(root, abs);
    if (seen.has(rel) || rel.startsWith('..') || rel.includes('node_modules')) continue;
    seen.add(rel);
    if (!/\.(m?js|cjs)$/.test(abs)) continue;   // data files (soul.md) are leaves
    let src = '';
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    for (const re of SPEC) for (const m of src.matchAll(re)) { const r = resolveSpec(abs, m[1]); if (r) stack.push(r); }
  }
  return seen;
}

const GLOBAL = /^(package(-lock)?\.json|\.env-public)$/;
// ecosystem.config.cjs is NOT global: only the apps whose own block changed (configChanged) are touched (10-19: a one-line
// change to the updater's memory limit would have drained every service)

/** apps: [{ name, script }] → { [name]: [changed files it loads] } for the apps a change affects. */
export function affectedApps(changed, apps, { root, graphOf = (s) => importGraph(s, { root }), added = [], configChanged = null }) {
  const runtime = changed.filter((f) => touchesRuntime([f]));
  const graphs = Object.fromEntries(apps.map((a) => [a.name, graphOf(a.script)]));
  const out = {};
  const hit = (name, f) => { (out[name] ||= []).push(f); };
  for (const f of runtime) {
    if (GLOBAL.test(f)) { for (const a of apps) hit(a.name, f); continue; }
    if (f === 'ecosystem.config.cjs') { for (const a of apps) if (!configChanged || configChanged.includes(a.name)) hit(a.name, f); continue; }
    const owners = apps.filter((a) => graphs[a.name].has(f));
    if (owners.length) { for (const a of owners) hit(a.name, f); continue; }
    // reached by no graph: under api/ it may be a computed import — every app loading api/ code; elsewhere (a script the
    // API spawns fresh each run, a config read at call time) nothing running holds it
    // …unless the file is NEW in this deploy: running code cannot have loaded a file that did not exist (10-19: the new
    // indexer's entry file reloaded the writer, deep-research and embedding for nothing)
    if (added.includes(f)) continue;
    if (/^(api|config)\//.test(f)) for (const a of apps) if ([...graphs[a.name]].some((g) => g.startsWith('api/'))) hit(a.name, f);
  }
  return out;
}
