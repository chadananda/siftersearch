// CPU chain cuts (boss profile 10-31): downmix before the filter chain, and post.py's three web encodes side by side.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const py = (code) => JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim().split('\n').at(-1));

describe('media_tool encode: mono BEFORE the chain', () => {
  const encode = (recipe, af) => py(`
import sys, json, types, subprocess
sys.path.insert(0, 'scripts/media')
import media_tool
seen = []
media_tool.subprocess.run = lambda cmd, **kw: seen.append(cmd)
media_tool.print = lambda *a, **k: None
media_tool.cmd_encode(types.SimpleNamespace(recipe=${JSON.stringify(recipe)}, af=${af === null ? 'None' : JSON.stringify(af)}, ss=None, t=None, threads=2, input='in.mp3', output='o'))
cmd = seen[0]; i = cmd.index('-af') if '-af' in cmd else -1
sys.stdout.write(json.dumps({'af': cmd[i + 1] if i >= 0 else None}) + '\\n')`);
  it('every recipe with a chain downmixes first', () => {
    for (const r of ['light', 'ogg', 'm4a', 'oggR', 'm4aR']) expect(encode(r, 'highpass=f=70,loudnorm=I=-18').af).toMatch(/^aformat=channel_layouts=mono,highpass=f=70,loudnorm=I=-18/);
  });
  it('no chain: the copy is unchanged (no -af added)', () => {
    expect(encode('ogg', null).af).toBeNull();
  });
  it('a disallowed filter is still refused (aformat is ours, not the caller\'s)', () => {
    expect(() => encode('ogg', 'aformat=channel_layouts=stereo')).toThrow();
  });
});

describe('post.py web encodes: original downmixed first, three encodes side by side', () => {
  it('runs ogg, m4a and the original pass concurrently, original graph starts mono', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mono-'));
    writeFileSync(join(dir, 'in.mp3'), 'x'); writeFileSync(join(dir, 'out.flac'), 'y'); writeFileSync(join(dir, 'asr.json'), '{}');
    writeFileSync(join(dir, 'work.json'), '{"paragraphs":[]}');
    const sha = createHash('sha256').update('{"paragraphs":[]}').digest('hex');
    writeFileSync(join(dir, 'job.json'), JSON.stringify({ post: { af: 'highpass=f=70,loudnorm', max_fallback_pct: 15, slug: 's', work_sha: sha, ogg: [], m4a: [], orig_ogg: [], orig_m4a: [] } }));
    const o = py(`
import sys, json, types, time, threading
sys.path.insert(0, 'scripts/media/worker')
import post
lock = threading.Lock(); live = [0, 0]; graphs = []
def runner(cmd, **kw):
    if 'remaster_guard.py' in ' '.join(cmd): return types.SimpleNamespace(stdout=json.dumps({'sentences': 10, 'fallback_sent_pct': 0, 'swapped_pct': 0}) + '\\n')
    if 'media_tool.py' in ' '.join(cmd): return types.SimpleNamespace(stdout=json.dumps({'placed': 100, 'total': 100}) + '\\n')
    if cmd[0] == 'ffmpeg' and '-filter_complex' in cmd: graphs.append(cmd[cmd.index('-filter_complex') + 1])
    if cmd[0] == 'ffmpeg' and '-y' in cmd:
        with lock: live[0] += 1; live[1] = max(live[1], live[0])
        time.sleep(0.3)
        with lock: live[0] -= 1
    return types.SimpleNamespace(stdout='')
r = post.process(${JSON.stringify(dir)}, runner=runner, silence=lambda *a, **k: {'version': 1, 'quiet_s': 0.0, 'stretches': 0, 'loud': [], 'loud_s': 0.0, 'voiced_kept': []})
sys.stdout.write(json.dumps({'peak': live[1], 'graphs': graphs, 'web': r.get('web'), 'why': r.get('why')}) + '\\n')`);
    expect(o.why).toBeNull();
    expect(o.web).toMatchObject({ ogg: 's.ogg', m4a: 's.m4a', orig_ogg: 's.original.ogg', orig_m4a: 's.original.m4a' });
    expect(o.peak).toBe(3);
    expect(o.graphs).toEqual(['[0:a]aformat=channel_layouts=mono,highpass=f=70,loudnorm,asplit=2[ogg][aac]']);
  });
});
