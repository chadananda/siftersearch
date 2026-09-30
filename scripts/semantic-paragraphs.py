# SEMANTIC paragraph segmentation of over-long paragraphs in a derived Arabic/Persian source, written INTO the markdown
# so it is paid for once (Chad, 2026-09-30: "use Sonnet 5 batch for the 342 paragraphs and implement in MD so we never
# pay for this again"; "we never segment on arbitrary boundaries"). The model sees the paragraph's units numbered —
# sentences where the text is punctuated, else words — and returns only the numbers where a NEW paragraph begins.
# Long paragraphs are read in overlapping WINDOWS (a processing window, never a boundary: only starts in a window's core
# are kept). Text is verified unchanged; <pb/> tags and <!-- --> notes stay attached to the unit they precede/follow.
#
#   prepare  <md> <jobs.json> [--min 12000] [--title T]   paragraphs over --min visible chars → windows
#   sample   <jobs.json> <n> [--model M]                  run n windows LIVE and print the breaks for reading
#   submit   <jobs.json> [--model M]                       Message Batches API (50%); writes <jobs>.batch
#   collect  <jobs.json>                                   batch results → <jobs>.starts.json
#   apply    <jobs.json> <out.md>                          insert the breaks, verify the text
#   prepare-whole <md> <jobs.json> [--title T]              a WHOLE document whose source is not paragraphed: units are its
#       own blocks when they are meaningful (the model groups them), else its words (blocks cut at a fixed 5,000 chars are
#       rejoined first — without a space, the cut falls mid-word). Headings stay fixed.
#   apply-whole <jobs.json> <out.md>                       rebuild the document from the chosen paragraph starts
import json, re, sys, os
END = re.compile(r'(?<=[.!?؟؛])\s+(?![^<]*-->)')
ATOM = re.compile(r'<!--.*?-->|<pb[^>]*/>|\S+|\s+', re.S)
vis = lambda s: re.sub(r'<!--.*?-->|<pb[^>]*/>|⁅/?s\d+⁆', '', s)
WIN, OVER = 12000, 1800           # visible chars per window / overlap

SYSTEM = """You are an expert editor of classical Arabic and Persian texts, preparing a critical edition for readers.
You divide a long passage into PARAGRAPHS BY MEANING. A paragraph is one unit of thought: one biographical entry or one
stage of an entry (teachers / students / the critics' verdicts / death date), one event or year or obituary in a
chronicle, one ḥadīth with its isnād and matn, one legal question with its ruling and argument, one step of an argument
or one mystical theme. Never break inside an isnād–matn, inside a quotation, a verse, a list that belongs together, or
a sentence. Do not make paragraphs by length — only where the meaning turns; a genuinely unified long passage stays
long. A paragraph normally holds SEVERAL sentences: keep together the exchanges of one narration on one subject, a run of
glosses or word-explanations on one passage, the successive narrators' variants of one report, a list of one kind. A
single sentence stands alone only when it is itself a complete unit (a short entry, a heading-like line, a death date
closing an entry). When in doubt, do not break. The text is shown as numbered units (sentences, or words when the text is unpunctuated). Return the numbers of
the units at which a NEW paragraph begins (never the first unit shown)."""

SCHEMA = {"type": "object", "properties": {"starts": {"type": "array", "items": {"type": "integer"}}},
          "required": ["starts"], "additionalProperties": False}

def units_of(p):
    """(units, punctuated): each unit = raw string (tags/notes kept with it); split at sentence ends or words."""
    v = vis(p); words = len(v.split()) or 1
    punct = len(re.findall(r'[.!?؟؛]', v)) * 50 >= words
    if punct:
        return [u for u in END.split(p) if u != ''], True
    toks, units, cur = ATOM.findall(p), [], ''
    for t in toks:
        cur += t
        if not t.isspace() and not t.startswith('<'): units.append(cur); cur = ''
    if cur: units[-1:] = [units[-1] + cur] if units else [cur]
    return units, False

def render(units, first, punct):
    txt = lambda u: re.sub(r'\s+', ' ', vis(u)).strip()
    if punct: return '\n'.join(f'[{first + i}] {txt(u)}' for i, u in enumerate(units))
    return ' '.join(f'{txt(u)}₍{first + i}₎' for i, u in enumerate(units))

def prepare(md, jobs_path, minlen=12000, title=''):
    t = open(md, encoding='utf-8').read()
    paras = t.split('\n\n')
    jobs = {'md': md, 'title': title, 'windows': []}
    for pi, p in enumerate(paras):
        if p.startswith('#') or p.startswith('---') or len(vis(p)) <= minlen: continue
        units, punct = units_of(p)
        lens = [len(vis(u)) for u in units]
        s = 0
        while s < len(units):
            e, n = s, 0
            while e < len(units) and n < WIN: n += lens[e]; e += 1
            # core: skip the first half-overlap (the previous window decided it) unless this is the first window
            back = 0; b = s
            if s > 0:
                while b > 0 and back < OVER: b -= 1; back += lens[b]
            core_from = s
            jobs['windows'].append({'id': f'p{pi}w{len(jobs["windows"])}', 'para': pi, 'from': b, 'to': e,
                                    'core_from': core_from, 'core_to': e, 'punct': punct,
                                    'text': render(units[b:e], b + 1, punct)})
            s = e
    json.dump(jobs, open(jobs_path, 'w'), ensure_ascii=False)
    print('paragraphs', len({w['para'] for w in jobs['windows']}), 'windows', len(jobs['windows']),
          'visible chars', sum(len(vis(paras[i])) for i in {w['para'] for w in jobs['windows']}))

PRESENTATION = re.compile(r'[\uFB50-\uFDFF\uFE70-\uFEFF]')
def prepare_whole(md, jobs_path, title=''):
    t = open(md, encoding='utf-8').read()
    fm_end = t.index('---', 3) + 3 if t.startswith('---') else 0
    fm, body = t[:fm_end], t[fm_end:]
    if len(PRESENTATION.findall(body)) > 0.05 * max(1, len(re.findall(r'[\u0600-\u06FF\uFB50-\uFEFF]', body))):
        print('SKIP: presentation-form glyphs (PDF extraction damage) — repair the text first'); sys.exit(3)
    blocks = [b for b in re.split(r'\n\s*\n', body) if b.strip()]
    cut = sum(1 for b in blocks if 4990 <= len(b) <= 5010)
    segs = []                                          # [(kind, text)] kind: 'head' | 'text'
    if cut >= max(3, 0.2 * len(blocks)):              # fixed-size chunks: rejoin, then word units
        run = ''
        for b in blocks:
            if b.lstrip().startswith('#'):
                if run: segs.append(('text', run)); run = ''
                segs.append(('head', b.strip())); continue
            piece = re.sub(r'\s*\n\s*', ' ', b.strip())
            run = run + ('' if run and 4990 <= len(prev) <= 5010 else (' ' if run else '')) + piece if run else piece
            prev = b
        if run: segs.append(('text', run))
        mode = 'words'
    else:                                              # meaningful blocks: they are the units
        segs = [('head', b.strip()) if b.lstrip().startswith('#') else ('text', re.sub(r'\s*\n\s*', ' ', b.strip())) for b in blocks]
        mode = 'blocks'
    jobs = {'md': md, 'fm': fm, 'title': title, 'mode': mode, 'segs': segs, 'windows': [], 'whole': True}
    # a document = runs of text between headings; each run is segmented; units = blocks (mode blocks) or words
    runs, cur = [], []
    for i, (k, x) in enumerate(segs):
        if k == 'head':
            if cur: runs.append(cur); cur = []
        else: cur.append(i)
    if cur: runs.append(cur)
    jobs['runs'] = []
    for r in runs:
        if mode == 'blocks': units = [segs[i][1] for i in r]
        else: units = [u for i in r for u in units_of(segs[i][1])[0]]
        punct = mode == 'words' and units_of(' '.join(segs[i][1] for i in r))[1]
        if mode == 'words' and punct: units = [u for i in r for u in END.split(segs[i][1]) if u.strip()]
        ri = len(jobs['runs']); jobs['runs'].append({'segs': r, 'units': units})
        lens = [len(vis(u)) for u in units]; s_ = 0
        while s_ < len(units):
            e, n = s_, 0
            while e < len(units) and n < WIN: n += lens[e]; e += 1
            back, b = 0, s_
            if s_ > 0:
                while b > 0 and back < OVER: b -= 1; back += lens[b]
            txt = '\n'.join(f'[{b + 1 + k}] {re.sub(chr(92)+"s+"," ",vis(u)).strip()}' for k, u in enumerate(units[b:e])) \
                if (mode == 'blocks' or punct) else ' '.join(f'{re.sub(chr(92)+"s+"," ",vis(u)).strip()}₍{b + 1 + k}₎' for k, u in enumerate(units[b:e]))
            jobs['windows'].append({'id': f'r{ri}w{len(jobs["windows"])}', 'para': ri, 'from': b, 'to': e, 'core_from': s_, 'core_to': e,
                                    'punct': mode == 'blocks' or punct, 'text': txt})
            s_ = e
    json.dump(jobs, open(jobs_path, 'w'), ensure_ascii=False)
    print('mode', mode, 'runs', len(jobs['runs']), 'windows', len(jobs['windows']), 'units', sum(len(r['units']) for r in jobs['runs']),
          'chars', sum(len(vis(x)) for k, x in segs if k == 'text'))

def request(w, title, model):
    kind = 'sentences' if w['punct'] else 'words'
    return {'model': model, 'max_tokens': 16000, 'system': SYSTEM,
            'thinking': {'type': 'adaptive'}, 'output_config': {'effort': 'medium', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
            'messages': [{'role': 'user', 'content': f'Work: {title}\nUnits are {kind}, numbered {w["from"] + 1}–{w["to"]}.\n\n{w["text"]}'}]}

def starts_from(msg):
    text = next((b.text for b in msg.content if b.type == 'text'), '{}')
    return json.loads(text).get('starts', [])

def main():
    import anthropic
    cmd = sys.argv[1]; a = sys.argv[2:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    model = opt('--model', 'claude-sonnet-5')
    if cmd == 'prepare': return prepare(a[0], a[1], int(opt('--min', 12000)), opt('--title', ''))
    if cmd == 'prepare-whole': return prepare_whole(a[0], a[1], opt('--title', ''))
    jobs = json.load(open(a[0], encoding='utf-8'))
    client = anthropic.Anthropic()
    if cmd == 'sample':
        for w in jobs['windows'][:int(a[1])]:
            msg = client.messages.create(**request(w, jobs['title'], model))
            st = starts_from(msg)
            print(f"\n=== {w['id']} units {w['from']+1}-{w['to']} → starts {st} | in {msg.usage.input_tokens} out {msg.usage.output_tokens}")
            lines = w['text'].split('\n') if w['punct'] else None
            for s_ in st[:6]:
                if lines: print('   ¶ at', s_, ':', next((l[:160] for l in lines if l.startswith(f'[{s_}]')), '?'))
        return
    if cmd == 'submit':
        from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
        from anthropic.types.messages.batch_create_params import Request
        reqs = [Request(custom_id=w['id'], params=MessageCreateParamsNonStreaming(**request(w, jobs['title'], model))) for w in jobs['windows']]
        b = client.messages.batches.create(requests=reqs)
        open(a[0] + '.batch', 'w').write(b.id); print('batch', b.id, len(reqs), 'requests'); return
    if cmd == 'collect':
        bid = open(a[0] + '.batch').read().strip()
        b = client.messages.batches.retrieve(bid)
        if b.processing_status != 'ended': print('not ended', b.processing_status, b.request_counts); sys.exit(2)
        out, bad, use = {}, [], [0, 0]
        for r in client.messages.batches.results(bid):
            if r.result.type == 'succeeded':
                out[r.custom_id] = starts_from(r.result.message)
                use[0] += r.result.message.usage.input_tokens; use[1] += r.result.message.usage.output_tokens
            else: bad.append((r.custom_id, r.result.type))
        json.dump(out, open(a[0] + '.starts.json', 'w'))
        print('succeeded', len(out), 'failed', bad[:10], 'tokens in/out', use); return
    if cmd == 'apply-whole':
        starts = json.load(open(a[0] + '.starts.json'))
        cuts = {}
        for w in jobs['windows']:
            for s_ in starts.get(w['id'], []):
                u = s_ - 1
                if w['core_from'] <= u < w['core_to'] and u > 0: cuts.setdefault(w['para'], set()).add(u)
        out, run_of = [], {}
        for ri, r in enumerate(jobs['runs']):
            for i in r['segs']: run_of[i] = ri
        done = set()
        for i, (k, x) in enumerate(jobs['segs']):
            if k == 'head': out.append(x); continue
            ri = run_of[i]
            if ri in done: continue
            done.add(ri)
            units, us, cur = jobs['runs'][ri]['units'], cuts.get(ri, set()), ''
            sep = ' ' if jobs['mode'] == 'blocks' else ''
            for kk, u in enumerate(units):
                if kk in us and cur.strip(): out.append(cur.strip()); cur = ''
                cur += (sep if cur and jobs['mode'] == 'blocks' else '') + u
            if cur.strip(): out.append(cur.strip())
        new = jobs['fm'] + '\n\n' + '\n\n'.join(out) + '\n'
        L = lambda s_: re.sub(r'[^\u0621-\u064A\u067E\u0686\u0698\u06AFA-Za-z]', '', s_)
        old = open(jobs['md'], encoding='utf-8').read()
        assert L(new) == L(old), 'letters changed'
        open(a[1], 'w', encoding='utf-8').write(new)
        print('paragraphs', len([o for o in out if not o.startswith('#')]), 'from', sum(len(r['units']) for r in jobs['runs']), 'units'); return
    if cmd == 'apply':
        md, out_md = jobs['md'], a[1]
        # --onto NEW.md: apply to a regenerated file. Paragraphs are matched by their TEXT (not position): a paragraph is
        # used only if it reads identically, so a shifted boundary can never move a break into the wrong place.
        onto = opt('--onto')
        t = open(onto or md, encoding='utf-8').read(); paras = t.split('\n\n')
        if onto:
            key = lambda p: re.sub(r'\s+', ' ', vis(p)).strip()
            old_paras = open(md, encoding='utf-8').read().split('\n\n')
            where = {}
            for i, p in enumerate(paras): where.setdefault(key(p), i)
            remap, lost = {}, []
            for w in jobs['windows']:
                if w['para'] in remap or w['para'] in lost: continue
                j = where.get(key(old_paras[w['para']]))
                if j is None: lost.append(w['para'])
                else: remap[w['para']] = j
            if lost: print('paragraphs not found identically in the new file (left whole):', len(lost))
            for w in jobs['windows']: w['para'] = remap.get(w['para'], -1)
        starts = json.load(open(a[0] + '.starts.json'))
        by_para = {}
        for w in jobs['windows']:
            if w['para'] < 0: continue
            for s_ in starts.get(w['id'], []):
                u = s_ - 1                                  # 0-based unit index
                if w['core_from'] <= u < w['core_to'] and u > 0: by_para.setdefault(w['para'], set()).add(u)
        n_new = 0
        for pi, us in by_para.items():
            units, punct = units_of(paras[pi])
            pieces, cur = [], ''
            for k, u in enumerate(units):
                if k in us and cur.strip(): pieces.append(cur.strip()); cur = ''
                # sentence units lost their separating whitespace in the split; word units carry theirs
                cur += (' ' if punct and cur else '') + u
            if cur.strip(): pieces.append(cur.strip())
            n_new += len(pieces) - 1
            paras[pi] = '\n\n'.join(pieces)
        new = '\n\n'.join(paras)
        norm = lambda s: re.sub(r'\s+', ' ', s).strip()
        assert norm(new) == norm(t), 'text changed'
        open(out_md, 'w', encoding='utf-8').write(new)
        print('paragraph breaks added', n_new, 'in', len(by_para), 'paragraphs'); return

if __name__ == '__main__':
    main()
