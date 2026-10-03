#!/usr/bin/env python3
# Export logged System-1 (Jev) calls as Laya fine-tuning records {state, questions, gold} — gold = Jev's probability
# distribution (soft targets). ONE dataset per decision type (Chad: separate Laya training per task type): the task name
# plus the question key, e.g. paragraph-attribution:speaker, paragraph-attribution:role. 10% held out (by hash of the
# call id) to score a tuned Laya against Jev before any switch. Reads /tank/sifter/systemone/calls.db (read-only).
#   python3 scripts/authorship/export-laya.py <out-dir> [task …]
import hashlib, json, os, sqlite3, sys
from collections import Counter

out = sys.argv[1]
tasks = sys.argv[2:] or ['paragraph-attribution']
os.makedirs(out, exist_ok=True)
db = sqlite3.connect('file:/tank/sifter/systemone/calls.db?mode=ro', uri=True)
files, counts = {}, Counter()
for task in tasks:
    for cid, state, questions, jev in db.execute('SELECT id, state, questions, jev FROM calls WHERE task = ? AND jev IS NOT NULL', (task,)):
        try:
            qs, ans = json.loads(questions), json.loads(jev)
        except Exception:
            continue
        for key, q in qs.items():
            a = ans.get(key) or {}
            probs = a.get('probabilities')
            if not probs or q.get('type') != 'choice':
                continue
            kind = f'{task}:{key}'
            split = 'eval' if int(hashlib.sha1(str(cid).encode()).hexdigest(), 16) % 10 == 0 else 'train'
            rec = {'state': {'text': state}, 'questions': {key: q}, 'gold': {key: probs}}
            path = os.path.join(out, f'{kind.replace(":", "__")}.{split}.jsonl')
            if path not in files:
                files[path] = open(path, 'w', encoding='utf-8')
            files[path].write(json.dumps(rec, ensure_ascii=False) + '\n')
            counts[(kind, split)] += 1
for f in files.values():
    f.close()
print(json.dumps({f'{k}/{s}': n for (k, s), n in sorted(counts.items())}, ensure_ascii=False))
