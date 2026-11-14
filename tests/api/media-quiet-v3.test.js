// Quiet v3 (scripts/media/worker/quiet.py, Chad 11-14): hallucinated words are no evidence; static/louder remaster seconds with no valid word are silenced, never near a valid word; sound map + music hint.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const py = (body) => JSON.parse(execFileSync('python3', ['-c', `
import sys, json
sys.path.insert(0, 'scripts/media/worker')
import quiet
${body}`], { encoding: 'utf8' }));

describe('quiet.py v3', () => {
  it('drops words over 1.5 s and runs of 3+ identical tokens; keeps pairs and normal words', () => {
    const r = py(`print(json.dumps(quiet.valid_words([(9.5, 32.5, "Baha'a"), (40, 40.4, 'Aqbalah'), (41, 41.4, 'aqbalah,'), (42, 42.4, 'Aqbalah'), (50, 50.3, 'the'), (50.4, 50.7, 'the'), (51, 51.5, 'word'), (60, 61.5, 'ok'), (70, None, 'x')])))`);
    expect(r.map((w) => w[2])).toEqual(['the', 'the', 'word', 'ok']);
  });
  it('words_of applies the filter per source', () => {
    const r = py(`
work = {'paragraphs': [{'words': [{'w': 'a', 's': 1, 'e': 1.2}, {'w': 'hallu', 's': 5, 'e': 20}]}]}
asr = {'segments': [{'words': [{'w': 'x', 's': 30, 'e': 30.1}, {'w': 'x', 's': 31, 'e': 31.1}, {'w': 'x', 's': 32, 'e': 32.1}]}]}
print(json.dumps(quiet.words_of(work, {'times': {'1': [[2, 2.1]]}}, asr)))`);
    expect(r).toEqual([[1, 1.2], [2, 2.1]]);
  });
  it('static_spans: static or +8 dB louder seconds, never within 0.5 s of a valid word', () => {
    const r = py(`
sec = lambda t, db, fl: {'t': t, 'db': db, 'flat': fl, 'band': 0.5}
rem = [sec(i, -20, 0.6) if 2 <= i <= 6 else sec(i, -20, 0.03) for i in range(10)]
rem[8] = sec(8, -25, 0.03)                     # speech-like but 10 dB over the original
orig = [sec(i, -20, 0.03) for i in range(10)]; orig[8] = sec(8, -35, 0.03)
print(json.dumps(quiet.static_spans(rem, orig, [(3.2, 3.6)])))`);
    // 3 is within 0.5 s of the word at 3.2-3.6, as are 2 (3.2-0.5 < 3) and 4 (3.6+0.5 > 4); 5-6 static; 8 louder
    expect(r).toEqual([{ a: 5, b: 7, reason: 'static' }, { a: 8, b: 9, reason: 'louder' }]);
  });
  it('a quiet remaster is left alone even when flat', () => {
    expect(py(`
s = lambda t: {'t': t, 'db': -50, 'flat': 0.9, 'band': 0.5}
print(json.dumps(quiet.static_spans([s(0), s(1)], [s(0), s(1)], [])))`)).toEqual([]);
  });
  it('music_spans: sustained loud tonal seconds with no valid word', () => {
    expect(py(`
s = lambda t, db, fl: {'t': t, 'db': db, 'flat': fl, 'band': 0.5}
om = [s(0, -20, 0.01), s(1, -20, 0.01), s(2, -20, 0.01), s(3, -20, 0.3), s(4, -20, 0.01), s(5, -60, 0.01)]
print(json.dumps(quiet.music_spans(om, [(4.0, 4.5)])))`)).toEqual([[0, 3]]);
  });
  it('prove: a static span within 0.5 s of a valid word is a violation; VAD does not count against static', () => {
    const r = py(`
q = {'spans': [{'a': 10, 'b': 14, 'reason': 'static'}, {'a': 30, 'b': 34, 'reason': 'static'}]}
print(json.dumps(quiet.prove(q, [(14.3, 14.6)], [(30, 31)], [])))`);
    expect(r.map((v) => v[0])).toEqual(['word']);
  });
  it('decide on synthetic audio: silences remaster static, spares speech, writes sound.json; v3 fields', () => {
    const d = mkdtempSync(join(tmpdir(), 'qv3-'));
    // 12 s: original = 220 Hz tone; remaster = tone, with white noise at 5-8 s louder than the original
    const sh = (cmd) => execFileSync('bash', ['-c', cmd], { encoding: 'utf8' });
    sh(`ffmpeg -nostdin -v error -y -f lavfi -i "sine=f=220:d=12" -af volume=2 ${d}/o.wav`);
    sh(`ffmpeg -nostdin -v error -y -f lavfi -i "anoisesrc=d=3:c=white:a=0.3:seed=1" ${d}/n.wav && ffmpeg -nostdin -v error -y -f lavfi -i "sine=f=220:d=5" -af volume=2 ${d}/a.wav && ffmpeg -nostdin -v error -y -f lavfi -i "sine=f=220:d=4" -af volume=2 ${d}/b.wav && ffmpeg -nostdin -v error -y -i ${d}/a.wav -i ${d}/n.wav -i ${d}/b.wav -filter_complex "[0][1][2]concat=n=3:v=0:a=1" ${d}/r.wav`);
    const q = py(`
q = quiet.decide(12.0, [(1.0, 1.4)], [], [], None, None, '${d}/o.wav', '${d}/r.wav', '${d}/sound.json')
print(json.dumps(q))`);
    expect(q.version).toBe(3); expect(q.fade).toBe(0.2);
    expect(q.static_spans.length).toBe(1);
    expect(q.static_spans[0].a).toBeGreaterThanOrEqual(5); expect(q.static_spans[0].b).toBeLessThanOrEqual(8);
    expect(q.static_spans[0].reason).toMatch(/static|louder/);
    expect(q.spans.filter((s) => s.reason !== 'quiet').every((s) => s.a > 1.9 || s.b < 0.5)).toBe(true);
    const snd = JSON.parse(readFileSync(`${d}/sound.json`, 'utf8'));
    expect(snd.seconds.length).toBe(12);
    expect(snd.music.length).toBeGreaterThan(0);        // a loud-enough steady tone with no words is music
  });
});
