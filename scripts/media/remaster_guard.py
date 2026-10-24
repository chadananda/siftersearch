# REMASTER WORD GUARD (Chad 10-23: "never worse than the original"; planning/remaster-rnd-20261023.md §UniPASE production
# plan 2): the UniPASE copy is transcribed, and every SENTENCE of the talk's final transcript whose words the copy does not
# carry as well as the original's own ASR does (the final text is the yardstick; churn floor max(1, 6 %), or ANY lost number / name) is replaced in the listening
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


_FOLD = str.maketrans({'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ـ': None})


def norm(w):
    """Any script (Persian / Arabic sentences were normalised to '' and so never guarded): diacritics off, casefold, Arabic
    letter variants folded, letters / digits / apostrophes kept."""
    w = ''.join(c for c in unicodedata.normalize('NFD', str(w)) if unicodedata.category(c) != 'Mn').casefold().translate(_FOLD)
    return re.sub(r"[^\w']+", '', w).replace('_', '')


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


def decide(sentences, asr_words, lag_s=0.0, pad=0.3, ref_words=None, min_wps=1.0):
    """The yardstick is the talk's FINAL (corrected) text. Per sentence: the words of it the ORIGINAL's ASR recovers vs the
    words the COPY's ASR recovers (both the same model + settings). A sentence falls back to the original when the copy
    recovers fewer — net of words it recovers that the original's did not — beyond max(1, 6 %) of the sentence, or loses a
    number / name the original's ASR had. No ref (old jobs): the final text itself is the reference.
    UNGUARDABLE (chant, prayer, music: R&D 10-23): both copies' ASR under min_wps words/s → no signal; the UniPASE audio stays.
    → [{n, k, s, e, lost, gained, swap, unguardable}]"""
    def prep(ws):
        ws = sorted([w for w in (ws or []) if w.get('s') is not None], key=lambda w: w['s'])
        return ws, (np.array([w['s'] - lag_s for w in ws]) if ws else np.zeros(0))
    U, us = prep(asr_words)
    R, rs = prep(ref_words)
    res = []
    for n, k, sw in sentences:
        s, e = sw[0]['s'], sw[-1]['e']
        dur = max(0.0, e - s)
        win = lambda arr, st: arr[np.searchsorted(st, s - pad):np.searchsorted(st, e + pad)]
        cu = [t for t in (norm(w.get('w', '')) for w in win(U, us)) if t]
        want_raw = [w.get('w', '') for w in sw]
        want = [norm(w) for w in want_raw]
        idx = [i for i, t in enumerate(want) if t]
        W = [want[i] for i in idx]
        ku = {idx[j] for j in lcs_kept(W, cu)}
        if R:
            co = [t for t in (norm(w.get('w', '')) for w in win(R, rs)) if t]
            ko = {idx[j] for j in lcs_kept(W, co)}
        else:
            co, ko = W, set(idx)
        if R and dur >= 1.0 and len(cu) / dur < min_wps and len(co) / dur < min_wps:
            res.append({'n': n, 'k': k, 's': round(s, 3), 'e': round(e, 3), 'lost': [], 'gained': [], 'swap': False, 'unguardable': True})
            continue
        lost = sorted(ko - ku)
        gained = ku - ko
        allowed = max(1, math.floor(0.06 * len(idx)))
        key_lost = [i for i in lost if is_key(want_raw[i], i == 0)]
        swap = (len(lost) - len(gained)) > allowed or bool(key_lost)
        res.append({'n': n, 'k': k, 's': round(s, 3), 'e': round(e, 3), 'lost': [want_raw[i] for i in lost], 'gained': len(gained), 'swap': swap, 'unguardable': False})
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
    ung = [d for d in dec if d.get('unguardable')]
    rep = {'sentences': len(dec), 'swapped': sum(d['swap'] for d in dec), 'swapped_s': round(swapped_s, 1), 'swapped_pct': round(100 * swapped_s / total, 1),
           'fallback_sent_pct': round(100 * sum(d['swap'] for d in dec) / max(1, len(dec)), 1), 'unguardable': len(ung), 'unguardable_s': round(sum(d['e'] - d['s'] for d in ung), 1),
           'lag_ms': round(1000 * lag / SR, 1), 'windows': len(merged), 'detail': [d for d in dec if d['swap']][:400]}
    json.dump(rep, open(a.report, 'w'))
    print(json.dumps({k: v for k, v in rep.items() if k != 'detail'}))


if __name__ == '__main__':
    main()
