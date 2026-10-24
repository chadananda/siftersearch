# Remaster R&D step 2a: neural WET outputs (100 % processed) of each clip, one model at a time on aorus's shared GPU
# (resource guard first; 10 s chunks, 1 s raised-cosine overlap-add). Venv: ~/media-gpu/venv-rnd (clearvoice, voicefixer).
# Usage: python run_neural.py <root> <model> [clip ...]; writes <root>/wet/<model>/<clip>.wav at 48 kHz, clip length.
#   mf2se  ClearerVoice MossFormer2_SE_48K (mask-style 48 kHz enhancement)
#   mf2sr  ClearerVoice MossFormer2_SR_48K (speech super-resolution; band-limited → 48 kHz)
#   vf0 / vf1  VoiceFixer mode 0 / 1 (generative restoration: denoise + dereverb + declip + bandwidth; may alter voice)
import json, os, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from rnd_common import SR, read, write, wait_resources, chunked

ROOT, MODEL = sys.argv[1], sys.argv[2]
CLIPS = sys.argv[3:] or [f[:-4] for f in sorted(os.listdir(f'{ROOT}/clips')) if f.endswith('.wav')]
os.environ.setdefault('HF_HOME', f'{ROOT}/models/hf')


def clearvoice_fn(task, name):
    from clearvoice import ClearVoice
    os.makedirs(f'{ROOT}/models/clearvoice', exist_ok=True)
    os.chdir(f'{ROOT}/models/clearvoice')         # its checkpoints/ dir is relative to the cwd
    cv = ClearVoice(task=task, model_names=[name])
    tmp = tempfile.mkdtemp(dir=f'{ROOT}/work')

    def fn(seg):
        p = f'{tmp}/in.wav'
        write(p, seg, SR)
        y = cv(input_path=p, online_write=False)
        y = np.asarray(y[0] if isinstance(y, (list, tuple)) else y, dtype=np.float32).reshape(-1)
        return y
    return fn, 10.0


def voicefixer_fn(mode):
    from voicefixer import VoiceFixer
    from scipy.signal import resample_poly
    vf = VoiceFixer()

    def fn(seg):
        x44 = resample_poly(seg, 147, 160).astype(np.float32)
        y = vf.restore_inmem(x44, cuda=True, mode=mode)
        y = np.asarray(y, dtype=np.float32).reshape(-1)
        return resample_poly(y, 160, 147).astype(np.float32)
    return fn, 10.0


def sidon_fn():
    """Sidon v0.1 (w2v-BERT 2.0 feature cleanser + 48 kHz vocoder), as in the authors' demo: 50 Hz high-pass, 16 kHz
    features, peak-normalised input (its level is restored by align() later)."""
    import torch, torchaudio, transformers
    from huggingface_hub import hf_hub_download
    fe = torch.jit.load(hf_hub_download('sarulab-speech/sidon-v0.1', 'feature_extractor_cuda.pt'), map_location='cuda').to('cuda')
    dec = torch.jit.load(hf_hub_download('sarulab-speech/sidon-v0.1', 'decoder_cuda.pt'), map_location='cuda').to('cuda')
    pre = transformers.SeamlessM4TFeatureExtractor.from_pretrained('facebook/w2v-bert-2.0')

    @torch.inference_mode()
    def fn(seg):
        n = len(seg)
        w = torch.from_numpy(0.9 * seg / (np.abs(seg).max() + 1e-9)).float().view(1, -1)
        w = torchaudio.functional.highpass_biquad(w, SR, 50)
        w16 = torch.nn.functional.pad(torchaudio.functional.resample(w, SR, 16000), (0, 24000)).view(-1)
        inp = pre(torch.nn.functional.pad(w16, (160, 160)).numpy(), sampling_rate=16000, return_tensors='pt')
        feat = fe(inp['input_features'].to('cuda'))['last_hidden_state']
        y = dec(feat.transpose(1, 2)).view(-1)[:-960].float().cpu().numpy()
        return y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))
    return fn, 10.0


FACTORY = {
    'sidon': sidon_fn,
    'mf2se': lambda: clearvoice_fn('speech_enhancement', 'MossFormer2_SE_48K'),
    'mf2sr': lambda: clearvoice_fn('speech_super_resolution', 'MossFormer2_SR_48K'),
    'vf0': lambda: voicefixer_fn(0),
    'vf1': lambda: voicefixer_fn(1),
}


def main():
    os.makedirs(f'{ROOT}/work', exist_ok=True)
    v, r = wait_resources(3.0, 4.0)
    print(f'{MODEL}: VRAM {v:.1f} GB free, RAM {r:.1f} GB free', flush=True)
    t0 = time.time()
    fn, chunk_s = FACTORY[MODEL]()
    log = {}
    for c in CLIPS:
        x = read(f'{ROOT}/clips/{c}.wav')
        t1 = time.time()
        y = chunked(x, SR, fn, chunk_s=chunk_s, overlap_s=1.0)
        write(f'{ROOT}/wet/{MODEL}/{c}.wav', y)
        log[c] = round(time.time() - t1, 1)
        print(MODEL, c, log[c], 's', flush=True)
    import torch
    log['_peak_vram_gb'] = round(torch.cuda.max_memory_allocated() / 2 ** 30, 2) if torch.cuda.is_available() else None
    log['_total_s'] = round(time.time() - t0, 1)
    json.dump(log, open(f'{ROOT}/wet/{MODEL}/_run.json', 'w'))
    print(json.dumps(log))


if __name__ == '__main__':
    main()
