# Summarise battery result files on the realistic query kinds (phrase, sentence, citation — nobody searches whole paragraphs).
# Usage: python3 summarize.py <result-name> ...   (names as in XL_DATA/result-<name>.json, e.g. local_sm_512)
import json, os, sys
from battery import DATA
KINDS = ('phrase', 'sentence', 'citation')
for name in sys.argv[1:]:
    try: rows = json.load(open(os.path.join(DATA, f'result-{name}.json')))['rows']
    except FileNotFoundError: print(f'{name:22} (not run)'); continue
    out = []
    for s in ('book', 'originals'):
        rs = [r for r in rows if r['scope'] == s and r['kind'] in KINDS and 'error' not in r]
        if not rs: continue
        n = len(rs)
        h1 = sum(r['rank'] == 1 for r in rs) / n; h10 = sum(bool(r['rank']) for r in rs) / n
        ex = sum(r.get('unit_rank') == 1 for r in rs) / n
        out.append(f'{s} n={n} @1 {h1:.1%} @10 {h10:.1%} exact@1 {ex:.1%}')
    print(f'{name:22}', ' | '.join(out))
