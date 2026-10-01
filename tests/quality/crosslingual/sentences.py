# Sentence / phrase units for the search index — the exact passage a query lands on (Chad 2026-10-01: "build a phrase or
# sentence parser so we can get the exact passage being searched"). Never cuts by length (Chad 2026-09-30: no arbitrary
# boundaries). Order of trust:
#   1. the library's own sentence markers ⁅sN⁆…⁅/sN⁆ (placed at ingest; also the deep-link anchors)
#   2. the text's own sentence punctuation  . ! ? ؟  and the «*» verse separator of Bahá'í originals
#   3. for a sentence over LONG words only: its own phrase punctuation  ؛ ، : ;  — a long sentence without any stays whole
# A fragment under SHORT words joins the unit before it (an invocation, a number, "O Lord!").
import re

LONG, SHORT = 60, 5
MARK = re.compile(r'⁅s(\d+)⁆(.*?)⁅/s\1⁆', re.S)
SENT_END = re.compile(r'(?<=[.!?؟])\s+|\s*\*\s*')
PHRASE_END = re.compile(r'(?<=[؛،:;])\s+')
wc = lambda s: len(s.split())
clean = lambda s: re.sub(r'\s+', ' ', re.sub(r'⁅/?s\d+⁆|<!--.*?-->|<pb[^>]*/>', ' ', s or '')).strip()

def _merge_short(units):
    out = []
    for u in units:
        u = u.strip()
        if not u: continue
        if out and wc(u) < SHORT: out[-1] = f'{out[-1]} {u}'
        else: out.append(u)
    if len(out) > 1 and wc(out[0]) < SHORT:               # a short lead-in joins what follows
        out[1] = f'{out[0]} {out[1]}'; out = out[1:]
    return out

def sentences(raw):
    """Units of one paragraph, in order, each exactly as written (whitespace normalised)."""
    raw = raw or ''
    marked = [clean(m.group(2)) for m in MARK.finditer(raw)]
    units = marked if marked else [clean(x) for x in SENT_END.split(clean(raw))]
    out = []
    for u in units:
        if wc(u) > LONG:
            out += [clean(x) for x in PHRASE_END.split(u)]
        else:
            out.append(u)
    return _merge_short(out)

if __name__ == '__main__':
    import sys
    for line in sys.stdin: print(' | '.join(sentences(line)))
