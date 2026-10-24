# Remaster R&D step 1: cut the 40 s test clips (one per defect class) from the originals copied to <root>/src.
# Window = the most speech-dense 40 s between 15 % and 75 % of the talk (Ioas: the whole 66 s talk is eligible).
# Writes <root>/clips/<key>.wav (48 kHz mono float) + clips.json. Deps: numpy, soundfile, ffmpeg on PATH.
import json, os, subprocess, sys
import numpy as np
import soundfile as sf

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/data/remaster-rnd'
LEN = 40.0
CLIPS = {   # key: (source file, defect class, library slug, grade summary)
    'ioas': ('ioas.mp3', 'muffled + hiss', 'bahai/bahai-perspective/ioas-our-responsibilities', 'bw 2.98 kHz, SNR 17.6 dB, NISQA 1.30, overall D'),
    'panahi': ('panahi.aiff', 'heavy tape hiss (1952)', 'bahai/pilgrim-recollections-shoghi-effendi/aziz-panahi-1952', 'SNR 15.4 dB broadband hiss, bw 9.25 kHz, NISQA 1.38, ASR -0.47, overall E'),
    'muhajir': ('muhajir.opus', 'room / reverberant lecture (1963)', 'bahai/bahai-perspective/muhajir-spiritual-conquest-of-the-planet-1963', 'crowd/room noise, bw 7.29 kHz, NISQA 2.17, ASR -0.49, overall D'),
    'sears': ('sears.mp3', 'low-level quiet speech (1987 cassette)', 'bahai/ghaneh-fananapazir/11-days-in-the-steps-of-the-master', 'LUFS -36.2, loudness range 12.5 dB, hiss, bw 5.6 kHz, overall C'),
    'banani': ('banani.mp3', 'mains hum + old tape', 'bahai/bahai-perspective/hand-of-the-cause-of-god-musa-banani', 'hum 15.4 dB (50 Hz), bw 5.46 kHz, NISQA 1.89, overall D'),
}


def decode(path, sr):
    r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def best_window(x, sr, lo, hi):
    n = int(sr * 0.025)
    e = 10 * np.log10(np.mean(x[: len(x) // n * n].reshape(-1, n) ** 2, axis=1) + 1e-12)
    speech = (e > np.percentile(e, 10) + 12).astype(float)
    per_s = int(1 / 0.025)
    w = int(LEN * per_s)
    cs = np.concatenate([[0], np.cumsum(speech)])
    best, bs = lo, -1
    for s in range(int(lo * per_s), max(int(lo * per_s) + 1, int(hi * per_s) - w), per_s):   # 1 s steps
        v = cs[min(s + w, len(speech))] - cs[s]
        if v > bs:
            best, bs = s / per_s, v
    return best, bs / w


def main():
    os.makedirs(f'{ROOT}/clips', exist_ok=True)
    out = {}
    for key, (src, defect, slug, grade) in CLIPS.items():
        path = f'{ROOT}/src/{src}'
        x16 = decode(path, 16000)
        dur = len(x16) / 16000
        lo, hi = (0, dur) if dur < 120 else (dur * 0.15, dur * 0.75)
        start, share = best_window(x16, 16000, lo, hi)
        start = min(start, max(0.0, dur - LEN))
        x = decode(path, 48000)[int(start * 48000): int((start + LEN) * 48000)]
        sf.write(f'{ROOT}/clips/{key}.wav', x, 48000, subtype='FLOAT')
        out[key] = {'src': src, 'defect': defect, 'slug': slug, 'grade': grade, 'start_s': round(start, 1), 'len_s': LEN, 'speech_share': round(share, 3), 'talk_s': round(dur, 1)}
        print(key, out[key], flush=True)
    json.dump(out, open(f'{ROOT}/clips/clips.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
