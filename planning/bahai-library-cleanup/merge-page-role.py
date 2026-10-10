# Merge the rule retire list with the Clef+Jev page-role verdicts (page-role-v3) → final retire list + review queue.
#   python3 merge-page-role.py <page-role-all.jsonl>
# Rule: a page leaves search only when it is NOT the work itself.
#   - listing / inventory rule hits: retired unless BOTH models say 'document' (→ review, never retired on rules alone)
#   - numeric-alias / url-variant: duplicates of a named page → retired whatever the role
#   - pages the rules kept: retired only when BOTH models say metadata/navigation ('both-not-document')
import json, sys, collections
D = '/Users/chad/Dropbox/Public/JS/Projects/siftersearch.com/planning/bahai-library-cleanup/'
rule = {int(l.split('\t')[0]): l.split('\t')[1].strip() for l in open(D + 'retire-ids-20261009.tsv').read().splitlines()[1:]}
meta = {int(c[0]): c for c in (l.split('\t') for l in open(D + 'doc-classes-20261009.tsv').read().splitlines()[1:])}
vs = {r['doc_id']: r for r in map(json.loads, open(sys.argv[1])) if r.get('role')}
retire, review, n = [], [], collections.Counter()
for doc_id, c in meta.items():
    v = vs.get(doc_id); clef, jev = (v or {}).get('role'), (v or {}).get('jev')
    both_doc = clef == 'document' and jev == 'document'
    both_not = clef in ('metadata', 'navigation') and jev in ('metadata', 'navigation')
    r = rule.get(doc_id)
    if r in ('numeric-alias', 'url-variant'): retire.append((doc_id, r)); n['dup:' + r] += 1
    elif r and both_doc: review.append((doc_id, r, clef, c[2])); n['review:rule-but-document'] += 1
    elif r: retire.append((doc_id, r)); n['rule:' + r] += 1
    elif both_not: retire.append((doc_id, 'model-' + clef)); n['model:' + clef] += 1
    elif v and clef != jev and (clef in ('metadata', 'navigation') or jev in ('metadata', 'navigation')): n['kept:models-disagree'] += 1
    else: n['kept'] += 1
n['unclassified'] = sum(1 for d in meta if d not in vs)
with open(D + 'retire-ids-v2-20261009.tsv', 'w') as f:
    f.write('doc_id\treason\n'); f.writelines(f'{d}\t{r}\n' for d, r in retire)
with open(D + 'review-rule-but-document-20261009.tsv', 'w') as f:
    f.write('doc_id\trule\tclef\ttitle\n'); f.writelines('\t'.join(map(str, x)) + '\n' for x in review)
print(json.dumps({'retire': len(retire), 'review': len(review), **dict(sorted(n.items()))}, indent=1))
