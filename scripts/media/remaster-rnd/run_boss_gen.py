# Remaster lab: generative restorers on BOSS's GPU (Radeon 8060S gfx1151, ROCm via AMD TheRock torch; venv
# /mnt/data4tb/remaster-rnd/venvs/rocm). One model per process; rnd_common guards (VRAM floor + 50 GB kept for the local LLM,
# RAM, package temp ≥ 95 °C → pause). Input = any wav (a clip, or another model's output for chains). Records seconds per clip.
#   stupase                  StuPASE (2026, 16 kHz out; pair with lavasr for the band)
#   unipase                  UniPASE (2026; DeWavLM-Omni + adapter + vocoder + BWE postnet; 48 kHz out), authors' long-form chunking
#   lavasr[:cutoff_hz]       LavaSR v2 bandwidth extension (Vocos BWE + LR refiner), input at 16 kHz with the TRUE cutoff stated
#   audiosr[:cutoff_hz]      AudioSR 'speech'; with a cutoff the input is first resampled to 2×cutoff (it assumes cutoff = sr/2)
#   voicefixer[:cutoff_hz]   VoiceFixer mode 0, same resampling rule
#   sidon                    Sidon v0.1 (TorchScript)
# Usage: python run_boss_gen.py <root> <model[:cutoff]> <in.wav|batch.txt> <out_name> [clip] → <root>/wet/<out_name>/<clip>.wav + _runs.jsonl
# Runs on aorus too (CUDA; same guards) when given that host's root.
import json, os, sys, time, types
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.signal import resample_poly
from rnd_common import SR, read, write, wait_resources, chunked

ROOT, SPEC, INP, OUT = sys.argv[1:5]
CLIP = sys.argv[5] if len(sys.argv) > 5 else os.path.basename(INP)[:-4]
MODEL, _, CUT = SPEC.partition(':')
CUT = int(CUT) if CUT else None
REPOS = f'{ROOT}/repos'
os.environ.setdefault('HF_HOME', f'{ROOT}/models/hf')


def rs(x, a, b):
    g = np.gcd(a, b)
    return resample_poly(x, b // g, a // g).astype(np.float32)


def fit(y, n):
    y = np.asarray(y, dtype=np.float32).reshape(-1)
    return y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))


def espnet_shim():
    """UniPASE's postnet imports two trivial espnet2 symbols; stub them instead of installing espnet."""
    import torch
    for m in ('espnet2', 'espnet2.enh', 'espnet2.enh.separator', 'espnet2.enh.separator.abs_separator', 'espnet2.torch_utils', 'espnet2.torch_utils.get_layer_from_string'):
        sys.modules.setdefault(m, types.ModuleType(m))
    sys.modules['espnet2.enh.separator.abs_separator'].AbsSeparator = torch.nn.Module
    acts = {'prelu': torch.nn.PReLU, 'relu': torch.nn.ReLU, 'gelu': torch.nn.GELU, 'silu': torch.nn.SiLU, 'swish': torch.nn.SiLU, 'tanh': torch.nn.Tanh, 'elu': torch.nn.ELU, 'leakyrelu': torch.nn.LeakyReLU}
    sys.modules['espnet2.torch_utils.get_layer_from_string'].get_layer = lambda name: acts[name.lower()]


def load(model):
    import torch
    if model == 'unipase':
        espnet_shim()
        sys.path.insert(0, f'{REPOS}/unipase')
        from huggingface_hub import hf_hub_download
        from models.unipase import UniPASE
        ck = {k: hf_hub_download('Xiaobin-Rong/unipase', f) for k, f in (('dewavlm', 'DeWavLM-Omni.pt'), ('adapter', 'Adapter.pt'), ('vocoder', 'Vocoder_DWO-L1.pt'), ('postnet', 'PostNet.pt'))}
        m = UniPASE(dewavlm_ckpt_path=ck['dewavlm'], adapter_ckpt_path=ck['adapter'], vocoder_ckpt_path=ck['vocoder'], postnet_ckpt_path=ck['postnet']).to('cuda').eval()
        sys.path.insert(0, f'{REPOS}/unipase/inference')
        import inference_long as IL

        def run(x):   # the authors' long-form path: 8 s segments, 4 s hop, centre-cropped joins
            import soundfile as sf, tempfile
            d = tempfile.mkdtemp(dir=f'{ROOT}/tmp')
            sf.write(f'{d}/i.wav', x, SR)
            IL.inference_file(f'{d}/i.wav', f'{d}/o.wav', m, sr_out=SR, enable_plc=True)
            return read(f'{d}/o.wav')
        return run
    if model == 'stupase':   # StuPASE (Interspeech 2026; DeWavLM-R + flow-matching mel + 16 kHz vocoder), authors' defaults
        sys.path.insert(0, f'{REPOS}/pase/stupase')
        from huggingface_hub import hf_hub_download
        from models.stupase import StuPASE
        ck = [hf_hub_download('cisco-ai/stupase', f) for f in ('DeWavLM-R.pt', 'CFM.pt', 'Vocoder_Mel-16k.pt')]
        sm = StuPASE(dewavlm_ckpt_path=ck[0], cfm_ckpt_path=ck[1], vocoder_ckpt_path=ck[2]).to('cuda').eval()

        def one(seg):
            x16 = torch.from_numpy(rs(seg, SR, 16000)).unsqueeze(0).to('cuda')
            y = sm(x16, steps=8, cfg_strength=0.5, sway_sampling_coef=-1.0).float().cpu().numpy().reshape(-1)
            return fit(rs(y, 16000, SR), len(seg))
        return lambda x: chunked(x, SR, one, chunk_s=10.0, overlap_s=1.0)
    if model == 'lavasr':
        sys.path.insert(0, f'{REPOS}/LavaSR')
        from LavaSR.model import LavaEnhance2
        from huggingface_hub import snapshot_download
        lm = LavaEnhance2(snapshot_download('YatharthS/LavaSR'), 'cuda')

        def run(x):
            import tempfile, soundfile as sf
            d = tempfile.mkdtemp(dir=f'{ROOT}/tmp')
            sf.write(f'{d}/i.wav', x, SR)
            wav, _ = lm.load_audio(f'{d}/i.wav', input_sr=16000, cutoff=CUT)
            return fit(lm.enhance(wav, denoise=False, batch=True).float().cpu().numpy(), len(x))
        return run
    if model == 'audiosr':
        from audiosr import build_model, super_resolution
        am = build_model(model_name='speech', device='cuda')

        def one(seg):
            import tempfile, soundfile as sf
            d = tempfile.mkdtemp(dir=f'{ROOT}/tmp')
            x = rs(rs(seg, SR, 2 * CUT), 2 * CUT, SR) if CUT else seg   # band-limit to the true cutoff, so its sr/2 assumption holds
            sf.write(f'{d}/i.wav', rs(x, SR, 2 * CUT) if CUT else x, 2 * CUT if CUT else SR)
            return fit(super_resolution(am, f'{d}/i.wav', seed=42, guidance_scale=3.5, ddim_steps=50, latent_t_per_second=12.8), len(seg))
        return lambda x: chunked(x, SR, one, chunk_s=10.24, overlap_s=1.0)
    if model == 'voicefixer':
        from voicefixer import VoiceFixer
        vf = VoiceFixer()

        def one(seg):
            x = rs(rs(seg, SR, 2 * CUT), 2 * CUT, 44100) if CUT else rs(seg, SR, 44100)
            return fit(rs(np.asarray(vf.restore_inmem(x, cuda=True, mode=0), dtype=np.float32).reshape(-1), 44100, SR), len(seg))
        return lambda x: chunked(x, SR, one, chunk_s=10.0, overlap_s=1.0)
    if model == 'sidon':
        import torchaudio, transformers
        from huggingface_hub import hf_hub_download
        fe = torch.jit.load(hf_hub_download('sarulab-speech/sidon-v0.1', 'feature_extractor_cuda.pt'), map_location='cuda')
        dec = torch.jit.load(hf_hub_download('sarulab-speech/sidon-v0.1', 'decoder_cuda.pt'), map_location='cuda')
        pre = transformers.SeamlessM4TFeatureExtractor.from_pretrained('facebook/w2v-bert-2.0')

        @torch.inference_mode()
        def one(seg):
            w = torch.from_numpy(0.9 * seg / (np.abs(seg).max() + 1e-9)).float().view(1, -1)
            w = torchaudio.functional.highpass_biquad(w, SR, 50)
            w16 = torch.nn.functional.pad(torchaudio.functional.resample(w, SR, 16000), (0, 24000)).view(-1)
            inp = pre(torch.nn.functional.pad(w16, (160, 160)).numpy(), sampling_rate=16000, return_tensors='pt')
            feat = fe(inp['input_features'].to('cuda'))['last_hidden_state']
            return fit(dec(feat.transpose(1, 2)).view(-1)[:-960].float().cpu().numpy(), len(seg))
        return lambda x: chunked(x, SR, one, chunk_s=10.0, overlap_s=1.0)
    raise SystemExit(f'unknown model {model}')


def main():
    """INP = one wav, or a .txt batch (lines: <input wav> <out_name> <clip>) so the model loads once for many clips."""
    os.makedirs(f'{ROOT}/tmp', exist_ok=True)
    wait_resources(4.0, 5.0)
    import torch
    t0 = time.time()
    run = load(MODEL)
    t_load = time.time() - t0
    jobs = [l.split() for l in open(INP) if l.strip()] if INP.endswith('.txt') else [[INP, OUT, CLIP]]
    for inp, out, clip in jobs:
        inp = inp if os.path.isabs(inp) else f'{ROOT}/{inp}'
        x = read(inp)
        t1 = time.time()
        with torch.inference_mode():
            y = run(x)
        torch.cuda.synchronize()
        dt = time.time() - t1
        write(f'{ROOT}/wet/{out}/{clip}.wav', fit(y, len(x)))
        log = {'model': SPEC, 'input': os.path.relpath(inp, ROOT), 'clip': clip, 'device': torch.cuda.get_device_name(0), 'torch': torch.__version__,
               'load_s': round(t_load, 1), 'seconds': round(dt, 1), 'audio_s': round(len(x) / SR, 1),
               'gpu_min_per_audio_hour': round(dt / (len(x) / SR) * 60, 1), 'peak_vram_gb': round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)}
        runs = f'{ROOT}/wet/{out}/_runs.jsonl'
        with open(runs, 'a') as f:
            f.write(json.dumps(log) + '\n')
        json.dump(log, open(f'{ROOT}/wet/{out}/_run.json', 'w'))
        print(json.dumps(log), flush=True)


if __name__ == '__main__':
    main()
