# OpenITI mARkdown → Ocean Library source markdown, keeping the PRINT PAGINATION (Chad, 2026-09-30).
#   PageVxxPyyy (page END) → <pb vol="xx" n="yyy"/> at the join — TEI page break, empty, invisible when rendered,
#     parsable for publication references. Every page join gets a <pb/> even without a number.
#   ~~ (wrapped line) → joined.  ms… milestones → dropped.  ### headings → markdown headings.
#   __________ [1] … (a page's footnotes) → <!-- fn v:p … --> beside that page's <pb>, out of the paragraphs.
#   Footnotes missing from the OpenITI version are TRANSPLANTED from our Shamela copy: its pages hold body, then a
#     rule, then that page's notes — each OpenITI page takes the notes of our page that opens with the same words.
#   # (paragraph): kept, EXCEPT a paragraph opening right after a page break whose predecessor does not end a sentence
#     — a page cut, not a paragraph — is merged into it with the <pb> at the join.
# usage: python3 openiti_convert.py <openiti file> <our source .md (frontmatter donor)> <out .md>
import re, sys

END = re.compile(r'[.!؟?:»"”)\]]\s*$|\.\s*\(\*\)\s*$')          # a sentence/utterance ends here
RULE = re.compile(r'_{5,}')

LETTERS = re.compile(r'[^\u0621-\u064A]+')
def key(text, n=30):
    t = re.sub(r'[\u064B-\u065F\u0670\u0640]', '', text)
    return LETTERS.sub('', t)[:n]

def notes_by_page_start(ours: str) -> dict:
    """Our Shamela copy: page = blank-line block; body before the rule, notes after. start-of-body key → notes."""
    body = ours.split('---', 2)[2] if ours.startswith('---') else ours
    out = {}
    for b in re.split(r'\n\s*\n', body):
        if not RULE.search(b): continue
        page, notes = RULE.split(b, 1)
        k = key(page)
        if len(k) >= 20 and notes.strip(): out.setdefault(k, notes.strip())
    return out


def convert(oiti: str, fm: str, ours_notes: dict | None = None) -> tuple[str, dict]:
    body = oiti.split('#META#Header#End#', 1)[-1]
    body = re.sub(r'\n~~', ' ', body)                               # wrapped lines
    body = re.sub(r'\bms\d+\b', '', body)
    lines = [l.strip() for l in body.split('\n') if l.strip()]
    paras, stats, after_break, pending_fn = [], {'pages': 0, 'merged': 0, 'kept': 0, 'footnote_pages': 0, 'transplanted': 0, 'headings': 0}, False, []
    page_start = []                                                   # opening words of the page being read
    carry = []                                                        # a number/page-ref heading waiting for its text
    def emit_page_break(tag):
        nonlocal after_break
        if not pending_fn and ours_notes:
            n = ours_notes.get(key(' '.join(page_start)))
            if n: pending_fn.append(n); stats['transplanted'] += 1
        page_start.clear()
        # footnotes of the page just closed ride beside its <pb>
        fn = ' '.join(pending_fn).strip()
        note = f'<!-- fn: {fn.replace("--", "—")} -->' if fn else ''
        if paras: paras[-1] = paras[-1] + (' ' + note if note else '') + ' ' + tag
        else: paras.append(tag)
        pending_fn.clear(); after_break = True
    for l in lines:
        # OpenITI structure: '### |' '### ||' = section headings; '### $' = a biography ENTRY (the line is its text, so a
        # paragraph); AUT / NOTMATCH = annotation tags. A heading that is only a number ('3343 -') or a bracketed page
        # reference ('[ص: 296]') belongs to the text that follows, so it opens that paragraph instead.
        l = re.sub(r'\b(AUT|NOTMATCH)\b', '', l).strip()
        is_entry = bool(re.match(r'^### \$+', l))
        text = re.sub(r'^(### (\|+|\$+)?\s*|#\s*)', '', l).strip()
        heading = l.startswith('### ') and not is_entry and not re.fullmatch(r'[\d٠-٩]+\s*-?|\[ص:?\s*[\d٠-٩]+\]', text) and len(text) <= 200
        if l.startswith('### ') and not heading and not is_entry and len(text) < 40:
            carry.append(text); continue
        if carry and not heading:
            text = ' '.join(carry + [text]); carry.clear()
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
            if len(key(' '.join(page_start))) < 30: page_start.append(part)
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
    final = []
    for p in paras:
        p = re.sub(r'\s+', ' ', p).strip()
        final.append(p)                                   # never split by length — only semantic segmentation
    return fm + '\n\n'.join(final) + '\n', stats

if __name__ == '__main__':
    src, ours, out = sys.argv[1:4]
    t = open(ours, encoding='utf-8').read()
    fm = t[:t.index('---', 3) + 3] + '\n\n' if t.startswith('---') else ''
    md, stats = convert(open(src, encoding='utf-8').read(), fm, notes_by_page_start(t))
    open(out, 'w', encoding='utf-8').write(md)
    paras = [p for p in md.split('\n\n') if p.strip() and not p.startswith('---')]
    L = sorted(len(re.sub(r'<!--.*?-->|<pb[^>]*/>', '', p)) for p in paras)
    print(stats, '| paragraphs', len(paras), 'median', L[len(L) // 2], 'p95', L[int(.95 * len(L))], 'max', L[-1])
