import {it,expect} from 'vitest';import {execFileSync} from 'node:child_process';
it('rejects traversal, arbitrary input/output names, and arbitrary job identities',()=>{
 const r=execFileSync('python3',['-c',`
from scripts.media.whole_gate import job_dir,INPUT,OUTPUT
for s in ['../escape','anything','recording-../escape','recording-a;id']:
 try:job_dir(s);raise AssertionError(s)
 except ValueError:pass
assert not INPUT.fullmatch('../job.json') and not INPUT.fullmatch('script.py')
assert not OUTPUT.fullmatch('post/../../key') and not OUTPUT.fullmatch('post/script.py')
assert INPUT.fullmatch('in.mp3') and OUTPUT.fullmatch('post/unipase.flac')
print('restricted')`],{encoding:'utf8'});expect(r.trim()).toBe('restricted');
});

it('install-whole-image writes only an allowed image, pulls a missing digest, refuses anything else', () => {
 const r = execFileSync('python3', ['-c', `
import tempfile, pathlib, types
import scripts.media.whole_gate as g
d = pathlib.Path(tempfile.mkdtemp()); g.__file__ = str(d / 'whole_gate.py')
calls = []
class R:
    def __init__(s, rc): s.returncode = rc
def fake(*a, check=True):
    calls.append(a); return R(1 if a[:2] == ('image', 'inspect') and 'sha256' in a[2] else 0)
g.docker = fake
dig = 'ghcr.io/chadananda/sifter-media-worker@sha256:' + 'a' * 64
g.install_image('cpu', dig)
assert (d / 'whole-image.txt').read_text().strip() == dig and ('pull', dig) in calls
g.install_image('rocm', 'sifter-media-worker:rocm-gpu-20261101-t8')
assert (d / 'whole-image-rocm.txt').read_text().strip() == 'sifter-media-worker:rocm-gpu-20261101-t8'
for k, ref in [('cpu', 'sifter-media-worker:rocm-x'), ('rocm', 'evil/image:latest'), ('rocm', '$(id)'), ('gpu', dig), ('cpu', None)]:
    try: g.install_image(k, ref); raise AssertionError((k, ref))
    except ValueError: pass
assert (d / 'whole-image.txt').read_text().strip() == dig
print('ok')`], { encoding: 'utf8' });
 expect(r.trim().split('\n').at(-1)).toBe('ok');
});

it('gate whole order installs the host image first and stops if the install fails', async () => {
 const { gateWholeRecording } = await import('../../api/lib/media/gate-recording.js');
 const { mkdtemp, writeFile } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
 const dir = await mkdtemp(join(tmpdir(), 'gw-')); await writeFile(join(dir, 'in.mp3'), 'x');
 const seen = [], mk = (failInstall) => ({ run: async (_c, a) => { const v = a.at(-1); seen.push(v); if (v.startsWith('whole-poll')) return { stdout: 'null' }; if (failInstall && v.startsWith('install-whole-image')) throw Error('Image not on this host'); if (v.startsWith('whole-start')) throw Error('stop here'); return { stdout: '' }; } });
 const it0 = { id: 7, dir, slug: 's' }, m = { original: 'in.mp3', slug: 's', stages: { archive: { at: 'x' } } };
 const digest = 'ghcr.io/chadananda/sifter-media-worker@sha256:' + 'b'.repeat(64);
 await expect(gateWholeRecording(it0, m, { T: mk(false), host: 'boss', image: digest, stop: () => false, nap: async () => {}, sha: 'c'.repeat(64) })).rejects.toThrow(/stop here/);
 expect(seen.find((v) => v.startsWith('install-whole-image'))).toMatch(/^install-whole-image (rocm|cpu) /);
 expect(seen.findIndex((v) => v.startsWith('install-whole-image'))).toBeLessThan(seen.findIndex((v) => v.startsWith('whole-put')));
 seen.length = 0;
 await expect(gateWholeRecording(it0, m, { T: mk(true), host: 'boss', image: digest, stop: () => false, nap: async () => {}, sha: 'c'.repeat(64) })).rejects.toThrow(/not on this host/);
 expect(seen.some((v) => v.startsWith('whole-put'))).toBe(false);
});
