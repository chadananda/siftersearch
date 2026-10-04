# Held-citations review page builder: manual decisions → SE context (quote bolded), the chosen original with the
# matched span bolded inside ~30 words either side, and the literal English of the bold. Emits text segments, never HTML.
#   python3 scripts/citations/build-held-review.py <scratch dir> <out.html> <template.html>
#   python3 scripts/citations/build-held-review.py planning/citations/held-review-data.json <out.html> <template.html>
# :inputs: worklist.json (candidate word windows), review-data.json, se-context.json, manual-decisions.jsonl (later lines win)
# — or the built items themselves (held-review-data.json, the durable copy; the scratch inputs were lost 2026-10-02).
import difflib, json, re, sys
from collections import Counter

SP, OUT, TEMPLATE = sys.argv[1:4]
if SP.endswith('.json'):
    data = json.dumps(json.load(open(SP)), ensure_ascii=False).replace('</', '<\\/')
    open(OUT, 'w').write(open(TEMPLATE).read().replace('__DATA__', data))
    sys.exit(0)
PAD = 30

work = {w['id']: w for w in json.load(open(f'{SP}/worklist.json'))}
review = {r['id']: r for r in json.load(open(f'{SP}/review-data.json'))['items']}
ctx = json.load(open(f'{SP}/se-context.json'))
dec = {}
for line in open(f'{SP}/manual-decisions.jsonl'):
    o = json.loads(line)
    dec[o['id']] = o


WORD = re.compile(r"[^\W_]+(?:[’'][^\W_]+)*")


def bold_quote(para, quote):
    """SE's paragraph as [{t, b}] with the quote bolded. Word-level match (runs of ≥4 words), because SE interrupts
    quotations ("…," Bahá’u’lláh has proclaimed, "…") and the PDFs carry extra spaces, line breaks and italics marks."""
    pw = [(m.start(), m.end(), m.group().lower()) for m in WORD.finditer(para)]
    qw = [m.group().lower() for m in WORD.finditer(quote)]
    blocks = difflib.SequenceMatcher(None, [w for *_, w in pw], qw, autojunk=False).get_matching_blocks()
    spans = [(pw[b.a][0], pw[b.a + b.size - 1][1]) for b in blocks if b.size >= 4]
    segs, at = [], 0
    for a, b in spans:
        if a > at: segs.append({'t': para[at:a]})
        segs.append({'t': para[a:b], 'b': 1}); at = b
    if at < len(para): segs.append({'t': para[at:]})
    return segs, sum(b.size for b in blocks if b.size >= 4) >= min(4, len(qw))


def original(words, ranges):
    lo = max(0, min(a for a, _ in ranges) - PAD)
    hi = min(len(words) - 1, max(b for _, b in ranges) + PAD)
    inb = {i for a, b in ranges for i in range(a, b + 1)}
    segs = [{'t': '… '}] if lo > 0 else []
    cur, curb = [], None
    for i in range(lo, hi + 1):
        b = i in inb
        if curb is not None and b != curb:
            segs.append({'t': ' '.join(cur) + ' ', **({'b': 1} if curb else {})}); cur = []
        cur.append(words[i]); curb = b
    if cur: segs.append({'t': ' '.join(cur), **({'b': 1} if curb else {})})
    if hi < len(words) - 1: segs.append({'t': ' …'})
    return segs


def match(item_id, c, ranges):
    w = work[item_id]['cands'][c - 1]
    rv = next((x for x in review[item_id]['candidates'] if x['content_id'] == w['content_id']), {})
    return {'content_id': w['content_id'], 'title': w['title'], 'ref': rv.get('ref', f"¶{w['pidx']}"), 'author': rv.get('author'),
            'url': rv.get('url') or f"https://siftersearch.com/library/view?doc={w['doc']}#p{w['pidx']}",
            'segs': original(w['words'], ranges)}


def ext_match(e):
    """A paragraph found outside the candidates (usually by searching the work SE names): bold each exact span."""
    t, segs, at = e['text'], [], 0
    for b in sorted(e['bold'], key=lambda s: e['text'].find(s)):
        i = t.find(b, at)
        if i < 0: continue
        if i > at: segs.append({'t': t[at:i]})
        segs.append({'t': b, 'b': 1}); at = i + len(b)
    if at < len(t): segs.append({'t': t[at:]})
    return {'content_id': e['content_id'], 'title': e['title'], 'ref': f"¶{e['pidx']}", 'author': e.get('author'),
            'url': f"https://siftersearch.com/library/view?doc={e['doc']}#p{e['pidx']}", 'segs': segs}


items = []
for iid, r in review.items():
    d = dec[iid]
    it = {k: r.get(k) for k in ('id', 'ctai_ids', 'new', 'figure', 'quote', 'quoted_in', 'status', 'kept_unsure')}
    if (c := ctx.get(iid)):
        segs, found = bold_quote(c['para'], r['quote'])
        it['se'] = {'before': c.get('before'), 'para': segs, 'after': c.get('after'), 'found': found}
    it.update(fit=d['fit'], suggest=d.get('suggest'), note=d.get('note'), lit=d.get('lit'), elsewhere=d.get('found_elsewhere'),
              named=d.get('named'), author=d.get('author'))
    if d.get('ext'):
        it['matches'] = [ext_match(e) for e in d['ext']]
    elif (src := d.get('from')):
        it['matches'] = [match(src['id'], src['c'], src['r'])]
    elif d.get('c'):
        it['matches'] = [match(iid, d['c'], d['r'])] + [match(iid, a['c'], a['r']) for a in d.get('also', [])]
    else:
        it['matches'] = []
    shown = {m['content_id'] for m in it['matches']}
    it['others'] = [{'title': x['title'], 'ref': x.get('ref'), 'url': x.get('url')} for x in r['candidates'] if x['content_id'] not in shown]
    items.append(it)

rank = {'full': 0, 'partial': 1, 'none': 2}
items.sort(key=lambda x: (x['suggest'] == 'not_translation', rank[x['fit']]))
data = json.dumps({'items': items}, ensure_ascii=False).replace('</', '<\\/')
open(OUT, 'w').write(open(TEMPLATE).read().replace('__DATA__', data))
print(len(items), dict(Counter(i['fit'] for i in items)), 'se-context', sum(1 for i in items if i.get('se')),
      'quote bolded', sum(1 for i in items if i.get('se', {}).get('found')))
