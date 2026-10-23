# Speaker COURTROOM-SKETCH portraits (Chad 10-23: "pen and ink drawings in a courtroom art style … style consistency").
# Image-to-image ONLY from a verified gallery photo (data/media-speaker-gallery.json) — never an invented face; one fixed
# style prompt + a face-free style reference sheet per variant; Gemini draws the 9:16 sheet itself (no stretching), a
# square crop is cut around the drawn face. Likeness: SFace cosine drawing↔source photo and ↔ the person's OTHER photos,
# against impostors (other people's photos). Web client + files only, never the DB. Output: tmp/speaker-sketch/
# Usage: python3 scripts/media/speaker_sketch.py sheet <variant> | draw <key[=sha16]>,… [--variant A] [--force] | score
import json, sys, os, io, re, time, base64, hashlib
import requests, numpy as np, cv2
from PIL import Image, ImageOps

ROOT = os.getcwd()
OUT = os.path.join(ROOT, 'tmp', 'speaker-sketch'); os.makedirs(OUT, exist_ok=True)
YUNET = os.path.join(ROOT, 'tmp', 'speaker-gallery', 'yunet.onnx')
SFACE = os.path.join(ROOT, 'tmp', 'speaker-gallery', 'sface.onnx')
CDN = 'https://siftersearch.com/img/cdn/siftersearch.com/'
MODEL = 'gemini-3.1-flash-image'
GALLERY = json.load(open(os.path.join(ROOT, 'data', 'media-speaker-gallery.json')))['speakers']
S = requests.Session(); S.headers['User-Agent'] = 'SifterSearch media library (https://siftersearch.com)'
rec = cv2.FaceRecognizerSF.create(SFACE, '')

def key():
    for f in ('.env-secrets', '.env-public'):
        for line in open(os.path.join(ROOT, f)):
            if line.startswith('GEMINI_API_KEY='): return line.split('=', 1)[1].strip().strip('"\'')
    raise SystemExit('GEMINI_API_KEY missing')

# ── the style: ONE fixed prompt; variants differ only in the medium sentence + their own style sheet ──────────────────
MEDIUM = {
    'A': 'pen-and-ink with a restrained wash in two muted tones only (a warm sepia and a cool blue-grey), laid loosely so much of the paper stays bare',
    'B': 'black pen-and-ink only — line and cross-hatching, with at most a faint grey ink wash; no colour',
    'C': 'pen-and-ink with soft pastel-chalk touches in two muted tones only (a warm ochre for skin and a slate blue for shadow and clothing), as courtroom artists use',
}
STYLE_SHEET_PROMPT = ('A technique reference sheet for a courtroom sketch artist, on off-white textured drawing paper with visible tooth. '
    'NO people, NO faces, NO hands, NO objects, NO text: only abstract swatches arranged in a loose grid — loose confident ink strokes of '
    'varying weight, cross-hatching gradations from light to dense, quick gestural scribbles, and the medium swatches: {medium}. '
    'A specimen sheet of marks, nothing figurative. The paper fills the whole image edge to edge, seen flat like a scan: no sketchbook, '
    'no table, no paper edges, no shadows, no lettering, labels or numbers.')
PORTRAIT_PROMPT = ('Redraw the person in the FIRST image as a courtroom sketch artist\'s portrait drawn from life: {medium}, on off-white '
    'textured drawing paper. Loose, confident, slightly gestural ink linework; cross-hatching models the form and shadows; the drawing '
    'loosens and dissolves into a few quick strokes toward the edges, leaving bare paper. '
    'LIKENESS IS ESSENTIAL — this must be recognisably the same individual: keep exactly their facial structure and proportions, '
    'eye shape and spacing, nose, mouth, jawline, ears, hairline and hairstyle, beard or moustache, glasses (only if worn in the photo), '
    'skin tone and complexion exactly as photographed (never lighter or darker), expression, apparent age and clothing as in the photograph. Do not idealise, beautify, rejuvenate, age or change the face. '
    'FRAMING: a tall portrait sheet; head and shoulders, the face toward the viewer, the head in the upper third with clear space above it; '
    'the shoulders and chest sketched more loosely below and fading into the paper. Extend the figure by drawing it, never by stretching. '
    'Plain paper background, no setting, no other people. The paper fills the whole image edge to edge, seen flat like a scan: no '
    'paper edges, deckle, card, table or shadow. No text, no signature, no initials, no scribble that looks like writing, no border, no frame. '
    'The SECOND image is only a technique reference: match its ink, hatching, colours and paper exactly, and take nothing else from it.')

# a redo after a failed likeness check may add the person's other verified photos as identity references
REFS_NOTE = (' Any FURTHER images are other verified photographs of the same person, for identity only: use them to get the face '
    'exactly right, but follow the FIRST image for pose, age, expression and clothing.')

def gemini(parts, aspect):
    body = {'contents': [{'parts': parts}], 'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': aspect}}}
    for attempt in range(3):
        r = S.post(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent', json=body,
                   headers={'x-goog-api-key': key()}, timeout=240)
        j = r.json() if r.content else {}
        if r.ok:
            part = next((p for p in (j.get('candidates') or [{}])[0].get('content', {}).get('parts', []) if p.get('inlineData')), None)
            if part:
                u = j.get('usageMetadata', {})
                usd = round((u.get('promptTokenCount', 0) * 0.3 + u.get('candidatesTokenCount', 0) * 30) / 1e6, 4)
                return base64.b64decode(part['inlineData']['data']), usd
            err = f"no image ({(j.get('candidates') or [{}])[0].get('finishReason')})"
        else: err = f"{r.status_code} {str(j.get('error', {}).get('message', ''))[:200]}"
        print('  gemini:', err, file=sys.stderr); time.sleep(5 * (attempt + 1))
    raise RuntimeError(err)

def img_part(b, mime='image/jpeg'): return {'inlineData': {'mimeType': mime, 'data': base64.b64encode(b).decode()}}

def jpeg(img, q=92): o = io.BytesIO(); img.save(o, 'JPEG', quality=q); return o.getvalue()

def load_ledger():
    p = os.path.join(OUT, 'ledger.json')
    return json.load(open(p)) if os.path.exists(p) else {'sheets': {}, 'drawings': {}, 'spend_usd': 0}

def save_ledger(L): json.dump(L, open(os.path.join(OUT, 'ledger.json'), 'w'), indent=1, ensure_ascii=False)

# ── faces ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def detect(img, thr=0.6):
    a = cv2.cvtColor(np.asarray(img.convert('RGB')), cv2.COLOR_RGB2BGR)
    h, w = a.shape[:2]; sc = min(1.0, 1024 / max(w, h))
    if sc < 1: a = cv2.resize(a, (int(w * sc), int(h * sc)))
    det = cv2.FaceDetectorYN.create(YUNET, '', (a.shape[1], a.shape[0]), thr)
    _, f = det.detect(a)
    return a, ([] if f is None else sorted(list(f), key=lambda r: -r[2] * r[3])), sc

def embed_img(img):
    a, fs, sc = detect(img)
    if not fs: a, fs, sc = detect(img, 0.4)
    return (rec.feature(rec.alignCrop(a, fs[0])), fs[0], sc) if fs else (None, None, sc)

def cos(e1, e2): return round(float(rec.match(e1, e2, cv2.FaceRecognizerSF_FR_COSINE)), 3)

_cache = {}
def photo(e):
    if e['sha'] not in _cache:
        p = os.path.join(OUT, '_src', f"{e['sha'][:16]}.img"); os.makedirs(os.path.dirname(p), exist_ok=True)
        if not os.path.exists(p):
            r = S.get(f"{CDN}{e['file']}?v={e['sha'][:16]}", timeout=60); r.raise_for_status(); open(p, 'wb').write(r.content)
        _cache[e['sha']] = ImageOps.exif_transpose(Image.open(p)).convert('RGB')
    return _cache[e['sha']]

def best_photo(k):
    """Highest-quality verified photo with a clear face: face pixels × detector score; talk stills and scans of
    under-400-px faces lose to studio portraits."""
    def score(e):
        f = e.get('face') or {}
        return min(f.get('w', 0), f.get('h', 0), 900) * f.get('s', 0) * (0.6 if e['origin'] == 'youtube-still' else 1)
    # the face people know: the current/reference portrait wins when its face is clear (>= 300 px, detector >= 0.8)
    ref = [e for e in GALLERY[k] if e['origin'] == 'current-primary' and min((e.get('face') or {}).get('w', 0), (e.get('face') or {}).get('h', 0)) >= 300
           and (e.get('face') or {}).get('s', 0) >= 0.8]
    return ref[0] if ref else max(GALLERY[k], key=score)

# LIKENESS GATE (calibrated on the 12 first-pass samples: drawing↔source 0.45–0.74, best impostor 0.18–0.29): pass when the
# drawing matches its source at >= 0.45 (SFace photo threshold 0.363; worst impostor seen 0.33) AND beats the best other person by >= 0.15.
PASS_SOURCE, PASS_MARGIN = 0.45, 0.15
def passes(lk): return bool(lk.get('face')) and (lk.get('source') or 0) >= PASS_SOURCE and (lk['source'] - (lk.get('impostor_max') or 0)) >= PASS_MARGIN

# ── commands ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def cmd_sheet(variant):
    L = load_ledger()
    b, usd = gemini([{'text': STYLE_SHEET_PROMPT.format(medium=MEDIUM[variant])}], '1:1')
    p = os.path.join(OUT, f'style-sheet-{variant}.png'); Image.open(io.BytesIO(b)).convert('RGB').save(p)
    L['sheets'][variant] = {'file': os.path.basename(p), 'usd': usd, 'prompt': STYLE_SHEET_PROMPT.format(medium=MEDIUM[variant])}
    L['spend_usd'] = round(L['spend_usd'] + usd, 4); save_ledger(L); print('sheet', variant, usd)

def square_crop(img):
    """The square crop source: a square around the DRAWN face (head-and-shoulders: ~2.6 face-heights), inside the sheet."""
    W, H = img.size; _, fs, sc = detect(img, 0.4)
    if fs: x, y, w, h = [v / sc for v in fs[0][:4]]; cx, cy, side = x + w / 2, y + h * 0.62, min(W, h * 2.8)
    else: cx, cy, side = W / 2, H * 0.33, W
    l = max(0, min(W - side, cx - side / 2)); t = max(0, min(H - side, cy - side / 2))
    return img.crop((round(l), round(t), round(l + side), round(t + side)))

def cmd_draw(spec, variant='A', force=False, tag='', refs=0):
    L = load_ledger()
    if variant not in L['sheets']: cmd_sheet(variant); L = load_ledger()
    sheet = open(os.path.join(OUT, L['sheets'][variant]['file']), 'rb').read()
    for item in spec.split(','):
        k, _, sha = item.partition('=')
        e = next((x for x in GALLERY[k] if x['sha'].startswith(sha)), None) if sha else best_photo(k)
        name = f'{k}-{variant}{tag}'
        if name in L['drawings'] and not force: print('have', name); continue
        src = photo(e); s = src.copy(); s.thumbnail((1536, 1536))
        parts = [{'text': PORTRAIT_PROMPT.format(medium=MEDIUM[variant]) + (REFS_NOTE if refs else '')}, img_part(jpeg(s)), img_part(sheet, 'image/png')]
        extra = sorted((x for x in GALLERY[k] if x['sha'] != e['sha'] and x.get('face')), key=lambda x: -min(x['face']['w'], x['face']['h']) * x['face']['s'])[:refs]
        for x in extra: t = photo(x).copy(); t.thumbnail((1024, 1024)); parts.append(img_part(jpeg(t)))
        b, usd = gemini(parts, '9:16')
        d = Image.open(io.BytesIO(b)).convert('RGB')
        d.save(os.path.join(OUT, f'{name}.jpg'), quality=92); square_crop(d).save(os.path.join(OUT, f'{name}-sq.jpg'), quality=90)
        s.save(os.path.join(OUT, f'{name}-src.jpg'), quality=88)
        L['drawings'][name] = {'key': k, 'variant': variant, 'source_sha': e['sha'], 'source_file': e['file'], 'source_credit': e.get('credit'),
                               'source_origin': e['origin'], 'identity_refs': [x['sha'][:16] for x in extra], 'w': d.size[0], 'h': d.size[1], 'model': MODEL, 'usd': usd,
                               'sha': hashlib.sha256(b).hexdigest()[:16], 'at': time.strftime('%Y-%m-%dT%H:%M:%S')}
        L['spend_usd'] = round(L['spend_usd'] + usd, 4); save_ledger(L)
        print('drew', name, d.size, f'${usd}', flush=True)

def cmd_score():
    """Likeness: drawing ↔ its source photo, ↔ the person's other verified photos (mean), and the best impostor score
    (the same drawing against one photo of each other person in the sample set + 12 more). Writes scores into the ledger."""
    L = load_ledger()
    keys = sorted({d['key'] for d in L['drawings'].values()})
    pool = keys + [k for k in list(GALLERY)[::6] if k not in keys][:12]
    imp = {k: embed_img(photo(best_photo(k)))[0] for k in pool}
    for name, d in L['drawings'].items():
        de, _, _ = embed_img(Image.open(os.path.join(OUT, f'{name}.jpg')))
        if de is None: d['likeness'] = {'face': False, 'pass': False}; print(name, d['likeness']); continue
        se = embed_img(photo(next(x for x in GALLERY[d['key']] if x['sha'] == d['source_sha'])))[0]
        others = [embed_img(photo(x))[0] for x in GALLERY[d['key']] if x['sha'] != d['source_sha']][:4]
        others = [o for o in others if o is not None]
        imps = sorted(((cos(de, v), k) for k, v in imp.items() if v is not None and k != d['key']), reverse=True)
        d['likeness'] = {'face': True, 'source': cos(de, se) if se is not None else None,
                         'others_mean': round(sum(cos(de, o) for o in others) / len(others), 3) if others else None,
                         'impostor_max': imps[0][0] if imps else None, 'impostor_who': imps[0][1] if imps else None}
        d['likeness']['pass'] = passes(d['likeness'])
        print(name, d['likeness'])
    save_ledger(L)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'sheet': cmd_sheet(a[1])
    elif a[0] == 'draw':
        v = a[a.index('--variant') + 1] if '--variant' in a else 'A'
        tag = a[a.index('--tag') + 1] if '--tag' in a else ''
        cmd_draw(a[1], v, '--force' in a, tag, int(a[a.index('--refs') + 1]) if '--refs' in a else 0)
    elif a[0] == 'score': cmd_score()
    elif a[0] == 'pick':
        for k in a[1].split(','): e = best_photo(k); print(k, e['sha'][:16], e['origin'], e.get('width'), e.get('height'), e.get('face'), e.get('note'))
