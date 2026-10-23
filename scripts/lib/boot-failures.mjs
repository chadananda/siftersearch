// BOOT FAILURES (10-23: a SyntaxError kept siftersearch-media from starting for 20 min and system-checks called it a
// 'draining' WARN). A pm2 process whose error log, written since its last start, holds a module-load error is CRITICAL,
// named with the error line. Pure over { name, startedAt, errTail, errMtime }.
export const BOOT_ERROR = /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|does not provide an export named|Cannot find module|ReferenceError: .* is not defined|TypeError: .* is not a function.*\n?.*at (?:file:|ModuleJob)/;

/** procs: [{ name, startedAt (ms), errMtime (ms), errTail (string) }] → [{ name, line }] */
export function bootFailures(procs = []) {
  const out = [];
  for (const p of procs) {
    if (!p.errTail || !(p.errMtime >= (p.startedAt || 0) - 5000)) continue;   // nothing written since this start
    const lines = String(p.errTail).split('\n');
    const i = lines.findIndex((l) => BOOT_ERROR.test(l));
    if (i < 0) continue;
    // the file:line just above a SyntaxError names where it is
    const where = lines.slice(Math.max(0, i - 4), i).reverse().find((l) => /\.(?:m?js|cjs):\d+/.test(l)) || '';
    out.push({ name: p.name, line: `${where.trim()} ${lines[i].trim()}`.trim().slice(0, 300) });
  }
  return out;
}
