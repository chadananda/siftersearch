# The UniPASE CLOUD WORKER, on a RunPod GPU pod (Chad 10-23: "fire up three runpods and reprocess every audio that is B or
# worse"). Inference ONLY: original audio in → the UniPASE copy (authors' long-form path, 8 s segments, 48 kHz FLAC) + a
# Whisper transcript of that copy (word timestamps, language detected per segment — Persian / Arabic compared in their own
# language). Tower does everything else (the word guard, realign, encode, publish) and never lets the pod touch production.
# Models stay resident; jobs arrive in a SPOOL (tower uploads <spool>/<job>/in.<ext> then touches 'ready').
# SELF-TERMINATES (RunPod API) after IDLE minutes with nothing to do — an orphaned pod never runs up cost.
#   python runpod_worker.py --repo /workspace/unipase --spool /workspace/spool [--idle-min 15]
import argparse, glob, json, os, subprocess, sys, time, traceback, types, urllib.request

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


def terminate_self(reason):
    pod, key = os.environ.get('RUNPOD_POD_ID'), os.environ.get('RP_TERMINATE_KEY')
    print(f'{time.strftime("%H:%M:%S")} terminating pod {pod}: {reason}', flush=True)
    if pod and key:
        req = urllib.request.Request(f'https://rest.runpod.io/v1/pods/{pod}', method='DELETE', headers={'Authorization': f'Bearer {key}'})
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


def transcribe(asr, path, prompt=None):
    segs, info = asr.transcribe(path, word_timestamps=True, multilingual=True, vad_filter=True, beam_size=5,
                                condition_on_previous_text=False, initial_prompt=prompt or None)
    out = []
    for s in segs:
        out.append({'s': round(s.start, 3), 'e': round(s.end, 3), 'text': s.text.strip(), 'lang': getattr(s, 'language', None) or info.language,
                    'words': [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3), 'p': round(w.probability, 3)} for w in (s.words or [])]})
    return {'language': info.language, 'segments': out, 'model': 'large-v3-turbo (faster-whisper ct2 @0a363e91, multilingual)'}


def run_job(d, up, inference_file, asr):
    import torch
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
    tr = transcribe(asr, wav_out, meta.get('prompt'))
    json.dump(tr, open(os.path.join(d, 'asr.json.tmp'), 'w'), ensure_ascii=False)
    os.replace(os.path.join(d, 'asr.json.tmp'), os.path.join(d, 'asr.json'))
    import soundfile as sf
    info = sf.info(wav_in)
    for f in (wav_in, wav_out):
        os.remove(f)
    done = {'audio_s': round(info.frames / info.samplerate, 1), 'unipase_s': round(t_up, 1), 'asr_s': round(time.time() - t1, 1),
            'seconds': round(time.time() - t0, 1), 'gpu': torch.cuda.get_device_name(0), 'peak_vram_gb': round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)}
    json.dump(done, open(os.path.join(d, 'done.json.tmp'), 'w'))
    os.replace(os.path.join(d, 'done.json.tmp'), os.path.join(d, 'done.json'))
    return done


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--repo', default='/workspace/unipase')
    p.add_argument('--spool', default='/workspace/spool')
    p.add_argument('--weights', default='/workspace/weights')
    p.add_argument('--idle-min', type=float, default=15)
    a = p.parse_args()
    os.makedirs(a.spool, exist_ok=True)
    up, IL, asr = load_models(a.repo, a.weights)
    open(os.path.join(a.spool, '.worker-ready'), 'w').write(str(os.getpid()))
    print(f'{time.strftime("%H:%M:%S")} models loaded', flush=True)
    last = time.time()
    while True:
        ready = sorted(glob.glob(os.path.join(a.spool, '*', 'ready')), key=os.path.getmtime)
        if not ready:
            if time.time() - last > a.idle_min * 60:
                terminate_self(f'idle {a.idle_min} min')
                time.sleep(300)
            time.sleep(2)
            continue
        d = os.path.dirname(ready[0])
        os.rename(ready[0], os.path.join(d, 'running'))
        try:
            r = run_job(d, up, IL, asr)
            print(f'{time.strftime("%H:%M:%S")} {os.path.basename(d)} done {r}', flush=True)
        except Exception:
            open(os.path.join(d, 'error.txt'), 'w').write(traceback.format_exc()[-3000:])
            open(os.path.join(d, 'failed'), 'w').close()
            print(f'{time.strftime("%H:%M:%S")} {os.path.basename(d)} FAILED', flush=True)
        finally:
            try:
                os.remove(os.path.join(d, 'running'))
            except OSError:
                pass
        last = time.time()


if __name__ == '__main__':
    main()
