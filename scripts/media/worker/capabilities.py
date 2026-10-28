# Host admission + capability manifest. A worker host needs a WORKING GPU (NVIDIA or AMD, proven by a tiny run on it), plenty of VRAM and RAM, and
# usable CPU. Anything less REFUSES to claim orders (exit 3, reason on stderr/json); a rented pod then self-terminates. Chad 10-28: no weak hosts,
# no CPU-only hosts, vendor-blind (vendor only picks the backend). CPU-suited stages (probe, metrics, encodes, packaging) still run on the CPU.
import glob, json, os, shutil, subprocess, sys, time

MIN = {'ram_gb': float(os.environ.get('SIFTER_MIN_RAM_GB', 16)), 'vram_gb': float(os.environ.get('SIFTER_MIN_VRAM_GB', 8)), 'cpus': int(os.environ.get('SIFTER_MIN_CPUS', 4))}
ENGINES = {'nvidia': {'asr': 'faster-whisper-cuda', 'restore': 'torch-cuda', 'align': 'torch-cuda', 'diarize': 'sherpa-cuda'},
           'amd': {'asr': 'whisper.cpp-hip', 'restore': 'torch-rocm', 'align': 'torch-rocm', 'diarize': 'sherpa-cpu'}}


def decide(info, minimum=None):
    """Pure: the reasons this host must not claim orders (empty list = admitted)."""
    m = minimum or MIN
    why = []
    if info.get('backend') not in ENGINES:
        why.append('no GPU backend (neither nvidia-smi nor an amdgpu device): GPU stages cannot run, and there is no CPU fallback')
    else:
        if not info.get('gpu_proof_ok'):
            why.append('GPU self-test failed: ' + str(info.get('gpu_proof_error') or 'no GPU execution observed'))
        if (info.get('vram_gb') or 0) < m['vram_gb']:
            why.append(f"VRAM {info.get('vram_gb') or 0:.1f} GB < {m['vram_gb']:g} GB")
    if (info.get('ram_gb') or 0) < m['ram_gb']:
        why.append(f"system RAM {info.get('ram_gb') or 0:.1f} GB < {m['ram_gb']:g} GB")
    if (info.get('cpus') or 0) < m['cpus']:
        why.append(f"{info.get('cpus') or 0} CPUs < {m['cpus']}")
    if not info.get('cpu_ok', True):
        why.append('CPU self-test failed: ' + str(info.get('cpu_error') or 'ffmpeg encode'))
    return why


def _sh(cmd, timeout=20):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def amd_card():
    for d in sorted(glob.glob('/sys/class/drm/card[0-9]*/device')):
        if os.path.exists(d + '/mem_info_vram_total') and os.path.exists(d + '/gpu_busy_percent'):
            return d
    return None


def backend():
    if shutil.which('nvidia-smi'):
        return 'nvidia'
    return 'amd' if amd_card() else None


def gpu_busy():
    """Instantaneous GPU utilisation %, or None when the vendor tool is missing."""
    try:
        if backend() == 'nvidia':
            return float(_sh(['nvidia-smi', '--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], 5).stdout.split()[0])
        d = amd_card()
        return float(open(d + '/gpu_busy_percent').read()) if d else None
    except Exception:
        return None


def cpu_busy(prev=[None]):
    """CPU busy % since the last call (first call: since boot)."""
    f = open('/proc/stat').readline().split()[1:]
    idle, total = int(f[3]) + int(f[4]), sum(int(x) for x in f)
    p, prev[0] = prev[0], (idle, total)
    if p is None:
        return round(100 * (1 - idle / total), 1) if total else 0.0
    di, dt = idle - p[0], total - p[1]
    return round(100 * (1 - di / dt), 1) if dt else 0.0


def detect():
    be = backend()
    mem = {}
    for line in open('/proc/meminfo'):
        k, v = line.split(':')
        mem[k] = float(v.split()[0]) / 1048576
    info = {'backend': be, 'ram_gb': round(mem.get('MemTotal', 0), 1), 'ram_avail_gb': round(mem.get('MemAvailable', 0), 1), 'cpus': os.cpu_count() or 0, 'gpu_name': None, 'vram_gb': 0}
    try:
        if be == 'nvidia':
            n, t = _sh(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 5).stdout.splitlines()[0].split(',')
            info.update(gpu_name=n.strip(), vram_gb=round(float(t) / 1024, 1))
        elif be == 'amd':
            d = amd_card()
            info['vram_gb'] = round(float(open(d + '/mem_info_vram_total').read()) / 2 ** 30, 1)
            info['gpu_name'] = open(d + '/product_name').read().strip() if os.path.exists(d + '/product_name') else 'amdgpu'
    except Exception as err:
        info['gpu_error'] = str(err)[:120]
    return info


def gpu_proof(info):
    """A tiny run that must EXECUTE on the GPU: a torch matmul on the accelerator (UniPASE, alignment) and, on AMD, whisper.cpp language detection
    (ASR) whose log must name the GPU backend. Records the utilisation seen while it ran."""
    import threading
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('torch sees no accelerator')
    seen = []
    stop = threading.Event()

    def sampler():
        while not stop.is_set():
            b = gpu_busy()
            if b is not None:
                seen.append(b)
            time.sleep(0.2)
    t = threading.Thread(target=sampler, daemon=True)
    t.start()
    try:
        x = torch.randn(4096, 4096, device='cuda')
        t0 = time.time()
        while time.time() - t0 < 1.5:
            x = (x @ x).tanh()
        torch.cuda.synchronize()
        info['gpu_torch'] = torch.cuda.get_device_name(0)
        if info['backend'] == 'amd':
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import cpp_asr, numpy as np
            if not cpp_asr.available():
                raise RuntimeError('whisper.cpp binary/model/kfd missing')
            cpp_asr.run(np.zeros(16000 * 3, dtype='float32'), None, None, 2, detect_only=True)   # raises NoGpu unless the log names the GPU backend
        else:
            import ctranslate2
            if ctranslate2.get_cuda_device_count() < 1:
                raise RuntimeError('CTranslate2 sees no CUDA device')
    finally:
        stop.set()
        t.join()
    info['gpu_busy_peak_pct'] = max(seen) if seen else None
    if seen and max(seen) <= 0:
        raise RuntimeError('no GPU utilisation observed during the self-test')


def cpu_proof(info):
    try:
        _sh(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1', '-f', 'null', '-'], 30)
        info['cpu_ok'] = True
    except Exception as err:
        info['cpu_ok'] = False
        info['cpu_error'] = str(err)[:120]


def assess(minimum=None, prove=True):
    info = detect()
    cpu_proof(info)
    info['gpu_proof_ok'] = False
    if prove and info['backend']:
        try:
            gpu_proof(info)
            info['gpu_proof_ok'] = True
        except Exception as err:
            info['gpu_proof_error'] = str(err)[:300]
    why = decide(info, minimum)
    return {'ok': not why, 'reasons': why, **info, 'min': minimum or MIN, 'engines': ENGINES.get(info['backend']),
            'cpu_busy_pct': cpu_busy(), 'gpu_busy_pct': gpu_busy(), 'at': int(time.time())}


def main(argv):
    if '--decide' in argv:                      # tests / dry runs: info JSON on stdin
        why = decide(json.load(sys.stdin))
        print(json.dumps({'ok': not why, 'reasons': why}))
        return 0 if not why else 3
    m = assess()
    print(json.dumps(m))
    if not m['ok']:
        print('REFUSING TO CLAIM ORDERS: ' + '; '.join(m['reasons']), file=sys.stderr)
        return 3
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
