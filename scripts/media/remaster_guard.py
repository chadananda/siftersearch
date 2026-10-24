# REMASTER WORD GUARD (Chad 10-23: "never worse than the original"; planning/remaster-rnd-20261023.md §UniPASE production
# plan 2): the UniPASE copy is transcribed, and every SENTENCE of the talk's final transcript whose words the copy does not
# carry (beyond the ASR churn floor: max(1, 6 %) of its words, or ANY changed number / name) is replaced in the listening
# copy by the ORIGINAL (transparent chain) for that sentence, with 150 ms equal-power crossfades. Runs on tower (CPU,
# numpy + soundfile + ffmpeg). Prints ONE JSON line (the report also goes to --report).
#   python remaster_guard.py --original O --unipase U --work transcript.work.json --asr unipase.asr.json --af CHAIN --output G.flac --report R.json
import argparse, json, math, re, subprocess, sys, unicodedata
import numpy as np

SR = 48000
XF = 0.150   # crossfade seconds


def decode(path, af=None):
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-i', path] + (['-af', af] if af else []) + ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()


def norm(w):
    w = unicodedata.normalize('NFD', str(w)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r"[^a-z0-9']+", '', w)


def is_key(word, first):
    """A number, or a capitalised word that does not open the sentence (a name / a scripture term): any loss swaps."""
    raw = str(word).strip('"“”‘’\'(),.;:!?')
    return bool(re.search(r'\d', raw)) or (not first and raw[:1].isupper() and len(raw) > 1)


def lcs_kept(a, b):
    n, m = len(a), len(b)
    dp = np.zeros((n + 1, m + 1), dtype=np.int32)
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i, j] = dp[i + 1, j + 1] + 1 if a[i] == b[j] else max(dp[i + 1, j], dp[i, j + 1])
    kept, i, j = set(), 0, 0
    while i < n and j < m:
        if a[i] == b[j]:
            kept.add(i); i += 1; j += 1
        elif dp[i + 1, j] >= dp[i, j + 1]:
            i += 1
        else:
            j += 1
    return kept


def env_lag(dry, wet, max_lag_ms=100, span_s=600):
    """Global lag of the copy by 5 ms log-energy ENVELOPE correlation (generative outputs keep syllable timing, not waveform)."""
    n = int(SR * 0.005)
    m = min(len(dry), len(wet), SR * span_s)
    def env(x):
        x = x[: m // n * n].reshape(-1, n)
        e = np.log(np.mean(x ** 2, axis=1) + 1e-9)
        return e - e.mean()
    ed, ew = env(dry), env(wet)
    L = int(max_lag_ms / 5)
    c = [float(np.dot(ed[max(0, k):len(ed) + min(0, k)], ew[max(0, -k):len(ew) - max(0, k)])) for k in range(-L, L + 1)]
    return (int(np.argmax(c)) - L) * n


def sentences_of(work):
    """→ [(paragraph n, sentence index, words [{w, s, e}])] from transcript.work.json (paragraph sentences = word index ranges)."""
    out = []
    for p in work.get('paragraphs', []):
        ws = p.get('words') or []
        for k, (i0, i1) in enumerate(p.get('sentences') or [[0, len(ws)]]):
            sw = [w for w in ws[i0:i1] if w.get('s') is not None and w.get('e') is not None]
            if sw:
                out.append((p.get('n'), k, sw))
    return out


def decide(sentences, asr_words, lag_s=0.0, pad=0.3, ref_words=None):
    """sentences: [(n, k, words)] (the final transcript: the windows); asr_words: [{w, s, e}] of the copy; ref_words: the
    ORIGINAL's own ASR words (same Whisper model — corrections in the final text are not losses). → [{n, k, s, e, lost, swap}]"""
    asr_words = sorted([w for w in asr_words if w.get('s') is not None], key=lambda w: w['s'])
    starts = np.array([w['s'] - lag_s for w in asr_words]) if asr_words else np.zeros(0)
    ref = sorted([w for w in (ref_words or []) if w.get('s') is not None], key=lambda w: w['s'])
    rstarts = np.array([w['s'] for w in ref]) if ref else np.zeros(0)
    res = []
    for n, k, sw in sentences:
        s, e = sw[0]['s'], sw[-1]['e']
        lo, hi = np.searchsorted(starts, s - pad), np.searchsorted(starts, e + pad)
        cand = [norm(w.get('w', '')) for w in asr_words[lo:hi]]
        if ref:   # the original's ASR words inside this sentence's window
            rlo, rhi = np.searchsorted(rstarts, s - 0.05), np.searchsorted(rstarts, e + 0.05)
            sw = ref[rlo:rhi] or sw
        want = [norm(w.get('w', '')) for w in sw]
        keep_idx = [i for i, t in enumerate(want) if t]
        kept = lcs_kept([want[i] for i in keep_idx], [c for c in cand if c])
        lost_i = [keep_idx[j] for j in range(len(keep_idx)) if j not in kept]
        allowed = max(1, math.floor(0.06 * len(keep_idx)))
        key_lost = [i for i in lost_i if is_key(sw[i].get('w', ''), i == 0)]
        swap = len(lost_i) > allowed or bool(key_lost)
        res.append({'n': n, 'k': k, 's': round(s, 3), 'e': round(e, 3), 'lost': [sw[i].get('w', '') for i in lost_i], 'swap': swap})
    return res


def splice(wet, dry, windows):
    """wet with dry for each window [(s, e)] (seconds), equal-power crossfades of XF at both ends; windows merged first."""
    out = wet.copy()
    n = len(out)
    merged = []
    for s, e in sorted(windows):
        if merged and s - merged[-1][1] < 2 * XF:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    f = int(XF * SR)
    up = np.sin(np.linspace(0, np.pi / 2, f, dtype=np.float32))   # dry rises, wet falls (equal power)
    for s, e in merged:
        a, b = max(0, int((s - XF) * SR)), min(n, int((e + XF) * SR))
        if b - a < 2 * f:
            continue
        seg_w, seg_d = out[a:b], dry[a:b] if b <= len(dry) else np.pad(dry[a:], (0, b - len(dry)))
        g = np.ones(b - a, dtype=np.float32)
        g[:f] = up; g[-f:] = up[::-1]
        out[a:b] = seg_d * g + seg_w * np.sqrt(np.clip(1 - g ** 2, 0, 1))
    return out, merged


def main():
    p = argparse.ArgumentParser()
    for k in ('original', 'unipase', 'work', 'asr', 'output', 'report'):
        p.add_argument('--' + k, required=True)
    p.add_argument('--ref', default='')   # transcript.raw.json: the original's own ASR words
    p.add_argument('--af', default='highpass=f=70,loudnorm=I=-18:TP=-1.5:LRA=11')
    a = p.parse_args()
    dry = decode(a.original, a.af)
    wet = decode(a.unipase, 'loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.891:level=disabled')   # spec: -18 LUFS, -1 dBFS limiter
    lag = env_lag(dry, wet)
    wet = np.roll(wet, -lag)[: len(dry)] if lag else wet[: len(dry)]
    if len(wet) < len(dry):
        wet = np.pad(wet, (0, len(dry) - len(wet)))
    work = json.load(open(a.work))
    raw = json.load(open(a.asr))
    asr_words = [w for sg in raw.get('segments', []) for w in (sg.get('words') or [])]
    sents = sentences_of(work)
    ref_words = [w for sg in json.load(open(a.ref)).get('segments', []) for w in (sg.get('words') or [])] if a.ref else None
    dec = decide(sents, asr_words, lag_s=0.0, ref_words=ref_words)   # the copy's ASR ran on the unshifted copy: its times are already ≈ the original's ± lag
    out, merged = splice(wet, dry, [(d['s'], d['e']) for d in dec if d['swap']])
    import soundfile as sf
    sf.write(a.output, np.clip(out, -1, 1), SR, format='FLAC', subtype='PCM_24')
    total = sum(d['e'] - d['s'] for d in dec) or 1
    swapped_s = sum(e - s for s, e in merged)
    rep = {'sentences': len(dec), 'swapped': sum(d['swap'] for d in dec), 'swapped_s': round(swapped_s, 1), 'swapped_pct': round(100 * swapped_s / total, 1),
           'lag_ms': round(1000 * lag / SR, 1), 'windows': len(merged), 'detail': [d for d in dec if d['swap']][:400]}
    json.dump(rep, open(a.report, 'w'))
    print(json.dumps({k: v for k, v in rep.items() if k != 'detail'}))


if __name__ == '__main__':
    main()
