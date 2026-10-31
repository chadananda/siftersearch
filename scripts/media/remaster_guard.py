# Transcript-comparison diagnostics for a continuous remaster. Disagreements are
# review notes; original audio is never spliced into the listening copy (Chad 10-31: no splice code exists; this only MEASURES).
import argparse, json, math, re, subprocess, sys, unicodedata
import numpy as np

SR = 48000


def decode(path, af=None, duration=None):
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-i', path] + (['-af', af] if af else []) + ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    if duration is not None: cmd[cmd.index('-i'):cmd.index('-i')] = ['-t', str(duration)]
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


def lcs_pairs(a, b):
    """LCS alignment of a to b → {index in a: index in b}."""
    n, m = len(a), len(b)
    dp = np.zeros((n + 1, m + 1), dtype=np.int32)
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i, j] = dp[i + 1, j + 1] + 1 if a[i] == b[j] else max(dp[i + 1, j], dp[i, j + 1])
    pairs, i, j = {}, 0, 0
    while i < n and j < m:
        if a[i] == b[j]:
            pairs[i] = j; i += 1; j += 1
        elif dp[i + 1, j] >= dp[i, j + 1]:
            i += 1
        else:
            j += 1
    return pairs


def lcs_kept(a, b):
    return set(lcs_pairs(a, b))


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


def sentences_of(work, max_s=20.0, chunk_s=15.0):
    """→ [(paragraph n, sentence index, words [{w, s, e}])] from transcript.work.json (paragraph sentences = word index ranges).
    A 'sentence' longer than max_s (paragraphs with no sentence breaks: 6-8 minute windows were seen) is cut into chunks of
    at most chunk_s by word times, so one flag never swaps minutes of audio. The index k stays the sentence's."""
    out = []
    for p in work.get('paragraphs', []):
        ws = p.get('words') or []
        for k, (i0, i1) in enumerate(p.get('sentences') or [[0, len(ws)]]):
            sw = [w for w in ws[i0:i1] if w.get('s') is not None and w.get('e') is not None]
            if not sw:
                continue
            if sw[-1]['e'] - sw[0]['s'] <= max_s:
                out.append((p.get('n'), k, sw))
                continue
            cur = []
            for w in sw:
                if cur and w['e'] - cur[0]['s'] > chunk_s:
                    out.append((p.get('n'), k, cur)); cur = []
                cur.append(w)
            if cur:
                out.append((p.get('n'), k, cur))
    return out


def decide(sentences, asr_words, lag_s=0.0, pad=0.3, ref_words=None, min_wps=1.0, conf=0.8, conf_drop=0.2):
    """The yardstick is the talk's PUBLISHED (LLM-corrected) text. Per sentence, a word counts as LOST only when the
    ORIGINAL's ASR heard it CONFIDENTLY (p ≥ conf) and the copy's ASR does not have it — on muffled audio the original's
    own transcript is unreliable, and the copy hearing a low-confidence word differently is usually the improvement
    (10-23 pilot: Gibson / Faizí / Cardell, 'dramatic' by ear, were scored 62-91 % swapped). A sentence falls back to the
    original when its confident losses exceed max(1, 6 %) of it (net of words only the copy recovers), when it loses a
    confidently heard number / name, or when the copy's mean word confidence is more than conf_drop below the original's.
    No ref (old jobs): the published text is the reference, every word confident. UNGUARDABLE (chant, prayer, music):
    both copies' ASR under min_wps words/s → the UniPASE audio stays. → [{n, k, s, e, lost, gained, swap, unguardable}]"""
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
        uw = [w for w in win(U, us) if norm(w.get('w', ''))]
        cu = [norm(w.get('w', '')) for w in uw]
        want_raw = [w.get('w', '') for w in sw]
        want = [norm(w) for w in want_raw]
        idx = [i for i, t in enumerate(want) if t]
        W = [want[i] for i in idx]
        ku = {idx[j] for j in lcs_pairs(W, cu)}
        mean = lambda ws: (sum(float(w.get('p', 1.0)) for w in ws) / len(ws)) if ws else None
        if R:
            ow = [w for w in win(R, rs) if norm(w.get('w', ''))]
            co = [norm(w.get('w', '')) for w in ow]
            po = lcs_pairs(W, co)
            ko = {idx[j] for j in po}
            confident = {idx[j] for j, b in po.items() if float(ow[b].get('p', 1.0)) >= conf}
        else:
            ow, co = [], W
            ko = confident = set(idx)
        if R and dur >= 1.0 and len(cu) / dur < min_wps and len(co) / dur < min_wps:
            res.append({'n': n, 'k': k, 's': round(s, 3), 'e': round(e, 3), 'lost': [], 'gained': 0, 'swap': False, 'unguardable': True})
            continue
        lost = sorted(confident - ku)
        gained = ku - ko
        allowed = max(1, math.floor(0.06 * len(idx)))
        key_lost = [i for i in lost if is_key(want_raw[i], i == 0)]
        mu, mo = mean(uw), mean(ow)
        conf_fell = bool(R) and mu is not None and mo is not None and len(uw) >= 3 and len(ow) >= 3 and mu < mo - conf_drop
        swap = (len(lost) - len(gained)) > allowed or bool(key_lost) or conf_fell
        res.append({'n': n, 'k': k, 's': round(s, 3), 'e': round(e, 3), 'lost': [want_raw[i] for i in lost], 'gained': len(gained),
                    'conf': [round(mu, 2) if mu is not None else None, round(mo, 2) if mo is not None else None], 'swap': swap, 'unguardable': False})
    return res


def main():
    p = argparse.ArgumentParser()
    for k in ('original', 'unipase', 'work', 'asr', 'output', 'report'):
        p.add_argument('--' + k, required=True)
    p.add_argument('--ref', default='')   # transcript.raw.json: the original's own ASR words
    p.add_argument('--af', default='highpass=f=70,loudnorm=I=-18:TP=-1.5:LRA=11')
    a = p.parse_args()
    # Lag needs at most ten minutes; full-length audio stays in ffmpeg's bounded stream.
    dry = decode(a.original, duration=600)
    wet = decode(a.unipase, duration=600)
    lag = env_lag(dry, wet)
    del dry, wet
    work = json.load(open(a.work))
    raw = json.load(open(a.asr))
    asr_words = [w for sg in raw.get('segments', []) for w in (sg.get('words') or [])]
    sents = sentences_of(work)
    ref_words = [w for sg in json.load(open(a.ref)).get('segments', []) for w in (sg.get('words') or [])] if a.ref else None
    dec = decide(sents, asr_words, lag_s=0.0, ref_words=ref_words)   # the copy's ASR ran on the unshifted copy: its times are already ≈ the original's ± lag
    import soundfile as sf
    duration = sf.info(a.unipase).duration
    chain = []
    if lag > 0: chain += [f'atrim=start={lag/SR}', 'asetpts=PTS-STARTPTS', f'apad=pad_dur={lag/SR}']
    elif lag < 0: chain += [f'adelay={-lag/SR*1000}:all=1']
    chain += [f'atrim=duration={duration}', 'loudnorm=I=-18:TP=-1.5:LRA=11', 'alimiter=limit=0.891:level=disabled']
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',a.unipase,'-af',','.join(chain),'-ac','1','-ar',str(SR),'-c:a','flac','-sample_fmt','s32',a.output],check=True)
    ung = [d for d in dec if d.get('unguardable')]
    rep = {'sentences': len(dec), 'mode': 'audit', 'swapped': 0, 'flagged_sentences': sum(d['swap'] for d in dec), 'swapped_s': 0.0, 'swapped_pct': 0.0,
           'fallback_sent_pct': 0.0, 'flagged_sent_pct': round(100 * sum(d['swap'] for d in dec) / max(1, len(dec)), 1), 'unguardable': len(ung), 'unguardable_s': round(sum(d['e'] - d['s'] for d in ung), 1),
           'lag_ms': round(1000 * lag / SR, 1), 'windows': 0, 'detail': [d for d in dec if d['swap']][:400]}
    json.dump(rep, open(a.report, 'w'))
    print(json.dumps({k: v for k, v in rep.items() if k != 'detail'}))


if __name__ == '__main__':
    main()
