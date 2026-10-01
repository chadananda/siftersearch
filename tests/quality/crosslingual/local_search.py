# Search adapter for battery.py against a LOCAL Meili index built by build_local.py ("local:<index>").
# The local corpus is the Bahá'í ar/fa originals only, so 'originals' = the whole index; 'library' is production-only.
import json, os, urllib.request
from battery import DATA, embed

MEILI, MKEY = 'http://127.0.0.1:7701', 'local-xl'

def make(option):
    index = option.split(':', 1)[1]
    meta = json.load(open(os.path.join(DATA, f'index-{index}.json')))
    def search(case, scope, k=10):
        if scope == 'library': raise RuntimeError('library scope is production-only')
        v = embed(case['query'], meta['model'], meta['dims'])
        body = {'q': '', 'vector': v, 'hybrid': {'semanticRatio': 1.0, 'embedder': 'default'}, 'limit': k, 'attributesToRetrieve': ['id', 'paragraph_id', 'text']}
        if scope == 'book': body['filter'] = f"doc_id IN [{', '.join(map(str, case['book_docs']))}]"
        req = urllib.request.Request(f'{MEILI}/indexes/{index}/search', json.dumps(body).encode(),
                                     {'Authorization': f'Bearer {MKEY}', 'Content-Type': 'application/json'})
        hits = json.loads(urllib.request.urlopen(req, timeout=60).read())['hits']
        # sentence index: the hit IS the exact passage; report its paragraph for judging and keep the unit text
        search.units[(case['id'], scope)] = [h.get('text') for h in hits] if meta['gran'] in ('sent', 'phr') else None
        return [int(h.get('paragraph_id') or h['id']) for h in hits]
    search.units = {}
    return search
