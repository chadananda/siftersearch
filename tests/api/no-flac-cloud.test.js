// No FLAC/WAV is ever put to the edge (R2), by any typed step (Chad 10-31: "never store flac in the cloud"): the agent's plan, the client
// and the Worker each refuse it; a cloud finish's master travels as an Opus transit and tower decodes it back on adoption.
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudPlan, isDecoded, transitName, REBUILT, untransitArgs } from '../../scripts/media/worker/transit.mjs';
import { queueClient } from '../../api/lib/media/queue-client.mjs';
import { decodedAudio } from '../../worker/queue/core.js';
import { CONTRACT, requiredFiles, validateTyped, AUDIO_TYPES } from '../../api/lib/media/stage-jobs.js';
import { untransit } from '../../api/lib/media/queue-feed.js';

const H = (c) => c.repeat(64);
// every name a type's contract lists (fixed + restore_files), templated ones filled in, plus decoded extras a step might list
const namesOf = (type) => {
  const o = CONTRACT.types[type].outputs;
  return [...o.files, ...(o.restore_files || [])].filter((f) => !f.startsWith('…')).map((f) => f.replace('{slug}', 't'))
    .concat(['enhanced/dfn.flac', 'restore/post/unipase.flac', 'restore/out.WAV']);
};

describe('no .flac/.wav name is ever put to the edge, by any type', () => {
  it('cloudPlan: for every type in job-types.json, nothing decoded is sent; each decoded non-REBUILT file goes as a transit', () => {
    expect(Object.keys(CONTRACT.types).sort()).toEqual([...AUDIO_TYPES].sort());
    for (const type of Object.keys(CONTRACT.types)) {
      const files = namesOf(type).map((path) => ({ path, sha256: H('a') }));
      const { send, transit } = cloudPlan(files, { cloud: true });
      expect(send.filter(isDecoded)).toEqual([]);
      for (const f of files.filter((x) => isDecoded(x.path) && !REBUILT.has(x.path))) expect(transit).toContainEqual({ path: transitName(f.path), of: f.path });
      for (const r of REBUILT) expect(send).not.toContain(r);
      expect(cloudPlan(files, { cloud: false }).send).toEqual(files.map((f) => f.path));   // the LAN takes the listed files as they are
    }
    expect(cloudPlan([{ path: 'enhanced/unipase.flac' }], { cloud: true }).send).toEqual(['enhanced/unipase.transit.ogg']);
  });

  it('the client refuses a decoded name on a cloud (https) base before any byte moves; a LAN base still takes it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nf-')), f = join(dir, 'x.flac');
    await writeFile(f, 'x');
    const calls = [], fetch = async (url) => { calls.push(url); return new Response('{}', { status: 201 }); };
    const cloud = queueClient({ base: 'https://q', key: 'k', fetch });
    for (const [kind, name] of [['results', 'item/enhanced/unipase.flac'], ['files', 'item/enhanced/light.flac'], ['results', 'a/b.WAV']])
      await expect(cloud.put(kind, 'j1', name, f, { lease: 'L' })).rejects.toMatchObject({ status: 415 });
    expect(calls).toEqual([]);
    await cloud.put('results', 'j1', 'item/enhanced/unipase.transit.ogg', f, { lease: 'L' });
    await queueClient({ base: 'http://tower:7843/_q', key: 'k', fetch }).put('results', 'j1', 'item/enhanced/unipase.flac', f);
    expect(calls).toHaveLength(2);
  });

  it('the Worker refuses the names on every PUT (worker/queue/index.js answers 415)', async () => {
    for (const n of ['item/enhanced/unipase.flac', 'in.wav', 'x.FLAC']) expect(decodedAudio(n)).toBe(true);
    for (const n of ['item/restore/post/unipase.ogg', 'web/t.m4a', 'in.mp3', 'flac.json']) expect(decodedAudio(n)).toBe(false);
    const src = await readFile(new URL('../../worker/queue/index.js', import.meta.url), 'utf8');
    const put = src.slice(src.indexOf("if (req.method === 'PUT')"));
    expect(put.indexOf('Q.decodedAudio(name)')).toBeGreaterThan(0);
    expect(put.indexOf('Q.decodedAudio(name)')).toBeLessThan(put.indexOf('MEDIA_BUCKET.put'));   // before the store and the presign
    expect(put.indexOf('Q.decodedAudio(name)')).toBeLessThan(put.indexOf("presign(env, key, 'PUT')"));
  });
});

describe('a cloud cpu-finish: the master travels as Opus and is decoded back on tower', () => {
  const finish = (files) => ({ v: 1, type: 'cpu-finish', contract: CONTRACT.contract, ok: true, input_sha: 'abc', slug: 't', files, meta: { remaster: { status: 'review' } } });
  const listed = requiredFiles('cpu-finish').map((path) => ({ path, sha256: H('b') }));
  it('validateTyped counts the transit for the listed FLAC; a transit before finish is refused', () => {
    const files = listed.map((f) => (f.path === 'enhanced/unipase.flac' ? { path: 'enhanced/unipase.transit.ogg', sha256: H('c'), transit_of: f.path } : f));
    const r = finish(files);
    expect(() => validateTyped('cpu-finish', r, { inputSha: 'abc', slug: 't', outputs: files.map((f) => 'item/' + f.path) })).not.toThrow();
    expect(() => validateTyped('cpu-finish', finish([...files.slice(0, 1), { path: 'x.transit.ogg', sha256: H('d'), transit_of: '../x.flac' }]))).toThrow(/unsafe/);
    const gpu = { ...finish([]), type: 'gpu', files: requiredFiles('gpu').map((path) => ({ path, sha256: H('e') })).concat({ path: 'a.transit.ogg', sha256: H('f'), transit_of: 'a.flac' }) };
    expect(() => validateTyped('gpu', gpu)).toThrow(/only when cpu-finish/);
  });
  it('untransit decodes each transit to its listed name with an encode-class ffmpeg, drops the transit, records it in meta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ut-'));
    await writeFile(join(dir, 'u.transit.ogg'), 'ogg');
    const runs = [];
    const run = async (cmd, args) => { runs.push([cmd, args]); await writeFile(args.at(-1), 'flac'); return { stdout: '' }; };
    const meta = await untransit(dir, { files: [{ path: 'u.transit.ogg', sha256: H('a'), transit_of: 'u.flac' }, { path: 'meta.json', sha256: H('b') }] }, {}, { run, now: () => 0 });
    expect(runs).toHaveLength(1);
    expect(runs[0][1]).toEqual(untransitArgs(join(dir, 'u.transit.ogg'), join(dir, 'u.flac.part.flac')));
    expect(runs[0][1]).toEqual(expect.arrayContaining(['-c:a', 'flac']));
    expect(await readFile(join(dir, 'u.flac'), 'utf8')).toBe('flac');
    expect(existsSync(join(dir, 'u.transit.ogg'))).toBe(false);
    expect(meta.master_transit).toEqual([expect.objectContaining({ path: 'u.flac', via: 'u.transit.ogg' })]);
    expect(await untransit(dir, { files: [{ path: 'meta.json' }] }, { a: 1 }, { run })).toEqual({ a: 1 });   // a LAN result: untouched
    expect((await stat(join(dir, 'u.flac'))).size).toBe(4);
  });
  it('tower runs the decode in one encode slot, never as a refused filter chain', async () => {
    const { towerClass } = await import('../../api/lib/media/tools.js');
    expect(towerClass('ffmpeg', untransitArgs('/a/u.transit.ogg', '/a/u.flac.part.flac'))).toBe('encode');
  });
});
