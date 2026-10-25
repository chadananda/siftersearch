// Tower never runs heavy media work (Chad 10-24): the central gate in tools.js. Heavy → WorkerWait (the item waits in the queue);
// web encodes ONE at a time, light analysis two; MEDIA_TOWER_HEAVY=1 lifts it.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
const repoState = { item: null, updates: [] };
vi.mock('../../api/lib/repos/media-repo.js', async (orig) => ({ ...(await orig()), getMediaItem: async () => repoState.item, updateMediaItem: async (id, u) => { repoState.updates.push(u); } }));
import { towerClass, run, WorkerWait, detachedTool, towerGuardState } from '../../api/lib/media/tools.js';
import { mediaItemJob } from '../../api/lib/ops/media-jobs.js';

const PY = '/home/chad/sifter/venvs/media/bin/python', MT = '/x/scripts/media/media_tool.py';
describe('what tower may run', () => {
  it('classifies', () => {
    for (const sub of ['dfn', 'grade', 'diarize', 'transcribe', 'realign', 'langid', 'probe', 'encode']) expect(towerClass(PY, [MT, sub, '/a.mp3'])).toBe('refuse');
    expect(towerClass(PY, ['/x/remaster_guard.py', '--original', 'a'])).toBe('refuse');
    for (const sub of ['metrics', 'levels', 'spkscreen']) expect(towerClass(PY, [MT, sub, '/a.mp3'])).toBe('light');
    expect(towerClass('ffmpeg', ['-i', 'a.mp3', '-af', 'highpass=f=70,loudnorm', '-ar', '48000', 'o.flac'])).toBe('refuse');   // the prep 'light' recipe: a worker exists
    expect(towerClass('ffmpeg', ['-i', 'a.flac', '-c:a', 'libopus', '-b:a', '96k', 'o.ogg'])).toBe('encode');
    expect(towerClass('ffmpeg', ['-i', 'a.ogg', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'])).toBe('light');   // waveform decode
    expect(towerClass('ffmpeg', ['-i', 'a.mp3', '-ac', '1', '-ar', '16000', 'o.flac'])).toBe('light');             // the ASR hand-off conversion
    expect(towerClass('ssh', ['boss', 'poll'])).toBe('free');
  });
  it('a heavy command is refused before it starts (WorkerWait), never spawned', async () => {
    await expect(run(PY, [MT, 'dfn', '/a.mp3'])).rejects.toBeInstanceOf(WorkerWait);
    await expect(run('ffmpeg', ['-i', 'a.mp3', '-af', 'loudnorm', 'o.flac'])).rejects.toMatchObject({ code: 'WORKER_WAIT' });
    await expect(detachedTool('grade', '/a.mp3', {}, { pidFile: '/nonexistent/x.pid' })).rejects.toBeInstanceOf(WorkerWait);
  });
  it('light and encode work is admitted through bounded slots', async () => {
    const st = towerGuardState();
    expect(st.encode.limit).toBe(1); expect(st.light.limit).toBe(2);
    expect((await run('echo', ['ok'])).stdout.trim()).toBe('ok');   // a free command
  });
  it('MEDIA_TOWER_HEAVY=1 lifts the gate (maintenance only)', async () => {
    process.env.MEDIA_TOWER_HEAVY = '1';
    try { await expect(run('echo', ['x'])).resolves.toBeTruthy(); expect(towerClass(PY, [MT, 'dfn', 'a'])).toBe('refuse'); } finally { delete process.env.MEDIA_TOWER_HEAVY; }
  });
});

describe('an item whose stage found no worker waits in the queue instead of failing', () => {
  it('state goes back to queued with a reason; a published talk is left as it is', async () => {
    const deps = { runItem: async () => { throw new WorkerWait('media_tool dfn'); }, waitMs: 1 };
    repoState.item = { id: 1, slug: 's', dir: '/x', state: 'running', stages_done: '' }; repoState.updates = [];
    const r = await mediaItemJob({ id: 1 }, deps);
    expect(r).toMatchObject({ waiting: true }); expect(repoState.updates.at(-1)).toMatchObject({ state: 'queued' }); expect(repoState.updates.at(-1).why).toMatch(/waiting for a worker/);
    repoState.item = { id: 2, slug: 's', dir: '/x', state: 'done', published_at: 'x', stages_done: ',catalog,' }; repoState.updates = [];
    await mediaItemJob({ id: 2 }, deps);
    expect(repoState.updates).toEqual([]);
  });
});
