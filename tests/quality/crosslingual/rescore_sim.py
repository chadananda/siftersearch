# Offline, free: how much does RESCORING recover over binary-quantized vector search? (Qdrant rescores; Meili cannot.)
# Same small test set and battery as sm_gem_v3; exact (brute-force) search so graph approximation is excluded.
#   float  = exact cosine on full 3072-d vectors (upper bound)
#   binary = exact Hamming on sign bits (best case for Meili binaryQuantized)
#   resc×N = binary top-N phrases, then exact cosine rescoring (Qdrant-style oversampling)
# Run with the scratchpad venv (numpy): XL/venv/bin/python rescore_sim.py
import json, os, sqlite3, sys, array
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from battery import DATA, correct, FX
from phrases import phrases, anchored

keep = set(json.load(open(os.path.join(DATA, 'small-paras.json'))))
corpus = sqlite3.connect(os.path.join(DATA, 'corpus.db')); vc = sqlite3.connect(os.path.join(DATA, 'vcache.db')); qc = sqlite3.connect(os.path.join(DATA, 'qcache.db'))
texts, units = {}, []          # units: (paragraph_id, doc_id, anchored text)
for pid, doc, lang, t in corpus.execute('SELECT id, doc_id, lang, text FROM para'):
    if pid not in keep or not t: continue
    texts[pid] = t
    ps = phrases(t, lang); units += [(pid, doc, anchored(ps, k)) for k in range(len(ps))]
vec = {}
uniq = list({u[2] for u in units})
for i in range(0, len(uniq), 500):
    part = uniq[i:i + 500]
    for t, b in vc.execute(f"SELECT text, vec FROM v WHERE model='gemini-embedding-001' AND dims=3072 AND text IN ({','.join('?' * len(part))})", part):
        vec[t] = np.frombuffer(b, dtype=np.float32)
units = [u for u in units if u[2] in vec]
F = np.stack([vec[u[2]] for u in units]); F /= np.linalg.norm(F, axis=1, keepdims=True)
B = np.packbits(F > 0, axis=1)
PID = np.array([u[0] for u in units]); DOC = np.array([u[1] for u in units])
print('units', len(units), flush=True)
POP = np.array([bin(i).count('1') for i in range(256)], dtype=np.uint16)

def distinct_top(order, k=10):
    seen, out = set(), []
    for i in order:
        p = PID[i]
        if p not in seen: seen.add(p); out.append(p)
        if len(out) == k: break
    return out

cases = [c for c in json.load(open(FX))['cases'] if c['kind'] in ('phrase', 'sentence', 'citation')]
res = {}
for c in cases:
    r = qc.execute("SELECT vec FROM q WHERE model='gemini-embedding-001' AND dims=3072 AND text=?", (c['query'],)).fetchone()
    if not r: continue
    q = np.array(json.loads(r[0]), dtype=np.float32); q /= np.linalg.norm(q)
    qb = np.packbits(q > 0)
    for scope in ('book', 'originals'):
        if scope == 'book' and not c.get('book_docs'): continue
        idx = np.where(np.isin(DOC, c['book_docs']))[0] if scope == 'book' else np.arange(len(units))
        cos = F[idx] @ q
        ham = POP[np.bitwise_xor(B[idx], qb)].sum(axis=1)
        runs = {'float': idx[np.argsort(-cos)[:2000]], 'binary': idx[np.argsort(ham, kind='stable')[:2000]]}
        hb = np.argsort(ham, kind='stable')
        for n in (100, 400, 1000):
            cand = hb[:n]; runs[f'resc×{n}'] = idx[cand[np.argsort(-cos[cand])]]
        for m, order in runs.items():
            top = distinct_top(order)
            rank = next((k + 1 for k, p in enumerate(top) if correct(texts[p], c['target'])), None)
            res.setdefault((scope, m), []).append(rank)
for (scope, m), rk in sorted(res.items()):
    n = len(rk)
    print(f'{scope:9} {m:9} n={n} @1 {sum(r == 1 for r in rk) / n:.1%} @10 {sum(bool(r) for r in rk) / n:.1%}')
