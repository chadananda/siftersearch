#!/usr/bin/env python3
# Donor-intake SAMPLE of one item, on a worker (planning/donor-intake-plan-20261030.md step 5). Run by intake-agent.mjs: <dir> holds job.json + in/*.
# talk: ffmpeg first SECS → clip.mp3 (listening) + 16 kHz wav → media_tool.py transcribe (inside the worker image: GPU, admission leases).
# book: PDF page 1 → title.jpg; text = pdftotext of the first PAGES, else tesseract OCR of those pages rendered; EPUB/DOCX/ODT/HTML/TXT read
# directly; a folder of page images → the first page as the title image + OCR. Writes sample.json {kind, text, …, files:[outputs]}. Stdlib only.
import glob, html, json, os, re, shutil, subprocess, sys, zipfile

D = sys.argv[1]
JOB = json.load(open(os.path.join(D, 'job.json')))
IN = sorted(glob.glob(os.path.join(D, 'in', '*')))
TEXT_MAX = 30000 if JOB.get('deep') else 6000


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
    else:   # .doc/.wpd/… : the readable runs of text in the binary
        raw = open(src, 'rb').read(4_000_000).decode('latin-1')
        res['text'] = tidy('\n'.join(re.findall(r'[\x20-\x7e\xa0-\xff]{6,}', raw)))
    res['text'] = (res.get('text') or '')[:TEXT_MAX]
    return res


try:
    kind = JOB.get('kind')
    r = talk() if kind == 'talk' else book()
    r.update({'kind': kind, 'deep': bool(JOB.get('deep')), 'item_id': JOB.get('item_id')})
except SystemExit as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
json.dump(r, open(os.path.join(D, 'sample.json'), 'w'), ensure_ascii=False)
