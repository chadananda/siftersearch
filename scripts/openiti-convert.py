# OpenITI mARkdown → Ocean Library source markdown, keeping the PRINT PAGINATION (Chad, 2026-09-30).
#   PageVxxPyyy (page END) → <pb vol="xx" n="yyy"/> at the join — TEI page break, empty, invisible when rendered,
#     parsable for publication references. Every page join gets a <pb/> even without a number.
#   ~~ (wrapped line) → joined.  ms… milestones → dropped.  ### headings → markdown headings.
#   __________ [1] … (a page's footnotes) → <!-- fn v:p … --> beside that page's <pb>, out of the paragraphs.
#   # (paragraph): kept, EXCEPT a paragraph opening right after a page break whose predecessor does not end a sentence
#     — a page cut, not a paragraph — is merged into it with the <pb> at the join.
# usage: python3 openiti_convert.py <openiti file> <our source .md (frontmatter donor)> <out .md>
import re, sys

END = re.compile(r'[.!؟?:»"”)\]]\s*$|\.\s*\(\*\)\s*$')          # a sentence/utterance ends here
RULE = re.compile(r'_{5,}')

def convert(oiti: str, fm: str) -> tuple[str, dict]:
    body = oiti.split('#META#Header#End#', 1)[-1]
    body = re.sub(r'\n~~', ' ', body)                               # wrapped lines
    body = re.sub(r'\bms\d+\b', '', body)
    lines = [l.strip() for l in body.split('\n') if l.strip()]
    paras, stats, after_break, pending_fn = [], {'pages': 0, 'merged': 0, 'kept': 0, 'footnote_pages': 0, 'headings': 0}, False, []
    def emit_page_break(tag):
        nonlocal after_break
        # footnotes of the page just closed ride beside its <pb>
        fn = ' '.join(pending_fn).strip()
        note = f'<!-- fn: {fn.replace("--", "—")} -->' if fn else ''
        if paras: paras[-1] = paras[-1] + (' ' + note if note else '') + ' ' + tag
        else: paras.append(tag)
        pending_fn.clear(); after_break = True
    for l in lines:
        heading = l.startswith('### ')
        text = re.sub(r'^(### \|*\s*|#\s*)', '', l)
        # page markers can sit anywhere in a line; split the line on them
        parts = re.split(r'(PageV\d+P\d+)', text)
        for k, part in enumerate(parts):
            m = re.fullmatch(r'PageV(\d+)P(\d+)', part)
            if m:
                stats['pages'] += 1
                v, n = int(m.group(1)), int(m.group(2))
                emit_page_break(f'<pb vol="{v}" n="{n}"/>' if n else '<pb/>')     # V00P000 = unnumbered (front matter)
                continue
            part = part.strip()
            if not part: continue
            if RULE.search(part):                                  # page body | this page's footnotes
                part, fn = RULE.split(part, 1)
                pending_fn.append(fn.strip()); stats['footnote_pages'] += 1
                part = part.strip()
                if not part: continue
            starts_para = k == 0
            if heading and k == 0:
                paras.append('## ' + part); stats['headings'] += 1; after_break = False; continue
            if starts_para and paras and after_break and not END.search(re.sub(r'\s*(<!--.*?-->|<pb[^>]*/>)\s*', ' ', paras[-1]).strip()):
                paras[-1] = paras[-1] + ' ' + part; stats['merged'] += 1          # a page cut mid-sentence
            elif starts_para or not paras:
                paras.append(part); stats['kept'] += 1
            else:
                paras[-1] = paras[-1] + ' ' + part
            after_break = False
    if pending_fn: paras.append(f'<!-- fn: {" ".join(pending_fn).replace("--", "—")} -->')
    return fm + '\n\n'.join(re.sub(r'\s+', ' ', p).strip() for p in paras) + '\n', stats

if __name__ == '__main__':
    src, ours, out = sys.argv[1:4]
    t = open(ours, encoding='utf-8').read()
    fm = t[:t.index('---', 3) + 3] + '\n\n' if t.startswith('---') else ''
    md, stats = convert(open(src, encoding='utf-8').read(), fm)
    open(out, 'w', encoding='utf-8').write(md)
    paras = [p for p in md.split('\n\n') if p.strip() and not p.startswith('---')]
    L = sorted(len(re.sub(r'<!--.*?-->|<pb[^>]*/>', '', p)) for p in paras)
    print(stats, '| paragraphs', len(paras), 'median', L[len(L) // 2], 'p95', L[int(.95 * len(L))], 'max', L[-1])
