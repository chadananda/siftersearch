# Author-photo AUDIT (Chad's rule: "never use an image of the wrong person"; no hotlinks). Web client only, never the DB.
# Input: the `book-author-photos` ops report JSON. Per distinct (author, photo): the speaker-gallery checks — download,
# short side >= 400 (gallery photos are already cropped masters: exempt), YuNet one dominant face (the next face <= 40 % of it)
# — then IDENTITY against a reference where one exists: another verified gallery photo of that speaker, or the person's
# Wikipedia page image when it is a different file from the Wikidata P18; OpenCV SFace cosine (>= 0.363 same person,
# < 0.25 another person). Output: tmp/author-photos/{audit.json, sheet.jpg} — the sheet is for a human/agent identity look.
# Usage: python3 scripts/books/author_photo_audit.py <book-author-photos.json>
import json, sys, os, io, re, urllib.parse
import requests, numpy as np, cv2
from PIL import Image, ImageOps, ImageDraw

UA = 'SifterSearch library (https://siftersearch.com; chadananda@gmail.com)'
ROOT = os.getcwd()
OUT = os.path.join(ROOT, 'tmp', 'author-photos'); os.makedirs(OUT, exist_ok=True)
YUNET = os.path.join(ROOT, 'tmp', 'speaker-gallery', 'yunet.onnx')
SFACE = os.path.join(ROOT, 'tmp', 'speaker-gallery', 'sface.onnx')
CDN = 'https://siftersearch.com/img/cdn/siftersearch.com/'
MIN_SHORT, SAME, OTHER = 400, 0.363, 0.25
S = requests.Session(); S.headers['User-Agent'] = UA
GALLERY = json.load(open(os.path.join(ROOT, 'data', 'media-speaker-gallery.json'))).get('speakers', {})
rec = cv2.FaceRecognizerSF.create(SFACE, '')

def get_img(url):
    r = S.get(url, timeout=40)
    if not r.ok: return None, r.content
    return ImageOps.exif_transpose(Image.open(io.BytesIO(r.content))).convert('RGB'), r.content

def detect(img):
    a = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
    h, w = a.shape[:2]; sc = min(1.0, 1024 / max(w, h))
    if sc < 1: a = cv2.resize(a, (int(w * sc), int(h * sc)))
    det = cv2.FaceDetectorYN.create(YUNET, '', (a.shape[1], a.shape[0]), 0.7)
    _, f = det.detect(a)
    fs = [] if f is None else sorted(list(f), key=lambda r: -r[2] * r[3])
    return a, fs

def embed(a, f): return rec.feature(rec.alignCrop(a, f))

def faces_ok(fs):
    if not fs: return 'no face'
    if len(fs) > 1 and fs[1][2] * fs[1][3] > 0.4 * fs[0][2] * fs[0][3]: return f'{len(fs)} faces (not a single portrait)'
    return None

def wiki_ref(qid, p18_url):
    """The person's en.wikipedia page image, when it is a different file from the P18 portrait."""
    j = S.get(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json', timeout=30).json()
    title = j['entities'][qid].get('sitelinks', {}).get('enwiki', {}).get('title')
    if not title: return []
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'pageimages', 'piprop': 'thumbnail|name', 'pithumbsize': 800, 'titles': title})
    p = list(S.get(f'https://en.wikipedia.org/w/api.php?{q}', timeout=30).json()['query']['pages'].values())[0]
    name = p.get('pageimage') or ''
    if not p.get('thumbnail') or urllib.parse.unquote(name).replace('_', ' ') in urllib.parse.unquote(p18_url).replace('_', ' '): return []
    return [p['thumbnail']['source']]

def refs_for(url, meta):
    m = re.search(r'/media-speakers/([a-z0-9-]+)\.', url)
    if m:
        key = m.group(1)
        return [f"{CDN}{e['file']}?v={e['sha'][:16]}" for e in GALLERY.get(key, []) if e['file'] not in url][:3], f'speaker {key}'
    q = re.match(r'(Q\d+)', (meta or {}).get('evidence') or '')
    return (wiki_ref(q.group(1), url) if q else []), (q.group(1) if q else 'no qid')

def main(path):
    photos = json.load(open(path))['result']['photos']
    groups = {}
    for p in photos: groups.setdefault((p['author'], p['url']), []).append(p)
    out, tiles = [], []
    for (author, url), ps in groups.items():
        r = {'author': author, 'url': url, 'doc_ids': [p['id'] for p in ps], 'titles': [p['title'] for p in ps][:3], 'source': (ps[0]['meta'] or {}).get('source'),
             'evidence': (ps[0]['meta'] or {}).get('evidence')}
        try:
            img, raw = get_img(url)
            if img is None: r['verdict'], r['why'] = 'fail', 'download failed'; out.append(r); continue
            a, fs = detect(img)
            gallery = '/media-speakers/' in url
            why = None if gallery or min(img.size) >= MIN_SHORT else f'short side {min(img.size)}px'
            why = why or faces_ok(fs)
            r['size'] = list(img.size); r['faces'] = len(fs)
            refs, rlab = refs_for(url, ps[0]['meta'])
            r['reference'] = rlab; r['refs'] = refs; sims = []
            if not why:
                e0 = embed(a, fs[0])
                for ru in refs:
                    try:
                        ri, _ = get_img(ru); ra, rf = detect(ri)
                        if rf: sims.append(round(float(rec.match(e0, embed(ra, rf[0]), cv2.FaceRecognizerSF_FR_COSINE)), 3))
                    except Exception: pass
            r['similarity'] = sims
            if why: r['verdict'], r['why'] = 'fail', why
            elif sims and max(sims) >= SAME: r['verdict'], r['why'] = 'pass', f'same person as reference (cos {max(sims)})'
            elif sims and max(sims) < OTHER: r['verdict'], r['why'] = 'fail', f'another person than the reference (cos {max(sims)})'
            else: r['verdict'], r['why'] = 'look', 'no conclusive reference — identity by eye'
            tiles.append((img, [get_img(x)[0] for x in refs[:2]], r))
        except Exception as e:
            r['verdict'], r['why'] = 'fail', f'error {e}'
        out.append(r)
    json.dump(out, open(os.path.join(OUT, 'audit.json'), 'w'), indent=1, ensure_ascii=False)
    # contact sheet: candidate | references, labelled
    T, rows = 220, []
    for n, (img, refs, r) in enumerate(tiles):
        row = Image.new('RGB', (T * 3 + 520, T), 'white')
        for i, im in enumerate([img] + [x for x in refs if x is not None][:2]):
            th = ImageOps.fit(im, (T, T)); row.paste(th, (i * T, 0))
        d = ImageDraw.Draw(row)
        d.text((T * 3 + 8, 8), f"#{n} {r['verdict'].upper()}  {r['author'][:50]}", fill='black')
        d.text((T * 3 + 8, 30), f"{(r['titles'] or [''])[0][:70]}", fill='black')
        d.text((T * 3 + 8, 52), f"{r['why'][:70]}", fill='black'); d.text((T * 3 + 8, 74), f"ref: {r['reference']}  sims {r.get('similarity')}", fill='black')
        rows.append(row)
    for k in range(0, len(rows), 12):
        sheet = Image.new('RGB', (rows[0].width, T * len(rows[k:k + 12])), 'white')
        for i, row in enumerate(rows[k:k + 12]): sheet.paste(row, (0, i * T))
        sheet.save(os.path.join(OUT, f'sheet{k // 12}.jpg'), quality=85)
    for r in out: print(r['verdict'], '|', r['author'], '|', r['why'], '|', r.get('reference'), r.get('similarity'))

if __name__ == '__main__': main(sys.argv[1])
