#!/usr/bin/env python3
# Dedup fingerprint of one document, computed on a WORKER (never tower): file sha256, then the text normalised to a body (frontmatter, title page, TOC, index,
# appendix/bibliography dropped; case, diacritics, punctuation, whitespace folded) → norm_sha + a 64-value MinHash over 3-word shingles (~5% word differences between two typings still leave Jaccard ~0.7). Stdlib + poppler.
# CLI: fingerprint.py <file> → JSON. Imported by intake_sample.py (probe). Same text in another format/typist/edition → same norm_sha / high MinHash Jaccard.
import hashlib, html, json, random, re, subprocess, sys, unicodedata, zipfile

SHINGLE, PERM, P = 3, 64, (1 << 61) - 1
_r = random.Random(7)
AB = [(_r.randrange(1, P), _r.randrange(0, P)) for _ in range(PERM)]
CUT_ANY = re.compile(r'^(?:table of )?contents|^list of (?:illustrations|figures|plates)|^index(?: of .*)?$', re.I)
CUT_TAIL = re.compile(r'^(?:appendi(?:x|ces)(?:\b.*)?|bibliography|works cited|glossary|endnotes|notes|index(?: of .*)?|about the author)$', re.I)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for blk in iter(lambda: f.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


def _tidy_tags(x):
    x = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', x)
    x = re.sub(r'(?i)<(br|/p|/div|/h\d|/li)[^>]*>', '\n', x)
    return html.unescape(re.sub(r'<[^>]+>', ' ', x))


def _zipped(path, pattern):
    with zipfile.ZipFile(path) as z:
        return '\n\n'.join(_tidy_tags(z.read(n).decode('utf-8', 'replace')) for n in sorted(z.namelist()) if re.search(pattern, n, re.I))


def body_text(path):
    ext = path.lower().rsplit('.', 1)[-1] if '.' in path else ''
    if ext == 'pdf':
        return subprocess.run(['pdftotext', '-enc', 'UTF-8', path, '-'], capture_output=True, text=True, timeout=900).stdout
    if ext == 'epub':
        return _zipped(path, r'\.x?html?$')
    if ext == 'docx':
        return _zipped(path, r'^word/document\.xml$')
    if ext == 'odt':
        return _zipped(path, r'^content\.xml$')
    if ext in ('html', 'htm', 'xhtml'):
        return _tidy_tags(open(path, encoding='utf-8', errors='replace').read())
    if ext == 'rtf':
        return re.sub(r'\\[a-z]+-?\d* ?|[{}]', '', open(path, encoding='latin-1').read())
    return open(path, encoding='utf-8', errors='replace').read()


def strip_body(text):
    # frontmatter (--- yaml ---), page markers; then PARAGRAPHS (wrapped lines joined) so a PDF's hard line breaks do not matter
    text = re.sub(r'\A\s*---\n.*?\n---\n', '', text, flags=re.S)
    text = re.sub(r'\[page \d+\]', '\n\n', text).replace('\f', '\n\n')
    paras = [' '.join(l.strip() for l in p.split('\n')).lstrip('#').strip('* ').strip() for p in re.split(r'\n\s*\n', text)]
    paras = [p for p in paras if p and not re.fullmatch(r'[\divxlc.\- ]{1,8}', p, re.I)]   # blank, page numbers
    # title page: paragraphs before the first real one (>= 25 words), at most the first 12
    first = next((i for i, p in enumerate(paras[:40]) if len(p.split()) >= 25), 0)
    paras = paras[min(first, 12):]
    keep, i = [], 0
    while i < len(paras):
        p = paras[i]
        short = len(p.split()) <= 6
        if short and CUT_ANY.match(p):   # a table of contents: up to the next real paragraph
            i += 1
            while i < len(paras) and len(paras[i].split()) < 25:
                i += 1
            continue
        if short and CUT_TAIL.match(p) and i > 0.6 * len(paras):   # appendix / index / bibliography in the last 40%: to the end
            break
        keep.append(p)
        i += 1
    return '\n'.join(keep)


def fold(text):
    t = unicodedata.normalize('NFKD', text.lower())
    t = ''.join(c for c in t if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', re.sub(r'[^\w]+|_', ' ', t)).strip()


def minhash(words):
    sig = [P] * PERM
    for i in range(max(1, len(words) - SHINGLE + 1)):
        h = int.from_bytes(hashlib.blake2b(' '.join(words[i:i + SHINGLE]).encode(), digest_size=8).digest(), 'big') % P
        for k, (a, b) in enumerate(AB):
            v = (a * h + b) % P
            if v < sig[k]:
                sig[k] = v
    return ''.join(f'{v:016x}' for v in sig)


def to_markdown(raw):
    # the converted Markdown kept in the collection's md/ folder: paragraphs (wrapped lines joined), page breaks as rules — the comparison text AND the import staging copy
    paras = [' '.join(l.strip() for l in p.split('\n')) for p in re.split(r'\n\s*\n', raw.replace('\f', '\n\n---\n\n'))]
    return '\n\n'.join(p for p in paras if p.strip()) + '\n'


CONVERTER = 'fingerprint.py 1 (poppler pdftotext / zip+xml / html strip)'


def fingerprint(path, raw=None):
    body = fold(strip_body(raw if raw is not None else body_text(path)))
    words = body.split()
    return {'sha256': sha256_file(path), 'norm_sha': hashlib.sha256(body.encode()).hexdigest() if len(words) >= 200 else None,
            'minhash': minhash(words) if len(words) >= 200 else None, 'words': len(words)}


if __name__ == '__main__':
    print(json.dumps(fingerprint(sys.argv[1])))
