// Pre-reload IMPORT GATE for the updater (10-23 16:08: a pushed api/lib/ops/media-jobs.js imported '../media/historical.js',
// which was not committed — `node --check` passes that, and the next reload of media / reports / ops would have died with
// ERR_MODULE_NOT_FOUND). Static, no side effects (no service is imported or started): every import in a changed file —
// and in every repo file that imports a changed file — must resolve, and every named import from a repo module must be one
// it exports. Regex-based (no parser dependency on tower): static import / export-from, literal dynamic import(), late().
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { builtinModules } from 'module';

const CODE = /\.(?:m?js|cjs)$/;
const SCAN_DIRS = ['api', 'scripts', 'worker'];   // what the updater reloads (src/ is built by Vite; scripts/wip is scratch)
const SKIP = /^(?:src\/|scripts\/wip\/)/;
const BUILTIN = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

/** Code without the comment LINES (a line starting with //, /*, or * — JSDoc). Only whole lines: a '/*' or '//' inside a
 *  string ('/api/*', a URL) must never swallow code (the first version ate http-server.js's exports). */
export function stripComments(src) {
  return src.split('\n').map((l) => (/^\s*(?:\/\/|\/\*|\*)/.test(l) ? '' : l)).join('\n');
}

/** → [{ spec, names: [imported names] | null, line }] */
export function importsOf(src) {
  const code = stripComments(src), out = [];
  const lineAt = (i) => code.slice(0, i).split('\n').length;
  // import x, { a, b as c } from '…' · import * as n from '…' · import '…' · export { a } from '…' · export * from '…'
  for (const m of code.matchAll(/\b(import|export)\s+(?:type\s+)?([\w*${},\s]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const braces = /\{([^}]*)\}/.exec(m[2] || '');
    const names = m[1] === 'import' && braces ? braces[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) : null;
    out.push({ spec: m[3], names, line: lineAt(m.index) });
  }
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g)) out.push({ spec: m[1], names: null, line: lineAt(m.index) });
  // a literal dynamic import() fails only when that code runs: reported as a warning, never a block
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], names: null, line: lineAt(m.index), dynamic: true });
  return out;
}
/** late('<repo path>') (api/lib/media/late.js): a repo-root-relative path. */
export const latesOf = (src) => [...stripComments(src).matchAll(/\blate\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);

/** The names a module exports (null = cannot tell: `export *`). */
export function exportsOf(src) {
  const code = stripComments(src);
  if (/\bexport\s*\*\s*from\b/.test(code)) return null;
  const names = new Set();
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:function\*?|class)\s+([\w$]+)/g)) names.add(m[1]);
  // export const A = 1, B = 2 — every declarator on the line (top-level `name =`)
  for (const m of code.matchAll(/\bexport\s+(?:const|let|var)\s+([^\n]*)/g)) {
    if (m[1].trim().startsWith('{')) continue;
    let depth = 0, cur = '', parts = [];
    for (const ch of m[1]) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    for (const part of parts) { const n = /^\s*([\w$]+)\s*=/.exec(part); if (n) names.add(n[1]); }
  }
  for (const m of code.matchAll(/\bexport\s+(?:const|let|var)\s+\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const k = n.split(':').pop().trim(); if (k) names.add(k); }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/).pop().trim(); if (k) names.add(k); }
  if (/\bexport\s+default\b/.test(code)) names.add('default');
  return names;
}

const tryFiles = (p) => [p, `${p}.js`, `${p}.mjs`, join(p, 'index.js')].find((x) => existsSync(x) && statSync(x).isFile()) || null;
function bareResolves(spec, root) {
  if (BUILTIN.has(spec) || BUILTIN.has(spec.split('/')[0])) return true;
  const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  for (let d = root; ; d = dirname(d)) { if (existsSync(join(d, 'node_modules', pkg))) return true; if (dirname(d) === d) return false; }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (CODE.test(e.name)) out.push(p);
  }
  return out;
}

/** The problems for a set of changed files → [{ file, line, error, warn? }]; a `warn` (a dynamic import()) never blocks. */
export function importProblems(changed = [], { root = process.cwd() } = {}) {
  const abs = (f) => resolve(root, f);
  const changedAbs = new Set(changed.filter((f) => CODE.test(f) && !SKIP.test(f) && existsSync(abs(f))).map(abs));
  const deleted = new Set(changed.filter((f) => CODE.test(f) && !SKIP.test(f) && !existsSync(abs(f))).map(abs));
  if (!changedAbs.size && !deleted.size) return [];
  // importers of a changed (or deleted) file: a removed export or a removed file breaks THEM
  const touched = new Set([...changedAbs, ...deleted]);
  const files = new Set(changedAbs);
  const cache = new Map();
  const read = (p) => { if (!cache.has(p)) { try { cache.set(p, readFileSync(p, 'utf8')); } catch { cache.set(p, null); } } return cache.get(p); };
  for (const f of SCAN_DIRS.flatMap((d) => walk(join(root, d)))) {
    if (SKIP.test(relative(root, f))) continue;
    const src = read(f); if (!src) continue;
    const deps = [...importsOf(src).map((i) => i.spec).filter((s) => s.startsWith('.')).map((s) => resolve(dirname(f), s)), ...latesOf(src).map((s) => resolve(root, s))];
    if (deps.some((d) => touched.has(d) || touched.has(`${d}.js`))) files.add(f);
  }
  const out = [];
  for (const f of files) {
    const src = read(f); if (!src) continue;
    const rel = relative(root, f);
    for (const imp of importsOf(src)) {
      if (!imp.spec.startsWith('.') && !imp.spec.startsWith('/')) {
        if (!bareResolves(imp.spec, root)) out.push({ file: rel, line: imp.line, error: `package '${imp.spec}' is not installed`, ...(imp.dynamic ? { warn: true } : {}) });
        continue;
      }
      const target = tryFiles(resolve(dirname(f), imp.spec));
      if (!target) { out.push({ file: rel, line: imp.line, error: `imports '${imp.spec}', which does not exist`, ...(imp.dynamic ? { warn: true } : {}) }); continue; }
      if (!imp.names?.length || !CODE.test(target)) continue;
      const ex = exportsOf(read(target) || '');
      if (!ex) continue;
      for (const n of imp.names) if (!ex.has(n)) out.push({ file: rel, line: imp.line, error: `imports { ${n} } from '${imp.spec}', which does not export it` });
    }
    for (const p of latesOf(src)) if (!tryFiles(resolve(root, p))) out.push({ file: rel, line: 0, error: `late('${p}'): no such file` });
  }
  return out;
}
