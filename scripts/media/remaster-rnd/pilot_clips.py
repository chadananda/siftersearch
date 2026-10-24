# Remaster pilot step 1: one 60 s excerpt per muffled pilot talk (the most speech-dense minute between 20 % and 70 %), from
# originals already copied to <root>/pilot/src/<key>.<ext>. → <root>/pilot/clips/<key>.wav (48 kHz) + pilot/clips/clips.json
# Deps: numpy, soundfile, ffmpeg. Usage: python pilot_clips.py <root>
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import soundfile as sf
import clips as C

ROOT = sys.argv[1]
P = f'{ROOT}/pilot'
TALKS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pilot_talks.json')))
C.LEN = 60.0


def main():
    os.makedirs(f'{P}/clips', exist_ok=True)
    out = {}
    for key, t in TALKS.items():
        src = next(f for f in os.listdir(f'{P}/src') if f.rsplit('.', 1)[0] == key)
        x16 = C.decode(f'{P}/src/{src}', 16000)
        dur = len(x16) / 16000
        start, share = C.best_window(x16, 16000, dur * 0.2, dur * 0.7)
        x = C.decode(f'{P}/src/{src}', 48000)[int(start * 48000): int((start + C.LEN) * 48000)]
        sf.write(f'{P}/clips/{key}.wav', x, 48000, subtype='FLOAT')
        out[key] = {**t, 'start_s': round(start, 1), 'len_s': C.LEN, 'speech_share': round(float(share), 3), 'talk_s': round(dur, 1)}
        print(key, out[key]['start_s'], flush=True)
    json.dump(out, open(f'{P}/clips/clips.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
