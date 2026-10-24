# The UniPASE CLOUD WORKER, on a RunPod GPU pod (Chad 10-23: "fire up three runpods and reprocess every audio that is B or
# worse"). Inference ONLY: original audio in → the UniPASE copy (authors' long-form path, 8 s segments, 48 kHz FLAC) + a
# Whisper transcript of that copy (word timestamps, language detected per segment — Persian / Arabic compared in their own
# language). Tower does everything else (the word guard, realign, encode, publish) and never lets the pod touch production.
# Models stay resident; jobs arrive in a SPOOL (tower uploads <spool>/<job>/in.<ext> then touches 'ready').
# SELF-TERMINATES (RunPod API) after IDLE minutes with nothing to do — an orphaned pod never runs up cost.
#   python runpod_worker.py --repo /workspace/unipase --spool /workspace/spool [--idle-min 15]
import argparse, glob, json, os, subprocess, sys, threading, time, traceback, types, urllib.request

SR = 48000


def espnet_shim():
    import torch
    for m in ('espnet2', 'espnet2.enh', 'espnet2.enh.separator', 'espnet2.enh.separator.abs_separator', 'espnet2.torch_utils',
              'espnet2.torch_utils.get_layer_from_string'):
        sys.modules.setdefault(m, types.ModuleType(m))
    sys.modules['espnet2.enh.separator.abs_separator'].AbsSeparator = torch.nn.Module
    acts = {'prelu': torch.nn.PReLU, 'relu': torch.nn.ReLU, 'gelu': torch.nn.GELU, 'silu': torch.nn.SiLU, 'swish': torch.nn.SiLU,
            'tanh': torch.nn.Tanh, 'elu': torch.nn.ELU, 'leakyrelu': torch.nn.LeakyReLU}
    sys.modules['espnet2.torch_utils.get_layer_from_string'].get_layer = lambda name: acts[name.lower()]


def deadman(now, born, beat, hb_min, max_hours):
    """Why this pod must end now (None = carry on): tower's heartbeat stopped, or the maximum lifetime passed."""
    if now - max(born, beat) > hb_min * 60:
        return f'no heartbeat from tower for {hb_min:g} min'
    if now - born > max_hours * 3600:
        return f'maximum lifetime {max_hours:g} h'
    return None


def terminate_self(reason):
    pod, key = os.environ.get('RUNPOD_POD_ID'), os.environ.get('RP_TERMINATE_KEY')
    print(f'{time.strftime("%H:%M:%S")} terminating pod {pod}: {reason}', flush=True)
    if pod and key:
        req = urllib.request.Request(f'https://rest.runpod.io/v1/pods/{pod}', method='DELETE', headers={'Authorization': f'Bearer {key.strip()}', 'User-Agent': 'sifter-media-worker/1', 'Accept': 'application/json'})   # 10-24: urllib's default UA got 403 (the pod could not end itself)
        try:
            urllib.request.urlopen(req, timeout=30)
        except Exception as err:
            print('terminate failed:', err, flush=True)


def load_models(repo, weights):
    """R&D spec 10-23: pinned, sha-verified weights from the volume; no espnet (shim), no Hub at run time."""
    import torch
    espnet_shim()
    os.environ['HF_HUB_OFFLINE'] = '1'
    try:
        import huggingface_hub  # noqa: F401  (inference_long imports it at module level; never called here)
    except ImportError:
        m = types.ModuleType('huggingface_hub')
        m.hf_hub_download = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('no Hub at run time'))
        sys.modules['huggingface_hub'] = m
    os.chdir(repo)
    sys.path.insert(0, repo)
    from models.unipase import UniPASE
    from inference.inference_long import inference_file
    V = os.path.join(weights, 'unipase')
    model = UniPASE(dewavlm_ckpt_path=V + '/DeWavLM-Omni.pt', adapter_ckpt_path=V + '/Adapter.pt',
                    vocoder_ckpt_path=V + '/Vocoder_DWO-L1.pt', postnet_ckpt_path=V + '/PostNet.pt').cuda().eval()
    from faster_whisper import WhisperModel
    asr = WhisperModel(os.path.join(weights, 'whisper'), device='cuda', compute_type='float16')
    return model, inference_file, asr


def _segments(segs, info, offset=0.0, lang=None):
    out = []
    for s in segs:
        out.append({'s': round(s.start + offset, 3), 'e': round(s.end + offset, 3), 'text': s.text.strip(), 'lang': lang or getattr(s, 'language', None) or info.language,
                    'words': [{'w': w.word.strip(), 's': round(w.start + offset, 3), 'e': round(w.end + offset, 3), 'p': round(w.probability, 3)} for w in (s.words or [])]})
    return out


def transcribe(asr, path, prompt=None, runs=None):
    """runs [{s, e, lang}] (from the talk's own per-paragraph language, sent by tower): each stretch is transcribed IN its
    language — auto-detect over 30 s windows dropped whole Persian sentences in interpreted talks (R&D 10-23). No runs:
    the whole file, language detected."""
    kw = dict(word_timestamps=True, vad_filter=False, beam_size=5, condition_on_previous_text=False, initial_prompt=prompt or None)
    if not runs:
        segs, info = asr.transcribe(path, multilingual=True, **kw)
        return {'language': info.language, 'segments': _segments(segs, info), 'model': MODEL_TAG}
    from faster_whisper import decode_audio
    audio = decode_audio(path, sampling_rate=16000)
    out, langs = [], {}
    for r in runs:
        a, b = max(0, int(r['s'] * 16000)), min(len(audio), int(r['e'] * 16000))
        if b - a < 16000 * 0.5:
            continue
        lang = (r.get('lang') or '').lower()[:2] or None
        segs, info = asr.transcribe(audio[a:b], language=lang, **kw)
        out += _segments(segs, info, a / 16000, lang)
        langs[lang or info.language] = langs.get(lang or info.language, 0) + (b - a) / 16000
    return {'language': max(langs, key=langs.get) if langs else None, 'segments': out, 'model': MODEL_TAG, 'runs': len(runs)}


MODEL_TAG = 'large-v3-turbo (faster-whisper ct2 @0a363e91; no VAD; per-language runs)'


def run_job(d, up, inference_file, asr):
    import torch
    meta0 = json.load(open(os.path.join(d, 'job.json'))) if os.path.exists(os.path.join(d, 'job.json')) else {}
    if (meta0.get('post') or {}).get('mode') in ('cleanup', 'post'):     # a talk the guard held earlier: only the deterministic cleanup runs (no UniPASE, no ASR here)
        return {'audio_s': meta0.get('audio_s'), 'mode': 'cleanup', 'seconds': 0, 'gpu': torch.cuda.get_device_name(0)}
    src = next(iter(sorted(glob.glob(os.path.join(d, 'in.*')))), None)
    meta = json.load(open(os.path.join(d, 'job.json'))) if os.path.exists(os.path.join(d, 'job.json')) else {}
    t0 = time.time()
    wav_in, wav_out = os.path.join(d, 'i.wav'), os.path.join(d, 'o.wav')
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_f32le', wav_in], check=True)
    torch.cuda.reset_peak_memory_stats()
    with torch.inference_mode():
        inference_file(wav_in, wav_out, up, sr_out=SR, enable_plc=True)   # sr_out=48000 runs the PostNet BWE; 8 s / 4 s hop defaults
    t_up = time.time() - t0
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', wav_out, '-ac', '1', '-ar', str(SR), '-c:a', 'flac', '-sample_fmt', 's16', '-f', 'flac', os.path.join(d, 'out.flac.tmp')], check=True)
    os.replace(os.path.join(d, 'out.flac.tmp'), os.path.join(d, 'out.flac'))
    t1 = time.time()
    # BOTH copies through the SAME model and settings (no VAD: it dropped 20 s of speech on a UniPASE copy, 10-23 pilot),
    # so the word guard compares like with like — the production transcript came from another model with a prompt
    for src_wav, name in ((wav_out, 'asr.json'), (wav_in, 'asr_orig.json')):
        tr = transcribe(asr, src_wav, meta.get('prompt'), meta.get('runs'))
        json.dump(tr, open(os.path.join(d, name + '.tmp'), 'w'), ensure_ascii=False)
        os.replace(os.path.join(d, name + '.tmp'), os.path.join(d, name))
    import soundfile as sf
    info = sf.info(wav_in)
    for f in (wav_in, wav_out):
        os.remove(f)
    done = {'audio_s': round(info.frames / info.samplerate, 1), 'unipase_s': round(t_up, 1), 'asr_s': round(time.time() - t1, 1),
            'seconds': round(time.time() - t0, 1), 'gpu': torch.cuda.get_device_name(0), 'peak_vram_gb': round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)}
    return done


ASR_LOCK = threading.Lock()
ASR_MODEL = {}


def _transcribe_locked(path, meta):
    with ASR_LOCK:      # the GPU thread and the CPU threads share one Whisper model
        return transcribe(ASR_MODEL['asr'], path, meta.get('prompt'), meta.get('runs'))


def finalize(d, done):
    """CPU half (word guard, realign, web encodes — worker/post.py), then done.json: the GPU is already on the next talk meanwhile."""
    meta = json.load(open(os.path.join(d, 'job.json'))) if os.path.exists(os.path.join(d, 'job.json')) else {}
    if meta.get('post'):
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'worker'))
            import post as postmod
            tr = lambda path: _transcribe_locked(path, meta)       # the cleaned copy's transcript, on this worker's model
            post = postmod.process(d, transcribe=tr)
            json.dump(post, open(os.path.join(d, 'post.json'), 'w'))
            done['post_s'] = post.get('seconds')
        except Exception:
            open(os.path.join(d, 'post.error.txt'), 'w').write(traceback.format_exc()[-2000:])   # tower falls back to doing it itself
    json.dump(done, open(os.path.join(d, 'done.json.tmp'), 'w'))
    os.replace(os.path.join(d, 'done.json.tmp'), os.path.join(d, 'done.json'))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--repo', default='/workspace/unipase')
    p.add_argument('--spool', default='/workspace/spool')
    p.add_argument('--weights', default='/workspace/weights')
    p.add_argument('--idle-min', type=float, default=10)
    p.add_argument('--hb-min', type=float, default=10)      # tower touches <spool>/.tower-hb every poll; none for this long = tower is gone
    p.add_argument('--max-hours', type=float, default=8)    # hard maximum lifetime
    a = p.parse_args()
    os.makedirs(a.spool, exist_ok=True)
    up, IL, asr = load_models(a.repo, a.weights)
    ASR_MODEL['asr'] = asr
    open(os.path.join(a.spool, '.worker-ready'), 'w').write(str(os.getpid()))
    print(f'{time.strftime("%H:%M:%S")} models loaded', flush=True)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'worker'))
    from controller import Controller, Leak
    from concurrent.futures import ThreadPoolExecutor
    ctl, leak = Controller(max_jobs=6), Leak(); ex = ThreadPoolExecutor(max_workers=6)
    active = {}     # job dir -> future (CPU half)
    last = born = time.time()
    hbf = os.path.join(a.spool, '.tower-hb')
    last_tick = 0.0
    def beat():
        json.dump({**ctl.heartbeat(), 'at': time.time(), 'cpu_jobs': len(active)}, open(os.path.join(a.spool, '.worker-status.tmp'), 'w'))
        os.replace(os.path.join(a.spool, '.worker-status.tmp'), os.path.join(a.spool, '.worker-status.json'))
    def done_cb(d):
        def cb(fut):
            ctl.job_finished(d + '#cpu')
            active.pop(d, None)
            try:
                fut.result()
            except Exception:
                open(os.path.join(d, 'error.txt'), 'w').write(traceback.format_exc()[-3000:]); open(os.path.join(d, 'failed'), 'w').close()
        return cb
    while True:
        # DEAD-MAN SWITCH (Chad 10-24): the pod ends itself when tower's heartbeat stops, or at its maximum lifetime — whatever the lane is doing
        why = deadman(time.time(), born, os.path.getmtime(hbf) if os.path.exists(hbf) else 0, a.hb_min, a.max_hours)
        if why:
            terminate_self(why)
            sys.exit(0)
        if time.time() - last_tick > 5:       # LIVE feedback (VRAM / RAM / swap / heat / OOM), never a startup estimate
            last_tick = time.time()
            for j in ctl.tick():
                pass                           # shed: the lane re-queues any job whose done.json never appears
            beat()
        if ctl.state == 'drain' and not active:
            terminate_self('unstable worker: repeated failures'); sys.exit(0)
        ready = sorted(glob.glob(os.path.join(a.spool, '*', 'ready')), key=os.path.getmtime)
        if not ready or len(active) >= 6 or not ctl.admit('unipase'):
            if not ready and not active and time.time() - last > a.idle_min * 60:
                terminate_self(f'idle {a.idle_min:g} min')
                sys.exit(0)
            time.sleep(2)
            continue
        d = os.path.dirname(ready[0])
        os.rename(ready[0], os.path.join(d, 'running'))
        ctl.job_started(d, 'unipase')
        try:
            r = run_job(d, up, IL, asr)
            print(f'{time.strftime("%H:%M:%S")} {os.path.basename(d)} gpu done {r}', flush=True)
            ctl.job_finished(d); ctl.job_started(d + '#cpu', 'guard')
            active[d] = ex.submit(finalize, d, r); active[d].add_done_callback(done_cb(d))
        except Exception:
            ctl.job_failed(d, 'gpu stage')
            open(os.path.join(d, 'error.txt'), 'w').write(traceback.format_exc()[-3000:])
            open(os.path.join(d, 'failed'), 'w').close()
            print(f'{time.strftime("%H:%M:%S")} {os.path.basename(d)} FAILED', flush=True)
        finally:
            try:
                os.remove(os.path.join(d, 'running'))
            except OSError:
                pass
        last = time.time()
        try:
            import resource
            if leak.check(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576) and not active:
                print('memory climbed across jobs: recycling the process', flush=True); sys.exit(75)
        except ImportError:
            pass


if __name__ == '__main__':
    main()
