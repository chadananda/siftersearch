#!/usr/bin/env python3
# Donor-intake SAMPLE of one item, on a worker (planning/donor-intake-plan-20261030.md step 5). Run by intake-agent.mjs: <dir> holds job.json + in/*.
# talk: ffmpeg first SECS → clip.mp3 (listening) + 16 kHz wav → media_tool.py transcribe (inside the worker image: GPU, admission leases).
# book: PDF page 1 → title.jpg; text = pdftotext of the first PAGES, else tesseract OCR of those pages rendered; EPUB/DOCX/ODT/HTML/TXT read
# directly; a folder of page images → the first page as the title image + OCR. Writes sample.json {kind, text, …, files:[outputs]}. Stdlib only.
# probe (job.probe, an approved PDF or document): the PRE-OCR DEDUP sample — class (born_digital | image_pdf | scan), PDF metadata, the title/copyright pages + ~5 pages spread
# through the book (text layer, or tesseract for a scan). + fp = the dedup fingerprint (fingerprint.py). Needs only poppler (pdfinfo/pdftotext/pdfimages/pdffonts/pdftoppm) + tesseract, as book does.
import glob, html, json, os, re, shutil, subprocess, sys, zipfile

D = sys.argv[1]
JOB = json.load(open(os.path.join(D, 'job.json')))
IN = sorted(glob.glob(os.path.join(D, 'in', '*')))
TEXT_MAX = 30000 if (JOB.get('deep') or JOB.get('probe')) else 6000


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, timeout=kw.pop('timeout', 900), **kw)


def tidy(t):
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n{3,}', '\n\n', t or '')).strip()


def talk():
    secs = int(JOB.get('secs') or 60)
    src = IN[0]
    clip, wav = os.path.join(D, 'clip.mp3'), os.path.join(D, 'clip.wav')
    r = sh(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-t', str(secs), '-i', src, '-vn', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', clip])
    if r.returncode or not os.path.exists(clip):
        raise SystemExit(f'ffmpeg clip: {r.stderr[-600:]}')
    sh(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', clip, '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', wav])
    out = os.path.join(D, 'asr.json')
    py = os.environ.get('MEDIA_PYTHON', '/opt/gate/venv/bin/python')
    args = [py, '/opt/sifter/media/media_tool.py', 'transcribe', wav, '--threads', '4', '--output', out]
    if JOB.get('lang'):
        args += ['--lang', JOB['lang']]
    r = sh(args, timeout=1800)
    if r.returncode or not os.path.exists(out):
        raise SystemExit(f'transcribe: {r.stderr[-1500:]}')
    a = json.load(open(out))
    segs = a.get('segments') or []
    text = tidy(' '.join((s.get('text') or '').strip() for s in segs))
    t = lambda s, k: float(s.get(k[0], s.get(k)) or 0)   # media_tool's segments carry s / e (older ones start / end)
    speech = sum(max(0, t(s, 'end') - t(s, 'start')) for s in segs)
    return {'text': text[:TEXT_MAX], 'language': a.get('language'), 'speech_s': round(speech, 1), 'secs': secs, 'files': ['clip.mp3']}


def ocr_langs():
    have = sh(['tesseract', '--list-langs']).stdout.split()
    return '+'.join(l for l in ['eng', 'ara', 'fas', 'fra', 'deu'] if l in have) or 'eng'


def ocr(paths):
    langs, out = ocr_langs(), []
    for p in paths:
        r = sh(['tesseract', p, '-', '-l', langs], timeout=600)
        out.append(r.stdout)
    return tidy('\n\n'.join(out))


def strip_tags(x):
    x = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', x)
    x = re.sub(r'(?i)<(br|/p|/div|/h\d|/li)[^>]*>', '\n', x)
    return tidy(html.unescape(re.sub(r'<[^>]+>', ' ', x)))


def zipped(path, pattern):
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.search(pattern, n, re.I))
        parts, n = [], 0
        for name in names:
            t = strip_tags(z.read(name).decode('utf-8', 'replace'))
            parts.append(t)
            n += len(t)
            if n > TEXT_MAX:
                break
        return '\n\n'.join(parts)


WORD_PARTS = re.compile(r'^(Default Paragraph Font|Table Normal|No List|Normal( Table)?|Root Entry|WordDocument|(Document)?SummaryInformation|CompObj|1Table|0Table|'
                        r'Microsoft (Office )?Word.*|Word\.Document\.\d+|MSWordDoc|Times New Roman|Courier New|Arial|Symbol|Wingdings|Heading \d|Title|Page Number|Header|Footer)$', re.I)


def binary_text(src):
    # Word 97–2003 keeps its text as UTF-16LE or as 8-bit runs; both are read, and runs without words (fill bytes, style
    # tables, the "bjbj" marker) are dropped
    raw = open(src, 'rb').read(4_000_000)
    runs = [m.decode('utf-16-le') for m in re.findall(rb'(?:[\x20-\x7e\xa0-\xfe]\x00|[\r\n\t]\x00){8,}', raw)]
    runs += re.findall(r'[\x20-\x7e\xa0-\xfe\r\n\t]{8,}', raw.decode('latin-1'))
    keep = [r for r in runs if len(re.findall(r'[A-Za-zÀ-þ]{3,}', r)) >= 2 and not re.search(r'bjbj|[\x7f-\x9f]', r) and not WORD_PARTS.match(r.strip())]
    return tidy('\n'.join(keep))


def book():
    pages = int(JOB.get('pages') or 3)
    res = {'pages': pages, 'files': []}
    imgs = [p for p in IN if re.search(r'\.(jpe?g|png|tiff?|gif|bmp)$', p, re.I)]
    src = IN[0]
    ext = os.path.splitext(src)[1].lower()
    if imgs and len(imgs) == len(IN):   # a scanned book as page images
        first = imgs[0]
        if re.search(r'\.(jpe?g)$', first, re.I):
            shutil.copy(first, os.path.join(D, 'title.jpg'))
            res['files'].append('title.jpg')
        res['text'], res['ocr'] = ocr(imgs[:pages]), True
    elif ext == '.pdf':
        r = sh(['pdftoppm', '-jpeg', '-jpegopt', 'quality=80', '-r', '90', '-f', '1', '-l', '1', '-singlefile', src, os.path.join(D, 'title')])
        if not r.returncode and os.path.exists(os.path.join(D, 'title.jpg')):
            res['files'].append('title.jpg')
        t = tidy(sh(['pdftotext', '-f', '1', '-l', str(pages), '-layout', src, '-']).stdout)
        if len(re.sub(r'\W', '', t)) < 200:   # no usable text layer: a scan → OCR the first pages
            sh(['pdftoppm', '-r', '200', '-gray', '-png', '-f', '1', '-l', str(pages), src, os.path.join(D, 'pg')])
            t, res['ocr'] = ocr(sorted(glob.glob(os.path.join(D, 'pg*.png')))), True
        res['text'] = t
    elif ext == '.epub':
        res['text'] = zipped(src, r'\.x?html?$')
    elif ext == '.docx':
        res['text'] = zipped(src, r'^word/document\.xml$')
    elif ext == '.odt':
        res['text'] = zipped(src, r'^content\.xml$')
    elif ext in ('.html', '.htm', '.xhtml'):
        res['text'] = strip_tags(open(src, encoding='utf-8', errors='replace').read())
    elif ext == '.rtf':
        raw = open(src, encoding='latin-1').read()
        res['text'] = tidy(re.sub(r'\\[a-z]+-?\d* ?|[{}]', '', raw))
    elif ext in ('.txt', '.md', '.markdown'):
        res['text'] = tidy(open(src, encoding='utf-8', errors='replace').read())
    else:   # .doc/.wpd/.wps/…: the readable runs of the binary (headless LibreOffice hung on a worker: not used)
        res['text'] = binary_text(src)
    res['text'] = (res.get('text') or '')[:TEXT_MAX]
    return res


def pick_pages(n):
    # the title/copyright pages (1-4) + up to 5 spread through the rest
    head = list(range(1, min(n, 4) + 1))
    pool = n - 4
    if pool <= 0:
        return head
    k = min(5, pool)
    return sorted(set(head + [min(n, 5 + int((i + 0.5) * pool / k)) for i in range(k)]))


def page_covered(src, p):
    # does an image fill most of page p? (a scanned page, with or without a hidden OCR layer over it)
    size = re.search(r'size:\s*([\d.]+)\s*x\s*([\d.]+)', sh(['pdfinfo', '-f', str(p), '-l', str(p), src]).stdout)
    if not size:
        return False
    area = float(size.group(1)) / 72 * float(size.group(2)) / 72
    for ln in sh(['pdfimages', '-list', '-f', str(p), '-l', str(p), src]).stdout.splitlines()[2:]:
        c = ln.split()
        try:
            if c[2] == 'image' and float(c[12]) > 0 and float(c[13]) > 0 and int(c[3]) / float(c[12]) * int(c[4]) / float(c[13]) >= 0.6 * area:
                return True
        except (IndexError, ValueError):
            continue
    return False


def fp_of(src, cls, text=''):
    # dedup fingerprint (fingerprint.py: sha256, normalised-body hash, MinHash) + the converted Markdown (body.md) of a text-bearing file, or the scan's OCR sample (sample.txt).
    # A scan has no text layer to fingerprint — only its sha256.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import fingerprint
    if cls == 'scan':
        open(os.path.join(D, 'sample.txt'), 'w', encoding='utf-8').write(text)
        return {'sha256': fingerprint.sha256_file(src), 'norm_sha': None, 'minhash': None, 'words': 0}, ['sample.txt']
    raw = fingerprint.body_text(src)
    open(os.path.join(D, 'body.md'), 'w', encoding='utf-8').write(fingerprint.to_markdown(raw))
    return fingerprint.fingerprint(src, raw), ['body.md']


def probe_doc():
    # a non-PDF document (docx/epub/html/txt/rtf/odt): the sample is the start of its text; the fingerprint is of the whole
    src = IN[0]
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import fingerprint
    body = fingerprint.body_text(src)
    open(os.path.join(D, 'body.md'), 'w', encoding='utf-8').write(fingerprint.to_markdown(body))
    return {'probe': True, 'fp': fingerprint.fingerprint(src, body), 'converter': fingerprint.CONVERTER, 'class': 'text_doc', 'pages': None, 'sampled': [1], 'text': '[page 1]\n' + tidy(body)[:TEXT_MAX], 'meta_text': '',
            'words_pp': None, 'img_frac': 0, 'hidden_font': False, 'ocr': False, 'files': ['body.md']}


def probe():
    src = IN[0]
    if not src.lower().endswith('.pdf'):
        return probe_doc()
    info = sh(['pdfinfo', '-meta', src]).stdout
    m = re.search(r'^Pages:\s+(\d+)', info, re.M)
    n = int(m.group(1)) if m else 1
    pgs = pick_pages(n)
    layer = {p: sh(['pdftotext', '-f', str(p), '-l', str(p), '-enc', 'UTF-8', src, '-']).stdout.strip() for p in pgs}
    words_pp = sum(len(t.split()) for t in layer.values()) / len(pgs)
    img_frac = sum(1 for p in pgs if page_covered(src, p)) / len(pgs)
    fonts = sh(['pdffonts', '-f', '1', '-l', '4', src]).stdout
    has_layer = words_pp >= 25
    cls = ('image_pdf' if has_layer else 'scan') if img_frac >= 0.6 else ('born_digital' if has_layer else 'scan')
    if cls == 'scan':
        texts = {}
        for p in pgs:
            sh(['pdftoppm', '-r', '200', '-gray', '-png', '-f', str(p), '-l', str(p), '-singlefile', src, os.path.join(D, f'pr{p}')])
            f = os.path.join(D, f'pr{p}.png')
            texts[p] = ocr([f]) if os.path.exists(f) else ''
    else:
        texts = layer
    text = '\n\n'.join(f'[page {p}]\n{texts[p][:3000]}' for p in pgs)
    meta = re.sub(r'<[^>]+>', ' ', info)
    fp, outs = fp_of(src, cls, text)
    return {'probe': True, 'fp': fp, 'converter': 'fingerprint.py 1 (poppler pdftotext / tesseract)', 'class': cls, 'pages': n, 'sampled': pgs, 'text': text[:TEXT_MAX], 'meta_text': tidy(meta)[:4000], 'words_pp': round(words_pp, 1),
            'img_frac': round(img_frac, 2), 'hidden_font': bool(re.search(r'GlyphLess|Invisible|HiddenHorzOCR|Tesseract', fonts, re.I)), 'ocr': cls == 'scan', 'files': outs}


try:
    kind = JOB.get('kind')
    r = probe() if JOB.get('probe') else talk() if kind == 'talk' else book()
    r.update({'kind': kind, 'deep': bool(JOB.get('deep')), 'item_id': JOB.get('item_id')})
except SystemExit as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
json.dump(r, open(os.path.join(D, 'sample.json'), 'w'), ensure_ascii=False)
