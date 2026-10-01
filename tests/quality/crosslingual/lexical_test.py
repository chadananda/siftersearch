# Keyword (lexical) retrieval without Meili? Same paragraphs, same queries, three engines:
#   meili   — local Meili keyword search (default settings, as production's keyword layer)
#   fts5    — SQLite FTS5 (unicode61, diacritics removed) over our folded text, bm25() ranking; AND first, then OR
#   qdrant  — Qdrant sparse vectors with modifier=idf (BM25), tokens/TF computed by us with the same folding
# Corpus: XL/en.db (26.6k English paragraphs) + the ar/fa small test set (19.5k paragraphs).
# Queries: en_battery exact/lay/fixture cases + 300 English and 300 Arabic/Persian verbatim fragments (6–9 words) taken
# from real paragraphs — English lowercased without punctuation; Arabic/Persian with vowel marks stripped and ی/ي, ک/ك
# swapped (how people type). Judged by text (battery.correct) — a duplicate copy of the passage counts.
# Usage: python3 lexical_test.py build | run <meili|fts5|qdrant>
import json, os, random, re, sqlite3, sys, time, unicodedata, zlib, collections, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from battery import DATA, correct
from phrases import bare
import en_battery

MEILI, MKEY = 'http://127.0.0.1:7701', 'local-xl'
QD, QK = os.environ.get('QDRANT_URL', 'http://127.0.0.1:16333'), os.environ.get('QDRANT_KEY', '')
FTS = os.path.join(DATA, 'lexical-fts.db')

def fold(t):                       # Latin diacritics off, Arabic-script variants folded, lowercase
    t = unicodedata.normalize('NFKD', bare(t or ''))
    return ''.join(c for c in t if not unicodedata.combining(c)).lower()
def toks(t): return re.findall(r'\w+', fold(t))

def corpus():
    rows = [(pid, t) for pid, t in sqlite3.connect(os.path.join(DATA, 'en.db')).execute('SELECT id, text FROM para') if t]
    keep = set(json.load(open(os.path.join(DATA, 'small-paras.json'))))
    rows += [(pid, t) for pid, t in sqlite3.connect(os.path.join(DATA, 'corpus.db')).execute('SELECT id, text FROM para') if pid in keep and t]
    return rows

def http(base, hdr, m, p, b=None):
    r = urllib.request.Request(base + p, json.dumps(b).encode() if b is not None else None, {'Content-Type': 'application/json', **hdr}, method=m)
    return json.loads(urllib.request.urlopen(r, timeout=600).read() or b'{}')
meili = lambda m, p, b=None: http(MEILI, {'Authorization': f'Bearer {MKEY}'}, m, p, b)
qdrant = lambda m, p, b=None: http(QD, {'api-key': QK}, m, p, b)
tid = lambda w: zlib.crc32(w.encode())          # stable token id for sparse vectors

def build():
    rows = corpus(); print('paragraphs', len(rows), flush=True)
    # FTS5
    if os.path.exists(FTS): os.remove(FTS)
    f = sqlite3.connect(FTS); f.execute("CREATE VIRTUAL TABLE p USING fts5(text, tokenize='unicode61 remove_diacritics 2')")
    f.executemany('INSERT INTO p(rowid, text) VALUES (?, ?)', [(pid, fold(t)) for pid, t in rows]); f.commit()
    # Meili (keyword only)
    try: meili('DELETE', '/indexes/lex_test')
    except Exception: pass
    time.sleep(2); meili('POST', '/indexes', {'uid': 'lex_test', 'primaryKey': 'id'}); time.sleep(2)
    meili('PATCH', '/indexes/lex_test/settings', {'searchableAttributes': ['text']})
    for i in range(0, len(rows), 2000): t = meili('POST', '/indexes/lex_test/documents?primaryKey=id', [{'id': pid, 'text': t} for pid, t in rows[i:i + 2000]])
    while meili('GET', f"/tasks/{t['taskUid']}")['status'] in ('enqueued', 'processing'): time.sleep(2)
    # Qdrant BM25 (document side: saturated TF with length normalisation; IDF applied by Qdrant at query time)
    try: qdrant('DELETE', '/collections/lex_test')
    except Exception: pass
    qdrant('PUT', '/collections/lex_test', {'vectors': {}, 'sparse_vectors': {'bm25': {'modifier': 'idf'}}})
    lens = {pid: len(toks(t)) for pid, t in rows}; avg = sum(lens.values()) / len(lens); k, b = 1.2, 0.75
    pts = []
    for pid, t in rows:
        tf = collections.Counter(tid(w) for w in toks(t))
        if not tf: continue
        norm = k * (1 - b + b * lens[pid] / avg)
        ids = sorted(tf); pts.append({'id': pid, 'vector': {'bm25': {'indices': ids, 'values': [tf[i] * (k + 1) / (tf[i] + norm) for i in ids]}}})
        if len(pts) == 500: qdrant('PUT', '/collections/lex_test/points?wait=true', {'points': pts}); pts = []
    if pts: qdrant('PUT', '/collections/lex_test/points?wait=true', {'points': pts})
    print('built', flush=True)

def cases():
    random.seed(17); out = []
    for c in en_battery.cases(0):                     # exact / lay / fixture (no HyPE — that is semantic)
        out.append(c)
    en = [(pid, t) for pid, t in sqlite3.connect(os.path.join(DATA, 'en.db')).execute('SELECT id, text FROM para') if t and len(t.split()) >= 20]
    keep = set(json.load(open(os.path.join(DATA, 'small-paras.json'))))
    ar = [(pid, t) for pid, t in sqlite3.connect(os.path.join(DATA, 'corpus.db')).execute('SELECT id, text FROM para') if pid in keep and t and len(t.split()) >= 20]
    swap = str.maketrans({'ي': 'ی', 'ی': 'ي', 'ك': 'ک', 'ک': 'ك'})
    for pool, setname in ((en, 'en-fragment'), (ar, 'ar-fragment')):
        for pid, t in random.sample(pool, 300):
            w = t.split(); n = random.randint(6, 9); s = random.randint(0, len(w) - n)
            frag = ' '.join(w[s:s + n])
            if setname == 'en-fragment': q = re.sub(r'[^\w\s]', '', frag).lower()
            else: q = re.sub(r'[ً-ٰٟ]', '', frag).translate(swap) if random.random() < 0.5 else re.sub(r'[ً-ٰٟ]', '', frag)
            out.append({'set': setname, 'query': q, 'target': t})
    return out

TEXTS = None
def proximity(q, ids, k):          # word order: re-sort candidates by how many of the query's word PAIRS occur in order
    global TEXTS
    if TEXTS is None: TEXTS = {pid: fold(t) for pid, t in corpus()}
    qt = toks(q); pairs = {' '.join(qt[i:i + 2]) for i in range(len(qt) - 1)}
    def score(i):
        t = ' '.join(re.findall(r'\w+', TEXTS.get(i, ''))); return sum(p in t for p in pairs)
    return sorted(ids, key=lambda i: -score(i))[:k]   # stable: ties keep BM25 order

def search(engine, q, k=10):
    if engine.endswith('+prox'):
        return proximity(q, search(engine[:-5], q, 50), k)
    if engine == 'meili':
        return [h['id'] for h in meili('POST', '/indexes/lex_test/search', {'q': q, 'limit': k, 'attributesToRetrieve': ['id']})['hits']]
    if engine == 'fts5':
        f = sqlite3.connect(FTS); ws = [w for w in toks(q) if len(w) > 1]
        if not ws: return []
        out = []
        for expr in ('"' + ' '.join(ws) + '"', ' AND '.join(f'"{w}"' for w in ws), ' OR '.join(f'"{w}"' for w in ws)):   # exact phrase, all words, any word
            out += [x for (x,) in f.execute(f'SELECT rowid FROM p WHERE p MATCH ? ORDER BY bm25(p) LIMIT {k}', (expr,)) if x not in out]
            if len(out) >= k: break
        return out[:k]
    ids = sorted({tid(w) for w in toks(q)})
    if not ids: return []
    r = qdrant('POST', '/collections/lex_test/points/query', {'query': {'indices': ids, 'values': [1.0] * len(ids)}, 'using': 'bm25', 'limit': k})
    return [p['id'] for p in r['result']['points']]

def run(engine):
    TEXT = {**dict(sqlite3.connect(os.path.join(DATA, 'en.db')).execute('SELECT id, text FROM para')), **dict(sqlite3.connect(os.path.join(DATA, 'corpus.db')).execute('SELECT id, text FROM para'))}
    res = collections.defaultdict(list); lat = []
    for c in cases():
        t0 = time.time(); ids = search(engine, c['query']); lat.append((time.time() - t0) * 1000)
        judge = (lambda i: correct(TEXT.get(i) or '', c['target'])) if 'target' in c else (lambda i: en_battery.ok(c, i))
        res[c['set']].append(next((k + 1 for k, i in enumerate(ids) if judge(i)), None))
    for s, rk in sorted(res.items()):
        n = len(rk); print(f'{engine:7} {s:12} n={n:3} @1 {sum(r == 1 for r in rk) / n:.1%} @10 {sum(bool(r) for r in rk) / n:.1%}')
    lat.sort(); print(f'{engine:7} latency p50 {lat[len(lat) // 2]:.1f} ms p95 {lat[int(len(lat) * .95)]:.1f} ms (client-side, incl. tunnel for qdrant)')

if __name__ == '__main__':
    build() if sys.argv[1] == 'build' else run(sys.argv[2])
