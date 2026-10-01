# Cross-lingual search battery: English query → the original-language (Arabic/Persian) passage.
# Fixtures: tests/quality/crosslingual-fixtures.json (CTAI verified pairs, Súriy-i-Haykal «ب N» ↔ Summons [1.N], hand-sourced
# Shoghi Effendi citations). A hit is CORRECT when its full text overlaps the target original (letter-normalised 4-grams,
# ≥30% of the shorter side) — judged by text, never by our ids. Full paragraph texts come from a local copy of the
# Bahá'í ar/fa corpus (XL_DATA/corpus.db, same content ids as production).
# Usage: python3 battery.py <option> [--limit N] [--scopes book,originals,library]
#   option: prod  (production paragraphs index via /api/admin/server/meili-vector; 3-large@512, binary-quantized)
#           local:<index>  (local Meili, built by build_local.py)
import json, os, re, sys, sqlite3, subprocess, threading, time, urllib.request, urllib.error, concurrent.futures as cf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DATA = os.environ.get('XL_DATA', '/private/tmp/claude-501/-Users-chad-Dropbox-Public-JS-Projects-siftersearch-com/8724669c-aaa3-43b1-ba6f-921ec0f4512c/scratchpad/xl')
API_SH = os.environ.get('XL_API_SH', os.path.join(os.path.dirname(DATA), 'api.sh'))
FX = os.path.join(ROOT, 'tests/quality/crosslingual-fixtures.json')
SEC = open(os.path.join(ROOT, '.env-secrets')).read()
KEY = lambda n: next(l.split('=', 1)[1].strip().strip('"\'') for l in SEC.splitlines() if l.startswith(n + '='))
corpus = sqlite3.connect(os.path.join(DATA, os.environ.get('XL_CORPUS', 'corpus.db')), check_same_thread=False)
cache = sqlite3.connect(os.path.join(DATA, 'qcache.db'), check_same_thread=False, timeout=300)
LOCK = threading.Lock()     # one sqlite connection is shared by the worker threads
cache.execute('CREATE TABLE IF NOT EXISTS q (model TEXT, dims INT, text TEXT, vec TEXT, PRIMARY KEY (model, dims, text))')

DROP = re.compile(r'[ً-ٰٟۡـ‌‏‎]')
MAP = str.maketrans({'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ؤ': 'و', 'ئ': 'ی', 'ٱ': 'ا'})

def toks(s):
    s = DROP.sub('', re.sub(r'⁅/?s\d+⁆|<[^>]+>|\[[^\]]*\]', ' ', s or '')).translate(MAP)
    return re.sub(r'[^\w\s]', ' ', s).split()

def grams(w, n=4):
    return {' '.join(w[i:i + n]) for i in range(max(1, len(w) - n + 1))} if w else set()

def correct(hit_text, target):
    a, b = toks(hit_text), toks(target)
    n = 4 if min(len(a), len(b)) >= 8 else 2
    ga, gb = grams(a, n), grams(b, n)
    if not ga or not gb: return False
    small, big = (ga, gb) if len(ga) <= len(gb) else (gb, ga)
    return len(small & big) / len(small) >= 0.3

def embed(text, model='text-embedding-3-large', dims=512, kind='query'):
    for attempt in range(5):              # transient network errors (connection reset) must not kill a run
        try: return _embed(text, model, dims)
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if attempt == 4: raise
            time.sleep(2 * (attempt + 1))

def _embed(text, model, dims):
    with LOCK: r = cache.execute('SELECT vec FROM q WHERE model=? AND dims=? AND text=?', (model, dims, text)).fetchone()
    if r: return json.loads(r[0])
    if model.startswith('text-embedding'):
        req = urllib.request.Request('https://api.openai.com/v1/embeddings', json.dumps({'model': model, 'dimensions': dims, 'input': text}).encode(),
                                     {'Authorization': f"Bearer {KEY('OPENAI_API_KEY')}", 'Content-Type': 'application/json'})
        v = json.loads(urllib.request.urlopen(req, timeout=60).read())['data'][0]['embedding']
    elif model == 'gemini-embedding-2':     # task given as a prompt prefix (no taskType parameter)
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={KEY('GEMINI_API_KEY')}",
                                     json.dumps({'content': {'parts': [{'text': f'task: search result | query: {text}'}]}, 'outputDimensionality': dims}).encode(),
                                     {'Content-Type': 'application/json'})
        v = json.loads(urllib.request.urlopen(req, timeout=60).read())['embedding']['values']
    elif model.startswith('gemini'):
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={KEY('GEMINI_API_KEY')}",
                                     json.dumps({'content': {'parts': [{'text': text}]}, 'taskType': 'RETRIEVAL_QUERY', 'outputDimensionality': dims}).encode(),
                                     {'Content-Type': 'application/json'})
        v = json.loads(urllib.request.urlopen(req, timeout=60).read())['embedding']['values']
    elif model.startswith('voyage'):
        req = urllib.request.Request('https://api.voyageai.com/v1/embeddings', json.dumps({'model': model, 'input': [text], 'input_type': 'query', 'output_dimension': dims}).encode(),
                                     {'Authorization': f"Bearer {KEY('VOYAGE_API_KEY')}", 'Content-Type': 'application/json'})
        v = json.loads(urllib.request.urlopen(req, timeout=60).read())['data'][0]['embedding']
    elif model.startswith('local/'):          # local open model via embed_server.py (port 7711)
        req = urllib.request.Request('http://127.0.0.1:7711/embed', json.dumps({'model': model[6:], 'texts': [text], 'kind': 'query'}).encode(), {'Content-Type': 'application/json'})
        v = json.loads(urllib.request.urlopen(req, timeout=300).read())['vectors'][0]
    else:
        raise ValueError(model)
    with LOCK: cache.execute('INSERT OR REPLACE INTO q VALUES (?,?,?,?)', (model, dims, text, json.dumps(v))); cache.commit()
    return v

SCOPE_FILTER = {'originals': 'religion = "Baha\'i" AND language IN [ar, fa]', 'library': None}

def search_prod(case, scope, k=10):
    v = embed(case['query'], 'text-embedding-3-large', 512)
    f = f"doc_id IN [{', '.join(map(str, case['book_docs']))}]" if scope == 'book' else SCOPE_FILTER[scope]
    body = json.dumps({'vectors': [v], 'filter': f, 'limit': k})
    r = json.loads(subprocess.run(['bash', API_SH, 'POST', '/api/admin/server/meili-vector', body], capture_output=True, text=True).stdout or '{}')
    return [int(h['id']) for h in (r.get('results') or [[]])[0]]

def run(cases, scopes, search, workers=4):
    def one(args):
        c, s = args
        if s == 'book' and not c.get('book_docs'): return None
        t0 = time.time()
        try: ids = search(c, s)
        except Exception as e: return {'id': c['id'], 'source': c['source'], 'kind': c['kind'], 'scope': s, 'error': str(e)[:160]}
        ms = (time.time() - t0) * 1000
        with LOCK: texts = dict(corpus.execute(f"SELECT id, text FROM para WHERE id IN ({','.join('?' * len(ids))})", ids).fetchall()) if ids else {}
        rank = next((k + 1 for k, i in enumerate(ids) if i in texts and correct(texts[i], c['target'])), None)
        row = {'id': c['id'], 'source': c['source'], 'kind': c['kind'], 'scope': s, 'rank': rank, 'ms': round(ms)}
        units = getattr(search, 'units', {}).get((c['id'], s))      # phrase/sentence index: did the RETURNED UNIT hold the target?
        if units: row['unit_rank'] = next((k + 1 for k, u in enumerate(units) if u and correct(u, c['target'])), None)
        return row
    with cf.ThreadPoolExecutor(workers) as ex:
        return [r for r in ex.map(one, [(c, s) for c in cases for s in scopes]) if r]

def report(option, rows):
    def agg(rs):
        ok = [r for r in rs if 'error' not in r]
        if not ok: return {'n': 0, 'errors': len(rs)}
        rk = [r['rank'] for r in ok]
        return {'n': len(ok), 'hit@1': round(sum(1 for x in rk if x == 1) / len(ok), 3), 'hit@5': round(sum(1 for x in rk if x and x <= 5) / len(ok), 3),
                'hit@10': round(sum(1 for x in rk if x) / len(ok), 3), 'mrr': round(sum(1 / x for x in rk if x) / len(ok), 3),
                'p50ms': sorted(r['ms'] for r in ok)[len(ok) // 2], 'errors': len(rs) - len(ok),
                **({'exact_phrase@1': round(sum(1 for r in ok if r.get('unit_rank') == 1) / len(ok), 3)} if any('unit_rank' in r for r in ok) else {})}
    groups = {}
    for key in sorted({(r['scope'], r['kind']) for r in rows}):
        groups[f'{key[0]}/{key[1]}'] = agg([r for r in rows if (r['scope'], r['kind']) == key])
    for s in sorted({r['scope'] for r in rows}):
        groups[f'{s}/ALL'] = agg([r for r in rows if r['scope'] == s])
    return {'option': option, 'at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'groups': groups}

if __name__ == '__main__':
    option, a = sys.argv[1], sys.argv[2:]
    lim = int(a[a.index('--limit') + 1]) if '--limit' in a else None
    scopes = a[a.index('--scopes') + 1].split(',') if '--scopes' in a else ['book', 'originals', 'library']
    cases = json.load(open(FX))['cases']
    cases = cases[:lim] if lim else cases
    if '--kinds' in a: cases = [c for c in cases if c['kind'] in a[a.index('--kinds') + 1].split(',')]
    if option == 'prod':
        search = search_prod
    else:
        sys.path.insert(0, os.path.dirname(__file__))
        if option.split(':')[0] in ('rmeili', 'rmeili-rescore', 'qdrant', 'qdrant-norescore'):
            import engines; search = engines.make(option)
        else:
            import local_search; search = local_search.make(option)
    rows = run(cases, scopes, search)
    rep = report(option, rows)
    json.dump({'report': rep, 'rows': rows}, open(os.path.join(DATA, f"result-{option.replace(':', '_')}.json"), 'w'), ensure_ascii=False, indent=1)
    for g, v in rep['groups'].items(): print(f'{g:30} {v}')
    if getattr(search, 'server_ms', None):   # engine-side time, network excluded
        ms = sorted(search.server_ms); print(f"server ms p50 {ms[len(ms) // 2]} p95 {ms[int(len(ms) * .95)]} p99 {ms[int(len(ms) * .99)]}")
