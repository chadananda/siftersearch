// Quiet v2 pure core (scripts/media/worker/quiet.py, Chad 11-01): spans only where no word, no VAD speech (original + remaster) and no whisper word; never inside speech; proven before it is written.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

const py = (body) => JSON.parse(execFileSync('python3', ['-c', `
import sys, json
sys.path.insert(0, 'scripts/media/worker')
import quiet
${body}`], { encoding: 'utf8' }));

describe('quiet.py v2', () => {
  it('pads words 0.5 s and bridges gaps under 1.0 s', () => {
    expect(py(`print(json.dumps(quiet.speech_spans([(1.0, 2.0), (3.0, 3.5), (10.0, 11.0), (None, 4)])))`)).toEqual([[0.5, 4.0], [9.5, 11.5]]);
  });
  it('a stretch needs 2.0 s after the padding', () => {
    expect(py(`print(json.dumps(quiet.quiet_spans(quiet.speech_spans([(5.0, 8.0), (10.0, 12.0), (20.0, 30.0)]), 40.0)))`)).toEqual([[0, 4.5], [12.5, 19.5], [30.5, 40]]);
    expect(py(`print(json.dumps(quiet.quiet_spans(quiet.speech_spans([(1.0, 38.0)]), 40.0)))`)).toEqual([]);
  });
  it('VAD speech splits a stretch; the kept speech gets 0.5 s pad; pieces under 2 s are dropped; short blips are ignored', () => {
    const r = py(`print(json.dumps(quiet.split_by_vad([(0, 30)], [(10, 10.5), (20, 20.1)])))`);
    expect(r[0]).toEqual([[0, 9.5], [11.0, 30]]);          // 0.1 s blip ignored; the 0.5 s speech padded to 9.5-11
    expect(r[1]).toEqual([[9.5, 11.0]]);
    expect(py(`print(json.dumps(quiet.split_by_vad([(0, 5)], [(2, 3)])[0]))`)).toEqual([]);   // both sides < 2 s after the pad
  });
  it('decide: silences only what words, both VADs and whisper all leave empty; reports what was kept', () => {
    const q = py(`
words = [(0.0, 5.0), (60.0, 70.0)]
vo = [(20.0, 21.0)]          # speech on the ORIGINAL the transcripts missed
vr = [(40.0, 40.4)]          # speech on the remaster only
heard = lambda a, b: a <= 50 <= b    # whisper hears a word near 50 s
q = quiet.decide(80.0, words, vo, vr, heard, lambda a, b: -40.0)
print(json.dumps(q))`);
    expect(q.version).toBe(3); expect(q.fade).toBe(0.2);
    expect(q.spans.every((s) => s.b - s.a >= 2)).toBe(true);
    for (const s of q.spans) { expect(s.a < 20 && s.b > 19.5).toBe(false); expect(s.a < 40.9 && s.b > 39.5).toBe(false); expect(s.a < 50 && s.b > 50).toBe(false); }
    expect(q.vad_kept).toBeGreaterThan(0); expect(q.vad_kept_s).toBeGreaterThan(0);
    expect(q.asr_kept.length).toBe(1);
    expect(q.loud_stretches).toBe(q.spans.length);   // -40 dB > -45
  });
  it('prove: any word or VAD speech inside a span is a violation; a clean decision proves clean', () => {
    const clean = py(`
words = [(0.0, 5.0), (30.0, 40.0)]; vo = [(15.0, 16.0)]
q = quiet.decide(60.0, words, vo, [], None)
print(json.dumps(quiet.prove(q, words, vo, [])))`);
    expect(clean).toEqual([]);
    const bad = py(`print(json.dumps(quiet.prove({'spans': [{'a': 10, 'b': 14}]}, [(12, 12.4)], [(11, 11.5)], [])))`);
    expect(bad.map((x) => x[0]).sort()).toEqual(['vad_orig', 'word']);
  });
  it('gain is 0 inside, 0.25 s ramps at inner edges only, 1 in speech', () => {
    const g = py(`print(json.dumps([round(float(x), 3) for x in quiet.gain([0.0, 4.0, 4.9, 5.0, 6.0, 12.0, 12.1, 15.0, 39.99], [(0, 5), (12, 20), (30, 40)], 40.0)]))`);
    expect(g[0]).toBe(0); expect(g[1]).toBe(0);
    expect(g[2]).toBeGreaterThan(0); expect(g[2]).toBeLessThan(1);
    expect(g[3]).toBe(1); expect(g[4]).toBe(1); expect(g[5]).toBe(1);
    expect(g[6]).toBeLessThan(1); expect(g[7]).toBe(0); expect(g[8]).toBe(0);
  });
});
