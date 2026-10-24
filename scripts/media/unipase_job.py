# UniPASE listening copy on a compute host (Chad 10-23 approved by ear: "every single one was a major improvement").
# Runs in the host's UniPASE venv (unipase.conf: UNIPASE_PY / UNIPASE_REPO / UNIPASE_HF), offline (HF_HUB_OFFLINE=1, the
# weights from the local HF cache). The authors' long-form path (8 s segments, 4 s hop, centre-cropped joins; PLC on),
# 48 kHz mono out. Started by the gate as a detached job ('start <ext> <job> --verb unipase'); prints ONE JSON line.
#   python unipase_job.py <input> --output <out.flac> --repo <UniPASE repo>
import argparse, json, os, subprocess, sys, tempfile, time, types

SR = 48000


def espnet_shim():
    """UniPASE's postnet imports two trivial espnet2 symbols; stub them instead of installing espnet (as the lab did)."""
    import torch
    for m in ('espnet2', 'espnet2.enh', 'espnet2.enh.separator', 'espnet2.enh.separator.abs_separator', 'espnet2.torch_utils',
              'espnet2.torch_utils.get_layer_from_string'):
        sys.modules.setdefault(m, types.ModuleType(m))
    sys.modules['espnet2.enh.separator.abs_separator'].AbsSeparator = torch.nn.Module
    acts = {'prelu': torch.nn.PReLU, 'relu': torch.nn.ReLU, 'gelu': torch.nn.GELU, 'silu': torch.nn.SiLU, 'swish': torch.nn.SiLU,
            'tanh': torch.nn.Tanh, 'elu': torch.nn.ELU, 'leakyrelu': torch.nn.LeakyReLU}
    sys.modules['espnet2.torch_utils.get_layer_from_string'].get_layer = lambda name: acts[name.lower()]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('input')
    p.add_argument('--output', required=True)
    p.add_argument('--repo', required=True)
    p.add_argument('--threads', type=int, default=2)
    a = p.parse_args()
    os.environ['HF_HUB_OFFLINE'] = '1'
    t0 = time.time()
    import torch
    torch.set_num_threads(a.threads)
    if not torch.cuda.is_available():   # never on a CPU (heat / time): the caller tries another host later
        raise SystemExit('no GPU')
    espnet_shim()
    sys.path.insert(0, a.repo)
    sys.path.insert(0, os.path.join(a.repo, 'inference'))
    from huggingface_hub import hf_hub_download
    from models.unipase import UniPASE
    import inference_long as IL
    ck = {k: hf_hub_download('Xiaobin-Rong/unipase', f, local_files_only=True)
          for k, f in (('dewavlm', 'DeWavLM-Omni.pt'), ('adapter', 'Adapter.pt'), ('vocoder', 'Vocoder_DWO-L1.pt'), ('postnet', 'PostNet.pt'))}
    m = UniPASE(dewavlm_ckpt_path=ck['dewavlm'], adapter_ckpt_path=ck['adapter'], vocoder_ckpt_path=ck['vocoder'],
                postnet_ckpt_path=ck['postnet']).to('cuda').eval()
    t_load = time.time() - t0
    d = tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(a.output)))
    try:
        wav_in, wav_out = os.path.join(d, 'i.wav'), os.path.join(d, 'o.wav')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', a.input, '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_f32le', wav_in], check=True)
        with torch.inference_mode():
            IL.inference_file(wav_in, wav_out, m, sr_out=SR, enable_plc=True)
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', wav_out, '-ac', '1', '-ar', str(SR), '-c:a', 'flac', '-f', 'flac', a.output], check=True)
        import soundfile as sf
        info = sf.info(wav_in)
        peak = torch.cuda.max_memory_allocated() / 2 ** 30
        print(json.dumps({'output': a.output, 'audio_s': round(info.frames / info.samplerate, 1), 'load_s': round(t_load, 1),
                          'seconds': round(time.time() - t0, 1), 'device': torch.cuda.get_device_name(0), 'peak_vram_gb': round(peak, 2)}))
    finally:
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
        os.rmdir(d)


if __name__ == '__main__':
    main()
