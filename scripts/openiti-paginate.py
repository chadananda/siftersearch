# Paginate and paragraph OUR Shamela source using an OpenITI version of the SAME edition (Chad, 2026-09-30).
# Our copy keeps what OpenITI dropped — vocalisation (millions of tashkīl marks), footnotes, and in places whole passages —
# so the TEXT is always ours; OpenITI contributes only WHERE pages and paragraphs begin, located by letters alone.
#   · our blank-line blocks are print pages: body, then a rule (_____), then that page's notes
#   · every page join → <pb vol="v" n="p"/> (number from the OpenITI page that opens with the same letters) or <pb/>
#   · the page's notes → <!-- fn: … --> just before the next <pb> (kept in the source, out of paragraphs)
#   · paragraph breaks at OpenITI '#' starts, found monotonically in our text; a break falling on a page join where the
#     text before does not end a sentence is a page cut, not a paragraph, and is ignored
#   · OpenITI headings found verbatim (letters) become '## ' lines. NO length-based splitting — only semantic.
# usage: python3 openiti-paginate.py <openiti file> <our source .md> <out .md>
import re, sys

RULE = re.compile(r'_{5,}')
WINDOW = 8000                        # letters ahead of the cursor to look for the next OpenITI paragraph start
DIAC = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
FOLD = str.maketrans({'ى': 'ي', 'ی': 'ي', 'ئ': 'ي', 'ک': 'ك', 'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ؤ': 'و'})
LETTER = re.compile(r'[ء-يپچژگ]')
END = re.compile(r'[.!؟?»"”)\]]\s*$')

def letters(t):                      # normalised letter string + for each letter its offset in t
    t2 = DIAC.sub(lambda m: '\0' * len(m.group()), t).translate(FOLD)
    idx = [i for i, ch in enumerate(t2) if LETTER.match(ch)]
    return ''.join(t2[i] for i in idx), idx

def oiti_structure(oiti):
    """OpenITI → (pages: [(start_key, vol, n)], paras: [(start_key, heading_text|None)]) in reading order."""
    body = oiti.split('#META#Header#End#', 1)[-1]
    body = re.sub(r'\n~~', ' ', body)
    body = re.sub(r'\bms\d+\b|\b(AUT|NOTMATCH)\b', '', body)
    pages, paras, pending_page = [], [], None
    for line in body.split('\n'):
        line = line.strip()
        if not line: continue
        is_head = line.startswith('### ') and not re.match(r'^### \$', line)
        is_entry = bool(re.match(r'^### \$', line)) or bool(re.match(r'^#+\s*(### )?\$?\s*[\d٠-٩]+\s*-', line))
        text = re.sub(r'^(### (\|+|\$+)?\s*|#\s*)', '', line)
        para_start = line.startswith('#')
        for k, part in enumerate(re.split(r'(PageV\d+P\d+)', text)):
            m = re.fullmatch(r'PageV(\d+)P(\d+)', part)
            if m: pending_page = (int(m.group(1)), int(m.group(2))); continue   # the NEXT text opens a new page
            key = letters(part)[0][:24]
            if len(key) < 12: continue
            if pending_page is not None:
                pages.append((key, *pending_page)); pending_page = None
            if k == 0 and para_start:
                paras.append((key, part.strip() if is_head and len(part) <= 200 else None, is_entry))
    return pages, paras

def paginate(oiti, ours):
    fm = ours[:ours.index('---', 3) + 3] if ours.startswith('---') else ''
    body = ours[len(fm):]
    blocks = [b.strip() for b in re.split(r'\n\s*\n', body) if b.strip()]
    pages, paras = oiti_structure(oiti)
    # OpenITI's page-number markers sit at a page's END, so pages[i] is the page that STARTS with key — i.e. the number
    # of the page that just ended belongs to the previous page. Shift: a page opening with key K has number of the
    # marker that preceded K … which is the number of the page BEFORE it. Keep the pair (key → number of page ending
    # just before it); our page j then carries the number stored under page j+1's opening key.
    # A page opening shared by several OpenITI pages (a basmala, a formula) cannot say which page it is: not used.
    # PageV00P000 (front matter) carries no number.
    from collections import Counter
    seen = Counter(k for k, _, _ in pages)
    ends_before = {k: (v, n) for k, v, n in pages if seen[k] == 1 and n > 0}
    stats = {'pages': len(blocks), 'numbered': 0, 'footnote_pages': 0, 'para_breaks': 0, 'headings': 0, 'page_cuts_ignored': 0}
    # 1. page bodies + notes, and the number of each page. OpenITI's marker PageVvPn follows page n's last words, so the
    #    text right after it opens page n+1: ends_before[key] = number of the page that ENDS before key. Our page j
    #    therefore has the number stored under page j+1's opening letters.
    bodies, notes = [], []
    for b in blocks:
        if RULE.search(b):
            x, y = RULE.split(b, 1); bodies.append(x.strip()); notes.append(y.strip()); stats['footnote_pages'] += 1
        else: bodies.append(b); notes.append('')
    nums = []
    for j in range(len(bodies)):
        nxt = letters(bodies[j + 1])[0][:24] if j + 1 < len(bodies) else None
        nums.append(ends_before.get(nxt) if nxt else None)
    # 1a. a number that does not fit between its numbered neighbours is a mis-match (drop it; the gap fill may restore it).
    for _ in range(2):
        known = [j for j, x in enumerate(nums) if x]
        for a, j, b in zip(known, known[1:], known[2:]):
            if nums[a] is None or nums[j] is None or nums[b] is None: continue      # cleared earlier in this pass
            if nums[a] < nums[b] and not (nums[a] < nums[j] < nums[b]):
                nums[j] = None; stats['dropped_misfit'] = stats.get('dropped_misfit', 0) + 1
        known = [j for j, x in enumerate(nums) if x]
        if len(known) >= 2 and nums[known[0]] > nums[known[1]]: nums[known[0]] = None   # a bad first number
    # 1b. an unnumbered run BRACKETED by known pages of the same volume whose gap it exactly fills is certain, not
    #     approximate: 105, ?, 107 → 106. Anything ambiguous stays <pb/> for a later approximation pass.
    j = 0
    while j < len(nums):
        if nums[j] is None:
            k = j
            while k < len(nums) and nums[k] is None: k += 1
            a, b = (nums[j - 1] if j > 0 else None), (nums[k] if k < len(nums) else None)
            if a and b and a[0] == b[0] and b[1] - a[1] == k - j + 1:
                for t in range(j, k): nums[t] = (a[0], a[1] + (t - j + 1)); stats['filled'] = stats.get('filled', 0) + 1
            j = k
        else: j += 1
    # 2. one stream. TEI: <pb n="p"/> marks where page p BEGINS (OpenITI's PageV..P.. marks where a page ENDS), so each
    #    page opens with its own tag, and its notes close it just before the next page's tag.
    stream, page_join_at = '', []
    for j, bdy in enumerate(bodies):
        v_n = nums[j]
        if v_n: stats['numbered'] += 1
        tag = f'<pb vol="{v_n[0]}" n="{v_n[1]}"/>' if v_n else '<pb/>'
        stream += (' ' if stream else '') + tag + ' '
        page_join_at.append(len(stream))
        stream += bdy
        if notes[j]: stream += f' <!-- fn: {notes[j].replace("--", "—")} -->'
    # 3. paragraph breaks where OpenITI paragraphs start (letters, monotonic)
    visible = re.sub(r'<!--.*?-->|<pb[^>]*/>', lambda m: '\0' * len(m.group()), stream)
    L, idx = letters(visible)
    joins = set(page_join_at)
    # Where each OpenITI paragraph start falls in OUR text: every occurrence of its letters is a candidate, and the chosen
    # set is the LONGEST chain in reading order (LIS) — a repeated phrase can neither drag the search far ahead (losing
    # everything between) nor strand it behind. Starts with no place in the chain are simply not paragraph breaks here.
    import bisect
    cands = []                                   # (position, para index) in reading order of paras
    for i, (key, head, _entry) in enumerate(paras):
        occ, p0 = [], L.find(key)
        while p0 >= 0 and len(occ) < 40: occ.append(p0); p0 = L.find(key, p0 + 1)
        for pos in sorted(occ, reverse=True): cands.append((pos, i))   # descending: one per paragraph in the chain
    tails, tail_idx, prev = [], [], [None] * len(cands)
    for c, (pos, i) in enumerate(cands):
        j = bisect.bisect_left(tails, pos)
        if j > 0: prev[c] = tail_idx[j - 1]
        if j == len(tails): tails.append(pos); tail_idx.append(c)
        else: tails[j] = pos; tail_idx[j] = c
    chain, c = [], (tail_idx[-1] if tail_idx else None)
    while c is not None: chain.append(cands[c]); c = prev[c]
    chain.reverse()
    cuts = []
    for pos, i in chain:
        raw = idx[pos]; head = paras[i][1]; entry = paras[i][2]
        b = raw
        while b > 0 and stream[b - 1].isspace(): b -= 1
        before = re.sub(r'<!--.*?-->|<pb[^>]*/>', '', stream[max(0, b - 400):b]).rstrip()
        at_join = any(abs(b - j) <= 2 for j in joins) or stream[max(0, b - 3):b] == '/>'
        # a heading or a numbered/biography ENTRY always opens a paragraph, even on a page whose last line has no stop
        if at_join and not END.search(before) and not head and not entry: stats['page_cuts_ignored'] += 1; continue
        cuts.append((raw, head))
    stats['chain'] = len(chain)
    out, last = [], 0
    for raw, head in sorted(cuts):
        # the break goes BEFORE any opening mark that belongs to the paragraph's first word — «(تمييز)», "لا …
        # …and never inside a word: OpenITI may open at «حدثنا» where our text reads «وحدثنا» — back to the word's start
        while raw > 0 and not stream[raw - 1].isspace() and stream[raw - 1] != '>': raw -= 1
        if raw < last: continue                      # inside text already emitted (an extended heading) — never duplicate
        seg = stream[last:raw].strip()
        if seg: out.append(seg)
        last = raw
        if head:                                   # a heading: its text becomes the '## ' line
            hl = len(letters(head)[0]); q = raw; n = 0
            while q < len(stream) and n < hl:
                if stream.startswith('<!--', q): q = stream.index('-->', q) + 3; continue   # a note or page break inside
                if stream.startswith('<pb', q): q = stream.index('/>', q) + 2; continue     # a heading: never counted, never cut
                if LETTER.match(DIAC.sub('', stream[q]).translate(FOLD) or ' '): n += 1
                q += 1
            while q < len(stream) and not stream[q].isspace() and stream[q] != '<': q += 1   # finish the word: never cut before its diacritics
            out.append('## ' + stream[raw:q].strip()); last = q; stats['headings'] += 1
        stats['para_breaks'] += 1
    tail = stream[last:].strip()
    if tail: out.append(tail)
    return fm, out, stats


if __name__ == '__main__':
    src, ours_p, out_p = sys.argv[1:4]
    fm, paras, stats = paginate(open(src, encoding='utf-8').read(), open(ours_p, encoding='utf-8').read())
    # NEVER split by length (Chad, 2026-09-30: "we never segment on arbitrary boundaries") — an over-long paragraph stays
    # whole until the semantic segmenter handles it.
    final = [re.sub(r'\s+', ' ', p).strip() for p in paras]
    open(out_p, 'w', encoding='utf-8').write(fm + '\n\n' + '\n\n'.join(final) + '\n')
    vis = sorted(len(re.sub(r'<!--.*?-->|<pb[^>]*/>', '', p)) for p in final if not p.startswith('## '))
    print(stats, '| paragraphs', len(final), 'median', vis[len(vis) // 2], 'p95', vis[int(.95 * len(vis))], 'max', vis[-1])
