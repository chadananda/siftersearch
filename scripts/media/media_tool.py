# Media pipeline worker (runs in ~/sifter/venvs/media on tower; spawned by api/lib/media/run-tool.js at nice 19).
# Subcommands print ONE JSON object on stdout: metrics · probe · langid · dfn · transcribe. Thread cap: --threads.
# Deps: numpy, soundfile, faster-whisper, whisperx, sherpa-onnx, deepfilternet (all user-space).
import argparse, json, os, subprocess, sys, time

import numpy as np

SR = 16000


def load(path, sr=SR, start=None, dur=None):
    """Decode any media file to mono float32 at `sr` through ffmpeg (no temp files)."""
    cmd = ['ffmpeg', '-nostdin', '-v', 'error']
    if start is not None:
        cmd += ['-ss', str(start)]
    if dur is not None:
        cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def frame_snr(x, sr=SR):
    """Blind SNR estimate in dB: speech level (95th percentile of 25 ms frame energy) over the noise floor (10th percentile).
    Comparable between variants of one recording, which is all it is used for."""
    n = int(sr * 0.025)
    if len(x) < n * 10:
        return None
    f = x[: len(x) // n * n].reshape(-1, n)
    e = 10 * np.log10(np.mean(f ** 2, axis=1) + 1e-12)
    return float(np.percentile(e, 95) - np.percentile(e, 10))


def hum_db(x, sr, f):
    """Mains-hum PROMINENCE in dB: energy in a ±1.5 Hz line at f, 2f, 3f over the neighbouring 5-15 Hz sidebands (speech
    is broad, hum is a line). Long FFT over up to 60 s for ~0.02 Hz bins."""
    n = min(len(x), sr * 60)
    if n < sr:
        return 0.0
    spec = np.abs(np.fft.rfft(x[:n] * np.hanning(n))) ** 2
    freqs = np.fft.rfftfreq(n, 1 / sr)
    vals = []
    for h in (f, 2 * f, 3 * f):
        line = spec[(freqs > h - 1.5) & (freqs < h + 1.5)].mean()
        side = spec[((freqs > h - 15) & (freqs < h - 5)) | ((freqs > h + 5) & (freqs < h + 15))].mean()
        vals.append(10 * np.log10((line + 1e-20) / (side + 1e-20)))
    return float(np.mean(vals))


def cmd_metrics(a):
    x = load(a.input, sr=SR)
    hi = load(a.input, sr=44100, start=60, dur=30)
    spec = np.abs(np.fft.rfft(hi * np.hanning(len(hi)))) ** 2 if len(hi) else np.zeros(2)
    freqs = np.fft.rfftfreq(len(hi), 1 / 44100) if len(hi) else np.zeros(2)
    cum = np.cumsum(spec) / (spec.sum() + 1e-12)
    rolloff = float(freqs[np.searchsorted(cum, 0.99)]) if len(hi) else 0.0
    win = SR * 60
    snrs = [v for v in (frame_snr(x[i:i + win]) for i in range(0, max(1, len(x) - win + 1), win)) if v is not None]
    rms = float(20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12))
    print(json.dumps({
        'duration_s': round(len(x) / SR, 2),
        'snr_db': round(float(np.median(snrs)), 2) if snrs else None,
        'rms_db': round(rms, 2),
        'clip_ratio': round(float(np.mean(np.abs(x) > 0.985)), 6),
        'hum50_db': round(hum_db(x, SR, 50), 2), 'hum60_db': round(hum_db(x, SR, 60), 2),
        'rolloff99_hz': round(rolloff),
    }))


def whisper_model(name, threads):
    from faster_whisper import WhisperModel
    return WhisperModel(name, device='cpu', compute_type='int8', cpu_threads=threads)


def cmd_probe(a):
    """ASR confidence on fixed excerpts: the same starts for every variant, so variants compare like for like."""
    m = whisper_model(a.model, a.threads)
    out = []
    t0 = time.time()
    for s in [float(v) for v in a.starts.split(',')]:
        x = load(a.input, start=s, dur=a.len)
        segs, info = m.transcribe(x, language=a.lang or None, beam_size=5, vad_filter=True, condition_on_previous_text=False,
                                  initial_prompt=a.prompt or None)
        segs = list(segs)
        words = sum(len(sg.text.split()) for sg in segs)
        lp = [sg.avg_logprob for sg in segs]
        out.append({'start': s, 'avg_logprob': round(float(np.mean(lp)), 4) if lp else None,
                    'no_speech': round(float(np.mean([sg.no_speech_prob for sg in segs])), 4) if segs else None,
                    'compression': round(float(np.mean([sg.compression_ratio for sg in segs])), 3) if segs else None,
                    'words': words, 'language': info.language, 'text': ' '.join(sg.text.strip() for sg in segs)[:400]})
    lps = [o['avg_logprob'] for o in out if o['avg_logprob'] is not None]
    print(json.dumps({'model': a.model, 'excerpts': out, 'avg_logprob': round(float(np.mean(lps)), 4) if lps else None,
                      'words': sum(o['words'] for o in out), 'seconds': round(time.time() - t0, 1)}))


def cmd_langid(a):
    m = whisper_model(a.model, a.threads)
    res = []
    for s in [float(v) for v in a.starts.split(',')]:
        x = load(a.input, start=s, dur=30)
        lang, prob, allp = m.detect_language(x)
        res.append({'start': s, 'language': lang, 'prob': round(float(prob), 3), 'top': [(l, round(float(p), 3)) for l, p in allp[:3]]})
    print(json.dumps({'excerpts': res}))


def cmd_dfn(a):
    """DeepFilterNet3 (48 kHz) on the light-cleaned file; written as FLAC at 48 kHz mono."""
    import torch
    torch.set_num_threads(a.threads)
    from df.enhance import enhance, init_df
    import soundfile as sf
    model, state, _ = init_df(log_level='ERROR')
    sr = state.sr()
    x = load(a.input, sr=sr)
    chunk = sr * 60   # one minute at a time keeps memory flat on 2-hour talks
    out = []
    t0 = time.time()
    for i in range(0, len(x), chunk):
        seg = torch.from_numpy(x[i:i + chunk]).unsqueeze(0)
        y = enhance(model, state, seg, atten_lim_db=a.atten)
        out.append(y.squeeze(0).numpy())
    y = np.concatenate(out) if out else np.zeros(1, dtype=np.float32)
    sf.write(a.output, y, sr, format='FLAC', subtype='PCM_16')
    print(json.dumps({'output': a.output, 'sr': sr, 'seconds': round(time.time() - t0, 1), 'atten_lim_db': a.atten}))


EMB_MODELS = ('wespeaker_en_voxceleb_resnet34_LM.onnx', 'nemo_en_titanet_small.onnx', '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx')


def diarize(audio, threads, models_dir, num_speakers=-1, threshold=0.5, emb_name=''):
    import sherpa_onnx
    seg = os.path.join(models_dir, 'sherpa-onnx-pyannote-segmentation-3-0', 'model.onnx')
    names = [emb_name] if emb_name else [n for n in EMB_MODELS if os.path.exists(os.path.join(models_dir, n))]
    emb = os.path.join(models_dir, names[0])
    cfg = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg), num_threads=threads),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=emb, num_threads=threads),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=num_speakers, threshold=threshold),
        min_duration_on=0.3, min_duration_off=0.5)
    sd = sherpa_onnx.OfflineSpeakerDiarization(cfg)
    res = sd.process(audio).sort_by_start_time()
    return [{'start': round(r.start, 3), 'end': round(r.end, 3), 'speaker': f'S{r.speaker + 1}'} for r in res]


def speaker_at(turns, s, e):
    best, bo = None, 0.0
    for t in turns:
        o = min(e, t['end']) - max(s, t['start'])
        if o > bo:
            best, bo = t['speaker'], o
    return best


def blocks_of(turns, gap=1.0, min_len=2.0):
    """Diarized turns → speaker blocks (same voice, small gaps merged) for per-block language ID."""
    out = []
    for t in turns:
        if out and out[-1]['speaker'] == t['speaker'] and t['start'] - out[-1]['end'] <= gap:
            out[-1]['end'] = t['end']
        else:
            out.append(dict(t))
    return [b for b in out if b['end'] - b['start'] >= min_len]


def align_groups(whisperx, segs_by_lang, audio):
    """Word-align each language's segments with that language's model; unsupported languages keep segment times."""
    out, ok = [], True
    for lang, segs in segs_by_lang.items():
        try:
            am, meta = whisperx.load_align_model(language_code=lang, device='cpu')
            al = whisperx.align(segs, am, meta, audio, 'cpu', return_char_alignments=False)['segments']
            for sg in al:
                sg['lang'] = lang
            out += al
        except Exception as err:
            print(f'align failed ({lang}): {err}', file=sys.stderr)
            ok = False
            out += [dict(sg, lang=lang) for sg in segs]
    return sorted(out, key=lambda sg: sg['start']), ok


def cmd_transcribe(a):
    """--lang xx: one language. --lang multi: an INTERPRETED talk — diarize first, identify each speaker block's language,
    transcribe each block in its own language, align per language (Persian speaker + English interpreter)."""
    import torch
    torch.set_num_threads(a.threads)
    import whisperx
    t0 = time.time()
    audio = whisperx.load_audio(a.input)
    timings = {}
    multi = a.lang == 'multi'
    asr_opts = {'initial_prompt': a.prompt or None, 'condition_on_previous_text': False, 'beam_size': 5}
    model = whisperx.load_model(a.model, 'cpu', compute_type='int8', language=None if multi else (a.lang or None), asr_options=asr_opts,
                                vad_method='silero', threads=a.threads)
    turns = []
    if a.diarize or multi:
        t2 = time.time()
        try:
            turns = diarize(audio, a.threads, a.models, num_speakers=a.speakers, threshold=a.cluster, emb_name=a.emb)
        except Exception as err:
            print(f'diarize failed: {err}', file=sys.stderr)
        timings['diarize'] = round(time.time() - t2, 1)
    langs = {}
    if multi and turns:
        segs_by_lang = {}
        for b in blocks_of(turns):
            s, e = int(b['start'] * SR), int(b['end'] * SR)
            chunk = audio[s:e]
            try:
                lang = model.detect_language(chunk[: SR * 30])
            except Exception:
                lang = 'en'
            langs[lang] = langs.get(lang, 0) + (b['end'] - b['start'])
            r = model.transcribe(chunk, batch_size=a.batch, language=lang)
            for sg in r['segments']:
                sg['start'] += b['start']
                sg['end'] += b['start']
                segs_by_lang.setdefault(lang, []).append(sg)
        lang = max(langs, key=langs.get) if langs else 'en'
        timings['asr'] = round(time.time() - t0 - timings.get('diarize', 0), 1)
        del model
        t1 = time.time()
        segs, align_ok = align_groups(whisperx, segs_by_lang, audio)
    else:
        res = model.transcribe(audio, batch_size=a.batch, language=a.lang or None)
        lang = res.get('language') or a.lang
        timings['asr'] = round(time.time() - t0 - timings.get('diarize', 0), 1)
        del model
        t1 = time.time()
        segs, align_ok = align_groups(whisperx, {lang: res['segments']}, audio)
    timings['align'] = round(time.time() - t1, 1)
    out = []
    for sg in segs:
        words = [{'w': w.get('word', ''), 's': round(w['start'], 3) if 'start' in w else None, 'e': round(w['end'], 3) if 'end' in w else None,
                  'p': round(w.get('score', 0), 3) if 'score' in w else None} for w in sg.get('words', [])]
        spk = speaker_at(turns, sg['start'], sg['end']) if turns else None
        if turns:
            for w in words:
                if w['s'] is not None:
                    w['spk'] = speaker_at(turns, w['s'], w['e'])
        out.append({'s': round(sg['start'], 3), 'e': round(sg['end'], 3), 'text': sg['text'].strip(), 'spk': spk, 'lang': sg.get('lang'), 'words': words})
    scores = [w['p'] for sg in out for w in sg['words'] if w.get('p') is not None]
    with open(a.output, 'w') as f:
        json.dump({'language': lang, 'languages': {k: round(v, 1) for k, v in langs.items()}, 'model': a.model, 'prompt': a.prompt, 'aligned': align_ok, 'segments': out, 'turns': turns,
                   'duration_s': round(len(audio) / SR, 2), 'timings': timings, 'align_score': round(float(np.mean(scores)), 4) if scores else None},
                  f, ensure_ascii=False)
    print(json.dumps({'output': a.output, 'language': lang, 'segments': len(out), 'speakers': len({t['speaker'] for t in turns}),
                      'timings': timings, 'seconds': round(time.time() - t0, 1), 'duration_s': round(len(audio) / SR, 2)}))


def cmd_diarize(a):
    """Diarization alone (threshold tuning): speakers and their talk time."""
    import whisperx
    audio = whisperx.load_audio(a.input)
    t0 = time.time()
    turns = diarize(audio, a.threads, a.models, num_speakers=a.speakers, threshold=a.cluster, emb_name=a.emb)
    talk = {}
    for t in turns:
        talk[t['speaker']] = round(talk.get(t['speaker'], 0) + t['end'] - t['start'], 1)
    if a.output:
        with open(a.output, 'w') as f:
            json.dump({'turns': turns, 'threshold': a.cluster, 'emb': a.emb or EMB_MODELS[0]}, f)
    print(json.dumps({'speakers': len(talk), 'talk_s': dict(sorted(talk.items(), key=lambda x: -x[1])), 'turns': len(turns), 'seconds': round(time.time() - t0, 1), 'threshold': a.cluster, 'emb': a.emb or 'default'}))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    for name in ('metrics', 'probe', 'langid', 'dfn', 'transcribe', 'diarize'):
        s = sub.add_parser(name)
        s.add_argument('input')
        s.add_argument('--threads', type=int, default=8)
        s.add_argument('--model', default='large-v3-turbo')
        s.add_argument('--lang', default='')
        s.add_argument('--prompt', default='')
        s.add_argument('--starts', default='120,900,1800')
        s.add_argument('--len', type=float, default=60)
        s.add_argument('--output', default='')
        s.add_argument('--atten', type=float, default=None)
        s.add_argument('--batch', type=int, default=8)
        s.add_argument('--diarize', action='store_true')
        s.add_argument('--speakers', type=int, default=-1)
        s.add_argument('--models', default=os.path.expanduser('~/sifter/venvs/media-models'))
        s.add_argument('--cluster', type=float, default=0.7)   # wespeaker: 0.6 → 12 voices on a 92-min Q&A (3dspeaker zh at 0.5: 131)
        s.add_argument('--emb', default='')
    a = p.parse_args()
    {'metrics': cmd_metrics, 'probe': cmd_probe, 'langid': cmd_langid, 'dfn': cmd_dfn, 'transcribe': cmd_transcribe, 'diarize': cmd_diarize}[a.cmd](a)


if __name__ == '__main__':
    main()
