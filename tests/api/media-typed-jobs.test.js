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
    expect(C.BOOTSTRAP_AGENT).toMatch(/CLAIM='--types gpu --idle-exit-min 10'/);
    expect(C.BOOTSTRAP_AGENT).toMatch(/--device cuda \$CLAIM/);
    expect(C.BOOTSTRAP_AGENT).toMatch(/touch [^\n]*\/workspace\/\.lane-seen/);
    // MPS starts before the agent, so its gpu jobs' kernels run side by side instead of time-sliced
    const b = C.BOOTSTRAP_AGENT;
    expect(b.indexOf('nvidia-cuda-mps-control -d')).toBeGreaterThan(-1);
    expect(b.indexOf('nvidia-cuda-mps-control -d')).toBeLessThan(b.lastIndexOf('bash /workspace/agent.sh'));
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
  it('transit: the gpu host sends the guarded copy as Opus and no FLAC; finish decodes it back, recreates the placeholder, records the codec', () => {
    const r = JSON.parse(py(`
import hashlib
open(os.path.join(d, 'in.mp3'), 'w').close(); open(os.path.join(d, 'out.flac'), 'w').close()
subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-ac', '1', '-ar', '48000', os.path.join(d, 'post/unipase.flac')], check=True)
open(os.path.join(d, 'work.json'), 'w').write('{"paragraphs": []}')
sha = hashlib.sha256(open(os.path.join(d, 'work.json'), 'rb').read()).hexdigest()
json.dump({'kind': 'restore', 'post': {'mode': 'restore', 'work_sha': sha, 'max_fallback_pct': 15}}, open(os.path.join(d, 'job.json'), 'w'))
json.dump({'audio_s': 2}, open(os.path.join(d, 'restore-result.json'), 'w'))
json.dump({'fallback_sent_pct': 40, 'sentences': 10}, open(os.path.join(d, sr.GUARD_OUT), 'w'))
sr.send(d, sr.paths(d)[2])
sent = sorted(os.path.relpath(os.path.join(a, f), d) for a, _, fs in os.walk(d) for f in fs)
res = sr.finish(d, run=lambda cmd, **kw: (_ for _ in ()).throw(AssertionError('ran ' + str(cmd))))
flac = os.path.join(d, 'post/unipase.flac')
codec = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,sample_rate', '-of', 'csv=p=0', flac], capture_output=True, text=True).stdout.strip()
print(json.dumps({'sent': sent, 'codec': codec, 'out': os.path.getsize(os.path.join(d, 'out.flac')), 'ogg_left': os.path.exists(os.path.join(d, sr.TRANSIT_OGG)), 'transit': res['transit']}))`));
    expect(r.sent.filter((f) => f.endsWith('.flac'))).toEqual([]);   // nothing decoded leaves the gpu host
    expect(r.sent).toContain('post/unipase.ogg');
    expect(r.codec).toBe('flac,48000');
    expect(r.out).toBe(0);
    expect(r.ogg_left).toBe(false);   // the master is the FLAC from here; the transit copy is not adopted
    expect(r.transit).toEqual({ tool: 'ffmpeg libopus', settings: { codec: 'libopus', b: '96k', ar: 48000, ac: 1, application: 'audio' } });
  });
  it('transit: a result from before (FLAC sent) is read as is; a whole job on one host keeps its FLAC (only typed gpu jobs send Opus)', () => {
    expect(py(`
open(os.path.join(d, 'post/unipase.flac'), 'w').write('x')
print(json.dumps([sr.receive(d), open(os.path.join(d, 'post/unipase.flac')).read(), os.path.exists(os.path.join(d, 'out.flac'))]))`)).toBe('[null, "x", true]');
    expect(phases).toMatch(/mode==='gpu'&&ctx\.type==='gpu'\?\{SIFTER_TRANSIT:'1'\}/);
  });
});
