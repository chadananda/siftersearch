// The UniPASE remaster (Chad 10-23): RunPod backfill (budget, pods always terminated, resume), the tower stages (word guard
// verdict, realign with the original times kept, eligibility), the guard's sentence decisions.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import * as C from '../../api/lib/media/cloud.js';
import { remasterEligible, isRemastered } from '../../api/lib/media/enhance.js';
import { mediaCloudRemasterJob } from '../../api/lib/ops/media-jobs.js';
import { runItem } from '../../api/lib/media/item.js';

describe('cloud budget', () => {
  it('spend = closed + live pods × age; stops at the cap, below the kept balance, or when the next 10 min would pass the cap', () => {
    const now = 10 * 3600_000;
    const st = { spent_closed: 10, pods: { a: { created: now - 3600_000, costPerHr: 0.34 }, b: { created: now - 1800_000, costPerHr: 0.34, terminated: now - 60_000 } } };
    expect(C.spendOf(st, now)).toBe(10.34);
    expect(C.budgetStop(st, 150, now)).toBeNull();
    expect(C.budgetStop(st, 85, now)).toMatch(/balance \$85 < \$90/);
    expect(C.budgetStop({ spent_closed: 60, pods: {} }, 150, now)).toMatch(/cap \$60/);
    expect(C.budgetStop({ spent_closed: 59.9, pods: { a: { created: now, costPerHr: 3 } } }, 150, now)).toMatch(/next 10 min/);
  });
});

describe('the RunPod backfill', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'cr-'));
    const items = {};
    for (const id of [1, 2]) {
      const dir = join(root, `t${id}`); mkdirSync(join(dir, 'original'), { recursive: true });
      writeFileSync(join(dir, 'original', 'a.mp3'), 'x'); writeFileSync(join(dir, 'meta.json'), JSON.stringify({ original: 'original/a.mp3', duration_s: 600 }));
      items[id] = { id, slug: `talk-${id}`, dir, duration_s: 600 };
    }
    const calls = [], spool = {};
    let pods = 0;
    const cloud = { ...C,
      createPod: vi.fn(async () => ({ id: `p${++pods}`, costPerHr: 0.34 })),
      getPod: vi.fn(async () => ({ publicIp: '1.2.3.4', portMappings: { 22: 2222 }, machine: { gpuDisplayName: 'RTX 4090' } })),
      terminatePod: vi.fn(async (id) => { calls.push(`terminate ${id}`); return {}; }),
      accountBalance: vi.fn(async () => ({ balance: 157 })) };
    // a fake pod: ssh commands and scp transfers
    const run = vi.fn(async (cmd, args) => {
      const last = args.at(-1);
      if (cmd === 'scp') {
        const [src, dst] = args.slice(-2);
        if (dst.includes('/spool/') && dst.includes('/in.')) { const job = dst.split('/spool/')[1].split('/')[0]; spool[job] = 'uploaded'; }
        if (src.includes('root@')) { const f = src.split('/').pop(); writeFileSync(dst, f === 'done.json' ? '{"audio_s":600,"seconds":40,"gpu":"RTX 4090"}' : f === 'asr.json' ? '{"segments":[]}' : 'FLAC'); }
        return { stdout: '' };
      }
      if (last.includes('.worker-ready')) return { stdout: 'READY' };
      if (last.startsWith('cd /workspace/spool')) return { stdout: Object.keys(spool).filter((j) => spool[j] === 'ready').map((j) => `DONE ${j}`).join('\n') };
      const m = /touch \/workspace\/spool\/([^/]+)\/ready/.exec(last); if (m) spool[m[1]] = 'ready';
      const r = /rm -rf \/workspace\/spool\/(\S+)/.exec(last); if (r) delete spool[r[1]];
      return { stdout: 'ok' };
    });
    const queued = [];
    const deps = { cloud, run, minHours: 0, homeHosts: [], stateFile: join(root, 'state.json'), publicKey: 'ssh-ed25519 AAA test', nap: async () => {}, draining: () => false,
      repo: { getMediaItem: async (id) => items[id], getMediaBySlug: async (s) => Object.values(items).find((x) => x.slug === s), remasterCandidates: async () => Object.values(items) },
      queue: async (n, p) => queued.push([n, p]) };
    return { root, items, deps, calls, queued, cloud };
  };
  it('pilot: pods boot, talks go up and come back into the talk folder, each talk queued for its tower run, every pod terminated', async () => {
    const t = setup();
    const r = await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 1 }, t.deps);
    expect(r).toMatchObject({ done: 2, failed: 0, queue: 0, in_flight: 0 });
    expect(t.queued).toEqual([['media-remaster', { id: 1 }], ['media-remaster', { id: 2 }]]);
    for (const id of [1, 2]) for (const f of ['unipase.cloud.flac', 'unipase.asr.json', 'unipase.done.json']) expect(existsSync(join(t.items[id].dir, 'enhanced', f)), `${id} ${f}`).toBe(true);
    expect(t.calls).toEqual(['terminate p1']);
    const st = JSON.parse(readFileSync(join(t.root, 'state.json'), 'utf8'));
    expect(st.finished).toBeTruthy();
  });
  it('the budget stops the run and terminates the pods; a drain yields WITHOUT terminating (re-attached later)', async () => {
    const t = setup();
    t.cloud.accountBalance = vi.fn(async () => ({ balance: 80 }));
    const r = await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 1 }, t.deps);
    expect(r.stop).toMatch(/balance/);
    const t2 = setup();
    let n = 0;
    t2.deps.draining = () => ++n > 3;
    const r2 = await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 1 }, t2.deps);
    expect(r2.yielded).toBe(true);
    expect(t2.calls).toEqual([]);
  });
  it('home hosts take talks beside the pods; when the money stops the pods, the home hosts finish the queue', async () => {
    const t = setup();
    t.cloud.accountBalance = vi.fn(async () => ({ balance: 80 }));   // below the floor from the start → no pod at all
    const homeRemaster = vi.fn(async (h, it) => ({ audio_s: it.duration_s, seconds: 30 }));
    const r = await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 3 }, { ...t.deps, homeHosts: ['aorus'], homeRemaster, ops: { pendingRuns: async () => [] },
      tools: { diskOk: () => true, coolEnough: () => true, asrLoad: () => ({}) } });
    expect(r).toMatchObject({ done: 2, home_done: 2, queue: 0 });
    expect(r.cloud_stopped).toMatch(/balance/);
    expect(t.cloud.createPod).not.toHaveBeenCalled();
    expect(t.queued.map((q) => q[1].id).sort()).toEqual([1, 2]);
  });
  it('no home work while a transcription waits in the queue (ASR keeps priority)', async () => {
    const t = setup();
    t.cloud.accountBalance = vi.fn(async () => ({ balance: 80 }));
    const homeRemaster = vi.fn(async (h, it) => ({ audio_s: it.duration_s, seconds: 30 }));
    let n = 0;
    t.deps.draining = () => ++n > 5;   // stop after a few ticks
    const r = await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 3 }, { ...t.deps, homeHosts: ['aorus'], homeRemaster, ops: { pendingRuns: async () => [{ status: 'queued' }] },
      tools: { diskOk: () => true, coolEnough: () => true, asrLoad: () => ({}) } });
    expect(homeRemaster).not.toHaveBeenCalled();
    expect(r.yielded).toBe(true);
  });
  it('a home host that is hot or has no free ASR slot is not given work', async () => {
    const { homeEligible } = await import('../../api/lib/ops/media-jobs.js');
    const T = { diskOk: () => true, coolEnough: (h) => h !== 'boss', asrLoad: () => ({ aorus: { busy: 2, slots: 2 } }) };
    expect(homeEligible('boss', T)).toBe(false);
    expect(homeEligible('aorus', T)).toBe(false);
    expect(homeEligible('aorus', { ...T, asrLoad: () => ({ aorus: { busy: 1, slots: 2 } }) })).toBe(true);
    expect(homeEligible('aorus', { ...T, diskOk: () => false, asrLoad: () => ({}) })).toBe(false);
  });
  it('a resume after a drain keeps its queue (its explicit ids are not queued again)', async () => {
    const t = setup();
    let n = 0;
    t.deps.draining = () => ++n > 3;
    await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 1 }, t.deps);
    const before = JSON.parse(readFileSync(join(t.root, 'state.json'), 'utf8'));
    t.deps.draining = () => true;   // the resumed run yields at once
    await mediaCloudRemasterJob({ write: true, ids: [1, 2], maxPods: 1, force: true }, t.deps);
    const after = JSON.parse(readFileSync(join(t.root, 'state.json'), 'utf8'));
    expect(after.queue).toEqual(before.queue);
  });
  it('dry run lists the B–E candidates and the hours', async () => {
    const t = setup();
    expect(await mediaCloudRemasterJob({}, t.deps)).toMatchObject({ talks: 2, hours: 0.3 });
  });
});

describe('remaster eligibility', () => {
  it('B–E by default, A transparent; the non-English skip is a flag, off by default', () => {
    expect(remasterEligible({ quality: { overall: 'B' } }).ok).toBe(true);
    expect(remasterEligible({ quality: { overall: 'A' } }).ok).toBe(true);
    const ps = [{ t0: 0, t1: 100, lang: 'fa' }, { t0: 100, t1: 600, lang: 'en' }];
    expect(remasterEligible({ quality: { overall: 'D' } }, ps).ok).toBe(true);
    expect(remasterEligible({ quality: { overall: 'D' } }, ps, { MEDIA_REMASTER_SKIP_NONEN: '1' }).ok).toBe(false);
  });
});

describe('tower stages: guard verdict, realign keeps the original times, revert', () => {
  const talk = (guardPct) => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-'));
    mkdirSync(join(dir, 'enhanced'), { recursive: true }); mkdirSync(join(dir, 'original'), { recursive: true });
    for (const f of ['unipase.cloud.flac', 'unipase.asr.json']) writeFileSync(join(dir, 'enhanced', f), '{}');
    writeFileSync(join(dir, 'transcript.raw.json'), '{"segments":[]}');
    const words = [{ w: 'Today,', s: 1.0, e: 1.5 }, { w: 'the', s: 1.5, e: 1.7 }, { w: 'world', s: 1.7, e: 2.0 }];
    writeFileSync(join(dir, 'transcript.work.json'), JSON.stringify({ paragraphs: [{ n: 1, t0: 1.0, t1: 2.0, words, sentences: [[0, 3]] }] }));
    const meta = { slug: 'x', original: 'original/a.mp3', quality: { overall: 'D' }, moments: [{ para: 1, i0: 0, i1: 3, t0_ms: 1000, t1_ms: 2000 }],
      enhancement: { listening: 'safe', variants: [{ name: 'original', file: 'original/a.mp3' }, { name: 'safe', file: 'original/a.mp3', af: 'loudnorm' }] },
      stages: Object.fromEntries(['archive', 'grade', 'enhance', 'web', 'transcribe', 'diarize', 'trim', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog', 'headings', 'quotes', 'links', 'assess', 'update'].map((k) => [k, { at: 'x' }])) };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
    const tools = { remasterGuard: vi.fn(async () => ({ sentences: 20, swapped: guardPct ? 1 : 0, swapped_pct: guardPct, fallback_sent_pct: guardPct, lag_ms: 25 })),
      tool: vi.fn(async (sub, input, opts) => { writeFileSync(opts.output, JSON.stringify({ times: { 1: [[1.03, 1.52], [1.53, 1.72], null] } })); return { placed: 2, total: 2 }; }) };
    const deps = { tools, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' };
    return { dir, deps, tools, item: { id: 5, dir, state: 'done', source_kind: 'file' } };
  };
  it('applies a replacement worker alignment even when the variant name stays unipase, and preserves the worker signature', async () => {
    const t = talk(0), { createHash } = await import('node:crypto');
    const mf = join(t.dir, 'meta.json'), wf = join(t.dir, 'transcript.work.json');
    const m = JSON.parse(readFileSync(mf, 'utf8')); m.enhancement.listening = 'unipase'; m.aligned_to = 'unipase'; m.remaster = {status:'done'};
    m.enhancement.variants.push({name:'unipase',file:'enhanced/unipase.flac',shifts_time:true}); writeFileSync(mf,JSON.stringify(m));
    const pd=join(t.dir,'enhanced/pod'); mkdirSync(pd);
    const hash=()=>createHash('sha256').update(readFileSync(wf)).digest('hex');
    writeFileSync(join(pd,'post.json'),JSON.stringify({ok:true,guard:{},work_sha:hash(),realign:{placed:3,total:3}}));
    writeFileSync(join(pd,'realign.json'),JSON.stringify({placed:3,total:3,times:{'1':[[1.1,1.6],[1.6,1.8],[1.8,2.1]]}}));
    await runItem(t.item,{redo:['realign'],only:['realign']},t.deps);
    expect(JSON.parse(readFileSync(wf,'utf8')).paragraphs[0].words[0].s).toBe(1.1);
    expect(JSON.parse(readFileSync(join(pd,'post.json'),'utf8')).work_sha).toBe(hash());
    expect(t.tools.tool).not.toHaveBeenCalled();
  });
  it('a continuous copy (no sentence from the original) → the UniPASE copy is the listening copy; words re-aligned with s0/e0 kept; moments follow', async () => {
    const t = talk(0);
    await runItem(t.item, { redo: ['remaster', 'realign'], only: ['remaster', 'realign'], remaster: true }, t.deps);
    const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
    expect(meta.enhancement.listening).toBe('unipase');
    expect(isRemastered(meta)).toBe(true);
    expect(meta.remaster).toMatchObject({ status: 'done', verdict: 'pass-auto', swapped_pct: 0 });
    expect(meta.aligned_to).toBe('unipase');
    const w = JSON.parse(readFileSync(join(t.dir, 'transcript.work.json'), 'utf8')).paragraphs[0].words;
    expect(w[0]).toMatchObject({ s: 1.03, e: 1.52, s0: 1.0, e0: 1.5 });
    expect(w[2]).toMatchObject({ s: 1.7, s0: 1.7 });                 // unplaced: keeps its time
    expect(meta.moments[0]).toMatchObject({ t0_ms: 1030, t1_ms: 2000 });
  });
  it('a guard that had to keep 50 % of sentences → review (high fallback), the transparent copy stays', async () => {
    const t = talk(50);
    await runItem(t.item, { redo: ['remaster', 'realign'], only: ['remaster', 'realign'], remaster: true }, t.deps);
    const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
    expect(meta.enhancement.listening).toBe('safe');
    expect(meta.remaster).toMatchObject({ status: 'review', verdict: 'review' });
    expect(t.tools.tool).not.toHaveBeenCalled();
  });
  it('NEVER A SPLICE (Chad 10-29): a copy with even one sentence from the original is held, never the listening copy', async () => {
    const t = talk(5);
    await runItem(t.item, { redo: ['remaster'], only: ['remaster'], remaster: true }, t.deps);
    const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
    expect(meta.enhancement.listening).not.toBe('unipase');
    expect(meta.remaster.status).toBe('review'); expect(meta.remaster.why).toMatch(/mixes original and remastered/);
  });
  it('without a remaster run the stages do nothing', async () => {
    const t = talk(5);
    await runItem(t.item, { redo: ['remaster', 'realign'], only: ['remaster', 'realign'] }, t.deps);
    expect(t.tools.remasterGuard).not.toHaveBeenCalled();
  });
});

describe('the word guard (python)', () => {
  it('a lost name or number swaps the sentence; one lost common word within the churn floor does not', () => {
    const out = execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, 'scripts/media')
import remaster_guard as G
s=[(1,0,[{'w':'Today,','s':0,'e':.5},{'w':'the','s':.5,'e':.7},{'w':'world','s':.7,'e':1},{'w':'is','s':1,'e':1.2},{'w':'confronted','s':1.2,'e':1.8}]),
   (1,1,[{'w':'Bahá’u’lláh','s':2,'e':2.6},{'w':'came','s':2.6,'e':2.9},{'w':'in','s':2.9,'e':3},{'w':'1863','s':3,'e':3.6}])]
a=[{'w':'today','s':0,'e':.5},{'w':'the','s':.5,'e':.7},{'w':'world','s':.7,'e':1},{'w':'confronted','s':1.2,'e':1.8},{'w':'Bahaullah','s':2,'e':2.6},{'w':'came','s':2.6,'e':2.9},{'w':'in','s':2.9,'e':3},{'w':'1864','s':3,'e':3.6}]
print(json.dumps([d['swap'] for d in G.decide(s,a)]))`], { encoding: 'utf8' });
    expect(JSON.parse(out.trim())).toEqual([false, true]);
  });
  it('the final text is the yardstick: words the original\'s ASR also missed are not losses; Persian is guarded; chant is unguardable', () => {
    const out = execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, 'scripts/media')
import remaster_guard as G
W=lambda ws,t0: [{'w':w,'s':t0+i*0.4,'e':t0+i*0.4+0.35} for i,w in enumerate(ws)]
s=[(1,0,W('the world is confronted by a crisis'.split(),0)),
   (2,0,W('امروز جهان در بحران است'.split(),10)),
   (3,0,W('alla hu abha alla hu abha alla hu abha'.split(),20))]
orig=W('the world is by a'.split(),0)+W('امروز جهان در بحران است'.split(),10)+[{'w':'ah','s':21,'e':21.3}]
copy=W('the world is by a'.split(),0)+W('امروز در است'.split(),10)
r=G.decide(s,copy,ref_words=orig)
print(json.dumps([[d['swap'],d['unguardable']] for d in r]), G.norm('ي')==G.norm('ی'))`], { encoding: 'utf8' });
    const [line] = out.trim().split('\n');
    expect(JSON.parse(line.slice(0, line.lastIndexOf(' ')))).toEqual([[false, false], [true, false], [false, true]]);
    expect(out).toContain('True');
  });
  it('a word the original heard with LOW confidence and the copy hears differently is not a loss; a confident one is', () => {
    const out = execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, 'scripts/media')
import remaster_guard as G
W=lambda ws,t0,p=0.95: [{'w':w,'s':t0+i*0.4,'e':t0+i*0.4+0.35,'p':p} for i,w in enumerate(ws)]
s=[(1,0,W('we sent the letter to the guardian today'.split(),0))]
copy=W('we sent the better to a guardian today'.split(),0)
low=W('we sent the'.split(),0)+[{'w':'letter','s':1.2,'e':1.55,'p':0.4},{'w':'to','s':1.6,'e':1.95},{'w':'the','s':2.0,'e':2.35,'p':0.5}]+W('guardian today'.split(),2.4)
high=W('we sent the letter to the guardian today'.split(),0)
print(json.dumps([G.decide(s,copy,ref_words=low)[0]['swap'], G.decide(s,copy,ref_words=high)[0]['swap']]))`], { encoding: 'utf8' });
    expect(JSON.parse(out.trim())).toEqual([false, true]);
  });
});

describe('backfill order and pod setup', () => {
  it('language runs: consecutive paragraphs of one language joined, boundaries halfway, the first from 0, codes folded', async () => {
    const { languageRuns } = await import('../../api/lib/ops/media-jobs.js');
    expect(languageRuns([{ t0: 2, t1: 10, lang: 'En' }, { t0: 12, t1: 20, lang: 'Eng' }, { t0: 22, t1: 30, lang: 'fa' }, { t0: 31, t1: 40, lang: 'en' }], 45))
      .toEqual([{ s: 0, e: 21, lang: 'en' }, { s: 21, e: 30.5, lang: 'fa' }, { s: 30.5, e: 46, lang: 'en' }]);
  });
  it('worst first: E → B, then narrowest bandwidth, then lowest SNR, unknowns last', async () => {
    const { worstFirst } = await import('../../api/lib/ops/media-jobs.js');
    const o = worstFirst([{ id: 1, grade: 'B', bw: 3, snr: 5 }, { id: 2, grade: 'E', bw: 8, snr: 20 }, { id: 3, grade: 'E', bw: 4, snr: 30 },
      { id: 4, grade: 'E', bw: 4, snr: 10 }, { id: 5, grade: 'D', bw: null, snr: 1 }, { id: 6, grade: 'D', bw: 2, snr: 40 }]);
    expect(o.map((x) => x.id)).toEqual([4, 3, 2, 6, 5, 1]);
  });
  it('the pod fetches the pinned weights, verifies every sha256, installs no espnet / Hub tooling, and runs the worker offline', () => {
    expect(C.WEIGHTS.filter((w) => w[0] === 'unipase').map((w) => w[2])).toEqual(['DeWavLM-Omni.pt', 'Adapter.pt', 'Vocoder_DWO-L1.pt', 'PostNet.pt', 'config.json']);
    expect(C.BOOTSTRAP).toContain(`unipase/resolve/${C.UNIPASE_REV}`);
    expect(C.BOOTSTRAP).toMatch(/SHA MISMATCH/);
    expect(C.BOOTSTRAP).not.toMatch(/espnet|huggingface_hub|Vocoder_WavLM/);
    expect(C.BOOTSTRAP).toMatch(/HF_HUB_OFFLINE=1/);
    expect(C.REPO_TGZ()).toContain(C.UNIPASE_COMMIT.slice(0, 8));
  });
});

describe('morning review picks', () => {
  it('publish → the full UniPASE copy becomes the listening copy and the talk is re-encoded; keep → marked, untouched', async () => {
    const { mediaRemasterDecideJob } = await import('../../api/lib/ops/media-jobs.js');
    const mk = (id) => { const dir = mkdtempSync(join(tmpdir(), 'dc-')); mkdirSync(join(dir, 'enhanced')); writeFileSync(join(dir, 'meta.json'), JSON.stringify({ original: 'o.mp3', enhancement: { listening: 'safe', variants: [{ name: 'safe' }] }, remaster: { status: 'review' } })); return { id, slug: `t${id}`, dir }; };
    const items = { 1: mk(1), 2: mk(2) };
    const queued = [];
    const ffmpeg = vi.fn(async () => ({}));
    const r = await mediaRemasterDecideJob({ picks: [{ id: 1, choice: 'publish' }, { slug: 't2', choice: 'keep' }] },
      { repo: { getMediaItem: async (id) => items[id], getMediaBySlug: async (s) => Object.values(items).find((x) => x.slug === s) }, tools: { ffmpeg }, queue: async (n, p) => queued.push([n, p]) });
    expect(r).toMatchObject({ published: ['t1'], kept: ['t2'] });
    const m1 = JSON.parse(readFileSync(join(items[1].dir, 'meta.json'), 'utf8'));
    expect(m1.enhancement).toMatchObject({ listening: 'unipase', listening_before: { name: 'safe' } });
    expect(m1.enhancement.variants.find((v) => v.name === 'unipase')).toMatchObject({ file: 'enhanced/unipase.full.flac', shifts_time: true });
    expect(queued).toEqual([['media-item', { id: 1, remaster: true, redo: ['realign', 'web', 'trim', 'update'] }]]);
    expect(JSON.parse(readFileSync(join(items[2].dir, 'meta.json'), 'utf8')).remaster.status).toBe('kept');
  });
});

describe('one remaster run per talk', () => {
  it('a second run for the same talk waits for the first', async () => {
    const { mediaRemasterJob } = await import('../../api/lib/ops/media-jobs.js');
    const order = [];
    let release;
    const gate = new Promise((r) => { release = r; });
    let n = 0;
    const deps = { runItem: async () => { const k = ++n; order.push(`start${k}`); if (k === 1) await gate; order.push(`end${k}`); return { yielded: true }; },
      repo: { getMediaItem: async () => null } };
    const db = await import('../../api/lib/db.js');
    db.queryOne.mockResolvedValue({ id: 77, slug: 't77', state: 'done', dir: null });
    const a = mediaRemasterJob({ id: 77 }, deps), b = mediaRemasterJob({ id: 77 }, deps);
    await new Promise((r) => setTimeout(r, 20));
    release(); await Promise.allSettled([a, b]);
    db.queryOne.mockReset();
    expect(order).toEqual(['start1', 'end1', 'start2', 'end2']);
  });
});
