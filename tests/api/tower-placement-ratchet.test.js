// TOWER PLACEMENT is RATCHETED (Chad 10-24: "we want the search and the site to be responsive all the time … what happens when we have 300?").
// Tower serves the API and search, holds the DB and the single writer, and runs orchestration, Dewey and publishing. It does NOT run media
// processing (ffmpeg, media_tool, ASR, diarize, grade, dfn, realign, encode), does not serve media bytes and does not run bulk jobs: that is for
// workers (RunPod, aorus, boss) and the edge. This test lists the server-side files that still spawn heavy processes; the list
// (tests/api/tower-placement-legacy.json, with a plan and a date per entry) may only SHRINK. A new file fails. CLAUDE.md "Tower placement".
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? []
  : e.isDirectory() ? walk(join(d, e.name)) : /\.(js|mjs|cjs)$/.test(e.name) ? [join(d, e.name)] : []));
const CHILD = /from\s+['"](node:)?child_process['"]|require\(\s*['"](node:)?child_process['"]\s*\)|import\(\s*['"](node:)?child_process['"]\s*\)/;
const HEAVY = /\b(ffmpeg|ffprobe|media_tool|remaster_guard|whisper|yt-dlp|ocrmypdf|tesseract|pdftoppm|libreoffice|sox)\b/i;
// helpers that run those programs for their callers (api/lib/media/tools.js)
const HELPER = /\btools\.(ffmpeg|tool|remasterGuard|pcmStream|encodeRemote)\(|\bT\.(ffmpeg|tool|remasterGuard|pcmStream)\(/;
export function heavyFiles() {
  const out = [];
  for (const f of walk(join(ROOT, 'api'))) {
    const code = codeOnly(readFileSync(f, 'utf8'));
    if ((CHILD.test(code) && HEAVY.test(code)) || HELPER.test(code)) out.push(relative(ROOT, f));
  }
  return out.sort();
}
const LEGACY = JSON.parse(readFileSync(join(ROOT, 'tests/api/tower-placement-legacy.json'), 'utf8'));

describe('tower placement ratchet', () => {
  it('no NEW server-side file spawns media / OCR / transcode processes on tower', () => {
    const fresh = heavyFiles().filter((f) => !(f in LEGACY.legacy));
    expect(fresh, `these files run heavy processes on tower (move the work to a worker, or see CLAUDE.md "Tower placement"): ${fresh.join(', ')}`).toEqual([]);
  });
  it('the legacy list only shrinks: a migrated file must leave it', () => {
    const now = new Set(heavyFiles());
    const stale = Object.keys(LEGACY.legacy).filter((f) => !now.has(f));
    expect(stale, `migrated — remove from tests/api/tower-placement-legacy.json: ${stale.join(', ')}`).toEqual([]);
  });
  it('every legacy entry carries a plan and a date', () => {
    for (const [f, v] of Object.entries(LEGACY.legacy)) { expect(v.plan, f).toBeTruthy(); expect(v.by, f).toMatch(/^2026-\d\d-\d\d$/); }
  });
});

describe('heavy processes on tower, in cores', () => {
  it('counts ffmpeg / media_tool / guard processes and names the kinds; warns and goes critical above the budgets', async () => {
    const { towerHeavy, towerHeavyVerdict } = await import('../../scripts/lib/tower-heavy.mjs');
    const ps = ['390.0 /home/chad/sifter/venvs/media/bin/python /x/media_tool.py realign /a/unipase.flac --threads 4',
      '300.0 /home/chad/sifter/venvs/media/bin/python /x/media_tool.py realign /b/unipase.flac --threads 4',
      '150.0 ffmpeg -i /a.flac -c:a libopus /w.ogg', '120.0 ffmpeg -i /b.flac -c:a aac /w.m4a', ' 80.0 python remaster_guard.py --original x', '  5.0 node api/index.js', '  1.0 grep ffmpeg'].join('\n');
    const h = towerHeavy(ps);
    expect(h.kinds['media_tool realign']).toMatchObject({ n: 2, cores: 6.9 }); expect(h.kinds.ffmpeg.n).toBe(2); expect(h.cores).toBeCloseTo(10.4, 1);
    expect(towerHeavyVerdict(h)).toMatchObject({ ok: false, level: 'warn' });
    expect(towerHeavyVerdict(h).detail).toMatch(/media_tool realign 6.9 cores/);
    expect(towerHeavyVerdict(h, { warn: 6, crit: 10 }).level).toBe('critical');
    expect(towerHeavyVerdict(towerHeavy('  5.0 node api/index.js'))).toMatchObject({ ok: true });
  });
});
