# Remaster R&D step 5: the BLIND listening page. Per clip: the original + the chosen survivors (already at -18 LUFS),
# encoded AAC 192 kb/s (transparent; no Opus voip cap), shuffled under letters A–E with a seeded RNG; the key and the
# screening numbers sit behind a "Reveal" toggle. Picks are saved in the artifact's db (picks/<round>-<clip>).
# Usage: python make_page.py <root> <selection.json> <outdir>   selection: {"round": "r1", "clips": {"ioas": ["classic", ...]},
#   optional "desc"/"tags" {version: text} (tags = local/API + cost per audio hour), "links" [{label, url}]}
# → <outdir>/index.html + <outdir>/audio/<round>-<clip>-<letter>.mp4 (AAC in MP4: the artifact host serves .mp4, not .m4a)
import html, json, os, random, subprocess, sys

ROOT, SEL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sel = json.load(open(SEL))
RND = sel['round']
clips_meta = json.load(open(f'{ROOT}/clips/clips.json'))
NAMES = {   # plain-language description of each chain, shown only after Reveal
    'original': 'Original (level-matched only)',
    'classic': 'Classic broadcast chain: rumble cut, mud cut, presence lift, slow level ride, gentle compression',
    'dfn6': 'DeepFilterNet3, attenuation capped at 6 dB',
    'dfn12-w50': 'DeepFilterNet3 (12 dB cap), 50 % wet / 50 % original',
    'mf2se-w35': 'MossFormer2-SE-48K (ClearerVoice), 35 % wet',
    'mf2se-w60': 'MossFormer2-SE-48K (ClearerVoice), 60 % wet',
    'mf2se-w100': 'MossFormer2-SE-48K (ClearerVoice), fully processed',
    'resden-w60': 'Resemble Enhance denoiser only, 60 % wet',
    'resden-w100': 'Resemble Enhance denoiser only, fully processed',
    'sgmse-w60': 'SGMSE+ 48 kHz diffusion (EARS-WHAM), 60 % wet',
    'sgmse-w100': 'SGMSE+ 48 kHz diffusion (EARS-WHAM), fully processed',
    'sgmserev-w60': 'SGMSE+ 48 kHz dereverberation (EARS-Reverb), 60 % wet',
    'sidon-w50': 'Sidon restoration (w2v-BERT + vocoder), 50 % wet',
    'mf2se-w60+vf0-hf': 'MossFormer2 60 % + VoiceFixer-generated top band (may alter the voice)',
    't2-deres': 'MossFormer2 60 % + de-resonance EQ (cuts the boxy 630 Hz peak, presence tilt up to the band edge)',
    't2-deres-wpe': 'MossFormer2 60 % + de-resonance EQ + gentle WPE dereverb (50 %)',
    't3-mud4-wpe': 'Round-2 pick, re-voiced: mud cut -4 dB at 320 Hz + 100 Hz high-pass, presence lift moved down to 0.8-1.8 kHz, WPE 50 %',
    't3-mud4-wpe-deess': 'Same as above + split-band de-esser on 2.0-3.6 kHz (sibilant peaks only, up to -8 dB)',
    't3-mud7-wpe-deess': 'Your round-3 pick F: deeper mud cut (-7 dB at 320 Hz) + lower presence lift + WPE 50 % + de-esser. "s" contrast 7.5 dB (original 7.9)',
    't3-mud7-wpe80-deess': 'Deeper mud cut (-7 dB) + lower presence lift + stronger WPE dereverb (80 %) + de-esser',
    't4-ratio12': 'Round-3 pick F + s-detecting de-esser (1.8-5 kHz, up to -12 dB). "s" contrast 7.5 -> 2.2 dB. Turns one s-heavy word down >6 dB; ASR keeps every word',
    't4-ratio16-lift14': 'F with the presence lift stopping at 1.4 kHz + s-detecting de-esser up to -16 dB. "s" contrast 7.5 -> 0.5 dB. One s-heavy word >6 dB down; ASR keeps every word',
    't4-ratio16-lift14-mf45': 'As above with the MossFormer2 denoise at 45 % (it sharpens s by 2-3 dB). "s" contrast -> 0.2 dB',
    't4-level16': 'F with a harder level de-esser (1.8-5 kHz, threshold -2 dB lower, up to -16 dB). "s" contrast 7.5 -> 5.9 dB',
    't2-deres-wpe-exc2': 'MossFormer2 60 % + de-resonance + WPE + harmonic exciter above 2 kHz (amount 2; classic, not generative)',
    't2-deres-wpe-exc4': 'MossFormer2 60 % + de-resonance + WPE + harmonic exciter above 2 kHz (amount 4; classic, not generative)',
    't2-deres-wpe+mf2sr-hf-4': 'MossFormer2 60 % + de-resonance + WPE + MossFormer2-SR high band above 2.9 kHz at -4 dB',
    't2-deres-wpe+resenh-hf-4': 'MossFormer2 60 % + de-resonance + WPE + Resemble-enhancer high band above 2.9 kHz at -4 dB (BORDERLINE: may clip words)',
    't2-deres-wpe+sidon-hf-4': 'MossFormer2 60 % + de-resonance + WPE + Sidon high band above 2.9 kHz at -4 dB',
    't2-deres-wpe+audiosr-hf-4': 'MossFormer2 60 % + de-resonance + WPE + AudioSR high band above 2.9 kHz at -4 dB',
    'mf2se-w60+mf2sr-hf': 'MossFormer2 60 % + MossFormer2 super-resolution top band',
    'mf2se-w60+audiosr-hf': 'MossFormer2 60 % + AudioSR-generated top band (may alter the voice)',
    'sgmse-w60+audiosr-hf': 'SGMSE+ 60 % + AudioSR-generated top band (may alter the voice)',
}


def metrics(clip, name):
    p = f'{ROOT}/screen/{clip}/{name}.json'
    if not os.path.exists(p):
        return {}
    d = json.load(open(p))
    return {k: d.get(k) for k in ('words_lost', 'words_added', 'lost', 'added', 'stoi_est', 'pesq_est', 'voice_sim', 'bandwidth_khz', 'rolloff99_hz', 'n_words')}


def main():
    os.makedirs(f'{OUT}/audio', exist_ok=True)
    rng = random.Random(f'remaster-{RND}')
    data = []
    for clip, names in sel['clips'].items():
        versions = ['original'] + [n for n in names if n != 'original']
        order = versions[:]
        rng.shuffle(order)
        items = []
        for i, name in enumerate(order):
            L = 'ABCDEFGHIJKL'[i]
            f = f'audio/{RND}-{clip}-{L}.mp4'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', f'{ROOT}/cands/{clip}/{name}.wav', '-ac', '1', '-ar', '48000',
                            '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', f'{OUT}/{f}'], check=True)
            items.append({'letter': L, 'file': f, 'key': name, 'desc': (sel.get('desc') or {}).get(name) or NAMES.get(name, name), 'tag': (sel.get('tags') or {}).get(name, ''), 'm': metrics(clip, name)})
        cm = clips_meta[clip]
        data.append({'clip': clip, 'doc': f'{RND}-{clip}', 'defect': cm['defect'], 'slug': cm['slug'], 'start': cm['start_s'], 'grade': cm['grade'], 'items': items})
    tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'page_template.html')).read()
    page = tpl.replace('__DATA__', json.dumps({'round': RND, 'title': sel.get('title', ''), 'links': sel.get('links', []), 'clips': data}, ensure_ascii=False).replace('</', '<\\/'))
    page = page.replace('__INTRO__', html.escape(sel.get('intro', '')))
    open(f'{OUT}/index.html', 'w').write(page)
    json.dump(data, open(f'{OUT}/key.json', 'w'), indent=1)
    print(f'{OUT}/index.html', sum(len(d['items']) for d in data), 'files')


if __name__ == '__main__':
    main()
