# Speaker gallery HARVEST (Chad 10-23: "numerous photos of each speaker so we can rotate them"). Web client only, never the DB.
# Per person: candidates from bahai.media (Bahaipedia's file host: the person's category + file search), Wikimedia Commons
# (Wikidata P18 + commons category), en.wikipedia page image, the current primary, and YouTube stills of their talks;
# downloaded, size-gated (short side >= 400), face-checked (YuNet: one dominant face), dHash-deduped, and laid out on a
# numbered contact sheet for a human/agent identity check. Output: tmp/speaker-gallery/<key>/{candidates.json,sheet.jpg,NN.jpg}
# Usage: python3 scripts/media/speaker_gallery_harvest.py <inventory.json> [--keys a,b] [--workers 6] [--web]  (--web: add web.json finds)
import json, sys, os, re, io, time, hashlib, unicodedata, urllib.parse, threading, concurrent.futures as cf
import requests, numpy as np, cv2
from PIL import Image, ImageDraw, ImageOps

UA = 'SifterSearch media library (https://siftersearch.com; chadananda@gmail.com)'
OUT = os.path.join(os.getcwd(), 'tmp', 'speaker-gallery')
MODEL = os.path.join(OUT, 'yunet.onnx')
MIN_SHORT = 400
S = requests.Session(); S.headers['User-Agent'] = UA
_lock = threading.Lock()

def fold(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().replace("'", '')).strip().lower()

def getj(url, **kw):
    for i in range(3):
        try:
            r = S.get(url, timeout=20, **kw)
            if r.status_code == 429: time.sleep(5 * (i + 1)); continue
            return r.json() if r.ok else None
        except Exception: time.sleep(2)
    return None

def surname_ok(title, person):
    t = fold(title).replace('_', ' ').replace('-', ' ')
    last = fold(person['name']).replace('-', ' ').split()[-1]
    return last in t.split() or last in t

GROUP = re.compile(r'\b(and|with|family|group|children|couple|wedding|conference|members|delegates|convention|gathering|meeting|friends|participants|believers|assembly|council|staff|tomb|grave|house|book|cover|letter|signature|map)\b', re.I)

def mw_files(api, titles):
    """imageinfo for File: titles → [{title,url,thumb,w,h,mime,credit,licence,date,desc,page}]"""
    out = []
    for i in range(0, len(titles), 40):
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata', 'iiurlwidth': 1600, 'titles': '|'.join(titles[i:i + 40])})
        j = getj(f'{api}?{q}') or {}
        for p in (j.get('query', {}).get('pages', {}) or {}).values():
            ii = (p.get('imageinfo') or [None])[0]
            if not ii or not re.match(r'image/(jpeg|png|webp)', ii.get('mime', '')): continue
            md = ii.get('extmetadata') or {}
            v = lambda k: re.sub(r'<[^>]+>', '', (md.get(k) or {}).get('value', '') or '').strip()
            out.append({'title': p['title'], 'url': ii['url'], 'thumb': ii.get('thumburl') or ii['url'], 'w': ii['width'], 'h': ii['height'],
                        'credit': (v('Artist') or v('Credit'))[:200] or None, 'licence': v('LicenseShortName') or v('UsageTerms') or None,
                        'date': v('DateTimeOriginal') or None, 'desc': v('ImageDescription')[:300] or None, 'page': ii.get('descriptionurl')})
    return out

def bahaimedia(person):
    api = 'https://bahai.media/api.php'
    titles = set()
    names = {person['name'], *person.get('forms', [])}
    # the person's Bahaipedia page title is the category name on bahai.media
    s = getj('https://bahaipedia.org/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'search', 'srlimit': 5, 'srsearch': fold(person['name'])})) or {}
    for h in s.get('query', {}).get('search', []):
        if surname_ok(h['title'], person) and fold(person['name']).split()[0][:3] in fold(h['title']): names.add(h['title'])
    for n in names:
        j = getj(f'{api}?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'categorymembers', 'cmtitle': f'Category:{n}', 'cmtype': 'file', 'cmlimit': 60})) or {}
        for m in j.get('query', {}).get('categorymembers', []): titles.add(m['title'])
    j = getj(f'{api}?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'search', 'srnamespace': 6, 'srlimit': 40, 'srsearch': fold(person['name'])})) or {}
    for h in j.get('query', {}).get('search', []):
        if surname_ok(h['title'], person): titles.add(h['title'])
    files = mw_files(api, sorted(titles))
    for f in files: f['origin'] = 'bahai.media'
    return files

def commons(person):
    out, titles = [], set()
    s = getj('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({'action': 'wbsearchentities', 'format': 'json', 'language': 'en', 'type': 'item', 'limit': 5, 'search': fold(person['name'])})) or {}
    for e in s.get('search', []):
        d = fold(e.get('description', ''))
        if not re.search(r'bahai|hand of the cause|universal house', d): continue
        ent = getj(f"https://www.wikidata.org/wiki/Special:EntityData/{e['id']}.json") or {}
        claims = (ent.get('entities', {}).get(e['id'], {}) or {}).get('claims', {})
        for c in claims.get('P18', []): titles.add('File:' + c['mainsnak']['datavalue']['value'])
        for c in claims.get('P373', []):
            cat = c['mainsnak']['datavalue']['value']
            j = getj('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'categorymembers', 'cmtitle': f'Category:{cat}', 'cmtype': 'file', 'cmlimit': 60})) or {}
            for m in j.get('query', {}).get('categorymembers', []): titles.add(m['title'])
        person['wikidata'] = e['id']
        break
    files = mw_files('https://commons.wikimedia.org/w/api.php', sorted(titles))
    for f in files: f['origin'] = 'wikimedia-commons'
    return files

def wikipedia(person):
    j = getj('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'redirects': 1, 'prop': 'pageimages|extracts|info', 'inprop': 'url', 'exintro': 1, 'explaintext': 1, 'exchars': 500, 'piprop': 'name', 'titles': person['name']})) or {}
    for p in (j.get('query', {}).get('pages', {}) or {}).values():
        if not p.get('pageimage') or not re.search(r'bah[aá]', p.get('extract', ''), re.I): continue
        files = mw_files('https://en.wikipedia.org/w/api.php', ['File:' + p['pageimage']])
        for f in files: f['origin'] = 'wikipedia'; f['article'] = p.get('fullurl')
        return files
    return []

def youtube(person, limit=24):
    out = []
    for vid in person.get('ytids', [])[:limit]:
        for kind in ('maxresdefault', 'sddefault'):
            out.append({'title': f'YouTube {vid} {kind}', 'url': f'https://i.ytimg.com/vi/{vid}/{kind}.jpg', 'thumb': f'https://i.ytimg.com/vi/{vid}/{kind}.jpg',
                        'page': f'https://www.youtube.com/watch?v={vid}', 'origin': 'youtube-still', 'credit': None, 'licence': 'YouTube video frame (talk recording)', 'alt_of': vid})
    return out

def dhash(img):
    g = np.asarray(ImageOps.grayscale(img).resize((9, 8), Image.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return int(''.join('1' if b else '0' for b in bits), 2)

ham = lambda a, b: bin(a ^ b).count('1')

def faces(img):
    a = cv2.cvtColor(np.asarray(img.convert('RGB')), cv2.COLOR_RGB2BGR)
    h, w = a.shape[:2]
    sc = min(1.0, 1024 / max(w, h))
    if sc < 1: a = cv2.resize(a, (int(w * sc), int(h * sc)))
    det = cv2.FaceDetectorYN.create(MODEL, '', (a.shape[1], a.shape[0]), 0.7)
    _, f = det.detect(a)
    if f is None: return []
    return sorted([{'x': float(r[0] / sc), 'y': float(r[1] / sc), 'w': float(r[2] / sc), 'h': float(r[3] / sc), 's': float(r[14])} for r in f], key=lambda r: -r['w'] * r['h'])

def still_crop(img, f0):
    """A video frame → the speaker's head and shoulders (a title band or lower third is left out): a box ~3.4 face-heights
    tall, the face in its upper third, above the frame's bottom quarter, as wide as 4:5 allows. None when that box is under MIN_SHORT."""
    w, h = img.size
    side = min(h, 3.4 * f0['h'])
    top = max(0, f0['y'] - 0.8 * f0['h']); bot = min(h * 0.74, top + side)   # lower thirds live in the bottom quarter
    bw = min(w, (bot - top) * 0.8); cx = f0['x'] + f0['w'] / 2
    left = min(max(0, cx - bw / 2), w - bw)
    box = tuple(int(round(v)) for v in (left, top, left + bw, bot))
    return box if min(box[2] - box[0], box[3] - box[1]) >= MIN_SHORT else None

BROWSER = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}

def fetch_img(url, page=None):
    """Some sites (Wilmette Institute) refuse a non-browser agent without a Referer: one retry as a browser from the page."""
    r = S.get(url, timeout=30)
    if r.status_code in (403, 406) and page:
        r = requests.get(url, timeout=30, headers={**BROWSER, 'Referer': page})
    return r

def wilmette(person):
    """The Wilmette Institute's own media library (WordPress REST): files whose title or alt text carries the full name."""
    last = fold(person['name']).replace('-', ' ').split()[-1]
    first = fold(person['name']).split()[0]
    try: j = requests.get('https://wilmetteinstitute.org/wp-json/wp/v2/media', params={'search': last, 'per_page': 40}, headers=BROWSER, timeout=20).json()
    except Exception: return []
    out = []
    for m in j if isinstance(j, list) else []:
        label = fold(f"{m.get('title', {}).get('rendered', '')} {m.get('alt_text', '')} {m.get('source_url', '').rsplit('/', 1)[-1]}").replace('-', ' ').replace('_', ' ')
        flat = label.replace(' ', '')
        if not ((first in label or first in flat) and (last in label or last.replace(' ', '') in flat)): continue
        if not re.search(r'\.(jpe?g|png|webp)$', m.get('source_url', ''), re.I): continue
        out.append({'title': m.get('alt_text') or m['title']['rendered'], 'url': m['source_url'], 'thumb': m['source_url'], 'page': m.get('link') or 'https://wilmetteinstitute.org/',
                    'origin': 'web', 'credit': 'Wilmette Institute', 'licence': None, 'date': (m.get('date') or '')[:4] or None, 'desc': 'Wilmette Institute media library'})
    return out

def evaluate(c):
    try:
        r = fetch_img(c['thumb'], c.get('page'))
        if not r.ok or len(r.content) < 4000: return None
        img = Image.open(io.BytesIO(r.content)); img = ImageOps.exif_transpose(img).convert('RGB')
    except Exception: return None
    w, h = img.size
    forced = c.get('origin') == 'current-primary'   # the primary already in use stays in the gallery
    if min(w, h) < MIN_SHORT and not forced: return None
    fs = faces(img)
    if not fs and not forced: return None
    if c.get('origin') == 'youtube-still':
        box = still_crop(img, fs[0])
        if not box: return None
        img = img.crop(box); c['crop'] = list(box); c['frame'] = [w, h]
        buf = io.BytesIO(); img.save(buf, 'JPEG', quality=92); r = type('R', (), {'content': buf.getvalue()})()
        w, h = img.size; fs = faces(img)
        if not fs: return None
    if forced and not fs:
        c.update({'img': img, 'w': w, 'h': h, 'face': None, 'faces': 0, 'dhash': dhash(img), 'fhash': dhash(img), 'needs_ext': False, 'bytes': r.content, 'sha': hashlib.sha256(r.content).hexdigest()})
        return c
    f0 = fs[0]
    # one dominant face: a portrait, not a group (the next face at most 40 % of its area); not a speck in a hall
    if len(fs) > 1 and fs[1]['w'] * fs[1]['h'] > 0.4 * f0['w'] * f0['h'] and not forced: return None
    # a tall 9:16 crop around the face: is there room (else the master needs AI-extended canvas)? the face must read in it
    cw = min(w, h * 9 / 16)
    if (f0['w'] < 0.14 * cw or f0['w'] < 48) and not forced: return None
    # the FACE's hash (box grown 1.5x): a title card or a re-crop that reuses one photograph hashes alike
    fx, fy = f0['x'] + f0['w'] / 2, f0['y'] + f0['h'] / 2; r_ = max(f0['w'], f0['h']) * 0.75
    fh = dhash(img.crop((max(0, fx - r_), max(0, fy - r_), min(w, fx + r_), min(h, fy + r_))))
    c.update({'img': img, 'w': w, 'h': h, 'face': {k: round(v) if k != 's' else round(v, 2) for k, v in f0.items()}, 'faces': len(fs), 'dhash': dhash(img), 'fhash': fh,
              'needs_ext': bool(f0['w'] > 0.62 * cw or f0['y'] < 0.04 * h), 'bytes': r.content, 'sha': hashlib.sha256(r.content).hexdigest()})
    return c

def harvest(person, primary=None):
    d = os.path.join(OUT, person['key']); os.makedirs(d, exist_ok=True)
    cands = []
    if primary: cands.append({**primary, 'origin': 'current-primary', 'title': 'current primary'})
    for fn in (bahaimedia, commons, wikipedia, youtube):
        try: cands += fn(person)
        except Exception as e: print(person['key'], fn.__name__, e, file=sys.stderr)
    for c in cands:
        if c['origin'] != 'youtube-still' and GROUP.search(fold(c.get('title', '')).replace('_', ' ')): c['skip'] = 'group/object by title'
    seen_src = set(); todo = []
    for c in cands:
        if c.get('skip') or c['thumb'] in seen_src: continue
        seen_src.add(c['thumb']); todo.append(c)
    with cf.ThreadPoolExecutor(4) as ex: got = [g for g in ex.map(evaluate, todo) if g]
    # a YouTube video yields at most one still (maxres preferred), and dedupe by dHash across everything
    kept, by_vid = [], set()
    for g in got:
        if g.get('alt_of') and g['alt_of'] in by_vid: continue
        if any(ham(g['dhash'], k['dhash']) <= 10 or ham(g['fhash'], k['fhash']) <= 12 for k in kept): continue
        if g.get('alt_of'): by_vid.add(g['alt_of'])
        kept.append(g)
    kept = kept[:40]
    rows = []
    for i, g in enumerate(kept):
        fn = f'{i:02d}.jpg'; g['img'].save(os.path.join(d, fn), quality=90)
        rows.append({k: v for k, v in g.items() if k not in ('img', 'bytes')} | {'n': i, 'file': fn, 'dhash': f"{g['dhash']:016x}", 'fhash': f"{g['fhash']:016x}"})
    json.dump({'person': person, 'candidates': rows}, open(os.path.join(d, 'candidates.json'), 'w'), indent=1, ensure_ascii=False)
    sheet(d, kept, person)
    return person['key'], len(cands), len(rows)

def harvest_web(person):
    """Images found by hand/agent search (tmp/speaker-gallery/<key>/web.json: url, page, credit, licence, year, caption) →
    evaluated like the rest and APPENDED to candidates.json (numbering continues; duplicates of held candidates dropped);
    their own contact sheet: sheet-web.jpg."""
    d = os.path.join(OUT, person['key'])
    web = json.load(open(os.path.join(d, 'web.json'))) if os.path.exists(os.path.join(d, 'web.json')) else {}
    held = json.load(open(os.path.join(d, 'candidates.json'))) if os.path.exists(os.path.join(d, 'candidates.json')) else {'person': person, 'candidates': []}
    old = held['candidates']
    have = [(int(c['dhash'], 16), int(c.get('fhash') or c['dhash'], 16)) for c in old]
    done = {c.get('url') for c in old}
    todo = [{'title': i.get('caption') or '', 'url': i['url'], 'thumb': i['url'], 'page': i.get('page'), 'origin': 'web', 'credit': i.get('credit'), 'licence': i.get('licence'),
             'date': str(i['year']) if i.get('year') else None, 'desc': i.get('note')} for i in web.get('images', []) if i.get('url') and i['url'] not in done]
    seen_u = {t['url'] for t in todo} | done
    todo += [w for w in wilmette(person) if w['url'] not in seen_u]
    with cf.ThreadPoolExecutor(4) as ex: got = [g for g in ex.map(evaluate, todo) if g]
    new, n0 = [], (max([c['n'] for c in old]) + 1 if old else 0)
    for g in got:
        if any(ham(g['dhash'], a) <= 10 or ham(g['fhash'], b) <= 12 for a, b in have): continue
        have.append((g['dhash'], g['fhash']))
        g['n'] = n0 + len(new); new.append(g)
    for g in new:
        fn = f"{g['n']:02d}.jpg"; g['img'].save(os.path.join(d, fn), quality=90)
        old.append({k: v for k, v in g.items() if k not in ('img', 'bytes')} | {'file': fn, 'dhash': f"{g['dhash']:016x}", 'fhash': f"{g['fhash']:016x}"})
    json.dump(held, open(os.path.join(d, 'candidates.json'), 'w'), indent=1, ensure_ascii=False)
    if new: sheet(d, new, person, name='sheet-web.jpg')
    return person['key'], len(todo), len(new)

def sheet(d, kept, person, tile=260, cols=6, name='sheet.jpg'):
    if not kept: return
    rows = (len(kept) + cols - 1) // cols
    S_ = Image.new('RGB', (cols * tile, rows * (tile + 22) + 30), 'white'); dr = ImageDraw.Draw(S_)
    dr.text((6, 6), f"{person['name']} ({person['key']})", fill='black')
    for i, g in enumerate(kept):
        im = g['img'].copy(); im.thumbnail((tile - 6, tile - 6))
        x, y = (i % cols) * tile, 30 + (i // cols) * (tile + 22)
        S_.paste(im, (x + 3, y + 3))
        dr.text((x + 4, y + tile - 2), f"#{g.get('n', i)} {g['origin'][:12]} {g['w']}x{g['h']}", fill='red')
    S_.save(os.path.join(d, name), quality=80)

if __name__ == '__main__':
    inv = json.load(open(sys.argv[1]))
    keys = next((a.split('=', 1)[1] if '=' in a else sys.argv[sys.argv.index(a) + 1] for a in sys.argv if a.startswith('--keys')), None)
    prim = {}
    if os.path.exists(os.path.join(OUT, 'speakers.json')):
        for s in json.load(open(os.path.join(OUT, 'speakers.json')))['speakers']:
            p = s.get('photo')
            if p: prim[s['key']] = {'url': p['url'], 'thumb': p['url'] + '&tr=w-1600', 'page': p.get('page_url') or p.get('source_url'), 'credit': p.get('credit'), 'licence': p.get('licence'), 'src': p.get('source_url')}
    people = [p for p in inv if not keys or p['key'] in keys.split(',')]
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(MODEL):
        open(MODEL, 'wb').write(S.get('https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx', timeout=60).content)
    job = harvest_web if '--web' in sys.argv else (lambda p: harvest(p, prim.get(p['key'])))
    with cf.ThreadPoolExecutor(int(next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--workers'), 4))) as ex:
        for k, n, kept in ex.map(job, people):
            print(f'{k}: {n} candidates → {kept} kept', flush=True)
