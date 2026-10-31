// archive-sample: tower stages each candidate to the LAN queue (type 'intake'), a worker answers, tower pulls → R2 + sample + recommendation.
// "More info" → a deeper look whose answer returns the item to the undecided view. Real local queue on a temp dir; the repo is faked in memory.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ getDrive: vi.fn(), itemsToSample: vi.fn(), itemsWantingInfo: vi.fn(), itemsSampled: vi.fn(), resetSample: vi.fn(), setSample: vi.fn(), setRec: vi.fn(), answerInfo: vi.fn(), getItem: vi.fn() }));
import { archiveSampleJob, samplePass, stagePlan, rerecDrive, garbled, itemPath, clipKey, titleKey, SAMPLE_SECS, DEEP_SECS } from '../../api/lib/ops/archive-sample-job.js';
import { recommendFromSample, titlePage, introducedSpeaker, scriptLang, infoAnswer } from '../../api/lib/archives/sample-rec.js';

let root, R, q;
beforeAll(async () => {
  process.env.MEDIA_QUEUE_DIR = await mkdtemp(join(tmpdir(), 'iq-'));
  root = await mkdtemp(join(tmpdir(), 'drive-'));
  await mkdir(join(root, 'talks')); await mkdir(join(root, 'scan'));
  await writeFile(join(root, 'talks/a.mp3'), Buffer.alloc(10 * 1024 * 1024, 1));
  await writeFile(join(root, 'book.pdf'), 'pdf-bytes');
  for (const p of ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']) await writeFile(join(root, 'scan', p), p);
  R = await import('../../api/lib/repos/media-queue-repo.js');
  q = R.localQueue();
});
afterAll(() => R?._closeForTests());

describe('itemPath / stagePlan', () => {
  it('keeps paths inside the drive', () => {
    expect(itemPath('/tank/archives/g', 'a/b.mp3')).toBe('/tank/archives/g/a/b.mp3');
    expect(itemPath('/tank/archives/g', '../../etc/passwd')).toBeNull();
    expect(itemPath('/tank/archives/g', '')).toBeNull();
  });
  it('a talk stages only the head its first minute needs; a deep look more', async () => {
    const it0 = { kind: 'talk', primary_rel: 'talks/a.mp3', duration_s: 3600 };
    const p = await stagePlan(root, it0);
    expect(p).toMatchObject({ kind: 'talk', secs: SAMPLE_SECS });
    expect(p.files[0].end).toBeLessThan(3 * 1024 * 1024);
    expect((await stagePlan(root, it0, { deep: true })).files[0].end).toBeGreaterThan(p.files[0].end);
  });
  it('a page-image scan stages its first pages; a PDF the file', async () => {
    const scan = await stagePlan(root, { kind: 'scan', primary_rel: 'scan/p1.jpg', rel_paths: ['scan/p4.jpg', 'scan/p1.jpg', 'scan/p2.jpg', 'scan/p3.jpg'] });
    expect(scan.files.map((f) => f.name)).toEqual(['in/000.jpg', 'in/001.jpg', 'in/002.jpg']);
    expect(scan.files[0].src).toMatch(/p1\.jpg$/);
    expect((await stagePlan(root, { kind: 'book', primary_rel: 'book.pdf' })).files).toEqual([{ name: 'in/000.pdf', src: join(root, 'book.pdf') }]);
    await expect(stagePlan(root, { kind: 'talk', primary_rel: '../x.mp3' })).rejects.toThrow(/outside/);
  });
});

describe('samplePass', () => {
  const rig = (items, wanting = []) => {
    const saved = {}, recs = {}, answers = {}, put = vi.fn(async () => 99), imgPut = vi.fn(async () => 5);
    const byId = Object.fromEntries([...items, ...wanting].map((i) => [i.id, i]));
    return { saved, recs, answers, put, imgPut, deps: {
      q, store: { put }, imgStore: { put: imgPut }, drive: { id: 'g', root },
      toSample: async (_d, { kinds, limit }) => items.filter((i) => !saved[i.id]?.queued && (!kinds || kinds.includes(i.kind))).slice(0, limit),
      wanting: async () => wanting.filter((i) => !saved[i.id]?.deep_queued),
      item: async (id) => byId[id],
      save: async (id, s) => { saved[id] = { ...saved[id], ...s }; },
      rec: async (id, r) => { recs[id] = r; },
      answer: async (id, a) => { answers[id] = a; },
    } };
  };
  // a worker: claim one intake job, write its outputs, finish
  const work = async (outputs) => {
    const j = await q.claim({ host: 'test-intake', can: ['intake-talk', 'intake-book'], types: ['intake'] });
    const dir = await mkdtemp(join(tmpdir(), 'w-')), out = [];
    for (const [name, body] of Object.entries(outputs(j))) { await writeFile(join(dir, name), body); out.push({ name, ...(await q.put('results', j.id, name, join(dir, name), { lease: j.lease })) }); }
    await q.done({ id: j.id, lease: j.lease, result: { outputs: out } });
    return j;
  };

  it('stages by score, a worker answers, tower pulls the clip to R2 and records the sample and its recommendation', async () => {
    const talk = { id: 7, kind: 'talk', primary_rel: 'talks/a.mp3', duration_s: 3600, score: 80, why: 'Not in the library.' };
    const { saved, recs, put, deps } = rig([talk]);
    expect(await samplePass({ drive: 'g', window: 5, deps })).toMatchObject({ staged: 1 });
    expect(saved[7].queued).toBeTruthy();
    expect(await samplePass({ drive: 'g', window: 5, deps })).toMatchObject({ staged: 0 });   // staged once
    const j = await work(() => ({ 'sample.json': JSON.stringify({ kind: 'talk', text: 'Our speaker tonight is Mr. William Sears. Bahá’u’lláh', language: 'en', speech_s: 50, secs: 60 }), 'clip.mp3': 'mp3' }));
    expect(j).toMatchObject({ id: 'intake-7', priority: 80, stages: ['intake-talk'] });
    expect((await q.stats()).leased).toEqual([]);   // invisible to the media feeder
    expect(await samplePass({ drive: 'g', window: 5, deps })).toMatchObject({ pulled: 1 });
    expect(put).toHaveBeenCalledWith(clipKey('g', 7, 'mp3'), expect.stringMatching(/clip\.mp3$/));
    expect(saved[7]).toMatchObject({ text: expect.stringMatching(/William Sears/), language: 'en', clip: { key: 'intake/g/7.mp3', bytes: 99 } });
    expect(recs[7]).toMatchObject({ creator: 'Mr. William Sears', lang: 'en', score: 85 });
    expect(await q.listDone(50, 'intake')).toEqual([]);   // acked
  });

  it('a book: the title page image goes to the image bucket; "More info" queues a deeper look whose answer returns the item', async () => {
    const book = { id: 9, kind: 'book', primary_rel: 'book.pdf', score: 50, decision: 'more_info', decision_note: 'who wrote it?' };
    const { saved, answers, imgPut, deps } = rig([], [book]);
    expect(await samplePass({ drive: 'g', window: 0, deps })).toMatchObject({ deep: 1 });
    const j = await work(() => ({ 'sample.json': JSON.stringify({ kind: 'book', text: 'The Dawn-Breakers\nby Nabíl', pages: 15, deep: true }), 'title.jpg': 'jpg' }));
    expect(j).toMatchObject({ id: 'intake-9-deep', priority: 1050 });
    expect(j.body).toMatchObject({ deep: true, pages: 15 });
    await samplePass({ drive: 'g', window: 0, deps });
    expect(imgPut).toHaveBeenCalledWith(titleKey('g', 9), expect.any(String));
    expect(saved[9].deep.text).toMatch(/Dawn-Breakers/);
    expect(answers[9]).toMatch(/^Asked: who wrote it\?\nFirst 15 pages/);
  });

  it('a job the queue gave up on is recorded on the item, not retried blindly', async () => {
    const talk = { id: 11, kind: 'talk', primary_rel: 'talks/a.mp3', duration_s: 60, score: 10 };
    const { saved, deps } = rig([talk]);
    await samplePass({ drive: 'g', window: 5, deps });
    for (let n = 0; n < 3; n++) { const c = await q.claim({ host: 'h', can: ['intake-talk'], types: ['intake'] }); await q.fail({ id: c.id, lease: c.lease, error: 'h: exit 1: ffmpeg clip: bad header' }); }
    expect(await samplePass({ drive: 'g', window: 5, deps })).toMatchObject({ failed: 1, staged: 0 });
    expect(saved[11].error).toMatch(/bad header/);
  });
  it('a window per stage: talks waiting on a GPU leave room for books on the CPUs', async () => {
    const talks = [21, 22, 23].map((id) => ({ id, kind: 'talk', primary_rel: 'talks/a.mp3', duration_s: 60, score: 90 }));
    const { deps } = rig([...talks, { id: 24, kind: 'book', primary_rel: 'book.pdf', score: 5 }]);
    expect(await samplePass({ drive: 'g', window: 2, deps })).toMatchObject({ staged: 3 });   // 2 talks + the book
    expect((await q.stats('intake')).queued_by_stage).toMatchObject({ 'intake-talk': 2, 'intake-book': 1 });
    await q.cancel(['intake-21', 'intake-22', 'intake-24']);
  });
});

describe('archiveSampleJob', () => {
  it('needs a drive; requeues itself while work remains', async () => {
    await expect(archiveSampleJob({})).rejects.toThrow(/drive/);
    const requeue = vi.fn(async () => {});
    const out = await archiveSampleJob({ drive: 'g', minutes: 0, round: 3 }, { getDrive: async () => ({ id: 'g', root }), q, store: { put: async () => 1 }, imgStore: null,
      draining: () => false, toSample: async (_d, { kinds }) => (!kinds || kinds.includes('book') ? [{ id: 50, kind: 'book', primary_rel: 'book.pdf', score: 1 }] : []), wanting: async () => [], save: async () => {}, requeue });
    expect(out).toMatchObject({ passes: 1, staged: 1, remaining: 1 });
    expect(requeue).toHaveBeenCalledWith({ drive: 'g', window: 24, minutes: 0, round: 4 });
  });
});

describe('sample-rec (step 6)', () => {
  it('reads a title page', () => {
    expect(titlePage('THE PROMISED DAY IS COME\nby\nShoghi Effendi\n1941')).toMatchObject({ title: 'THE PROMISED DAY IS COME', author: 'Shoghi Effendi', year: 1941 });
    expect(titlePage('Portals to Freedom\nby Howard Colby Ives\nGeorge Ronald 1937')).toMatchObject({ title: 'Portals to Freedom', author: 'Howard Colby Ives', year: 1937 });
  });
  it('speaker, script', () => {
    expect(introducedSpeaker('please welcome Dr. Daniel Jordan, who')).toBe('Dr. Daniel Jordan');
    expect(introducedSpeaker('hello everyone')).toBeNull();
    expect(introducedSpeaker('I have a great privilege of introducing to you tonight Ms. Agnes Alexander, who is')).toBe('Ms. Agnes Alexander');
    expect(introducedSpeaker('And so may I present to you tonight Miss Agnes Alexander from Japan.')).toBe('Miss Agnes Alexander');
    expect(scriptLang('این کتاب پیرامون تاریخ امر است و چند فصل دارد که در آن گفته می‌شود')).toBe('fa');
  });
  it('silence lowers a talk; a book with no faith terms is flagged; nothing readable is flagged', () => {
    expect(recommendFromSample({ score: 50 }, { kind: 'talk', text: '', speech_s: 0 })).toMatchObject({ score: 30, why: expect.stringMatching(/no speech/) });
    expect(recommendFromSample({ score: 50, why: 'New.' }, { kind: 'book', text: 'Accounting Principles\nby A. Smith\n' + 'ledger '.repeat(400) })).toMatchObject({ score: 35, creator: 'A. Smith', why: expect.stringMatching(/^New\. Title page reads/) });
    expect(recommendFromSample({ score: 50 }, { kind: 'book', text: '', pages: 3, ocr: true }).why).toMatch(/nothing readable in the first 3 pages \(even by OCR\)/);
    expect(infoAnswer(null, { kind: 'talk', secs: 300, text: 'x' })).toBe('First 5 min transcript:\nx');
    expect(DEEP_SECS).toBe(300);
  });
  it('a transcript with words is speech whatever speech_s says; a re-recommendation starts from the catalogue score', async () => {
    const r = recommendFromSample({ score: 100 }, { kind: 'talk', text: 'It is a privilege tonight to have with us one of the Hands of the Bahá’í Faith', speech_s: 0 });
    expect(r).toMatchObject({ score: 100, base: 100 });
    const recs = {};
    const legacy = { id: 1, kind: 'talk', score: 80, sample: { text: 'introducing to you tonight Ms. Agnes Alexander, a Baha\'i of Hawaii, who will speak', rec: { score: 80, why: 'Old. no speech heard in the first minute' } } };
    const again = { id: 2, kind: 'talk', score: 85, sample: { text: 'x', rec: { score: 85, base: 50 } } };
    const pages = [[legacy, again], []];
    expect(await rerecDrive('g', { sampled: async () => pages.shift(), rec: async (id, x) => { recs[id] = x; } })).toEqual({ items: 2, resampled: 0 });
    expect(recs[1]).toMatchObject({ base: 100, score: 100, creator: 'Ms. Agnes Alexander' });
    expect(recs[2]).toMatchObject({ base: 50, score: 30 });
  });
  it('a garbled sample (a .doc read raw) goes back to sampling at its catalogue score instead of being re-recommended', async () => {
    expect(garbled('bjbjqPqP ' + 'ÿ'.repeat(60))).toBe(true);
    expect(garbled('Dear friends, the Hands of the Cause wrote ...')).toBe(false);
    const recs = {}, resets = [];
    const bad = { id: 7, kind: 'book', score: 60, sample: { text: 'ÿ'.repeat(80) + ' bjbj', rec: { score: 100, base: 60 } } };
    const pages = [[bad], []];
    expect(await rerecDrive('g', { sampled: async () => pages.shift(), rec: async (id, x) => { recs[id] = x; }, reset: async (id, s) => resets.push([id, s]) }))
      .toEqual({ items: 0, resampled: 1 });
    expect(resets).toEqual([[7, 60]]);
    expect(recs[7]).toBeUndefined();
  });
});
