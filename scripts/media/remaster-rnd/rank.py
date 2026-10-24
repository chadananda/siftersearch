# Remaster R&D step 4: apply the INTELLIGIBILITY VETO to the screening results and rank the survivors per clip.
# Veto (vs the original's own ASR run; the floor absorbs ASR churn on any re-processed audio):
#   words lost > max(3, 6 % of the original's words) + 2 · matched-word confidence down > 0.02 · voice similarity < 0.85 (0.80 hard)
#   · clipping · any word whose energy fell > 6 dB (gated syllable)
# Rank survivors by SQUIM STOI estimate, then PESQ estimate. Usage: python rank.py <root> [n_keep=3] → prints, writes
# <root>/screen/_ranking.json
import glob, json, os, sys

ROOT = sys.argv[1]
KEEP = int(sys.argv[2]) if len(sys.argv) > 2 else 3


def load(clip):
    out = {}
    for f in glob.glob(f'{ROOT}/screen/{clip}/*.json'):
        d = json.load(open(f))
        d.pop('_emb', None)
        d.pop('words', None)
        out[os.path.basename(f)[:-5]] = d
    return out


def vetoes(m, floor):
    v = []
    if m['words_lost'] > floor + 2:
        v.append(f"lost {m['words_lost']} words (floor {floor})")
    if (m.get('matched_dp') or 0) < -0.02:
        v.append(f"word confidence {m['matched_dp']:+.3f}")
    if m['voice_sim'] < 0.85:
        v.append(f"voice {m['voice_sim']}")
    if m['clip_pct'] > 0.01:
        v.append(f"clipping {m['clip_pct']}%")
    if m.get('word_drop6', 0) > 0:
        v.append(f"{m['word_drop6']} gated words")
    return v


def main():
    res = {}
    for clip in sorted(os.listdir(f'{ROOT}/screen')):
        if clip.startswith('_'):
            continue
        ms = load(clip)
        if 'original' not in ms:
            continue
        floor = max(3, round(0.06 * (ms['original'].get('n_words') or 0)))   # ASR churn on any re-processing (not the classic chain: on Panahi its level ride raised the hiss and lost 25 words)
        rows = []
        for n, m in ms.items():
            if n == 'original':
                continue
            rows.append({'name': n, 'veto': vetoes(m, floor), **{k: m.get(k) for k in ('words_lost', 'words_added', 'matched_dp', 'stoi_est', 'pesq_est', 'voice_sim', 'onset_drop6', 'word_drop6', 'bandwidth_khz', 'mean_p')}})
        ok = sorted([r for r in rows if not r['veto'] and r['name'] != 'classic'], key=lambda r: (-r['stoi_est'], -r['pesq_est']))
        res[clip] = {'original': {k: ms['original'].get(k) for k in ('n_words', 'mean_p', 'stoi_est', 'pesq_est', 'bandwidth_khz')}, 'floor': floor,
                     'survivors': ok, 'vetoed': [r for r in rows if r['veto']], 'classic': next((r for r in rows if r['name'] == 'classic'), None)}
        o = res[clip]['original']
        print(f"\n== {clip}  original: {o['n_words']} words, STOI~{o['stoi_est']}, PESQ~{o['pesq_est']}, bw {o['bandwidth_khz']} kHz; jitter floor {floor}")
        for r in ok:
            print(f"  OK  {r['name']:24} lost {r['words_lost']:2} stoi {r['stoi_est']} pesq {r['pesq_est']} voice {r['voice_sim']} bw {r['bandwidth_khz']} on6 {r['onset_drop6']}")
        for r in res[clip]['vetoed']:
            print(f"  VETO {r['name']:23} {'; '.join(r['veto'])}")
    json.dump(res, open(f'{ROOT}/screen/_ranking.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
