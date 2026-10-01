# English battery: does phrase granularity beat paragraph granularity for ENGLISH search (topical + quotation)?
# Corpus: XL_DATA/en.db (292 English Bahá'í docs, ~26.6k paragraphs; fetched by xl/fetch_en.py). Whole-corpus scope.
# Query sets (all judged by TEXT, never by our ids):
#   hype      — a stored HyPE question → its own paragraph (or an identical copy elsewhere)
#   exact / lay — tests/quality/search-type-fixtures.json exact_phrase + lay_paraphrase (expect.hit text + title)
#   fixture   — tests/quality/search-fixtures.json cases with expected docs (doc + expected_text_contains)
# Usage: XL_CORPUS=en.db python3 en_battery.py local:<index> [--n-hype 400]
import json, os, random, re, sqlite3, sys, time, concurrent.futures as cf
os.environ.setdefault('XL_CORPUS', 'en.db')
from battery import DATA, correct
import local_search

Q = os.path.join(os.path.dirname(__file__), '..')
db = sqlite3.connect(os.path.join(DATA, 'en.db'), check_same_thread=False)
TEXT = dict(db.execute('SELECT id, text FROM para'))
DOC = dict(db.execute('SELECT id, doc_id FROM para'))
TITLE = dict(db.execute('SELECT id, title FROM doc'))

def cases(n_hype):
    out = []
    rows = db.execute("SELECT id, hyp FROM para WHERE hyp IS NOT NULL AND hyp != 'None' ORDER BY id").fetchall()
    random.seed(5); random.shuffle(rows)
    for pid, h in rows[:n_hype]:
        try: qs = [q for q in json.loads(h) if isinstance(q, str) and len(q.split()) >= 4]
        except Exception: continue
        if qs: out.append({'set': 'hype', 'query': qs[0], 'target': TEXT[pid]})
    for x in json.load(open(os.path.join(Q, 'search-type-fixtures.json')))['fixtures']:
        if x['type'] in ('exact_phrase', 'lay_paraphrase') and x.get('expect', {}).get('hit'):
            out.append({'set': 'exact' if x['type'] == 'exact_phrase' else 'lay', 'query': x['query'], 'hit': x['expect']['hit']})
    for x in json.load(open(os.path.join(Q, 'search-fixtures.json'))):
        ids = x.get('expected_doc_ids') or ([x['expected_doc_id']] if x.get('expected_doc_id') else [])
        if ids: out.append({'set': 'fixture', 'query': x['query'], 'docs': ids, 'contains': x.get('expected_text_contains') or []})
    return out

def ok(c, pid):
    t = TEXT.get(pid) or ''
    if c['set'] == 'hype': return correct(t, c['target'])
    if c['set'] in ('exact', 'lay'):
        h = c['hit']
        if h.get('text') and not re.search(h['text'], t, re.I): return False
        if h.get('title') and not re.search(h['title'], (TITLE.get(DOC.get(pid)) or '').lower()): return False
        return True
    return DOC.get(pid) in c['docs'] and all(w.lower() in t.lower() for w in c['contains'])

if __name__ == '__main__':
    option, a = sys.argv[1], sys.argv[2:]
    n = int(a[a.index('--n-hype') + 1]) if '--n-hype' in a else 400
    if option.split(':')[0] in ('rmeili', 'rmeili-rescore', 'qdrant', 'qdrant-norescore'):
        import engines; search = engines.make(option)
    else: search = local_search.make(option)
    cs = cases(n)
    def one(c):
        t0 = time.time(); ids = search({'id': c['query'], 'query': c['query']}, 'all')
        return c['set'], next((k + 1 for k, i in enumerate(ids) if ok(c, i)), None), (time.time() - t0) * 1000
    with cf.ThreadPoolExecutor(4) as ex: rows = list(ex.map(one, cs))
    res = {}
    for s in sorted({r[0] for r in rows}) + ['ALL']:
        rs = [r for r in rows if s == 'ALL' or r[0] == s]; k = len(rs)
        res[s] = {'n': k, '@1': round(sum(r[1] == 1 for r in rs) / k, 3), '@10': round(sum(bool(r[1]) for r in rs) / k, 3),
                  'mrr': round(sum(1 / r[1] for r in rs if r[1]) / k, 3)}
        print(f'{s:8}', res[s])
    if getattr(search, 'server_ms', None):
        ms = sorted(search.server_ms); print(f"server ms p50 {ms[len(ms) // 2]} p95 {ms[int(len(ms) * .95)]} p99 {ms[int(len(ms) * .99)]}")
    json.dump({'option': option, 'groups': res, 'rows': rows}, open(os.path.join(DATA, f"en-result-{option.replace(':', '_')}.json"), 'w'))
