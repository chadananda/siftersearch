// SIMULATION (Chad 10-28): fetch → ZIP → children → notification, with a FAKE WORKER that speaks the real worker contract (scripts/dewey/worker/lib.mjs
// against api/lib/dewey/jobs/worker.js on an in-memory registry). Covers the SSRF refusal, idempotency, a dead worker (lease reaped, retried),
// duplicates found before heavy work, ask-first vs operator auto-add, the chat card, the email outbox (HTML only when asked), caps, the valve.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import JSZip from 'jszip';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { memDb } from './helpers.js';

let rig;
vi.mock('../../api/lib/db.js', () => ({ get query() { return rig.mod.query; }, get queryOne() { return rig.mod.queryOne; }, get queryAll() { return rig.mod.queryAll; }, get transaction() { return rig.mod.transaction; } }));
const repo = await import('../../api/lib/repos/dewey-jobs-repo.js');
const { makeRegistry } = await import('../../api/lib/dewey/jobs/registry.js');
const { makeWorkerApi } = await import('../../api/lib/dewey/jobs/worker.js');
const { tick } = await import('../../api/lib/dewey/jobs/tick.js');
const { fetchUrl, startArchive } = await import('../../api/lib/dewey/jobs/tools.js');
const { noticePass, outbox, ack, emailFor, summarize } = await import('../../api/lib/dewey/jobs/notify.js');
const { decide } = await import('../../api/lib/dewey/jobs/decide.js');
const { statusFor } = await import('../../api/lib/dewey/jobs/status.js');
const { runOrder } = await import('../../scripts/dewey/worker/lib.mjs');

const PDF = (t) => Buffer.from(`%PDF-1.4\n${t}\n${'x'.repeat(300)}`);
let tmp, reg, wapi, chat, items, queued, lives;
beforeEach(async () => {
  rig = memDb(); reg = makeRegistry(repo); tmp ||= await mkdtemp(join(tmpdir(), 'dewey-sim-'));
  process.env.DEWEY_INGEST_DIR = join(tmp, 'new'); process.env.DEWEY_MEDIA_DIR = join(tmp, 'media'); process.env.INTERNAL_API_KEY = 'sim-key'; delete process.env.DEWEY_V2;
  wapi = makeWorkerApi({ repo, reg, power: () => false, trust: async () => 0 });
  chat = []; queued = []; lives = new Set();
  const rows = []; items = {
    rows, findBySha: async (sha) => rows.find((r) => r.sha256 === sha) || null, getItem: async (id) => rows.find((r) => r.id === id) || null, acceptedCountBy: async () => 0,
    createItem: async (a) => { const r = { id: rows.length + 1, title: a.title, author: a.author, state: a.state, log: [{ why: a.why }], created_by: a.by }; rows.push(r); return r; },
    updateItem: async (id, f, why) => { const r = rows.find((x) => x.id === id); Object.assign(r, f); if (why) r.log.push({ why }); return r; },
  };
});
afterAll(async () => { if (tmp) await rm(tmp, { recursive: true, force: true }); });

const zipBuf = async (files) => { const z = new JSZip(); for (const [n, d] of files) z.file(n, d); return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); };
/** The fake worker: claims, runs the REAL worker lib against `serve(url)` bytes, and talks to tower's real worker API in-process. */
async function workerRun(serve, { name = 'aorus', die = false } = {}) {
  const { order } = await wapi.claim(name);
  if (!order) return null;
  const api = {
    event: async (id, ev) => wapi.event(id, name, ev),
    upload: async (id, path, { name: n, kind, sha256 }) => wapi.receiveBlob(id, name, { name: n, kind, sha256, stream: createReadStream(path) }),
    input: async () => { throw new Error('no input'); },
  };
  const request = async (url) => { const buf = serve(url); const res = Readable.from([buf]); res.statusCode = 200; res.headers = { 'content-type': 'application/zip', 'content-length': String(buf.length) }; return { res, url }; };
  if (die) { await api.event(order.id, { type: 'progress', step: 'download', bytes: 10 }); return { order, died: true }; }
  const result = await runOrder(order, { api, scratchRoot: join(tmp, 'scratch'), request, robots: async () => ({ allowed: true }) });
  return { order, result, complete: await wapi.complete(order.id, name, result) };
}
const towerDeps = (extra = {}) => ({ repo, reg, items, live: async (id) => ({ live: lives.has(id), points: lives.has(id) ? 12 : 0 }), queue: async (n, p) => { queued.push([n, p]); return { id: queued.length }; },
  pending: async () => [], check: async ({ path }) => (/dup/i.test(path) ? { identified: { title: 'Already Held' }, result: { verdict: 'held', candidates: [{ id: 9, title: 'Held Book' }] } } : { identified: { title: path.split('/').pop().replace(/\.\w+$/, '') }, result: { verdict: 'not-held' } }),
  archive: async (p) => ({ path: `/archive/${p.split('/').pop()}`, sha256: `sha-${p.split('/').pop()}`, bytes: 2048 }), remove: async () => {}, ...extra });
const append = async (uid, role, text, parts) => { chat.push({ uid, role, text, parts }); };
const ZIP = async () => zipBuf([['Pamphlets/Valleys of Light.pdf', PDF('valleys')], ['Pamphlets/Hidden Words.pdf', PDF('hidden')], ['Pamphlets/dup Kitab.pdf', PDF('dup')], ['talk.mp3', Buffer.from('ID3\x04\0\0\0\0\0\0audio')], ['installer.exe', Buffer.from('MZ\x90\0bad')]]);

describe('rights asserted', () => {
  it('defaults on for everyone (contributors are trusted); an explicit no wins; children inherit it', async () => {
    const op = await fetchUrl({ url: 'https://example.org/op-rights.pdf', by: 'chadananda@gmail.com' }, { reg });
    const sam = await fetchUrl({ url: 'https://example.org/sam-rights.pdf', by: 'sam@example.org' }, { reg });
    const samYes = await fetchUrl({ url: 'https://example.org/sam-rights2.pdf', by: 'sam@example.org', rights: true }, { reg });
    expect((await repo.getJob(op.job_id)).params.rights).toBe(true);
    expect((await repo.getJob(sam.job_id)).params.rights).toBe(true);
    expect((await repo.getJob((await fetchUrl({ url: 'https://example.org/no.pdf', by: 'sam@example.org', rights: false }, { reg })).job_id)).params.rights).toBe(false);
    expect((await repo.getJob(samYes.job_id)).params.rights).toBe(true);
  });
});

describe('fetch → ZIP → children → notification (rights denied, so ask first; contributor, chat only)', () => {
  it('runs the whole path and tells the person in chat, without emailing', async () => {
    const zip = await ZIP();
    const r = await fetchUrl({ url: 'https://example.org/pamphlets.zip?utm_source=x', by: 'Sam@Example.org', channel: 'chat', rights: false }, { reg });
    expect(r.job_id).toBeTruthy();
    const again = await fetchUrl({ url: 'https://example.org/pamphlets.zip', by: 'sam@example.org' }, { reg });
    expect(again).toMatchObject({ job_id: r.job_id, already: true });                       // idempotent
    expect((await statusFor('sam@example.org')).text).toMatch(/waiting for a free worker|queued|received/i);

    const run = await workerRun(() => zip);
    expect(run.complete.job.state).toBe('processing');
    let parent = await repo.getJob(r.job_id), kids = await repo.childrenOf(r.job_id);
    expect(kids.map((k) => [k.kind, k.state]).sort()).toEqual([['file', 'received'], ['file', 'received'], ['file', 'received'], ['file', 'skipped'], ['media', 'received']].sort());
    expect(kids.find((k) => /installer/.test(k.params.name)).result.why).toMatch(/program/);

    const t = await tick(towerDeps());                                                            // duplicates found BEFORE any heavy work
    parent = await repo.getJob(r.job_id); kids = await repo.childrenOf(r.job_id);
    const dup = kids.find((k) => /dup/.test(k.params.name));
    expect(dup).toMatchObject({ state: 'skipped', result: { reason: 'duplicate' } });
    expect(kids.find((k) => k.kind === 'media').state).toBe('handed-off'); expect(queued.some(([n]) => n === 'media-scan')).toBe(true);
    expect(queued.some(([n]) => n === 'dewey-intake')).toBe(false);                              // not an operator: new works wait for a yes
    expect(items.rows.map((i) => i.state)).toEqual(['offered', 'offered']);
    expect(parent.state).toBe('awaiting-decision'); expect(parent.counts).toMatchObject({ found: 5, dupes: 1, awaiting: 2, handed: 1, skipped: 1 });
    expect(t.moved).toBeGreaterThan(0);

    await noticePass({ repo, append, userIdOf: async () => 77 });                                // chat card, decision stage
    expect(chat).toHaveLength(1); expect(chat[0]).toMatchObject({ uid: 77, role: 'notice' });
    expect(chat[0].text).toMatch(/2 waiting for your decision/); expect(chat[0].parts.parts[0]).toMatchObject({ kind: 'job', url: expect.stringContaining('/dewey/job/') });
    await noticePass({ repo, append, userIdOf: async () => 77 }); expect(chat).toHaveLength(1);   // once per stage
    expect(await outbox({ repo })).toEqual([]);                                                   // chat only normally

    expect(await decide(r.job_id, 'add', { repo, items, enqueue: async (n, p) => queued.push([n, p]), by: 'sam@example.org' })).toMatchObject({ added: 2 });
    expect(queued.filter(([n]) => n === 'dewey-intake')).toHaveLength(2);
    for (const i of items.rows) { i.state = 'ingested'; i.doc_id = 100 + i.id; }                  // the intake job did its work…
    await tick(towerDeps());
    expect((await repo.getJob(r.job_id)).state).toBe('processing');                               // …but "published" waits for render + search points
    expect((await repo.getJob(r.job_id)).counts.active).toBe(2);
    lives.add(101); lives.add(102);
    await repo.schedule((await repo.childrenOf(r.job_id)).find((k) => k.item_id === 1).id, new Date(0).toISOString()); await repo.schedule((await repo.childrenOf(r.job_id)).find((k) => k.item_id === 2).id, new Date(0).toISOString());
    await tick(towerDeps());
    parent = await repo.getJob(r.job_id);
    expect(parent.state).toBe('published'); expect(parent.counts).toMatchObject({ added: 2, dupes: 1, handed: 1, skipped: 1 });
    await noticePass({ repo, append, userIdOf: async () => 77 });
    expect(chat).toHaveLength(2); expect(chat[1].text).toMatch(/Finished/); expect(chat[1].text).toMatch(/\[Pamphlets - Valleys of Light\]\(https:\/\/siftersearch\.com\/document\/101\)/);
    expect(chat[1].text).toMatch(/Skipped: installer\.exe — a program file/);
  });
});

describe('email only when asked for', () => {
  it('a job started by email (or asked for) produces ONE HTML-ready letter with buttons that name outcomes; ack stops it', async () => {
    const zip = await ZIP();
    const r = await fetchUrl({ url: 'https://example.org/p2.zip', by: 'sam@example.org', channel: 'email', rights: false }, { reg });
    await workerRun(() => zip); await tick(towerDeps());
    const mails = await outbox({ repo, nameOf: async () => 'Sam Rivers' });
    expect(mails).toHaveLength(1);
    const m = mails[0];
    expect(m.key).toBe(`job:${r.job_id}:decision`); expect(m.to).toBe('sam@example.org'); expect(m.subject).toMatch(/2 of 5 files need your decision/);
    expect(m.md).toMatch(/^Dear Sam,/); expect(m.md).toMatch(/Already in the library \(1\)/); expect(m.md).toMatch(/Skipped, and why/);
    expect(m.buttons.map((b) => b.label)).toEqual(['Review the 2 waiting works', 'See the full report']);
    expect(m.buttons.every((b) => b.url.startsWith('https://siftersearch.com/dewey/job/'))).toBe(true);
    await ack(m.key, { repo }); expect(await outbox({ repo })).toEqual([]);
    // the final letter lists live links only for works that are really live
    await decide(r.job_id, 'add', { repo, items, enqueue: async () => {}, by: 'sam@example.org' });
    for (const i of items.rows) { i.state = 'ingested'; i.doc_id = 200 + i.id; lives.add(200 + i.id); }
    for (const k of await repo.childrenOf(r.job_id)) await repo.schedule(k.id, new Date(0).toISOString());
    await tick(towerDeps());
    const fin = (await outbox({ repo }))[0];
    expect(fin.key).toBe(`job:${r.job_id}:final`); expect(fin.subject).toMatch(/2 of 5 files added/); expect(fin.md).toMatch(/\| \[read it\]\(https:\/\/siftersearch\.com\/document\/201\)|\[read it\]\(https:\/\/siftersearch\.com\/document\/201\)/);
  });
  it('the per-person setting turns email on for chat jobs; "email me" per job too', async () => {
    await repo.setFlag('email-pref:pat@example.org', '1');
    const a = await fetchUrl({ url: 'https://example.org/a.pdf', by: 'pat@example.org' }, { reg });
    const b = await fetchUrl({ url: 'https://example.org/b.pdf', by: 'lee@example.org', emailMe: true }, { reg });
    const c = await fetchUrl({ url: 'https://example.org/c.pdf', by: 'lee@example.org' }, { reg });
    expect((await repo.getJob(a.job_id)).notify.email).toBe(true); expect((await repo.getJob(b.job_id)).notify.email).toBe(true); expect((await repo.getJob(c.job_id)).notify.email).toBe(false);
  });
  it('the operator’s own request is taken in without asking', async () => {
    const zip = await zipBuf([['Gleanings.pdf', PDF('gleanings')]]);
    const r = await fetchUrl({ url: 'https://example.org/g.zip', by: 'chadananda@gmail.com' }, { reg });
    await workerRun(() => zip); await tick(towerDeps());
    expect(queued.filter(([n]) => n === 'dewey-intake')).toHaveLength(1); expect(items.rows[0].state).toBe('source');
    expect((await repo.getJob(r.job_id)).state).toBe('processing');
  });
});

describe('failure, caps and refusals', () => {
  it('a worker that dies is reaped: the lease expires, the job retries, a second worker finishes it', async () => {
    const zip = await zipBuf([['One.pdf', PDF('one')]]);
    const r = await fetchUrl({ url: 'https://example.org/die.zip', by: 'sam@example.org' }, { reg });
    expect((await workerRun(() => zip, { die: true })).died).toBe(true);
    expect((await repo.getJob(r.job_id)).state).toBe('fetching');
    await repo.updateJob(r.job_id, { lease_until: new Date(Date.now() - 1000).toISOString() });
    const t = await tick(towerDeps());
    expect(t.reaped).toBe(1);
    let j = await repo.getJob(r.job_id); expect(j.state).toBe('received'); expect(j.error).toMatch(/lease expired/); expect(j.attempts).toBe(1);
    await repo.updateJob(r.job_id, { next_run_at: null });
    expect((await workerRun(() => zip, { name: 'boss' })).complete.ok).toBe(true);
    j = await repo.getJob(r.job_id); expect(j.state).toBe('processing'); expect(j.attempts).toBe(2);
  });
  it('another worker cannot report on a job it does not hold', async () => {
    const r = await fetchUrl({ url: 'https://example.org/h.zip', by: 'sam@example.org' }, { reg });
    await wapi.claim('aorus');
    expect(await wapi.event(r.job_id, 'intruder', { bytes: 5 })).toMatchObject({ abort: true });
  });
  it('the download cap aborts the worker mid-fetch', async () => {
    const r = await fetchUrl({ url: 'https://example.org/huge.zip', by: 'sam@example.org' }, { reg });
    await wapi.claim('aorus');
    expect((await wapi.event(r.job_id, 'aorus', { bytes: 1024 ** 3 })).ok).toBe(true);
    const over = await wapi.event(r.job_id, 'aorus', { bytes: 5 * 1024 ** 3 });
    expect(over.abort).toBe(true); expect(over.reason).toMatch(/download limit/);
  });
  it('job cap: the 21st request of the day is refused with the reason, in plain words', async () => {
    for (let i = 0; i < 20; i++) expect((await fetchUrl({ url: `https://example.org/f${i}.pdf`, by: 'cap@example.org' }, { reg })).job_id).toBeTruthy();
    const x = await fetchUrl({ url: 'https://example.org/f21.pdf', by: 'cap@example.org' }, { reg });
    expect(x.error).toMatch(/past today's limit \(20 jobs/);
  });
  it('SSRF: private, metadata and bad-scheme addresses never become jobs', async () => {
    for (const u of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:7839/api/admin/x', 'file:///etc/passwd', 'https://10.0.0.5/x.pdf', 'http://[::1]/']) {
      const r = await fetchUrl({ url: u, by: 'sam@example.org' }, { reg }); expect(r.error).toMatch(/will not fetch|not look like/);
    }
    expect(await repo.openJobs()).toEqual([]);
  });
  it('a video page goes to the media library, not a file download', async () => {
    const r = await fetchUrl({ url: 'https://www.youtube.com/watch?v=abc', by: 'sam@example.org' }, { reg, enqueue: async (n, p) => { queued.push([n, p]); return { id: 5 }; } });
    expect(r.media).toBe(true); expect(queued[0][0]).toBe('media-scan');
  });
  it('the operator valve: no orders handed out, no new jobs; DEWEY_V2=0 too', async () => {
    const r = await fetchUrl({ url: 'https://example.org/v.pdf', by: 'sam@example.org' }, { reg });
    await repo.setFlag('paused', 'maintenance'); expect((await wapi.claim('aorus')).order).toBeNull();
    expect((await fetchUrl({ url: 'https://example.org/v2.pdf', by: 'sam@example.org' }, { reg })).error).toMatch(/paused|maintenance/);
    await repo.setFlag('paused', '0'); expect((await wapi.claim('aorus')).order.id).toBe(r.job_id);
    process.env.DEWEY_V2 = '0'; expect((await fetchUrl({ url: 'https://example.org/v3.pdf', by: 'sam@example.org' }, { reg })).error).toMatch(/switched off/);
  });
  it('the UPS hold stops the worker orders and the dispatcher', async () => {
    await fetchUrl({ url: 'https://example.org/p.pdf', by: 'sam@example.org' }, { reg });
    expect((await makeWorkerApi({ repo, reg, power: () => true }).claim('aorus')).order).toBeNull();
    expect(await tick({ ...towerDeps(), power: () => true })).toEqual({ held: 'power' });
  });
  it('an empty or all-junk archive ends cleanly, not silently', async () => {
    const zip = await zipBuf([['setup.exe', Buffer.from('MZ..')], ['a.xyz', 'data']]);
    const r = await fetchUrl({ url: 'https://example.org/junk.zip', by: 'sam@example.org' }, { reg });
    await workerRun(() => zip); await tick(towerDeps());
    const j = await repo.getJob(r.job_id);
    expect(j.state).toBe('skipped'); expect(j.counts).toMatchObject({ found: 2, skipped: 2 });
    expect(summarize(j, await repo.childrenOf(r.job_id)).skipped.map((s) => s.why).join()).toMatch(/program.*not a kind of file/);
  });
  it('an uploaded ZIP is one idempotent archive job started by the upload finish', async () => {
    const a = await startArchive({ key: 'dewey-uploads/7/202610/abc-x.zip', name: 'x.zip', size: 1000, by: 'sam@example.org' }, { reg });
    const b = await startArchive({ key: 'dewey-uploads/7/202610/abc-x.zip', name: 'x.zip', size: 1000, by: 'sam@example.org' }, { reg });
    expect(a.created).toBe(true); expect(b.created).toBe(false);
    const { order } = await wapi.claim('boss');
    expect(order).toMatchObject({ op: 'unpack', source: { key: 'dewey-uploads/7/202610/abc-x.zip' }, limits: { maxEntries: 50 } });   // trust 0: first 50 files
  });
});

describe('the emailFor letter', () => {
  it('has no model-written text and survives odd characters in titles', () => {
    const job = { id: 4, state: 'published', params: { name: 'x.zip' }, kind: 'archive', counts: {}, result: {} };
    const kids = [{ state: 'published', params: { name: 'a' }, result: { title: 'Pipe | Title <b>', author: 'A|B', url: 'https://siftersearch.com/document/1' } }];
    const m = emailFor(job, kids, 'final', { name: 'Zed Zee' });
    expect(m.md).toMatch(/Pipe \/ Title <b> \| A\/B/); expect(m.md).not.toMatch(/\|\s*\|\s*\|\s*\n.*\|.*\|.*\|.*\|.*\|/);
  });
});

describe('trusted contributors', () => {
  it('are added without asking (rights default asserted, clean check), up to 100 a day each', async () => {
    const zip = await zipBuf([['Valleys.pdf', PDF('valleys2')]]);
    const r = await fetchUrl({ url: 'https://example.org/trusted.zip', by: 'new.person@example.org' }, { reg });
    await workerRun(() => zip); await tick(towerDeps());
    expect(queued.filter(([n]) => n === 'dewey-intake')).toHaveLength(1); expect(items.rows.at(-1).state).toBe('source');
    expect((await repo.usageOf('dewey:auto:new.person@example.org')).jobs).toBe(1);
    expect(r.job_id).toBeTruthy();
  });
});
