// The media item stage machine (api/lib/media/item.js) end to end with every process and model call faked: each stage
// writes its files and records itself in meta.json; a second run does nothing; a drain yields between stages and the
// next run resumes where it stopped; the original is linked, never modified.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { runItem, STAGES } from '../../api/lib/media/item.js';
import { buildVocab } from '../../api/lib/media/vocab.js';

let root, src;
const store = { langs: null };
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'media-'));
  mkdirSync(join(root, "Baha'i", 'talks', 'Grossman Various'), { recursive: true });
  src = join(root, "Baha'i", 'talks', 'Grossman Various', 'Grossmann - World Order 2 - 1999 07 05.mp3');
  writeFileSync(src, 'ORIGINAL-BYTES');
  process.env.MEDIA_SOURCE_ROOT = root;
  process.env.MEDIA_ARCHIVE_ROOT = join(root, 'library');
});

function fakes({ drainAfter = Infinity } = {}) {
  let stagesSeen = 0;
  const touch = (p, s = 'x') => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, s); };
  const seg = (s, text, spk = 'S1') => ({ s, e: s + 4, text, spk, words: text.split(' ').map((w, i) => ({ w, s: s + i * 0.5, e: s + i * 0.5 + 0.4, spk })) });
  const tools = {
    ffprobe: vi.fn(async () => ({ duration_s: 600, sample_rate: 16000, has_video: false, tags: { title: 'World Order 2' } })),
    tool: vi.fn(async (sub, input, opts) => { if (sub === 'dfn') touch(opts.output); return { snr_db: 20, hum50_db: 0, hum60_db: 0 }; }),
    asr: vi.fn(async (sub, input, opts) => {
      if (sub === 'probe') return { avg_logprob: -0.3, words: 280, excerpts: [{ language: 'en', text: 'x' }] };
      if (sub === 'langid') return { excerpts: (store.langs || Array(12).fill('en')).map((language, i) => ({ start: i * 60, language, prob: 0.9 })) };
      writeFileSync(opts.output, JSON.stringify({ language: 'en', model: 'large-v3-turbo', aligned: true, duration_s: 600, timings: { asr: 30 }, turns: [{ start: 0, end: 600, speaker: 'S1' }],
        segments: [seg(0, 'The Revelation of Baha\'u\'llah is sovereign.'), seg(5, 'Abdul Baha explained this.'), seg(40, 'A new part begins here.')] }));
      return { seconds: 36, host: 'boss' };
    }),
    ffmpeg: vi.fn(async (args) => touch(args[args.length - 1])),
    pcmStream: vi.fn(async (p, sr, on) => on(new Float32Array(8000).fill(0.2))),
    searchLatency: vi.fn(async () => 1.5), threadsFor: vi.fn(() => 8), PY_DFN: () => src,
  };
  const llm = {
    nameItem: vi.fn(async () => ({ speaker: 'Hartmut Grossmann', title: 'World Order 2', year: 1999, date: '1999-07-05', language_hint: 'en' })),
    correctParagraphs: vi.fn(async (ps) => ({ paragraphs: ps, diff: [{ p: 1, from: 'x', to: 'y' }], refused: [] })),
    describeTalk: vi.fn(async () => ({ summary: 'A class.', topics: ['World Order'], speakers: { S1: 'Hartmut Grossmann' }, chapters: [{ p: 1, title: 'Start' }] })),
    findQuotations: vi.fn(async () => ({ quotes: [], teachings: [] })), verifyTeaching: vi.fn(),
  };
  const repo = { updateMediaItem: vi.fn(async () => ({})), slugTaken: vi.fn(async () => false), getChannel: vi.fn(async () => null), upsertChannel: vi.fn(async (c) => c) };
  return {
    tools, llm, repo, now: () => '2026-10-21T00:00:00Z', loadVocab: async () => buildVocab(),
    draining: async () => ++stagesSeen > drainAfter,
    quotes: { linkQuotes: vi.fn(async () => ({ linked: [], rejected: [] })), linkTeachings: vi.fn(async () => ({ linked: [], rejected: [] })), breakoutsOf: () => [] },
    thumbs: { findSpeakerImage: vi.fn(async () => null) },
    ingest: vi.fn(async () => ({ documentId: 777, links: 0 })),
  };
}

describe('media item stage machine', () => {
  it('runs every stage, writes the archive folder, records meta, catalogues the item', async () => {
    const d = fakes();
    const r = await runItem({ id: 1, source_kind: 'file', source_ref: src }, {}, d);
    expect(r.done).toEqual(STAGES);
    expect(r.slug).toBe('grossmann-world-order-2-1999');
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    for (const f of ['original/Grossmann - World Order 2 - 1999 07 05.mp3', 'enhanced/light.flac', `web/${r.slug}.ogg`, `web/${r.slug}.m4a`, 'waveform.json',
      'transcript.raw.json', 'transcript.json', 'transcript.md', 'page.html', 'meta.json', 'thumb.svg']) expect(existsSync(join(dir, f)), f).toBe(true);
    expect(readFileSync(join(dir, 'original', 'Grossmann - World Order 2 - 1999 07 05.mp3'), 'utf8')).toBe('ORIGINAL-BYTES');
    // linked, not copied — and the source's own mode is never touched (a chmod on a hard link changes the source too)
    expect(statSync(join(dir, 'original', 'Grossmann - World Order 2 - 1999 07 05.mp3')).ino).toBe(statSync(src).ino);
    expect(statSync(src).mode & 0o200).toBe(0o200);
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(Object.keys(meta.stages)).toEqual(STAGES);
    expect(meta).toMatchObject({ speaker: 'Hartmut Grossmann', rights: { playback: 'clips' }, doc_id: 777, asr: { host: 'boss' } });
    expect(meta.enhancement.asr_input).toBe('original');
    expect(readFileSync(join(dir, 'transcript.md'), 'utf8')).toContain('{id="para_1" t0=');
    const cat = d.repo.updateMediaItem.mock.calls.at(-1)[1];
    expect(cat).toMatchObject({ state: 'done', doc_id: 777, speaker: 'Hartmut Grossmann' });
    // a second run finds every stage done
    const again = await runItem({ id: 1, source_kind: 'file', source_ref: src, dir, slug: r.slug }, {}, fakes());
    expect(again.done).toEqual([]);
  });

  it('yields to a drain between stages and resumes where it stopped', async () => {
    const first = await runItem({ id: 2, source_kind: 'file', source_ref: src }, {}, fakes({ drainAfter: 3 }));
    expect(first.yielded).toBe(true);
    expect(first.resume).toEqual({ id: 2, stage: 'transcribe' });
    expect(first.done).toEqual(['archive', 'enhance', 'web']);
    const dir = join(root, 'library', 'bahai', 'grossman-various', first.slug);
    const d = fakes();
    const rest = await runItem({ id: 2, source_kind: 'file', source_ref: src, dir, slug: first.slug }, {}, d);
    expect(rest.done).toEqual(STAGES.slice(3));
    expect(d.tools.ffprobe).not.toHaveBeenCalled();   // archive not redone
  });

  it('a drain stops a long stage at once (the child is killed), yields, and the stage is redone on resume', async () => {
    const d = fakes();
    let draining = false;
    d.drainingNow = () => draining;
    d.tools.asr = vi.fn(async (sub, input, opts, o) => {
      if (sub === 'probe') return { avg_logprob: -0.3, words: 280, excerpts: [{ language: 'en' }] };
      draining = true;   // the deploy arrives mid-transcription
      const { run } = await import('../../api/lib/media/tools.js');
      await run('sleep', ['30'], { stop: o.stop, pollMs: 20 });
      return {};
    });
    const t0 = Date.now();
    const r = await runItem({ id: 4, source_kind: 'file', source_ref: src }, {}, d);
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(r).toMatchObject({ yielded: true, resume: { id: 4, stage: 'transcribe' } });
    expect(r.done).toEqual(['archive', 'enhance', 'web']);
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).stages)).toEqual(['archive', 'enhance', 'web']);
    const rest = await runItem({ id: 4, source_kind: 'file', source_ref: src, dir, slug: r.slug }, {}, fakes());
    expect(rest.done[0]).toBe('transcribe');
  });

  it('when a drain kills the diarization, the ASR beside it is stopped too before the stage gives up (no orphan)', async () => {
    const { run, liveChildren } = await import('../../api/lib/media/tools.js');
    const d = fakes();
    let draining = false;
    d.drainingNow = () => draining;
    d.tools.asr = vi.fn(async (sub, input, opts, o) => {
      if (sub === 'probe' || sub === 'langid') return sub === 'probe' ? { avg_logprob: -0.3, words: 280, excerpts: [{ language: 'en' }] } : { excerpts: [] };
      await run('sleep', ['30'], { stop: o.stop, pollMs: 300 });   // the boss ASR: its poll is slower
      return {};
    });
    d.tools.tool = vi.fn(async (sub, input, opts, o = {}) => {
      if (sub === 'dfn') { writeFileSync(opts.output, 'x'); return {}; }
      if (sub === 'diarize') { draining = true; await run('sleep', ['30'], { stop: o.stop, pollMs: 20 }); }
      return { snr_db: 20 };
    });
    const r = await runItem({ id: 11, source_kind: 'file', source_ref: src }, {}, d);
    expect(r).toMatchObject({ yielded: true, resume: { stage: 'transcribe' } });
    expect(liveChildren()).toBe(0);
  });

  it('diarization runs beside the ASR (on tower) and its voices land on the words', async () => {
    const d = fakes();
    d.tools.tool = vi.fn(async (sub, input, opts) => {
      if (sub === 'dfn') writeFileSync(opts.output, 'x');
      if (sub === 'diarize') writeFileSync(opts.output, JSON.stringify({ turns: [{ start: 0, end: 4.5, speaker: 'S1' }, { start: 4.5, end: 300, speaker: 'S2' }, { start: 300, end: 330, speaker: 'S1' }, { start: 330, end: 600, speaker: 'S2' }] }));
      return { snr_db: 20 };
    });
    const r = await runItem({ id: 5, source_kind: 'file', source_ref: src }, {}, d);
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    const raw = JSON.parse(readFileSync(join(dir, 'transcript.raw.json'), 'utf8'));
    expect(raw.segments.map((s) => s.spk)).toEqual(['S1', 'S2', 'S2']);
    expect(d.tools.asr.mock.calls.find((c) => c[0] === 'transcribe')[2].diarize).toBe(false);
  });

  it('the transcript completes a surname-only speaker, never replaces it with someone else', async () => {
    for (const [said, want] of [['Hartmut Grossmann', 'Hartmut Grossmann'], ['Someone Else Entirely', 'Grossmann']]) {
      const d = fakes();
      d.llm.nameItem = vi.fn(async () => ({ speaker: 'Grossmann', title: 'World Order 2', year: 1999 }));
      d.llm.describeTalk = vi.fn(async () => ({ speaker: said, speakers: {}, chapters: [] }));
      const r = await runItem({ id: 9, source_kind: 'file', source_ref: src }, {}, d);
      expect(r.meta.speaker).toBe(want);
      const { rmSync } = await import('fs');
      rmSync(join(root, 'library'), { recursive: true, force: true });
    }
  });

  it('two languages heard in the unforced language ID → interpreted mode (diarized on boss, per-block language)', async () => {
    store.langs = ['fa', 'en', 'fa', 'en', 'en', 'fa', 'en', 'en', 'en', 'en', 'en', 'en'];
    const d = fakes();
    const r = await runItem({ id: 10, source_kind: 'file', source_ref: src }, {}, d);
    store.langs = null;
    const call = d.tools.asr.mock.calls.find((c) => c[0] === 'transcribe');
    expect(call[2]).toMatchObject({ lang: 'multi', diarize: true, prompt: '' });
    expect(r.meta.asr.mode).toBe('interpreted');
  });

  it('one stray window in another language is not an interpreted talk', async () => {
    store.langs = ['en', 'en', 'de', 'en', 'en', 'en', 'en', 'en', 'en', 'en', 'en', 'en'];
    const d = fakes();
    await runItem({ id: 15, source_kind: 'file', source_ref: src }, {}, d);
    store.langs = null;
    expect(d.tools.asr.mock.calls.find((c) => c[0] === 'transcribe')[2].lang).toBe('en');
  });

  it('a title that names nothing gives way to the subject the recording states', async () => {
    const d = fakes();
    d.llm.nameItem = vi.fn(async () => ({ speaker: 'Chad Jones', title: '01 (thursday)', year: 2012 }));
    d.llm.describeTalk = vi.fn(async () => ({ title: 'The Covenant and the Dawn-Breakers', speakers: {}, chapters: [] }));
    const r = await runItem({ id: 14, source_kind: 'file', source_ref: src }, {}, d);
    expect(r.meta).toMatchObject({ title: 'The Covenant and the Dawn-Breakers', file_title: '01 (thursday)' });
  });

  it('`from` redoes a stage and everything after it', async () => {
    const r = await runItem({ id: 3, source_kind: 'file', source_ref: src }, {}, fakes());
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    const again = await runItem({ id: 3, source_kind: 'file', source_ref: src, dir, slug: r.slug }, { from: 'quotes' }, fakes());
    expect(again.done).toEqual(['quotes', 'thumb', 'render', 'ingest', 'catalog']);
  });
});
