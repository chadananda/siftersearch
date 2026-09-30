# Write sentence markers INTO a punctuated source file (Chad, 2026-09-30: segment and clean up before ingestion so that
# re-ingestion always remains cheap — a source with valid ⁅sN⁆ markers ingests with no model call).
# Per paragraph, sentences end at . ! ? ؟ ؛ (not ':' — «قال: …» opens a quotation); numbering restarts at 1 in each
# paragraph (the library's convention). Headings, frontmatter and already-marked paragraphs are left alone. <pb/> tags
# and <!-- --> notes stay where they are, inside the sentence they fall in. Verifies the text is unchanged.
# usage: python3 mark-sentences.py <in.md> <out.md>
import re, sys
END = re.compile(r'(?<=[.!?؟؛])(\s+)(?![^<]*-->)')

def mark_paragraph(p):
    if p.startswith('#') or '⁅s' in p or not p.strip(): return p
    parts = END.split(p)                    # [sent, ws, sent, ws, …]
    sents, gaps = parts[0::2], parts[1::2]
    out = ''
    n = 0
    for k, s_ in enumerate(sents):
        if s_.strip():
            n += 1; out += f'⁅s{n}⁆{s_}⁅/s{n}⁆'
        else: out += s_
        if k < len(gaps): out += gaps[k]
    return out

if __name__ == '__main__':
    src, dst = sys.argv[1:3]
    t = open(src, encoding='utf-8').read()
    fm_end = t.index('---', 3) + 3 if t.startswith('---') else 0
    fm, body = t[:fm_end], t[fm_end:]
    paras = body.split('\n\n')
    marked = [mark_paragraph(p) for p in paras]
    out = fm + '\n\n'.join(marked)
    assert re.sub(r'⁅/?s\d+⁆', '', out) == t, 'text changed'
    opens, closes = len(re.findall(r'⁅s\d+⁆', out)), len(re.findall(r'⁅/s\d+⁆', out))
    assert opens == closes
    open(dst, 'w', encoding='utf-8').write(out)
    print('paragraphs', len(paras), 'sentences', opens)
