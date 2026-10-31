// The typed media jobs' worker contract (scripts/media/worker/job-types.json): cpu-prep → gpu → cpu-finish. Source assertions on the entrypoints
// (they run only inside the worker image) + split_restore.py's replay, which lets post.py finish on a CPU host without re-measuring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const types = JSON.parse(readFileSync('scripts/media/worker/job-types.json', 'utf8'));
const phases = readFileSync('scripts/media/whole-worker/phases.mjs', 'utf8');
const build = readFileSync('scripts/media/whole-worker/build.mjs', 'utf8');
const entry = (f) => readFileSync(`scripts/media/whole-worker/${f}.mjs`, 'utf8');

describe('job-types.json', () => {
  it('names the three types, their hosts and contract 1', () => {
    expect(types.contract).toBe(1);
    expect(Object.keys(types.types)).toEqual(['cpu-prep', 'gpu', 'cpu-finish']);
    expect(Object.fromEntries(Object.entries(types.types).map(([k, t]) => [k, t.needs]))).toEqual({ 'cpu-prep': 'cpu', gpu: 'gpu', 'cpu-finish': 'cpu' });
  });
  it('every cmd is a bundle build.mjs produces beside whole-recording.mjs', () => {
    for (const [name, t] of Object.entries(types.types)) {
      expect(t.cmd).toEqual(['/usr/local/bin/node', `/opt/sifter/api/lib/media/${name}.mjs`]);
      expect(build).toContain(`'${name}':'${name}'`);
    }
    expect(build).toContain("'whole-recording':'recording'");
  });
  it('the entrypoints refuse a job of another type or contract', () => {
    expect(phases).toMatch(/export const CONTRACT=1;/);
    expect(phases).toMatch(/job\.type!==type \|\| job\.contract!==CONTRACT/);
    expect(entry('cpu-prep')).toMatch(/open\([^\n]*'cpu-prep'\)/);
    expect(entry('gpu')).toMatch(/open\([^\n]*'gpu'\)/);
    expect(entry('cpu-finish')).toMatch(/open\([^\n]*'cpu-finish'\)/);
    expect(entry('recording')).toMatch(/whole\(await open\([^\n]*'whole'\)\)/);
  });
});

describe('phases.mjs', () => {
  it('a CPU phase never runs a GPU stage: it yields (DRAIN) to the gpu job, no CPU fallback', () => {
    expect(phases).toMatch(/GPU_SUBS=new Set\(\['dfn','probe','transcribe','diarize','realign'\]\)/);
    expect(phases).toMatch(/if\(device==='cpu'&&GPU_SUBS\.has\(sub\)\)throw drain/);
    expect(phases).toMatch(/type==='cpu-prep'\|\|type==='cpu-finish'\?'cpu'/);
    expect(phases).toMatch(/no CPU fallback/);
  });
  it('the gpu job runs UniPASE, the guard measurement and the realign; cpu-finish replays them in post.py', () => {
    expect(phases).toMatch(/split\(ctx,'gpu',restore/);
    expect(phases).toMatch(/split\(ctx,'finish',restore/);
    expect(phases).not.toMatch(/single_restore\.py',/);
  });
  it('the original never travels in a result; cpu-finish writes the whole-recording result tower adopts', () => {
    expect(phases).toMatch(/path==='original'/);
    expect(phases).toMatch(/rm\(restore,\{recursive:true,force:true\}\)/);
    expect(phases).toMatch(/return manifest\(ctx,result\);/);   // type defaults to cpu-finish
  });
});

describe('pod bootstrap', () => {
  it('an image with the gpu entrypoint claims typed gpu jobs first (whole while none is queued), keeps the lane-seen touch', async () => {
    const C = await import('../../api/lib/media/cloud.js');
    expect(C.BOOTSTRAP_AGENT).toContain('[ -f /opt/sifter/api/lib/media/gpu.mjs ]');
    expect(C.BOOTSTRAP_AGENT).toMatch(/CLAIM='--types gpu --can whole --idle-exit-min 10'/);
    expect(C.BOOTSTRAP_AGENT).toMatch(/--device cuda \$CLAIM/);
    expect(C.BOOTSTRAP_AGENT).toMatch(/touch [^\n]*\/workspace\/\.lane-seen/);
  });
});

const py = (code) => execFileSync('python3', ['-c', `
import json, os, sys, tempfile, subprocess
sys.path.insert(0, 'scripts/media/worker')
import split_restore as sr
d = tempfile.mkdtemp(); os.makedirs(os.path.join(d, 'post'))
${code}`], { encoding: 'utf8', env: { ...process.env, SIFTER_GPU_LEASES: '' } }).trim();

describe('split_restore.py', () => {
  it('Replay returns the recorded guard and realign outputs and runs everything else', () => {
    expect(py(`
json.dump({'fallback_sent_pct': 0, 'sentences': 9}, open(os.path.join(d, sr.GUARD_OUT), 'w'))
json.dump({'stdout': '{"placed": 9, "total": 9}\\n', 'stderr': ''}, open(os.path.join(d, sr.REALIGN_OUT), 'w'))
flac, rj = os.path.join(d, 'post/unipase.flac'), os.path.join(d, 'post/realign.json')
open(flac, 'w').close(); open(rj, 'w').close()
ran = []
r = sr.Replay(d, run=lambda cmd, **kw: ran.append(cmd) or subprocess.CompletedProcess(cmd, 0, 'x', ''))
g = r(['py', '/x/remaster_guard.py', '--original', 'in.mp3', '--output', flac], capture_output=True)
a = r(sr.realign_cmd('py', flac, 4, 'w.json', rj), capture_output=True)
r(['ffmpeg', '-i', 'a'])
print(json.dumps([json.loads(g.stdout)['sentences'], json.loads(a.stdout)['placed'], ran, sorted(r.used)]))`)).toBe('[9, 9, [["ffmpeg", "-i", "a"]], ["guard", "realign"]]');
  });
  it('Replay refuses a measurement the gpu job did not record, and passes on a recorded realign failure', () => {
    expect(py(`
out = []
r = sr.Replay(d)
for cmd in (['py', '/x/remaster_guard.py', '--output', 'nope'], sr.realign_cmd('py', 'f', 4, 'w', 'o')):
    try: r(cmd)
    except RuntimeError as e: out.append(str(e)[:20])
json.dump({'error': 'cuda oom'}, open(os.path.join(d, sr.REALIGN_OUT), 'w'))
try: r(sr.realign_cmd('py', 'f', 4, 'w', 'o'))
except RuntimeError as e: out.append(str(e))
print(json.dumps(out))`)).toBe('["no recorded guard me", "no recorded realign ", "realign failed on the gpu host: cuda oom"]');
  });
  it('finish: a held verdict from the recorded guard publishes nothing and records the hold (never a splice)', () => {
    const r = JSON.parse(py(`
import hashlib
open(os.path.join(d, 'in.mp3'), 'w').close(); open(os.path.join(d, 'out.flac'), 'w').close()
open(os.path.join(d, 'post/unipase.flac'), 'w').close()
open(os.path.join(d, 'work.json'), 'w').write('{"paragraphs": []}')
sha = hashlib.sha256(open(os.path.join(d, 'work.json'), 'rb').read()).hexdigest()
json.dump({'kind': 'restore', 'post': {'mode': 'restore', 'work_sha': sha, 'max_fallback_pct': 15, 'assess_quality': True}}, open(os.path.join(d, 'job.json'), 'w'))
json.dump({'audio_s': 10}, open(os.path.join(d, 'restore-result.json'), 'w'))
json.dump({'fallback_sent_pct': 40, 'sentences': 10}, open(os.path.join(d, sr.GUARD_OUT), 'w'))
res = sr.finish(d, run=lambda cmd, **kw: (_ for _ in ()).throw(AssertionError('ran ' + str(cmd))))
print(json.dumps({'held': res['held'], 'verdict': res['qa']['verdict'], 'done': os.path.exists(os.path.join(d, 'done.json')), 'web': res.get('web')}))`));
    expect(r).toEqual({ held: true, verdict: 'review', done: true, web: null });
  });
});
