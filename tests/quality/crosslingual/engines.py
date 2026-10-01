# Meili vs Qdrant on IDENTICAL data: the same phrase units, the same cached Gemini Embedding 2 vectors (vcache — no new
# spend), the same filters, the same batteries. Engines run on tower-nas; reached through an SSH tunnel.
#   build:  python3 engines.py build <ar|en> <name>          (loads BOTH engines: rmeili:<name> and qdrant:<name>)
#   search: battery.py / en_battery.py with option rmeili:<name> | qdrant:<name> | qdrant-norescore:<name>
# Env: RMEILI_URL (default http://127.0.0.1:17710), RMEILI_KEY, QDRANT_URL (default http://127.0.0.1:16333), QDRANT_KEY.
# Meili: binaryQuantized userProvided embedder, distinct paragraph_id (one hit per paragraph).
# Qdrant: vectors on disk, binary quantization pinned in RAM, query/groups by paragraph_id, rescore with oversampling.
import json, os, sqlite3, sys, time, array, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from battery import DATA
from phrases import phrases, anchored

MODEL, DIMS = 'gemini-embedding-2', 3072
RM, RK = os.environ.get('RMEILI_URL', 'http://127.0.0.1:17710'), os.environ.get('RMEILI_KEY', '')
QD, QK = os.environ.get('QDRANT_URL', 'http://127.0.0.1:16333'), os.environ.get('QDRANT_KEY', '')

def http(base, hdr, method, path, body=None, timeout=600):
    req = urllib.request.Request(base + path, json.dumps(body).encode() if body is not None else None, {'Content-Type': 'application/json', **hdr}, method=method)
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read() or b'{}')
meili = lambda m, p, b=None: http(RM, {'Authorization': f'Bearer {RK}'}, m, p, b)
qdrant = lambda m, p, b=None: http(QD, {'api-key': QK}, m, p, b)

def units_of(which):
    if which == 'ar':
        db = sqlite3.connect(os.path.join(DATA, 'corpus.db')); keep = set(json.load(open(os.path.join(DATA, 'small-paras.json'))))
        rows = [r for r in db.execute('SELECT id, doc_id, lang, text FROM para') if r[0] in keep and r[3]]
    else:
        db = sqlite3.connect(os.path.join(DATA, 'en.db'))
        rows = [r for r in db.execute("SELECT id, doc_id, 'en', text FROM para") if r[3]]
    out = []
    for pid, doc, lang, t in rows:
        ps = phrases(t, lang)
        out += [(pid * 1000 + k, pid, doc, lang, anchored(ps, k)) for k in range(min(len(ps), 999))]
    return out

def vectors(texts):
    vc = sqlite3.connect(os.path.join(DATA, 'vcache.db')); got = {}
    for i in range(0, len(texts), 500):
        part = texts[i:i + 500]
        for t, b in vc.execute(f"SELECT text, vec FROM v WHERE model=? AND dims=? AND text IN ({','.join('?' * len(part))})", [MODEL, DIMS] + part):
            got[t] = list(array.array('f', b))
    return got

def wait_meili(uid):
    while meili('GET', f'/tasks/{uid}').get('status') in ('enqueued', 'processing'): time.sleep(1)

def build(which, name):
    us = units_of(which); vec = vectors(list({u[4] for u in us}))
    us = [u for u in us if u[4] in vec]
    print(name, 'units', len(us), flush=True)
    # Meili
    try: wait_meili(meili('DELETE', f'/indexes/{name}')['taskUid'])
    except Exception: pass
    wait_meili(meili('POST', '/indexes', {'uid': name, 'primaryKey': 'id'})['taskUid'])
    wait_meili(meili('PATCH', f'/indexes/{name}/settings', {'searchableAttributes': ['language'], 'distinctAttribute': 'paragraph_id',
        'filterableAttributes': ['paragraph_id', 'doc_id', 'language'], 'embedders': {'default': {'source': 'userProvided', 'dimensions': DIMS, 'binaryQuantized': True}}})['taskUid'])
    # Qdrant
    try: qdrant('DELETE', f'/collections/{name}')
    except Exception: pass
    qdrant('PUT', f'/collections/{name}', {'vectors': {'size': DIMS, 'distance': 'Cosine', 'on_disk': True},
                                          'quantization_config': {'binary': {'always_ram': True}}})
    for f, t in (('paragraph_id', 'integer'), ('doc_id', 'integer'), ('language', 'keyword')):
        qdrant('PUT', f'/collections/{name}/index?wait=true', {'field_name': f, 'field_schema': t})
    t0 = time.time(); last = None
    for i in range(0, len(us), 500):
        part = us[i:i + 500]
        last = meili('POST', f'/indexes/{name}/documents?primaryKey=id', [{'id': u[0], 'paragraph_id': u[1], 'doc_id': u[2], 'language': u[3], '_vectors': {'default': vec[u[4]]}} for u in part])['taskUid']
    wait_meili(last); tm = time.time() - t0
    t0 = time.time()
    for i in range(0, len(us), 256):
        part = us[i:i + 256]
        qdrant('PUT', f'/collections/{name}/points?wait=true', {'points': [{'id': u[0], 'vector': vec[u[4]], 'payload': {'paragraph_id': u[1], 'doc_id': u[2], 'language': u[3]}} for u in part]})
    while qdrant('GET', f'/collections/{name}')['result'].get('status') != 'green': time.sleep(2)   # optimizer/HNSW done
    tq = time.time() - t0
    print(json.dumps({'name': name, 'units': len(us), 'meili_index_s': round(tm), 'qdrant_index_s': round(tq)}), flush=True)

def make(option):
    from battery import embed
    eng, name = option.split(':', 1)
    def search(case, scope, k=10):
        if scope == 'library': raise RuntimeError('production-only scope')
        v = embed(case['query'], MODEL, DIMS)
        docs = case.get('book_docs') if scope == 'book' else None
        if eng in ('rmeili', 'rmeili-rescore'):
            n = 100 if eng == 'rmeili-rescore' else k        # rescore: Meili's top 100 (one best unit per paragraph)
            body = {'q': '', 'vector': v, 'hybrid': {'semanticRatio': 1.0, 'embedder': 'default'}, 'limit': n, 'attributesToRetrieve': ['id', 'paragraph_id']}
            if docs: body['filter'] = f"doc_id IN [{', '.join(map(str, docs))}]"
            r = meili('POST', f'/indexes/{name}/search', body)
            search.server_ms.append(r.get('processingTimeMs', 0))
            hits = r['hits']
            if eng == 'rmeili-rescore':                          # app-side: full-precision cosine from OUR vector store
                q = v; qn = sum(x * x for x in q) ** .5
                def cos(h):
                    f = search.floats.get(int(h['id']))
                    return sum(a * b for a, b in zip(q, f)) / (qn * (sum(x * x for x in f) ** .5)) if f else -1
                hits = sorted(hits, key=cos, reverse=True)[:k]
            return [int(h['paragraph_id']) for h in hits]
        body = {'query': v, 'group_by': 'paragraph_id', 'limit': k, 'group_size': 1, 'with_payload': False,
                'params': {'quantization': {'rescore': eng == 'qdrant', 'oversampling': 4.0}}}
        if docs: body['filter'] = {'must': [{'key': 'doc_id', 'match': {'any': docs}}]}
        r = qdrant('POST', f'/collections/{name}/points/query/groups', body)
        search.server_ms.append(round(r.get('time', 0) * 1000, 1))
        return [int(g['id']) for g in r['result']['groups']]
    search.server_ms = []
    if eng == 'rmeili-rescore':                              # unit id → full vector (stands in for the /tank vector store)
        us = units_of('ar' if name.endswith('_ar') else 'en'); vec = vectors(list({u[4] for u in us}))
        search.floats = {u[0]: vec[u[4]] for u in us if u[4] in vec}
    return search

if __name__ == '__main__':
    if sys.argv[1] == 'build': build(sys.argv[2], sys.argv[3])
