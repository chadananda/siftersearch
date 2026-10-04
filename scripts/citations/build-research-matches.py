# Held-citation re-search → review matches (runs ON tower, read-only DB): each decision in research-decisions.jsonl names
# its source paragraph(s); emit {content_id,title,ref,author,url,segs} with the quoted «…» Arabic/Persian bolded.
# Bold = runs of ≥4 words matching after folding vowel marks and letter variants (ي/ی, ك/ک, hamza forms), so editions
# that differ in orthography or split the passage over several paragraphs still show the span.
#   python3 scripts/citations/build-research-matches.py <research-decisions.jsonl> <out.json>
import difflib, json, re, sqlite3, sys, unicodedata

DEC, OUT = sys.argv[1:3]
db = sqlite3.connect('file:data/sifter.db?mode=ro', uri=True)
MARKS = re.compile('[ً-ٰٟۖ-ۭـ‌‍ٴ]')
FOLD = str.maketrans({'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ؤ': 'و', 'ئ': 'ی', 'ۀ': 'ه'})
WORD = re.compile(r'[^\s*()\[\]«»"،؛:.!؟?]+')


def fold(w):
    return MARKS.sub('', unicodedata.normalize('NFC', w)).translate(FOLD)


def para(doc, pidx):
    r = db.execute('select c.id, c.text, d.title, d.author from content c join docs d on d.id = c.doc_id '
                   'where c.doc_id = ? and c.paragraph_index = ? and c.deleted_at is null', (doc, pidx)).fetchone()
    return r and {'content_id': r[0], 'text': re.sub(r'⁅/?s\d+⁆', '', r[1]), 'title': r[2], 'author': r[3]}


def segs(text, quote):
    tw = [(m.start(), m.end(), fold(m.group())) for m in WORD.finditer(text)]
    qw = [fold(m.group()) for m in WORD.finditer(quote)]
    sm = difflib.SequenceMatcher(None, [w for *_, w in tw], qw, autojunk=False)
    spans = sorted((tw[b.a][0], tw[b.a + b.size - 1][1]) for b in sm.get_matching_blocks() if b.size >= 4)
    res, at = [], 0
    for a, b in spans:
        if a < at:
            continue
        if a > at:
            res.append({'t': text[at:a]})
        res.append({'t': text[a:b], 'b': 1})
        at = b
    if at < len(text):
        res.append({'t': text[at:]})
    return res, bool(spans)


out = {}
for line in open(DEC):
    d = json.loads(line)
    quote = ' '.join(re.findall(r'«([^»]+)»', d.get('why', '')))
    srcs = ([d['source']] + d.get('also', [])) if d.get('source') else []
    span = range(d['span_pidx'][0], d['span_pidx'][1] + 1) if d.get('span_pidx') else None
    ms = []
    for i, s in enumerate(srcs):
        for pi in (span if (span and i == 0) else [s['pidx']]):
            p = para(s['doc'], pi)
            if not p:
                print('MISSING', d['id'], s['doc'], pi, file=sys.stderr)
                continue
            sg, hit = segs(p['text'], quote)
            ms.append({'content_id': p['content_id'], 'title': p['title'], 'ref': f'¶{pi}', 'author': p['author'],
                       'url': f'https://siftersearch.com/library/view?doc={s["doc"]}#p{pi}', 'segs': sg, 'bolded': hit})
    out[d['id']] = ms
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
print(len(out), 'items;', sum(1 for v in out.values() for m in v if not m['bolded']), 'matches without a bold span')
