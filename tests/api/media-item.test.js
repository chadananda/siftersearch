// The media item stage machine (api/lib/media/item.js) end to end with every process and model call faked: each stage
// writes its files and records itself in meta.json; a second run does nothing; a drain yields between stages and the
// next run resumes where it stopped; the original is linked, never modified.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { runItem, STAGES } from '../../api/lib/media/item.js';
import { applyEdits, buildVocab } from '../../api/lib/media/vocab.js';

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
      writeFileSync(opts.output, JSON.stringify({ language: 'en', model: 'large-v3-turbo', aligned: true, duration_s: 600, timings: { asr: 30 }, turns: (opts.diarize ? [{ start: 0, end: 600, speaker: 'S1' }] : []),   // as media_tool: turns only when it diarized
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
    proposeHeadings: vi.fn(async () => []),
    assessTalk: vi.fn(async () => ({ audience: { score: 3, rationale: 'r' }, sections: [], moments: [] })), verifyMoment: vi.fn(async () => ({ ok: true })),
  };
  const repo = { updateMediaItem: vi.fn(async () => ({})), slugTaken: vi.fn(async () => false), getChannel: vi.fn(async () => null), upsertChannel: vi.fn(async (c) => c) };
  return {
    tools, llm, repo, now: () => '2026-10-21T00:00:00Z', loadVocab: async () => buildVocab(),
    draining: async () => ++stagesSeen > drainAfter,
    quotes: { linkQuotes: vi.fn(async () => ({ linked: [], rejected: [] })), linkTeachings: vi.fn(async () => ({ linked: [], rejected: [] })), breakoutsOf: () => [] },
    thumbs: { findSpeakerImage: vi.fn(async () => null) },
    portraits: { ensurePortrait: vi.fn(async (name) => ({ status: 'found', key: 'hartmut-grossmann' })) },
    ingest: vi.fn(async () => ({ documentId: 777, links: 0 })),
    searchFollowUp: vi.fn(async () => ['keyword-fill', 'section-index', 'phrase-index']),
    links: { bio: [], lookup: async () => [], find: async () => [], sections: async () => [], linkFor: () => ({ url: null }) },
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
    expect(meta).toMatchObject({ speaker: 'Hartmut Grossmann', rights: { playback: 'full' }, doc_id: 777, asr: { host: 'boss' } });
    expect(meta.enhancement.asr_input).toBe('original');
    expect(readFileSync(join(dir, 'transcript.md'), 'utf8')).toContain('{id="para_1" t0=');
    const cat = d.repo.updateMediaItem.mock.calls.map((c) => c[1]).filter((f) => f.state === 'done' && f.doc_id).at(-1);
    expect(cat).toMatchObject({ state: 'done', doc_id: 777, speaker: 'Hartmut Grossmann', speaker_key: 'hartmut-grossmann' });
    expect(d.portraits.ensurePortrait).toHaveBeenCalledWith('Hartmut Grossmann', {}, {});
    // a second run finds every stage done
    const again = await runItem({ id: 1, source_kind: 'file', source_ref: src, dir, slug: r.slug }, {}, fakes());
    expect(again.done).toEqual([]);
  });

  it('yields to a drain between stages and resumes where it stopped', async () => {
    const first = await runItem({ id: 2, source_kind: 'file', source_ref: src }, {}, fakes({ drainAfter: 4 }));
    expect(first.yielded).toBe(true);
    expect(first.resume).toEqual({ id: 2, stage: 'transcribe' });
    expect(first.done).toEqual(['archive', 'grade', 'enhance', 'web']);
    const dir = join(root, 'library', 'bahai', 'grossman-various', first.slug);
    const d = fakes();
    const rest = await runItem({ id: 2, source_kind: 'file', source_ref: src, dir, slug: first.slug }, {}, d);
    expect(rest.done).toEqual(STAGES.slice(4));
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
    expect(r.done).toEqual(['archive', 'grade', 'enhance', 'web']);
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).stages)).toEqual(['archive', 'grade', 'enhance', 'web']);
    const rest = await runItem({ id: 4, source_kind: 'file', source_ref: src, dir, slug: r.slug }, {}, fakes());
    expect(rest.done[0]).toBe('transcribe');
  });

  it('a drain stops the diarization stage (no orphan); the finished transcription is kept', async () => {
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
    d.tools.asr = vi.fn(async (sub, input, opts) => {
      if (sub === 'probe' || sub === 'langid') return sub === 'probe' ? { avg_logprob: -0.3, words: 280, excerpts: [{ language: 'en' }] } : { excerpts: [] };
      writeFileSync(opts.output, JSON.stringify({ language: 'en', segments: [], turns: [] }));
      return {};
    });
    const r = await runItem({ id: 11, source_kind: 'file', source_ref: src }, {}, d);
    // diarization is its own stage (10-23): the drain stops IT; the finished ASR is kept
    expect(r).toMatchObject({ yielded: true, resume: { stage: 'diarize' } });
    expect(r.done).toContain('transcribe');
    expect(liveChildren()).toBe(0);
  });

  it('speaker prescreen: one voice in every window → no full diarization, one turn; MEDIA_SPK_PRESCREEN=0 → diarized as before', async () => {
    for (const off of [false, true]) {
      process.env.MEDIA_SPK_PRESCREEN = off ? '0' : '1';
      const d = fakes();
      d.tools.tool = vi.fn(async (sub, input, opts) => {
        if (sub === 'dfn') writeFileSync(opts.output, 'x');
        if (sub === 'spkscreen') return { sims: Array(40).fill(0.9), seconds: 3 };
        if (sub === 'diarize') writeFileSync(opts.output, JSON.stringify({ turns: [{ start: 0, end: 300, speaker: 'S1' }, { start: 300, end: 600, speaker: 'S2' }] }));
        return { snr_db: 20 };
      });
      const r = await runItem({ id: off ? 31 : 30, source_kind: 'file', source_ref: src }, {}, d);
      const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
      const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
      const raw = JSON.parse(readFileSync(join(dir, 'transcript.raw.json'), 'utf8'));
      const subs = d.tools.tool.mock.calls.map((c) => c[0]);
      if (!off) {
        expect(subs).toContain('spkscreen'); expect(subs).not.toContain('diarize');
        expect(meta.spkscreen).toMatchObject({ verdict: 'single', far: 0, windows: 40 });
        expect(raw.turns).toEqual([{ start: 0, end: 600, speaker: 'S1' }]);
        expect(new Set(raw.segments.map((g) => g.spk))).toEqual(new Set(['S1']));
      } else {
        expect(subs).not.toContain('spkscreen'); expect(subs).toContain('diarize');
        expect(meta.spkscreen).toBeUndefined();
      }
    }
    delete process.env.MEDIA_SPK_PRESCREEN;
  });

  it('speaker prescreen: a recurring second voice → full diarization', async () => {
    process.env.MEDIA_SPK_PRESCREEN = '1';
    const d = fakes();
    d.tools.tool = vi.fn(async (sub, input, opts) => {
      if (sub === 'dfn') writeFileSync(opts.output, 'x');
      if (sub === 'spkscreen') return { sims: [...Array(30).fill(0.9), ...Array(10).fill(0.3)], seconds: 3 };
      if (sub === 'diarize') writeFileSync(opts.output, JSON.stringify({ turns: [{ start: 0, end: 300, speaker: 'S1' }, { start: 300, end: 600, speaker: 'S2' }] }));
      return { snr_db: 20 };
    });
    const r = await runItem({ id: 32, source_kind: 'file', source_ref: src }, {}, d);
    const meta = JSON.parse(readFileSync(join(root, 'library', 'bahai', 'grossman-various', r.slug, 'meta.json'), 'utf8'));
    expect(meta.spkscreen.verdict).toBe('multi');
    expect(d.tools.tool.mock.calls.map((c) => c[0])).toContain('diarize');
    delete process.env.MEDIA_SPK_PRESCREEN;
  });

  it('diarization is its own stage after the ASR (on tower here) and its voices land on the words', async () => {
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
    // (since 10-23 the catalogue resolves the name to one person: 'Grossmann' + the World Order series = Hartmut Grossmann)
    for (const [said, want] of [['Hartmut Grossmann', 'Hartmut Grossmann'], ['Someone Else Entirely', 'Hartmut Grossmann']]) {
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
    expect(again.done).toEqual(['quotes', 'links', 'assess', 'update']);   // published early; enrichment ends in an in-place update
  });
  it('the name pass cannot add to what was heard: an inserted "(Vol II)" is reverted and counted (10-22)', async () => {
    const f = fakes();
    f.llm.correctParagraphs = vi.fn(async (ps) => ({ paragraphs: ps.map((p, i) => (i ? p : { ...p, words: applyEdits(p.words, [{ i0: 0, i1: 1, to: `${p.words[0].w} (Vol II)` }]) })), diff: [], refused: [] }));
    const r = await runItem({ id: 5, source_kind: 'file', source_ref: src }, {}, f);
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    expect(readFileSync(join(dir, 'transcript.md'), 'utf8')).not.toContain('(Vol II)');
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(meta.faithfulness.correct).toBe(1);
    expect(meta.stages.correct.insertions_reverted).toBe(1);
  });
  it('an ingested talk queues its search layers (keyword, sections, phrases) at once', async () => {
    const { searchFollowUp } = await import('../../api/lib/media/item.js');
    const queue = vi.fn();
    expect(await searchFollowUp(42, { queue })).toEqual(['keyword-fill', 'section-index', 'phrase-index']);
    expect(queue.mock.calls.map((c) => [c[0], c[1]])).toEqual([['keyword-fill', { ids: [42] }], ['section-index', { ids: [42] }], ['phrase-index', { docs: [42], maxUsd: 0.25, budgetKey: 'media-phrase-index:42' }]]);
    const f = fakes();
    const r = await runItem({ id: 8, source_kind: 'file', source_ref: src }, {}, f);
    expect(f.searchFollowUp).toHaveBeenCalledWith(777);
    expect(r.meta.stages.ingest.search_followups).toEqual(['keyword-fill', 'section-index', 'phrase-index']);
  });
  it('the phrase-index cap is PER TALK: talk N gets its own budget key, so a shared cap can never trip after N talks', async () => {
    const { searchFollowUp } = await import('../../api/lib/media/item.js');
    const queue = vi.fn();
    for (let id = 1; id <= 300; id++) await searchFollowUp(id, { queue });
    const phrase = queue.mock.calls.filter((c) => c[0] === 'phrase-index').map((c) => c[1]);
    expect(new Set(phrase.map((p) => p.budgetKey)).size).toBe(300);
    expect(phrase.every((p) => p.budgetKey === `media-phrase-index:${p.docs[0]}` && p.maxUsd >= 0.05)).toBe(true);
  });
  it('publishes before the enrichment: catalog comes before headings/quotes/links/assess, then one in-place update', async () => {
    const r = await runItem({ id: 6, source_kind: 'file', source_ref: src }, {}, fakes());
    const order = r.done;
    expect(order.indexOf('catalog')).toBeLessThan(order.indexOf('headings'));
    expect(order.indexOf('catalog')).toBeGreaterThan(order.indexOf('clean'));
    expect(order.at(-1)).toBe('update');
  });
  it('`redo` re-runs only the named stages (a back-fill of a new stage keeps the rest)', async () => {
    const r = await runItem({ id: 4, source_kind: 'file', source_ref: src }, {}, fakes());
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    const f = fakes();
    f.llm.proposeHeadings = vi.fn(async (ps) => [{ p: ps[0].n, text: ps[0].words.slice(0, 4).map((w) => w.w).join(' ') }]);
    const again = await runItem({ id: 4, source_kind: 'file', source_ref: src, dir, slug: r.slug }, { redo: ['headings', 'update'] }, f);
    expect(again.done).toEqual(['headings', 'update']);
    expect(f.llm.findQuotations).not.toHaveBeenCalled();
    const tr = JSON.parse(readFileSync(join(dir, 'transcript.json'), 'utf8'));
    expect(tr.headings).toHaveLength(1);
    expect(tr.headings[0]).toMatchObject({ kind: 'heading', source: 'generated', form: 'statement' });
    expect(readFileSync(join(dir, 'transcript.md'), 'utf8')).toContain(`## ${tr.headings[0].text}`);
  });
});

describe('prep survives a drain (10-23: 88 restarts a night)', () => {
  it('a resumed enhance skips the probes and metrics it already finished', async () => {
    const d = fakes();
    let draining = false, probes = 0;
    d.drainingNow = () => draining;
    const realAsr = d.tools.asr;
    d.tools.asr = vi.fn(async (sub, input, opts, o) => {
      if (sub === 'probe') { probes++; if (probes === 3) { draining = true; const { run } = await import('../../api/lib/media/tools.js'); await run('sleep', ['30'], { stop: o.stop, pollMs: 20 }); } return { avg_logprob: -0.3, words: 280, excerpts: [{ language: 'en', text: 'x' }] }; }
      return realAsr(sub, input, opts, o);
    });
    const r = await runItem({ id: 21, source_kind: 'file', source_ref: src }, {}, d);
    expect(r).toMatchObject({ yielded: true, resume: { stage: 'enhance' } });
    const dir = join(root, 'library', 'bahai', 'grossman-various', r.slug);
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(Object.keys(meta.enh_ck.probes).length).toBe(2);   // two of three probes kept
    const d2 = fakes(); let probes2 = 0;
    const asr2 = d2.tools.asr;
    d2.tools.asr = vi.fn(async (sub, ...a) => { if (sub === 'probe') probes2++; return asr2(sub, ...a); });
    const rest = await runItem({ id: 21, source_kind: 'file', source_ref: src, dir, slug: r.slug }, {}, d2);
    expect(rest.done[0]).toBe('enhance');
    expect(probes2).toBe(1);   // only the unfinished probe again
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).enh_ck).toBeUndefined();
  });
});
