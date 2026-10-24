# Remaster R&D step 3: INTELLIGIBILITY screening of every candidate against its clip's original (the 10-23 lesson: NISQA
# said 1.2 → 4.55 while words were clipped). Per file: word-level ASR aligned to the original (lost / added / low-confidence
# words; ASR language per clip from <root>/clips/clips.json 'asr_lang', default en, null = auto), onset + whole-word energy against the original's word timings (gated syllables), SQUIM non-intrusive STOI/PESQ,
# WeSpeaker similarity, NISQA/DNSMOS (info only), bandwidth, roll-off, clipping, LUFS.
# Runs on TOWER's CPU in ~/sifter/venvs/media (faster-whisper, torchmetrics, torchaudio, sherpa-onnx, pyloudnorm), at most
# 4 threads, under `nice -n 15 ionice -c3`; never the GPU. Usage: python screen.py <root> [clip ...]
#   <root>/cands/<clip>/<name>.wav (original.wav included) → <root>/screen/<clip>/<name>.json (cached by size+mtime)
import difflib, json, os, re, sys, time
if os.environ.get('SCREEN_DEVICE', 'cpu') == 'cpu':
    os.environ['CUDA_VISIBLE_DEVICES'] = ''   # default: CPU only (tower/boss); SCREEN_DEVICE=cuda for ASR on aorus's GPU
THREADS = int(os.environ.get('SCREEN_THREADS', '4'))
for k in ('OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS'):
    os.environ[k] = str(THREADS)
os.environ.setdefault('HF_HUB_OFFLINE', '1')
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = sys.argv[1]
CLIPS = sys.argv[2:] or sorted(os.listdir(f'{ROOT}/cands'))
EMB = os.path.expanduser(os.environ.get('EMB_MODEL', '~/sifter/venvs/media-models/wespeaker_en_voxceleb_resnet34_LM.onnx'))
_m = {}


def models():
    if not _m:
        import torch
        torch.set_num_threads(THREADS)
        from faster_whisper import WhisperModel
        dev = os.environ.get('SCREEN_DEVICE', 'cpu')
        _m['asr'] = WhisperModel('large-v3-turbo', device=dev, compute_type='float16' if dev == 'cuda' else 'int8', cpu_threads=THREADS)
        from torchaudio.pipelines import SQUIM_OBJECTIVE
        _m['squim'] = SQUIM_OBJECTIVE.get_model().eval()
        import sherpa_onnx
        _m['emb'] = sherpa_onnx.SpeakerEmbeddingExtractor(sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=EMB, num_threads=THREADS, provider='cpu'))
    return _m


def norm_word(w):
    return re.sub(r"[^\w']", '', w.lower())


def asr(x16, lang='en'):
    segs, _ = models()['asr'].transcribe(x16, language=lang, beam_size=5, vad_filter=False, condition_on_previous_text=False,
                                         word_timestamps=True, temperature=0.0)
    words = []
    for s in segs:
        for w in s.words or []:
            n = norm_word(w.word)
            if n:
                words.append({'w': n, 's': round(w.start, 2), 'e': round(w.end, 2), 'p': round(w.probability, 3)})
    return words


def embed(x16):
    ex = models()['emb']
    st = ex.create_stream()
    st.accept_waveform(16000, x16)
    st.input_finished()
    v = np.array(ex.compute(st), dtype=np.float32)
    return v / (np.linalg.norm(v) + 1e-9)


def squim(x16):
    import torch
    with torch.inference_mode():
        stoi, pesq, sisdr = models()['squim'](torch.from_numpy(x16[None].copy()))
    return round(float(stoi), 3), round(float(pesq), 2), round(float(sisdr), 1)


def nisqa_dnsmos(x16):
    import torch
    from torchmetrics.functional.audio import deep_noise_suppression_mean_opinion_score as dnsmos, non_intrusive_speech_quality_assessment as nisqa
    q, d = [], []
    for s in range(0, len(x16) - 16000 * 10, 16000 * 20):
        t = torch.from_numpy(x16[s:s + 16000 * 20].copy())
        q.append(float(nisqa(t, 16000)[0]))
        d.append(float(dnsmos(t, 16000, False)[3]))
    return round(float(np.mean(q)), 2), round(float(np.mean(d)), 2)


def bandwidth(x, sr):
    nf = 2048
    fr = x[: len(x) // nf * nf].reshape(-1, nf)
    en = 10 * np.log10(np.mean(fr ** 2, axis=1) + 1e-12)
    thr = np.percentile(en, 10)
    win = np.hanning(nf)
    loud, quiet = fr[en > thr + 12], fr[en <= thr + 3]
    freqs = np.fft.rfftfreq(nf, 1 / sr)
    if not len(loud):
        return None, None
    S = np.mean(np.abs(np.fft.rfft(loud * win, axis=1)) ** 2, axis=0)
    N = np.mean(np.abs(np.fft.rfft(quiet * win, axis=1)) ** 2, axis=0) if len(quiet) else np.full_like(S, 1e-20)
    Sd, Nd = 10 * np.log10(S + 1e-20), 10 * np.log10(N + 1e-20)
    idx = np.where((Sd > Sd.max() - 50) & (Sd > Nd + 6) & (freqs > 300))[0]
    cum = np.cumsum(S)
    roll = float(freqs[min(int(np.searchsorted(cum / cum[-1], 0.99)), len(freqs) - 1)])
    return (round(float(freqs[idx[-1]] / 1000), 2) if len(idx) else None), round(roll)


def speech_level(x, sr):
    n = int(sr * 0.025)
    e = np.mean(x[: len(x) // n * n].reshape(-1, n) ** 2, axis=1)
    return float(np.sqrt(np.mean(e[e >= np.percentile(e, 70)]) + 1e-12))


def word_energies(x, sr, words):
    """dB of the first 60 ms (onset) and of the whole word, relative to the file's own speech level."""
    ref = speech_level(x, sr)
    on, whole = [], []
    for w in words:
        a, b = int(w['s'] * sr), int(w['e'] * sr)
        seg_on = x[a: min(b, a + int(0.06 * sr))]
        seg = x[a:b]
        on.append(20 * np.log10(np.sqrt(np.mean(seg_on ** 2) + 1e-12) / ref) if len(seg_on) else np.nan)
        whole.append(20 * np.log10(np.sqrt(np.mean(seg ** 2) + 1e-12) / ref) if len(seg) else np.nan)
    return np.array(on), np.array(whole)


def align_words(ow, cw):
    a, b = [w['w'] for w in ow], [w['w'] for w in cw]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    lost, added, lost_list, added_list, pairs = 0, 0, [], [], []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            pairs += list(zip(range(i1, i2), range(j1, j2)))
        if tag in ('delete', 'replace'):
            lost += i2 - i1
            lost_list.append(' '.join(a[i1:i2]))
        if tag in ('insert', 'replace'):
            added += j2 - j1
            added_list.append(' '.join(b[j1:j2]))
    dp = [cw[j]['p'] - ow[i]['p'] for i, j in pairs]
    return lost, added, lost_list, added_list, (round(float(np.mean(dp)), 3) if dp else None)


def measure(path, orig=None, lang='en'):
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    x16 = resample_poly(x, 16000 // np.gcd(16000, sr), sr // np.gcd(16000, sr)).astype(np.float32)
    import pyloudnorm as pyln
    out = {'file': os.path.basename(path)}
    out['lufs'] = round(float(pyln.Meter(sr).integrated_loudness(x.astype(np.float64))), 1)
    out['clip_pct'] = round(float(np.mean(np.abs(x) >= 0.999)) * 100, 4)
    out['bandwidth_khz'], out['rolloff99_hz'] = bandwidth(x, sr)
    t = time.time()
    words = asr(x16, lang)
    out['asr_lang'] = lang or 'auto'
    out['asr_s'] = round(time.time() - t, 1)
    out['words'] = words
    out['n_words'] = len(words)
    out['mean_p'] = round(float(np.mean([w['p'] for w in words])), 3) if words else None
    out['low_conf'] = sum(w['p'] < 0.5 for w in words)
    out['stoi_est'], out['pesq_est'], out['sisdr_est'] = squim(x16)
    if os.environ.get('SCREEN_QUALITY', '1') != '0':   # NISQA/DNSMOS are information only; off on a RAM-tight host
        out['nisqa'], out['dnsmos_ovrl'] = nisqa_dnsmos(x16)
    out['_emb'] = embed(x16).tolist()
    if orig is not None:
        out['voice_sim'] = round(float(np.dot(np.array(out['_emb']), np.array(orig['_emb']))), 3)
        lost, added, ll, al, dp = align_words(orig['words'], words)
        out.update(words_lost=lost, words_added=added, lost=ll[:12], added=al[:12], matched_dp=dp)
        xo, sro = sf.read(orig['_path'], dtype='float32', always_2d=True)
        xo = xo.mean(axis=1)
        m = min(len(xo), len(x))
        on_o, wh_o = word_energies(xo[:m], sro, orig['words'])
        on_c, wh_c = word_energies(x[:m], sr, orig['words'])
        d_on, d_wh = on_c - on_o, wh_c - wh_o
        quiet = wh_o <= np.nanpercentile(wh_o, 25)
        out['onset_drop6'] = int(np.nansum(d_on < -6))
        out['word_drop6'] = int(np.nansum(d_wh < -6))
        out['quiet_words_delta_db'] = round(float(np.nanmedian(d_wh[quiet])), 1) if quiet.any() else None
        out['onset_delta_p10_db'] = round(float(np.nanpercentile(d_on, 10)), 1)
    return out


def _np(o):
    return o.item() if hasattr(o, 'item') else str(o)


def ram_watchdog(floor_gb=float(os.environ.get('SCREEN_ABORT_GB', '3'))):
    """Exit (results so far are cached per file) the moment the host's free RAM falls under floor_gb — production first."""
    import threading

    def run():
        while True:
            avail = next(int(l.split()[1]) for l in open('/proc/meminfo') if l.startswith('MemAvailable:')) / 2 ** 20
            if avail < floor_gb:
                print(f'RAM {avail:.1f} GB free: exiting to make room', flush=True)
                os._exit(3)
            time.sleep(2)
    threading.Thread(target=run, daemon=True).start()


def _tctl():
    """boss's APU package temperature (the heat guard there drops media slots at 96–99 °C); None elsewhere."""
    import subprocess
    try:
        out = subprocess.run(['sensors'], capture_output=True, text=True, timeout=5).stdout
        return float(next(l.split('+')[1].split('°')[0] for l in out.splitlines() if l.strip().startswith('Tctl')))
    except Exception:
        return None


def ram_guard(min_gb=float(os.environ.get('SCREEN_MIN_FREE_GB', '5'))):
    """Shared hosts (boss runs production ASR): wait between files while MemAvailable is under min_gb."""
    while True:
        avail = next(int(l.split()[1]) for l in open('/proc/meminfo') if l.startswith('MemAvailable:')) / 2 ** 20
        temp = _tctl()
        if avail >= min_gb and (temp is None or temp < float(os.environ.get('SCREEN_MAX_TEMP', '90'))):
            return
        print(f'RAM {avail:.1f} GB free, package {temp} °C: waiting', flush=True)
        time.sleep(30)


def dump(obj, path):
    with open(path + '.tmp', 'w') as f:
        json.dump(obj, f, default=_np)
    os.replace(path + '.tmp', path)


def main():
    ram_watchdog()
    try:
        LANG = {k: v.get('asr_lang', 'en') for k, v in json.load(open(f'{ROOT}/clips/clips.json')).items()}
    except (OSError, ValueError):
        LANG = {}
    for clip in CLIPS:
        lang = LANG.get(clip, 'en')   # null = Whisper's own detection (mixed-language clips)
        d = f'{ROOT}/cands/{clip}'
        od = f'{ROOT}/screen/{clip}'
        os.makedirs(od, exist_ok=True)
        names = sorted(f[:-4] for f in os.listdir(d) if f.endswith('.wav'))
        names.remove('original')

        def cached(name):
            p, j = f'{d}/{name}.wav', f'{od}/{name}.json'
            st = os.stat(p)
            key = f'{st.st_size}:{int(st.st_mtime)}'
            if os.path.exists(j):
                r = json.load(open(j))
                if r.get('_key') == key:
                    return r, True
            return key, False

        r, hit = cached('original')
        if hit:
            orig = r
        else:
            orig = measure(f'{d}/original.wav', lang=lang)
            orig['_key'] = r
            dump(orig, f'{od}/original.json')
        orig['_path'] = f'{d}/original.wav'
        for n in names:
            r, hit = cached(n)
            if hit:
                continue
            ram_guard()
            t = time.time()
            m = measure(f'{d}/{n}.wav', orig, lang=lang)
            m['_key'] = r
            m['screen_s'] = round(time.time() - t, 1)
            dump(m, f'{od}/{n}.json')
            print(clip, n, {k: m.get(k) for k in ('words_lost', 'words_added', 'mean_p', 'stoi_est', 'voice_sim', 'onset_drop6', 'word_drop6', 'nisqa', 'bandwidth_khz')}, flush=True)


if __name__ == '__main__':
    main()
