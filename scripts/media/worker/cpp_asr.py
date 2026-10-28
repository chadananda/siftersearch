# whisper.cpp (HIP/ROCm or CUDA build) as the GPU ASR engine on AMD hosts. No CPU fallback: refuses when the GPU backend was not used.
# Measured on boss (gfx1151, 10-28, scripts/media/asr-bench): WER 2.7-8.3 %, RTF 0.023-0.05 (faster-whisper CPU int8: 4.1-7.5 %, 0.12-0.14).
import json, os, re, subprocess, tempfile
import numpy as np

SR = 16000
BIN = os.environ.get('WHISPER_CPP', '/opt/whispercpp/bin/whisper-cli')
MODEL = os.environ.get('WHISPER_CPP_MODEL', '/opt/models/whispercpp/ggml-large-v3-turbo.bin')
GPU_MARKERS = ('using ROCm', 'using CUDA', 'using Vulkan')


class NoGpu(RuntimeError):
    pass


def available():
    return os.path.exists(BIN) and os.path.exists(MODEL) and os.path.exists('/dev/kfd')


def _decode(path):
    out = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32)


def run(audio, lang=None, prompt=None, threads=4, detect_only=False):
    """audio: float32 16 kHz mono ndarray or a file path -> {'language', 'segments': [{start, end, text, words: [{w, s, e, p}]}]}."""
    import soundfile as sf
    if isinstance(audio, str):
        audio = _decode(audio)
    with tempfile.TemporaryDirectory(prefix='cpp-asr-') as d:
        wav = os.path.join(d, 'a.wav')
        sf.write(wav, audio, SR, subtype='PCM_16')
        cmd = [BIN, '-m', MODEL, '-f', wav, '-l', lang or 'auto', '-t', str(max(1, threads)), '-mc', '0', '-bs', '1', '-ojf', '-of', os.path.join(d, 'o')]
        if prompt:
            cmd += ['--prompt', prompt]
        if detect_only:
            cmd += ['-dl']
        env = dict(os.environ)
        lib = os.path.join(os.path.dirname(os.path.dirname(BIN)), 'lib')
        env['LD_LIBRARY_PATH'] = ':'.join(x for x in (lib, env.get('LD_LIBRARY_PATH', '')) if x)
        r = subprocess.run(cmd, capture_output=True, text=True, env=env)
        log = (r.stdout or '') + (r.stderr or '')
        if r.returncode != 0:
            raise RuntimeError('whisper.cpp failed: ' + log[-300:])
        if not any(m in log for m in GPU_MARKERS):
            raise NoGpu('whisper.cpp did not run on the GPU (no CPU fallback): ' + log[-300:])
        m = re.search(r'auto-detected language: (\w+)', log)
        if detect_only:
            return {'language': m.group(1) if m else (lang or 'en'), 'segments': []}
        j = json.load(open(os.path.join(d, 'o.json')))
        language = (j.get('result') or {}).get('language') or (m.group(1) if m else lang or 'en')
        segs = []
        for t in j.get('transcription', []):
            tx = (t.get('text') or '').strip()
            if not tx or (tx[0] in '[(' and tx[-1] in '])'):
                continue   # [BLANK_AUDIO], (music) ...
            words, cur = [], None
            for tk in t.get('tokens', []):
                txt = tk.get('text', '')
                if txt.startswith('[_') or txt.startswith('<|'):
                    continue
                o = tk.get('offsets') or {}
                if cur is None or txt.startswith(' '):
                    if cur and cur['w']:
                        words.append(cur)
                    cur = {'w': txt.strip(), 's': round(o.get('from', 0) / 1000, 3), 'e': round(o.get('to', 0) / 1000, 3), 'p': round(float(tk.get('p', 0)), 3)}
                else:
                    cur['w'] += txt
                    cur['e'] = round(o.get('to', 0) / 1000, 3)
                    cur['p'] = min(cur['p'], round(float(tk.get('p', 0)), 3))
            if cur and cur['w']:
                words.append(cur)
            segs.append({'start': t['offsets']['from'] / 1000, 'end': t['offsets']['to'] / 1000, 'text': tx, 'words': words})
        return {'language': language, 'segments': segs}


class _W:
    def __init__(self, d): self.word, self.start, self.end, self.probability = d['w'], d['s'], d['e'], d['p']


class _S:
    def __init__(self, d, lang):
        self.start, self.end, self.text, self.language = d['start'], d['end'], d['text'], lang
        self.words = [_W(w) for w in d['words']]


class _I:
    def __init__(self, lang): self.language = lang


class CppWhisper:
    """The slice of faster_whisper.WhisperModel that runpod_worker.transcribe() uses, on whisper.cpp."""
    def __init__(self, threads=4): self.threads = threads

    def transcribe(self, audio, language=None, initial_prompt=None, **_ignored):
        r = run(audio, language, initial_prompt, self.threads)
        return [_S(s, r['language']) for s in r['segments']], _I(r['language'])
