# Silences the restored copy where nobody speaks (Chad 10-29: UniPASE turned a background-only lead into loud noise — "it needs to be silenced, not made even louder").
# Speech = every transcript word (work.json, original time = the copy's time) ∪ its re-alignment on this copy, padded and bridged; each word-free stretch ≥ MIN_S fades to silence —
# unless the copy is VOICED there (pitch in ≥ VOICED_FRAC of 40 ms frames): that is speech the transcript missed (10-29: 6 s inside a sentence), kept and reported, never cut.
# Streams the FLAC through numpy in blocks (an hour is 170 M samples). Pure core: speech_spans(), quiet_spans(), gain(). CLI: quiet.py <flac> <work.json> [realign.json] → report JSON.
import json, os, subprocess, sys

PAD_S, BRIDGE_S, MIN_S, RAMP_S = 0.3, 0.8, 1.5, 0.15
LOUD_DB = -45.0          # a stretch the restorer left louder than this was audible noise
VOICED_FRAC = 0.4        # measured 10-29: background-only stretches 0.00-0.23, an untranscribed sentence 0.64


def voiced_frac(x, sr=16000, frame=0.04):
    """Share of 40 ms frames with a clear pitch (normalised autocorrelation > 0.5 at 80-400 Hz). Pure."""
    import numpy as np
    n = int(sr * frame); lo, hi = sr // 400, sr // 80; v = []
    for i in range(0, len(x) - n, n):
        f = x[i:i + n] - x[i:i + n].mean(); e = float(np.dot(f, f))
        if e < n * 1e-6: v.append(False); continue
        ac = np.correlate(f, f, 'full')[n - 1:] / e
        v.append(ac[lo:hi].max() > 0.5)
    return sum(v) / len(v) if v else 0.0


def speech_spans(words, pad=PAD_S, bridge=BRIDGE_S):
    """[(s, e)] word times → merged speech spans, each word padded, gaps < bridge joined. Pure."""
    ws = sorted((max(0.0, s - pad), e + pad) for s, e in words if s is not None and e is not None and e >= s)
    out = []
    for s, e in ws:
        if out and s - out[-1][1] < bridge: out[-1][1] = max(out[-1][1], e)
        else: out.append([s, e])
    return [tuple(x) for x in out]


def quiet_spans(speech, dur, min_s=MIN_S):
    """The word-free stretches of [0, dur] at least min_s long (lead, gaps, tail). Pure."""
    out, t = [], 0.0
    for s, e in speech + [(dur, dur)]:
        s = min(s, dur)
        if s - t >= min_s: out.append((t, s))
        t = max(t, e)
        if t >= dur: break       # words timed past the end of the copy add nothing
    return out


def gain(t, quiet, dur, ramp=RAMP_S):
    """Gain at time t: 0 inside a quiet stretch, raised-cosine ramps at its inner edges (none at the file's ends). Pure, scalar or numpy."""
    import numpy as np
    t = np.asarray(t, dtype=np.float64); g = np.ones_like(t)
    for a, b in quiet:
        r_in = 0 if a <= 0 else ramp; r_out = 0 if b >= dur else ramp
        m = (t >= a) & (t <= b); x = np.ones_like(t[m])
        tm = t[m]
        if r_in: x = np.minimum(x, np.clip((tm - a) / r_in, 0, 1))
        if r_out: x = np.minimum(x, np.clip((b - tm) / r_out, 0, 1))
        g[m] = np.minimum(g[m], 0.5 + 0.5 * np.cos(np.pi * x))
    return g


def words_of(work, realign=None):
    ws = [(w.get('s'), w.get('e')) for p in work.get('paragraphs', []) for w in (p.get('words') or [])]
    for v in ((realign or {}).get('times') or {}).values():
        ws += [(x[0], x[1]) for x in v if x]
    return ws


def probe(path, runner=subprocess.run):
    r = runner(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels:format=duration', '-of', 'json', path], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout); st = j['streams'][0]
    return int(st['sample_rate']), int(st['channels']), float(j['format']['duration'])


def apply(flac, work, realign=None, out=None, block_s=10):
    """Silence the word-free stretches of flac in place (or into out). → report {quiet_s, stretches, loud: [[a, b, rms_db]] (silenced noise), loud_s, voiced_kept: [[a, b, frac]]}."""
    import numpy as np
    sr, ch, dur = probe(flac)
    quiet, kept = quiet_spans(speech_spans(words_of(work, realign)), dur), []
    if quiet:
        x16 = np.frombuffer(subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', flac, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout, dtype='<f4')
        vf = [voiced_frac(x16[int(a * 16000):int(b * 16000)]) for a, b in quiet]
        kept = [[round(a, 2), round(b, 2), round(v, 2)] for (a, b), v in zip(quiet, vf) if v >= VOICED_FRAC]
        quiet = [q for q, v in zip(quiet, vf) if v < VOICED_FRAC]
    rep = {'version': 1, 'quiet_s': round(sum(b - a for a, b in quiet), 1), 'stretches': len(quiet), 'loud': [], 'loud_s': 0.0, 'voiced_kept': kept}
    if not quiet: return rep
    dst = out or flac + '.quiet.flac'
    dec = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', flac, '-f', 'f32le', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', str(ch), '-i', '-', '-c:a', 'flac', '-sample_fmt', 's32', dst], stdin=subprocess.PIPE)
    energy = [[0.0, 0] for _ in quiet]; n0 = 0; step = sr * block_s * ch * 4
    while True:
        buf = dec.stdout.read(step)
        if not buf: break
        x = np.frombuffer(buf, dtype='<f4').reshape(-1, ch)
        t = (n0 + np.arange(len(x))) / sr
        for i, (a, b) in enumerate(quiet):
            m = (t >= a) & (t < b)
            if m.any(): energy[i][0] += float(np.square(x[m]).sum()); energy[i][1] += int(m.sum()) * ch
        enc.stdin.write((x * gain(t, quiet, dur)[:, None]).astype('<f4').tobytes()); n0 += len(x)
    enc.stdin.close()
    if dec.wait() or enc.wait(): raise RuntimeError('quiet: ffmpeg failed')
    for (a, b), (e2, n) in zip(quiet, energy):
        db = 10 * np.log10(e2 / n + 1e-12) if n else -120.0
        if db > LOUD_DB: rep['loud'].append([round(a, 2), round(b, 2), round(float(db), 1)])
    rep['loud_s'] = round(sum(b - a for a, b, _ in rep['loud']), 1)
    if not out: os.replace(dst, flac)
    return rep


if __name__ == '__main__':
    f, w = sys.argv[1], json.load(open(sys.argv[2]))
    r = json.load(open(sys.argv[3])) if len(sys.argv) > 3 and os.path.exists(sys.argv[3]) else None
    print(json.dumps(apply(f, w, r, sys.argv[4] if len(sys.argv) > 4 else None)))
