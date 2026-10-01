# Build a LOCAL Meili index (127.0.0.1:7701) from XL_DATA/corpus.db for one embedding setup.
# Usage: python3 build_local.py <index> <model> <dims> <para|win> [--docs N]
#   para = one vector per paragraph (as production);  win = an ARRAY of window vectors per paragraph (40 words, step 20)
#   → Meili scores a paragraph by its closest window (native max-sim). Paragraphs are never split.
# Also stores text_norm (letter-normalised Arabic/Persian) for exact-phrase matching. Vectors cached in XL_DATA/vcache.db.
import json, os, re, sys, sqlite3, time, urllib.request, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
from battery import DATA, KEY, toks
from sentences import sentences
from phrases import phrases, anchored, bare

MEILI, MKEY = 'http://127.0.0.1:7701', 'local-xl'
def meili(method, path, body=None):
    req = urllib.request.Request(MEILI + path, json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Authorization': f'Bearer {MKEY}', 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=600).read() or b'{}')

def windows(text, size=40, step=20):
    w = text.split()
    if len(w) <= size: return [' '.join(w)] if w else []
    out = [' '.join(w[i:i + size]) for i in range(0, len(w) - size + step, step)]
    return [x for x in out if x]

vc = sqlite3.connect(os.path.join(DATA, 'vcache.db'), check_same_thread=False, timeout=300)   # several builds share the cache
vc.execute('CREATE TABLE IF NOT EXISTS v (model TEXT, dims INT, text TEXT, vec BLOB, PRIMARY KEY (model, dims, text))')

def embed_batch(texts, model, dims):
    if model.startswith('text-embedding'):
        req = urllib.request.Request('https://api.openai.com/v1/embeddings', json.dumps({'model': model, 'dimensions': dims, 'input': texts}).encode(),
                                     {'Authorization': f"Bearer {KEY('OPENAI_API_KEY')}", 'Content-Type': 'application/json'})
        return [x['embedding'] for x in json.loads(urllib.request.urlopen(req, timeout=180).read())['data']]
    if model.startswith('gemini'):
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents?key={KEY('GEMINI_API_KEY')}",
                                     json.dumps({'requests': [{'model': f'models/{model}', 'content': {'parts': [{'text': t}]}, 'taskType': 'RETRIEVAL_DOCUMENT', 'outputDimensionality': dims} for t in texts]}).encode(),
                                     {'Content-Type': 'application/json'})
        return [e['values'] for e in json.loads(urllib.request.urlopen(req, timeout=180).read())['embeddings']]
    if model.startswith('voyage'):
        req = urllib.request.Request('https://api.voyageai.com/v1/embeddings', json.dumps({'model': model, 'input': texts, 'input_type': 'document', 'output_dimension': dims}).encode(),
                                     {'Authorization': f"Bearer {KEY('VOYAGE_API_KEY')}", 'Content-Type': 'application/json'})
        return [x['embedding'] for x in json.loads(urllib.request.urlopen(req, timeout=180).read())['data']]
    if model.startswith('local/'):            # local open model via embed_server.py (port 7711)
        req = urllib.request.Request('http://127.0.0.1:7711/embed', json.dumps({'model': model[6:], 'texts': texts, 'kind': 'document'}).encode(), {'Content-Type': 'application/json'})
        return json.loads(urllib.request.urlopen(req, timeout=1800).read())['vectors']
    raise ValueError(model)

def vectors(texts, model, dims, batch=96, workers=12):
    import array
    have = {}
    for i in range(0, len(texts), 500):
        part = texts[i:i + 500]
        for t, b in vc.execute(f"SELECT text, vec FROM v WHERE model=? AND dims=? AND text IN ({','.join('?' * len(part))})", [model, dims] + part):
            have[t] = list(array.array('f', b))
    todo = [t for t in dict.fromkeys(texts) if t not in have]
    def go(chunk):
        for attempt in range(5):
            try: return chunk, embed_batch(chunk, model, dims)
            except Exception as e: time.sleep(2 * (attempt + 1)); err = e
        raise err
    with cf.ThreadPoolExecutor(workers) as ex:
        for chunk, vs in ex.map(go, [todo[i:i + batch] for i in range(0, len(todo), batch)]):
            for t, v in zip(chunk, vs):
                have[t] = v
                vc.execute('INSERT OR REPLACE INTO v VALUES (?,?,?,?)', (model, dims, t, array.array('f', v).tobytes()))
            vc.commit()
    return have

def derive(v, dims):
    # text-embedding-3 is trained so a prefix of the 3072-d vector, renormalised, IS the lower-dimension embedding (MRL)
    if len(v) == dims: return v
    x = v[:dims]; n = sum(t * t for t in x) ** 0.5 or 1
    return [t / n for t in x]

if __name__ == '__main__':
    index, model, dims, gran = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
    a = sys.argv[5:]
    base = int(a[a.index('--base') + 1]) if '--base' in a else (3072 if model.startswith('text-embedding-3') else dims)
    corpus = sqlite3.connect(os.path.join(DATA, os.environ.get('XL_CORPUS', 'corpus.db')))
    rows = corpus.execute("SELECT p.id, p.doc_id, p.idx, p.lang, p.text, d.title, d.author, COALESCE(p.raw, p.text) FROM para p JOIN doc d ON d.id=p.doc_id WHERE LENGTH(p.text) > 0 ORDER BY p.id").fetchall()
    if '--subset' in a:       # the battery test corpus: docs holding a target + random distractors (subset-docs.json)
        keep = set(json.load(open(os.path.join(DATA, 'subset-docs.json'))))
        rows = [r for r in rows if r[1] in keep]
    if '--paras' in a:        # paragraph-level test set (e.g. small-paras.json: every target + book paragraph + distractors)
        keep = set(json.load(open(os.path.join(DATA, a[a.index('--paras') + 1]))))
        rows = [r for r in rows if r[0] in keep]
    if '--docs' in a:
        keep = {d for (d,) in corpus.execute('SELECT id FROM doc ORDER BY id LIMIT ?', (int(a[a.index('--docs') + 1]),))}
        rows = [r for r in rows if r[1] in keep]
    print(index, model, dims, gran, '| paragraphs', len(rows), flush=True)
    def wait(task):        # Meili queues index operations — wait so create never races the delete
        while task and meili('GET', f"/tasks/{task['taskUid']}").get('status') in ('enqueued', 'processing'): time.sleep(0.5)
    try: wait(meili('DELETE', f'/indexes/{index}'))
    except Exception: pass
    wait(meili('POST', '/indexes', {'uid': index, 'primaryKey': 'id'}))
    settings = {'searchableAttributes': ['text_norm', 'text', 'title'], 'filterableAttributes': ['doc_id', 'language', 'author', 'paragraph_id'],
                'embedders': {'default': {'source': 'userProvided', 'dimensions': dims}}}
    if gran in ('sent', 'phr'): settings['distinctAttribute'] = 'paragraph_id'
    if '--lean' in a: settings['searchableAttributes'] = ['language']
    if '--bq' in a: settings['embedders']['default']['binaryQuantized'] = True     # as production: 1 bit per dimension     # one hit per paragraph = its best sentence
    meili('PATCH', f'/indexes/{index}/settings', settings)
    json.dump({'index': index, 'model': model, 'dims': dims, 'gran': gran}, open(os.path.join(DATA, f'index-{index}.json'), 'w'))
    nvec = 0
    for i in range(0, len(rows), 3000):                       # stream: embed → documents → Meili, then discard
        part = rows[i:i + 3000]
        if gran == 'phr':      # phrase units from the languages' own markers; each embedded WITH its neighbouring phrases
            phr = {r[0]: phrases(r[4], r[3]) for r in part}
            units = {pid: [anchored(ps, k) for k in range(len(ps))] for pid, ps in phr.items()}
            if '--fold' in a:  # embed the FOLDED text (vowels, Qur'anic marks, ZWNJ, letter variants); the hit still shows the raw phrase
                units = {pid: [bare(u) for u in us] for pid, us in units.items()}
            if '--ctx' in a:   # contextual header: the work and author lead each phrase's embedding text
                meta = {r[0]: f'{r[5] or ""} — {r[6] or ""}'.strip(' —') for r in part}
                units = {pid: [f'{meta[pid]}\n{u}' if meta[pid] else u for u in us] for pid, us in units.items()}
        else:
            units = {r[0]: (windows(r[4]) if gran == 'win' else sentences(r[7]) if gran == 'sent' else [r[4][:8000]]) for r in part}
        vecs = vectors([t for us in units.values() for t in us], model, base)
        if gran in ('sent', 'phr'):     # one document per unit → the exact passage; distinct by paragraph
            shown = phr if gran == 'phr' else units        # phr: the hit shows the PHRASE; its vector came from the anchored text
            docs = [{'id': r[0] * 1000 + k, 'paragraph_id': r[0], 'unit_index': k, 'doc_id': r[1], 'paragraph_index': r[2], 'language': r[3], 'title': r[5],
                     'author': r[6], 'text': shown[r[0]][k], 'text_norm': ' '.join(toks(shown[r[0]][k])), '_vectors': {'default': derive(vecs[u], dims)}}
                    for r in part for k, u in enumerate(units[r[0]][:999])]
        else:
            docs = [{'id': r[0], 'doc_id': r[1], 'paragraph_index': r[2], 'language': r[3], 'title': r[5], 'author': r[6], 'text': r[4],
                     'text_norm': ' '.join(toks(r[4])),
                     '_vectors': {'default': [derive(vecs[t], dims) for t in units[r[0]]] if gran == 'win' else derive(vecs[units[r[0]][0]], dims)}} for r in part]
        if '--lean' in a:      # sizing: a vectors-only phrase index (ids + filters, no text — text stays in the paragraph index)
            docs = [{k: v for k, v in d.items() if k in ('id', 'paragraph_id', 'unit_index', 'doc_id', 'language', '_vectors')} for d in docs]
        nvec += sum(len(u) for u in units.values())
        for j in range(0, len(docs), 500): meili('POST', f'/indexes/{index}/documents?primaryKey=id', docs[j:j + 500])
        print(f'{i + len(part)}/{len(rows)} paragraphs, {nvec} vectors', flush=True)
    while meili('GET', f'/tasks?indexUids={index}&statuses=enqueued,processing&limit=1').get('total'):   # every queued batch done
        time.sleep(10)
    st = meili('GET', f'/indexes/{index}/stats')
    print('indexed', st.get('numberOfDocuments'), 'vectors', nvec)
