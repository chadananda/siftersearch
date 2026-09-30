# Last step before a derived Arabic source goes to ingest (Chad, 2026-09-30: "ingest for searching now and tackle sentence
# segmentation at some later date"; "we never segment on arbitrary boundaries"). No splitting here; frontmatter gets needs_segmentation: false, and with --defer-sentences also
# sentence_markers: defer (ingest then makes no sentence-marking call). Verifies against the ORIGINAL source that every
# letter and diacritic survived.
# usage: python3 finalize-source.py <derived.md> <original.md> <out.md> [--defer-sentences] [--meta key=value ...]
import re, sys
LIMIT, TARGET = 1500, 1000
DIAC = re.compile(r'[ً-ٰٟ]')
LETTERS = re.compile(r'[^ء-يپچژگ]+')
vis = lambda s: re.sub(r'<!--.*?-->|<pb[^>]*/>|⁅/?s\d+⁆', '', s)


if __name__ == '__main__':
    derived, original, out = sys.argv[1:4]
    defer = '--defer-sentences' in sys.argv
    extra = [a.split('=', 1) for a in sys.argv[4:] if '=' in a and not a.startswith('--')]
    t = open(derived, encoding='utf-8').read()
    fm_end = t.index('---', 3) + 3
    fm, body = t[:fm_end], t[fm_end:]
    paras = [p for p in body.split('\n\n') if p.strip()]
    final = [p.strip() for p in paras]                    # never split by length — only semantic segmentation
    keys = [('needs_segmentation', 'false')] + ([('sentence_markers', 'defer')] if defer else []) + [(k, v) for k, v in extra]
    for k, v in keys:
        if not re.search(rf'^{k}:', fm, re.M): fm = fm[:-3].rstrip() + f'\n{k}: {v}\n---'
    new = fm + '\n\n' + '\n\n'.join(final) + '\n'
    o = open(original, encoding='utf-8').read()
    lo, ln = len(LETTERS.sub('', o)), len(LETTERS.sub('', new))
    do, dn = len(DIAC.findall(o)), len(DIAC.findall(new))
    ok = ln == lo and dn == do                      # EXACT: a gain means duplicated text, a loss means dropped text
    print(f'paragraphs {len(paras)} -> {len(final)} | letters {ln / lo:.4f} | diacritics {dn}/{do} | {"OK" if ok else "FAILED"}')
    if not ok: sys.exit(1)
    open(out, 'w', encoding='utf-8').write(new)
