# Quiet v2 (Chad 11-01: "apply silencing much more carefully" — v1 cut real speech). Quiet is DATA: decide() makes quiet.json (spans + fades + per-span evidence) on the GPU host,
# apply() fades the spans into a working copy on the finishing host. The kept UniPASE opus is never touched. A stretch is silenced only if ALL hold:
#   no transcript word (original/remaster ASR, realign) within PAD_S, gaps < BRIDGE_S bridged, stretch >= MIN_S; Silero VAD (faster-whisper ships it, ONNX, offline) finds no
#   speech >= VAD_MIN_S in it on the ORIGINAL and the REMASTER (speech splits the stretch, the kept speech padded VAD_PAD_S); whisper (asr_check) hears no word in it on the ORIGINAL.
# Stretches the VAD or whisper rescue are kept and reported (vad_kept / asr_kept), never cut. prove() re-checks the final spans (the guard's check on what is published).
# Pure core: speech_spans, quiet_spans, split_by_vad, decide, prove, gain. CLI: quiet.py <audio> <quiet.json> <out.flac>
import json, os, subprocess, sys

PAD_S, BRIDGE_S, MIN_S, RAMP_S = 0.5, 1.0, 2.0, 0.25
VAD_MIN_S, VAD_PAD_S = 0.2, 0.5
LOUD_DB = -45.0          # a stretch the restorer left louder than this was audible noise
VERSION = 2


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


def split_by_vad(stretches, vad, min_s=MIN_S, pad=VAD_PAD_S, vad_min=VAD_MIN_S):
    """Remove VAD speech (segments >= vad_min, padded) from each stretch; pieces >= min_s survive. → (pieces, rescued) where rescued = [(a, b)] parts of stretches taken back as speech. Pure."""
    sp = speech_spans([(s, e) for s, e in vad if e - s >= vad_min], pad=pad, bridge=0.0)
    pieces, rescued = [], []
    for a, b in stretches:
        t = a
        for s, e in sp:
            if e <= a or s >= b: continue
            s, e = max(s, a), min(e, b)
            if s - t >= min_s: pieces.append((t, s))
            rescued.append((s, e)); t = max(t, e)
        if b - t >= min_s: pieces.append((t, b))
    return pieces, rescued


def decide(dur, words, vad_orig, vad_rem, asr_check=None, loud=None):
    """The careful rule → quiet.json. words [(s, e)]; vad_* [(s, e)] speech segments of the original / the remaster; asr_check(a, b) → True when whisper hears a word on the ORIGINAL
    in [a, b] (the caller pads); loud(a, b) → rms dB of the remaster there. Pure given its inputs."""
    cand = quiet_spans(speech_spans(words), dur)
    cut, vk = split_by_vad(cand, vad_orig); cut, vk2 = split_by_vad(cut, vad_rem)
    rescued = vk + vk2
    spans, asr_kept = [], []
    for a, b in cut:
        if asr_check and asr_check(max(0.0, a - PAD_S), min(dur, b + PAD_S)): asr_kept.append([round(a, 2), round(b, 2)]); continue
        db = loud(a, b) if loud else None
        spans.append({'a': round(a, 2), 'b': round(b, 2), 'db': None if db is None else round(float(db), 1)})
    ls = [s for s in spans if s['db'] is not None and s['db'] > LOUD_DB]
    return {'version': VERSION, 'fade': RAMP_S, 'dur': round(dur, 2), 'spans': spans, 'silenced_s': round(sum(s['b'] - s['a'] for s in spans), 1),
            'loud_stretches': len(ls), 'loud_silenced_s': round(sum(s['b'] - s['a'] for s in ls), 1),
            'vad_kept': len(rescued), 'vad_kept_s': round(sum(e - s for s, e in rescued), 1), 'asr_kept': asr_kept, 'asr_kept_s': round(sum(b - a for a, b in asr_kept), 1),
            'rule': {'pad': PAD_S, 'bridge': BRIDGE_S, 'min': MIN_S, 'vad_min': VAD_MIN_S, 'vad_pad': VAD_PAD_S}}


def prove(q, words, vad_orig, vad_rem):
    """What the guard checks on the audio as published: no transcript word and no VAD speech (>= VAD_MIN_S) inside any silenced span (the fade ramps stay inside it). → [] or the violations. Pure."""
    bad = []
    for s in q.get('spans', []):
        a, b = s['a'], s['b']
        for w0, w1 in words:
            if w0 is not None and w1 is not None and w0 < b and w1 > a: bad.append(['word', a, b, w0, w1])
        for name, vad in (('vad_orig', vad_orig), ('vad_rem', vad_rem)):
            for v0, v1 in vad:
                if v1 - v0 >= VAD_MIN_S and v0 < b and v1 > a: bad.append([name, a, b, v0, v1])
    return bad


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


def words_of(work, realign=None, *asrs):
    """(s, e) of every transcript word: work.json paragraphs, the realign times, and each asr json (segments[].words[] with s/e)."""
    ws = [(w.get('s'), w.get('e')) for p in work.get('paragraphs', []) for w in (p.get('words') or [])]
    for v in ((realign or {}).get('times') or {}).values():
        ws += [(x[0], x[1]) for x in v if x]
    for a in asrs:
        ws += [(w.get('s'), w.get('e')) for g in (a or {}).get('segments', []) for w in (g.get('words') or [])]
    return ws


def vad_segments(path):
    """Silero VAD (faster-whisper's bundled ONNX, offline) over the file → [(s, e)] speech seconds. Raises if the VAD asset is missing: no guess, no fallback."""
    from faster_whisper import decode_audio
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    a = decode_audio(path, sampling_rate=16000)
    ts = get_speech_timestamps(a, VadOptions(min_speech_duration_ms=int(VAD_MIN_S * 1000), min_silence_duration_ms=100, speech_pad_ms=0, threshold=0.35))
    return [(t['start'] / 16000, t['end'] / 16000) for t in ts]


def probe(path, runner=subprocess.run):
    r = runner(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels:format=duration', '-of', 'json', path], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout); st = j['streams'][0]
    return int(st['sample_rate']), int(st['channels']), float(j['format']['duration'])


def rms_db(path, a, b):
    """RMS (dB) of path over [a, b] s, one ffmpeg decode of just that window."""
    import numpy as np
    x = np.frombuffer(subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', str(a), '-t', str(b - a), '-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout, dtype='<f4')
    return 10 * float(np.log10(float(np.mean(np.square(x))) + 1e-12)) if len(x) else -120.0


def apply(audio, q, out, block_s=10):
    """Fade the spans of quiet.json into out (a working FLAC; same rate, channels and length as audio). → the span count applied."""
    import numpy as np
    sr, ch, dur = probe(audio)
    quiet = [(s['a'], s['b']) for s in q.get('spans', [])]; ramp = q.get('fade', RAMP_S)
    dec = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', audio, '-f', 'f32le', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', str(ch), '-i', '-', '-c:a', 'flac', '-sample_fmt', 's32', out], stdin=subprocess.PIPE)
    n0 = 0; step = sr * block_s * ch * 4
    while True:
        buf = dec.stdout.read(step)
        if not buf: break
        x = np.frombuffer(buf, dtype='<f4').reshape(-1, ch)
        t = (n0 + np.arange(len(x))) / sr
        enc.stdin.write((x * gain(t, quiet, dur, ramp)[:, None]).astype('<f4').tobytes()); n0 += len(x)
    enc.stdin.close()
    if dec.wait() or enc.wait(): raise RuntimeError('quiet: ffmpeg failed')
    return len(quiet)


if __name__ == '__main__':
    audio, q, out = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
    print(json.dumps({'applied': apply(audio, q, out), 'probe': probe(out)}))
